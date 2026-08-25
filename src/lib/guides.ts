/**
 * Alignment ("smart") guides: the nudge that makes a dragged object line up with the
 * ones already on the board, plus the lines drawn to show why it moved.
 *
 * Pure geometry, no canvas and no React — the same split every other lib here uses, and
 * the reason this can be tested without a DOM. BoardCanvas calls `computeSnap` once per
 * drag frame with the dragged object's bounds and its neighbours', applies the returned
 * offset, and paints the returned guides as screen furniture.
 *
 * Distinct from the 15° angle snap in recognize.ts, which straightens a freehand stroke
 * at the moment it is drawn. That one is about the SHAPE of one object; this one is about
 * the POSITION of one object relative to others. They never contend: recognition happens
 * on pointerup of a draw gesture, alignment on pointermove of a drag gesture.
 */

import type { Box } from "./objects.ts"

/**
 * One alignment line to draw.
 *
 * `at` is the world coordinate of the line on its own axis — an "x" guide is vertical,
 * sitting at that x. `from`/`to` bound it on the other axis, so the line spans exactly
 * the objects that justify it instead of running off the screen: a guide you can trace
 * to both ends tells you WHICH object you aligned to, which is the whole point of
 * drawing it rather than just snapping silently.
 */
export type Guide = { axis: "x" | "y"; at: number; from: number; to: number }

/** The offset to apply to the dragged object, plus the lines that explain it. */
export type SnapResult = { dx: number; dy: number; guides: Guide[] }

/**
 * The three alignments worth offering per axis: near edge, centre, far edge.
 *
 * Edge-to-opposite-edge (a box's right against another's left) is deliberately absent.
 * It reads as "touching", not "aligned", and offering it means a drag near any object
 * gets grabbed by an edge it was only passing. Six candidates per axis instead of three
 * also roughly doubles the chance of a fight between two near-equal snaps.
 */
const LANES = [
  (b: Box, axis: "x" | "y") => (axis === "x" ? b.minX : b.minY),
  (b: Box, axis: "x" | "y") => (axis === "x" ? (b.minX + b.maxX) / 2 : (b.minY + b.maxY) / 2),
  (b: Box, axis: "x" | "y") => (axis === "x" ? b.maxX : b.maxY),
]

/** The span of `b` on the axis a guide is NOT sitting on — an "x" guide spans y. */
function span(b: Box, axis: "x" | "y") {
  return axis === "x" ? [b.minY, b.maxY] : [b.minX, b.maxX]
}

/**
 * The best alignment for one axis, or null if nothing is within `tolerance`.
 *
 * Ties go to the FIRST candidate found, which given LANES' order means a near-edge
 * alignment beats a centre one at equal distance. That is the stable choice: edges are
 * what people line up deliberately, and an unstable tiebreak makes the guide flicker
 * between two lines while the pointer sits still.
 */
function bestFor(moving: Box, others: Box[], axis: "x" | "y", tolerance: number) {
  let best: { delta: number; at: number; guides: Guide[] } | null = null

  for (const lane of LANES) {
    const mine = lane(moving, axis)
    for (const other of others) {
      for (const otherLane of LANES) {
        const theirs = otherLane(other, axis)
        const delta = theirs - mine
        if (Math.abs(delta) > tolerance) continue
        // Strictly better only — equal distance keeps the earlier candidate, per the
        // tiebreak note above.
        if (best && Math.abs(delta) >= Math.abs(best.delta)) {
          // Same line, different neighbour: extend the existing guide to cover it rather
          // than dropping it, so aligning three objects draws one line through all three.
          if (best.at === theirs) best.guides.push(guideFor(moving, other, axis, theirs))
          continue
        }
        best = { delta, at: theirs, guides: [guideFor(moving, other, axis, theirs)] }
      }
    }
  }
  return best
}

/** The drawn extent of one guide: both boxes' spans, unioned. */
function guideFor(moving: Box, other: Box, axis: "x" | "y", at: number): Guide {
  // The moving box's LIVE span is right here, unadjusted: the snap delta applies to the
  // axis the guide sits on, never to the one it spans. An "x" guide is nudged in x and
  // spans y, and the object's y has already followed the pointer.
  const [mFrom, mTo] = span(moving, axis)
  const [oFrom, oTo] = span(other, axis)
  return { axis, at, from: Math.min(mFrom, oFrom), to: Math.max(mTo, oTo) }
}

/**
 * Snap `moving` to its neighbours, within `tolerance` WORLD units.
 *
 * Tolerance is world, not screen, so the caller divides its pixel threshold by the zoom
 * scale — that keeps the grab radius a constant number of screen pixels at every zoom
 * level, which is how it feels right when zoomed way in or way out.
 *
 * Both axes are resolved independently: an object can be centred horizontally on one
 * neighbour while its top edge lines up with a different one, and both guides show.
 */
export function computeSnap(moving: Box, others: Box[], tolerance: number): SnapResult {
  if (tolerance <= 0 || !others.length) return { dx: 0, dy: 0, guides: [] }

  const x = bestFor(moving, others, "x", tolerance)
  const y = bestFor(moving, others, "y", tolerance)

  return {
    dx: x?.delta ?? 0,
    dy: y?.delta ?? 0,
    guides: [...(x?.guides ?? []), ...(y?.guides ?? [])],
  }
}
