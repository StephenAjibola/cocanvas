import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, canManageMembers } from "@/lib/workspace"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
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

    const { id } = await params
    const { count } = await prisma.workspaceInvite.deleteMany({
      where: { id, workspaceId: workspace.id },
    })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("DELETE /api/workspace/invites/[id] failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
