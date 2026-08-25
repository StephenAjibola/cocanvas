// node --test src/lib/arrow.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { SHAPE_KINDS, arrowHead, hasInterior, isBlockArrow, shapePoints } from "./shapes.ts"

test("an arrow is a straight line: two endpoints, nothing else", () => {
  // The correction this file exists for. An arrow used to be a closed polygon outlining
  // a shaft and a head — a SHAPE. It is a line now, and its geometry has to say so, or
  // every hit test, bound and transform goes back to treating it as a filled blob.
  const p = shapePoints("arrow", 10, 20, 300, 180)
  assert.deepEqual(p, [10, 20, 300, 180])
})

test("an arrow's geometry is identical to a line's", () => {
  // Not "similar to". Identical — that is what buys move, resize, rotate and pick for
  // free, with no arrow-shaped special case anywhere downstream.
  for (const [x0, y0, x1, y1] of [
    [0, 0, 100, 0],
    [40, 90, -120, 30],
    [5, 5, 5, 400],
  ] as const) {
    assert.deepEqual(
      shapePoints("arrow", x0, y0, x1, y1),
      shapePoints("line", x0, y0, x1, y1),
    )
  }
})

test("the head sits on the end point, never the start", () => {
  // "Arrowhead at the end point only (the terminal, not the start)."
  for (const [x1, y1] of [[200, 0], [0, 200], [-150, -150], [120, -260]] as const) {
    const h = arrowHead(0, 0, x1, y1)
    assert.ok(h, "no head for a real drag")
    assert.equal(h.tip.x, x1)
    assert.equal(h.tip.y, y1)
  }
})

test("the head points along the drag, including diagonally", () => {
  // The bug the old block arrow had: box-aligned geometry drew a HORIZONTAL arrow
  // inside a diagonal bounding box.
  const h = arrowHead(0, 0, 300, 300)
  assert.ok(h)
  // Base corners straddle the shaft, so they differ in both axes on a diagonal.
  assert.ok(Math.abs(h.left.x - h.right.x) > 1, "corners share an x — head is axis-aligned")
  assert.ok(Math.abs(h.left.y - h.right.y) > 1, "corners share a y — head is axis-aligned")
  // And the base is back along the shaft from the tip, not past it.
  const midX = (h.left.x + h.right.x) / 2
  assert.ok(midX < h.tip.x, "head base is not behind the tip")
})

test("the head is a triangle with real width, not a hairline", () => {
  const h = arrowHead(0, 0, 300, 0)
  assert.ok(h)
  const width = Math.hypot(h.left.x - h.right.x, h.left.y - h.right.y)
  assert.ok(width > 4, `head is only ${width} wide — it would not read as an arrowhead`)
})

test("a short arrow keeps a visible shaft instead of becoming all head", () => {
  // Without the proportional cap a 20px arrow is a pure arrowhead with no line.
  const len = 20
  const h = arrowHead(0, 0, len, 0)
  assert.ok(h)
  const headLen = Math.abs(h.tip.x - (h.left.x + h.right.x) / 2)
  assert.ok(headLen < len, "head is longer than the arrow itself")
  assert.ok(len - headLen > 1, "no shaft left to see")
})

test("a zero-length drag has no head rather than a NaN one", () => {
  assert.equal(arrowHead(50, 50, 50, 50), null)
})

test("arrow is NOT in the shapes picker", () => {
  // "This is its own tool, selectable independently, NOT inside the Shapes picker menu."
  assert.ok(!SHAPE_KINDS.includes("arrow"), "arrow is still offered as a shape")
  // The block double arrow went with it: it is the same rejected idea, an arrow drawn
  // as a filled polygon.
  assert.ok(!(SHAPE_KINDS as string[]).includes("doubleArrow"), "doubleArrow is still a shape")
})

test("arrows already on boards still count as the old block geometry", () => {
  // Boards seeded before this change hold closed polygons under shape:"arrow". The
  // renderer keeps filling those, and tells them apart by point count alone.
  assert.ok(isBlockArrow("arrow", [0, 0, 1, 1, 2, 2, 0, 0]), "legacy polygon not recognised")
  assert.ok(!isBlockArrow("arrow", [0, 0, 100, 100]), "a straight arrow was taken for a block one")
  assert.ok(!isBlockArrow("line", [0, 0, 1, 1, 2, 2, 0, 0]), "a line was taken for an arrow")
})

test("a legacy block arrow keeps its interior; a straight one never had one", () => {
  // hasInterior is what selection, the fill control and the renderer all ask. Getting it
  // wrong in either direction is a visible bug: a legacy arrow that stops being clickable
  // in its middle, or a line that offers a fill control doing nothing.
  const legacy = [0, 0, 1, 1, 2, 2, 0, 0]
  const straight = shapePoints("arrow", 0, 0, 100, 50)
  assert.ok(hasInterior("arrow", legacy), "legacy block arrow lost its interior")
  assert.ok(!hasInterior("arrow", straight), "a straight arrow claims an interior")
  assert.ok(!hasInterior("line", [0, 0, 10, 10]), "a line claims an interior")
  assert.ok(hasInterior("rect", shapePoints("rect", 0, 0, 10, 10)), "a rect lost its interior")
})
