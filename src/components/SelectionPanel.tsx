"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import type { StylePatch } from "@/lib/history"
import type { BoardObject } from "@/lib/objects"
import { FONT_SIZES, NOTE_FONT, STICKY_COLORS } from "@/lib/notes"
import { type LineStyle } from "@/lib/strokes"
import { DEFAULT_CURVE } from "@/lib/connectors"
import { hasInterior } from "@/lib/shapes"
import { FILL_SWATCHES, pickerSwatches, type Theme } from "@/lib/theme"
import { ColorPicker, CustomColorSwatch } from "@/components/ColorPicker"

export const MIN_WIDTH = 0.5
export const MAX_WIDTH = 40
/**
 * A filled shape may have no outline at all — that is what "fill only" means, and it
 * needs a width the slider can actually reach. Never offered for anything unfilled:
 * a 0-width stroke with no interior is an object you cannot see or find again.
 */
export const NO_OUTLINE = 0

/**
 * The three line styles, in the order they read as "less ink to more".
 *
 * `value: null` is solid — the object expresses solid as an ABSENT `dash`, and null is
 * this panel's spelling of that. `preview` is an SVG dasharray for the swatch only; the
 * canvas derives its real pattern from the stroke width through dashPattern.
 */
const LINE_OPTIONS: { label: string; value: LineStyle | null; preview?: string }[] = [
  { label: "Solid", value: null },
  { label: "Dashed", value: "dashed", preview: "6 4" },
  { label: "Dotted", value: "dotted", preview: "0 5" },
]

/**
 * Properties of the selected object.
 *
 * Mount this with a key that changes per selection AND per undo/redo — the inputs seed
 * their state from props once, so remounting is what keeps them in step with the
 * object. Edits go straight to the object via onChange; this panel holds no authority
 * over the document, only over what the inputs currently read.
 *
 * One component with one branch rather than two: the shell, the Delete button and the
 * remount contract are the same for both kinds, and only the fields differ.
 */
export function SelectionPanel({
  object,
  onChange,
  onDelete,
  theme,
}: {
  object: BoardObject
  onChange: (patch: StylePatch) => void
  onDelete: () => void
  theme: Theme
}) {
  const [color, setColor] = useState(object.type === "image" ? "" : object.color)
  const isBox = object.type === "note" || object.type === "image"
  const [width, setWidth] = useState(isBox ? 0 : object.width)
  const [fill, setFill] = useState(isBox ? null : (object.fill ?? null))
  // The last real fill, so toggling no-fill and back restores the color instead of
  // starting over. Lives here and not on the object on purpose — an object that
  // remembers a fill it is not using is a second source of truth about whether it is
  // filled, which is exactly what the single optional field avoids.
  const [lastFill, setLastFill] = useState(fill ?? color)
  // null is solid — the panel's spelling of the object's absent `dash`. Kept apart from
  // the object's own field so the segmented control has something to compare against.
  const [dash, setDash] = useState<LineStyle | null>(isBox ? null : (object.dash ?? null))
  const [curved, setCurved] = useState(!isBox && Boolean(object.curve))
  const fillable = object.type === "stroke" && hasInterior(object.shape, object.points)
  // Only a connector has two ends to bow between. A pen stroke or a rectangle has no
  // meaningful curve, so it never gets the control.
  const curvable = object.type === "stroke" && object.shape === "connector"
  // A free-floating text box. Its `color` is ink rather than fill, so it gets the
  // board's ink palette instead of the sticky one — see Note.bare.
  const bare = object.type === "note" && Boolean(object.bare)
  const [font, setFont] = useState(object.type === "note" ? (object.font ?? NOTE_FONT) : NOTE_FONT)

  /** Sets the line style, or clears it back to solid. */
  function applyDash(next: LineStyle | null) {
    setDash(next)
    // undefined, not null — absence is solid on the object, and StylePatch keys on
    // presence so this still snapshots for undo.
    onChange({ dash: next ?? undefined })
  }

  /** Sets or clears the fill, keeping the shape visible either way. */
  function applyFill(c: string | null) {
    setFill(c)
    if (c) setLastFill(c)
    // Removing the fill from a fill-only shape would leave nothing to see: no interior
    // and a zero-width outline. Give it its outline back in the same patch, so one
    // undo restores both.
    const rescue = !c && width === NO_OUTLINE
    if (rescue) setWidth(MIN_WIDTH)
    // undefined, not null — absence is the no-fill state on the object, and StylePatch
    // keys on presence so this still snapshots for undo.
    onChange({ fill: c ?? undefined, ...(rescue ? { width: MIN_WIDTH } : {}) })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      // ponytail: fixed, not anchored to the object — anchoring would need a screen
      // position pushed into React on every pan/zoom frame. Dark on both themes, same
      // reasoning as the toolbar.
      className="fixed right-6 top-20 w-56 rounded-xl border border-outline-variant elevation-2 p-3 backdrop-blur-md"
    >
      {bare ? (
        <>
          <div className="mb-3">
            <span className="mb-1.5 block text-xs text-on-surface-variant">Color</span>
            <ColorPicker
              value={color}
              onChange={(c) => {
                setColor(c)
                onChange({ color: c })
              }}
              swatches={pickerSwatches(theme)}
              fallback={color}
            />
          </div>

          <div className="mb-3">
            <span className="mb-1.5 block text-xs text-on-surface-variant">Size</span>
            {/* A ladder of presets, not a slider: type sizes are chosen from a scale,
                and a continuous control invites 17.3px. Same segmented pattern the
                line-style control already uses. */}
            <div className="grid grid-cols-6 gap-1">
              {FONT_SIZES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFont(f)
                    onChange({ font: f })
                  }}
                  aria-pressed={f === font}
                  className={`h-7 rounded border text-[11px] tabular-nums transition-colors ${
                    f === font
                      ? "border-primary text-on-surface"
                      : "border-outline-variant text-on-surface-variant hover:border-primary"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : object.type === "image" ? null : object.type === "note" ? (
        // The hand-tuned palette leads, because those fill/ink pairs score better than
        // a computed choice can. The custom option is safe alongside them only because
        // inkFor falls back to a computed high-contrast ink for anything off the table.
        <div className="mb-3">
          <span className="mb-1.5 block text-xs text-on-surface-variant">Color</span>
          <div className="grid grid-cols-5 gap-1">
            {STICKY_COLORS.map((c) => (
              <button
                key={c.fill}
                type="button"
                onClick={() => {
                  setColor(c.fill)
                  onChange({ color: c.fill })
                }}
                aria-label={c.name}
                aria-pressed={c.fill.toLowerCase() === color.toLowerCase()}
                className={`h-7 rounded border transition-colors ${
                  c.fill.toLowerCase() === color.toLowerCase()
                    ? "border-primary"
                    : "border-outline-variant hover:border-primary"
                }`}
                style={{ backgroundColor: c.fill }}
              />
            ))}
            <CustomColorSwatch
              value={color}
              onChange={(c) => {
                setColor(c)
                onChange({ color: c })
              }}
              className="h-7 w-full"
            />
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3">
            <span className="mb-1.5 block text-xs text-on-surface-variant">Color</span>
            <ColorPicker
              value={color}
              onChange={(c) => {
                setColor(c)
                onChange({ color: c })
              }}
              swatches={pickerSwatches(theme)}
              fallback={color}
            />
          </div>

          {fillable && (
            <div className="mb-3">
              <span className="mb-1.5 block text-xs text-on-surface-variant">Fill</span>
              <ColorPicker
                value={fill}
                swatches={[...pickerSwatches(theme), ...FILL_SWATCHES]}
                onNone={() => applyFill(null)}
                noneLabel="No fill"
                onChange={(c) => applyFill(c)}
                fallback={lastFill}
              />
            </div>
          )}

          <label className="mb-3 block">
            <span className="mb-1 flex items-center justify-between text-xs text-on-surface-variant">
              Width
              <span className="tabular-nums text-on-surface-variant">{width.toFixed(1)}</span>
            </span>
            <input
              type="range"
              min={fill ? NO_OUTLINE : MIN_WIDTH}
              max={MAX_WIDTH}
              step={0.5}
              value={width}
              onChange={(e) => {
                const w = Number(e.target.value)
                setWidth(w)
                onChange({ width: w })
              }}
              aria-label="Stroke width"
              className="w-full accent-white/80"
            />
          </label>

          <div className="mb-3">
            <span className="mb-1.5 block text-xs text-on-surface-variant">Line</span>
            <div className="grid grid-cols-3 gap-1" role="group" aria-label="Line style">
              {LINE_OPTIONS.map((o) => {
                const active = o.value === dash
                return (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => applyDash(o.value)}
                    aria-label={o.label}
                    aria-pressed={active}
                    title={o.label}
                    className={`flex h-7 items-center justify-center rounded border transition-colors ${
                      active
                        ? "border-primary bg-surface-container text-on-surface"
                        : "border-outline-variant text-on-surface-variant hover:border-primary"
                    }`}
                  >
                    {/* The pattern itself is the label — three words would not fit and
                        a sample line says it faster than "Dashed" does. */}
                    <svg width="30" height="10" viewBox="0 0 30 10" aria-hidden="true">
                      <line
                        x1="2"
                        y1="5"
                        x2="28"
                        y2="5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap={o.value === "dotted" ? "round" : "butt"}
                        strokeDasharray={o.preview}
                      />
                    </svg>
                  </button>
                )
              })}
            </div>
          </div>

          {curvable && (
            <label className="mb-3 flex items-center justify-between text-xs text-on-surface-variant">
              Curved
              <input
                type="checkbox"
                checked={curved}
                onChange={(e) => {
                  const on = e.target.checked
                  setCurved(on)
                  // A number or nothing — the bow is not user-tunable in v1, so the
                  // checkbox writes the default and clears back to absent.
                  onChange({ curve: on ? DEFAULT_CURVE : undefined })
                }}
                aria-label="Curved connector"
                className="h-4 w-4 accent-white/80"
              />
            </label>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onDelete}
        className="w-full rounded py-1.5 text-xs text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-400"
      >
        Delete
      </button>
    </motion.div>
  )
}
