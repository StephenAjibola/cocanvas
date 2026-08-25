"use client"

import { useEffect, useRef } from "react"
import { Toggle } from "@/components/Modal"
import {
  CANVAS_KEYS,
  GRID_LABELS,
  GRID_STYLES,
  THEMES,
  type GridStyle,
  type Theme,
} from "@/lib/theme"

/**
 * Canvas background and grid — what the board is drawn ON.
 *
 * This is the old two-way theme toggle grown up, not a replacement for it: the same
 * Board.theme column, the same PATCH route, the same optimistic-with-revert write. What
 * changed is that the control offers five backgrounds instead of flipping between two,
 * and that the grid drawn on them is now a choice.
 *
 * Colour and grid are board properties and persist for everyone. The guides toggle at
 * the bottom is NOT — it changes how dragging behaves for you alone, so it lives in
 * localStorage. They share a panel because they are all "how this canvas behaves under
 * my cursor"; the storage note in the UI is what keeps that honest.
 */
export function CanvasPanel({
  theme,
  onThemeChange,
  gridStyle,
  onGridStyleChange,
  smartGuides,
  onSmartGuidesChange,
  onClose,
}: {
  theme: Theme
  onThemeChange: (next: Theme) => void
  gridStyle: GridStyle
  onGridStyleChange: (next: GridStyle) => void
  smartGuides: boolean
  onSmartGuidesChange: (next: boolean) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener("pointerdown", onDown)
    window.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      window.removeEventListener("keydown", onKey, true)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Canvas"
      className="fixed left-20 top-1/2 z-50 w-60 -translate-y-1/2 space-y-4 rounded-xl border border-outline-variant elevation-2 p-3 shadow-xl backdrop-blur-md"
    >
      <section>
        <h3 className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
          Canvas colour
        </h3>
        <div className="flex gap-2 px-1">
          {CANVAS_KEYS.map((key) => {
            const active = key === theme
            return (
              <button
                key={key}
                type="button"
                onClick={() => onThemeChange(key)}
                aria-label={THEMES[key].label}
                aria-pressed={active}
                title={THEMES[key].label}
                // The swatch IS the canvas colour, so it needs its own border to be
                // visible: white on a dark panel would otherwise float with no edge, and
                // black would vanish into it entirely.
                // accent-600, not accent-500: this panel sits on the dark chrome, where
                // the primary accent does not separate from its background.
                className={`h-7 w-7 rounded-full border transition-transform ${
                  active
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-outline-variant hover:scale-110"
                }`}
                style={{ backgroundColor: THEMES[key].bg }}
              />
            )
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
          Grid
        </h3>
        <div className="flex gap-1 px-1">
          {GRID_STYLES.map((style) => {
            const active = style === gridStyle
            return (
              <button
                key={style}
                type="button"
                onClick={() => onGridStyleChange(style)}
                aria-pressed={active}
                className={`flex-1 rounded border px-2 py-1.5 text-[12px] transition-colors ${
                  active
                    ? "border-primary bg-primary/15 text-on-surface"
                    : "border-outline-variant text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                {GRID_LABELS[style]}
              </button>
            )
          })}
        </div>
      </section>

      <section className="border-t border-outline-variant pt-2">
        <Toggle
          label="Snap to smart guides"
          description="Line a dragged object up with the ones already on the board."
          checked={smartGuides}
          onChange={onSmartGuidesChange}
        />
        <p className="px-2 pt-1 text-[10px] leading-snug text-on-surface-variant">
          Colour and grid are shared with everyone on this board. Snapping is yours alone.
        </p>
      </section>
    </div>
  )
}
