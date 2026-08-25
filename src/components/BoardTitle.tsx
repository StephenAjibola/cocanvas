"use client"

import { type RefObject, useEffect, useRef, useState } from "react"

/**
 * The board's name, editable in place.
 *
 * Lives in the page rather than inside BoardCanvas: it needs none of the canvas state,
 * and BoardCanvas is the one file where an extra re-render costs a dropped view
 * transform. Rendering it as a sibling keeps that 2000-line effect untouched.
 *
 * An <input> is deliberate — the canvas's keyboard shortcuts already stand down for
 * one (see isTypingTarget), so typing "Delete" in a title cannot erase the selection.
 */
export function BoardTitle({
  boardId,
  initialName,
  startRef,
}: {
  boardId: string
  initialName: string
  /**
   * Filled with "begin editing", so the board's "..." menu can open this field instead
   * of shipping a second rename path.
   *
   * A ref rather than lifting `editing` into the parent: that parent is BoardCanvas, and
   * a state change there re-renders the canvas host on every keystroke of a rename. The
   * editing state stays local; only the trigger is shared.
   */
  startRef?: RefObject<(() => void) | null>
}) {
  const [name, setName] = useState(initialName)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)
  // The last name the SERVER acknowledged. A failed save reverts to this rather than to
  // the value the field opened with, which may itself have been an unsaved edit.
  const savedRef = useRef(initialName)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  // `name` is in the deps because the opener seeds the draft from the CURRENT name — a
  // stale closure here would reopen the field with whatever it was called on first paint.
  useEffect(() => {
    if (!startRef) return
    startRef.current = () => {
      setDraft(name)
      setEditing(true)
    }
    return () => {
      startRef.current = null
    }
  }, [startRef, name])

  async function commit() {
    setEditing(false)
    const next = draft.trim()
    // An empty title is a slip, not an intent — restore rather than persist a blank.
    if (!next || next === savedRef.current) {
      setDraft(savedRef.current)
      setName(savedRef.current)
      return
    }

    // Optimistic: the field is the user's own edit, so showing it immediately is
    // honest. The revert below is what makes that safe.
    setName(next)
    try {
      const res = await fetch(`/api/board/${encodeURIComponent(boardId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: next }),
      })
      if (!res.ok) throw new Error(`rename failed: ${res.status}`)
      const body = await res.json()
      // Trust the server's copy, not the draft: it is the one that got trimmed and
      // length-capped on the way in.
      savedRef.current = body.name
      setName(body.name)
      setDraft(body.name)
    } catch (err) {
      console.error("Board rename failed:", err)
      setName(savedRef.current)
      setDraft(savedRef.current)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(name)
          setEditing(true)
        }}
        title="Rename board"
        className="max-w-[40vw] truncate rounded px-2 py-1 text-left text-sm text-on-surface-variant transition-colors hover:bg-surface-container"
      >
        {name}
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // Stopped from reaching the window listeners the canvas binds — otherwise
        // Escape and friends are handled twice, once here and once by the board.
        e.stopPropagation()
        if (e.key === "Enter") commit()
        if (e.key === "Escape") {
          setDraft(savedRef.current)
          setEditing(false)
        }
      }}
      // Matches the DB column's cap, so the field cannot compose something the route
      // will silently truncate.
      maxLength={100}
      className="w-[40vw] max-w-xs rounded border border-outline-variant elevation-2 px-2 py-1 text-sm text-on-surface outline-none backdrop-blur-md focus:border-outline"
    />
  )
}
