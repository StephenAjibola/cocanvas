"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Modal } from "@/components/Modal"
import { AnimatePresence } from "framer-motion"

/**
 * "Clear Trash" — permanent, unrecoverable deletion of everything in the Trash.
 *
 * Deliberately NOT shaped like the "…" → Remove canvases action on Recent, because the
 * two are not the same kind of act and should not feel like it. That one moves boards to
 * Trash, where they wait to be restored; this one destroys them and their contents. So:
 *
 *   - it is a visible, outlined, red-tinted button rather than a menu item hidden behind
 *     a "…", because a destructive action should cost a deliberate look to find;
 *   - it confirms in a real Modal naming the count and saying "cannot be undone", rather
 *     than a one-line window.confirm() that muscle memory dismisses;
 *   - the confirm button is filled red and says what it does, not "OK".
 *
 * The server is told to empty the Trash, not which ids to destroy — see the route. A
 * stale page must not be able to name a board somebody has since restored.
 */
export function ClearTrashButton({ count }: { count: number }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  if (count === 0) return null

  async function confirm() {
    setBusy(true)
    try {
      const res = await fetch("/api/board/purge", { method: "POST" })
      if (!res.ok) throw new Error(`purge failed: ${res.status}`)
      setOpen(false)
      router.refresh()
    } catch (err) {
      console.error("Clear Trash failed:", err)
      window.alert("Could not empty the Trash. Nothing was deleted.")
    } finally {
      setBusy(false)
    }
  }

  const noun = count === 1 ? "board" : "boards"

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-red-300 px-4 py-2 text-body-sm font-medium text-red-700 transition-colors hover:bg-red-50"
      >
        Clear Trash
      </button>

      <AnimatePresence>
      {open && (
        <Modal title="Clear Trash" tone="light" width="max-w-md" onClose={() => setOpen(false)}>
          <p className="text-body-sm text-on-surface">
            Permanently delete {count} {noun}? This cannot be undone.
          </p>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            The {noun} and everything on {count === 1 ? "it" : "them"} will be destroyed. This
            is different from moving a board to Trash — there is nothing to restore
            afterwards.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="rounded-full px-4 py-2 text-body-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="rounded-full bg-red-600 px-4 py-2 text-body-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Deleting…" : `Delete ${count} ${noun} permanently`}
            </button>
          </div>
        </Modal>
      )}
      </AnimatePresence>
    </>
  )
}
