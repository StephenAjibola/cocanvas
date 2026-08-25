"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { signOut } from "next-auth/react"

type Person = { name: string | null; email: string; image: string | null }

/**
 * What this menu gains when it is opened from inside a board rather than the dashboard.
 *
 * Absent on the dashboard, where there is no board to have a role on and no cursors to
 * hide. Making it one optional prop is what keeps this a single menu on a single avatar:
 * the alternative was a second popover competing for the same click, which is a worse
 * answer to "what happens when I click my own face" than one menu with a board section.
 */
type BoardContext = {
  /** This user's role in the workspace that owns the board — OWNER, EDITOR or VIEWER. */
  role: string
  hideCursors: boolean
  onHideCursorsChange: (next: boolean) => void
}

/**
 * The circular avatar in the top-right corner, on both the dashboard and the board
 * page. accent-600 for the fallback fill because that's the one point on the accent ramp
 * that works as a filled control on both grounds this sits on — the light dashboard page
 * and the dark board header. accent-500 is the primary action colour everywhere else,
 * but it scores 1.85 against the board header's ink-850 and would vanish into it.
 */
export function AccountMenu({ user, board }: { user: Person; board?: BoardContext }) {
  const [open, setOpen] = useState(false)
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

  const initial = (user.name || user.email).trim().slice(0, 1).toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-accent-600 text-sm font-medium text-white"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- external OAuth avatar, not a local asset
          <img src={user.image} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lg"
        >
          <div className="border-b border-ink-200 px-4 py-3">
            <p className="truncate text-sm font-medium text-ink-900">
              {user.name || user.email}
            </p>
            <p className="truncate text-xs text-ink-500">{user.email}</p>
          </div>

          {board && (
            <div className="border-b border-ink-200 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-ink-500">Role on this board</span>
                {/* Read from the Membership row the page already had to load to decide
                    whether this session is read-only — no extra query for the label. */}
                <span className="rounded-full bg-paper-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-900">
                  {board.role.toLowerCase()}
                </span>
              </div>

              <label className="mt-2 flex cursor-pointer items-center justify-between gap-3">
                <span className="text-sm text-ink-900">Hide others&apos; cursors</span>
                <input
                  type="checkbox"
                  checked={board.hideCursors}
                  onChange={(e) => board.onHideCursorsChange(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent-500)]"
                />
              </label>
              <p className="mt-1 text-[11px] leading-snug text-ink-500">
                Only changes your own view — they can still see yours.
              </p>
            </div>
          )}

          <div className="py-1">
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-ink-900 hover:bg-paper-50"
            >
              Manage Account
            </Link>

            {/* Both are reserved space, not links — no page exists behind either yet. */}
            {(["CoCanvas AI", "CoCanvas Admin"] as const).map((label) => (
              <div
                key={label}
                role="menuitem"
                aria-disabled="true"
                className="flex cursor-not-allowed items-center justify-between px-4 py-2 text-sm text-ink-500"
              >
                {label}
                <span className="rounded-full bg-paper-100 px-2 py-0.5 text-[10px] font-medium text-ink-500">
                  Coming soon
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-ink-200 py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
