// node --test src/lib/text-format.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  BULLET,
  bulletIndent,
  fontString,
  marksOf,
  normalizeAlign,
  sameMarks,
  textIndent,
} from "./text-format.ts"

const FAMILY = "system-ui, sans-serif"

test("the font shorthand is built in the order CSS actually parses", () => {
  // `style weight size family`. Any other order makes the whole declaration invalid,
  // and canvas responds by silently keeping its previous font — so the bug presents as
  // "bold does nothing" rather than as an error anyone can see.
  assert.equal(fontString(16, FAMILY, {}), `16px ${FAMILY}`)
  assert.equal(fontString(16, FAMILY, { bold: true }), `600 16px ${FAMILY}`)
  assert.equal(fontString(16, FAMILY, { italic: true }), `italic 16px ${FAMILY}`)
  assert.equal(
    fontString(16, FAMILY, { bold: true, italic: true }),
    `italic 600 16px ${FAMILY}`,
  )
})

test("underline and list do not leak into the font string", () => {
  // They are painted, not typeset. A stray token here would invalidate the shorthand
  // and take bold and italic down with it.
  assert.equal(fontString(20, FAMILY, { underline: true, list: true }), `20px ${FAMILY}`)
})

test("an unrecognised align folds to a real one instead of reaching the canvas", () => {
  for (const bad of ["justify", "", null, undefined, 7, {}]) {
    assert.equal(normalizeAlign(bad), "left")
  }
  for (const good of ["left", "center", "right"] as const) {
    assert.equal(normalizeAlign(good), good)
  }
  assert.equal(normalizeAlign(undefined, "center"), "center", "fallback is respected")
})

test("the bullet indent scales with the font", () => {
  // A 40px heading's bullet sitting as close as a 12px note's would collide with it.
  assert.ok(bulletIndent(40) > bulletIndent(12))
  assert.ok(bulletIndent(16) > 0)
})

test("indent is zero unless the list mark is on", () => {
  // The painter reduces its wrap width by this and the editor pads by it. If they ever
  // disagreed the text would reflow the moment you blurred the editor.
  assert.equal(textIndent(16, {}), 0)
  assert.equal(textIndent(16, { bold: true }), 0)
  assert.equal(textIndent(16, { list: true }), bulletIndent(16))
})

test("sameMarks treats absent and false as the same state", () => {
  // Absence IS the off state everywhere else in this codebase, so a toggle that writes
  // `false` and one that deletes the key must not read as a change worth an undo step.
  assert.ok(sameMarks({}, { bold: false, italic: false, underline: false, list: false }))
  assert.ok(sameMarks({ align: undefined }, { align: "left" }), "left is the default align")
  assert.ok(!sameMarks({}, { bold: true }))
  assert.ok(!sameMarks({ align: "center" }, { align: "right" }))
})

test("marksOf carries only marks, never the rest of the object", () => {
  // It is spread into history deltas and onChange payloads. Anything else riding along
  // would be silently written back onto the object.
  const o = { bold: true, align: "center" as const, text: "hello", x: 5, color: "#000" }
  assert.deepEqual(marksOf(o), {
    bold: true,
    italic: undefined,
    underline: undefined,
    list: undefined,
    align: "center",
  })
})

test("the bullet is a real glyph, not an asterisk standing in for one", () => {
  assert.equal(BULLET, "•")
})
