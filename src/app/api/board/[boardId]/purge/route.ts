import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { boardId } = await params
    // Permanent removal — only reachable for a board already in Trash, so this can't
    // be used as a shortcut around the soft-delete in the main DELETE route. Cascades
    // to BoardObject same as before.
    const { count } = await prisma.board.deleteMany({
      where: {
        id: boardId,
        deletedAt: { not: null },
        workspace: {
          memberships: {
            some: { user: { email: session.user.email }, role: { in: ["OWNER", "EDITOR"] } },
          },
        },
      },
    })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("DELETE /api/board/[boardId]/purge failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
