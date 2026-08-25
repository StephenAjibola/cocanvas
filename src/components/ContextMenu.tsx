"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { motion } from "framer-motion"

export type MenuItem = {
  label: string
  shortcut?: string
  onSelect: () => void
  disabled?: boolean
  /** Draws a divider above this item. */
  separated?: boolean
  danger?: boolean
}

const MARGIN = 8 // keep the panel this far from the viewport edge

/**
 * Right-click menu, positioned at the pointer in SCREEN space.
 *
 * Fixed rather than anchored to the object: an anchored menu would have to be
 * repositioned on every pan and zoom frame, which is the React churn the canvas avoids
 * everywhere else. A menu is short-lived, so it simply closes if the board moves.
 */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // Layout effect, not effect: flipping after paint would show the menu hanging off
  // the edge for a frame first.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      x: Math.min(x, window.innerWidth - width - MARGIN),
      y: Math.min(y, window.innerHeight - height - MARGIN),
    })
  }, [x, y])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    // Capture phase: the canvas also listens for pointerdown, and without this a click
    // meant to dismiss the menu would start a gesture underneath it.
    document.addEventListener("pointerdown", onDown, true)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  return (
    <motion.div
      ref={ref}
      role="menu"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 34 }}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-50 min-w-[190px] rounded-xl border border-outline-variant elevation-2 p-1 backdrop-blur-md"
    >
      {items.map((it) => (
        <div key={it.label}>
          {it.separated && <div className="my-1 h-px bg-surface-container" />}
          <button
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              it.onSelect()
              onClose()
            }}
            className={`flex w-full items-center justify-between gap-6 rounded px-2.5 py-1.5 text-left text-[13px] transition-colors disabled:pointer-events-none disabled:text-on-surface-variant ${
              it.danger
                ? "text-red-400/85 hover:bg-red-500/10 hover:text-red-400"
                : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
            }`}
          >
            <span>{it.label}</span>
            {it.shortcut && (
              <span className="text-[11px] tabular-nums text-on-surface-variant">{it.shortcut}</span>
            )}
          </button>
        </div>
      ))}
    </motion.div>
  )
}
