// node --test src/lib/settle.test.ts
// Covers the one link the browser probe can't reach: a hidden tab freezes GSAP's
// rAF ticker, so "does GSAP actually drive t from 0 to 1" has to be proven here.
import { test } from "node:test"
import assert from "node:assert/strict"
import gsap from "gsap"
import { settleStyle } from "./strokes.ts"

test("gsap advances the settle value through intermediate states", async () => {
  const state = { t: 0 }
  const samples: number[] = []

  const finished = new Promise<string>((resolve) => {
    gsap.to(state, {
      t: 1,
      duration: 0.25,
      ease: "power3.out",
      onUpdate: () => samples.push(state.t),
      onComplete: () => resolve("complete"),
    })
  })
  const timeout = new Promise<string>((r) => setTimeout(() => r("timed out"), 3000))
  assert.equal(await Promise.race([finished, timeout]), "complete")

  assert.ok(samples.length > 3, `expected several updates, got ${samples.length}`)
  assert.ok(
    samples.some((v) => v > 0.01 && v < 0.99),
    "tween jumped straight to the end — no visible transition",
  )
  assert.equal(state.t, 1, "must land exactly on 1, or strokes stay permanently wet")

  // The values GSAP produces must map to a monotonic firming-up.
  const widths = samples.map((t) => settleStyle(t, 10).width)
  assert.ok(
    widths.every((w, i) => i === 0 || w <= widths[i - 1]),
    "width did not shrink monotonically across real tween samples",
  )
})
