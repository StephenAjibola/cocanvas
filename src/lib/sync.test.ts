// node --test src/lib/sync.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { type ObjectMap, applyRemote, overwrite, publish, readAll, seed } from "./sync.ts"
import { type BoardObject, isBoardObject } from "./objects.ts"
import type { Stroke } from "./strokes.ts"
import type { Note } from "./notes.ts"

/** A plain Map satisfies ObjectMap, which is the whole point of the structural type. */
const mkMap = (): ObjectMap => new Map<string, BoardObject>() as unknown as ObjectMap

const stroke = (id: string, createdAt = 0): Stroke => ({
  id,
  type: "stroke",
  points: [0, 0, 10, 10],
  color: "#fff",
  width: 2,
  createdAt,
})

const note = (id: string, createdAt = 0): Note => ({
  id,
  type: "note",
  x: 0,
  y: 0,
  w: 160,
  h: 160,
  color: "#fde68a",
  text: "",
  createdAt,
})

const ids = (o: BoardObject[]) => o.map((x) => x.id).join(",")

test("publish sends an object, and sends a delete once it leaves the array", () => {
  const map = mkMap()
  const objects: BoardObject[] = [stroke("a"), note("b")]

  publish(map, objects, ["a", "b"])
  assert.equal(map.get("a")?.id, "a")
  assert.equal(map.get("b")?.type, "note")

  objects.splice(0, 1)
  publish(map, objects, ["a"])
  assert.equal(map.has("a"), false, "an id no longer in the array is a delete")
  assert.equal(map.has("b"), true, "and it leaves everything else alone")
})

test("published values are snapshots, not the live instance", () => {
  // The draw loop mutates objects in place at pointer rates. Handing the map the live
  // reference would let a half-finished drag leak out between transactions.
  const map = mkMap()
  const s = stroke("a")
  publish(map, [s], ["a"])
  s.points.push(99, 99)
  assert.equal((map.get("a") as Stroke).points.length, 4, "the map kept the value it was given")
})

test("applyRemote adds, updates and removes, and reports whether it changed anything", () => {
  const map = mkMap()
  const objects: BoardObject[] = []

  map.set("a", stroke("a", 1))
  assert.equal(applyRemote(map, objects), true)
  assert.equal(ids(objects), "a")

  assert.equal(applyRemote(map, objects), false, "a second pass is a no-op")

  map.set("a", { ...stroke("a", 1), color: "#f00" })
  assert.equal(applyRemote(map, objects), true)
  assert.equal((objects[0] as Stroke).color, "#f00")

  map.delete("a")
  assert.equal(applyRemote(map, objects), true)
  assert.equal(objects.length, 0, "a peer's erase removes it locally")
})

test("applyRemote keeps the SAME object instance, so live references survive", () => {
  // selected, an in-flight drag and the history stack all hold instances. Replacing
  // them would leave a drag moving an object that is no longer on the board.
  const map = mkMap()
  const objects: BoardObject[] = [stroke("a")]
  const original = objects[0]

  map.set("a", { ...stroke("a"), color: "#0f0" })
  applyRemote(map, objects)

  assert.equal(objects[0], original, "same instance")
  assert.equal((original as Stroke).color, "#0f0", "updated in place")
})

test("overwrite deletes keys the incoming value does not have", () => {
  // Absence is meaningful on these types: no fill means transparent, no dash means
  // solid, no z means creation order. An additive assign cannot express "cleared".
  const local: Stroke = { ...stroke("a"), fill: "#333", dash: "dashed", z: 5 }
  overwrite(local, stroke("a"))
  assert.equal(local.fill, undefined, "fill cleared")
  assert.equal(local.dash, undefined, "dash cleared")
  assert.equal(local.z, undefined, "z cleared")
  assert.equal("fill" in local, false, "and the key is gone, not set to undefined")
})

test("applyRemote sorts into paint order, since a map has none", () => {
  const map = mkMap()
  const objects: BoardObject[] = []
  map.set("c", stroke("c", 3))
  map.set("a", stroke("a", 1))
  map.set("b", stroke("b", 2))

  applyRemote(map, objects)
  assert.equal(ids(objects), "a,b,c", "createdAt orders them")

  const front = { ...stroke("a", 1), z: 99 }
  map.set("a", front)
  applyRemote(map, objects)
  assert.equal(ids(objects), "b,c,a", "an explicit z wins over createdAt")
})

test("skip protects the object the local user is mid-gesture on", () => {
  // The collaborative-drag stutter: a peer's echo of an older state lands on the stroke
  // under your cursor and it jumps backwards mid-drag.
  const map = mkMap()
  const objects: BoardObject[] = [stroke("a"), stroke("b", 1)]
  ;(objects[0] as Stroke).color = "#local"

  map.set("a", { ...stroke("a"), color: "#stale" })
  map.set("b", { ...stroke("b", 1), color: "#peer" })

  applyRemote(map, objects, (id) => id === "a")
  assert.equal((objects[0] as Stroke).color, "#local", "the dragged object was left alone")
  assert.equal((objects[1] as Stroke).color, "#peer", "everything else still applied")
})

test("skip also protects an object from being removed mid-gesture", () => {
  const map = mkMap()
  const objects: BoardObject[] = [stroke("a")]
  // Nothing in the map at all — without the guard this is a delete.
  applyRemote(map, objects, (id) => id === "a")
  assert.equal(objects.length, 1, "still here")
})

test("seed fills an empty map and refuses a populated one", () => {
  const fresh = mkMap()
  assert.equal(seed(fresh, [stroke("a"), stroke("b", 1)]), true)
  assert.equal(readAll(fresh).length, 2)

  // The second client into a room must NOT write its database copy over the live
  // document, or it resurrects objects the first client just erased.
  const live = mkMap()
  live.set("kept", stroke("kept"))
  assert.equal(seed(live, [stroke("stale")]), false)
  assert.equal(ids(readAll(live)), "kept", "the live document won")
})

test("readAll returns paint-ordered snapshots for persistence", () => {
  const map = mkMap()
  map.set("b", stroke("b", 2))
  map.set("a", stroke("a", 1))
  const all = readAll(map)
  assert.equal(ids(all), "a,b")

  ;(all[0] as Stroke).color = "#mutated"
  assert.notEqual((map.get("a") as Stroke).color, "#mutated", "callers get copies")
})

test("a full round trip converges two peers", () => {
  // One shared map, two independent local arrays — the actual collaboration contract.
  const map = mkMap()
  const alice: BoardObject[] = []
  const bob: BoardObject[] = []

  alice.push(stroke("a1", 1))
  publish(map, alice, ["a1"])
  applyRemote(map, bob)
  assert.equal(ids(bob), "a1", "bob sees alice's stroke")

  bob.push(note("b1", 2))
  publish(map, bob, ["b1"])
  applyRemote(map, alice)
  assert.equal(ids(alice), "a1,b1", "and alice sees bob's note")

  // Bob erases Alice's stroke.
  bob.splice(bob.findIndex((o) => o.id === "a1"), 1)
  publish(map, bob, ["a1"])
  applyRemote(map, alice)
  assert.equal(ids(alice), "b1", "the erase propagated")
  assert.equal(ids(bob), "b1", "and both sides agree")
})

test("isBoardObject rejects what would crash the canvas", () => {
  // A trust boundary in two directions: request bodies, and Json rows written by an
  // older version of this code. The bar is "will the renderer dereference this without
  // asking first", not "is every optional field present".
  const ok = (v: unknown, why: string) => assert.equal(isBoardObject(v), true, why)
  const no = (v: unknown, why: string) => assert.equal(isBoardObject(v), false, why)

  ok(stroke("a"), "a plain stroke")
  ok(note("n"), "a plain note")
  ok({ ...stroke("a"), fill: "#333", dash: "dashed", z: 3 }, "optional fields are fine")

  no(null, "null")
  no("stroke", "a string")
  no({ ...stroke("a"), id: "" }, "an empty id — it is the Y.Map key")
  no({ ...stroke("a"), type: "spline" }, "an unknown type")
  no({ ...stroke("a"), points: [1, 2, 3] }, "odd point count — strokePath reads pairs")
  no({ ...stroke("a"), points: [] }, "no points at all")
  no({ ...stroke("a"), points: [0, 0, NaN, 1] }, "NaN coordinate")
  no({ ...stroke("a"), points: [0, 0, "10", 1] }, "a string coordinate")
  no({ ...stroke("a"), width: Infinity }, "a non-finite width")
  no({ ...stroke("a"), createdAt: "yesterday" }, "createdAt must be a number")
  no({ ...stroke("a"), z: "front" }, "z must be a number when present")
  no({ ...note("n"), w: null }, "a note needs real dimensions")
  no({ ...note("n"), text: undefined }, "a note's text is required, unlike a shape label")
})
