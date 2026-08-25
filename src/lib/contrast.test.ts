// node --test src/lib/contrast.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { READABLE, contrastRatio, readableInk, relativeLuminance } from "./contrast.ts"
import { THEMES } from "./theme.ts"

test("luminance anchors on the ends of the scale", () => {
  assert.equal(relativeLuminance("#000000"), 0)
  assert.equal(relativeLuminance("#ffffff"), 1)
})

test("channels are weighted for the eye, not averaged", () => {
  // Same nominal value in each channel, wildly different perceived brightness. An
  // average-the-bytes proxy would score these identically — the exact mistake this
  // module exists to avoid.
  const g = relativeLuminance("#00ff00")
  const b = relativeLuminance("#0000ff")
  assert.ok(g > 0.7, `green should dominate luminance, got ${g}`)
  assert.ok(b < 0.1, `blue should barely register, got ${b}`)
  assert.ok(g > b * 9)
})

test("the ratio spans the full 1..21 range", () => {
  assert.ok(Math.abs(contrastRatio("#000000", "#ffffff") - 21) < 1e-9)
  assert.equal(contrastRatio("#123456", "#123456"), 1)
  // Symmetric: order of arguments must not matter.
  assert.equal(contrastRatio("#000000", "#ffffff"), contrastRatio("#ffffff", "#000000"))
})

test("shorthand hex parses the same as longhand", () => {
  assert.equal(relativeLuminance("#fff"), relativeLuminance("#ffffff"))
  assert.equal(relativeLuminance("f00"), relativeLuminance("#ff0000"))
})

test("an unparseable color scores zero rather than passing as readable", () => {
  // Fails safe: 0 is below every threshold, so callers fall back instead of painting
  // text nobody can see.
  for (const bad of ["", "#12345", "rgb(1,2,3)", "nonsense", "#gggggg"]) {
    assert.equal(contrastRatio(bad, "#ffffff"), 0, `${bad} should not score`)
  }
  assert.equal(readableInk("not-a-color", "#0a0a0a", "#ededed"), "#ededed")
})

test("readableInk keeps a legible color and drops an illegible one", () => {
  const dark = THEMES.dark.bg
  const light = THEMES.light.bg

  // Near-black on the dark board is exactly what the free color input makes reachable.
  assert.equal(readableInk("#000000", dark, "#ededed"), "#ededed", "must reject")
  assert.equal(readableInk("#ffffff", dark, "#ededed"), "#ffffff", "must keep")
  // And the mirror case on the light board.
  assert.equal(readableInk("#fafafa", light, "#171717"), "#171717", "must reject")
  assert.equal(readableInk("#171717", light, "#171717"), "#171717", "must keep")
})

test("each theme's own ink clears the bar on its own background", () => {
  for (const [name, c] of Object.entries(THEMES)) {
    const r = contrastRatio(c.stroke, c.bg)
    assert.ok(r >= READABLE, `${name}: theme ink is only ${r.toFixed(1)}:1 on its bg`)
  }
})
