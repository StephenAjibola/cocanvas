import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Starring is per-user, so unlike every other board-scoped route here this one needs the
 * caller's own id and not just proof that they may touch the board.
 *
 * One query does both jobs: it resolves the User row and asserts membership of the
 * board's workspace at the same time, so a star cannot be created for a board the caller
 * cannot see. A miss is indistinguishable from "no such board", same as the read path.
 *
 * Note the role: VIEWER is allowed. Starring changes nothing about the board — it is a
 * bookmark in the caller's own dashboard — so gating it behind edit rights would stop
 * read-only members from organising the boards they were invited to.
 */
async function authorize(boardId: string) {
  const session = await auth()
  if (!session?.user?.email) return null

  return prisma.user.findFirst({
    where: {
      email: session.user.email,
      memberships: { some: { workspace: { boards: { some: { id: boardId, deletedAt: null } } } } },
    },
    select: { id: true },
  })
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const { boardId } = await params
    const user = await authorize(boardId)
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Upsert, not create: the composite primary key makes starring twice the same row,
    // so a double-click is idempotent instead of a unique-constraint 500.
    await prisma.starredBoard.upsert({
      where: { userId_boardId: { userId: user.id, boardId } },
      create: { userId: user.id, boardId },
      update: {},
    })

    return NextResponse.json({ starred: true })
  } catch (err) {
    console.error("POST /api/board/[boardId]/star failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const { boardId } = await params
    const user = await authorize(boardId)
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // deleteMany rather than delete: unstarring something that was never starred is a
    // no-op, not a 404. The button is a toggle and the client may be a step behind.
    await prisma.starredBoard.deleteMany({ where: { userId: user.id, boardId } })

    return NextResponse.json({ starred: false })
  } catch (err) {
    console.error("DELETE /api/board/[boardId]/star failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
