// node --test src/lib/history.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { COALESCE_MS, createHistory } from "./history.ts"
import type { Stroke } from "./strokes.ts"
import type { Note } from "./notes.ts"
import {
  type BoardObject,
  edgeZ,
  geomBounds,
  readGeom,
  scaleGeometry,
  sortByOrder,
} from "./objects.ts"

const note = (id: string, text = ""): Note => ({
  id,
  type: "note",
  x: 0,
  y: 0,
  w: 160,
  h: 160,
  color: "#fde68a",
  text,
  createdAt: 0,
})

const mk = (id: string, points = [0, 0, 10, 10]): Stroke => ({
  id,
  type: "stroke",
  points: [...points],
  color: "#fff",
  width: 2,
  createdAt: 0,
})

const ids = (objects: BoardObject[]) => objects.map((o) => o.id).join(",")

test("undoing an add removes it, redoing puts it back", () => {
  const strokes = [mk("a")]
  const h = createHistory(strokes)
  const b = mk("b")

  strokes.push(b)
  h.push({ kind: "add", object: b, index: 1 })

  assert.equal(h.undo(), true)
  assert.equal(ids(strokes), "a")
  assert.equal(h.redo(), true)
  assert.equal(ids(strokes), "a,b")
})

test("undoing a delete restores paint order, not just membership", () => {
  // The whole point of storing an index: pushing it back would put it on top of "c".
  const strokes = [mk("a"), mk("b"), mk("c")]
  const h = createHistory(strokes)

  const [removed] = strokes.splice(1, 1)
  h.push({ kind: "remove", object: removed, index: 1 })
  assert.equal(ids(strokes), "a,c")

  h.undo()
  assert.equal(ids(strokes), "a,b,c")
})

test("a move undoes to the exact original points", () => {
  const strokes = [mk("a", [0, 0, 10, 10])]
  const h = createHistory(strokes)

  strokes[0].points = [5, 7, 15, 17]
  h.push({ kind: "move", id: "a", dx: 5, dy: 7 })

  h.undo()
  assert.deepEqual(strokes[0].points, [0, 0, 10, 10])
  h.redo()
  assert.deepEqual(strokes[0].points, [5, 7, 15, 17])
})

test("a style change round-trips both directions", () => {
  const strokes = [mk("a")]
  const h = createHistory(strokes)

  h.push({ kind: "style", id: "a", before: { color: "#fff" }, after: { color: "#f00" } })
  strokes[0].color = "#f00"

  h.undo()
  assert.equal(strokes[0].color, "#fff")
  h.redo()
  assert.equal(strokes[0].color, "#f00")
})

test("a slider drag collapses to one undo step, back to where it started", () => {
  const strokes = [mk("a")]
  const h = createHistory(strokes)

  // Width 2 -> 3 -> 4 -> 5, as three onChange ticks inside the window.
  h.push({ kind: "style", id: "a", before: { width: 2 }, after: { width: 3 } }, 1000)
  h.push({ kind: "style", id: "a", before: { width: 3 }, after: { width: 4 } }, 1100)
  h.push({ kind: "style", id: "a", before: { width: 4 }, after: { width: 5 } }, 1200)
  strokes[0].width = 5

  h.undo()
  assert.equal(strokes[0].width, 2, "one undo returns to the pre-drag width")
  assert.equal(h.canUndo(), false, "all three ticks were one step")
  h.redo()
  assert.equal(strokes[0].width, 5)
})

test("edits outside the window, or to another field, stay separate steps", () => {
  const strokes = [mk("a")]
  const h = createHistory(strokes)

  h.push({ kind: "style", id: "a", before: { width: 2 }, after: { width: 3 } }, 1000)
  h.push({ kind: "style", id: "a", before: { width: 3 }, after: { width: 4 } }, 1000 + COALESCE_MS)
  // Same stroke, same instant, different field — must not fold into the width step.
  h.push({ kind: "style", id: "a", before: { color: "#fff" }, after: { color: "#f00" } }, 1000 + COALESCE_MS)
  strokes[0].width = 4
  strokes[0].color = "#f00"

  h.undo()
  assert.equal(strokes[0].color, "#fff")
  h.undo()
  assert.equal(strokes[0].width, 3)
  h.undo()
  assert.equal(strokes[0].width, 2)
  assert.equal(h.canUndo(), false)
})

test("a new action forks the timeline and drops the redo branch", () => {
  const strokes = [mk("a")]
  const h = createHistory(strokes)
  const b = mk("b")
  const c = mk("c")

  strokes.push(b)
  h.push({ kind: "add", object: b, index: 1 })
  h.undo()
  assert.equal(h.canRedo(), true)

  strokes.push(c)
  h.push({ kind: "add", object: c, index: 1 })
  assert.equal(h.canRedo(), false, "b is no longer reachable")
  assert.equal(ids(strokes), "a,c")
})

test("flags track both ends, and stepping past either end is a no-op", () => {
  const strokes = [mk("a")]
  const h = createHistory(strokes)

  assert.equal(h.canUndo(), false)
  assert.equal(h.canRedo(), false)
  assert.equal(h.undo(), false)
  assert.equal(h.redo(), false)

  const b = mk("b")
  strokes.push(b)
  h.push({ kind: "add", object: b, index: 1 })
  assert.equal(h.canUndo(), true)

  h.undo()
  assert.equal(h.canUndo(), false)
  assert.equal(h.canRedo(), true)
  assert.equal(h.undo(), false, "nothing left to undo")
  assert.equal(ids(strokes), "a", "the failed undo changed nothing")
})

test("a note's text round-trips as one step per editing session", () => {
  const n = note("n", "before")
  const objects: BoardObject[] = [n]
  const h = createHistory(objects)

  n.text = "after"
  h.push({ kind: "text", id: "n", before: "before", after: "after" })

  h.undo()
  assert.equal(n.text, "before")
  h.redo()
  assert.equal(n.text, "after")
})

test("notes and strokes share one timeline and one move entry", () => {
  // The union's whole point: undo does not care which kind it is holding.
  const n = note("n")
  const s = mk("s")
  const objects: BoardObject[] = [s, n]
  const h = createHistory(objects)

  n.x = 40
  n.y = 25
  h.push({ kind: "move", id: "n", dx: 40, dy: 25 }, 0)
  objects.splice(0, 1)
  h.push({ kind: "remove", object: s, index: 0 }, 1000)

  h.undo()
  assert.equal(objects.length, 2, "the stroke came back")
  assert.equal(objects[0].id, "s", "and back underneath the note")
  h.undo()
  assert.deepEqual([n.x, n.y], [0, 0], "the note moved back")
  assert.equal(h.canUndo(), false)
})

test("a text entry aimed at a stroke is ignored, not crashed on", () => {
  // Reachable only from a corrupt stack, but apply() must stay total.
  const s = mk("s")
  const objects: BoardObject[] = [s]
  const h = createHistory(objects)

  h.push({ kind: "text", id: "s", before: "x", after: "y" })
  assert.equal(h.undo(), true)
  assert.ok(!("text" in s), "no stray field grafted onto the stroke")
})

test("an eraser sweep undoes as ONE step, restoring paint order", () => {
  // The invariant every other tool here follows: one gesture, one Ctrl+Z. A sweep that
  // took out four objects must not need four presses.
  const objects: BoardObject[] = [mk("a"), mk("b"), mk("c"), mk("d"), mk("e")]
  const h = createHistory(objects)

  // Removed back-to-front, exactly as eraseAt walks the array.
  const removed = [
    { object: objects[3], index: 3 },
    { object: objects[1], index: 1 },
  ]
  objects.splice(3, 1)
  objects.splice(1, 1)
  assert.equal(ids(objects), "a,c,e")

  h.push({
    kind: "batch",
    entries: removed.map((r) => ({ kind: "remove" as const, object: r.object, index: r.index })),
  })

  assert.equal(h.undo(), true)
  assert.equal(ids(objects), "a,b,c,d,e", "all of them, back where they were")
  assert.equal(h.canUndo(), false, "one press was enough")

  h.redo()
  assert.equal(ids(objects), "a,c,e")
})

test("a batch can mix kinds and still round-trip", () => {
  const n = note("n", "before")
  const s = mk("s")
  const objects: BoardObject[] = [s, n]
  const h = createHistory(objects)

  n.text = "after"
  s.color = "#f00"
  objects.splice(0, 1)
  h.push({
    kind: "batch",
    entries: [
      { kind: "text", id: "n", before: "before", after: "after" },
      { kind: "style", id: "s", before: { color: "#fff" }, after: { color: "#f00" } },
      { kind: "remove", object: s, index: 0 },
    ],
  })

  h.undo()
  assert.equal(ids(objects), "s,n", "the removal came back")
  assert.equal(n.text, "before")
  assert.equal(s.color, "#fff")

  h.redo()
  assert.equal(ids(objects), "n")
  assert.equal(n.text, "after")
  assert.equal(s.color, "#f00")
})

test("an empty batch is harmless", () => {
  const objects: BoardObject[] = [mk("a")]
  const h = createHistory(objects)
  h.push({ kind: "batch", entries: [] })
  assert.equal(h.undo(), true)
  assert.equal(ids(objects), "a")
})

/** Distinct creation times, so paint order is meaningful without anything setting `z`. */
function ordered(...ids: string[]) {
  // Not `ids.map(mk)` — map passes the index as mk's second argument, which lands in
  // `points` and is not iterable.
  const objects: BoardObject[] = ids.map((id) => mk(id))
  objects.forEach((o, i) => (o.createdAt = i))
  return objects
}

/** What reorderSelected does in the canvas, minus React. */
function sendTo(objects: BoardObject[], id: string, edge: "front" | "back") {
  const o = objects.find((x) => x.id === id)!
  const before = o.z
  const after = edgeZ(objects, edge)
  o.z = after
  sortByOrder(objects)
  return { kind: "reorder", id, before, after } as const
}

test("bring to front and send to back undo to the exact original position", () => {
  // Paint order is a KEY now (`z`, falling back to createdAt), not array position — a
  // Y.Map has no order to borrow, so two peers splicing at "index 3" agree on nothing.
  // Undo therefore has to restore the exact key, including restoring it to absent.
  const objects = ordered("a", "b", "c", "d")
  const h = createHistory(objects)

  h.push(sendTo(objects, "b", "front"))
  assert.equal(ids(objects), "a,c,d,b")

  h.undo()
  assert.equal(ids(objects), "a,b,c,d", "back to its original depth")
  assert.equal(
    objects.find((o) => o.id === "b")!.z,
    undefined,
    "undo restores an ABSENT z, not a zero — an object that was never reordered has none",
  )
  h.redo()
  assert.equal(ids(objects), "a,c,d,b")

  // And the other direction.
  h.push(sendTo(objects, "d", "back"))
  assert.equal(ids(objects), "d,a,c,b")
  h.undo()
  assert.equal(ids(objects), "a,c,d,b")
})

test("a reorder unwinds correctly underneath a later edit", () => {
  // Reorder, then delete something else, then unwind both. Undo is LIFO, and apply()
  // locates by id, so a batch cannot desync it mid-run.
  const objects = ordered("a", "b", "c")
  const h = createHistory(objects)

  h.push(sendTo(objects, "c", "back"), 0)
  assert.equal(ids(objects), "c,a,b")

  const [a] = objects.splice(1, 1)
  h.push({ kind: "remove", object: a, index: 1 }, 1000)
  assert.equal(ids(objects), "c,b")

  h.undo()
  assert.equal(ids(objects), "c,a,b", "the delete came back first")
  h.undo()
  assert.equal(ids(objects), "a,b,c", "then the reorder unwound to the original order")
})

test("reordering twice still undoes back to no z at all", () => {
  // The trap in keying on a value rather than an index: the second reorder's `before`
  // is the first one's `after`, so unwinding both has to walk back through it.
  const objects = ordered("a", "b", "c")
  const h = createHistory(objects)

  h.push(sendTo(objects, "a", "front"))
  assert.equal(ids(objects), "b,c,a")
  h.push(sendTo(objects, "a", "back"))
  assert.equal(ids(objects), "a,b,c")

  h.undo()
  assert.equal(ids(objects), "b,c,a", "back to the front-most position")
  h.undo()
  assert.equal(ids(objects), "a,b,c")
  assert.equal(objects.find((o) => o.id === "a")!.z, undefined, "and back to no z")
})

test("lock toggles, and undo restores the previous state", () => {
  const objects: BoardObject[] = [mk("a")]
  const h = createHistory(objects)

  h.push({ kind: "lock", id: "a", locked: true })
  objects[0].locked = true

  h.undo()
  assert.equal(objects[0].locked, false, "undo unlocks")
  h.redo()
  assert.equal(objects[0].locked, true)
})

test("a resize or rotate undoes as one step, back to the exact geometry", () => {
  const s = mk("s", [0, 0, 100, 0, 100, 60, 0, 60, 0, 0])
  const objects: BoardObject[] = [s]
  const h = createHistory(objects)

  const before = readGeom(s)
  s.angle = 0.8
  scaleGeometry(s, geomBounds(s), { minX: 0, minY: 0, maxX: 300, maxY: 180 })
  const after = readGeom(s)
  h.push({ kind: "transform", id: "s", before, after })

  h.undo()
  assert.equal(s.angle, undefined, "rotation unwound")
  assert.deepEqual(s.points, [0, 0, 100, 0, 100, 60, 0, 60, 0, 0], "size unwound")
  assert.equal(h.canUndo(), false, "one gesture, one step")

  h.redo()
  assert.equal(s.angle, 0.8)
  // geomBounds lands exactly on the target — that exactness is the point of resizing
  // against raw extents rather than ink-padded ones.
  assert.deepEqual(geomBounds(s), { minX: 0, minY: 0, maxX: 300, maxY: 180 })
})

test("a full session unwinds to an empty board and rewinds intact", () => {
  const strokes: Stroke[] = []
  const h = createHistory(strokes)
  const a = mk("a", [0, 0, 10, 10])
  const b = mk("b", [20, 20, 30, 30])

  strokes.push(a)
  h.push({ kind: "add", object: a, index: 0 }, 0)
  strokes.push(b)
  h.push({ kind: "add", object: b, index: 1 }, 1000)
  a.points = [1, 1, 11, 11]
  h.push({ kind: "move", id: "a", dx: 1, dy: 1 }, 2000)
  a.color = "#0f0"
  h.push({ kind: "style", id: "a", before: { color: "#fff" }, after: { color: "#0f0" } }, 3000)
  strokes.splice(1, 1)
  h.push({ kind: "remove", object: b, index: 1 }, 4000)

  while (h.undo());
  assert.equal(strokes.length, 0, "board is empty again")
  assert.deepEqual(a.points, [0, 0, 10, 10])
  assert.equal(a.color, "#fff")

  while (h.redo());
  assert.equal(ids(strokes), "a")
  assert.deepEqual(a.points, [1, 1, 11, 11])
  assert.equal(a.color, "#0f0")
})
