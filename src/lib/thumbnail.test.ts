// node --test src/lib/thumbnail.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { contentBounds, contentSignature, fitTransform, renderThumbnail } from "./thumbnail.ts"
import type { BoardObject } from "./objects.ts"

const note = (id: string, x: number, y: number, w = 100, h = 80): BoardObject =>
  ({ id, type: "note", x, y, w, h, text: "", color: "#ffe08a" }) as BoardObject

test("bounds cover every object, not just the first", () => {
  const b = contentBounds([note("a", 0, 0), note("b", 400, 300)])!
  assert.equal(b.minX, 0)
  assert.equal(b.minY, 0)
  assert.equal(b.maxX, 500)
  assert.equal(b.maxY, 380)
})

test("an empty board has no bounds, which is the fallback signal", () => {
  // The caller renders the placeholder card on null rather than an empty rectangle.
  assert.equal(contentBounds([]), null)
})

test("content is scaled down to fit and centred", () => {
  // 1000x1000 of content into a 300x170 card: height is the binding constraint.
  const t = fitTransform({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 }, 300, 170)
  assert.ok(t.scale < 1)
  assert.equal(t.scale, (170 - 16) / 1000)
  // Centred horizontally: equal gap either side.
  assert.equal(t.x, (300 - 1000 * t.scale) / 2)
})

test("a small board is NOT blown up to fill the card", () => {
  // The cap at 1 is what stops one sticky note becoming a full-bleed yellow rectangle
  // that tells you nothing about the board.
  const t = fitTransform({ minX: 0, minY: 0, maxX: 50, maxY: 40 }, 300, 170)
  assert.equal(t.scale, 1)
})

test("the fit offsets a board that does not start at the origin", () => {
  // Boards drift far from 0,0 as people pan and draw; the transform has to translate,
  // not just scale, or the content lands off-card.
  const t = fitTransform({ minX: 5000, minY: -2000, maxX: 5100, maxY: -1920 }, 300, 170)
  const drawnX = 5000 * t.scale + t.x
  const drawnY = -2000 * t.scale + t.y
  assert.ok(drawnX >= 0 && drawnX <= 300, `content x ${drawnX} is off-card`)
  assert.ok(drawnY >= 0 && drawnY <= 170, `content y ${drawnY} is off-card`)
})

test("the signature changes when content moves, and not when it doesn't", () => {
  const a = [note("a", 0, 0), note("b", 100, 100)]
  assert.equal(contentSignature(a), contentSignature([note("a", 0, 0), note("b", 100, 100)]))
  assert.notEqual(contentSignature(a), contentSignature([note("a", 0, 0), note("b", 140, 100)]))
})

test("the signature changes when an object is added or removed", () => {
  const one = [note("a", 0, 0)]
  const two = [note("a", 0, 0), note("b", 10, 10)]
  assert.notEqual(contentSignature(one), contentSignature(two))
  assert.equal(contentSignature([]), contentSignature([]))
})

test("sub-pixel drift does not invalidate the cache", () => {
  // A drag settles on fractional coordinates. Re-rendering every board on the dashboard
  // because something moved a third of a pixel would defeat the cache entirely.
  assert.equal(contentSignature([note("a", 10, 10)]), contentSignature([note("a", 10.4, 10.2)]))
})

test("recolouring an object DOES invalidate it", () => {
  const yellow = note("a", 0, 0)
  const pink = { ...note("a", 0, 0), color: "#ffb3c1" } as BoardObject
  assert.notEqual(contentSignature([yellow]), contentSignature([pink]))
})

test("rendering without a document returns null rather than throwing", () => {
  // This module is imported by a client component that Next also renders on the server.
  assert.equal(renderThumbnail([note("a", 0, 0)], 300, 170, "#fff"), null)
})
