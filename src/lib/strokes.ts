// Value import, so the explicit .ts specifier is required for `node --test` to resolve
// it at runtime — the type-only import below is erased and needs none.
import { type ShapeKind, hasInterior } from "./shapes.ts"
import type { TextMarks } from "./text-format.ts"
import type { BrushKind } from "./brushes"
import type { ConnectorSide } from "./connectors"

/**
 * A freehand stroke. Immutable once finished — one author draws a stroke start to
 * finish, so the sync granularity later is Y.Map<id, Stroke> with this as an opaque
 * value, never per-point CRDT.
 */
export type Stroke = {
  id: string
  type: "stroke"
  points: number[] // flat [x0,y0,x1,y1,…] in WORLD coordinates
  color: string
  width: number // world units
  /**
   * Stylus pressure per POINT, 0..1 — one entry per x,y pair in `points`.
   *
   * Absent means uniform width, which is what every stroke drawn with a mouse, a
   * finger, or before this existed carries — so there is no migration and no
   * {variable, pressures} pair that can contradict itself. `width` stays the MAX: a
   * pressure of 1 renders at exactly `width`, which is what lets strokeBounds and
   * hitsStroke keep padding by width/2 without knowing pressure exists at all.
   *
   * A parallel array rather than x,y,p triples, deliberately. Triples would break the
   * `points.length % 2 === 0` invariant and every pair-indexed consumer there is —
   * strokePath, strokeBounds, translateStroke, scaleGeometry, hitsStroke, connectors,
   * recognize. A second array costs one lockstep rule and touches none of them.
   *
   * Only ever set on freehand ink. Anything that replaces `points` wholesale with
   * exact geometry — Alt-constrained lines, the Shapes tool, shape recognition —
   * deletes it instead of resampling, because a straight line has no taper to keep.
   */
  pressures?: number[]
  createdAt: number // paint order; Y.Map is unordered
  /**
   * Explicit paint order, overriding createdAt. See orderOf in objects.ts.
   *
   * Absent on everything until it is reordered, so an object painted in creation order
   * carries no extra state. It exists because Y.Map has no order of its own: array
   * position used to BE z-order, and that fact does not survive syncing.
   */
  z?: number
  /**
   * Set only on shapes — placed with the Shapes tool, or produced by Shift-pen
   * recognition. Its presence means the points are exact geometry and must be drawn as
   * straight segments; passing them through tracePath rounds every corner off, which is
   * a bug, not a style. See strokePath.
   */
  shape?: ShapeKind
  /**
   * In-shape label. Only ever set when `shape` is — a freehand stroke has no interior
   * to write in — which is the same optional-field-guarded-by-`shape` shape that
   * `shape` itself established. Notes carry their own required `text`.
   */
  text?: string
  /**
   * Interior fill color, or absent for no fill.
   *
   * Absence IS the off state, deliberately — a {filled, fill} pair can disagree with
   * itself, and then the renderer, the hit test and the panel each have to decide what
   * `filled: true` with no color means. One optional field cannot be inconsistent, and
   * every shape drawn before fills existed keeps its transparent interior with no
   * migration. Toggling fill off therefore forgets the color; the panel remembers it in
   * component state, which is where a UI convenience belongs.
   *
   * Only meaningful alongside a fillable `shape` — see isFillable. A pen stroke has no
   * interior, the same reason it can hold no `text`.
   */
  fill?: string
  /**
   * Which pen laid this down. Absent means "pen", so every stroke drawn before brushes
   * existed keeps rendering exactly as it did.
   */
  brush?: BrushKind
  /**
   * Pinned in place. A locked object stays SELECTABLE on purpose — otherwise the
   * context menu that unlocks it would be unreachable — but cannot be dragged, erased
   * or deleted.
   */
  locked?: boolean
  /**
   * Rotation in radians about the centre of the object's own (unrotated) bounds.
   *
   * A field, not baked into `points`, and that is deliberate. Rewriting the points of a
   * rotated rectangle would leave geometry that is no longer axis-aligned while `shape`
   * still claims "rect" — breaking the only-two-distinct-x invariant the sharp-corner
   * tests assert. It also lets the DOM text editor follow the shape with a CSS rotate,
   * which it could never do against rewritten points.
   *
   * `points` therefore always describe the UNROTATED shape. Resize, by contrast, does
   * rewrite them — see scaleGeometry.
   */
  angle?: number
  /**
   * The two shapes this connector is pinned between. Only ever set alongside
   * `shape: "connector"`, and only when the arrow was dropped ON a shape.
   *
   * Its ABSENCE is what makes an arrow dropped on empty canvas an ordinary one-time
   * shape — draggable, resizable and rotatable through the code that already exists.
   * Presence hands its geometry over to rerouteAll, which rewrites `points` from the two
   * endpoints on every frame, so the arrow follows whichever shape moves. That is also
   * why a linked connector is not itself draggable: the drag would be overwritten on the
   * next repaint. See lib/connectors.ts.
   */
  link?: { from: string; side: ConnectorSide; to: string }
  /**
   * Outline style. Absent means solid, the same absence-is-off contract `fill`, `shape`
   * and `brush` already use — so every stroke drawn before this existed stays solid with
   * no migration, and there is no {styled, style} pair that can contradict itself.
   *
   * Only the INTENT is stored. The actual dash array is derived from the width by
   * dashPattern, because a literal [6,4] looks right at width 2 and disappears at width
   * 20 — deriving it means a restyled or resized stroke keeps its dashes proportionate
   * with no extra bookkeeping.
   */
  dash?: LineStyle
  /**
   * Bow of a curved connector, as a fraction of the straight-line distance between its
   * ends. Absent means straight. Only meaningful with `shape: "connector"`.
   *
   * The curve is FLATTENED into `points` rather than held as a control point, the same
   * way ellipsePoints flattens an ellipse into 64 segments — which is what lets hit
   * testing, bounds, translation and dashing all keep working on it untouched.
   */
  curve?: number
  /**
   * Marks this shape as a COLUMN: a lane that holds cards, with a "+" at its foot that
   * adds another one.
   *
   * Set by the templates that lay columns out, because only they know which rectangle is
   * a lane and which is a card sitting inside one. Inferring it from geometry instead —
   * "a tall thin filled rect is probably a column" — would put a quick-add button on any
   * tall rectangle somebody happened to draw.
   */
  section?: boolean
  // Whole-object text formatting, shared with Note — see lib/text-format.ts. Only
  // meaningful on a shape carrying a label; a freehand stroke has no text to format.
} & TextMarks

/** Solid is the absence of one of these — see Stroke.dash. */
export type LineStyle = "dashed" | "dotted"

export const LINE_STYLES: LineStyle[] = ["dashed", "dotted"]

/**
 * The dash array for a style at a given stroke width, in world units.
 *
 * Solid returns an EMPTY array rather than null, and callers are expected to apply it
 * unconditionally: canvas keeps the dash list in its drawing state, so a dashed shape
 * leaks its pattern onto everything painted after it unless every stroke sets its own.
 *
 * Dotted is a zero-length dash, which the spec renders as a dot under a round cap — so
 * it only reads as dotted if the caller also sets lineCap to "round", which is why
 * strokePath owns cap and dash together. (If dots ever vanish on some engine, give the
 * first entry a hair of length; the round cap is what draws the dot either way.)
 */
export function dashPattern(dash: LineStyle | undefined, width: number) {
  const w = Math.max(width, MIN_DASH_WIDTH)
  if (dash === "dashed") return [w * 3, w * 2]
  if (dash === "dotted") return [0, w * 2]
  return []
}

/**
 * Floor on the width the dash scale is computed from.
 *
 * A fill-only shape has width 0 (see NO_OUTLINE), which would make every gap 0 and turn
 * the pattern back into a solid line — the one case where deriving from width needs a
 * guard rather than just multiplying.
 */
const MIN_DASH_WIDTH = 0.5

// Stroke color now comes from the board theme — see THEMES in lib/theme.ts.
// Pen width now lives in brushes.ts as BRUSHES.pen.width — one number, one owner.
// Screen px between stored samples. Also the smoothing knob you feel most: at 2px the
// quadratic segments were so short the curve hugged every residual wobble, so tracePath
// had no room to round anything off. 4px gives it that room without cutting corners.
export const MIN_POINT_DIST = 4

// Lower = smoother but laggier. 0.35 cuts high-frequency shake to ~21% of its
// amplitude; at 4px spacing that trails the cursor by ~7px, which still reads as
// attached to the pointer. Tuned by feel with a mouse — raise toward 0.5 if it lags.
export const SMOOTHING = 0.35

/**
 * One-pole low-pass filter on the incoming pointer position.
 *
 * This is what removes mouse jitter — NOT tracePath. Quadratic tracing rounds off
 * corners, but every raw sample is still a control point, so shake survives it
 * intact. Filtering has to happen on the way in.
 */
export function smoothPoint(
  prev: { x: number; y: number },
  next: { x: number; y: number },
  alpha = SMOOTHING,
) {
  return {
    x: prev.x + (next.x - prev.x) * alpha,
    y: prev.y + (next.y - prev.y) * alpha,
  }
}

// The settle: a released stroke starts wider and softer, then firms up to its final
// weight. Live strokes render at t=0, so release is continuous rather than a snap.
// Tuning knobs — the effect has to be felt, not just be present. power3.out was
// 58% done at a quarter of its duration, which read as an instant snap.
export const SETTLE_WIDTH = 0.5 // extra width at t=0, as a fraction
export const SETTLE_ALPHA = 0.4 // opacity at t=0
export const SETTLE_DURATION = 0.6 // seconds
export const SETTLE_EASE = "power2.out"

/** Visual weight at settle progress t — 0 is freshly laid down, 1 is set. */
export function settleStyle(t: number, width: number) {
  return {
    width: width * (1 + SETTLE_WIDTH * (1 - t)),
    alpha: SETTLE_ALPHA + (1 - SETTLE_ALPHA) * t,
  }
}

/** Squared distance from (px,py) to segment (ax,ay)-(bx,by). Squared: the caller
 * compares against a squared threshold, so no sqrt is needed anywhere. */
function distSqToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  // Degenerate segment (repeated sample) — fall back to point distance rather than
  // dividing by zero.
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  const cx = px - (ax + t * dx)
  const cy = py - (ay + t * dy)
  return cx * cx + cy * cy
}

/**
 * Whether (x,y) is inside a closed polygon — even-odd ray casting.
 *
 * Counts how many edges a ray cast to the right crosses; odd means inside. Handles the
 * concave shapes here (star, both arrows) correctly, which a convex-only test would
 * not. The generators repeat their first point last, so the closing edge is already in
 * the list and needs no wraparound.
 */
export function pointInPolygon(p: number[], x: number, y: number) {
  let inside = false
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const yi = p[i + 1]
    const yj = p[j + 1]
    // Strictly one endpoint above and one at-or-below, so a vertex is counted once
    // rather than twice — the classic double-count that flips the answer.
    if (yi > y !== yj > y && x < ((p[j] - p[i]) * (y - yi)) / (yj - yi) + p[i]) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Whether (x,y) lands on the stroke, within `slop` world units of its edge.
 *
 * Tests against the polyline through the raw samples, not the quadratic curve that
 * tracePath actually renders. The curve never strays further from the polyline than
 * the sample spacing (MIN_POINT_DIST), which is well inside any usable slop — so
 * paying for real curve distance would buy nothing a user could perceive.
 *
 * A FILLED shape is solid instead: it looks solid, so it has to be grabbable anywhere
 * inside, not only within slop of a 2px edge. Unfilled shapes keep the outline-only
 * test, which is what lets the Shapes tool keep nesting one inside another.
 *
 * `solid` forces that same interior test on an UNFILLED closed shape. Only the eraser
 * passes it. A sweep that runs through the middle of a hollow rectangle never comes
 * within reach of an edge, so without this the eraser slides straight through a shape
 * while deleting any pen stroke in the same gesture — ink is present along its whole
 * path, an outline is not. Selection deliberately does NOT pass it: clicking the open
 * interior of a rectangle has to keep starting a new shape, which is what makes nesting
 * possible. Lines, connectors and straight arrows are excluded by hasInterior, having
 * no inside.
 */
export function hitsStroke(
  s: Stroke,
  x: number,
  y: number,
  slop: number,
  solid = false,
) {
  const p = s.points
  if (p.length < 2) return false
  const reach = s.width / 2 + slop
  const reachSq = reach * reach

  if ((s.fill || solid) && hasInterior(s.shape, p) && pointInPolygon(p, x, y)) return true

  if (p.length === 2) {
    const dx = x - p[0]
    const dy = y - p[1]
    return dx * dx + dy * dy <= reachSq // a dot
  }
  for (let i = 0; i < p.length - 2; i += 2) {
    if (distSqToSegment(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= reachSq) return true
  }
  return false
}

/**
 * Moves a stroke by (dx,dy) world units, in place.
 *
 * In place because the draw loop holds this exact object — replacing it would mean
 * finding and swapping it in the strokes array, and re-pointing the selection, for
 * no gain. Points are flat [x,y,x,y,…], so odd indices are the ys.
 */
export function translateStroke(s: Stroke, dx: number, dy: number) {
  const p = s.points
  for (let i = 0; i < p.length; i += 2) {
    p[i] += dx
    p[i + 1] += dy
  }
}

/** World-space bounding box, outset by half the stroke width so the box contains the
 * ink rather than the centreline. */
export function strokeBounds(s: Stroke) {
  const p = s.points
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
  const pad = s.width / 2
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
}

/**
 * Straight segments through every point, without stroking.
 *
 * The counterpart to tracePath: exact geometry for placed shapes, where a corner is
 * a corner. tracePath treats each point as a curve control point, so a rectangle run
 * through it comes out with four rounded corners.
 */
export function polylinePath(ctx: CanvasRenderingContext2D, p: number[]) {
  ctx.moveTo(p[0], p[1])
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1])
}

/**
 * Paths a stroke into ctx, picking geometry and joins by kind.
 *
 * The ONE place that decides sharp versus smoothed, exported so that decision is
 * testable rather than buried in a canvas closure. `shape` being set is the whole
 * signal: without it a generated rectangle goes through tracePath and every corner
 * comes out as a quadratic — the rounded-corner regression pinned two tests below.
 * Anything that produces shape geometry (the Shapes tool, pen recognition) must set
 * Stroke.shape, and routing through here is what makes that impossible to forget
 * quietly.
 *
 * Leaves the stroking to the caller, which owns color and width.
 */
export function strokePath(ctx: CanvasRenderingContext2D, s: Stroke) {
  const sharp = Boolean(s.shape)
  // Round joins soften a corner all by themselves at any real width, so the join style
  // has to follow the geometry, not just the path function.
  //
  // Dotted overrides the cap even on a shape: its dashes are zero-length, and only a
  // round cap turns those into dots — a butt cap renders them as nothing at all. Cap and
  // dash therefore have to be decided in the same place or they disagree.
  ctx.lineCap = sharp && s.dash !== "dotted" ? "butt" : "round"
  ctx.lineJoin = sharp ? "miter" : "round"
  // Unconditional, including the empty solid case: the dash list is part of the canvas
  // drawing state, so a stroke that does not set its own inherits whatever the last one
  // left behind.
  ctx.setLineDash(dashPattern(s.dash, s.width))
  ctx.beginPath()
  if (sharp) polylinePath(ctx, s.points)
  else tracePath(ctx, s.points)
}

/**
 * Traces the path without stroking it. Quadratic segments run through the midpoints
 * between raw samples, so each sample is a control point the curve bends around
 * rather than a corner it turns on — that's what removes the polygonal look.
 */
export function tracePath(ctx: CanvasRenderingContext2D, p: number[]) {
  ctx.moveTo(p[0], p[1])
  for (let i = 2; i < p.length - 2; i += 2) {
    ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2)
  }
  ctx.lineTo(p[p.length - 2], p[p.length - 1])
}

/**
 * Width floor as a fraction of the stroke's own width, at zero pressure.
 *
 * Not 0: a stroke that tapers to literally nothing disappears at the ends, and a pen
 * that reports 0 for its whole first sample would open with an invisible segment.
 * 0.35 is light enough to read as a taper and heavy enough to stay ink.
 */
export const MIN_PRESSURE_WIDTH = 0.35

/**
 * Rendered width for one sample. Pressure 1 returns `width` unchanged — see the note on
 * Stroke.pressures for why that ceiling matters to bounds and hit testing.
 */
export function pressureWidth(width: number, pressure: number) {
  const p = Number.isFinite(pressure) ? Math.min(1, Math.max(0, pressure)) : 1
  return width * (MIN_PRESSURE_WIDTH + (1 - MIN_PRESSURE_WIDTH) * p)
}

/**
 * The stroke's pressures, or null if they cannot be trusted to line up with its points.
 *
 * A render-time guard rather than an assumption: the two arrays are maintained in
 * lockstep by the pen handlers, and a mismatch means something got out of step (a
 * truncation that forgot to delete, an object from an older build). Falling back to
 * uniform width renders it wrong; indexing past the end renders it as NaN and paints
 * nothing at all.
 */
export function pressuresOf(s: Stroke) {
  const pr = s.pressures
  return pr && pr.length === s.points.length / 2 ? pr : null
}

/**
 * Strokes a freehand path with a per-sample width.
 *
 * One stroke() per segment, because ctx.lineWidth is part of the path's paint state:
 * a single path cannot vary its own width, so a tapering line has to be laid down as
 * a run of separately-stroked pieces. Round caps are what hide the seams — each
 * segment's cap fills the joint to the next one, so the result reads as one ribbon
 * rather than a chain of dashes.
 *
 * Geometry matches tracePath exactly — same quadratic through the same midpoints, same
 * final lineTo — so turning pressure on changes a stroke's WEIGHT and never its shape.
 *
 * ponytail: N stroke() calls where a flat stroke pays 1. Fine at a stroke's worth of
 * samples; if a board full of pen strokes ever gets slow, the upgrade is to build one
 * filled outline polygon (offset both sides by the per-point half-width) and fill it
 * once, which is a real triangulation problem and not worth it until measured.
 */
export function variableWidthStroke(
  ctx: CanvasRenderingContext2D,
  p: number[],
  pressures: number[],
  width: number,
) {
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  // Dashing is the caller's job to rule out — see the note at the call site. Cleared
  // here for the same reason strokePath sets it unconditionally: it is sticky canvas
  // state, and a dashed shape painted earlier would otherwise break every segment.
  ctx.setLineDash([])

  let px = p[0]
  let py = p[1]
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2
    const my = (p[i + 1] + p[i + 3]) / 2
    // The control point IS sample i/2, so that sample's pressure is the one this
    // segment is drawn at.
    ctx.lineWidth = pressureWidth(width, pressures[i / 2])
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.quadraticCurveTo(p[i], p[i + 1], mx, my)
    ctx.stroke()
    px = mx
    py = my
  }

  // The run-out to the final sample, which tracePath also draws straight.
  ctx.lineWidth = pressureWidth(width, pressures[pressures.length - 1])
  ctx.beginPath()
  ctx.moveTo(px, py)
  ctx.lineTo(p[p.length - 2], p[p.length - 1])
  ctx.stroke()
}
