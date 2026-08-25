// node --test src/lib/fill.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { type Stroke, hitsStroke, pointInPolygon } from "./strokes.ts"
import { SHAPE_KINDS, isFillable, shapePoints } from "./shapes.ts"
import { type BoardObject, cloneObject, textBoxFor } from "./objects.ts"
import { createHistory, type StylePatch } from "./history.ts"
import { contrastRatio, READABLE } from "./contrast.ts"
import { THEMES } from "./theme.ts"

const shape = (kind: Parameters<typeof shapePoints>[0], fill?: string): Stroke => ({
  id: "s1",
  type: "stroke",
  points: shapePoints(kind, 0, 0, 200, 120),
  color: "#3b82f6",
  width: 2,
  createdAt: 1,
  shape: kind,
  ...(fill ? { fill } : {}),
})

test("only closed shapes are fillable — never a line, never freehand ink", () => {
  assert.equal(isFillable(undefined), false, "a freehand stroke has no interior")
  assert.equal(isFillable("line"), false, "a line has no inside")
  for (const k of SHAPE_KINDS.filter((k) => k !== "line")) {
    assert.equal(isFillable(k), true, `${k} should be fillable`)
  }
})

test("no fill is the ABSENCE of the field, so old shapes are untouched", () => {
  const plain = shape("rect")
  assert.equal("fill" in plain, false, "an unfilled shape carries no fill key at all")
  // The whole point of absence-as-off: this is what every shape drawn before the
  // feature existed looks like, and it must render and hit-test exactly as before.
  assert.equal(JSON.stringify(plain).includes("fill"), false)
})

test("a filled shape is solid to the hit test, an unfilled one is not", () => {
  const inside = { x: 100, y: 60 } // dead centre, far from any edge
  assert.equal(hitsStroke(shape("rect"), inside.x, inside.y, 6), false, "outline-only")
  assert.equal(hitsStroke(shape("rect", "#ef4444"), inside.x, inside.y, 6), true, "solid")

  // Both stay grabbable by the edge — filling must not COST you the outline hit.
  for (const s of [shape("rect"), shape("rect", "#ef4444")]) {
    assert.equal(hitsStroke(s, 0, 60, 6), true, "left edge")
    assert.equal(hitsStroke(s, 400, 60, 6), false, "well outside")
  }
})

test("a filled LINE is still outline-only — fill can't make it solid", () => {
  // isFillable gates the hit test too, so a stray fill on a line (a synced object from
  // another client, say) cannot turn its degenerate bbox into a grab target.
  const line: Stroke = { ...shape("line"), points: [0, 0, 200, 0], fill: "#ef4444" }
  assert.equal(hitsStroke(line, 100, 60, 6), false)
  assert.equal(hitsStroke(line, 100, 0, 6), true, "still hit on the line itself")
})

test("point-in-polygon handles the concave shapes, not just boxes", () => {
  // A star's interior notches are the case a convex hull test would get wrong.
  const star = shapePoints("star", 0, 0, 200, 200)
  assert.equal(pointInPolygon(star, 100, 100), true, "centre is inside")
  assert.equal(pointInPolygon(star, 6, 6), false, "top-left corner is between points")

  // The notches BETWEEN the star's arms are the points that matter: each sits inside the
  // bounding box but outside the shape, which is exactly what a convex-hull test gets
  // wrong. (This used to probe an arrow's shaft-to-head notch too. An arrow is a straight
  // line now with no interior at all, so it has nothing left to be inside of — see
  // arrow.test.ts.)
  assert.equal(pointInPolygon(star, 100, 60), true, "up inside the top arm")
  assert.equal(pointInPolygon(star, 55, 120), false, "notch between two arms")
  assert.equal(pointInPolygon(star, 100, 175), false, "notch between the two legs")
})

test("fill and outline are independent, and both survive a clone", () => {
  const s = shape("rect", "#ef4444")
  s.color = "#000000"
  const copy = cloneObject(s, 10, 10) as Stroke
  assert.equal(copy.fill, "#ef4444")
  assert.equal(copy.color, "#000000", "outline is not overwritten by the fill")
  assert.notEqual(copy.id, s.id)
})

test("clearing a fill undoes back to the color it had", () => {
  // The presence-keyed patch. A `patch.fill !== undefined` snapshot would record
  // nothing here and undo would leave the shape unfilled forever.
  const s = shape("rect", "#ef4444")
  const objects: BoardObject[] = [s]
  const history = createHistory(objects)

  const patch: StylePatch = { fill: undefined }
  const before: StylePatch = {}
  if ("fill" in patch) before.fill = s.fill
  history.push({ kind: "style", id: s.id, before, after: { ...patch } })
  Object.assign(s, patch)
  assert.equal(s.fill, undefined, "fill cleared")

  history.undo()
  assert.equal(s.fill, "#ef4444", "undo restored the fill")
  history.redo()
  assert.equal(s.fill, undefined, "redo cleared it again")
})

test("a label on a filled shape stays readable against the FILL", () => {
  // The assumption this feature broke: labels used to be contrast-checked against the
  // board. A dark shape colour on a dark fill has to fall back, not paint invisibly.
  const s = shape("rect", "#0f172a")
  s.color = "#111827" // near-black outline on a near-black fill
  const box = textBoxFor(s, "dark")!
  assert.ok(
    contrastRatio(box.ink, "#0f172a") >= READABLE,
    `ink ${box.ink} is unreadable on its own fill`,
  )

  // Unfilled shapes keep measuring against the board, exactly as before.
  const plain = shape("rect")
  plain.color = "#111827"
  const plainBox = textBoxFor(plain, "dark")!
  assert.equal(plainBox.ink, THEMES.dark.stroke, "falls back to theme ink on the board")
})

test("a legible fill keeps the shape's own colour for its label", () => {
  // The cohesive case must still win when it can — the fallback is a safety net, not
  // a blanket override.
  const s = shape("rect", "#fafafa")
  s.color = "#111827"
  assert.equal(textBoxFor(s, "dark")!.ink, "#111827")
})
