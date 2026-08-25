// node --test src/lib/picking.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
// Topmost-wins picking now lives on the union and is covered in notes.test.ts, where
// it can be tested against notes and strokes together. What is left here is the
// stroke-specific geometry that pickObject dispatches into.
import { type Stroke, hitsStroke, strokeBounds, translateStroke } from "./strokes.ts"

const stroke = (id: string, points: number[], width = 2): Stroke => ({
  id,
  type: "stroke",
  points,
  color: "#fff",
  width,
  createdAt: 0,
})

test("a click lands on the stroke's ink, not just its samples", () => {
  // Horizontal line from (0,0) to (100,0), 2 units wide → 1 unit of ink either side.
  const s = stroke("a", [0, 0, 50, 0, 100, 0])

  assert.ok(hitsStroke(s, 50, 0, 0), "dead centre")
  assert.ok(hitsStroke(s, 25, 0.9, 0), "inside the ink, between two samples")
  assert.ok(!hitsStroke(s, 25, 1.5, 0), "outside the ink with no slop")
  assert.ok(hitsStroke(s, 25, 1.5, 2), "outside the ink but within slop")
})

test("slop is the only thing making a hairline clickable", () => {
  // The real grab-tolerance case: a thin stroke zoomed out. Without slop the user
  // would have to hit a sub-pixel target.
  const hairline = stroke("h", [0, 0, 100, 0], 0.1)
  assert.ok(!hitsStroke(hairline, 50, 3, 0))
  assert.ok(hitsStroke(hairline, 50, 3, 5))
})

test("misses past the ends of a segment, not just to its sides", () => {
  const s = stroke("a", [0, 0, 100, 0])
  // Projection is clamped to the segment, so a point beyond the end measures from
  // the endpoint — an unclamped dot product would wrongly report a hit here.
  assert.ok(!hitsStroke(s, 130, 0, 5))
  assert.ok(hitsStroke(s, 103, 0, 5))
})

test("a single-point stroke is pickable as a dot", () => {
  const dot = stroke("d", [10, 10], 4)
  assert.ok(hitsStroke(dot, 11, 11, 0))
  assert.ok(!hitsStroke(dot, 20, 20, 0))
})

test("bounds contain the ink, not the centreline", () => {
  const s = stroke("a", [0, 0, 10, 20], 4)
  assert.deepEqual(strokeBounds(s), { minX: -2, minY: -2, maxX: 12, maxY: 22 })
})

test("translating moves every point, xs and ys independently", () => {
  const s = stroke("a", [0, 0, 10, 20, 30, 40])
  translateStroke(s, 5, -3)
  // Different dx and dy on purpose: a stride bug that wrote dx into the ys would
  // pass if both were equal.
  assert.deepEqual(s.points, [5, -3, 15, 17, 35, 37])
})

test("a dragged stroke stays pickable where it landed, not where it was", () => {
  const s = stroke("a", [0, 0, 100, 0])
  translateStroke(s, 0, 500)
  assert.ok(!hitsStroke(s, 50, 0, 2), "no longer at the old position")
  assert.ok(hitsStroke(s, 50, 500, 2), "hittable at the new one")
})

test("dragging carries the bounding box with the stroke", () => {
  const s = stroke("a", [0, 0, 10, 10], 2)
  const before = strokeBounds(s)
  translateStroke(s, 7, 11)
  const after = strokeBounds(s)
  assert.equal(after.minX - before.minX, 7)
  assert.equal(after.minY - before.minY, 11)
  assert.equal(after.maxX - before.maxX, 7)
  assert.equal(after.maxY - before.maxY, 11)
})
