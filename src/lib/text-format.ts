/**
 * Whole-object text formatting.
 *
 * Every mark applies to the ENTIRE text of an object — the whole sticky is bold, not one
 * word in it. That is a deliberate scope choice, not a stepping stone left half-built:
 * per-character runs would mean text stops being a plain string, the inline <textarea>
 * stops being usable as the editor (it cannot render mixed styling), the canvas has to
 * measure and paint run by run across a wrapped line, and the Y.Map string becomes a
 * Y.Text with attributes. All of that is a separate build.
 *
 * Keeping the marks as flat optional fields is what lets one implementation serve the
 * Text tool, sticky notes and labelled shapes alike: they already share `text`, a
 * TextBox and the same editor, so they share formatting for free.
 */

export type TextAlign = "left" | "center" | "right"

export const TEXT_ALIGNS: TextAlign[] = ["left", "center", "right"]

/** The marks any text-bearing object may carry. Absent means off, as everywhere else. */
export type TextMarks = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: TextAlign
  list?: boolean
}

/**
 * Folds an untrusted align into one of the three we paint with.
 *
 * Normalised on READ rather than validated at the API door, matching how every other
 * optional style field here is handled: absence is the meaningful state, and a junk
 * value is cosmetic rather than a crash. Doing it here means the canvas, the editor and
 * the toolbar cannot disagree about what an unrecognised value means.
 */
export function normalizeAlign(v: unknown, fallback: TextAlign = "left"): TextAlign {
  return v === "left" || v === "center" || v === "right" ? v : fallback
}

/**
 * The `ctx.font` / CSS `font` shorthand for these marks at this size.
 *
 * Order matters and is not stylistic: the CSS font shorthand is `style weight size
 * family`, and getting it wrong makes the whole declaration invalid — canvas silently
 * keeps its previous font, so the bug looks like "bold does nothing" rather than an
 * error. 600 rather than 700 because the UI stack's semibold is what the rest of the
 * app's headings use.
 */
export function fontString(size: number, family: string, marks: TextMarks) {
  const style = marks.italic ? "italic " : ""
  const weight = marks.bold ? "600 " : ""
  return `${style}${weight}${size}px ${family}`
}

/** The bullet glyph, and its column width as a fraction of the font size. */
export const BULLET = "•"
const BULLET_INDENT_RATIO = 0.9

/**
 * How far list text is pushed right of the box edge, in world units.
 *
 * Scaled off the font so a big heading's bullet does not sit tight against 40px text.
 * Both the painter and the editor derive their indent from this one call, and the wrap
 * width is reduced by the same amount — otherwise the editor wraps at one width and the
 * canvas repaints at another, and the text visibly reflows the moment you blur.
 */
export function bulletIndent(font: number) {
  return marksIndentFor(font)
}

function marksIndentFor(font: number) {
  return font * BULLET_INDENT_RATIO
}

/** The indent this object's text starts at: a bullet column, or nothing. */
export function textIndent(font: number, marks: TextMarks) {
  return marks.list ? bulletIndent(font) : 0
}

/**
 * Whether two sets of marks would paint identically.
 *
 * Used to skip history entries for a toggle that changed nothing — pressing Bold twice
 * quickly should not leave two undo steps that both do nothing.
 */
export function sameMarks(a: TextMarks, b: TextMarks) {
  return (
    Boolean(a.bold) === Boolean(b.bold)
    && Boolean(a.italic) === Boolean(b.italic)
    && Boolean(a.underline) === Boolean(b.underline)
    && Boolean(a.list) === Boolean(b.list)
    && normalizeAlign(a.align) === normalizeAlign(b.align)
  )
}

/**
 * The marks carried by an object, with nothing else along for the ride.
 *
 * Takes anything object-shaped rather than a TextMarks: the callers hand it a whole
 * BoardObject, including an image, which carries none of these keys and correctly comes
 * back with all five undefined.
 */
export function marksOf(o: Partial<TextMarks> | object): TextMarks {
  const m = o as Partial<TextMarks>
  return {
    bold: m.bold,
    italic: m.italic,
    underline: m.underline,
    list: m.list,
    align: m.align,
  }
}
