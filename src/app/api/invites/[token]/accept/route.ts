import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CURRENT_WORKSPACE_COOKIE } from "@/lib/workspace"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { token } = await params
    const invite = await prisma.workspaceInvite.findUnique({ where: { token } })
    if (!invite) {
      return NextResponse.json({ error: "This invite is invalid or has already been used" }, { status: 404 })
    }
    if (invite.expiresAt < new Date()) {
      await prisma.workspaceInvite.delete({ where: { id: invite.id } })
      return NextResponse.json({ error: "This invite has expired" }, { status: 400 })
    }
    // Proves the click came from the invited inbox — an invite for someone else's
    // address can't be redeemed just because a link leaked.
    if (invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
      return NextResponse.json(
        { error: `This invite was sent to ${invite.email}. Sign in with that account to accept it.` },
        { status: 403 },
      )
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { email: session.user.email } })

    // Membership.@@unique([userId, workspaceId]) makes this idempotent — accepting
    // twice (a double click, a stale tab) lands on the same row instead of erroring.
    await prisma.membership.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId: invite.workspaceId } },
      create: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role },
      update: {},
    })
    await prisma.workspaceInvite.delete({ where: { id: invite.id } })

    const cookieStore = await cookies()
    cookieStore.set(CURRENT_WORKSPACE_COOKIE, invite.workspaceId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("POST /api/invites/[token]/accept failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
