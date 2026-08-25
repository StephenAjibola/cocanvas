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

export const SHAPE_KINDS: PlacedShape[] = [
  "line",
  "rect",
  "ellipse",
  "triangle",
  "diamond",
  "rightTriangle",
  "parallelogram",
  "star",
  "arrow",
  "doubleArrow",
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
 * rather than an interior.
 */
export function isFillable(kind?: ShapeKind) {
  return Boolean(kind) && kind !== "line" && kind !== "connector"
}

/** Slant of a parallelogram's top edge, as a fraction of its width. */
const PARALLELOGRAM_SLANT = 0.25
/** Classic 5-point star: inner radius over outer. */
const STAR_INNER = 0.382
/** Arrow head length and shaft half-height, as fractions of the box. */
const ARROW_HEAD = 0.3
const ARROW_SHAFT = 0.16

/** Head length as a fraction of the arrow's total length, and its ceiling in world units. */
const SOLID_HEAD_RATIO = 0.34
const SOLID_HEAD_MAX = 56
/** Half-width of the head triangle, as a fraction of head length. */
const SOLID_HEAD_HALF = 0.62
/** Half-height of the shaft, as a fraction of the head's half-width. Bold, flat, blunt. */
const SOLID_SHAFT_RATIO = 0.4

/**
 * A SOLID arrow from one point to another, as a closed polygon: a thick rectangular
 * shaft running into a triangular head.
 *
 * Replaces a box-aligned block arrow that could only ever point left or right — its head
 * sat at the bounding box's edge, so dragging diagonally produced a horizontal arrow
 * inside a diagonal box. That made it useless for anything joining two arbitrary points,
 * which is exactly what a mind map's branches are.
 *
 * This is oriented along the vector instead, so it points where it was drawn. Being a
 * CLOSED polygon is what lets the renderer fill it — an outlined arrow reads as a diagram
 * of an arrow rather than a mark.
 *
 * The head is capped in absolute size as well as proportionally: without the ceiling a
 * long arrow grows a head the size of a road sign.
 */
export function solidArrowPoints(x0: number, y0: number, x1: number, y1: number): number[] {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy)
  // No direction to point in. A bare segment keeps the point count even and the shape
  // degenerate-but-valid rather than filling every coordinate with NaN.
  if (len === 0) return [x0, y0, x1, y1]

  const ux = dx / len
  const uy = dy / len
  // Perpendicular, for the shaft's thickness and the head's barbs.
  const nx = -uy
  const ny = ux

  const head = Math.min(len * SOLID_HEAD_RATIO, SOLID_HEAD_MAX)
  const headHalf = head * SOLID_HEAD_HALF
  const shaftHalf = headHalf * SOLID_SHAFT_RATIO

  // Where the head meets the shaft.
  const bx = x1 - ux * head
  const by = y1 - uy * head

  return [
    x0 + nx * shaftHalf, y0 + ny * shaftHalf,
    bx + nx * shaftHalf, by + ny * shaftHalf,
    bx + nx * headHalf, by + ny * headHalf,
    x1, y1,
    bx - nx * headHalf, by - ny * headHalf,
    bx - nx * shaftHalf, by - ny * shaftHalf,
    x0 - nx * shaftHalf, y0 - ny * shaftHalf,
    // Closed: fill() needs the outline to return to where it started.
    x0 + nx * shaftHalf, y0 + ny * shaftHalf,
  ]
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

  // Directional, not box-aligned — see solidArrowPoints.
  if (kind === "arrow") return solidArrowPoints(x0, y0, x1, y1)

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
