// node --test src/lib/notes.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  DROP_SCALE,
  type Note,
  STICKY_COLORS,
  dropStyle,
  hitsNote,
  inkFor,
  noteBounds,
  translateNote,
  wrapText,
} from "./notes.ts"
import { READABLE, contrastRatio } from "./contrast.ts"
import { THEMES } from "./theme.ts"
import type { Stroke } from "./strokes.ts"
import {
  type BoardObject,
  LABEL_MIN,
  OPPOSITE,
  cloneObject,
  handlesFor,
  hitsObject,
  hitsSweep,
  isLabelable,
  objectBounds,
  pickLabelTarget,
  pickObject,
  readGeom,
  scaleGeometry,
  textBoxFor,
  toLocal,
  toWorldPoint,
  translateObject,
  writeGeom,
} from "./objects.ts"

const note = (id: string, x = 0, y = 0): Note => ({
  id,
  type: "note",
  x,
  y,
  w: 160,
  h: 160,
  color: "#fde68a",
  text: "",
  createdAt: 0,
})

const stroke = (id: string, points: number[]): Stroke => ({
  id,
  type: "stroke",
  points,
  color: "#fff",
  width: 2,
  createdAt: 0,
})

// One unit per character. Crude on purpose — it makes the expected wrap points
// countable by hand, which a real font metric would not.
const measure = (s: string) => s.length

test("wrapping breaks on spaces and keeps every word", () => {
  const lines = wrapText("the quick brown fox", 10, measure)
  for (const l of lines) assert.ok(measure(l) <= 10, `"${l}" overflows`)
  assert.equal(lines.join(" "), "the quick brown fox", "no word lost or duplicated")
})

test("explicit newlines survive, including blank lines", () => {
  // Enter in the textarea has to reach the canvas, or a typed paragraph break vanishes.
  assert.deepEqual(wrapText("a\n\nb", 10, measure), ["a", "", "b"])
})

test("a word wider than the note is force-broken rather than clipped", () => {
  const lines = wrapText("supercalifragilistic", 6, measure)
  for (const l of lines) assert.ok(measure(l) <= 6, `"${l}" overflows`)
  assert.equal(lines.join(""), "supercalifragilistic", "every character survives")
  assert.ok(lines.length > 1)
})

test("wrapping terminates on pathological input", () => {
  // A width narrower than one character must not spin forever.
  const lines = wrapText("abc def", 0, measure)
  assert.ok(lines.length >= 6)
  assert.equal(lines.join("").replace(/ /g, ""), "abcdef")
})

test("empty text produces one empty line, not zero", () => {
  // Zero lines would make the caret row ambiguous once the note renders.
  assert.deepEqual(wrapText("", 100, measure), [""])
})

test("every sticky color carries readable ink", () => {
  // Real WCAG contrast via the shared module — so this asserts against the same
  // implementation shapes use, rather than a second copy that could drift from it.
  assert.ok(STICKY_COLORS.length >= 8, "the palette is meant to offer a real choice")
  for (const c of STICKY_COLORS) {
    const r = contrastRatio(c.fill, c.ink)
    assert.ok(r >= READABLE, `${c.name}: ink on fill is only ${r.toFixed(1)}:1`)
  }
})

test("a fill outside the table still gets ink that can be read on it", () => {
  // Synced or future swatches never reach the hand-tuned pairs.
  for (const fill of ["#000000", "#ffffff", "#1e40af", "#fde047"]) {
    const r = contrastRatio(fill, inkFor(fill))
    assert.ok(r >= READABLE, `${fill}: computed ink is only ${r.toFixed(1)}:1`)
  }
})

test("fills are distinct, so two swatches never look like the same note", () => {
  const fills = STICKY_COLORS.map((c) => c.fill.toLowerCase())
  assert.equal(new Set(fills).size, fills.length)
})

test("ink lookup is case-insensitive, and the fallback follows the fill", () => {
  assert.equal(inkFor("#FDE68A"), "#422006", "the hand-tuned pair still wins")
  // No longer a fixed near-black: an unknown DARK fill has to get light ink, which is
  // the whole point of computing the fallback instead of hardcoding one.
  assert.equal(inkFor("#123456"), "#fafafa", "dark fill -> light ink")
  assert.equal(inkFor("#eeeeee"), "#171717", "light fill -> dark ink")
})

test("the drop lands exactly at rest, and starts smaller and softer", () => {
  const start = dropStyle(0)
  assert.equal(start.scale, DROP_SCALE)
  assert.ok(start.alpha < 1)

  const end = dropStyle(1)
  assert.equal(end.scale, 1, "must land at true size, or notes settle wrong")
  assert.equal(end.alpha, 1)
})

test("the drop's overshoot is not flattened, but opacity still clamps", () => {
  // back.out drives t past 1 mid-flight. Scale has to follow it to read as a bounce;
  // alpha above 1 is meaningless and must clamp.
  const over = dropStyle(1.12)
  assert.ok(over.scale > 1, "overshoot was clamped away")
  assert.equal(over.alpha, 1)
})

test("a note is hit anywhere inside it, and slop reaches past the edge", () => {
  const n = note("n", 100, 100)
  assert.ok(hitsNote(n, 180, 180, 0), "dead centre")
  assert.ok(hitsNote(n, 100, 100, 0), "top-left corner counts")
  assert.ok(!hitsNote(n, 95, 180, 0), "outside with no slop")
  assert.ok(hitsNote(n, 95, 180, 6), "outside but within slop")
})

test("a note's bounds are its box, with no ink padding", () => {
  assert.deepEqual(noteBounds(note("n", 10, 20)), {
    minX: 10,
    minY: 20,
    maxX: 170,
    maxY: 180,
  })
})

test("translating a note moves x and y independently", () => {
  const n = note("n", 10, 20)
  translateNote(n, 5, -3)
  assert.deepEqual([n.x, n.y], [15, 17])
})

test("picking returns the topmost object, whatever kind it is", () => {
  // The regression the union has to survive: a note dropped over a stroke must take
  // the click, and a stroke drawn over a note must take it back.
  const s = stroke("s", [0, 0, 100, 0])
  const n = note("n", 0, -50)

  assert.equal(pickObject([s, n], 50, 0, 1)?.id, "n", "note painted last wins")
  assert.equal(pickObject([n, s], 50, 0, 1)?.id, "s", "stroke painted last wins")
  assert.equal(pickObject([s, n], 900, 900, 1), null)
})

const labelled = (id: string, points: number[], color = "#ef4444"): Stroke => ({
  id,
  type: "stroke",
  points,
  color,
  width: 2,
  createdAt: 0,
  shape: "rect",
  text: "hi",
})

test("a shape's label is centred in its bounds, a note's is top-left", () => {
  const box = textBoxFor(labelled("s", [0, 0, 100, 0, 100, 60, 0, 60, 0, 0]), "dark")!
  assert.equal(box.align, "center")
  assert.equal(box.valign, "middle")
  // Centre of the box must equal centre of the shape's bounds.
  assert.equal(box.x + box.w / 2, 50)
  assert.equal(box.y + box.h / 2, 30)

  const n = textBoxFor(note("n", 10, 20), "dark")!
  assert.equal(n.align, "left")
  assert.equal(n.valign, "top")
  assert.ok(n.x > 10 && n.y > 20, "inset by the note's padding")
})

test("freehand strokes cannot hold text", () => {
  // No `shape`, so no interior to write in — and nothing should offer to.
  const freehand: Stroke = {
    id: "f",
    type: "stroke",
    points: [0, 0, 10, 10, 20, 5],
    color: "#fff",
    width: 2,
    createdAt: 0,
  }
  assert.equal(isLabelable(freehand), false)
  assert.equal(textBoxFor(freehand, "dark"), null)
  assert.equal(pickLabelTarget([freehand], 10, 10), null)
})

test("a label keeps a readable ink whatever the shape's color", () => {
  // The free color input reaches near-black, which on the dark board must fall back to
  // the theme ink rather than paint text nobody can see.
  const rect = [0, 0, 100, 0, 100, 60, 0, 60, 0, 0]
  const dark = textBoxFor(labelled("a", rect, "#000000"), "dark")!
  assert.equal(dark.ink, THEMES.dark.stroke, "near-black must not survive on a dark board")
  assert.ok(contrastRatio(dark.ink, THEMES.dark.bg) >= READABLE)

  // A color that IS legible is kept, so labels read as part of their shape.
  const red = textBoxFor(labelled("b", rect, "#ef4444"), "dark")!
  assert.equal(red.ink, "#ef4444")

  // And the mirror case on the light board.
  const light = textBoxFor(labelled("c", rect, "#fafafa"), "light")!
  assert.ok(contrastRatio(light.ink, THEMES.light.bg) >= READABLE)
})

test("a degenerate shape still gets a usable text box", () => {
  // A perfectly horizontal line has zero height; without a floor the wrap width would
  // collapse and hard-break every character.
  const flat = textBoxFor(labelled("l", [0, 0, 200, 0]), "dark")!
  assert.ok(flat.w >= LABEL_MIN, `width collapsed to ${flat.w}`)
  assert.ok(flat.h > 0, `height collapsed to ${flat.h}`)

  const vertical = textBoxFor(labelled("v", [0, 0, 0, 200]), "dark")!
  assert.ok(vertical.w >= LABEL_MIN, `width collapsed to ${vertical.w}`)
})

test("a label travels with its shape when dragged", () => {
  // Requirement 5: the box is derived from the shape's bounds every frame, so nothing
  // has to move the text separately. This pins that it actually holds.
  const s = labelled("s", [0, 0, 100, 0, 100, 60, 0, 60, 0, 0])
  const before = textBoxFor(s, "dark")!
  translateObject(s, 37, -19)
  const after = textBoxFor(s, "dark")!

  assert.equal(after.x - before.x, 37)
  assert.equal(after.y - before.y, -19)
  assert.equal(after.w, before.w, "size must not drift on a pure move")
  assert.equal(after.h, before.h)
})

test("double-click targets a shape's interior, selection still needs its outline", () => {
  // The deliberate asymmetry: labelling anywhere inside, but clicking open interior
  // with the Shapes tool armed must still start a new shape, so nesting stays possible.
  const s = labelled("s", [0, 0, 100, 0, 100, 60, 0, 60, 0, 0])
  assert.equal(pickLabelTarget([s], 50, 30)?.id, "s", "interior opens the label")
  assert.equal(pickObject([s], 50, 30, 1), null, "interior is not a selection hit")
  assert.equal(pickObject([s], 0, 30, 1)?.id, "s", "the outline is")
  assert.equal(pickLabelTarget([s], 500, 500), null, "outside hits nothing")
})

test("a clone is independent of its original", () => {
  // Shared state between a copy and its source is the classic duplicate bug: dragging
  // one would move both, and history would fight over a single object.
  const s = labelled("s", [0, 0, 100, 0, 100, 60, 0, 60, 0, 0])
  const copy = cloneObject(s, 20, 30)

  assert.notEqual(copy.id, s.id, "a shared id would break selection and history")
  assert.notEqual(copy.createdAt, s.createdAt, "a copy re-seeds its brush grain")

  const a = objectBounds(s)
  const b = objectBounds(copy)
  assert.equal(b.minX - a.minX, 20)
  assert.equal(b.minY - a.minY, 30)

  // The deep copy is what matters: points must not be a shared array.
  translateObject(copy, 500, 500)
  assert.deepEqual(objectBounds(s), a, "moving the copy moved the original")
})

test("cloning a note copies its text and leaves the original alone", () => {
  const n = note("n", 10, 20)
  n.text = "hello"
  const copy = cloneObject(n, 5, 5) as typeof n

  assert.equal(copy.text, "hello")
  copy.text = "changed"
  assert.equal(n.text, "hello", "text is shared between the copies")
})

test("locking travels with a clone but never with the original's identity", () => {
  const s = labelled("s", [0, 0, 10, 0, 10, 10, 0, 10, 0, 0])
  s.locked = true
  const copy = cloneObject(s, 1, 1)
  assert.equal(copy.locked, true, "a duplicate of a locked object is still locked")
  assert.notEqual(copy.id, s.id)
})

const rect = (id: string, x0 = 0, y0 = 0, x1 = 100, y1 = 60): Stroke => ({
  id,
  type: "stroke",
  points: [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0],
  color: "#fff",
  width: 0,
  createdAt: 0,
  shape: "rect",
})

test("a rotated object is hit where it LOOKS, not where its points are", () => {
  // The query point is inverse-rotated instead of the geometry being rewritten, so
  // every existing hit test keeps working. This pins that the indirection is real.
  // A wide flat bar centred on the origin. Points are the OUTLINE, so the probes sit on
  // an edge — an interior point correctly misses either way.
  const s = rect("s", -50, -10, 50, 10)
  assert.ok(hitsObject(s, 0, -10, 1), "unrotated: hits the top edge")
  assert.ok(!hitsObject(s, 10, 0, 1), "unrotated: (10,0) is interior, so no hit")

  // Standing it upright maps the old top edge onto x = +10.
  s.angle = Math.PI / 2
  assert.ok(hitsObject(s, 10, 0, 1), "rotated: that edge is now where (10,0) is")
  assert.ok(!hitsObject(s, 0, -10, 1), "rotated: the edge has left its old position")
})

test("rotation leaves the geometry itself untouched", () => {
  // The reason rotation is a field: a rewritten rect stops being axis-aligned while
  // `shape` still claims it is, breaking the sharp-corner invariant.
  const s = rect("s")
  const before = [...s.points]
  s.angle = 0.7

  assert.deepEqual(s.points, before, "points must not be rewritten by a rotation")
  const xs = new Set(s.points.filter((_, i) => i % 2 === 0))
  assert.equal(xs.size, 2, "still axis-aligned, so it still renders sharp corners")
})

test("local and world round-trip through the rotation", () => {
  const s = rect("s", 0, 0, 80, 40)
  s.angle = 0.9
  const w = toWorldPoint(s, 12, 34)
  const back = toLocal(s, w.x, w.y)
  assert.ok(Math.abs(back.x - 12) < 1e-9 && Math.abs(back.y - 34) < 1e-9)
})

test("resize remaps geometry onto the new box, anchored on the opposite corner", () => {
  const s = rect("s", 0, 0, 100, 60)
  const from = objectBounds(s)
  // Drag the SE corner out to (200,180); NW stays put.
  scaleGeometry(s, from, { minX: 0, minY: 0, maxX: 200, maxY: 180 })

  const b = objectBounds(s)
  assert.deepEqual([b.minX, b.minY, b.maxX, b.maxY], [0, 0, 200, 180])
  const xs = new Set(s.points.filter((_, i) => i % 2 === 0))
  assert.equal(xs.size, 2, "a scaled rectangle is still a rectangle")
})

test("resizing a note changes its box rather than its points", () => {
  const n = note("n", 10, 20)
  scaleGeometry(n, objectBounds(n), { minX: 0, minY: 0, maxX: 80, maxY: 40 })
  assert.deepEqual([n.x, n.y, n.w, n.h], [0, 0, 80, 40])
})

test("a degenerate source box is left alone instead of producing NaN", () => {
  // Dividing by a zero-width box would blow every coordinate to NaN and the object
  // would vanish with no way back.
  const s = rect("s", 5, 5, 5, 5)
  scaleGeometry(s, objectBounds(s), { minX: 0, minY: 0, maxX: 50, maxY: 50 })
  assert.ok(s.points.every(Number.isFinite), "geometry went non-finite")
})

test("handles sit on the corners, with the rotate grip clear of the top edge", () => {
  const s = rect("s", 0, 0, 100, 60)
  const h = handlesFor(s, 20)

  assert.deepEqual(h.nw, { x: 0, y: 0 })
  assert.deepEqual(h.ne, { x: 100, y: 0 })
  assert.deepEqual(h.se, { x: 100, y: 60 })
  assert.deepEqual(h.sw, { x: 0, y: 60 })
  assert.deepEqual(h.rotate, { x: 50, y: -20 }, "above the top edge, centred")

  // Each corner's anchor is the one diagonally across from it.
  assert.equal(OPPOSITE.nw, "se")
  assert.equal(OPPOSITE.ne, "sw")
  assert.equal(OPPOSITE.se, "nw")
  assert.equal(OPPOSITE.sw, "ne")
})

test("a geometry snapshot round-trips without swapping the points array", () => {
  // writeGeom must refill the SAME array — the draw loop holds that exact reference.
  const s = rect("s", 0, 0, 100, 60)
  const snap = readGeom(s)
  const identity = s.points

  s.angle = 1.2
  scaleGeometry(s, objectBounds(s), { minX: 0, minY: 0, maxX: 10, maxY: 10 })
  writeGeom(s, snap)

  assert.equal(s.points, identity, "the points array was replaced, not refilled")
  assert.deepEqual(s.points, [0, 0, 100, 0, 100, 60, 0, 60, 0, 0])
  assert.equal(s.angle, undefined, "angle restored to its original absence")
})

test("a fast eraser swipe still catches a shape it passes over", () => {
  // The shipped bug. Point-sampling only tested where the pointer landed, so a quick
  // swipe stepped clean over a rectangle's two thin edge bands. A pen stroke is ink
  // along its whole length and got caught anyway — which is exactly why the eraser
  // looked like it worked on strokes but not on shapes.
  const r = 14
  const shape = rect("s", 0, 0, 200, 120)

  const swipe = (o: BoardObject, step: number) => {
    let prev = { x: -60, y: 60 }
    for (let x = -60 + step; x <= 320; x += step) {
      const p = { x, y: 60 }
      if (hitsSweep(o, prev, p, r)) return true
      prev = p
    }
    return false
  }

  for (const step of [4, 12, 30, 60, 120, 240]) {
    assert.ok(swipe(shape, step), `a swipe at ${step}px per sample missed the shape`)
  }
})

test("the sweep catches every object kind, rotated included", () => {
  const r = 14
  const from = { x: -60, y: 60 }
  const to = { x: 320, y: 60 }

  const rotated = rect("r", 0, 0, 200, 120)
  rotated.angle = Math.PI / 6
  const n = note("n", 0, 0)
  n.h = 160
  const freehand: Stroke = {
    id: "f",
    type: "stroke",
    points: [0, 55, 100, 62, 200, 58],
    color: "#fff",
    width: 2,
    createdAt: 0,
  }

  assert.ok(hitsSweep(rect("a", 0, 0, 200, 120), from, to, r), "flat shape")
  assert.ok(hitsSweep(rotated, from, to, r), "rotated shape")
  assert.ok(hitsSweep(n, from, to, r), "note")
  assert.ok(hitsSweep(freehand, from, to, r), "pen stroke")
})

test("the sweep does not reach objects it never passed", () => {
  // A wider band must not become an indiscriminate one.
  const r = 14
  const far = rect("far", 0, 900, 200, 1000)
  assert.ok(!hitsSweep(far, { x: -60, y: 60 }, { x: 320, y: 60 }, r))
})

test("a stationary press still erases what is under it", () => {
  // from === to is the pointerdown case, and must not degenerate to testing nothing.
  const r = 14
  const s = rect("s", 0, 0, 200, 120)
  const on = { x: 100, y: 0 }
  assert.ok(hitsSweep(s, on, on, r), "a press on the edge")
  // Was asserted the other way round, and that was the bug: a sweep through the middle
  // of a hollow shape hit nothing, so the eraser slid straight through a rectangle while
  // deleting every pen stroke in the same gesture. The eraser treats a closed shape as
  // solid; only SELECTION keeps the outline-only test, so nesting still works.
  const off = { x: 100, y: 60 }
  assert.ok(hitsSweep(s, off, off, r), "a press in the hollow middle erases the shape")
})

test("erasing through a hollow shape's interior removes it", () => {
  // The reported bug, as the gesture that produced it: a drag that stays wholly inside
  // an unfilled shape and never comes within reach of an edge.
  const r = 14
  const inside = [
    { x: 40, y: 60 },
    { x: 160, y: 60 },
  ] as const
  assert.ok(hitsSweep(rect("r", 0, 0, 200, 120), inside[0], inside[1], r), "unfilled rect")

  const big = rect("big", 0, 0, 600, 400)
  assert.ok(hitsSweep(big, { x: 100, y: 200 }, { x: 500, y: 200 }, r), "large rect")

  const spun = rect("spun", 0, 0, 200, 120)
  spun.angle = 0.52
  assert.ok(hitsSweep(spun, inside[0], inside[1], r), "rotated rect")
})

test("selection still ignores a hollow shape's interior, so nesting survives", () => {
  // The other half of the eraser fix: pickObject must NOT inherit solidity, or drawing
  // a shape inside another shape would select the outer one instead of starting a new one.
  const s = rect("s", 0, 0, 200, 120)
  assert.ok(!hitsObject(s, 100, 60, 6), "interior is not a selection hit")
  assert.ok(hitsObject(s, 100, 0, 6), "its outline still is")
})

test("the dispatchers route each kind to its own implementation", () => {
  const objects: BoardObject[] = [stroke("s", [0, 0, 10, 10]), note("n", 0, 0)]

  translateObject(objects[0], 5, 5)
  translateObject(objects[1], 5, 5)

  // A stroke's box is outset by half its 2-unit width; a note's is exact. Same call,
  // two different correct answers — which is the point of the dispatch.
  assert.deepEqual(objectBounds(objects[0]), { minX: 4, minY: 4, maxX: 16, maxY: 16 })
  assert.deepEqual(objectBounds(objects[1]), { minX: 5, minY: 5, maxX: 165, maxY: 165 })
})
