"use client"

import { motion } from "framer-motion"
import type { BoardObject } from "@/lib/objects"
import type { StylePatch } from "@/lib/history"
import { type TextAlign, marksOf, normalizeAlign } from "@/lib/text-format"
import { NOTE_FONT } from "@/lib/notes"
import { pickerSwatches, type Theme } from "@/lib/theme"
import { ColorPicker } from "@/components/ColorPicker"

/**
 * One text-formatting toolbar, for every kind of object that can hold text.
 *
 * The Text tool's boxes, sticky notes and labelled shapes already share `text`, a
 * TextBox and the inline editor, so they share this too rather than each growing their
 * own controls. That is the whole reason the marks live as flat fields on both types.
 *
 * Colour and Size appear only for a free TEXT BOX. On a sticky the ink is DERIVED from
 * the fill by inkFor so it stays readable, and on a shape from the fill or the board —
 * offering a text colour there would be a control that either does nothing or breaks
 * contrast, so those objects keep their fill/stroke colour in the selection panel where
 * it means what it says.
 *
 * ponytail: fixed top-centre rather than anchored above the object. Anchoring would mean
 * pushing a screen position into React on every pan and zoom frame, which is the cost
 * SelectionPanel already declined to pay for the same reason.
 */

/** The size ladder, shared with the panel this replaced — chosen from a scale, not typed. */
const FONT_SIZES = [12, 15, 18, 24, 32, 44]

const ALIGN_ICONS: Record<TextAlign, string> = {
  // Three bars, the middle one short and pinned to the matching edge.
  left: "M3 5h18M3 10h11M3 15h18M3 20h11",
  center: "M3 5h18M6.5 10h11M3 15h18M6.5 20h11",
  right: "M3 5h18M10 10h11M3 15h18M10 20h11",
}

export function TextToolbar({
  object,
  onChange,
  theme,
}: {
  object: BoardObject
  onChange: (patch: StylePatch) => void
  theme: Theme
}) {
  // An image carries no marks; marksOf reads five optional keys and finds none.
  const marks = marksOf(object)
  const align = normalizeAlign(
    marks.align,
    // A label has always been centred and a note left-aligned; the button that looks
    // pressed has to match what is actually painted.
    object.type === "stroke" ? "center" : "left",
  )
  // A free text box — the Text tool's output. See the note above on why only these get
  // colour and size.
  const isTextBox = object.type === "note" && Boolean(object.bare)
  const font = object.type === "note" ? (object.font ?? NOTE_FONT) : NOTE_FONT

  /** Absent is the off state everywhere here, so toggling off writes undefined. */
  const toggle = (key: "bold" | "italic" | "underline" | "list", on: boolean) =>
    onChange({ [key]: on ? true : undefined })

  const cell =
    "flex h-8 w-8 items-center justify-center rounded transition-colors"
  const on = "bg-primary text-on-primary"
  const off = "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      role="toolbar"
      aria-label="Text formatting"
      className="fixed left-1/2 top-20 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-outline-variant elevation-2 px-2 py-1.5 backdrop-blur-md"
    >
      <button
        type="button"
        onClick={() => toggle("bold", !marks.bold)}
        aria-pressed={Boolean(marks.bold)}
        aria-label="Bold"
        title="Bold"
        className={`${cell} font-semibold ${marks.bold ? on : off}`}
      >
        B
      </button>
      <button
        type="button"
        onClick={() => toggle("italic", !marks.italic)}
        aria-pressed={Boolean(marks.italic)}
        aria-label="Italic"
        title="Italic"
        className={`${cell} font-serif italic ${marks.italic ? on : off}`}
      >
        I
      </button>
      <button
        type="button"
        onClick={() => toggle("underline", !marks.underline)}
        aria-pressed={Boolean(marks.underline)}
        aria-label="Underline"
        title="Underline"
        className={`${cell} underline underline-offset-2 ${marks.underline ? on : off}`}
      >
        U
      </button>

      <span className="mx-1 h-5 w-px bg-outline-variant" aria-hidden />

      <div role="group" aria-label="Text alignment" className="flex items-center gap-1">
        {(Object.keys(ALIGN_ICONS) as TextAlign[]).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => onChange({ align: a })}
            aria-pressed={a === align}
            aria-label={`Align ${a}`}
            title={`Align ${a}`}
            className={`${cell} ${a === align ? on : off}`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d={ALIGN_ICONS[a]}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ))}
      </div>

      <span className="mx-1 h-5 w-px bg-outline-variant" aria-hidden />

      <button
        type="button"
        onClick={() => toggle("list", !marks.list)}
        aria-pressed={Boolean(marks.list)}
        aria-label="Bulleted list"
        title="Bulleted list"
        className={`${cell} ${marks.list ? on : off}`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="4.5" cy="7" r="1.6" fill="currentColor" />
          <circle cx="4.5" cy="12" r="1.6" fill="currentColor" />
          <circle cx="4.5" cy="17" r="1.6" fill="currentColor" />
          <path
            d="M9.5 7h11M9.5 12h11M9.5 17h11"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {isTextBox && (
        <>
          <span className="mx-1 h-5 w-px bg-outline-variant" aria-hidden />

          {/* Folded in from the panel that used to be the only place a text box had any
              controls at all. */}
          <ColorPicker
            value={object.color}
            onChange={(c) => onChange({ color: c })}
            swatches={pickerSwatches(theme)}
            fallback={object.color}
          />

          <span className="mx-1 h-5 w-px bg-outline-variant" aria-hidden />

          <select
            value={font}
            onChange={(e) => onChange({ font: Number(e.target.value) })}
            aria-label="Text size"
            title="Text size"
            // A select rather than the panel's six-button ladder: the same fixed scale,
            // but the toolbar is a single row and six more cells would make it wider
            // than most of what it formats.
            className="h-8 rounded bg-transparent px-1 text-[12px] tabular-nums text-on-surface-variant outline-none transition-colors hover:text-on-surface"
          >
            {FONT_SIZES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </>
      )}
    </motion.div>
  )
}
