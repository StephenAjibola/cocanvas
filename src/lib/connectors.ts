// Value imports, so the explicit .ts specifier is required for `node --test` to
// resolve them at runtime — the type-only imports are erased and need none.
import { type BoardObject, geomBounds, objectBounds, toWorldPoint } from "./objects.ts"
import type { Stroke } from "./strokes"

/**
 * Arrows between shapes, drawn from the "+" grips on a selection.
 *
 * A connector IS a Stroke with `shape: "connector"` — its arrowhead is baked into
 * `points` rather than painted by the renderer, which is what lets hitsStroke,
 * strokeBounds, translateStroke and scaleGeometry all handle it with no new code. A
 * renderer-side head would have to be duplicated in the hit test and the bounds too.
 *
 * `link` is what separates the two halves of the feature: a connector dropped on empty
 * canvas has none and is an ordinary one-time arrow, draggable like any other shape. One
 * dropped ON a shape carries a link and is driven by its endpoints from then on — see
 * rerouteAll.
 */

/** Which edge of a shape a connector leaves from. */
export type ConnectorSide = "n" | "e" | "s" | "w"

export const CONNECTOR_SIDES: ConnectorSide[] = ["n", "e", "s", "w"]

/**
 * How far a "+" grip floats outside the bounding box, in screen px.
 *
 * Deliberately well inside ROTATE_DIST (24): the north grip and the rotate grip share
 * the top-centre line, and they have to stay far enough apart that both are reachable.
 * hitConnectorSide is tested BEFORE hitHandle, so the "+" wins the overlapping band and
 * the rotate grip keeps its own centre.
 */
export const CONNECT_DIST = 10
/** Screen px. Matches HANDLE_HIT, so every grip on the selection grabs alike. */
export const CONNECT_HIT = 11
/** Screen px radius of the drawn "+" grip. */
export const CONNECT_SIZE = 7

/** Arrowhead length in world units, and its half-angle off the shaft. */
const HEAD_LEN = 12
const HEAD_ANGLE = Math.PI / 7
/**
 * Cap on the head as a fraction of the whole run.
 *
 * Without it a connector shorter than HEAD_LEN comes out as a pure arrowhead with the
 * barbs reaching back past its own tail, which reads as a scribble rather than an arrow.
 */
const HEAD_MAX = 1 / 3

/**
 * Grip positions in the object's UNROTATED frame, `offset` world units outside its box.
 *
 * Local like handlesFor, and for the same reason: the canvas draws them inside the
 * object's own rotation transform, so they turn with it for free.
 */
export function connectorSidesFor(o: BoardObject, offset: number) {
  const b = geomBounds(o)
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  return {
    n: { x: cx, y: b.minY - offset },
    e: { x: b.maxX + offset, y: cy },
    s: { x: cx, y: b.maxY + offset },
    w: { x: b.minX - offset, y: cy },
  } satisfies Record<ConnectorSide, { x: number; y: number }>
}

/** Default bow for a curved connector, as a fraction of the straight-line distance. */
export const DEFAULT_CURVE = 0.22
/**
 * Flattening resolution for a curved shaft.
 *
 * Same trade ellipsePoints makes at 64: enough segments that it reads as a curve at any
 * usable zoom, and flattening is what keeps hit testing, bounds and dashing working on
 * it with no curve-aware code anywhere.
 */
const CURVE_SEGMENTS = 24

/** Point on the quadratic through p0 → control → p1 at parameter t. */
function quadAt(t: number, p0: number, c: number, p1: number) {
  const u = 1 - t
  return u * u * p0 + 2 * u * t * c + t * t * p1
}

/**
 * The arrow from (x0,y0) to (x1,y1), as one open polyline.
 *
 * shaft → tip → barb → back to tip → the other barb. Retracing the tip is what lets a
 * single polyline express a shape that is really three segments; with butt caps and
 * miter joins — which strokePath already selects for anything carrying `shape` — the
 * doubled-back segment paints exactly over itself and is invisible.
 *
 * `curve` bows the shaft into a quadratic, flattened into the same flat point list. Its
 * control point is placed automatically: perpendicular to the chord at its midpoint,
 * `curve` × the chord length away. One number, no handle to drag — see the note on
 * Stroke.curve.
 */
export function connectorPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  curve?: number,
): number[] {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy)
  // Degenerate drag: no direction to point in, so emit the bare shaft rather than
  // dividing by zero and sending every barb to NaN.
  if (len === 0) return [x0, y0, x1, y1]

  const shaft: number[] = []
  // The direction the head points along. For a straight arrow that is the chord; for a
  // curved one it is the curve's TANGENT at the tip, which for a quadratic is simply
  // (end − control). Using the chord on a bowed curve aims the barbs visibly off-line.
  let a: number

  if (curve) {
    // Perpendicular to the chord, so the bow is symmetric about the midpoint.
    const cx = (x0 + x1) / 2 - dy * curve
    const cy = (y0 + y1) / 2 + dx * curve
    for (let i = 0; i <= CURVE_SEGMENTS; i++) {
      const t = i / CURVE_SEGMENTS
      shaft.push(quadAt(t, x0, cx, x1), quadAt(t, y0, cy, y1))
    }
    a = Math.atan2(y1 - cy, x1 - cx)
  } else {
    shaft.push(x0, y0, x1, y1)
    a = Math.atan2(dy, dx)
  }

  const head = Math.min(HEAD_LEN, len * HEAD_MAX)
  const barb = (sign: number) => [
    x1 - head * Math.cos(a + sign * HEAD_ANGLE),
    y1 - head * Math.sin(a + sign * HEAD_ANGLE),
  ]
  return [...shaft, ...barb(1), x1, y1, ...barb(-1)]
}

/**
 * The two ends of an existing connector, recovered from its own geometry.
 *
 * The tail is always the first point and the tip always the retraced one two back from
 * the end, whether the shaft is straight or flattened from a curve — which is what lets
 * an UNLINKED connector be re-generated (to add or drop a curve) without storing its
 * endpoints a second time.
 */
export function endsOf(c: Stroke) {
  const p = c.points
  return {
    from: { x: p[0], y: p[1] },
    to: { x: p[p.length - 4], y: p[p.length - 3] },
  }
}

type Box = { minX: number; minY: number; maxX: number; maxY: number }

/**
 * Where the segment from→to first meets `box`, or `to` if it never does.
 *
 * The cheap stand-in for real edge intersection: a bounding box is a slab test in each
 * axis, where an ellipse or a star would each need their own solver. The head lands a
 * few px off the true outline on a round shape and nobody has ever noticed.
 *
 * ponytail: bbox clip, and the box is the target's UNROTATED one — so a rotated target
 * is met a few px off its true edge as well. Swap in per-shape intersection (and a
 * rotate of the segment into the target's local frame) if that starts showing; the call
 * site does not change either way.
 */
export function clipToBox(box: Box, from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  // The segment runs from outside the box to its centre, so the FIRST crossing is the
  // one on the near face — which is the edge the arrowhead should stop at.
  let best: number | null = null
  const consider = (t: number) => {
    if (t < 0 || t > 1) return
    const x = from.x + dx * t
    const y = from.y + dy * t
    // Slack, or floating point drops the very point that defined the crossing.
    const e = 1e-6
    if (x < box.minX - e || x > box.maxX + e || y < box.minY - e || y > box.maxY + e) return
    if (best === null || t < best) best = t
  }
  if (dx !== 0) {
    consider((box.minX - from.x) / dx)
    consider((box.maxX - from.x) / dx)
  }
  if (dy !== 0) {
    consider((box.minY - from.y) / dy)
    consider((box.maxY - from.y) / dy)
  }
  if (best === null) return to
  return { x: from.x + dx * best, y: from.y + dy * best }
}

/** The world-space point a connector leaves its source shape from. */
export function anchorOf(o: BoardObject, side: ConnectorSide) {
  const p = connectorSidesFor(o, 0)[side]
  return toWorldPoint(o, p.x, p.y)
}

/**
 * Rewrites one linked connector's geometry from its endpoints, in place.
 *
 * The start stays pinned to the side the "+" was dragged from — that is what the gesture
 * meant — and only the end is clipped to the target.
 *
 * ponytail: fixed side. Re-picking the nearest side per frame would stop an arrow
 * crossing back over its own shape when the target is dragged past it; add it here and
 * nothing else changes.
 */
export function routeConnector(c: Stroke, objects: BoardObject[]) {
  const link = c.link
  if (!link) return
  const from = objects.find((o) => o.id === link.from)
  const to = objects.find((o) => o.id === link.to)
  // A deleted endpoint (or one a peer removed) freezes the arrow where it is rather
  // than deleting it — which would need batched history — and it comes back to life on
  // its own if the shape is restored by an undo.
  if (!from || !to) return

  const start = anchorOf(from, link.side)
  const b = objectBounds(to)
  const centre = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
  const end = clipToBox(b, start, centre)
  const next = connectorPoints(start.x, start.y, end.x, end.y, c.curve)

  // Length-preserving copy into the SAME array, for the same reason writeGeom does it:
  // the draw loop holds this exact reference.
  c.points.length = 0
  c.points.push(...next)
}

/**
 * Re-routes every linked connector on the board.
 *
 * Called once from the draw loop, which is the whole trick: every mutation path here —
 * drag, resize, rotate, undo, redo, paste, the property panel — already ends in
 * requestDraw(), so one call site covers all of them. Hooking each mutator instead
 * would be the same fix written eight times, and the ninth would get forgotten.
 */
export function rerouteAll(objects: BoardObject[]) {
  for (const o of objects) {
    if (o.type === "stroke" && o.link) routeConnector(o, objects)
  }
}

/** Whether this object is an arrow pinned to two shapes, rather than a free one. */
export function isLinked(o: BoardObject) {
  return o.type === "stroke" && Boolean(o.link)
}

/**
 * Topmost object whose bounding box contains (x,y), skipping `exclude`.
 *
 * Deliberately more forgiving than pickObject, like pickLabelTarget: you are aiming a
 * connector at a whole shape, and having to land on its 2px outline would make the
 * gesture feel broken.
 */
export function pickConnectTarget(objects: BoardObject[], x: number, y: number, exclude: BoardObject) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i]
    if (o === exclude || isLinked(o)) continue
    const b = objectBounds(o)
    if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) return o
  }
  return null
}
