import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { boardId } = await params
    // Only a board that's actually in Trash can be restored — same membership-scoped
    // shape as the other board routes.
    const { count } = await prisma.board.updateMany({
      where: {
        id: boardId,
        deletedAt: { not: null },
        workspace: {
          memberships: {
            some: { user: { email: session.user.email }, role: { in: ["OWNER", "EDITOR"] } },
          },
        },
      },
      data: { deletedAt: null },
    })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("POST /api/board/[boardId]/restore failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
