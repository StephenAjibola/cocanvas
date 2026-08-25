"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { normalizeInviteCode } from "@/lib/invite-code"

/**
 * "…or join with a code" — the phrase itself is the control.
 *
 * The link lives INSIDE the subtext rather than beside it, so the sentence that offers
 * joining is the thing you click to do it. The field then appears in place, already
 * focused: one click, then type, with no separate affordance competing with the primary
 * New canvas button.
 */
export function JoinWithCode() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Client-side only, to catch a typo before a round trip. The route re-normalises and
  // re-checks everything, because this value arrives over the wire.
  const valid = normalizeInviteCode(code) !== null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/invites/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || "That code didn't work.")
      // The route has already switched the current-workspace cookie, so a refresh lands
      // in the workspace just joined rather than the one that was open.
      router.refresh()
      setOpen(false)
      setCode("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="mt-1.5 text-body-lg text-on-surface-variant">
        Start with a canvas or{" "}
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            // Focused on the next frame, once the field exists to receive it.
            requestAnimationFrame(() => inputRef.current?.focus())
          }}
          className="text-primary underline underline-offset-2 hover:text-accent-hover"
        >
          join with a code
        </button>
        .
      </p>

      {open && (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false)
                  setCode("")
                  setError(null)
                }
              }}
              placeholder="Enter a code"
              aria-label="Invite code"
              aria-invalid={Boolean(error)}
              // Codes are read off a screen or down a phone line, so the field looks like
              // the thing being copied: monospace, spaced, one glyph per character.
              maxLength={9}
              className="w-40 rounded-full border border-outline bg-surface-container-lowest px-4 py-2 text-center font-mono text-label-mono uppercase text-on-surface outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-on-surface-variant focus:border-primary"
            />
            <button
              type="submit"
              disabled={!valid || busy}
              className="rounded-full border border-outline px-4 py-2 text-body-sm font-medium text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
            >
              {busy ? "Joining…" : "Join"}
            </button>
          </div>
          {error && (
            <p role="alert" className="max-w-xs text-body-sm text-error">
              {error}
            </p>
          )}
        </form>
      )}
    </>
  )
}
