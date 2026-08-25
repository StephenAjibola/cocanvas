// node --test src/lib/connectors.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { anchorOf, clipToBox, connectorPoints, rerouteAll } from "./connectors.ts"
import { shapePoints } from "./shapes.ts"
import type { BoardObject } from "./objects.ts"
import type { Stroke } from "./strokes.ts"

const rect = (id: string, x0: number, y0: number, x1: number, y1: number): Stroke => ({
  id,
  type: "stroke",
  shape: "rect",
  points: shapePoints("rect", x0, y0, x1, y1),
  color: "#000",
  width: 0, // no ink padding, so objectBounds equals the geometry and the maths is exact
  createdAt: 0,
})

const tip = (p: number[]) => ({ x: p[2], y: p[3] })

test("an arrow ends at its target point, whatever direction it runs", () => {
  for (const [x, y] of [[100, 0], [-100, 0], [0, 100], [70, -70]]) {
    const p = connectorPoints(0, 0, x, y)
    assert.deepEqual([p[0], p[1]], [0, 0], "starts at the source")
    assert.deepEqual(tip(p), { x, y }, "tip lands on the target")
    // tail, tip, barb, tip again, barb — 5 points. The retrace is what lets one
    // polyline express three segments.
    assert.equal(p.length, 10)
    assert.deepEqual([p[6], p[7]], [x, y], "retraces the tip between the barbs")
  }
})

test("the head never outgrows a short arrow", () => {
  // A 9-unit arrow is shorter than HEAD_LEN, so an unclamped head would put both barbs
  // behind the tail and the arrow would read as a scribble.
  const p = connectorPoints(0, 0, 9, 0)
  const barb = { x: p[4], y: p[5] }
  assert.ok(barb.x > 0, `barb at ${barb.x} fell behind the tail`)
  assert.ok(9 - barb.x <= 3 + 1e-9, "head is capped at a third of the run")

  // A long one gets the full fixed head rather than one that scales with length.
  const long = connectorPoints(0, 0, 500, 0)
  const headLen = Math.hypot(500 - long[4], -long[5])
  assert.ok(Math.abs(headLen - 12) < 1e-9, `head was ${headLen}`)
})

test("a degenerate drag emits a bare shaft instead of NaN", () => {
  assert.deepEqual(connectorPoints(5, 5, 5, 5), [5, 5, 5, 5])
})

test("clipToBox stops on the near face, not the far one", () => {
  const box = { minX: 100, minY: 0, maxX: 200, maxY: 100 }
  // Approaching from the left, so the arrow must stop at x=100 — the far face at x=200
  // would bury the head clean through the shape.
  assert.deepEqual(clipToBox(box, { x: 0, y: 50 }, { x: 150, y: 50 }), { x: 100, y: 50 })
  // Nothing in the way: the pointer target stands.
  const away = clipToBox(box, { x: 0, y: 500 }, { x: 50, y: 500 })
  assert.deepEqual(away, { x: 50, y: 500 })
})

test("a linked arrow follows both of its shapes when either one moves", () => {
  const a = rect("a", 0, 0, 100, 100)
  const b = rect("b", 300, 0, 400, 100)
  const arrow: Stroke = {
    id: "arrow",
    type: "stroke",
    shape: "connector",
    points: [],
    color: "#000",
    width: 2,
    createdAt: 0,
    link: { from: "a", side: "e", to: "b" },
  }
  const objects: BoardObject[] = [a, b, arrow]

  rerouteAll(objects)
  assert.deepEqual([arrow.points[0], arrow.points[1]], [100, 50], "leaves a's east edge")
  assert.deepEqual(tip(arrow.points), { x: 300, y: 50 }, "stops at b's near edge")

  // Move the TARGET: the head has to come with it.
  for (let i = 0; i < b.points.length; i += 2) b.points[i] += 200
  rerouteAll(objects)
  assert.deepEqual(tip(arrow.points), { x: 500, y: 50 }, "head followed the target")
  assert.deepEqual([arrow.points[0], arrow.points[1]], [100, 50], "tail stayed put")

  // Move the SOURCE: the tail has to come with it, and it is still the east edge.
  for (let i = 1; i < a.points.length; i += 2) a.points[i] += 100
  rerouteAll(objects)
  assert.deepEqual(anchorOf(a, "e"), { x: 100, y: 150 })
  assert.deepEqual([arrow.points[0], arrow.points[1]], [100, 150], "tail followed the source")
})

test("a deleted endpoint freezes the arrow rather than corrupting it", () => {
  const a = rect("a", 0, 0, 100, 100)
  const arrow: Stroke = {
    id: "arrow",
    type: "stroke",
    shape: "connector",
    points: [100, 50, 300, 50, 290, 45, 300, 50, 290, 55],
    color: "#000",
    width: 2,
    createdAt: 0,
    link: { from: "a", side: "e", to: "gone" },
  }
  const before = [...arrow.points]
  rerouteAll([a, arrow])
  assert.deepEqual(arrow.points, before, "left exactly where it was")
})

test("an arrow with no link is left alone — it is an ordinary shape", () => {
  const free: Stroke = {
    id: "free",
    type: "stroke",
    shape: "connector",
    points: connectorPoints(0, 0, 50, 0),
    color: "#000",
    width: 2,
    createdAt: 0,
  }
  const before = [...free.points]
  rerouteAll([rect("a", 0, 0, 10, 10), free])
  assert.deepEqual(free.points, before)
})
