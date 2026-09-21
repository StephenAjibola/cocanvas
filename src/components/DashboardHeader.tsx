"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { AccountMenu } from "@/components/AccountMenu"

const iconButton =
  "flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

/**
 * The dashboard's top bar: search, a few shortcuts, and the account menu.
 *
 * Search filters the board list through the URL (`?q=`) rather than local state, which
 * is what makes a filtered dashboard a link you can send someone or reload without
 * losing. The grid is server-rendered, so the URL has to be the source of truth anyway.
 */
export function DashboardHeader({
  user,
}: {
  user: { name: string | null; email: string; image: string | null }
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState(params.get("q") ?? "")

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const next = new URLSearchParams(params.toString())
    if (q.trim()) next.set("q", q.trim())
    else next.delete("q")
    router.push(`/dashboard${next.toString() ? `?${next}` : ""}`)
  }

  return (
    <header className="flex items-center gap-3 border-b border-outline-variant px-6 py-3">
      <form onSubmit={submit} className="max-w-md flex-1">
        <label className="flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-lowest px-4 py-2 transition-colors focus-within:border-primary">
          <Glyph>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </Glyph>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search boards"
            aria-label="Search boards"
            className="min-w-0 flex-1 bg-transparent text-body-sm text-on-surface outline-none placeholder:text-on-surface-variant"
          />
        </label>
      </form>

      <div className="ml-auto flex items-center gap-1">
        {/**
         * Share and History used to sit here, disabled.
         *
         * REMOVED rather than left greyed out. A permanently disabled control is still a
         * claim — it says the feature exists and you are not allowed to use it, which is
         * not what "we haven't built it" means. Neither has a destination yet: workspace
         * join codes wait on a schema change that has not been confirmed, and version
         * history is its own brief.
         *
         * They come back the moment there is something behind them. Their markup is in
         * git, not in the header taking up space and attention.
         */}

        {/* Settings already had a working destination; it was only ever disabled because
            nothing had pointed it anywhere. */}
        <Link href="/account" aria-label="Settings" title="Account settings" className={iconButton}>
          <Glyph>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1A1.7 1.7 0 004 19.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15a2 2 0 110-4 1.7 1.7 0 001.2-2.9L4 8a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 009 4.6V4a2 2 0 114 0v.1A1.7 1.7 0 0016 6l.1-.1A2 2 0 1118.9 8.7l-.1.1A1.7 1.7 0 0021 11a2 2 0 110 4z" />
          </Glyph>
        </Link>
        <AccountMenu user={user} />
      </div>
    </header>
  )
}
