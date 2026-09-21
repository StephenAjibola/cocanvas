"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type TrashedBoard = { id: string; name: string; deletedAt: Date }

/**
 * Trash view — Restore and Delete Forever are the only actions, both visible rather
 * than tucked in a menu since there are only two of them. No "Open": the board page
 * 404s a trashed board until it's restored, so a link here would just be a dead end.
 *
 * Renders straight from the prop, NOT from a useState copy of it. The copy read as a
 * harmless optimistic-UI trick and was the reason "Clear Trash" looked like a dead
 * button: that dialog empties the Trash and calls router.refresh(), the server sends
 * this component an empty `boards`, and a useState initialiser ignores every prop after
 * the first — so the deleted boards stayed on screen with nothing to say they were gone.
 * Anything that changes the Trash from outside this component hit the same wall.
 */
export function TrashGrid({ boards }: { boards: TrashedBoard[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const router = useRouter()

  async function act(id: string, run: () => Promise<Response>) {
    setBusy(id)
    try {
      const res = await run()
      if (!res.ok) throw new Error(`${res.status}`)
      // The server owns the list now, so a refresh is the whole update — and it is the
      // same path Clear Trash takes, which means one of them working proves both.
      router.refresh()
    } catch (err) {
      console.error("Trash action failed:", err)
      window.alert("That didn't work. Nothing was changed.")
    } finally {
      setBusy(null)
    }
  }

  const restore = (id: string) =>
    act(id, () => fetch(`/api/board/${id}/restore`, { method: "POST" }))

  const purge = (id: string) => {
    if (!window.confirm("Permanently delete this board? This can't be undone.")) return
    return act(id, () => fetch(`/api/board/${id}/purge`, { method: "DELETE" }))
  }

  if (!boards.length) {
    return <p className="text-ink-700">Trash is empty.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {boards.map((b) => (
        <div
          key={b.id}
          className="overflow-hidden rounded-xl border border-ink-200 bg-white p-3"
        >
          <p className="truncate text-sm font-medium text-ink-900">{b.name}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            Deleted {new Date(b.deletedAt).toLocaleDateString()}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy === b.id}
              onClick={() => restore(b.id)}
              className="flex-1 rounded border border-ink-200 px-2 py-1 text-xs font-medium text-ink-900 hover:bg-paper-50 disabled:opacity-50"
            >
              Restore
            </button>
            <button
              type="button"
              disabled={busy === b.id}
              onClick={() => purge(b.id)}
              className="flex-1 rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Delete forever
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
