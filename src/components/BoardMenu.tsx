"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { SettingsModal } from "@/components/SettingsModal"
import { ShortcutsModal } from "@/components/ShortcutsModal"

/**
 * The board's "..." menu, in the top header.
 *
 * Everything here already had a home somewhere — rename in the title field, duplicate and
 * trash on the dashboard card's own menu — except that none of it was reachable from
 * inside the board. This is the one place those actions exist while you are looking at
 * the canvas, and it calls the SAME routes the dashboard does rather than growing a
 * second implementation of each.
 */
export function BoardMenu({
  boardId,
  initialStarred,
  onRename,
}: {
  boardId: string
  initialStarred: boolean
  onRename: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState<"settings" | "shortcuts" | null>(null)
  const [starred, setStarred] = useState(initialStarred)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  async function toggleStar() {
    // Optimistic: this is the user's own click on their own bookmark, and the revert
    // below is what makes showing it immediately honest.
    const next = !starred
    setStarred(next)
    try {
      const res = await fetch(`/api/board/${encodeURIComponent(boardId)}/star`, {
        method: next ? "POST" : "DELETE",
      })
      if (!res.ok) throw new Error(`star failed: ${res.status}`)
      // The dashboard's Starred section is server-rendered, so it has to be told.
      router.refresh()
    } catch (err) {
      console.error("Board star failed:", err)
      setStarred(!next)
    }
  }

  async function duplicate() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/board/${encodeURIComponent(boardId)}/duplicate`, {
        method: "POST",
      })
      if (!res.ok) throw new Error(`duplicate failed: ${res.status}`)
      const { id } = await res.json()
      // Straight into the copy. Duplicating and staying put gives no sign it worked, and
      // the copy is what you wanted to work on.
      router.push(`/board/${id}`)
    } catch (err) {
      console.error("Board duplicate failed:", err)
      setBusy(false)
    }
  }

  async function remove() {
    // Same native confirm and the same soft-delete route the dashboard card uses — this
    // moves the board to Trash, where it can be restored, so it reads as a move.
    if (!window.confirm("Move this board to Trash?")) return
    try {
      const res = await fetch(`/api/board/${encodeURIComponent(boardId)}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`delete failed: ${res.status}`)
      // There is no board left to look at, so leaving the page is part of the action.
      router.push("/dashboard")
    } catch (err) {
      console.error("Board delete failed:", err)
    }
  }

  const items: { label: string; onSelect: () => void; danger?: boolean; separated?: boolean }[] = [
    { label: "Rename canvas", onSelect: onRename },
    { label: "Duplicate canvas", onSelect: duplicate },
    { label: starred ? "Remove from starred" : "Add to starred", onSelect: toggleStar },
    { label: "Settings", separated: true, onSelect: () => setModal("settings") },
    { label: "Keyboard shortcuts", onSelect: () => setModal("shortcuts") },
    { label: "Delete canvas", separated: true, danger: true, onSelect: remove },
  ]

  return (
    <>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Board options"
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex h-8 w-8 items-center justify-center rounded text-base text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          ⋯
        </button>

        {open && (
          <div
            role="menu"
            className="absolute left-0 top-10 z-50 w-56 overflow-hidden rounded-xl border border-outline-variant elevation-2 p-1 shadow-xl backdrop-blur-md"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
                className={`block w-full rounded px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                  item.separated ? "mt-1 border-t border-outline-variant pt-2" : ""
                } ${
                  item.danger
                    ? "text-red-300 hover:bg-red-500/15"
                    : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {modal === "settings" && <SettingsModal onClose={() => setModal(null)} />}
      {modal === "shortcuts" && <ShortcutsModal onClose={() => setModal(null)} />}
    </>
  )
}
