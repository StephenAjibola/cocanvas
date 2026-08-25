"use client"

import { useState } from "react"
import { ShareModal } from "@/components/ShareModal"
import type { ShareAccess } from "@/lib/share"

/**
 * The header's Share control: a button, and the modal it opens.
 *
 * All of the substance moved to ShareModal — this is only the trigger and the open/closed
 * state. Kept as its own component so the board header's JSX stays a list of controls
 * rather than growing modal state of its own.
 *
 * The modal is mounted only while open, which is what makes ShareModal's fetch-on-mount
 * the same thing as fetch-on-open.
 */
export function ShareButton({
  boardId,
  initialToken,
  initialAccess = "off",
}: {
  boardId: string
  initialToken: string | null
  initialAccess?: ShareAccess
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-primary px-4 py-1.5 text-body-sm font-medium text-on-primary transition-colors hover:bg-accent-hover"
      >
        Share
      </button>

      {open && (
        <ShareModal
          boardId={boardId}
          initialToken={initialToken}
          initialAccess={initialAccess}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
