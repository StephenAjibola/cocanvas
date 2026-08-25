// node --test src/lib/pins.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { PIN_SIZE, type PinThread, numberThreads, pickPin, pinBox } from "./pins.ts"

const thread = (id: string, createdAt: string, extra: Partial<PinThread> = {}): PinThread => ({
  id,
  anchorX: 0,
  anchorY: 0,
  resolved: false,
  createdAt,
  ...extra,
})

test("threads are numbered oldest first, whatever order they arrive in", () => {
  // The API returns threads NEWEST first for the panel; the pins must not inherit that.
  const pins = numberThreads([
    thread("c", "2026-03-03T00:00:00Z"),
    thread("a", "2026-01-01T00:00:00Z"),
    thread("b", "2026-02-02T00:00:00Z"),
  ])
  assert.deepEqual(
    pins.map((p) => [p.id, p.n]),
    [
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ],
  )
})

test("resolving a thread does not renumber the ones after it", () => {
  // Someone saying "see pin 3" must still be right tomorrow. Resolved threads keep their
  // slot in the sequence rather than being squeezed out of it.
  const all = [
    thread("a", "2026-01-01T00:00:00Z"),
    thread("b", "2026-02-02T00:00:00Z", { resolved: true }),
    thread("c", "2026-03-03T00:00:00Z"),
  ]
  const pins = numberThreads(all)
  assert.equal(pins.find((p) => p.id === "c")!.n, 3)
  assert.equal(pins.find((p) => p.id === "b")!.resolved, true)
})

test("numbering is stable when two threads share a timestamp", () => {
  // Same millisecond is rare but not impossible, and an unstable sort would let the two
  // pins swap numbers between renders.
  const same = "2026-01-01T00:00:00Z"
  const first = numberThreads([thread("y", same), thread("x", same)])
  const second = numberThreads([thread("x", same), thread("y", same)])
  assert.deepEqual(
    first.map((p) => p.id),
    second.map((p) => p.id),
  )
})

test("numbering carries the anchor through untouched", () => {
  const [pin] = numberThreads([thread("a", "2026-01-01T00:00:00Z", { anchorX: 120, anchorY: -40 })])
  assert.equal(pin.x, 120)
  assert.equal(pin.y, -40)
})

test("the pin's body sits above its point, never over it", () => {
  // Placing a pin on a shape must not hide the shape.
  const b = pinBox(100, 200)
  assert.equal(b.x, 100, "body starts AT the point horizontally and extends right")
  assert.equal(b.y, 200 - PIN_SIZE, "body sits fully above the point")
  assert.equal(b.y + b.h, 200, "and its bottom edge touches it")
})

test("a click inside the body hits, one below the point does not", () => {
  const pins = [{ pin: numberThreads([thread("a", "2026-01-01T00:00:00Z")])[0], screenX: 100, screenY: 200 }]

  assert.equal(pickPin(pins, 110, 190)?.id, "a", "inside the body")
  assert.equal(pickPin(pins, 100, 200)?.id, "a", "exactly on the point")
  assert.equal(pickPin(pins, 110, 210), null, "below the point is empty canvas")
  assert.equal(pickPin(pins, 90, 190), null, "left of the point is empty canvas")
})

test("overlapping pins give the click to the one drawn last", () => {
  // Matches pickObject's topmost-wins rule, so a pin behaves like everything else on the
  // board rather than being the one thing that picks from the bottom.
  const [a, b] = numberThreads([
    thread("a", "2026-01-01T00:00:00Z"),
    thread("b", "2026-02-02T00:00:00Z"),
  ])
  const pins = [
    { pin: a, screenX: 100, screenY: 200 },
    { pin: b, screenX: 104, screenY: 200 },
  ]
  assert.equal(pickPin(pins, 110, 190)?.id, "b")
})

test("nothing under the pointer returns null rather than the nearest pin", () => {
  const pins = [{ pin: numberThreads([thread("a", "2026-01-01T00:00:00Z")])[0], screenX: 100, screenY: 200 }]
  assert.equal(pickPin(pins, 400, 400), null)
  assert.equal(pickPin([], 100, 190), null, "an empty board has nothing to hit")
})
