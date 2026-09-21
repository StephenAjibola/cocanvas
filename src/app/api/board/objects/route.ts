import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isBoardObject } from "@/lib/objects"
import type { BoardObject } from "@/lib/objects"

/**
 * More than any dashboard shows at once, small enough that one request cannot ask for
 * the whole workspace's contents in a single query.
 */
const MAX_IDS = 60

/**
 * Contents for MANY boards at once — what the dashboard's thumbnails read.
 *
 * The per-board GET still exists and still works; this is the version the grid uses,
 * because the grid asks about every card it renders. One request per thumbnail meant ~22
 * concurrent requests on a normal dashboard, and under any worker or connection pressure
 * a few of them failed — which is what a 500 in BoardThumbnail turned out to be. Two
 * queries total, regardless of how many cards are on screen.
 *
 * Membership-scoped in the same shape as the single-board route, and with the same "any
 * role" rule: a VIEWER can see the board, so a VIEWER can see its thumbnail. Ids outside
 * the caller's workspaces simply do not come back — there is no per-id error to leak
 * which of them exist.
 *
 * Boards with no rows are returned as empty arrays rather than omitted, so the client can
 * tell "this board is empty" (draw the fallback, drop any cached preview) apart from
 * "this board was not in the response" (not yours, or trashed).
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

    // Which of the asked-for boards this caller may actually read. Doing this first means
    // the object query below is already scoped — it cannot return rows for a board the
    // membership check would have rejected.
    const allowed = await prisma.board.findMany({
      where: {
        id: { in: ids as string[] },
        deletedAt: null,
        workspace: { memberships: { some: { user: { email: session.user.email } } } },
      },
      select: { id: true },
    })
    if (allowed.length === 0) return NextResponse.json({ boards: {} })

    const rows = await prisma.boardObject.findMany({
      where: { boardId: { in: allowed.map((b) => b.id) } },
      select: { boardId: true, data: true },
    })

    const boards: Record<string, BoardObject[]> = Object.fromEntries(
      allowed.map((b) => [b.id, [] as BoardObject[]]),
    )
    for (const r of rows) {
      // Same untrusted-Json handling as the single-board route: a row written by an older
      // build is dropped rather than allowed to throw inside the thumbnail renderer.
      if (isBoardObject(r.data)) boards[r.boardId].push(r.data)
    }

    return NextResponse.json({ boards })
  } catch (err) {
    console.error("POST /api/board/objects failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
