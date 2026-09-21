// node --test src/lib/motion.test.ts
//
// The same gap settle.test.ts covers, for the three motions added in the motion pass:
// a hidden tab freezes GSAP's rAF ticker, so "does this actually animate, and through
// what values" cannot be answered from a browser probe and is answered here instead.
//
// These assert SHAPE, not exact frames — frame count depends on the machine. What they
// pin is what a reviewer would otherwise have to take on trust: that the tween passes
// through intermediate states rather than jumping, that it lands exactly at rest, and
// that the direction of travel is the one the feature claims.
import { test } from "node:test"
import assert from "node:assert/strict"
import gsap from "gsap"
import {
  DIE_DURATION,
  DIE_EASE,
  DROP_DURATION,
  DROP_EASE,
  DROP_SCALE,
  LIFT_DURATION,
  LIFT_EASE,
  LIFT_SCALE,
  SHAPE_DROP_SCALE,
  dieStyle,
  dropStyle,
  liftStyle,
} from "./notes.ts"
import {
  REVEAL_DURATION,
  REVEAL_EASE,
  REVEAL_FROM,
  REVEAL_HERO_IMAGE_DELAY,
  REVEAL_STAGGER,
  revealSides,
} from "./motion.ts"

/**
 * Steps a real tween (real ease, real duration) through 30 evenly spaced frames.
 *
 * Stepped by hand rather than left to GSAP's ticker: in Node the ticker runs on timers,
 * and on a loaded machine a 150ms tween can finish in two ticks — which failed the
 * "several frames" checks below for reasons that had nothing to do with the motion.
 */
async function samples(from: number, to: number, duration: number, ease: string) {
  const state = { t: from }
  const tween = gsap.to(state, { t: to, duration, ease, paused: true })
  const out: number[] = []
  for (let i = 1; i <= 30; i++) {
    tween.progress(i / 30)
    out.push(state.t)
  }
  return { samples: out, final: state.t }
}

test("the sticky drop overshoots and settles, and lands at exactly full size", async () => {
  const { samples: s, final } = await samples(0, 1, DROP_DURATION, DROP_EASE)
  assert.ok(s.length > 3, `expected several frames, got ${s.length}`)
  assert.equal(final, 1, "must land at rest, or a sticky stays the wrong size")

  const scales = s.map((t) => dropStyle(t).scale)
  // The overshoot is the whole point of back.out — without it this is just a grow.
  assert.ok(Math.max(...scales) > 1, "no overshoot: the drop reads as inflating, not landing")
  // ...but a SLIGHT one. More than a few percent past full size is the "bouncy and
  // distracting" failure this pass was explicitly asked to avoid.
  assert.ok(Math.max(...scales) < 1.05, `overshoot too big: ${Math.max(...scales)}`)
  assert.ok(scales[0] >= DROP_SCALE && scales[0] < 1, "did not start smaller than rest")
  assert.equal(dropStyle(1).scale, 1)

  // Shapes and arrows ride the same curve from a shorter start: same rest, smaller kick.
  const shapeScales = s.map((t) => dropStyle(t, SHAPE_DROP_SCALE).scale)
  assert.ok(Math.max(...shapeScales) > 1 && Math.max(...shapeScales) < 1.02)
  assert.equal(dropStyle(1, SHAPE_DROP_SCALE).scale, 1)
})

test("the delete exit shrinks and fades, and ends fully invisible", async () => {
  const { samples: s, final } = await samples(1, 0, DIE_DURATION, DIE_EASE)
  assert.ok(s.length > 3, `expected several frames, got ${s.length}`)
  assert.equal(final, 0)

  const alphas = s.map((t) => dieStyle(t).alpha)
  assert.ok(
    alphas.every((a, i) => i === 0 || a <= alphas[i - 1]),
    "alpha did not fall monotonically — the object flickers on its way out",
  )
  assert.equal(dieStyle(0).alpha, 0, "a deleted object must end fully transparent")
  // Shrinks, but nowhere near zero: vanishing to a point reads as flying away.
  assert.ok(dieStyle(0).scale > 0.8 && dieStyle(0).scale < 1)
})

test("the drag lift rises to 2% and returns exactly to rest", async () => {
  const up = await samples(0, 1, LIFT_DURATION, LIFT_EASE)
  assert.ok(up.samples.some((t) => t > 0.01 && t < 0.99), "lift jumped straight to the top")
  assert.equal(liftStyle(up.final).scale, LIFT_SCALE)

  const down = await samples(1, 0, LIFT_DURATION, LIFT_EASE)
  // Landing exactly on 1 matters more than the curve: any residue here leaves every
  // dropped object permanently a fraction too large, and it compounds per drag.
  assert.equal(liftStyle(down.final).scale, 1, "object did not return to true size")
  assert.equal(liftStyle(0).blur, 0, "shadow must be gone at rest")
})

test("lift and die never move an object's centre", () => {
  // Both are drawn through scaleAbout(centre), so the only thing that can shift an
  // object is a scale that does not resolve. Pinning the endpoints here is what makes
  // that claim checkable without a canvas.
  assert.equal(liftStyle(0).scale, 1)
  assert.equal(dieStyle(1).scale, 1)
  assert.equal(dropStyle(1).scale, 1)
})

// ── Landing page reveal ──────────────────────────────────────────────────────────────
// Same reason as above, doubled: these tweens are driven by ScrollTrigger, so answering
// "does the section actually arrive with motion" from a browser needs a real scroll in a
// real visible tab. What is checkable here is that the tween moves through intermediate
// values, lands clean, and travels in the direction each section claims.

test("a revealed section travels through intermediate values and lands at rest", async () => {
  const { samples: s, final } = await samples(0, 1, REVEAL_DURATION, REVEAL_EASE)
  assert.ok(s.length > 3, `expected several frames, got ${s.length}`)
  assert.ok(
    s.some((t) => t > 0.01 && t < 0.99),
    "reveal jumped straight to the end — the section pops in instead of animating",
  )
  // Anything short of exactly 1 leaves the section permanently offset or faded, which is
  // far worse than no animation: it is a page that renders subtly wrong forever.
  assert.equal(final, 1, "reveal did not land at rest")
})

test("a feature row's two halves converge instead of sliding the same way", () => {
  for (const flip of [false, true]) {
    const { text, image } = revealSides(flip)
    const tx = REVEAL_FROM[text].x
    const ix = REVEAL_FROM[image].x
    assert.equal(
      Math.sign(tx),
      -Math.sign(ix),
      `flip=${flip}: both halves enter from the same side, so the row slides rather than closing`,
    )
  }
  // Each half enters from the side it actually sits on, or it crosses the row to get home.
  assert.equal(revealSides(false).text, "left", "text is the left column when not flipped")
  assert.equal(revealSides(true).text, "right", "flip moves the text to the right column")
})

test("reveal travel stays in the 20-30px band, and the hero image follows its text", () => {
  for (const [dir, offset] of Object.entries(REVEAL_FROM)) {
    const px = Math.abs(("x" in offset ? offset.x : "y" in offset ? offset.y : 0) as number)
    if (dir === "scale") continue // resolves in place; no travel to bound
    assert.ok(px >= 20 && px <= 30, `${dir} travels ${px}px, outside the 20-30px band`)
  }
  // The picture must not beat the sentence: later than the last staggered line starts.
  assert.ok(
    REVEAL_HERO_IMAGE_DELAY > REVEAL_STAGGER * 2,
    "hero image arrives before the copy above it has finished",
  )
})
