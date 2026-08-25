"use client"

import { type RefObject, useEffect, useRef, useState } from "react"
import type { Viewport } from "@/lib/viewport"

/**
 * Persistent zoom readout, bottom-right, now with a menu behind the percentage.
 *
 * The percentage is polled off `viewRef` rather than pushed: `view` lives inside the
 * canvas effect's closure and changes on every wheel notch and pinch frame, and this
 * is the same pattern SyncBadge already uses to read a fast-moving ref without
 * re-rendering React at that rate. Only a rounded-percentage CHANGE triggers setState.
 */
export function ZoomControl({
  viewRef,
  onZoom,
  onZoomTo,
  onZoomToFit,
  onHideUI,
}: {
  viewRef: RefObject<Viewport>
  onZoom: (dir: 1 | -1) => void
  /** Jump to an absolute scale, anchored on the canvas centre. 1 is 100%. */
  onZoomTo: (scale: number) => void
  onZoomToFit: () => void
  onHideUI: () => void
}) {
  const [pct, setPct] = useState(100)
  const [open, setOpen] = useState(false)
  const lastRef = useRef(100)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = setInterval(() => {
      const next = Math.round(viewRef.current.scale * 100)
      if (next === lastRef.current) return
      lastRef.current = next
      setPct(next)
    }, 150)
    return () => clearInterval(id)
  }, [viewRef])

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

  const items: { label: string; shortcut?: string; onSelect: () => void }[] = [
    { label: "Zoom to fit", shortcut: "Ctrl+1", onSelect: onZoomToFit },
    { label: "Zoom to 200%", onSelect: () => onZoomTo(2) },
    { label: "Zoom to 100%", shortcut: "Ctrl+0", onSelect: () => onZoomTo(1) },
    { label: "Zoom to 50%", onSelect: () => onZoomTo(0.5) },
    { label: "Hide interface", shortcut: "Ctrl+\\", onSelect: onHideUI },
  ]

  return (
    <div
      ref={ref}
      className="fixed bottom-6 right-6 flex items-center gap-1 rounded-xl border border-outline-variant elevation-2 p-1 text-on-surface-variant backdrop-blur-md"
    >
      <button
        type="button"
        onClick={() => onZoom(-1)}
        aria-label="Zoom out"
        className="flex h-8 w-8 items-center justify-center rounded text-base leading-none transition-colors hover:bg-surface-container"
      >
        −
      </button>

      {/* The readout was always a label; making it the menu trigger is what gives the
          menu an obvious home without adding another control to the bar. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Zoom options"
        aria-expanded={open}
        aria-haspopup="menu"
        className="w-12 rounded py-1 text-center text-xs tabular-nums text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface-variant"
      >
        {pct}%
      </button>

      <button
        type="button"
        onClick={() => onZoom(1)}
        aria-label="Zoom in"
        className="flex h-8 w-8 items-center justify-center rounded text-base leading-none transition-colors hover:bg-surface-container"
      >
        +
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-12 right-0 z-50 w-52 overflow-hidden rounded-xl border border-outline-variant elevation-2 p-1 shadow-xl backdrop-blur-md"
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
              className="flex w-full items-center justify-between gap-3 rounded px-2.5 py-1.5 text-left text-[13px] text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              {item.label}
              {item.shortcut && (
                <span className="text-[11px] tabular-nums text-on-surface-variant">{item.shortcut}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
