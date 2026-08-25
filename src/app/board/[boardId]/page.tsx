import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/workspace"
import { BoardCanvas } from "@/components/BoardCanvas"
import { THEMES, isGridStyle, isTheme } from "@/lib/theme"
import { isShareAccess } from "@/lib/share"
import { isBoardObject, sortByOrder } from "@/lib/objects"

export default async function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>
}) {
  const user = await requireUser()
  const { boardId } = await params

  // One query proves board existence, workspace membership, and role together — same
  // shape as the realtime token route's lookup. A trashed board or a board in a
  // workspace this user isn't a member of both 404, indistinguishably.
  const membership = await prisma.membership.findFirst({
    where: {
      user: { email: user.email! },
      workspace: { boards: { some: { id: boardId, deletedAt: null } } },
    },
    select: { role: true },
  })
  if (!membership) notFound()

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    // Whether THIS user starred it, resolved in the board query rather than as a second
    // round trip: a bounded `take: 1` on the join table, and the array's length is the
    // boolean. Same trick the dashboard uses for the same relation.
    include: {
      starredBy: { where: { user: { email: user.email! } }, take: 1, select: { boardId: true } },
    },
  })
  if (!board || board.deletedAt) notFound()

  // Both columns are plain strings, so a bad value can't be trusted to be a valid key.
  const theme = isTheme(board.theme) ? board.theme : "dark"
  const gridStyle = isGridStyle(board.gridStyle) ? board.gridStyle : "dot"

  // `data` is a Json column, so what comes back is structurally unknown — a row written
  // by an older version of this code is as untrusted as a request body. Anything that
  // no longer parses is dropped rather than allowed to crash the canvas on first paint,
  // which would take the whole board with it instead of one bad object.
  const rows = await prisma.boardObject.findMany({
    where: { boardId },
    select: { data: true },
  })
  const initialObjects = sortByOrder(rows.map((r) => r.data).filter(isBoardObject))

  return (
    // Painted here too, not just on the canvas: the element exists before the canvas
    // effect runs, so a light board would otherwise flash black on load.
    <main
      className="fixed inset-0 overflow-hidden"
      style={{ backgroundColor: THEMES[theme].bg }}
    >
      <BoardCanvas
        boardId={boardId}
        initialTheme={theme}
        initialGridStyle={gridStyle}
        initialStarred={board.starredBy.length > 0}
        role={membership.role}
        initialObjects={initialObjects}
        boardName={board.name}
        initialShareToken={board.shareToken}
        initialShareAccess={isShareAccess(board.shareAccess) ? board.shareAccess : "off"}
        accountUser={{ name: user.name ?? null, email: user.email!, image: user.image ?? null }}
        readOnly={membership.role === "VIEWER"}
      />
    </main>
  )
}
