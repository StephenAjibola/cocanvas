"use client"

import { type RefObject, useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import type { Viewport } from "@/lib/viewport"
import {
  MaterialIcon,
  M_PAN_TOOL,
  M_REDO,
  M_UNDO,
  M_ZOOM_IN,
  type Tool,
} from "@/components/Toolbar"

/**
 * The bottom-centre pill: Zoom, Pan, Undo, Redo.
 *
 * Replaces the bottom-RIGHT zoom box and takes over Undo/Redo from the tool rail's "…"
 * overflow, so the board has exactly two pieces of chrome — this and the left rail —
 * which is what the reference design has.
 *
 * Zoom and Pan are not the same kind of thing and the pill does not pretend they are:
 * Pan is a tool that takes the active highlight while it is armed, Zoom opens the
 * percentage menu that used to hang off the readout. Undo and Redo are one-shot actions
 * and simply disable when there is nothing to undo.
 *
 * The percentage is polled off `viewRef` rather than pushed: `view` lives inside the
 * canvas effect's closure and changes on every wheel notch and pinch frame, and this is
 * the same pattern SyncBadge uses to read a fast-moving ref without re-rendering React
 * at that rate. Only a rounded-percentage CHANGE triggers setState.
 */
export function BottomPill({
  viewRef,
  tool,
  onToolChange,
  onZoom,
  onZoomTo,
  onZoomToFit,
  onHideUI,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  viewRef: RefObject<Viewport>
  tool: Tool
  onToolChange: (t: Tool) => void
  onZoom: (dir: 1 | -1) => void
  /** Jump to an absolute scale, anchored on the canvas centre. 1 is 100%. */
  onZoomTo: (scale: number) => void
  onZoomToFit: () => void
  onHideUI: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
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
    { label: "Zoom in", shortcut: "Ctrl+=", onSelect: () => onZoom(1) },
    { label: "Zoom out", shortcut: "Ctrl+-", onSelect: () => onZoom(-1) },
    { label: "Zoom to fit", shortcut: "Ctrl+1", onSelect: onZoomToFit },
    { label: "Zoom to 200%", onSelect: () => onZoomTo(2) },
    { label: "Zoom to 100%", shortcut: "Ctrl+0", onSelect: () => onZoomTo(1) },
    { label: "Zoom to 50%", onSelect: () => onZoomTo(0.5) },
    { label: "Hide interface", shortcut: "Ctrl+\\", onSelect: onHideUI },
  ]

  /** Shared shell so the four cells line up whatever they do when pressed. */
  const cell =
    "flex flex-col items-center gap-0.5 rounded-xl px-3 py-1 transition-colors active:scale-95"

  return (
    <div
      ref={ref}
      className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-end gap-2 rounded-full border border-outline-variant elevation-2 px-4 py-2 backdrop-blur-md"
    >
      {/* Zoom carries its live percentage as its label — the readout and the menu
          trigger are one control, as they were in the old bottom-right box. */}
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Zoom options"
        aria-expanded={open}
        aria-haspopup="menu"
        whileTap={{ scale: 0.95 }}
        className={`${cell} text-on-surface-variant hover:text-on-surface`}
      >
        <MaterialIcon path={M_ZOOM_IN} size={20} />
        <span className="text-[10px] tabular-nums">{pct}%</span>
      </motion.button>

      <motion.button
        type="button"
        // Toggles: pressing Pan while it is armed goes back to Select, so the pill can
        // put the tool down the same way it picked it up.
        onClick={() => onToolChange(tool === "pan" ? "select" : "pan")}
        aria-label="Pan"
        aria-pressed={tool === "pan"}
        whileTap={{ scale: 0.95 }}
        className={`${cell} ${
          tool === "pan"
            ? "bg-primary text-on-primary"
            : "text-on-surface-variant hover:text-on-surface"
        }`}
      >
        <MaterialIcon path={M_PAN_TOOL} size={20} />
        <span className="text-[10px]">Pan</span>
      </motion.button>

      <motion.button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
        whileTap={{ scale: 0.95 }}
        className={`${cell} text-on-surface-variant hover:text-on-surface disabled:pointer-events-none disabled:opacity-40`}
      >
        <MaterialIcon path={M_UNDO} size={20} />
        <span className="text-[10px]">Undo</span>
      </motion.button>

      <motion.button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        whileTap={{ scale: 0.95 }}
        className={`${cell} text-on-surface-variant hover:text-on-surface disabled:pointer-events-none disabled:opacity-40`}
      >
        <MaterialIcon path={M_REDO} size={20} />
        <span className="text-[10px]">Redo</span>
      </motion.button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-2 w-52 overflow-hidden rounded-xl border border-outline-variant elevation-2 p-1 shadow-xl backdrop-blur-md"
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
                <span className="text-[11px] tabular-nums text-on-surface-variant">
                  {item.shortcut}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
