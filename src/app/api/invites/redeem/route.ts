import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { JOIN_CODE_ROLE, normalizeInviteCode } from "@/lib/invite-code"
import { CURRENT_WORKSPACE_COOKIE } from "@/lib/workspace"

/**
 * Drop the joiner into the workspace they just joined — the only reason anyone types a
 * code. Shared by both redemption paths so they cannot drift apart.
 */
async function setCurrentWorkspace(workspaceId: string) {
  const cookieStore = await cookies()
  cookieStore.set(CURRENT_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
}

/**
 * Redeems a code typed into "join with a code". One field accepts two different things.
 *
 * An ADDRESSED invite code (WorkspaceInvite.code) runs exactly the checks
 * /api/invites/[token]/accept runs — existence, expiry, and the invited address matching
 * the signed-in one — because it is the same invite reached a different way, not a looser
 * way in. It is consumed on use, and it carries whatever role the inviter chose.
 *
 * A WORKSPACE join code (Workspace.joinCode) is bearer authority instead: no addressee to
 * match, not consumed, and therefore capped at JOIN_CODE_ROLE no matter who types it.
 * Being signed in is still required, so it is an authorization surface with a name
 * attached to every use, not an anonymous door.
 *
 * The failure strings stay uniform — "invalid or expired" whether the code never existed,
 * expired, belongs to someone else's invite, or is simply not a live workspace code.
 * Distinguishing them would turn this route into an oracle for guessing which codes are
 * live and which addresses have been invited.
 */
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const code = normalizeInviteCode(body?.code)
    // Rejected before any query: a malformed code cannot match anything, and answering
    // without touching the database keeps the timing of "wrong shape" and "no such code"
    // from differing in a way worth measuring.
    if (!code) {
      return NextResponse.json({ error: "That code doesn't look right." }, { status: 400 })
    }

    const invite = await prisma.workspaceInvite.findUnique({
      where: { code },
      select: { id: true, email: true, role: true, workspaceId: true, expiresAt: true },
    })

    const invalid = () =>
      NextResponse.json({ error: "That code is invalid or has expired." }, { status: 404 })

    // One field, two kinds of code. An addressed invite wins if both somehow match,
    // because it is the more specific grant — it names a person and carries the role
    // that person was offered, where the workspace code names nobody.
    if (!invite) {
      const workspace = await prisma.workspace.findUnique({
        where: { joinCode: code },
        select: { id: true, name: true },
      })
      if (!workspace) return invalid()

      const joiner = await prisma.user.findUniqueOrThrow({
        where: { email: session.user.email },
        select: { id: true },
      })

      // update:{} on purpose — someone who is already an EDITOR here and re-types the
      // code must not be demoted to VIEWER by it. The code only ever adds access.
      await prisma.membership.upsert({
        where: { userId_workspaceId: { userId: joiner.id, workspaceId: workspace.id } },
        create: { userId: joiner.id, workspaceId: workspace.id, role: JOIN_CODE_ROLE },
        update: {},
      })

      // NOT consumed. A workspace code is standing authority by design; it dies when a
      // manager turns it off or regenerates it, not when one person uses it.
      await setCurrentWorkspace(workspace.id)
      return NextResponse.json({ ok: true, workspaceName: workspace.name })
    }

    if (invite.expiresAt < new Date()) {
      await prisma.workspaceInvite.delete({ where: { id: invite.id } })
      return invalid()
    }

    // The check that makes a leaked code worth nothing: it still has to be redeemed by
    // the person it was issued to. This one DOES say who, because at this point the
    // caller already holds a live code — telling them which account to use is help, not
    // disclosure, and it is what the emailed-link route says too.
    if (invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
      return NextResponse.json(
        {
          error: `This invite was sent to ${invite.email}. Sign in with that account to join.`,
        },
        { status: 403 },
      )
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: session.user.email },
      select: { id: true },
    })

    // Idempotent via Membership.@@unique([userId, workspaceId]) — a double submit lands
    // on the same row rather than erroring.
    await prisma.membership.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId: invite.workspaceId } },
      create: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role },
      update: {},
    })
    // Consumed. The code and the link die together because they are one invite.
    await prisma.workspaceInvite.delete({ where: { id: invite.id } })

    await setCurrentWorkspace(invite.workspaceId)

    const workspace = await prisma.workspace.findUnique({
      where: { id: invite.workspaceId },
      select: { name: true },
    })

    return NextResponse.json({ ok: true, workspaceName: workspace?.name ?? "the workspace" })
  } catch (err) {
    console.error("POST /api/invites/redeem failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
