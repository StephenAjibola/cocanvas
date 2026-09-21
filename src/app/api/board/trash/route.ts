import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Enough for the Recent strip and any plausible multi-select, small enough that the
 * IN clause stays bounded and one request cannot ask to trash a whole workspace.
 */
const MAX_IDS = 100

/**
 * Move several boards to Trash in one request.
 *
 * This exists because the alternative genuinely does not work: firing one DELETE per
 * board from the client opened a Neon WebSocket per request through PrismaNeon's pool,
 * and ten at once failed outright — every request 500'd with a socket ErrorEvent. One
 * updateMany is one connection and one round trip, so there is no storm to survive.
 *
 * The authorisation is the SAME where clause DELETE /api/board/[boardId] uses, widened
 * from `id` to `id: { in: ids }`. Membership and role are enforced by the query rather
 * than by a check above it, so an id the caller may not touch simply does not match —
 * there is no path where a partial match trashes something it should not have.
 *
 * `count` is the DB's own answer to how many moved, which is what makes partial success
 * reportable honestly: ids that were already trashed, already gone, or in someone else's
 * workspace are the difference between what was asked and what count says.
 */
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const ids = (body as { ids?: unknown } | null)?.ids
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id)) {
      return NextResponse.json({ error: "ids must be a non-empty string array" }, { status: 400 })
    }
    if (ids.length === 0 || ids.length > MAX_IDS) {
      return NextResponse.json({ error: `ids must hold 1 to ${MAX_IDS} entries` }, { status: 400 })
    }

    const { count } = await prisma.board.updateMany({
      where: {
        id: { in: ids as string[] },
        deletedAt: null,
        workspace: {
          memberships: {
            some: { user: { email: session.user.email }, role: { in: ["OWNER", "EDITOR"] } },
          },
        },
      },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ moved: count, asked: ids.length })
  } catch (err) {
    console.error("POST /api/board/trash failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
