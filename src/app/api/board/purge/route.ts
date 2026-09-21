import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Empty the Trash: permanently delete every already-trashed board in the caller's
 * workspace. Cascades to BoardObject, BoardView, StarredBoard and Comment.
 *
 * No id list, deliberately. "Clear Trash" means whatever is in the Trash at the moment
 * the server runs it — sending ids from a page that may be minutes stale is how you
 * permanently delete a board someone restored in another tab. The `deletedAt: { not:
 * null }` clause is doing real work here: a live board cannot be reached by this route
 * at all, so the only way to destroy something is to trash it first and then confirm.
 *
 * One deleteMany rather than a request per board — the same lesson the bulk-trash route
 * learned, and it matters more here because a partial failure is unrecoverable.
 */
export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { count } = await prisma.board.deleteMany({
      where: {
        deletedAt: { not: null },
        workspace: {
          memberships: {
            some: { user: { email: session.user.email }, role: { in: ["OWNER", "EDITOR"] } },
          },
        },
      },
    })

    return NextResponse.json({ deleted: count })
  } catch (err) {
    console.error("POST /api/board/purge failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
