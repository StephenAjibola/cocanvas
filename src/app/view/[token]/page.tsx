import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { BoardCanvas } from "@/components/BoardCanvas"
import { THEMES, isGridStyle, isTheme } from "@/lib/theme"
import { grantsAccess } from "@/lib/share"
import { isBoardObject, sortByOrder } from "@/lib/objects"

/**
 * Read-only board, reachable without an account.
 *
 * Deliberately NOT behind requireUser — the share token IS the credential, which is why
 * it is 128 bits of randomness rather than a guessable id. The board is found BY the
 * token, so a revoked or wrong token matches no row and 404s; there is nothing here
 * that can distinguish "never existed" from "revoked", which is what stops the route
 * being used to probe for boards.
 *
 * The board id never appears in this page's URL, so a viewer cannot walk from a share
 * link to the authenticated /board/[boardId] route.
 */
export default async function ViewPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // findFirst rather than findUnique on the token, so deletedAt: null can ride in the
  // same query — a trashed board's share link stops resolving the moment it's
  // trashed, same as its authenticated URL already does.
  const board = await prisma.board.findFirst({ where: { shareToken: token, deletedAt: null } })
  if (!board) notFound()
  // The tier is enforced HERE, not just in the modal that sets it. A board dropped to
  // "off" keeps its token so the link can be re-enabled without reissuing the URL — which
  // means the token alone stops being proof of access, and a route that only checked the
  // token would keep serving a board somebody had deliberately unshared.
  if (!grantsAccess(board.shareAccess)) notFound()

  const theme = isTheme(board.theme) ? board.theme : "dark"
  // The grid is part of how the board LOOKS, so a shared view has to honour it too — a
  // visitor seeing dots on a board its owner set to lines is looking at a different page.
  const gridStyle = isGridStyle(board.gridStyle) ? board.gridStyle : "dot"

  // Same untrusted-Json handling as the authenticated page — a row written by an older
  // version of this code is as unvalidated here as anywhere else.
  const rows = await prisma.boardObject.findMany({
    where: { boardId: board.id },
    select: { data: true },
  })
  const initialObjects = sortByOrder(rows.map((r) => r.data).filter(isBoardObject))

  return (
    <main
      className="fixed inset-0 overflow-hidden"
      style={{ backgroundColor: THEMES[theme].bg }}
    >
      <BoardCanvas
        boardId={board.id}
        initialTheme={theme}
        initialGridStyle={gridStyle}
        // Passed so the comments panel can authorise itself on a comment-tier link. It
        // is already in the visitor's URL bar, so this reveals nothing they don't have.
        initialShareToken={token}
        initialObjects={initialObjects}
        boardName={board.name}
        readOnly
        live={false}
      />
      {/* Names the board and says plainly that this is a snapshot, so a viewer does not
          sit waiting for an edit that will never arrive. */}
      <div className="pointer-events-none fixed left-4 top-4 flex items-center gap-2">
        <div className="rounded-xl border border-ink-700 bg-ink-850/90 px-3 py-2 backdrop-blur-md">
          <span className="text-sm text-paper-300">{board.name}</span>
          <span className="ml-2 text-xs text-paper-500">View only</span>
        </div>
      </div>
    </main>
  )
}
