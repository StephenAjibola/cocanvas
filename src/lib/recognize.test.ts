// node --test src/lib/recognize.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { SNAP_DEGREES, recognizeShape } from "./recognize.ts"
import { MIN_POINT_DIST, smoothPoint } from "./strokes.ts"

/** Seeded LCG, so a threshold that only passes on a lucky run fails loudly instead. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/** Hand-shake: every fixture is a clean path plus bounded noise, like a real stroke. */
function shaky(pts: number[], amount: number, seed = 7) {
  const r = rng(seed)
  return pts.map((v) => v + (r() - 0.5) * 2 * amount)
}

function linePath(x0: number, y0: number, x1: number, y1: number, n = 24) {
  const out: number[] = []
  for (let i = 0; i <= n; i++) {
    out.push(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)
  }
  return out
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number, n = 48, sweep = 1) {
  const out: number[] = []
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2 * sweep
    out.push(cx + rx * Math.cos(t), cy + ry * Math.sin(t))
  }
  return out
}

function rectPath(x0: number, y0: number, x1: number, y1: number, per = 14) {
  const out: number[] = []
  const corners = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ]
  for (let c = 0; c < 4; c++) {
    const [ax, ay] = corners[c]
    const [bx, by] = corners[c + 1]
    for (let i = 0; i < per; i++) {
      out.push(ax + ((bx - ax) * i) / per, ay + ((by - ay) * i) / per)
    }
  }
  out.push(x0, y0)
  return out
}

const angleOf = (p: number[]) =>
  (Math.atan2(p[3] - p[1], p[2] - p[0]) * 180) / Math.PI

/**
 * The REAL pen pipeline: a wandering hand, sampled at a given speed, run through the
 * EMA filter and decimation exactly as BoardCanvas does before recognition sees it.
 *
 * The clean fixtures above miss what actually broke this in the field. The filter
 * rounds every corner of a rectangle, and the faster you draw the fewer samples it has
 * to turn in — so a real rectangle reaches the recognizer visibly rounder than any
 * hand-built fixture, and used to lose to the ellipse candidate.
 */
function drawn(ideal: number[], seed: number, rawStep = 6, wander = 6) {
  const r = rng(seed)
  let wx = 0
  let wy = 0
  const raw: number[] = []
  for (let i = 0; i < ideal.length; i += 2) {
    wx = Math.max(-wander, Math.min(wander, wx + (r() - 0.5) * 1.2))
    wy = Math.max(-wander, Math.min(wander, wy + (r() - 0.5) * 1.2))
    raw.push(ideal[i] + wx + (r() - 0.5) * 1.5, ideal[i + 1] + wy + (r() - 0.5) * 1.5)
  }
  // Draw speed: how far the pointer travels between reported samples.
  const sampled: number[] = [raw[0], raw[1]]
  for (let i = 2; i < raw.length; i += 2 * rawStep) sampled.push(raw[i], raw[i + 1])
  sampled.push(raw[raw.length - 2], raw[raw.length - 1])

  let pen = { x: sampled[0], y: sampled[1] }
  const out = [pen.x, pen.y]
  for (let i = 2; i < sampled.length; i += 2) {
    pen = smoothPoint(pen, { x: sampled[i], y: sampled[i + 1] })
    const n = out.length
    const dx = pen.x - out[n - 2]
    const dy = pen.y - out[n - 1]
    if (dx * dx + dy * dy >= MIN_POINT_DIST * MIN_POINT_DIST) out.push(pen.x, pen.y)
  }
  out.push(sampled[sampled.length - 2], sampled[sampled.length - 1]) // landed endpoint
  return out
}

/** Densely sampled ideal paths, as a real pointer would trace them. */
const denseLine = (x0: number, y0: number, x1: number, y1: number) =>
  linePath(x0, y0, x1, y1, Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0))))
function denseRect(x0: number, y0: number, x1: number, y1: number) {
  const c = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ]
  const o: number[] = []
  for (let k = 0; k < 4; k++) o.push(...denseLine(c[k][0], c[k][1], c[k + 1][0], c[k + 1][1]))
  return o
}
const denseEllipse = (rx: number, ry: number) =>
  ellipsePath(0, 0, rx, ry, Math.round(Math.PI * (rx + ry)))

test("a shaky straight drag becomes a line", () => {
  const got = recognizeShape(shaky(linePath(0, 0, 300, 0), 2))
  assert.equal(got?.kind, "line")
  assert.equal(got!.points.length, 4, "a line is exactly two points")
})

test("line angles snap to the nearest 15°", () => {
  // Drawn at ~47°, which must land on 45 and not stay at 47.
  const drawn = shaky(linePath(0, 0, 200, 214), 2)
  const got = recognizeShape(drawn)
  assert.equal(got?.kind, "line")

  const deg = angleOf(got!.points)
  assert.ok(
    Math.abs(deg % SNAP_DEGREES) < 1e-6 || Math.abs((deg % SNAP_DEGREES) - SNAP_DEGREES) < 1e-6,
    `${deg}° is not a multiple of ${SNAP_DEGREES}°`,
  )
  assert.ok(Math.abs(deg - 45) < 0.001, `expected 45°, got ${deg}°`)
})

test("a near-horizontal drag snaps flat", () => {
  const got = recognizeShape(shaky(linePath(0, 0, 300, 9), 1.5))
  assert.equal(got?.kind, "line")
  assert.ok(Math.abs(angleOf(got!.points)) < 0.001, "should snap to exactly 0°")
})

test("a line keeps the start point and the length it was drawn at", () => {
  const drawn = shaky(linePath(50, 50, 350, 50), 1)
  const got = recognizeShape(drawn)!
  assert.deepEqual([got.points[0], got.points[1]], [drawn[0], drawn[1]], "anchored on start")

  const drawnLen = Math.hypot(drawn.at(-2)! - drawn[0], drawn.at(-1)! - drawn[1])
  const cleanLen = Math.hypot(got.points[2] - got.points[0], got.points[3] - got.points[1])
  assert.ok(Math.abs(drawnLen - cleanLen) < 1e-9, "length must be preserved exactly")
})

test("a shaky loop becomes an ellipse, not a rectangle", () => {
  // The misclassification the best-of scoring exists to prevent: a circle sits close
  // enough to its own bounding box that a rect-first implementation reads it wrong.
  const got = recognizeShape(shaky(ellipsePath(100, 100, 60, 60), 3))
  assert.equal(got?.kind, "ellipse")
})

test("a stretched ellipse is recognized too, not just a circle", () => {
  const got = recognizeShape(shaky(ellipsePath(0, 0, 160, 50), 3))
  assert.equal(got?.kind, "ellipse")
})

test("a circle left slightly open still closes", () => {
  // Nobody lands exactly on their starting point.
  const got = recognizeShape(shaky(ellipsePath(0, 0, 80, 80, 44, 0.93), 2))
  assert.equal(got?.kind, "ellipse")
})

test("a shaky rectangle becomes a rectangle, not an ellipse", () => {
  const got = recognizeShape(shaky(rectPath(0, 0, 200, 120), 3))
  assert.equal(got?.kind, "rect")
})

test("a recognized rectangle has only right angles", () => {
  // Requirement 5 at the geometry level; strokes.test.ts carries it through rendering.
  const got = recognizeShape(shaky(rectPath(10, 20, 210, 140), 3))!
  assert.equal(got.kind, "rect")

  const xs = got.points.filter((_, i) => i % 2 === 0)
  const ys = got.points.filter((_, i) => i % 2 === 1)
  assert.equal(new Set(xs).size, 2, "only two distinct x values")
  assert.equal(new Set(ys).size, 2, "only two distinct y values")
  assert.deepEqual(
    [got.points[0], got.points[1]],
    [got.points[8], got.points[9]],
    "closes on its start",
  )
})

test("a long thin rectangle is not mistaken for a line", () => {
  const got = recognizeShape(shaky(rectPath(0, 0, 300, 24), 1.5))
  assert.equal(got?.kind, "rect")
})

/** The 4th side drawn only `frac` of the way back to the start. 0 = stopped dead on the
 * last corner, which is how people actually draw a box. */
function openRect(w: number, h: number, frac = 0) {
  const c = [[0, 0], [w, 0], [w, h], [0, h], [0, h - h * frac]]
  const o: number[] = []
  for (let k = 0; k < 4; k++) o.push(...denseLine(c[k][0], c[k][1], c[k + 1][0], c[k + 1][1]))
  return o
}

test("a rectangle left open on the last corner is still a rectangle", () => {
  // The shipped bug. Every fixture above draws back over its own start, so the closure
  // gate never fired — but nobody does that by hand. They stop on the corner they began
  // at, leaving a gap of one whole side: 0.23 of the path for a 200x120, 0.33 for a
  // square, 0.75 for a tall thin one. All three used to fall out as raw freehand.
  for (const [w, h] of [[200, 120], [200, 200], [120, 200], [300, 60], [60, 300], [400, 250]]) {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const speed of [3, 6, 10, 16]) {
        assert.equal(
          recognizeShape(drawn(openRect(w, h), seed, speed))?.kind,
          "rect",
          `open ${w}x${h} seed ${seed} @${speed}px`,
        )
      }
    }
  }
})

test("dropping the closure gate for rects did not let curves or corners in", () => {
  // An open stroke is admitted on shape rather than closure, so the things that are
  // ALMOST three sides of a box have to keep failing.
  const poly = (pts: number[][]) => {
    const o: number[] = []
    for (let k = 0; k < pts.length - 1; k++) {
      o.push(...denseLine(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]))
    }
    return o
  }
  const cases: [string, number[]][] = [
    ["an L", poly([[0, 0], [0, 200], [160, 200]])],
    ["a V", poly([[0, 0], [100, 180], [200, 0]])],
    // Arcs are the reason the ellipse candidate keeps its closure gate: without it a
    // half-drawn circle would inflate into a whole one.
    ["a half circle", ellipsePath(0, 0, 80, 80, 120, 0.5)],
    ["a 3/4 arc", ellipsePath(0, 0, 80, 80, 180, 0.75)],
    ["a 4/5 arc", ellipsePath(0, 0, 80, 80, 190, 0.8)],
  ]
  for (const [name, ideal] of cases) {
    for (const seed of [1, 2, 3, 4]) {
      for (const speed of [3, 6, 16]) {
        assert.equal(recognizeShape(drawn(ideal, seed, speed)), null, `${name} seed ${seed}`)
      }
    }
  }
})

test("a near-flat drag is a line, never a degenerate rectangle", () => {
  // Hand shake gives a straight drag a bbox a few px tall. Judged by side coverage alone
  // every point sits on all four sides at once, which read as a flawless rectangle.
  for (const [x1, y1] of [[300, 0], [300, 6], [0, 300], [8, 300]]) {
    for (const seed of [1, 2, 3, 4]) {
      assert.equal(
        recognizeShape(drawn(denseLine(0, 0, x1, y1), seed, 6))?.kind,
        "line",
        `drag to (${x1},${y1}) seed ${seed}`,
      )
    }
  }
})

test("a scribble is left alone", () => {
  // Requirement 3: no confident match keeps the raw path rather than forcing the
  // nearest shape onto something that was never one.
  const r = rng(99)
  const out: number[] = []
  let x = 0
  let y = 0
  for (let i = 0; i < 60; i++) {
    x += (r() - 0.5) * 60
    y += (r() - 0.5) * 60
    out.push(x, y)
  }
  assert.equal(recognizeShape(out), null)
})

test("a hand-drawn triangle falls back rather than misfiring as a rectangle", () => {
  // Triangles are deliberately not recognized. The failure mode that matters is
  // returning the WRONG shape, not returning none.
  const tri: number[] = []
  const corners = [
    [100, 0],
    [200, 160],
    [0, 160],
    [100, 0],
  ]
  for (let c = 0; c < 3; c++) {
    const [ax, ay] = corners[c]
    const [bx, by] = corners[c + 1]
    for (let i = 0; i < 16; i++) {
      tri.push(ax + ((bx - ax) * i) / 16, ay + ((by - ay) * i) / 16)
    }
  }
  tri.push(100, 0)
  assert.equal(recognizeShape(shaky(tri, 2)), null)
})

test("a dot and a flick are never shapes", () => {
  assert.equal(recognizeShape([10, 10]), null, "a dot")
  assert.equal(recognizeShape([10, 10, 12, 11]), null, "too few samples to fit")
  assert.equal(recognizeShape([5, 5, 5, 5, 5, 5, 5, 5]), null, "zero-length path")
})

test("recognition is scale-invariant", () => {
  // The same gesture drawn zoomed way out must classify the same way, or the feature
  // works only at one zoom level.
  for (const k of [0.05, 1, 40]) {
    const rect = shaky(rectPath(0, 0, 200 * k, 120 * k), 3 * k)
    const circle = shaky(ellipsePath(0, 0, 60 * k, 60 * k), 3 * k)
    assert.equal(recognizeShape(rect)?.kind, "rect", `rect at ${k}x`)
    assert.equal(recognizeShape(circle)?.kind, "ellipse", `circle at ${k}x`)
  }
})

test("a rectangle drawn through the REAL pen pipeline stays a rectangle", () => {
  // The shipped bug. The clean fixtures passed while this failed: the EMA filter rounds
  // the corners, which used to hand the win to the ellipse candidate.
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    for (const speed of [1, 3, 6]) {
      const got = recognizeShape(drawn(denseRect(0, 0, 200, 120), seed, speed))
      assert.equal(got?.kind, "rect", `seed ${seed} at ${speed}px sampling`)
    }
  }
})

test("a rectangle drawn FAST is still not mistaken for a circle", () => {
  // Fewer pointer samples per corner means heavier rounding — the worst case, and the
  // one users hit most since nobody draws a box slowly.
  let asRect = 0
  let total = 0
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    for (const speed of [10, 16]) {
      total++
      if (recognizeShape(drawn(denseRect(0, 0, 200, 120), seed, speed))?.kind === "rect") {
        asRect++
      }
    }
  }
  assert.ok(asRect / total >= 0.75, `only ${asRect}/${total} fast rectangles survived`)
})

test("real-pipeline lines and circles keep classifying correctly", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    for (const speed of [1, 6, 16]) {
      assert.equal(
        recognizeShape(drawn(denseLine(0, 0, 300, 0), seed, speed))?.kind,
        "line",
        `line seed ${seed} @${speed}px`,
      )
      assert.equal(
        recognizeShape(drawn(denseEllipse(60, 60), seed, speed))?.kind,
        "ellipse",
        `circle seed ${seed} @${speed}px`,
      )
      assert.equal(
        recognizeShape(drawn(denseEllipse(160, 50), seed, speed))?.kind,
        "ellipse",
        `flat ellipse seed ${seed} @${speed}px`,
      )
    }
  }
})

test("looser tolerances did not start swallowing non-shapes", () => {
  // The gates were widened to admit rounded rectangles; that must not turn scribbles
  // or triangles into shapes.
  const r = rng(4242)
  for (let k = 0; k < 20; k++) {
    const out: number[] = []
    let x = 0
    let y = 0
    for (let i = 0; i < 60; i++) {
      x += (r() - 0.5) * 60
      y += (r() - 0.5) * 60
      out.push(x, y)
    }
    assert.equal(recognizeShape(out), null, `scribble ${k}`)
  }

  const tri: number[] = []
  const corners = [
    [100, 0],
    [200, 160],
    [0, 160],
    [100, 0],
  ]
  for (let c = 0; c < 3; c++) {
    tri.push(...denseLine(corners[c][0], corners[c][1], corners[c + 1][0], corners[c + 1][1]))
  }
  for (const seed of [1, 2, 3, 4]) {
    for (const speed of [1, 6, 16]) {
      assert.equal(recognizeShape(drawn(tri, seed, speed)), null, `triangle seed ${seed}`)
    }
  }
})

test("a sloppier hand still lands on the right shape", () => {
  // Same fixtures, heavier noise and different seeds — guards against thresholds
  // tuned so tight they only fit one lucky path.
  for (const seed of [1, 2, 3, 4, 5]) {
    assert.equal(
      recognizeShape(shaky(rectPath(0, 0, 200, 120), 5, seed))?.kind,
      "rect",
      `rect seed ${seed}`,
    )
    assert.equal(
      recognizeShape(shaky(ellipsePath(0, 0, 70, 70), 5, seed))?.kind,
      "ellipse",
      `circle seed ${seed}`,
    )
    assert.equal(
      recognizeShape(shaky(linePath(0, 0, 300, 0), 4, seed))?.kind,
      "line",
      `line seed ${seed}`,
    )
  }
})
