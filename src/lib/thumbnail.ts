import type { BoardObject } from "./objects.ts"
import { visualBounds } from "./objects.ts"
import { NOTE_RADIUS, NOTE_SHADOW } from "./notes.ts"

/**
 * Board thumbnails, rendered in the browser from the board's own objects.
 *
 * No stored image, no upload, no blob storage: the dashboard fetches a board's persisted
 * objects and draws them to an offscreen canvas at card size. Nothing to invalidate and
 * nothing to clean up — a board whose contents changed simply produces a different
 * picture the next time it is drawn.
 *
 * Deliberately a SEPARATE, simplified renderer rather than a reuse of BoardCanvas's
 * draw loop. That loop lives inside a 600-line effect closure bound to a mounted board:
 * lifting it out to be callable from a card would be a large refactor of the most
 * delicate file in the app. And at 300×170 it would be wasted work — brush grain, label
 * layout, connector routing and settle animations are all invisible at that size. What a
 * thumbnail has to convey is the SHAPE of the board: where things are, roughly how big,
 * roughly what colour.
 */

/** Padding inside the thumbnail, in destination pixels, so nothing touches the edge. */
const PAD = 8

/**
 * A cheap content signature.
 *
 * The cache key for "has this board changed". Board.updatedAt cannot serve: the objects
 * route writes BoardObject rows without touching the Board row, so a board's timestamp
 * does not move when its CONTENTS do. This hashes the identity and geometry of every
 * object instead, which is exactly what a repaint would depend on.
 *
 * Not cryptographic and does not need to be — a collision costs one stale thumbnail.
 */
export function contentSignature(objects: BoardObject[]): string {
  let h = 2166136261 // FNV-1a offset basis
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
  }
  for (const o of objects) {
    const b = visualBounds(o)
    // Rounded: sub-pixel drift during a drag must not invalidate the cache on every save.
    mix(
      `${o.id}|${o.type}|${Math.round(b.minX)},${Math.round(b.minY)},${Math.round(b.maxX)},${Math.round(b.maxY)}|${
        "color" in o ? o.color : ""
      }|${"fill" in o ? o.fill ?? "" : ""}`,
    )
  }
  return `${objects.length}:${(h >>> 0).toString(36)}`
}

/**
 * The transform that fits a board's content into a `w`×`h` box.
 *
 * Pure, so the fitting rule is testable without a canvas. Scale is capped at 1: a board
 * holding one small note should show that note at its own size in the middle of the
 * card, not blown up until a sticky fills the frame and reads as a coloured rectangle.
 */
export function fitTransform(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  w: number,
  h: number,
  pad = PAD,
) {
  const cw = Math.max(bounds.maxX - bounds.minX, 1)
  const ch = Math.max(bounds.maxY - bounds.minY, 1)
  const scale = Math.min((w - pad * 2) / cw, (h - pad * 2) / ch, 1)
  return {
    scale,
    // Centres the content in the box at whatever scale it got.
    x: (w - cw * scale) / 2 - bounds.minX * scale,
    y: (h - ch * scale) / 2 - bounds.minY * scale,
  }
}

/** Union of every object's visual bounds, or null when there is nothing to draw. */
export function contentBounds(objects: BoardObject[]) {
  if (!objects.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const o of objects) {
    const b = visualBounds(o)
    if (b.minX < minX) minX = b.minX
    if (b.minY < minY) minY = b.minY
    if (b.maxX > maxX) maxX = b.maxX
    if (b.maxY > maxY) maxY = b.maxY
  }
  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY }
}

/**
 * Draws `objects` into a `w`×`h` canvas and returns a PNG data URL.
 *
 * Returns null when there is nothing to show, which is the caller's signal to fall back
 * to the placeholder card rather than render an empty rectangle that looks broken.
 *
 * Browser-only: it needs a canvas. Guarded so importing this from a server component or
 * a node test is harmless.
 */
export function renderThumbnail(
  objects: BoardObject[],
  w: number,
  h: number,
  background: string,
): string | null {
  if (typeof document === "undefined") return null
  const bounds = contentBounds(objects)
  if (!bounds) return null

  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  ctx.scale(dpr, dpr)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, w, h)

  const t = fitTransform(bounds, w, h)
  ctx.translate(t.x, t.y)
  ctx.scale(t.scale, t.scale)

  for (const o of objects) {
    if (o.type === "note") {
      ctx.fillStyle = o.color
      ctx.beginPath()
      // Radius in DESTINATION pixels, so it stays a crisp corner at any board scale
      // rather than shrinking to nothing on a zoomed-out board.
      ctx.roundRect(o.x, o.y, o.w, o.h, NOTE_RADIUS / t.scale)
      if (o.bare) {
        ctx.fill() // a text box: the dark block stands in for its words, no paper
      } else {
        // Same Level 1 shadow the board paints. Shadows ignore the transform, so these
        // are device px — dpr, not the board scale.
        for (const sh of NOTE_SHADOW) {
          ctx.shadowColor = `rgba(0,0,0,${sh.alpha})`
          ctx.shadowBlur = sh.blur * dpr
          ctx.shadowOffsetY = sh.y * dpr
          ctx.fill()
        }
        ctx.shadowColor = "transparent"
      }
    } else if (o.type === "image") {
      // The bitmap itself is not loaded here — decoding N images to draw them at 40px
      // would cost more than the whole thumbnail is worth. A neutral block in the right
      // place conveys the same thing at this size: something rectangular lives here.
      ctx.fillStyle = "rgba(0,0,0,0.12)"
      ctx.fillRect(o.x, o.y, o.w, o.h)
    } else {
      const p = o.points
      if (!p || p.length < 4) continue
      ctx.strokeStyle = o.color
      // Hairlines vanish at thumbnail scale; a floor keeps a stroke visible without
      // making a thick marker look thin.
      ctx.lineWidth = Math.max(o.width ?? 2, 1.5 / t.scale)
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      if (o.fill) {
        ctx.fillStyle = o.fill
        ctx.beginPath()
        ctx.moveTo(p[0], p[1])
        for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1])
        ctx.closePath()
        ctx.fill()
      }
      ctx.beginPath()
      ctx.moveTo(p[0], p[1])
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1])
      ctx.stroke()
    }
  }

  return canvas.toDataURL("image/png")
}
