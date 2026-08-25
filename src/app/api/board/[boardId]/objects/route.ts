import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isBoardObject } from "@/lib/objects"
import type { BoardObject } from "@/lib/objects"

/**
 * A ceiling on one request, so a malformed or hostile body cannot ask the database to
 * absorb an unbounded write. Well past any real board — a busy one is low hundreds.
 */
const MAX_OBJECTS = 20_000

/**
 * Replaces a board's contents with the client's converged document.
 *
 * PUT rather than PATCH because the body IS the whole board: the client sends what the
 * shared Yjs document says, which every peer in the room already agrees on. There is no
 * partial update to express.
 *
 * ponytail: delete-then-insert inside one transaction. A diffed upsert would touch
 * fewer rows, but this runs at most once every SAVE_DEBOUNCE_MS per client and the row
 * count is small; swap it for an upsert when a board gets big enough to notice.
 *
 * Concurrency: every client in the room saves, and each sends the same converged state,
 * so a race writes identical DATA. That is not the same as being safe — identical data
 * written concurrently still collides, because two delete-then-insert pairs interleave
 * and the second insert lands on ids the first has already re-created. That produced a
 * real P2002 in practice. The transaction stops a reader seeing the empty gap between
 * the delete and the insert; the row lock inside it is what stops the collision.
 */
/**
 * A board's persisted contents, for the dashboard's thumbnails.
 *
 * Read-only and membership-scoped like every other board route. The dashboard renders
 * each card's preview in the browser from this, rather than from a stored image — there
 * is no upload, no blob storage and nothing to invalidate, and a board that changes is
 * simply re-rendered next time its contents differ.
 *
 * Returns the PERSISTED rows, which is a snapshot as of the last save rather than the
 * live realtime document. That is the right trade for a thumbnail: a card does not need
 * to be frame-accurate, and joining a realtime room per card would open one websocket per
 * board on a page that shows many.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { boardId } = await params
    const board = await prisma.board.findFirst({
      where: {
        id: boardId,
        deletedAt: null,
        // Any role: a VIEWER sees the board, so a VIEWER sees its thumbnail.
        workspace: { memberships: { some: { user: { email: session.user.email } } } },
      },
      select: { id: true },
    })
    if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const rows = await prisma.boardObject.findMany({
      where: { boardId },
      select: { data: true },
    })
    // Same untrusted-Json handling as the board page: a row written by an older build is
    // dropped rather than allowed to throw inside the thumbnail renderer.
    const objects = rows.map((r) => r.data).filter(isBoardObject)

    return NextResponse.json({ objects })
  } catch (err) {
    console.error("GET /api/board/[boardId]/objects failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const objects: unknown = body?.objects
    if (!Array.isArray(objects)) {
      return NextResponse.json({ error: "objects must be an array" }, { status: 400 })
    }
    if (objects.length > MAX_OBJECTS) {
      return NextResponse.json({ error: "Too many objects" }, { status: 413 })
    }
    // Validated at the trust boundary, not trusted because our own client sent it: this
    // body is reflected straight back to every future reader of the board, and the
    // canvas would throw on a stroke with no points long before anyone saw the cause.
    if (!objects.every(isBoardObject)) {
      return NextResponse.json({ error: "Malformed object" }, { status: 400 })
    }
    const valid = objects as BoardObject[]

    const { boardId } = await params
    // Membership join in the where clause, same as the theme route: a miss is 0 rows
    // rather than a thrown 500, and no signed-in user can overwrite another
    // workspace's board.
    const board = await prisma.board.findFirst({
      where: {
        id: boardId,
        workspace: {
          memberships: {
            some: { user: { email: session.user.email }, role: { in: ["OWNER", "EDITOR"] } },
          },
        },
      },
      select: { id: true },
    })
    if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 })

    /**
     * REFUSE A SAVE THAT WOULD EMPTY A NON-EMPTY BOARD.
     *
     * This route persists by deleting every row and rewriting them, so a payload of []
     * is indistinguishable from "the board is now empty" — and it wipes the board.
     *
     * That is reachable WITHOUT the user deleting anything. Board content hydrates from
     * the realtime document; if that document never populates (the realtime server is
     * down, or the known content-sync bug bites), the client holds an empty array, and
     * the next debounced save — or the keepalive flush on unmount in useBoardSync — sends
     * it. The server obeys, returns 200, and the board's contents are gone from Postgres
     * with no error anywhere. That is how "stephen text board" went from 3 objects to 0.
     *
     * Emptying a board deliberately is still possible: erase the objects (each removal
     * publishes, so `live` is non-empty right up until the last one) or pass ?allowEmpty=1.
     * What this refuses is the ACCIDENT — an empty array from a client that never had the
     * content in the first place.
     *
     * A count, not a fetch: this runs on every save.
     */
    if (valid.length === 0 && new URL(req.url).searchParams.get("allowEmpty") !== "1") {
      const existing = await prisma.boardObject.count({ where: { boardId } })
      if (existing > 0) {
        console.warn(
          `Refused empty save for board ${boardId}: would have deleted ${existing} objects.`,
        )
        return NextResponse.json(
          { error: "Refusing to empty a board that has content", existing },
          { status: 409 },
        )
      }
    }

    await prisma.$transaction(async (tx) => {
      // Serializes writers for THIS board, and nothing else.
      //
      // Without it two clients saving at once interleave as delete/delete/insert/insert,
      // and the second insert collides with the rows the first just wrote — the P2002
      // UniqueConstraintViolation seen in practice, which fails the save and leaves that
      // client's work unpersisted. Wrapping in a transaction alone does not prevent it:
      // both transactions are individually valid, they just are not serializable.
      //
      // The lock is taken on the Board row rather than the objects, because the objects
      // being deleted are exactly what a concurrent writer would need to lock and cannot.
      // It is released when the transaction commits.
      await tx.$executeRaw`SELECT id FROM "Board" WHERE id = ${boardId} FOR UPDATE`
      await tx.boardObject.deleteMany({ where: { boardId } })
      await tx.boardObject.createMany({
        data: valid.map((o) => ({
          // The object's own id, not a generated cuid: it is the Y.Map key and the
          // identity every history entry and selection refers to. Losing it on a round
          // trip would make a reloaded board's undo point at objects that no longer
          // exist under those ids.
          id: o.id,
          boardId,
          type: o.type,
          data: o,
        })),
      })
    })

    return NextResponse.json({ count: valid.length })
  } catch (err) {
    console.error("PUT /api/board/[boardId]/objects failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
