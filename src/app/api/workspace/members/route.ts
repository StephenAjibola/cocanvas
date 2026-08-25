import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, canManageMembers } from "@/lib/workspace"

/**
 * The workspace's people, for the share modal.
 *
 * A route rather than props threaded through the board page: this list is only needed
 * once somebody opens the modal, and fetching it during every board render would put a
 * membership query on the critical path of a page whose job is to paint a canvas.
 *
 * The same data already reaches /dashboard/people directly from the server component
 * there. That page keeps its server fetch — it needs the list to render at all, so a
 * round trip through here would only add latency.
 */
export async function GET() {
  try {
    // Checked BEFORE requireWorkspace, and that ordering is the point: requireWorkspace
    // is written for pages and answers a signed-out caller with redirect("/login"), which
    // works by throwing. Inside a route handler's try/catch that throw is caught like any
    // other error and returned as a 500 — so an unauthenticated fetch reported "something
    // went wrong" instead of "sign in". Every other route here guards this way for the
    // same reason.
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { workspace, user, role } = await requireWorkspace()

    const members = await prisma.membership.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    })

    // Same rule the People page applies: a pending invite is only meaningful to someone
    // who can act on it, so a VIEWER sees the members but not who is mid-invite.
    const manage = canManageMembers(role)
    const invites = manage
      ? await prisma.workspaceInvite.findMany({
          where: { workspaceId: workspace.id },
          orderBy: { createdAt: "desc" },
          select: { id: true, email: true, role: true, expiresAt: true, code: true },
        })
      : []

    // Managers only, for the same reason pending invites are: the join code is bearer
    // authority over membership, so a VIEWER who could read it could hand out access the
    // app never granted them the ability to grant.
    const joinCode = manage
      ? (
          await prisma.workspace.findUniqueOrThrow({
            where: { id: workspace.id },
            select: { joinCode: true },
          })
        ).joinCode
      : null

    return NextResponse.json({
      workspace: { id: workspace.id, name: workspace.name, joinCode },
      members,
      invites,
      canManage: manage,
      currentUserId: user.id,
    })
  } catch (err) {
    console.error("GET /api/workspace/members failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
