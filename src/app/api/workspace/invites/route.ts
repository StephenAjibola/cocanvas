import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, canManageMembers } from "@/lib/workspace"
import { sendWorkspaceInviteEmail } from "@/lib/email"
import { generateInviteCode } from "@/lib/invite-code"

/** Same shape as the password-reset token: unguessable, and long enough that a
 * random guess is not a threat. */
const newToken = () => randomBytes(32).toString("hex")
const EXPIRES_MS = 7 * 24 * 60 * 60 * 1000

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { email, role } = await req.json()
    if (typeof email !== "string" || !email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }
    // OWNER is only ever assigned by bootstrap — an invite can only grant EDITOR or
    // VIEWER, so a workspace can never end up with a second owner by accident.
    if (role !== "EDITOR" && role !== "VIEWER") {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }
    const normalized = email.trim().toLowerCase()

    const { user, workspace, role: actorRole } = await requireWorkspace()
    if (!canManageMembers(actorRole)) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 })
    }

    const already = await prisma.membership.findFirst({
      where: { workspaceId: workspace.id, user: { email: normalized } },
    })
    if (already) {
      return NextResponse.json({ error: "Already a member" }, { status: 409 })
    }

    const token = newToken()
    // The short form of the same invite. Reissued alongside the token on every upsert,
    // so re-inviting rotates both — an old code stops working exactly when the old link
    // does, rather than outliving it.
    const code = generateInviteCode()
    const expiresAt = new Date(Date.now() + EXPIRES_MS)

    // One live invite per (workspace, email) — re-inviting overwrites it, same as
    // forgot-password's "one live reset link" rule.
    const invite = await prisma.workspaceInvite.upsert({
      where: { workspaceId_email: { workspaceId: workspace.id, email: normalized } },
      create: {
        email: normalized,
        role,
        token,
        code,
        workspaceId: workspace.id,
        invitedById: user.id,
        expiresAt,
      },
      update: { role, token, code, invitedById: user.id, expiresAt },
    })

    const origin = new URL(req.url).origin
    await sendWorkspaceInviteEmail(
      normalized,
      user.name || user.email,
      workspace.name,
      `${origin}/invite/${token}`,
    )

    // The code is returned so the inviter can read it out or paste it into chat —
    // which is the entire point of it existing, given how often the email is the part
    // that fails.
    return NextResponse.json({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      code: invite.code,
    })
  } catch (err) {
    console.error("POST /api/workspace/invites failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
