// node --test src/lib/shapes.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { SHAPE_KINDS, shapePoints } from "./shapes.ts"

const xs = (p: number[]) => p.filter((_, i) => i % 2 === 0)
const ys = (p: number[]) => p.filter((_, i) => i % 2 === 1)
const bbox = (p: number[]) => ({
  minX: Math.min(...xs(p)),
  maxX: Math.max(...xs(p)),
  minY: Math.min(...ys(p)),
  maxY: Math.max(...ys(p)),
})

test("a line runs anchor to cursor, in whatever direction it was dragged", () => {
  // Not bounding-box corners: dragging up-left has to give an up-left line, which a
  // box-based implementation would silently flip.
  assert.deepEqual(shapePoints("line", 10, 20, 100, 80), [10, 20, 100, 80])
  assert.deepEqual(shapePoints("line", 100, 80, 10, 20), [100, 80, 10, 20])
})

test("a rectangle is closed, axis-aligned, and spans the drag", () => {
  const p = shapePoints("rect", 10, 20, 110, 220)
  assert.equal(p.length, 10, "5 points")
  assert.deepEqual([p[0], p[1]], [p[8], p[9]], "closes on its start")
  assert.deepEqual(bbox(p), { minX: 10, minY: 20, maxX: 110, maxY: 220 })
  assert.equal(new Set(xs(p)).size, 2, "only two distinct x values")
  assert.equal(new Set(ys(p)).size, 2, "only two distinct y values")
})

test("an ellipse is inscribed in the drag box and closes cleanly", () => {
  const p = shapePoints("ellipse", 0, 0, 200, 100)
  assert.equal(p.length, 130, "65 points for 64 segments")
  assert.deepEqual([p[0], p[1]], [p.at(-2), p.at(-1)], "closes on its start")

  const b = bbox(p)
  for (const [actual, expected] of [
    [b.minX, 0], [b.maxX, 200], [b.minY, 0], [b.maxY, 100],
  ]) {
    assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)
  }

  // Every point satisfies the ellipse equation — this is a real ellipse, not a blob.
  for (let i = 0; i < p.length; i += 2) {
    const nx = (p[i] - 100) / 100
    const ny = (p[i + 1] - 50) / 50
    assert.ok(Math.abs(Math.hypot(nx, ny) - 1) < 1e-9, `point ${i / 2} off the ellipse`)
  }
})

test("a circle drag gives equal radii", () => {
  const p = shapePoints("ellipse", 0, 0, 100, 100)
  const b = bbox(p)
  assert.ok(Math.abs((b.maxX - b.minX) - (b.maxY - b.minY)) < 1e-9)
})

test("a triangle has its apex at top centre and sits on its base", () => {
  const p = shapePoints("triangle", 0, 0, 100, 60)
  assert.equal(p.length, 8, "4 points, last repeating the first")
  assert.deepEqual([p[0], p[1]], [50, 0], "apex centred on the top edge")
  assert.deepEqual([p[2], p[3]], [100, 60])
  assert.deepEqual([p[4], p[5]], [0, 60])
  assert.deepEqual([p[6], p[7]], [50, 0], "closes on its start")
})

test("every shape tolerates a drag in any direction", () => {
  for (const kind of SHAPE_KINDS) {
    // A line's direction is its whole point, and an arrow deliberately turns to
    // follow the drag — both are covered by their own tests.
    if (kind === "line" || kind === "arrow") continue
    const forward = shapePoints(kind, 10, 10, 110, 60)
    const backward = shapePoints(kind, 110, 60, 10, 10)
    assert.deepEqual(bbox(backward), bbox(forward), `${kind} flipped when reversed`)
  }
})

test("a diamond touches each edge at its midpoint", () => {
  const p = shapePoints("diamond", 0, 0, 100, 60)
  assert.deepEqual(p, [50, 0, 100, 30, 50, 60, 0, 30, 50, 0])
})

test("a right triangle keeps its right angle on the box corner", () => {
  const p = shapePoints("rightTriangle", 0, 0, 100, 60)
  assert.deepEqual(p, [0, 0, 100, 60, 0, 60, 0, 0])
  // The two legs must be exactly axis-aligned, or it isn't a right angle.
  assert.equal(p[0], p[4], "vertical leg")
  assert.equal(p[3], p[5], "horizontal leg")
})

test("a parallelogram slants without leaving its box", () => {
  const p = shapePoints("parallelogram", 0, 0, 100, 60)
  assert.deepEqual(bbox(p), { minX: 0, maxX: 100, minY: 0, maxY: 60 })
  assert.notEqual(p[0], p[6], "top and bottom edges are offset from each other")
})

test("a star has ten alternating vertices and stands upright", () => {
  const p = shapePoints("star", 0, 0, 100, 100)
  assert.equal(p.length, 22, "10 vertices plus the closing point")
  assert.deepEqual([p[0], p[1]], [50, 0], "first vertex is the top point")
  assert.deepEqual([p[0], p[1]], [p.at(-2), p.at(-1)], "closes on its start")

  // Outer vertices sit further from the centre than inner ones — that alternation is
  // what makes it a star rather than a decagon.
  const radius = (i: number) => Math.hypot(p[i * 2] - 50, p[i * 2 + 1] - 50)
  for (let i = 0; i < 10; i += 2) {
    assert.ok(radius(i) > radius(i + 1), `vertex ${i} should be an outer point`)
  }
})

test("an arrow points the way the drag went", () => {
  // Rewritten when the arrow stopped being box-aligned. It used to be built inside its
  // bounding box and mirrored when the drag ran leftward, so the tip always sat on the
  // box's horizontal centre line and both directions shared a bounding box. It is now
  // DIRECTIONAL — the tip lands on the drag's end point at any angle — which is a
  // stronger version of the same promise and the only version a diagonal arrow can keep.
  const tip = (p: number[]) => [p[6], p[7]]

  assert.deepEqual(tip(shapePoints("arrow", 0, 0, 100, 60)), [100, 60], "points where dragged")
  assert.deepEqual(tip(shapePoints("arrow", 100, 60, 0, 0)), [0, 0], "and the other way")
  // The case the old geometry could not express at all.
  assert.deepEqual(tip(shapePoints("arrow", 0, 0, 0, 120)), [0, 120], "straight down")
})

test("a double arrow has a tip at both ends", () => {
  const p = shapePoints("doubleArrow", 0, 0, 100, 60)
  const onCentre = []
  for (let i = 0; i < p.length - 2; i += 2) if (p[i + 1] === 30) onCentre.push(p[i])
  assert.deepEqual([...new Set(onCentre)].sort((a, b) => a - b), [0, 100])
})

test("every shape is a closed loop except the line", () => {
  for (const kind of SHAPE_KINDS) {
    const p = shapePoints(kind, 0, 0, 100, 60)
    if (kind === "line") continue
    assert.deepEqual(
      [p[0], p[1]],
      [p.at(-2), p.at(-1)],
      `${kind} does not close on its start`,
    )
  }
})

test("a zero-size drag degenerates without producing NaN", () => {
  // Happens on every click before the pointer moves, so it must not poison the path.
  for (const kind of SHAPE_KINDS) {
    const p = shapePoints(kind, 42, 42, 42, 42)
    assert.ok(p.length >= 4, `${kind} produced too few points`)
    assert.ok(p.every(Number.isFinite), `${kind} produced a non-finite coordinate`)
  }
})
