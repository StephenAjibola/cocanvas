// node --test src/lib/brushes.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  BRUSHES,
  BRUSH_KINDS,
  PASS_SEED_STEP,
  brushOf,
  grainOffset,
  grainPath,
} from "./brushes.ts"

test("an unset brush renders exactly like the pen", () => {
  // Every stroke drawn before brushes existed has no `brush` field. Those must not
  // change appearance.
  assert.equal(brushOf(undefined), BRUSHES.pen)
  assert.equal(brushOf("pen"), BRUSHES.pen)
})

test("each brush is actually distinguishable from the others", () => {
  // A selector whose options look the same is a selector nobody can use.
  const sigs = BRUSH_KINDS.map((k) => {
    const b = BRUSHES[k]
    const t = b.texture
    return `${b.width}/${b.alpha}/${b.persists}/${t ? `${t.passes},${t.offset},${t.alpha},${t.width}` : "none"}`
  })
  assert.equal(new Set(sigs).size, sigs.length, "two brushes render identically")
})

test("the brushes match the brief", () => {
  assert.ok(BRUSHES.marker.width > BRUSHES.pen.width, "marker is thicker")
  assert.equal(BRUSHES.marker.alpha, 1, "marker is fully opaque")
  assert.ok(BRUSHES.pencil.width < BRUSHES.pen.width, "pencil is thinner")
  assert.ok(BRUSHES.pencil.alpha < 1, "pencil is lighter than full ink")
  assert.ok(BRUSHES.pencil.texture, "pencil is textured")
  assert.equal(BRUSHES.laser.persists, false, "the laser must never persist")
})

test("watercolor bleeds outward, chalk scatters inward", () => {
  // The one structural difference between them: passes WIDER than the stroke pool past
  // its edge, passes NARROWER break up its body. Swapping these swaps the two brushes.
  const wc = BRUSHES.watercolor.texture!
  const ch = BRUSHES.chalk.texture!

  assert.ok(wc.width > 1, "watercolour passes must be wider than the stroke")
  assert.ok(ch.width < 1, "chalk passes must be narrower than the stroke")
  assert.ok(BRUSHES.watercolor.alpha < BRUSHES.pen.alpha, "washes are translucent")
  assert.ok(BRUSHES.watercolor.width > BRUSHES.marker.width, "a wash is broad")
  assert.ok(ch.offset > wc.offset, "chalk is drier, so it displaces further")
  assert.ok(ch.passes > 1 && wc.passes > 1, "both need build-up to read as texture")
})

test("every texture is layered enough to read, and cheap enough to draw", () => {
  for (const k of BRUSH_KINDS) {
    const t = BRUSHES[k].texture
    if (!t) continue
    assert.ok(t.passes >= 1 && t.passes <= 6, `${k}: ${t.passes} passes is out of range`)
    assert.ok(t.alpha > 0 && t.alpha < 1, `${k}: texture alpha must be a fraction`)
    assert.ok(t.offset > 0, `${k}: a zero offset draws the same line twice`)
  }
})

test("the two new brushes persist like real ink", () => {
  // Only the laser is ephemeral. A wash you cannot keep is not a brush.
  assert.equal(BRUSHES.watercolor.persists, true)
  assert.equal(BRUSHES.chalk.persists, true)
})

test("only the laser is non-persisting", () => {
  // persists === false is what keeps a stroke out of history and out of the document,
  // so exactly one brush may carry it.
  const ephemeral = BRUSH_KINDS.filter((k) => !BRUSHES[k].persists)
  assert.deepEqual(ephemeral, ["laser"])
})

test("grain is stable for a stroke and different between strokes", () => {
  // Stability is the whole requirement: a re-roll per frame would make the texture
  // crawl across the stroke every time the board repaints.
  assert.equal(grainOffset(12345, 7), grainOffset(12345, 7))
  assert.notEqual(grainOffset(12345, 7), grainOffset(12345, 8), "varies along the path")
  assert.notEqual(grainOffset(12345, 7), grainOffset(999, 7), "varies between strokes")
})

test("grain offsets stay inside their stated range", () => {
  for (let seed = 1; seed < 400; seed += 7) {
    for (let i = 0; i < 40; i++) {
      const v = grainOffset(seed, i)
      assert.ok(v >= -1 && v <= 1, `offset ${v} out of range`)
    }
  }
})

test("the grain pass is straight segments, never a re-smoothed curve", () => {
  // It is a texture overlay on geometry the main pass already drew. Curving it would
  // fight the shape underneath.
  const calls: string[] = []
  const ctx = {
    moveTo: () => calls.push("moveTo"),
    lineTo: () => calls.push("lineTo"),
    quadraticCurveTo: () => calls.push("quad"),
  } as unknown as CanvasRenderingContext2D

  grainPath(ctx, [0, 0, 10, 0, 20, 10, 30, 10], 42, 1)
  assert.equal(calls.filter((c) => c === "quad").length, 0)
  assert.equal(calls[0], "moveTo")
  assert.equal(calls.length, 4, "one vertex per point")
})

test("successive texture passes actually scatter instead of stacking", () => {
  // Without the seed shift every pass lands on identical offsets and the passes pile
  // into one thicker line — more ink, no texture.
  let same = 0
  for (let i = 0; i < 40; i++) {
    if (grainOffset(1000, i) === grainOffset(1000 + PASS_SEED_STEP, i)) same++
  }
  assert.equal(same, 0, "pass 2 reproduced pass 1's offsets")
})

test("grain displaces points without running away from the stroke", () => {
  const moved: number[][] = []
  const ctx = {
    moveTo: (x: number, y: number) => moved.push([x, y]),
    lineTo: (x: number, y: number) => moved.push([x, y]),
  } as unknown as CanvasRenderingContext2D

  const pts = [0, 0, 10, 0, 20, 0]
  const amount = 2
  grainPath(ctx, pts, 7, amount)
  moved.forEach(([x, y], i) => {
    assert.ok(Math.abs(x - pts[i * 2]) <= amount, "x drifted past the grain amount")
    assert.ok(Math.abs(y - pts[i * 2 + 1]) <= amount, "y drifted past the grain amount")
  })
})
