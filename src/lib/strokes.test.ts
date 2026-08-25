// node --test src/lib/strokes.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  MIN_POINT_DIST,
  SETTLE_ALPHA,
  type Stroke,
  polylinePath,
  pressureWidth,
  pressuresOf,
  settleStyle,
  smoothPoint,
  strokePath,
  tracePath,
  variableWidthStroke,
} from "./strokes.ts"
import { shapePoints } from "./shapes.ts"
import { recognizeShape } from "./recognize.ts"

/** Total vertical travel — a straight line scores ~0, a shaky one scores high. */
const wobble = (pts: { y: number }[]) =>
  pts.reduce((sum, p, i) => (i ? sum + Math.abs(p.y - pts[i - 1].y) : 0), 0)

test("filter cuts jitter hard while staying on the intended path", () => {
  // A straight horizontal drag with ±1.5px of alternating shake — mouse noise.
  const raw = Array.from({ length: 61 }, (_, i) => ({ x: i * 4, y: i % 2 ? 1.5 : -1.5 }))

  let p = raw[0]
  const filtered = [p]
  for (const r of raw.slice(1)) {
    p = smoothPoint(p, r)
    filtered.push(p)
  }

  assert.ok(
    wobble(filtered) < wobble(raw) * 0.35,
    `jitter only fell to ${((wobble(filtered) / wobble(raw)) * 100).toFixed(0)}%`,
  )
  // Smoothing must average the noise away, never wander outside it.
  assert.ok(
    Math.max(...filtered.map((q) => Math.abs(q.y))) <= 1.5,
    "filtered path left the noise band",
  )
  // Lag is the cost of smoothing; it has to stay small or the line trails the cursor.
  assert.ok(raw.at(-1)!.x - filtered.at(-1)!.x < 10, "filter lags too far behind")
})

test("a still pointer converges instead of creeping", () => {
  let p = { x: 0, y: 0 }
  for (let i = 0; i < 40; i++) p = smoothPoint(p, { x: 100, y: 100 })
  assert.ok(Math.abs(p.x - 100) < 0.01 && Math.abs(p.y - 100) < 0.01)
})

test("settle runs from wet ink to set ink, and lands exactly on the final weight", () => {
  const wet = settleStyle(0, 10)
  const set = settleStyle(1, 10)

  assert.equal(set.width, 10, "must land on the stroke's true width, not near it")
  assert.equal(set.alpha, 1)
  assert.ok(wet.width > set.width, "starts wider")
  assert.equal(wet.alpha, SETTLE_ALPHA)

  // Monotonic in both channels, so the settle never overshoots or doubles back.
  let prev = settleStyle(0, 10)
  for (let t = 0.1; t <= 1.0001; t += 0.1) {
    const cur = settleStyle(t, 10)
    assert.ok(cur.width < prev.width, `width not shrinking at t=${t}`)
    assert.ok(cur.alpha > prev.alpha, `alpha not rising at t=${t}`)
    prev = cur
  }
})

/** Records path calls instead of rasterizing, so the geometry can be asserted. */
function recorder() {
  const calls: (string | number)[][] = []
  // lineCap/lineJoin are plain fields so strokePath's writes can be read back.
  const ctx = {
    lineCap: "",
    lineJoin: "",
    beginPath: () => calls.push(["beginPath"]),
    moveTo: (x: number, y: number) => calls.push(["moveTo", x, y]),
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) =>
      calls.push(["quad", cx, cy, x, y]),
    lineTo: (x: number, y: number) => calls.push(["lineTo", x, y]),
    setLineDash: (d: number[]) => calls.push(["setLineDash", ...d]),
    // lineWidth is a plain field for the same reason as the caps: variableWidthStroke
    // writes it between segments, and the width IN FORCE at each stroke() is the whole
    // thing under test.
    lineWidth: 0,
    stroke: () => {},
  }
  // Assigned after, not inline: an arrow reading `ctx` inside ctx's own initializer
  // makes TS infer the object as implicitly any.
  ctx.stroke = () => calls.push(["stroke", ctx.lineWidth])
  return { calls, ctx, canvasCtx: ctx as unknown as CanvasRenderingContext2D }
}

const strokeOf = (points: number[], shape?: Stroke["shape"]): Stroke => ({
  id: "s",
  type: "stroke",
  points,
  color: "#fff",
  width: 2,
  createdAt: 0,
  ...(shape ? { shape } : {}),
})

test("curves through midpoints, using raw samples as control points", () => {
  const { calls, canvasCtx } = recorder()
  tracePath(canvasCtx, [0, 0, 10, 0, 20, 10, 30, 10])

  assert.deepEqual(calls, [
    ["moveTo", 0, 0],
    // control = sample 1, endpoint = midpoint of samples 1 and 2
    ["quad", 10, 0, 15, 5],
    // control = sample 2, endpoint = midpoint of samples 2 and 3
    ["quad", 20, 10, 25, 10],
    ["lineTo", 30, 10],
  ])
})

test("a rectangle draws as four straight segments, with no curve anywhere", () => {
  // The regression: rendering shapes through tracePath turned every corner into a
  // quadratic, which read as a quarter-circle blended into an L.
  const { calls, canvasCtx } = recorder()
  polylinePath(canvasCtx, shapePoints("rect", 0, 0, 100, 50))

  assert.equal(
    calls.filter((c) => c[0] === "quad").length,
    0,
    "a rectangle must contain no curves",
  )
  assert.deepEqual(calls, [
    ["moveTo", 0, 0],
    ["lineTo", 100, 0],
    ["lineTo", 100, 50],
    ["lineTo", 0, 50],
    ["lineTo", 0, 0],
  ])
})

test("a triangle draws as three straight segments and a sharp apex", () => {
  const { calls, canvasCtx } = recorder()
  polylinePath(canvasCtx, shapePoints("triangle", 0, 0, 100, 60))

  assert.equal(calls.filter((c) => c[0] === "quad").length, 0, "no curves")
  assert.deepEqual(calls, [
    ["moveTo", 50, 0],
    ["lineTo", 100, 60],
    ["lineTo", 0, 60],
    ["lineTo", 50, 0],
  ])
})

test("tracePath would have rounded those corners — that is the bug being avoided", () => {
  // Pins WHY shapes need their own path function, so nobody routes them back through
  // the smoothing one.
  const { calls, canvasCtx } = recorder()
  tracePath(canvasCtx, shapePoints("rect", 0, 0, 100, 50))
  assert.ok(
    calls.some((c) => c[0] === "quad"),
    "tracePath is expected to curve; that is what makes it wrong for shapes",
  )
})

test("strokePath sends a shape to sharp geometry and freehand to smoothed", () => {
  // The dispatch itself, not the two path functions it picks between. This is the
  // decision the old bug got wrong, and until it was extracted from the canvas
  // closure nothing could assert it.
  const shape = recorder()
  strokePath(shape.canvasCtx, strokeOf(shapePoints("rect", 0, 0, 100, 50), "rect"))
  assert.equal(shape.calls.filter((c) => c[0] === "quad").length, 0)
  assert.equal(shape.ctx.lineJoin, "miter")
  assert.equal(shape.ctx.lineCap, "butt")

  const ink = recorder()
  strokePath(ink.canvasCtx, strokeOf([0, 0, 10, 0, 20, 10, 30, 10]))
  assert.ok(ink.calls.some((c) => c[0] === "quad"), "freehand must stay smoothed")
  assert.equal(ink.ctx.lineJoin, "round")
})

test("a RECOGNIZED rectangle renders with sharp 90° corners, not rounded ones", () => {
  // Requirement 5, end to end: hand-drawn path -> recognizer -> the real render
  // dispatch. The regression was a recognizer that set points but not `shape`, which
  // silently fell through to tracePath and curved every corner.
  // Built through the real pen pipeline — a wandering hand, then the EMA filter that
  // rounds corners — so this covers the shape the recognizer actually receives.
  let seed = 20260809
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5)
  const corners = [
    [20, 40],
    [140, 40],
    [140, 100],
    [20, 100],
    [20, 40],
  ]
  const raw: number[] = []
  for (let c = 0; c < 4; c++) {
    const [ax, ay] = corners[c]
    const [bx, by] = corners[c + 1]
    const n = Math.round(Math.hypot(bx - ax, by - ay) / 3)
    for (let i = 0; i < n; i++) {
      raw.push(ax + ((bx - ax) * i) / n + rand() * 3, ay + ((by - ay) * i) / n + rand() * 3)
    }
  }
  raw.push(20, 40)

  let pen = { x: raw[0], y: raw[1] }
  const drawn = [pen.x, pen.y]
  for (let i = 2; i < raw.length; i += 2) {
    pen = smoothPoint(pen, { x: raw[i], y: raw[i + 1] })
    const n = drawn.length
    const dx = pen.x - drawn[n - 2]
    const dy = pen.y - drawn[n - 1]
    if (dx * dx + dy * dy >= MIN_POINT_DIST * MIN_POINT_DIST) drawn.push(pen.x, pen.y)
  }
  drawn.push(20, 40)

  const clean = recognizeShape(drawn)
  assert.equal(clean?.kind, "rect")

  // The field that does the work. Assigning only points is the exact bug.
  const stroke = strokeOf(clean!.points, clean!.kind)
  assert.equal(stroke.shape, "rect", "shape must be set, or rendering rounds the corners")

  const { calls, ctx, canvasCtx } = recorder()
  strokePath(canvasCtx, stroke)

  assert.equal(
    calls.filter((c) => c[0] === "quad").length,
    0,
    "a recognized rectangle must contain no curves",
  )
  assert.equal(ctx.lineJoin, "miter", "round joins would bevel the corners visually")

  // Every vertex is a true right angle: only two distinct x and two distinct y values.
  const verts = calls.filter((c) => c[0] === "moveTo" || c[0] === "lineTo")
  assert.equal(verts.length, 5, "four corners, closing on the first")
  assert.equal(new Set(verts.map((c) => c[1])).size, 2, "only two distinct x values")
  assert.equal(new Set(verts.map((c) => c[2])).size, 2, "only two distinct y values")
})

test("always terminates on the final sample", () => {
  for (const n of [3, 4, 5, 12]) {
    const pts = Array.from({ length: n * 2 }, (_, i) => i)
    const { calls, canvasCtx } = recorder()
    tracePath(canvasCtx, pts)
    assert.deepEqual(calls.at(-1), ["lineTo", pts[pts.length - 2], pts[pts.length - 1]])
    assert.deepEqual(calls[0], ["moveTo", pts[0], pts[1]])
  }
})

test("pen pressure varies width per segment, without moving the geometry", () => {
  // The reported bug: a real PointerEvent ramp from 0.1 to 0.9 rendered at one uniform
  // width, because nothing read e.pressure and lineWidth was fixed at pointerdown.
  const points = [0, 0, 10, 0, 20, 10, 30, 10, 40, 10]
  const pressures = [0.1, 0.3, 0.5, 0.7, 0.9]
  const { calls, canvasCtx } = recorder()
  variableWidthStroke(canvasCtx, points, pressures, 4)

  const widths = calls.filter((c) => c[0] === "stroke").map((c) => c[1] as number)
  assert.ok(widths.length > 1, "a tapering stroke has to be laid down in pieces")
  for (let i = 1; i < widths.length; i++) {
    assert.ok(
      widths[i] > widths[i - 1],
      `width did not rise across segment ${i}: ${widths.join(", ")}`,
    )
  }

  // Weight changes, shape does not: every curve and the run-out must match what
  // tracePath would have drawn for the same samples.
  const flat = recorder()
  tracePath(flat.canvasCtx, points)
  const curves = (cs: (string | number)[][]) =>
    cs.filter((c) => c[0] === "quad" || c[0] === "lineTo")
  assert.deepEqual(curves(calls), curves(flat.calls), "pressure moved the stroke")
})

test("pressure 1 renders at exactly the stroke width — the ceiling bounds depend on", () => {
  // strokeBounds and hitsStroke both pad by width/2 and know nothing about pressure.
  // That stays correct only while nothing can render WIDER than width.
  for (const p of [0, 0.25, 0.5, 0.75, 1, 1.5, -1, Number.NaN]) {
    assert.ok(pressureWidth(4, p) <= 4, `pressure ${p} rendered wider than the stroke`)
    assert.ok(pressureWidth(4, p) > 0, `pressure ${p} rendered as nothing`)
  }
  assert.equal(pressureWidth(4, 1), 4)
  assert.ok(pressureWidth(4, 0.1) < pressureWidth(4, 0.9), "no taper at all")
})

test("pressures out of step with their points are ignored, not indexed off the end", () => {
  const s = strokeOf([0, 0, 10, 0, 20, 10])
  assert.equal(pressuresOf(s), null, "absent means uniform width")
  assert.deepEqual(pressuresOf({ ...s, pressures: [0.2, 0.5, 0.8] }), [0.2, 0.5, 0.8])
  // Short by one — reading past the end would paint a NaN-wide segment, i.e. nothing.
  assert.equal(pressuresOf({ ...s, pressures: [0.2, 0.5] }), null)
})
