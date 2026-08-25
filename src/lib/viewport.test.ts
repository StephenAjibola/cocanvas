// node --test src/lib/viewport.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  MAX_SCALE,
  MIN_SCALE,
  screenToWorld,
  worldToScreen,
  zoomAt,
  zoomFactor,
} from "./viewport.ts"

const close = (a: number, b: number, msg?: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, msg ?? `${a} !== ${b}`)

test("screen/world round-trips", () => {
  const v = { x: -37, y: 210, scale: 2.5 }
  const w = screenToWorld(v, 640, 480)
  const s = worldToScreen(v, w.x, w.y)
  close(s.x, 640)
  close(s.y, 480)
})

test("zoom keeps the world point under the cursor pinned", () => {
  let v = { x: 0, y: 0, scale: 1 }
  const cursor = { x: 300, y: 200 }
  const anchor = screenToWorld(v, cursor.x, cursor.y)

  for (const delta of [-100, -100, 240, 33, -7]) {
    v = zoomAt(v, zoomFactor(delta, 0.0015), cursor.x, cursor.y)
    const s = worldToScreen(v, anchor.x, anchor.y)
    close(s.x, cursor.x, `x drifted at scale ${v.scale}`)
    close(s.y, cursor.y, `y drifted at scale ${v.scale}`)
  }
})

test("scale stays clamped and the anchor still holds at the limits", () => {
  let v = { x: 12, y: -80, scale: 1 }
  const anchor = screenToWorld(v, 500, 500)

  for (let i = 0; i < 50; i++) v = zoomAt(v, 2, 500, 500)
  assert.equal(v.scale, MAX_SCALE)
  close(worldToScreen(v, anchor.x, anchor.y).x, 500)

  for (let i = 0; i < 100; i++) v = zoomAt(v, 0.5, 500, 500)
  assert.equal(v.scale, MIN_SCALE)
  close(worldToScreen(v, anchor.x, anchor.y).y, 500)
})

test("opposite wheel deltas cancel out", () => {
  const start = { x: 5, y: 5, scale: 1 }
  const zoomed = zoomAt(start, zoomFactor(120, 0.0015), 100, 100)
  const back = zoomAt(zoomed, zoomFactor(-120, 0.0015), 100, 100)
  close(back.scale, start.scale)
  close(back.x, start.x)
  close(back.y, start.y)
})
