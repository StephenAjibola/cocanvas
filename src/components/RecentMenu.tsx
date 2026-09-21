"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ContextMenu } from "@/components/ContextMenu"

/**
 * The "…" beside the Recent heading.
 *
 * One item today: move everything currently in Recent to Trash, in ONE request.
 *
 * The first version fanned out a DELETE per board to reuse the existing single-board
 * route. That was wrong in practice, not just in theory: PrismaNeon talks to Neon over a
 * WebSocket pool, so ten parallel requests meant ten sockets, and all ten failed with a
 * socket error — nothing moved. /api/board/trash does the same soft-delete under the
 * same membership-and-role where clause, as a single updateMany.
 *
 * The server reports how many rows it actually changed, so a partial result is the DB's
 * own count rather than something inferred from which promises settled.
 */
export function RecentMenu({ boardIds }: { boardIds: string[] }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const router = useRouter()

  async function removeAll() {
    const n = boardIds.length
    // Names the count and says who it affects: these boards leave the workspace for
    // every member, not just this user's Recent strip.
    if (
      !window.confirm(
        `Move ${n} ${n === 1 ? "canvas" : "canvases"} to Trash?\n\n` +
          "They will disappear for everyone in this workspace. You can restore them from Trash.",
      )
    )
      return

    setBusy(true)
    try {
      const res = await fetch("/api/board/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: boardIds }),
      })
      if (!res.ok) throw new Error(`trash failed: ${res.status}`)
      const { moved } = (await res.json()) as { moved: number }
      // Silent on the happy path; the refreshed grid is the confirmation. Only a
      // shortfall needs saying, because that is the case the screen cannot show.
      if (moved < n) window.alert(`${moved} of ${n} moved to Trash.`)
    } catch (err) {
      console.error("Remove canvases failed:", err)
      window.alert("Could not move these canvases to Trash. Nothing was changed.")
    } finally {
      setBusy(false)
      router.refresh()
    }
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={busy}
        onClick={() => {
          const r = ref.current!.getBoundingClientRect()
          // Opens under the button rather than at the pointer: this is a menu anchored to
          // a control, not a right-click on empty space.
          setMenu(menu ? null : { x: r.left, y: r.bottom + 4 })
        }}
        aria-label="Recent options"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        className="rounded px-2 py-1 leading-none text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-50"
      >
        <span aria-hidden className="text-lg tracking-widest">…</span>
      </button>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Remove canvases",
              danger: true,
              // Nothing in Recent means nothing to remove — the item stays visible so the
              // menu does not change shape, but it cannot fire on an empty set.
              disabled: boardIds.length === 0,
              onSelect: removeAll,
            },
          ]}
        />
      )}
    </>
  )
}
