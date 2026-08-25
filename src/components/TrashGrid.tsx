"use client"

import { useState } from "react"

type TrashedBoard = { id: string; name: string; deletedAt: Date }

/**
 * Trash view — Restore and Delete Forever are the only actions, both visible rather
 * than tucked in a menu since there are only two of them. No "Open": the board page
 * 404s a trashed board until it's restored, so a link here would just be a dead end.
 */
export function TrashGrid({ boards: initial }: { boards: TrashedBoard[] }) {
  const [boards, setBoards] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)

  async function restore(id: string) {
    setBusy(id)
    const prior = boards
    setBoards((bs) => bs.filter((b) => b.id !== id))
    try {
      const res = await fetch(`/api/board/${id}/restore`, { method: "POST" })
      if (!res.ok) throw new Error(`restore failed: ${res.status}`)
    } catch (err) {
      console.error("Board restore failed:", err)
      setBoards(prior)
    } finally {
      setBusy(null)
    }
  }

  async function purge(id: string) {
    if (!window.confirm("Permanently delete this board? This can't be undone.")) return
    setBusy(id)
    const prior = boards
    setBoards((bs) => bs.filter((b) => b.id !== id))
    try {
      const res = await fetch(`/api/board/${id}/purge`, { method: "DELETE" })
      if (!res.ok) throw new Error(`purge failed: ${res.status}`)
    } catch (err) {
      console.error("Board purge failed:", err)
      setBoards(prior)
    } finally {
      setBusy(null)
    }
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
