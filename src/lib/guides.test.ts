// node --test src/lib/guides.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { computeSnap } from "./guides.ts"
import type { Box } from "./objects.ts"

const box = (minX: number, minY: number, w = 100, h = 50): Box => ({
  minX,
  minY,
  maxX: minX + w,
  maxY: minY + h,
})

test("an object just off a neighbour's left edge is pulled onto it", () => {
  const anchor = box(0, 0)
  // 3 world units to the right of aligned, well inside a tolerance of 8.
  const moving = box(3, 200)
  const { dx, dy, guides } = computeSnap(moving, [anchor], 8)

  assert.equal(dx, -3, "should be pulled back onto the shared left edge")
  assert.equal(dy, 0, "nothing to align to vertically")
  assert.equal(guides.length, 1)
  assert.equal(guides[0].axis, "x")
  assert.equal(guides[0].at, 0)
})

test("nothing within tolerance means no nudge and no lines", () => {
  const { dx, dy, guides } = computeSnap(box(400, 400), [box(0, 0)], 8)
  assert.equal(dx, 0)
  assert.equal(dy, 0)
  assert.deepEqual(guides, [])
})

test("the two axes resolve independently", () => {
  // Left edge lines up with one neighbour, top edge with a DIFFERENT one. Both should
  // snap, and both should draw — this is the case a single best-match snap gets wrong.
  const left = box(0, 0)
  const top = box(500, 300)
  const moving = box(4, 297)

  const { dx, dy, guides } = computeSnap(moving, [left, top], 8)
  assert.equal(dx, -4)
  assert.equal(dy, 3)
  assert.equal(guides.length, 2)
  assert.deepEqual(
    guides.map((g) => g.axis).sort(),
    ["x", "y"],
  )
})

test("centre alignment works, not just edges", () => {
  const anchor = box(0, 0, 100, 50) // centre x = 50
  // A narrower box whose centre is 2 off the anchor's centre. Its own edges are nowhere
  // near the anchor's, so only the centre lane can produce this snap.
  const moving = { minX: 32, minY: 400, maxX: 72, maxY: 440 } // centre x = 52
  const { dx, guides } = computeSnap(moving, [anchor], 8)

  assert.equal(dx, -2)
  assert.equal(guides[0].at, 50, "the guide sits on the shared centre line")
})

test("a guide spans both objects, so you can see what you aligned to", () => {
  const anchor = box(0, 0, 100, 50) // y from 0..50
  const moving = box(2, 300, 100, 50) // y from 300..350
  const [guide] = computeSnap(moving, [anchor], 8).guides

  assert.equal(guide.axis, "x")
  assert.equal(guide.from, 0, "reaches the top of the topmost box")
  assert.equal(guide.to, 350, "reaches the bottom of the bottommost box")
})

test("three objects on one line draw one guide, not two overlapping ones", () => {
  // Two neighbours already share a left edge. Dragging a third onto it must produce a
  // single alignment, spanning all three — not a pair of identical lines fighting.
  const a = box(0, 0)
  const b = box(0, 100)
  const moving = box(3, 400)

  const { dx, guides } = computeSnap(moving, [a, b], 8)
  assert.equal(dx, -3)
  assert.ok(
    guides.every((g) => g.at === 0 && g.axis === "x"),
    "every guide is the same line",
  )
  assert.equal(Math.min(...guides.map((g) => g.from)), 0)
  assert.equal(Math.max(...guides.map((g) => g.to)), 450)
})

test("the nearest alignment wins when two are in range", () => {
  const near = box(2, 0) // 2 away
  const far = box(7, 100) // 7 away
  const { dx } = computeSnap(box(0, 400), [near, far], 8)
  assert.equal(dx, 2, "should take the 2-unit pull, not the 7-unit one")
})

test("tolerance is a hard boundary, not a suggestion", () => {
  // Exactly at the tolerance still snaps; one unit past it does not. Worth pinning
  // because an off-by-one here is invisible by eye and makes the grab radius wrong.
  assert.equal(computeSnap(box(8, 400), [box(0, 0)], 8).dx, -8)
  assert.equal(computeSnap(box(9, 400), [box(0, 0)], 8).dx, 0)
})

test("a zero or negative tolerance disables snapping entirely", () => {
  // This is how the preference toggle turns the feature off: the caller passes 0 rather
  // than branching around the call, so there is one code path, not two.
  const { dx, dy, guides } = computeSnap(box(1, 1), [box(0, 0)], 0)
  assert.equal(dx, 0)
  assert.equal(dy, 0)
  assert.deepEqual(guides, [])
})

test("an empty board offers nothing to align to", () => {
  const { dx, dy, guides } = computeSnap(box(1, 1), [], 8)
  assert.equal(dx, 0)
  assert.equal(dy, 0)
  assert.deepEqual(guides, [])
})

test("an exact alignment reports a zero delta but still draws its line", () => {
  // The object is already aligned. Snapping must not jitter it, but the guide has to
  // stay on screen — otherwise the line flickers off at the exact moment you got it right.
  const { dx, guides } = computeSnap(box(0, 300), [box(0, 0)], 8)
  assert.equal(dx, 0)
  assert.ok(guides.length > 0, "the line survives a perfect alignment")
})
