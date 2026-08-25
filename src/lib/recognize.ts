import { type ShapeKind, shapePoints } from "./shapes.ts"

/**
 * Shape recognition for Shift-held pen strokes.
 *
 * Additive to the Shapes tool, never a replacement: this only ever runs on a freehand
 * stroke that has no `shape` yet, and it produces its geometry by calling the very same
 * shapePoints() the Shapes tool uses. A recognized rectangle is therefore identical to a
 * placed one, down to the point order.
 *
 * Returning a ShapeKind is not incidental — it is what the caller writes to Stroke.shape,
 * and Stroke.shape is what routes rendering through polylinePath instead of tracePath.
 * A recognizer that returned only points would silently reintroduce the rounded-corner
 * regression pinned in strokes.test.ts.
 *
 * Everything here is scale-invariant: errors are normalized by the stroke's own size, so
 * a shape drawn zoomed out is judged the same as one drawn zoomed in.
 */

export type Recognized = { kind: ShapeKind; points: number[] }

// Tuned against the fixtures in recognize.test.ts rather than derived — the honest
// description of every constant in this file.
/** Max deviation from the chord, as a fraction of chord length. */
export const LINE_TOL = 0.07
/** chord/pathLength. A straight stroke is ~1; anything that loops or doubles back is far
 * below, which is what stops a circle being read as a line through its own diameter. */
export const LINE_DIRECTNESS = 0.8
/** first→last gap over path length, below which a stroke counts as a closed loop. */
export const CLOSE_TOL = 0.2
/**
 * Mean |radius/expected − 1| over the fitted ellipse.
 *
 * Both this and RECT_TOL are admission gates only. The winner is chosen by comparing
 * the raw errors, so these can be generous without one shape stealing the other.
 */
export const ELLIPSE_TOL = 0.14
/**
 * Mean distance to the bbox outline, over the mean semi-axis.
 *
 * Deliberately loose. The pen's EMA filter rounds every corner of a hand-drawn
 * rectangle — the faster you draw, the fewer samples it has to turn in and the rounder
 * they get — which inflates this error for paths that are unmistakably rectangles. A
 * tight gate here rejected roughly a quarter of real rectangles outright.
 */
export const RECT_TOL = 0.16
/**
 * Rect gate for a stroke that was left OPEN, i.e. one CLOSE_TOL rejects as a loop.
 *
 * People stop dead on the last corner instead of drawing back over their start, so the
 * gap is a whole side — 0.23 of the path for a 200x120, 0.33 for a square, 0.75 for a
 * tall thin one. No value of CLOSE_TOL admits those without also admitting a half
 * circle at 0.63, so an open stroke is judged on shape instead of on closure.
 *
 * Tight on purpose: a circle sits ~0.10 from its own bounding box (the same fact the
 * best-of below exists for) and an arc no better, while a rectangle missing one side
 * still measures ~0.025. Anything curved fails this long before a real rectangle does.
 */
export const OPEN_RECT_TOL = 0.06
/** How close to a bbox side a point counts as running along it, over the mean semi-axis. */
const SIDE_BAND = 0.12
/**
 * Share of the stroke that has to lie along a side before it counts as drawn.
 *
 * Bounded from both ends. Below ~0.08 an L's few stray end samples are enough to fake a
 * third side; above ~0.12 a 60x300 rectangle stops being one, because its two short
 * sides are only 14% of the path each.
 */
const SIDE_SHARE = 0.1
/** Sides an open stroke must actually trace. Three is a rect missing its closer; two is
 * an L or a V, which must keep its raw path. */
const MIN_OPEN_SIDES = 3

/** Straight lines snap to multiples of this, so 0° and 90° come free. */
export const SNAP_DEGREES = 15
/** Fewer samples than this is a flick or a dot, with nothing to fit. */
const MIN_POINTS = 4

type Box = { minX: number; minY: number; maxX: number; maxY: number }

/** Raw extent — deliberately NOT strokeBounds, which outsets by the ink width. */
function bounds(p: number[]): Box {
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

function pathLength(p: number[]) {
  let sum = 0
  for (let i = 2; i < p.length; i += 2) {
    sum += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1])
  }
  return sum
}

/** Distance to a rectangle's OUTLINE — not to the filled rectangle, which would read
 * zero everywhere inside and make a scribble look like a perfect rect. */
function distToRectOutline(x: number, y: number, b: Box) {
  const outX = Math.max(b.minX - x, 0, x - b.maxX)
  const outY = Math.max(b.minY - y, 0, y - b.maxY)
  if (outX > 0 || outY > 0) return Math.hypot(outX, outY)
  return Math.min(x - b.minX, b.maxX - x, y - b.minY, b.maxY - y)
}

/**
 * How many of the four bbox sides the path actually runs along.
 *
 * Distance to the outline alone cannot tell a rectangle missing one side from an L: both
 * sit right on the box. Counting which sides carry a real share of the stroke can.
 */
function sidesCovered(p: number[], b: Box, scale: number) {
  const band = SIDE_BAND * scale
  const need = (p.length / 2) * SIDE_SHARE
  let left = 0
  let right = 0
  let top = 0
  let bottom = 0
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] - b.minX < band) left++
    if (b.maxX - p[i] < band) right++
    if (p[i + 1] - b.minY < band) top++
    if (b.maxY - p[i + 1] < band) bottom++
  }
  return [left, right, top, bottom].filter((c) => c >= need).length
}

/**
 * The clean shape a Shift-held stroke was meant to be, or null to keep the raw path.
 *
 * Scores every candidate and takes the best fit rather than testing in sequence.
 * Ordering matters more than it looks: a circle inscribed in its own bounding box sits
 * about 0.10 from the box outline, close enough to a loose rectangle threshold that a
 * rect-first implementation would misread circles. Comparing each candidate as a
 * fraction of the budget it had to clear removes the bias entirely.
 */
export function recognizeShape(points: number[]): Recognized | null {
  const n = points.length / 2
  if (n < MIN_POINTS) return null

  const b = bounds(points)
  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  const len = pathLength(points)
  if (len === 0 || (w === 0 && h === 0)) return null

  const ax = points[0]
  const ay = points[1]
  const zx = points[points.length - 2]
  const zy = points[points.length - 1]
  // Doubles as both the line's chord and the loop's closing gap — they are the same
  // measurement read two ways, and the two branches are mutually exclusive because of it.
  const chord = Math.hypot(zx - ax, zy - ay)

  // `tol` is carried for readability at the push sites; the winner is picked on `err`.
  const candidates: { kind: ShapeKind; err: number; tol: number; points: number[] }[] = []

  if (chord > 0 && chord / len > LINE_DIRECTNESS) {
    let worst = 0
    for (let i = 0; i < points.length; i += 2) {
      // |cross(B−A, P−A)| / |B−A| — perpendicular distance to the line through the ends.
      const d =
        Math.abs((zx - ax) * (points[i + 1] - ay) - (zy - ay) * (points[i] - ax)) / chord
      if (d > worst) worst = d
    }
    const err = worst / chord
    if (err < LINE_TOL) {
      const step = (SNAP_DEGREES * Math.PI) / 180
      const snapped = Math.round(Math.atan2(zy - ay, zx - ax) / step) * step
      candidates.push({
        kind: "line",
        err,
        tol: LINE_TOL,
        // Anchored on the start and rotated to the snapped angle at the same length, so
        // the line keeps the size it was drawn at and only its direction is corrected.
        points: shapePoints(
          "line",
          ax,
          ay,
          ax + chord * Math.cos(snapped),
          ay + chord * Math.sin(snapped),
        ),
      })
    }
  }

  // An ellipse still has to be a loop — that gate is what stops an arc being inflated
  // into a full circle. A rectangle does not, and used to be rejected by it.
  const closed = chord / len < CLOSE_TOL

  if (w > 0 && h > 0) {
    const cx = (b.minX + b.maxX) / 2
    const cy = (b.minY + b.maxY) / 2
    const rx = w / 2
    const ry = h / 2

    // Normalizing by rx/ry maps any axis-aligned ellipse onto the unit circle, so one
    // threshold covers circles and stretched ellipses alike. A rotated ellipse does not
    // fit and falls through, which is correct: shapePoints cannot express one.
    let sum = 0
    for (let i = 0; i < points.length; i += 2) {
      sum += Math.abs(Math.hypot((points[i] - cx) / rx, (points[i + 1] - cy) / ry) - 1)
    }
    const ellipseErr = sum / n
    if (closed && ellipseErr < ELLIPSE_TOL) {
      candidates.push({
        kind: "ellipse",
        err: ellipseErr,
        tol: ELLIPSE_TOL,
        points: shapePoints("ellipse", b.minX, b.minY, b.maxX, b.maxY),
      })
    }

    // Proximity to the bounding box rather than literal corner-angle detection: the
    // generator only emits axis-aligned rectangles, so finding a tilted rect's corners
    // would recognize a shape that cannot then be drawn. A tilted rect fails here and
    // keeps its raw path, which is the graceful outcome.
    // Mean semi-axis, NOT min(w,h)/2: normalizing by the shorter side means a hand's
    // few units of shake are a large fraction of a thin rectangle, so a perfectly good
    // 300x24 bar scores worse than a sloppy square. Tolerance has to track the size of
    // the whole stroke. Ellipse-vs-rect separation comes from the best-of below, not
    // from this constant.
    const scale = (w + h) / 4
    let dsum = 0
    for (let i = 0; i < points.length; i += 2) {
      dsum += distToRectOutline(points[i], points[i + 1], b)
    }
    const rectErr = dsum / n / scale
    // A stroke left open has to earn it: near-perfect box fit AND three sides actually
    // traced. A closed one keeps the loose gate the pen's rounded corners need.
    // The opposite side bands must not overlap, or the test is vacuous: a straight drag
    // has a bbox a few px tall from hand shake, and every one of its points then counts
    // as lying on all four sides at once. That read a line as a perfect rectangle.
    const hasInside = Math.min(w, h) > 2 * SIDE_BAND * scale
    const passesRect = closed
      ? rectErr < RECT_TOL
      : hasInside &&
        rectErr < OPEN_RECT_TOL &&
        sidesCovered(points, b, scale) >= MIN_OPEN_SIDES
    if (passesRect) {
      candidates.push({
        kind: "rect",
        err: rectErr,
        tol: RECT_TOL,
        points: shapePoints("rect", b.minX, b.minY, b.maxX, b.maxY),
      })
    }
  }

  if (!candidates.length) return null
  // Compared directly, NOT as a fraction of each candidate's own tolerance.
  //
  // Both errors are already in the same unit — a fraction of the mean semi-axis — so
  // dividing by the tolerances compared nothing meaningful and quietly handed the win
  // to whichever candidate had the larger tolerance. That was ellipse, so a hand-drawn
  // rectangle whose corners the pen filter had rounded lost to a circle it did not
  // resemble: 1 in 4 rectangles came out as an ellipse.
  candidates.sort((p, q) => p.err - q.err)

  return { kind: candidates[0].kind, points: candidates[0].points }
}
