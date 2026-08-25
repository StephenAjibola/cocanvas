"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { numberThreads } from "@/lib/pins"

export const COMMENTS_PANEL_WIDTH = 340

export type CommentAuthor = { name: string | null; email: string; image: string | null }
export type Reply = {
  id: string
  content: string
  createdAt: string
  authorId: string
  author: CommentAuthor
}
export type Thread = {
  id: string
  content: string
  resolved: boolean
  objectId: string | null
  anchorX: number
  anchorY: number
  createdAt: string
  authorId: string
  author: CommentAuthor
  replies: Reply[]
}

type Filter = "open" | "mine" | "all"
const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "mine", label: "Mine" },
  { key: "all", label: "All" },
]

/**
 * The docked comments panel.
 *
 * Docked rather than floating, and the canvas is narrowed to make room rather than being
 * covered — that is why BoardCanvas insets its canvas wrapper instead of drawing this on
 * top. A panel over the board would sit on the very pins it lists, and clicking a pin is
 * how you get to its thread.
 *
 * The thread list is owned here, but the pins are drawn by the canvas from the same
 * array, passed up through onThreadsChange. One source, two renderers — the alternative
 * is two fetches that disagree about what exists.
 */
export function CommentsPanel({
  boardId,
  shareToken,
  onClose,
  onThreadsChange,
  selectedId,
  onSelect,
  pendingAnchor,
  onPendingResolved,
  onStartPlacing,
  placing,
  version,
}: {
  boardId: string
  shareToken?: string | null
  onClose: () => void
  onThreadsChange: (threads: Thread[]) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Where the user just clicked to place a new pin, if a placement is in flight. */
  pendingAnchor: { x: number; y: number; objectId: string | null } | null
  onPendingResolved: () => void
  onStartPlacing: () => void
  placing: boolean
  /** Bumped by the realtime version counter to force a refetch. */
  version: number
}) {
  const [threads, setThreads] = useState<Thread[]>([])
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [canPost, setCanPost] = useState(false)
  const [canModerate, setCanModerate] = useState(false)
  const [filter, setFilter] = useState<Filter>("open")
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState("")
  const [replyDraft, setReplyDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  const query = shareToken ? `?token=${encodeURIComponent(shareToken)}` : ""

  useEffect(() => {
    let live = true
    fetch(`/api/board/${encodeURIComponent(boardId)}/comments${query}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (!live) return
        setThreads(data.threads)
        setViewerId(data.viewerId)
        setCanPost(data.canPost)
        setCanModerate(data.canModerate)
        setLoading(false)
      })
      .catch((err) => {
        console.error("Loading comments failed:", err)
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [boardId, query, version])

  // The canvas draws its pins from whatever this last fetched.
  useEffect(() => {
    onThreadsChange(threads)
  }, [threads, onThreadsChange])

  // A pin placement waiting on its first comment focuses the composer, so dropping a pin
  // and typing is one gesture rather than a click followed by hunting for the field.
  useEffect(() => {
    if (pendingAnchor) composerRef.current?.focus()
  }, [pendingAnchor])

  // Numbers come from the same helper the canvas uses, so the "3" in the list is the "3"
  // on the board. Computed over ALL threads, never the filtered subset — filtering must
  // not renumber anything.
  const numbers = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of numberThreads(threads)) map.set(p.id, p.n)
    return map
  }, [threads])

  const shown = useMemo(() => {
    if (filter === "open") return threads.filter((t) => !t.resolved)
    if (filter === "mine") {
      return threads.filter(
        (t) => t.authorId === viewerId || t.replies.some((r) => r.authorId === viewerId),
      )
    }
    return threads
  }, [threads, filter, viewerId])

  async function post() {
    const content = draft.trim()
    if (!content || busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/board/${encodeURIComponent(boardId)}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content,
          token: shareToken ?? undefined,
          // A pending anchor means this is a new thread; without one there is nothing to
          // pin, so the composer is disabled and this cannot be reached.
          anchorX: pendingAnchor?.x,
          anchorY: pendingAnchor?.y,
          objectId: pendingAnchor?.objectId ?? undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `post failed: ${res.status}`)
      setThreads((ts) => [{ ...body, replies: [] }, ...ts])
      setDraft("")
      onPendingResolved()
      onSelect(body.id)
    } catch (err) {
      console.error("Posting comment failed:", err)
    } finally {
      setBusy(false)
    }
  }

  async function reply(threadId: string) {
    const content = replyDraft.trim()
    if (!content || busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/board/${encodeURIComponent(boardId)}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, parentId: threadId, token: shareToken ?? undefined }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `reply failed: ${res.status}`)
      setThreads((ts) =>
        ts.map((t) => (t.id === threadId ? { ...t, replies: [...t.replies, body] } : t)),
      )
      setReplyDraft("")
    } catch (err) {
      console.error("Replying failed:", err)
    } finally {
      setBusy(false)
    }
  }

  async function setResolved(threadId: string, resolved: boolean) {
    const prev = threads
    setThreads((ts) => ts.map((t) => (t.id === threadId ? { ...t, resolved } : t)))
    try {
      const res = await fetch(`/api/comments/${threadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolved, token: shareToken ?? undefined }),
      })
      if (!res.ok) throw new Error(`resolve failed: ${res.status}`)
    } catch (err) {
      console.error("Resolving failed:", err)
      setThreads(prev)
    }
  }

  return (
    <aside
      // Fixed to the right edge. The canvas is inset by the same width, so the two meet
      // exactly and neither overlaps the other.
      style={{ width: COMMENTS_PANEL_WIDTH }}
      // Level 2: a panel floating over the canvas. No fixed-position children live inside
      // it, so the blur's containing-block trap does not apply here — see globals.css.
      className="elevation-2 fixed inset-y-0 right-0 z-40 flex flex-col text-on-surface"
      aria-label="Comments"
    >
      <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
        <h2 className="text-sm font-medium">Comments</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close comments"
          className="flex h-7 w-7 items-center justify-center rounded text-ink-500 transition-colors hover:bg-paper-50 hover:text-ink-900"
        >
          ✕
        </button>
      </div>

      <div className="flex gap-1 border-b border-ink-200 px-3 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`rounded px-3 py-1 text-xs transition-colors ${
              filter === f.key
                ? "bg-accent-500 font-medium text-white"
                : "text-ink-500 hover:bg-paper-50 hover:text-ink-900"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : !shown.length ? (
          <p className="text-sm text-ink-500">
            {filter === "open"
              ? "No open comments. Drop a pin on the board to start one."
              : filter === "mine"
                ? "You haven't commented on this board yet."
                : "No comments yet."}
          </p>
        ) : (
          <ul className="space-y-2">
            {shown.map((t) => {
              const active = t.id === selectedId
              const mineOrMod = canModerate || t.authorId === viewerId
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(active ? null : t.id)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? "border-accent-500 bg-paper-0"
                        : "border-ink-200 bg-paper-0 hover:border-ink-400"
                    } ${t.resolved ? "opacity-60" : ""}`}
                  >
                    <span className="mb-1.5 flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded rounded-bl-none bg-accent-500 text-[10px] font-medium text-white">
                        {numbers.get(t.id)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">
                        {t.author.name || t.author.email}
                      </span>
                      {t.resolved && (
                        <span className="shrink-0 rounded-full bg-paper-100 px-2 py-0.5 text-[10px] text-ink-500">
                          Resolved
                        </span>
                      )}
                    </span>
                    <span className="block whitespace-pre-wrap break-words text-sm">
                      {t.content}
                    </span>
                    {t.replies.length > 0 && !active && (
                      <span className="mt-1 block text-xs text-ink-500">
                        {t.replies.length} {t.replies.length === 1 ? "reply" : "replies"}
                      </span>
                    )}
                  </button>

                  {active && (
                    <div className="mt-1 space-y-2 rounded-xl border border-ink-200 bg-paper-0 p-3">
                      {t.replies.map((r) => (
                        <div key={r.id} className="border-l-2 border-ink-200 pl-2.5">
                          <p className="text-xs font-medium">
                            {r.author.name || r.author.email}
                          </p>
                          <p className="whitespace-pre-wrap break-words text-sm">{r.content}</p>
                        </div>
                      ))}

                      {canPost && (
                        <div className="flex gap-1.5">
                          <input
                            value={replyDraft}
                            onChange={(e) => setReplyDraft(e.target.value)}
                            onKeyDown={(e) => {
                              e.stopPropagation() // the canvas binds window-level keys
                              if (e.key === "Enter") reply(t.id)
                            }}
                            placeholder="Reply…"
                            className="min-w-0 flex-1 rounded border border-ink-400 bg-paper-0 px-2 py-1 text-xs outline-none focus:border-accent-500"
                          />
                          <button
                            type="button"
                            onClick={() => reply(t.id)}
                            disabled={busy || !replyDraft.trim()}
                            className="shrink-0 rounded bg-accent-500 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
                          >
                            Reply
                          </button>
                        </div>
                      )}

                      {mineOrMod && (
                        <button
                          type="button"
                          onClick={() => setResolved(t.id, !t.resolved)}
                          className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900"
                        >
                          {t.resolved ? "Reopen" : "Resolve"}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Pinned to the bottom, outside the scroll area, so the composer is reachable
          without scrolling past every existing thread. */}
      {canPost && (
        <div className="border-t border-ink-200 p-3">
          {pendingAnchor ? (
            <>
              <textarea
                ref={composerRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) post()
                }}
                rows={3}
                placeholder="Add a comment…"
                className="w-full resize-none rounded border border-ink-400 bg-paper-0 px-2.5 py-2 text-sm outline-none focus:border-accent-500"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={post}
                  disabled={busy || !draft.trim()}
                  className="flex-1 rounded bg-accent-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-40"
                >
                  Comment
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft("")
                    onPendingResolved()
                  }}
                  className="rounded border border-ink-400 px-3 py-1.5 text-sm transition-colors hover:bg-paper-50"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={onStartPlacing}
              className={`w-full rounded border px-3 py-2 text-sm transition-colors ${
                placing
                  ? "border-accent-500 bg-accent-500/10 text-accent-500"
                  : "border-ink-400 hover:bg-paper-50"
              }`}
            >
              {placing ? "Click the board to place your pin" : "+ New comment"}
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
