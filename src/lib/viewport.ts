/**
 * The board's view transform: screen = world * scale + offset.
 * Pure math, no DOM — the canvas applies it with ctx.setTransform.
 */
export type Viewport = { x: number; y: number; scale: number }

export const MIN_SCALE = 0.1
export const MAX_SCALE = 8

export function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}

export function screenToWorld(v: Viewport, sx: number, sy: number) {
  return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale }
}

export function worldToScreen(v: Viewport, wx: number, wy: number) {
  return { x: wx * v.scale + v.x, y: wy * v.scale + v.y }
}

/** Scale by `factor`, keeping the world point under (sx, sy) pinned to that screen point. */
export function zoomAt(v: Viewport, factor: number, sx: number, sy: number): Viewport {
  const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
  const before = screenToWorld(v, sx, sy)
  return { scale, x: sx - before.x * scale, y: sy - before.y * scale }
}

/** Firefox reports wheel deltas in lines (deltaMode 1); everyone else in pixels. */
export function normalizeWheelDelta(delta: number, deltaMode: number) {
  return deltaMode === 1 ? delta * 16 : delta
}

// Zoom speed, tuned by hand — trackpad pinch arrives as tiny deltas, a mouse wheel
// as ~100 per notch, so they need different constants to feel the same.
export const WHEEL_ZOOM_SPEED = 0.0015
export const PINCH_ZOOM_SPEED = 0.01

/** Exponential so one notch feels identical at any zoom level. */
export function zoomFactor(deltaY: number, speed: number) {
  return Math.exp(-deltaY * speed)
}
