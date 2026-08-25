/**
 * Clean shape geometry for the Shapes tool.
 *
 * Shapes are emitted as ordinary point lists, so a placed shape IS a Stroke — which
 * is what lets selection, dragging, colour, width and delete work on them with no
 * new code. Nothing here is freehand or smoothed: the points are exact from the
 * moment they are generated.
 *
 * Every generator takes the drag's two corners in world coordinates and tolerates
 * them in any order, so shapes can be drawn up-left as readily as down-right.
 */

export type ShapeKind =
  | "line"
  | "rect"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "rightTriangle"
  | "parallelogram"
  | "star"
  | "arrow"
  | "doubleArrow"
  /**
   * An arrow between two points, drawn from the "+" grips on a selection rather than
   * placed from the toolbar — which is why it is deliberately NOT in SHAPE_KINDS below.
   * Its geometry comes from connectorPoints, not shapePoints. See lib/connectors.ts.
   */
  | "connector"

/**
 * The kinds you can actually place with the Shapes tool.
 *
 * Excluding the connector at the TYPE level rather than by convention is what keeps the
 * toolbar's exhaustive icon and label records honest — they still fail to compile if a
 * new placeable shape arrives without an icon, and they no longer demand one for a shape
 * the picker never shows. It also stops a connector reaching shapePoints, whose final
 * fallthrough would otherwise hand it back a double arrow.
 */
export type PlacedShape = Exclude<ShapeKind, "connector">

/**
 * The kinds the Shapes PICKER offers.
 *
 * Arrow is deliberately absent, and so is the double arrow. An arrow is not a shape here
 * — it is a straight-line connector with a painted head, placed by its own tool, so
 * offering it beside rectangle and star would file it under the wrong idea and give it
 * shape semantics (a bounding box, a fill) that a line does not have. `arrow` stays in
 * ShapeKind because objects already on boards carry it; only the picker loses it.
 */
export const SHAPE_KINDS: PlacedShape[] = [
  "line",
  "rect",
  "ellipse",
  "triangle",
  "diamond",
  "rightTriangle",
  "parallelogram",
  "star",
]

/**
 * Whether this shape has an interior that can be filled.
 *
 * A freehand stroke has no `shape` at all and a line has no inside, so both are out.
 * Everything else here — including the block arrows and the star — is emitted as a
 * closed outline whose last point repeats its first, which is exactly what canvas
 * fill() needs. Shift-pen recognition produces rect and ellipse, so those become
 * fillable for free.
 *
 * A connector is out for the same reason a line is, and more sharply: its points retrace
 * their own tip to express an arrowhead, so filling them paints a triangle of garbage
 * rather than an interior. An arrow is out because it IS a line — offering a fill on one
 * would put a control in the property panel that cannot do anything. The LEGACY block
 * arrows still on boards are filled by the renderer on their geometry rather than through
 * here; see isBlockArrow.
 */
export function isFillable(kind?: ShapeKind) {
  return Boolean(kind) && kind !== "line" && kind !== "connector" && kind !== "arrow"
}

/** Slant of a parallelogram's top edge, as a fraction of its width. */
const PARALLELOGRAM_SLANT = 0.25
/** Classic 5-point star: inner radius over outer. */
const STAR_INNER = 0.382
/** Arrow head length and shaft half-height, as fractions of the box. */
const ARROW_HEAD = 0.3
const ARROW_SHAFT = 0.16

/**
 * Head length in world units, its cap as a fraction of the whole run, and its half-width
 * as a fraction of its length.
 *
 * The cap is what stops a short arrow becoming a pure arrowhead with no visible shaft.
 */
const HEAD_LEN = 16
const HEAD_MAX_RATIO = 0.4
const HEAD_HALF = 0.42

/**
 * The three corners of a straight arrow's head, in world units.
 *
 * An arrow's `points` are only its two endpoints — the same four numbers a line carries
 * — because that is what makes it behave like a line everywhere that matters: bounds,
 * hit testing, translate, scale and rotate all read `points` and need no idea an arrow
 * exists. The head is painted from those endpoints at draw time instead.
 *
 * The trade is honest and small: bounds are the shaft's, so they miss the head's outer
 * corners by up to HEAD_LEN. Nobody grabs an arrow by the tip of its head, and the
 * alternative — baking the head into the geometry, as the old block arrow did — is what
 * made an arrow a shape rather than a line in the first place.
 *
 * Returns null for a zero-length drag: there is no direction to point in, and every
 * coordinate would come back NaN.
 */
export function arrowHead(x0: number, y0: number, x1: number, y1: number) {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy)
  if (len === 0) return null

  const ux = dx / len
  const uy = dy / len
  // Perpendicular, for the two base corners.
  const nx = -uy
  const ny = ux

  const head = Math.min(HEAD_LEN, len * HEAD_MAX_RATIO)
  const half = head * HEAD_HALF
  // Where the head's base sits on the shaft.
  const bx = x1 - ux * head
  const by = y1 - uy * head

  return {
    tip: { x: x1, y: y1 },
    left: { x: bx + nx * half, y: by + ny * half },
    right: { x: bx - nx * half, y: by - ny * half },
  }
}

/**
 * Whether this stroke carries the OLD block-arrow geometry — a closed polygon outlining
 * a shaft and head — rather than the two endpoints a straight arrow uses now.
 *
 * Boards seeded before the arrow became a line tool still hold those polygons, and they
 * have to keep painting as the solid marks they were drawn as. Two endpoints is four
 * numbers; anything longer is the old form.
 */
export function isBlockArrow(kind: ShapeKind | undefined, points: number[]) {
  return (kind === "arrow" || kind === "doubleArrow") && points.length > 4
}

/**
 * Whether this object encloses an area — the question fills, the fill control, and
 * interior hit-testing all actually want.
 *
 * isFillable answers from the KIND alone, which is the right answer for a tool arming a
 * shape but the wrong one for an object already on a board: "arrow" now means a line,
 * yet boards still hold block-arrow polygons under that same kind. Asking the geometry
 * as well is what keeps a legacy arrow clickable in its middle and recolourable, while a
 * straight arrow correctly offers neither.
 */
export function hasInterior(kind: ShapeKind | undefined, points: number[]) {
  return isBlockArrow(kind, points) || isFillable(kind)
}


/** Enough segments that the polygon reads as a curve at any usable zoom. */
const ELLIPSE_SEGMENTS = 64

function box(x0: number, y0: number, x1: number, y1: number) {
  return {
    minX: Math.min(x0, x1),
    minY: Math.min(y0, y1),
    maxX: Math.max(x0, x1),
    maxY: Math.max(y0, y1),
  }
}

function ellipsePoints(cx: number, cy: number, rx: number, ry: number) {
  const out: number[] = []
  for (let i = 0; i < ELLIPSE_SEGMENTS; i++) {
    const t = (i / ELLIPSE_SEGMENTS) * Math.PI * 2
    out.push(cx + rx * Math.cos(t), cy + ry * Math.sin(t))
  }
  // Copied rather than computed at t=2π: sin(2π) is -2.4e-16, not 0, which would
  // leave the loop a hair open and show as a seam on a thick stroke.
  out.push(out[0], out[1])
  return out
}

/**
 * The shape a drag from (x0,y0) to (x1,y1) should produce.
 *
 * A line runs anchor→cursor rather than across the bounding box, so it can point in
 * any of the four diagonal directions; every other shape is inscribed in the box.
 */
export function shapePoints(
  kind: PlacedShape,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number[] {
  if (kind === "line") return [x0, y0, x1, y1]

  const b = box(x0, y0, x1, y1)

  if (kind === "rect") {
    return [
      b.minX, b.minY,
      b.maxX, b.minY,
      b.maxX, b.maxY,
      b.minX, b.maxY,
      b.minX, b.minY,
    ]
  }

  if (kind === "ellipse") {
    const rx = (b.maxX - b.minX) / 2
    const ry = (b.maxY - b.minY) / 2
    return ellipsePoints(b.minX + rx, b.minY + ry, rx, ry)
  }

  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2

  if (kind === "triangle") {
    // Isoceles, apex at top centre — the orientation people expect from "triangle".
    return [cx, b.minY, b.maxX, b.maxY, b.minX, b.maxY, cx, b.minY]
  }

  if (kind === "diamond") {
    return [cx, b.minY, b.maxX, cy, cx, b.maxY, b.minX, cy, cx, b.minY]
  }

  if (kind === "rightTriangle") {
    // Right angle at the bottom-left, legs on the box edges.
    return [b.minX, b.minY, b.maxX, b.maxY, b.minX, b.maxY, b.minX, b.minY]
  }

  if (kind === "parallelogram") {
    const slant = w * PARALLELOGRAM_SLANT
    return [
      b.minX + slant, b.minY,
      b.maxX, b.minY,
      b.maxX - slant, b.maxY,
      b.minX, b.maxY,
      b.minX + slant, b.minY,
    ]
  }

  if (kind === "star") {
    const rx = w / 2
    const ry = h / 2
    const out: number[] = []
    // Ten vertices alternating outer and inner, starting at the top so the star
    // stands upright rather than resting on a point.
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5
      const r = i % 2 === 0 ? 1 : STAR_INNER
      out.push(cx + rx * r * Math.cos(angle), cy + ry * r * Math.sin(angle))
    }
    out.push(out[0], out[1])
    return out
  }

  // Block arrows, drawn as closed outlines so a single polyline can express them —
  // a shaft plus separate head strokes would need a discontinuous path.
  const head = w * ARROW_HEAD
  const shaft = h * ARROW_SHAFT

  // An arrow IS a line. Its head is painted by the renderer rather than baked into the
  // geometry, so it moves, scales, rotates and hit-tests exactly like the line it is —
  // see arrowHead.
  if (kind === "arrow") return [x0, y0, x1, y1]

  return [
    b.minX, cy,
    b.minX + head, b.minY,
    b.minX + head, cy - shaft,
    b.maxX - head, cy - shaft,
    b.maxX - head, b.minY,
    b.maxX, cy,
    b.maxX - head, b.maxY,
    b.maxX - head, cy + shaft,
    b.minX + head, cy + shaft,
    b.minX + head, b.maxY,
    b.minX, cy,
  ]
}
