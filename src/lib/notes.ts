/**
 * Sticky notes.
 *
 * A sibling of Stroke, never a subtype: a note is an axis-aligned box with text, and
 * encoding it as a rect polyline would throw away the w/h that wrapping, the drop
 * animation's centre and future resize handles all need. `type` is the discriminant,
 * matching the Prisma BoardObject{type, data} column pair it persists into and the
 * Y.Map<id, BoardObject> value it syncs as.
 */

import { contrastRatio } from "./contrast.ts"
import type { TextMarks } from "./text-format.ts"

export type Note = {
  id: string
  type: "note"
  /** Top-left corner, WORLD coordinates — same space as Stroke.points. */
  x: number
  y: number
  w: number
  h: number
  /** Fill. The ink to write on it comes from STICKY_COLORS, not from the board theme. */
  color: string
  text: string
  createdAt: number // paint order; Y.Map is unordered
  /** See Stroke.z — explicit paint order, absent until the object is reordered. */
  z?: number
  /** See Stroke.locked — locked objects stay selectable so they can be unlocked. */
  locked?: boolean
  /**
   * A free-floating TEXT BOX rather than a sticky: no fill, no border, just the words.
   *
   * The Text tool produces these. It reuses Note wholesale rather than adding a third
   * member to the BoardObject union, because a text box needs exactly what a note
   * already has — an axis-aligned box, a string, the inline textarea editor, selection,
   * drag, resize, rotation, and the Y.Map round trip. A new type would have meant
   * re-deriving every one of those and a new branch in each of hitsObject,
   * objectBounds, translateObject, scaleGeometry, cloneObject and the renderer.
   *
   * ONE rule changes with it: `color` is the INK here, not the fill. A sticky derives
   * readable ink from its background via inkFor; a bare box has no background to derive
   * from, so the color the user picks is the text itself. See textBoxFor.
   *
   * ponytail: if text ever needs its own alignment, wrapping mode or rich runs, that is
   * the point to split it into its own type — not before.
   */
  bare?: boolean
  /**
   * Text size in world units. Absent means NOTE_FONT, so every note written before the
   * Text tool existed keeps its exact layout.
   */
  font?: number
  /**
   * Rotation in radians about the box's centre. x/y/w/h stay axis-aligned — an
   * axis-aligned box cannot express rotation at all, which is the clearest reason this
   * has to be a field rather than baked into the geometry.
   */
  angle?: number
} & TextMarks

/**
 * Formatting applies to the WHOLE object's text, and is spread onto both text-bearing
 * types rather than living on a shared base.
 *
 * Note and Stroke are different shapes that happen to share a string; giving them a
 * common ancestor to hold five optional booleans would be a type hierarchy invented for
 * the convenience of the toolbar rather than for anything either type is. See
 * lib/text-format.ts for why the marks are whole-object.
 */

/** Placed at a fixed size rather than dragged out — a sticky is a sticky. */
export const NOTE_SIZE = 160
export const NOTE_PADDING = 14 // world units of margin around the text
export const NOTE_FONT = 15 // world units
export const NOTE_LINE_HEIGHT = 1.35
/**
 * 3px. A sticky note is paper: a small cut-edge corner, not a moulded card. Everything
 * else in the UI rounds at 8px and up, which is what keeps board CONTENT distinct from
 * the chrome around it. Matches --radius-xs in globals.css.
 */
export const NOTE_RADIUS = 3

/**
 * Level 1 elevation (globals.css --cc-shadow-1), as canvas shadows. Canvas takes one
 * shadow per fill, so the two layers are two fills. Hover deepens both slightly — the
 * note reads as something you can pick up. Blur/offset are CSS px (see drawNote).
 */
export const NOTE_SHADOW = [
  { y: 1, blur: 3, alpha: 0.08 },
  { y: 1, blur: 2, alpha: 0.06 },
]
export const NOTE_SHADOW_HOVER = [
  { y: 3, blur: 8, alpha: 0.12 },
  { y: 1, blur: 3, alpha: 0.08 },
]

/**
 * Edge definition for a note.
 *
 * A single translucent black hairline rather than a per-theme border: every fill below
 * is light, so on the dark board the fill already separates itself and this is
 * invisible, while on #fafafa it is the only thing stopping a pale note from bleeding
 * into the background. One constant beats a second palette.
 */
export const NOTE_BORDER = "rgba(0,0,0,0.12)"

/** Default box for a placed text object. Wider than tall — text grows downward. */
export const TEXT_SIZE = { w: 240, h: 44 }

/**
 * Inset for a bare text box.
 *
 * Much smaller than NOTE_PADDING: a sticky's padding is visible margin inside a
 * coloured card, whereas here it is only grab room around the words, and 14 units of it
 * would put the text visibly off-centre from its own selection outline.
 */
export const TEXT_PADDING = 4

/** Offered in the selection panel. A short ladder beats a spinner nobody aims at. */
export const FONT_SIZES = [12, 15, 18, 24, 32, 48]

/**
 * Sticky colors, each paired with the ink to write on it.
 *
 * Ink is per-swatch and NOT THEMES[theme].stroke. A note is its own background, so
 * contrast is against the fill, not against the board — using the theme's ink would
 * put white text on pale yellow the moment somebody switched to a dark board. Every
 * pair is contrast-checked in notes.test.ts.
 */
export const STICKY_COLORS = [
  { name: "Yellow", fill: "#fde68a", ink: "#422006" },
  { name: "Orange", fill: "#fed7aa", ink: "#431407" },
  { name: "Pink", fill: "#fbcfe8", ink: "#500724" },
  { name: "Red", fill: "#fecaca", ink: "#450a0a" },
  { name: "Green", fill: "#bbf7d0", ink: "#052e16" },
  { name: "Teal", fill: "#99f6e4", ink: "#042f2e" },
  { name: "Blue", fill: "#bfdbfe", ink: "#172554" },
  { name: "Purple", fill: "#e9d5ff", ink: "#3b0764" },
  { name: "Grey", fill: "#e5e7eb", ink: "#030712" },
  { name: "White", fill: "#f8fafc", ink: "#0f172a" },
]

/**
 * The ink for a fill.
 *
 * The table wins when it has an answer — those pairs are hand-tuned and score better
 * than a two-way choice would. The fallback is computed rather than a fixed near-black,
 * so a fill that never reaches this table (a future swatch, a synced note from another
 * client) still gets ink that can actually be read on it.
 */
export function inkFor(fill: string) {
  const paired = STICKY_COLORS.find((c) => c.fill.toLowerCase() === fill.toLowerCase())
  if (paired) return paired.ink
  return contrastRatio("#171717", fill) >= contrastRatio("#fafafa", fill)
    ? "#171717"
    : "#fafafa"
}

/**
 * The box shape every axis-aligned board object shares. Structural, not `Note`: an
 * ImageObject has the same x/y/w/h and none of Note's text fields, and passing one to
 * these functions has to type-check without a cast.
 */
type Box2D = { x: number; y: number; w: number; h: number }

export function noteBounds(n: Box2D) {
  return { minX: n.x, minY: n.y, maxX: n.x + n.w, maxY: n.y + n.h }
}

/** Rect hit test, outset by `slop` so a note is as forgiving to grab as a stroke. */
export function hitsNote(n: Box2D, x: number, y: number, slop: number) {
  return (
    x >= n.x - slop && x <= n.x + n.w + slop && y >= n.y - slop && y <= n.y + n.h + slop
  )
}

/** Moves a note by (dx,dy) world units, in place — same contract as translateStroke. */
export function translateNote(n: Box2D, dx: number, dy: number) {
  n.x += dx
  n.y += dy
}

/**
 * Greedy word wrap.
 *
 * `measure` is injected rather than taking a canvas context, so this is testable
 * without a DOM and the caller stays free to change the font without changing this.
 * Explicit newlines split first: Enter in the textarea has to survive the round trip
 * to canvas, or a typed paragraph break silently disappears on blur.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  const lines: string[] = []

  for (const para of text.split("\n")) {
    if (!para) {
      lines.push("") // a blank line is deliberate whitespace, not nothing
      continue
    }
    let line = ""
    for (const word of para.split(" ")) {
      const candidate = line ? `${line} ${word}` : word
      if (line && measure(candidate) > maxWidth) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
      // A single word wider than the note has no break opportunity, so force one —
      // otherwise it runs out past the edge and gets clipped mid-word.
      while (measure(line) > maxWidth && line.length > 1) {
        let cut = line.length
        while (cut > 1 && measure(line.slice(0, cut)) > maxWidth) cut--
        lines.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    lines.push(line)
  }

  return lines
}

// The drop: a placed note lands from slightly small and soft. back.out overshoots past
// t=1 and settles, which is what makes it read as landing rather than growing.
//
// Tuned DOWN from 0.6 scale / 0.3 alpha / 0.38s. That version read as the sticky
// inflating into place — at 60% scale and 30% opacity the first frame barely looks like
// a note at all, and 380ms is long enough to watch. The brief for this pass was a slight
// overshoot at ~200ms, subtle rather than bouncy, so the travel shrank and the curve
// stayed: back.out still carries it a hair past full size and settles back, which is the
// part that reads as LANDING. Every number here is a feel judgement — change them
// together and look at a real sticky, not at the graph.
export const DROP_SCALE = 0.85 // scale at t=0
export const DROP_ALPHA = 0.6 // opacity at t=0
export const DROP_DURATION = 0.2 // seconds
export const DROP_EASE = "back.out(1.7)"

/**
 * Visual weight at drop progress t. Linear in t on purpose — the ease supplies the
 * overshoot, so t arrives here above 1 mid-flight and this must not clamp the scale or
 * the bounce is flattened out.
 */
/**
 * The exit: a deleted object shrinks slightly and fades out.
 *
 * t runs 1 -> 0 here, the opposite of the drop, because the tween is written as "go to
 * zero" and reading `t` as "how much of this object is left" keeps the draw code honest.
 *
 * Shorter and smaller-travel than the drop on purpose. An entrance can afford to be
 * noticed; an exit is confirming something you already decided, and anything longer than
 * ~150ms puts a delay between pressing Delete and the space being free. It does NOT
 * scale to zero — vanishing to a point reads as the object flying away, when what
 * happened is that it stopped existing.
 */
export const DIE_SCALE = 0.9 // scale at t=0, just before it is gone
export const DIE_DURATION = 0.15 // seconds
export const DIE_EASE = "power2.in"

export function dieStyle(t: number) {
  return { scale: DIE_SCALE + (1 - DIE_SCALE) * t, alpha: Math.max(0, t) }
}

/**
 * The lift: an object under an active drag sits slightly proud of the board.
 *
 * 2% and a soft shadow. Enough that the thing under your cursor separates from what it
 * is passing over, small enough that it does not jump on grab — the number is low
 * BECAUSE the object is already tracking the pointer, and a bigger lift reads as the
 * object slipping out from under the finger.
 */
export const LIFT_SCALE = 1.02
export const LIFT_DURATION = 0.14
export const LIFT_EASE = "power2.out"
/** Shadow blur in SCREEN px — scaled by the view before use, or it grows with zoom. */
export const LIFT_SHADOW = 18

export function liftStyle(t: number) {
  return { scale: 1 + (LIFT_SCALE - 1) * t, blur: LIFT_SHADOW * t, alpha: 0.28 * t }
}

/**
 * Where a SHAPE or ARROW starts its drop. Closer to 1 than a sticky's, because a shape is
 * drawn by dragging and is already on screen at full size under the cursor when the
 * pointer lifts — starting it at 0.85 would visibly shrink it on release before the
 * spring brings it back. A sticky has no preview, so it can afford the real travel.
 */
export const SHAPE_DROP_SCALE = 0.94

export function dropStyle(t: number, from = DROP_SCALE) {
  return {
    scale: from + (1 - from) * t,
    // Alpha does clamp: overshooting opacity is not a thing.
    alpha: Math.min(1, DROP_ALPHA + (1 - DROP_ALPHA) * t),
  }
}
