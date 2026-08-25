// node --test src/lib/solid-arrow.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { shapePoints, solidArrowPoints } from "./shapes.ts"
import { isFillable } from "./shapes.ts"


test("the arrow's tip lands exactly on the drag's end point", () => {
  // The whole promise of a directional arrow: it points where you dragged.
  for (const [x1, y1] of [[200, 0], [0, 200], [-150, -150], [120, -260]] as const) {
    const p = solidArrowPoints(0, 0, x1, y1)
    // Tip is the 4th vertex — index 6,7.
    assert.equal(p[6], x1, `tip x for ${x1},${y1}`)
    assert.equal(p[7], y1, `tip y for ${x1},${y1}`)
  }
})

test("a diagonal arrow actually points diagonally", () => {
  // The bug this replaces: the old block arrow was box-aligned, so a diagonal drag
  // produced a HORIZONTAL arrow sitting inside a diagonal bounding box. Here the tip
  // must be further along the diagonal than the tail is.
  const p = solidArrowPoints(0, 0, 300, 300)
  const tipX = p[6]
  const tipY = p[7]
  assert.ok(tipX > 200 && tipY > 200, "tip is not out along the diagonal")
  // And the head is genuinely off-axis: its two barbs differ in BOTH x and y.
  const barbAx = p[4]
  const barbAy = p[5]
  const barbBx = p[8]
  const barbBy = p[9]
  assert.ok(Math.abs(barbAx - barbBx) > 1, "barbs share an x — arrow is axis-aligned")
  assert.ok(Math.abs(barbAy - barbBy) > 1, "barbs share a y — arrow is axis-aligned")
})

test("the outline is closed, so it can be filled", () => {
  // fill() needs the path to return to its start; an open outline paints a wedge.
  const p = solidArrowPoints(0, 0, 200, 40)
  assert.equal(p[0], p[p.length - 2])
  assert.equal(p[1], p[p.length - 1])
  assert.equal(p.length % 2, 0, "odd coordinate count would read undefined off the end")
})

test("the shaft is thinner than the head, so it reads as an arrow", () => {
  const p = solidArrowPoints(0, 0, 300, 0)
  // Shaft half-height at the tail (vertex 0) vs head half-width at the barb (vertex 3).
  const shaftHalf = Math.abs(p[1])
  const headHalf = Math.abs(p[5])
  assert.ok(headHalf > shaftHalf * 1.5, "head is not wider than the shaft")
  assert.ok(shaftHalf > 0, "shaft has no thickness — it would render as a line")
})

test("a long arrow does not grow an absurd head", () => {
  // Proportional sizing alone gives a 2000px arrow a 680px head.
  const short = solidArrowPoints(0, 0, 100, 0)
  const long = solidArrowPoints(0, 0, 4000, 0)
  const headLen = (p: number[]) => Math.abs(p[6] - p[4])
  assert.ok(headLen(long) < headLen(short) * 4, "head scaled without a ceiling")
  assert.ok(headLen(long) <= 56, "head exceeded its absolute cap")
})

test("a zero-length drag degenerates safely instead of producing NaN", () => {
  const p = solidArrowPoints(50, 50, 50, 50)
  assert.ok(p.every((n) => Number.isFinite(n)), "produced NaN coordinates")
})

test("the arrow shape tool routes through the solid geometry", () => {
  // shapePoints is what the toolbar calls; it must not still be emitting the old
  // box-aligned block arrow.
  const viaTool = shapePoints("arrow", 0, 0, 240, 180)
  const direct = solidArrowPoints(0, 0, 240, 180)
  assert.deepEqual(viaTool, direct)
})

test("arrows remain fillable, which is what makes them solid", () => {
  assert.ok(isFillable("arrow"))
})
