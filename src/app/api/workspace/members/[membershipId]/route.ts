import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, canManageMembers } from "@/lib/workspace"

/**
 * Changes an existing member's role — what the share modal's role dropdowns write to.
 *
 * OWNER is refused in both directions, and that is the whole safety story here. It cannot
 * be GRANTED, so a workspace never gains a second owner by dropdown; and an existing
 * OWNER row cannot be changed, so the last owner cannot demote themselves and leave the
 * workspace with nobody who can manage it. Same rule DELETE already enforces, and the
 * same rule the invite route applies to invitations.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    // Mirrors the invite route's guard exactly: EDITOR and VIEWER are the only roles this
    // app hands out by request.
    if (body.role !== "EDITOR" && body.role !== "VIEWER") {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }

    const { workspace, role } = await requireWorkspace()
    if (!canManageMembers(role)) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 })
    }

    const { membershipId } = await params
    const { count } = await prisma.membership.updateMany({
      where: { id: membershipId, workspaceId: workspace.id, role: { not: "OWNER" } },
      data: { role: body.role },
    })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({ id: membershipId, role: body.role })
  } catch (err) {
    console.error("PATCH /api/workspace/members/[membershipId] failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { workspace, role } = await requireWorkspace()
    if (!canManageMembers(role)) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 })
    }

    const { membershipId } = await params
    // Scoped to this workspace, and never an OWNER row — a workspace can't be left
    // ownerless by an EDITOR (or even the owner) clicking Remove.
    const { count } = await prisma.membership.deleteMany({
      where: { id: membershipId, workspaceId: workspace.id, role: { not: "OWNER" } },
    })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("DELETE /api/workspace/members/[membershipId] failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
