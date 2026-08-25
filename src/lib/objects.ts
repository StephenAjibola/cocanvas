import { type Stroke, hitsStroke, strokeBounds, translateStroke } from "./strokes.ts"
import {
  NOTE_FONT,
  NOTE_LINE_HEIGHT,
  NOTE_PADDING,
  TEXT_PADDING,
  type Note,
  hitsNote,
  inkFor,
  noteBounds,
  translateNote,
} from "./notes.ts"
import { readableInk } from "./contrast.ts"
import { THEMES, type Theme } from "./theme.ts"
import { type ImageObject } from "./images.ts"
import {
  type TextAlign,
  type TextMarks,
  marksOf,
  normalizeAlign,
  textIndent,
} from "./text-format.ts"

/**
 * Everything that can live on a board.
 *
 * The only module that knows about every member type — which is exactly what makes it
 * a module rather than a dumping ground. Strokes, notes and images stay unaware of one
 * another.
 *
 * Discriminated on `type`, which is also the Prisma BoardObject.type column, so an
 * object round-trips to the database as {type, data} with no translation layer.
 */
export type BoardObject = Stroke | Note | ImageObject

/** Whether an object is an axis-aligned box (Note or ImageObject) rather than a Stroke. */
function isBox(o: BoardObject): o is Note | ImageObject {
  return o.type === "note" || o.type === "image"
}

/**
 * Topmost object under (x,y), or null.
 *
 * Back to front because later objects paint over earlier ones — the one you can see is
 * the one you meant to click.
 */
export function pickObject(objects: BoardObject[], x: number, y: number, slop: number) {
  for (let i = objects.length - 1; i >= 0; i--) {
    if (hitsObject(objects[i], x, y, slop)) return objects[i]
  }
  return null
}

/**
 * Whether (x,y) lands on this object, within `slop` world units.
 *
 * Rotation is undone on the QUERY POINT rather than applied to the geometry, so every
 * existing hit test keeps working untouched — one inverse transform in one place
 * instead of rotation-awareness spread through hitsStroke and hitsNote.
 */
export function hitsObject(
  o: BoardObject,
  x: number,
  y: number,
  slop: number,
  solid = false,
) {
  const p = toLocal(o, x, y)
  return isBox(o)
    ? hitsNote(o, p.x, p.y, slop)
    : hitsStroke(o, p.x, p.y, slop, solid)
}

/**
 * Whether an object comes within `radius` of the segment from→to.
 *
 * The eraser needs the swept band, not the endpoint. Testing only where the pointer
 * happens to land means a fast drag steps clean over anything thin: a pen stroke is ink
 * along its whole length so it gets caught anyway, but a shape's hit region is a couple
 * of narrow bands at its edges, and a 60px pointer step can jump both.
 *
 * Sampled rather than solved analytically — exact segment-to-polyline distance is a lot
 * more code for a difference no hand could feel. Spacing is half the radius, so the
 * covered band is ~97% of the true one.
 *
 * Passes `solid`, so a closed shape erases from anywhere inside it rather than only
 * within reach of its outline. This function is the eraser's alone — pickObject and the
 * selection path call hitsObject directly and keep the outline-only test — so the
 * distinction lives here rather than as a flag every caller has to remember.
 */
export function hitsSweep(
  o: BoardObject,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  const steps = Math.max(1, Math.ceil((dist / radius) * 2))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = from.x + (to.x - from.x) * t
    const y = from.y + (to.y - from.y) * t
    if (hitsObject(o, x, y, radius, true)) return true
  }
  return false
}

/**
 * Whether an untrusted value is a usable BoardObject.
 *
 * Structural, not exhaustive: it checks the fields the renderer and hit tests will
 * dereference without asking first — the ones whose absence is a crash rather than a
 * cosmetic default. Optional style fields are left alone precisely because absence is
 * their meaningful state.
 *
 * Lives here rather than in the API route because both ends need it: the route validates
 * what a client sends, and the board page validates what comes back out of the database,
 * where a row written by an older version of this code is exactly as untrusted.
 */
export function isBoardObject(v: unknown): v is BoardObject {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  if (typeof o.id !== "string" || !o.id) return false
  if (typeof o.createdAt !== "number" || !Number.isFinite(o.createdAt)) return false
  if (o.z !== undefined && typeof o.z !== "number") return false

  if (o.type === "note") {
    return (
      ["x", "y", "w", "h"].every((k) => typeof o[k] === "number" && Number.isFinite(o[k]))
      && typeof o.color === "string"
      && typeof o.text === "string"
      && (o.bare === undefined || typeof o.bare === "boolean")
      // A non-positive or non-finite font would be handed straight to ctx.font and to
      // wrapText, where it lays out as either nothing or an infinite loop.
      && (o.font === undefined
        || (typeof o.font === "number" && Number.isFinite(o.font) && o.font > 0))
    )
  }
  if (o.type === "image") {
    return (
      ["x", "y", "w", "h"].every((k) => typeof o[k] === "number" && Number.isFinite(o[k]))
      && typeof o.src === "string"
      && o.src.length > 0
    )
  }
  if (o.type === "stroke") {
    // Two coordinates minimum and an even count: strokePath indexes points in pairs,
    // and an odd-length array reads undefined off the end as a coordinate.
    return (
      Array.isArray(o.points)
      && o.points.length >= 2
      && o.points.length % 2 === 0
      && o.points.every((n) => typeof n === "number" && Number.isFinite(n))
      // Pressures are optional, but a present one has to line up with the points it
      // weights — this and the Y.Map are the same untrusted door, and a short array
      // would index off the end mid-render.
      && (o.pressures === undefined
        || (Array.isArray(o.pressures)
          && o.pressures.length === o.points.length / 2
          && o.pressures.every((n) => typeof n === "number" && Number.isFinite(n))))
      && typeof o.color === "string"
      && typeof o.width === "number"
      && Number.isFinite(o.width)
    )
  }
  return false
}

/**
 * Paint order for one object. Lower paints first, so higher sits on top.
 *
 * createdAt is the default because a board that has never been reordered paints in
 * creation order and needs no extra state. `z` overrides it once something is sent to
 * front or back.
 *
 * Both are milliseconds-since-epoch scale, deliberately: a `z` derived from a
 * neighbour's createdAt has to be comparable with the objects that still have none, or
 * one reorder would fling the object past everything that was never touched.
 */
export function orderOf(o: BoardObject) {
  return o.z ?? o.createdAt
}

/** Sorts in place into paint order. Stable on ties, so equal keys keep their order. */
export function sortByOrder(objects: BoardObject[]) {
  objects.sort((a, b) => orderOf(a) - orderOf(b))
  return objects
}

/**
 * A `z` that puts `o` at the very front or back of `objects`.
 *
 * Ends only — front and back are the only reorders the UI offers, and picking a value
 * between two neighbours would need the fractional-index dance that buys nothing until
 * there is a "move up one" command to need it.
 */
export function edgeZ(objects: BoardObject[], edge: "front" | "back") {
  if (!objects.length) return Date.now()
  const keys = objects.map(orderOf)
  return edge === "front" ? Math.max(...keys) + 1 : Math.min(...keys) - 1
}

/** Rotates (x,y) about (cx,cy) by `a` radians. */
export function rotatePoint(x: number, y: number, cx: number, cy: number, a: number) {
  if (!a) return { x, y }
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dx = x - cx
  const dy = y - cy
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
}

/**
 * Raw geometry extents, WITHOUT the half-line-width that objectBounds adds.
 *
 * Resize needs this and objectBounds will not do. Mapping raw points using an
 * ink-padded box scales the padding along with them and then adds it again, so the
 * grabbed corner settles a line-width away from the pointer — visibly laggy on a thick
 * marker. Handles are placed here too, so the corner you grab is the corner that moves.
 */
export function geomBounds(o: BoardObject): Box {
  if (isBox(o)) {
    return { minX: o.x, minY: o.y, maxX: o.x + o.w, maxY: o.y + o.h }
  }
  const p = o.points
  let minX = p[0]
  let maxX = p[0]
  let minY = p[1]
  let maxY = p[1]
  for (let i = 2; i < p.length; i += 2) {
    if (p[i] < minX) minX = p[i]
    if (p[i] > maxX) maxX = p[i]
    if (p[i + 1] < minY) minY = p[i + 1]
    if (p[i + 1] > maxY) maxY = p[i + 1]
  }
  return { minX, minY, maxX, maxY }
}

/** Centre of an object's own unrotated bounds — the pivot everything rotates about. */
export function centerOf(o: BoardObject) {
  const b = objectBounds(o)
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
}

/** A world point expressed in the object's unrotated frame. */
export function toLocal(o: BoardObject, x: number, y: number) {
  if (!o.angle) return { x, y }
  const c = centerOf(o)
  return rotatePoint(x, y, c.x, c.y, -o.angle)
}

/** A point in the object's unrotated frame, expressed in world space. */
export function toWorldPoint(o: BoardObject, x: number, y: number) {
  if (!o.angle) return { x, y }
  const c = centerOf(o)
  return rotatePoint(x, y, c.x, c.y, o.angle)
}

export type HandleId = "nw" | "ne" | "se" | "sw" | "rotate"

/** Screen px. Handles hold a constant size however far you zoom. */
export const HANDLE_SIZE = 8
export const HANDLE_HIT = 11
/** How far the rotate handle floats above the top edge, in screen px. */
export const ROTATE_DIST = 24

/**
 * Handle positions in the object's UNROTATED frame.
 *
 * Local, not world: the canvas draws them inside the same rotation transform as the
 * object, so they turn with it. `rotateOffset` is passed in world units because the
 * stalk has to stay a constant length on screen at any zoom.
 */
export function handlesFor(o: BoardObject, rotateOffset: number) {
  const b = geomBounds(o)
  return {
    nw: { x: b.minX, y: b.minY },
    ne: { x: b.maxX, y: b.minY },
    se: { x: b.maxX, y: b.maxY },
    sw: { x: b.minX, y: b.maxY },
    rotate: { x: (b.minX + b.maxX) / 2, y: b.minY - rotateOffset },
  } satisfies Record<HandleId, { x: number; y: number }>
}

/** The corner diagonally opposite `h` — the fixed anchor a resize scales about. */
export const OPPOSITE: Record<Exclude<HandleId, "rotate">, Exclude<HandleId, "rotate">> = {
  nw: "se",
  ne: "sw",
  se: "nw",
  sw: "ne",
}

/**
 * The mutable geometry of an object, for history.
 *
 * One snapshot type covers resize and rotate together, so a transform gesture is a
 * single entry rather than one kind per handle.
 */
export type Geom = {
  angle?: number
  points?: number[]
  x?: number
  y?: number
  w?: number
  h?: number
}

export function readGeom(o: BoardObject): Geom {
  return isBox(o)
    ? { angle: o.angle, x: o.x, y: o.y, w: o.w, h: o.h }
    : { angle: o.angle, points: [...o.points] }
}

export function writeGeom(o: BoardObject, g: Geom) {
  o.angle = g.angle
  if (isBox(o)) {
    if (g.x !== undefined) o.x = g.x
    if (g.y !== undefined) o.y = g.y
    if (g.w !== undefined) o.w = g.w
    if (g.h !== undefined) o.h = g.h
  } else if (g.points) {
    // Length-preserving copy into the SAME array: the draw loop holds this exact
    // reference, so replacing it would leave it rendering a detached one.
    o.points.length = 0
    o.points.push(...g.points)
  }
}

/**
 * Remaps an object's geometry from one bounding box onto another, in place.
 *
 * Resize IS destructive, unlike rotation, and that is the cheaper trade: a scale factor
 * held as a field would have to be applied by hitsStroke, strokeBounds, textBoxFor,
 * eraseAt and syncEditor alike, whereas rewriting leaves every one of them untouched.
 * Stroke width deliberately does not scale — a resized box keeps its line weight.
 */
export function scaleGeometry(o: BoardObject, from: Box, to: Box) {
  const fw = from.maxX - from.minX
  const fh = from.maxY - from.minY
  // A degenerate source box has no scale to derive; leave the geometry alone rather
  // than divide by zero and blow every coordinate to NaN.
  if (fw === 0 || fh === 0) return
  const sx = (to.maxX - to.minX) / fw
  const sy = (to.maxY - to.minY) / fh

  if (isBox(o)) {
    o.x = to.minX
    o.y = to.minY
    o.w = to.maxX - to.minX
    o.h = to.maxY - to.minY
    return
  }
  const p = o.points
  for (let i = 0; i < p.length; i += 2) {
    p[i] = to.minX + (p[i] - from.minX) * sx
    p[i + 1] = to.minY + (p[i + 1] - from.minY) * sy
  }
}

export type Box = { minX: number; minY: number; maxX: number; maxY: number }

/**
 * The object's own bounding box, UNROTATED.
 *
 * Everything downstream — text layout, handle placement, the selection outline, the
 * clip region — works in this local frame and is drawn inside the rotation transform,
 * so none of them need to know about `angle` at all.
 */
export function objectBounds(o: BoardObject) {
  return isBox(o) ? noteBounds(o) : strokeBounds(o)
}

/**
 * The axis-aligned box the object actually OCCUPIES on screen, rotation included.
 *
 * objectBounds is the unrotated box, which is the right answer for text layout, handles
 * and the selection outline — all of which are drawn inside the rotation transform. It
 * is the wrong answer for alignment guides, which are compared against other objects in
 * world space: a rotated square lined up by its unrotated box snaps to an edge that is
 * nowhere near the edge you can see.
 *
 * Unrotated objects take the early return, so the common case costs one property check.
 */
export function visualBounds(o: BoardObject): Box {
  const b = objectBounds(o)
  if (!o.angle) return b

  const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
  const corners = [
    [b.minX, b.minY],
    [b.maxX, b.minY],
    [b.maxX, b.maxY],
    [b.minX, b.maxY],
  ].map(([x, y]) => rotatePoint(x, y, c.x, c.y, o.angle!))

  return {
    minX: Math.min(...corners.map((p) => p.x)),
    minY: Math.min(...corners.map((p) => p.y)),
    maxX: Math.max(...corners.map((p) => p.x)),
    maxY: Math.max(...corners.map((p) => p.y)),
  }
}

/** Moves an object by (dx,dy) world units, in place. */
export function translateObject(o: BoardObject, dx: number, dy: number) {
  if (isBox(o)) translateNote(o, dx, dy)
  else translateStroke(o, dx, dy)
}

/**
 * An independent copy, shifted by (dx,dy).
 *
 * New id and createdAt: the id because two objects sharing one would break selection,
 * history and the eventual Y.Map key, and createdAt because a copy is a new thing —
 * it also re-seeds the brush grain, so a duplicated pencil stroke does not wear the
 * identical texture as its original.
 */
export function cloneObject(o: BoardObject, dx: number, dy: number): BoardObject {
  const copy = structuredClone(o)
  copy.id = crypto.randomUUID()
  copy.createdAt = Date.now()
  translateObject(copy, dx, dy)
  return copy
}

/** How far a duplicate or a keyboard paste lands from its original, in world units. */
export const PASTE_OFFSET = 16

/** Shape labels. World units, like everything else on the board. */
export const LABEL_FONT = 14
export const LABEL_LINE_HEIGHT = 1.3
/** Inset from the shape's bounds, so a label never touches its own outline. */
export const LABEL_PAD = 8
/**
 * Floor on a label's width.
 *
 * A perfectly horizontal line has a zero-height bounding box and a vertical one has
 * zero width. Without a floor wrapText would be handed maxWidth ≈ 0 and hard-break
 * every single character into its own line.
 */
export const LABEL_MIN = 24
/** Shared by the canvas and the editing textarea, so the two lay text out identically. */
export const TEXT_FONT_FAMILY = "ui-sans-serif, system-ui, sans-serif"

/** Where an object's text goes, and how it should look. */
export type TextBox = {
  x: number
  y: number
  w: number
  h: number
  font: number
  lineHeight: number
  ink: string
  align: TextAlign
  valign: "top" | "middle"
  /**
   * The object's whole-object marks, carried through so the canvas painter and the
   * editing textarea format from the SAME derivation they already share for position,
   * size and ink. Deriving them separately is how bold text ends up reflowing the
   * instant you blur.
   */
  marks: TextMarks
  /** Left offset for the bullet column, already folded out of `w`. */
  indent: number
}

/**
 * Whether this object can hold text at all — freehand strokes cannot, and neither can
 * an image. A type predicate, not just a boolean: textBoxFor and pickLabelTarget both
 * narrow on it and then go on to read `.text`/`.fill`, which ImageObject has neither of.
 */
export function isLabelable(o: BoardObject): o is Note | Stroke {
  return o.type === "note" || (o.type === "stroke" && Boolean(o.shape))
}

/** An object's current text, normalized — a labelable shape may not have one yet. */
export function textOf(o: BoardObject) {
  return o.type === "note" ? o.text : o.type === "stroke" ? (o.text ?? "") : ""
}

/**
 * The text box for an object, or null if it cannot hold text.
 *
 * One source of truth for both renderers: the canvas paints from this, and the editing
 * textarea is positioned from it. Deriving them separately is how a label ends up
 * jumping the moment you blur.
 *
 * Notes get their padded top-left box. Shapes get a centred box inset from their
 * bounds — wrapping to the bounding box even for a circle or triangle, which overflows
 * the outline a little at the corners and is the accepted simplification for now.
 */
export function textBoxFor(o: BoardObject, theme: Theme): TextBox | null {
  if (!isLabelable(o)) return null
  const t = THEMES[theme]

  if (o.type === "note") {
    const pad = o.bare ? TEXT_PADDING : NOTE_PADDING
    const font = o.font ?? NOTE_FONT
    const marks = marksOf(o)
    return {
      x: o.x + pad,
      y: o.y + pad,
      w: o.w - pad * 2,
      h: o.h - pad * 2,
      font,
      lineHeight: font * NOTE_LINE_HEIGHT,
      // The one rule that flips with `bare` — see the note on Note.bare. A sticky
      // derives readable ink from its own fill; a text box has no fill, so the chosen
      // color IS the ink.
      ink: o.bare ? o.color : inkFor(o.color),
      // The object's own alignment wins; a note that has never been aligned keeps the
      // left it always had.
      align: normalizeAlign(o.align, "left"),
      valign: "top",
      marks,
      indent: textIndent(font, marks),
    }
  }

  const marks = marksOf(o)
  const b = strokeBounds(o)
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  const w = Math.max(b.maxX - b.minX - LABEL_PAD * 2, LABEL_MIN)
  const h = Math.max(b.maxY - b.minY - LABEL_PAD * 2, LABEL_FONT * LABEL_LINE_HEIGHT)
  return {
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h,
    font: LABEL_FONT,
    lineHeight: LABEL_FONT * LABEL_LINE_HEIGHT,
    // Contrast is measured against whatever the label actually sits on: the shape's
    // fill when it has one, the BOARD when it doesn't. The shape's own color is
    // preferred because it reads as cohesive, but the free color picker can reach
    // near-black on a dark board, and that has to fall back rather than paint
    // invisible text. The fallback follows the same split — the theme's ink is only
    // known to work on the theme's background, so a filled shape borrows inkFor, which
    // computes readable ink for an arbitrary fill and is what sticky notes already use.
    ink: o.fill
      ? readableInk(o.color, o.fill, inkFor(o.fill))
      : readableInk(o.color, t.bg, t.stroke),
    // A label has always been centred, so that stays its default — but an explicit
    // choice overrides it, same as on a note.
    align: normalizeAlign(o.align, "center"),
    valign: "middle",
    marks,
    indent: textIndent(LABEL_FONT, marks),
  }
}

/**
 * Topmost object whose text a double-click should open.
 *
 * Deliberately more forgiving than pickObject: a shape is hit anywhere inside its
 * bounding box, not only within grab tolerance of its outline. Labelling should not
 * mean hunting for a 2px edge. Selection still uses pickObject, so this asymmetry
 * costs nothing elsewhere — and clicking a shape's open interior with the Shapes tool
 * armed must keep starting a NEW shape, which is what makes nesting possible.
 */
export function pickLabelTarget(objects: BoardObject[], x: number, y: number) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i]
    if (!isLabelable(o)) continue
    if (o.type === "note") {
      if (hitsNote(o, x, y, 0)) return o
      continue
    }
    const b = strokeBounds(o)
    if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) return o
  }
  return null
}
