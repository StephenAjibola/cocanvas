// node --test src/lib/theme.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  CANVAS_KEYS,
  FILL_SWATCHES,
  GRID_STYLES,
  THEMES,
  isGridStyle,
  isTheme,
  pickerSwatches,
} from "./theme.ts"
import { contrastRatio } from "./contrast.ts"

test("isTheme rejects everything that isn't a theme name", () => {
  // This guards the PATCH body on its way to the database column.
  for (const key of CANVAS_KEYS) assert.ok(isTheme(key), `${key} should be a theme`)
  for (const bad of ["DARK", "", "sepia", null, undefined, 0, {}, ["dark"]]) {
    assert.ok(!isTheme(bad), `${JSON.stringify(bad)} should not be a theme`)
  }
})

test("dark and light survive as keys, because rows in the database still say so", () => {
  // The whole reason the canvas set was widened in place instead of being renamed: every
  // board written before the panel existed holds one of these two strings. If either
  // ever stops being a valid key, those rows silently fall back to the default canvas —
  // so this is the test that would have to be deleted deliberately, not by accident.
  assert.ok(isTheme("dark"))
  assert.ok(isTheme("light"))
})

test("isGridStyle rejects everything that isn't a grid style", () => {
  for (const key of GRID_STYLES) assert.ok(isGridStyle(key), `${key} should be a grid style`)
  for (const bad of ["DOT", "", "grid", "isometric", null, undefined, 0, {}, ["dot"]]) {
    assert.ok(!isGridStyle(bad), `${JSON.stringify(bad)} should not be a grid style`)
  }
})

test("each theme keeps its ink readable against its own background", () => {
  // Not a contrast-ratio check — just the invariant the Logo established: a light
  // background gets dark elements and vice versa, so no theme can paint ink onto a
  // background of the same lightness.
  const lightness = (hex: string) =>
    [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0) / 3

  for (const [name, c] of Object.entries(THEMES)) {
    assert.ok(
      Math.abs(lightness(c.bg) - lightness(c.stroke)) > 100,
      `${name}: background and stroke are too close to tell apart`,
    )
    assert.ok(
      Math.abs(lightness(c.bg) - lightness(c.dot)) > 10,
      `${name}: grid dots vanish into the background`,
    )
  }
})

/**
 * The floor a stroke swatch must clear on BOTH boards.
 *
 * Not WCAG's 3:1 for graphics, and deliberately so: green (2.18) predates this test and
 * is a colour people actually want, so a 3:1 bar would fail the shipped palette rather
 * than describe it. 2.0 is the honest line — it is what the existing palette already
 * holds, and it still rejects the swatches that prompted this test. Raising it means
 * retuning green and blue too, which is a palette decision, not a test tweak.
 */
const SWATCH_FLOOR = 2

test("every preset stroke swatch is visible on EVERY canvas", () => {
  // A pen colour outlives the canvas it was chosen in — the background can be changed at
  // any time and the stroke keeps its colour — so a swatch that only works on one canvas
  // is a trap. Bright yellow (#eab308) scores 1.84 on the white board and was rejected
  // here; the shipped #ca8a04 is what passing looks like.
  //
  // Widened from the original two backgrounds to all five when the canvas panel landed,
  // and that is the point: the light-grey, light-blue and cream canvases are DARKER than
  // white, so every mid-tone swatch scores worse on them than on the board this palette
  // was originally tuned against. A new canvas colour that squeezes the palette shows up
  // here rather than as an invisible stroke.
  for (const theme of CANVAS_KEYS) {
    for (const s of pickerSwatches(theme)) {
      for (const key of CANVAS_KEYS) {
        const against = THEMES[key].bg
        // The canvas-aware default is exempt against every OTHER canvas: it IS this
        // canvas's ink, and it is replaced the moment the background changes.
        if (s.label === "Default" && key !== theme) continue
        assert.ok(
          contrastRatio(s.color, against) >= SWATCH_FLOOR,
          `${s.label} (${s.color}) scores ${contrastRatio(s.color, against).toFixed(2)} on ${key} (${against})`,
        )
      }
    }
  }
})

test("fill-only swatches are the ones that could NOT be stroke swatches", () => {
  // Cream and near-black exist precisely because a large filled area, bounded by its
  // own outline, reads fine in a colour that would vanish as a hairline. If one of
  // these ever cleared the stroke floor on both boards it belongs in SWATCHES instead,
  // and this test says so rather than letting the split quietly stop meaning anything.
  for (const s of FILL_SWATCHES) {
    const worst = Math.min(...CANVAS_KEYS.map((k) => contrastRatio(s.color, THEMES[k].bg)))
    assert.ok(worst < SWATCH_FLOOR, `${s.label} belongs in SWATCHES, not FILL_SWATCHES`)
  }
})

test("the picker offers a curated row, not an unbounded list", () => {
  // 7-8 presets plus the custom escape hatch. A palette that grows past this stops
  // being a quick pick and the custom picker is what covers the long tail.
  for (const theme of CANVAS_KEYS) {
    const n = pickerSwatches(theme).length
    assert.ok(n >= 7 && n <= 8, `${theme} offers ${n} presets`)
    // Theme ink first, so returning to the default is one click.
    assert.equal(pickerSwatches(theme)[0].color, THEMES[theme].stroke)
  }
})
