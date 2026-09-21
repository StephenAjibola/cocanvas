"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ContextMenu, type MenuItem } from "@/components/ContextMenu"
import { BoardThumbnail } from "@/components/BoardThumbnail"
import { THEMES, isTheme } from "@/lib/theme"
import { RISE_GRID, RISE_ITEM } from "@/lib/motion"

type BoardRow = {
  id: string
  name: string
  updatedAt: Date
  starred?: boolean
  /** The board's canvas colour key, so its preview is drawn on the right ground. */
  theme?: string
}

/**
 * The dashboard's board grid: a card per board, with Rename/Duplicate/Delete/Open
 * reachable by right-click or the "..." button — same `ContextMenu` the board canvas
 * already uses for its own right-click menu.
 *
 * No real content thumbnails yet — see colorFor above. A card's cover is a gradient
 * derived from the board's id, not a render of its objects; that's flagged as a
 * follow-up once it can reuse the PNG export renderer instead of duplicating it.
 */
export function BoardGrid({
  boards: initial,
  canEdit = true,
  newBoardAction,
}: {
  boards: BoardRow[]
  canEdit?: boolean
  /**
   * The "New board" server action, rendered as the final cell of the grid.
   *
   * Passed in rather than called from here because creating a board redirects, which is
   * the server action's job — and because only ONE grid on the page should carry the
   * tile. The Starred section leaves this undefined: a new board is never born starred,
   * so a create tile there would move its result into the other section.
   */
  newBoardAction?: () => Promise<void>
}) {
  const router = useRouter()
  const [boards, setBoards] = useState(initial)
  const [menu, setMenu] = useState<{ x: number; y: number; boardId: string } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState("")

  async function rename(id: string, name: string) {
    const trimmed = name.trim()
    setRenaming(null)
    if (!trimmed) return
    // Optimistic, same contract as BoardTitle: shows the user's own edit immediately,
    // a failed request just leaves the stale name up rather than reverting loudly.
    setBoards((bs) => bs.map((b) => (b.id === id ? { ...b, name: trimmed } : b)))
    try {
      const res = await fetch(`/api/board/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) throw new Error(`rename failed: ${res.status}`)
    } catch (err) {
      console.error("Board rename failed:", err)
    }
  }

  async function duplicate(id: string) {
    try {
      const res = await fetch(`/api/board/${id}/duplicate`, { method: "POST" })
      if (!res.ok) throw new Error(`duplicate failed: ${res.status}`)
      router.refresh() // re-fetches the server list rather than guessing the new row's shape
    } catch (err) {
      console.error("Board duplicate failed:", err)
    }
  }

  async function toggleStar(id: string, next: boolean) {
    // Optimistic like rename above, but this one refreshes on success: the Starred
    // section is server-rendered, so the card moving between sections is the server's
    // call to make, not this component's.
    setBoards((bs) => bs.map((b) => (b.id === id ? { ...b, starred: next } : b)))
    try {
      const res = await fetch(`/api/board/${id}/star`, { method: next ? "POST" : "DELETE" })
      if (!res.ok) throw new Error(`star failed: ${res.status}`)
      router.refresh()
    } catch (err) {
      console.error("Board star failed:", err)
      setBoards((bs) => bs.map((b) => (b.id === id ? { ...b, starred: !next } : b)))
    }
  }

  async function remove(id: string) {
    // Native confirm, not a custom modal: a one-off destructive action doesn't earn a
    // whole dialog component, and unlike a custom overlay this can't be click-through
    // dismissed by accident. Reversible now — DELETE moves the board to Trash rather
    // than dropping the row — so this reads as a move, not a warning.
    if (!window.confirm("Move this board to Trash?")) return
    const prior = boards
    setBoards((bs) => bs.filter((b) => b.id !== id))
    try {
      const res = await fetch(`/api/board/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`delete failed: ${res.status}`)
    } catch (err) {
      console.error("Board delete failed:", err)
      setBoards(prior) // the optimistic removal was wrong — put it back
    }
  }

  function itemsFor(id: string): MenuItem[] {
    const board = boards.find((b) => b.id === id)
    const open: MenuItem = { label: "Open", onSelect: () => router.push(`/board/${id}`) }
    // Starring is a private bookmark, not an edit, so it is offered to a VIEWER too —
    // matching the star route, which deliberately accepts any member.
    const star: MenuItem = {
      label: board?.starred ? "Remove from starred" : "Add to starred",
      onSelect: () => toggleStar(id, !board?.starred),
    }
    // A VIEWER can open and star a board but can't rename, duplicate, or trash one —
    // same boundary the API routes enforce, just reflected in what the menu offers.
    if (!canEdit) return [open, star]
    return [
      open,
      star,
      {
        label: "Rename",
        onSelect: () => {
          setDraft(board?.name ?? "")
          setRenaming(id)
        },
      },
      { label: "Duplicate", onSelect: () => duplicate(id) },
      { label: "Move to Trash", separated: true, danger: true, onSelect: () => remove(id) },
    ]
  }

  // The create tile stands in for the empty state: an empty grid that still offers the
  // one action worth taking beats a sentence telling you to go and take it elsewhere.
  if (!boards.length && !newBoardAction) {
    return <p className="text-ink-700">No boards yet. Create one to get started.</p>
  }

  return (
    <>
      {/* 3-up at desktop. The cover is taller than the old 4-up card because these become
          real board thumbnails once PNG export ships — the shape is sized for the render
          that is coming, so swapping the placeholder out is a content change, not a
          relayout. */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        variants={RISE_GRID}
        initial="hidden"
        animate="show"
      >
        {boards.map((b) => {
          // Interim placeholder, not a design.
          //
          // The gradient-and-initial cover this replaces generated a different bright hue
          // per board, which put six unrelated colours on one page and made the grid the
          // loudest thing in an otherwise indigo-violet system. A flat panel with one
          // small accent dot says exactly as much — "a board, no preview yet" — without
          // inventing a visual identity for each row.
          //
          // Swap this block for the render once PNG export ships; the card is already
          // sized for it.
          // The placeholder is now the FALLBACK rather than the design: it shows for an
          // empty board or a preview that failed to render, so a card is never blank.
          const placeholder = (
            <div className="flex h-full w-full items-center justify-center bg-surface-container-low">
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-fixed"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
            </div>
          )
          const cover = (
            <div className="h-36 overflow-hidden border-b border-outline-variant">
              <BoardThumbnail
                boardId={b.id}
                background={THEMES[isTheme(b.theme) ? b.theme : "light"].bg}
                fallback={placeholder}
              />
            </div>
          )
          const date = (
            // label-mono: this is metadata you scan down a column of cards, which is
            // exactly the job the monospace tier exists for.
            <p className="mt-1.5 font-mono text-label-mono text-on-surface-variant">
              Last changed {new Date(b.updatedAt).toLocaleDateString()}
            </p>
          )
          return (
            // motion.div rather than a wrapper AROUND the card: an extra element here
            // would become the grid cell and the card would stop stretching to it.
            <motion.div
              key={b.id}
              variants={RISE_ITEM}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, boardId: b.id })
              }}
              className="group relative overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-1 transition-shadow hover:shadow-1-hover"
            >
              {renaming === b.id ? (
                <div>
                  {cover}
                  <div className="p-3">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => rename(b.id, draft)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") rename(b.id, draft)
                        if (e.key === "Escape") setRenaming(null)
                      }}
                      maxLength={100}
                      className="w-full rounded border border-ink-300 px-1.5 py-0.5 text-sm text-ink-900 outline-none"
                    />
                    {date}
                  </div>
                </div>
              ) : (
                <>
                  <Link href={`/board/${b.id}`} className="block">
                    {cover}
                    <div className="p-3">
                      <p className="truncate text-body-sm font-medium text-on-surface">{b.name}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        {date}
                        {/* Category chip. There is no category MODEL yet — no column, no
                            editor — so every board reads "Board" rather than inventing a
                            taxonomy the user never chose. The pill is real and sized; what
                            it says becomes meaningful when categories exist. */}
                        <span className="shrink-0 rounded-full bg-surface-container px-2 py-0.5 font-mono text-label-mono uppercase text-on-surface-variant">
                          Board
                        </span>
                      </div>
                    </div>
                  </Link>

                  {/* Star toggles in place. Always rendered when starred (a starred board
                      must look starred at rest), and on hover otherwise. */}
                  <button
                    type="button"
                    onClick={() => toggleStar(b.id, !b.starred)}
                    aria-label={b.starred ? "Remove from starred" : "Add to starred"}
                    aria-pressed={b.starred}
                    className={`absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-surface-container-lowest/85 text-base backdrop-blur-sm transition-opacity ${
                      b.starred
                        ? "text-primary opacity-100"
                        : "text-on-surface-variant opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {b.starred ? "★" : "☆"}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      // Not inside the Link, so no navigation to stop — just position
                      // the same menu right-click already opens.
                      const rect = e.currentTarget.getBoundingClientRect()
                      setMenu({ x: rect.right, y: rect.bottom, boardId: b.id })
                    }}
                    aria-label="Board options"
                    title="Board options"
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-surface-container-lowest/85 text-base text-on-surface backdrop-blur-sm transition-opacity opacity-0 group-hover:opacity-100"
                  >
                    ⋯
                  </button>
                </>
              )}
            </motion.div>
          )
        })}

        {/**
          * Import, not create. Creating a canvas is the primary button up in the header
          * next to the code field, so a second create affordance down here was the same
          * action twice — this cell now offers the OTHER way to get a board: bring one in.
          *
          * Disabled, and honestly so. There is no import path yet: no board file format
          * to read, and the image route needs BLOB_READ_WRITE_TOKEN, which is not set.
          * Same rule as the template cards and the upgrade button — show the affordance,
          * refuse to pretend it works.
          */}
        {newBoardAction && (
          <button
            type="button"
            disabled
            title="Importing isn't wired up yet — no board file format, and image upload needs BLOB_READ_WRITE_TOKEN"
            className="flex h-full min-h-[13rem] w-full cursor-not-allowed flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-outline text-on-surface-variant opacity-60"
          >
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15V3" />
                <path d="M8 7l4-4 4 4" />
                <path d="M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
              </svg>
            </span>
            <span className="text-body-sm font-medium">Import file</span>
            <span className="font-mono text-label-mono uppercase text-on-surface-variant">Soon</span>
          </button>
        )}
      </motion.div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={itemsFor(menu.boardId)}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  )
}
