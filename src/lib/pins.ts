/**
 * Comment pin placement and hit testing.
 *
 * Pure geometry, no canvas — the same split guides.ts uses, and the reason the numbering
 * and hit rules can be tested without a DOM.
 *
 * Pins are drawn in SCREEN space at a constant size, like peer cursors and selection
 * handles: a pin is a piece of interface pointing AT the board, not a mark on it, so it
 * must stay legible and clickable at every zoom rather than shrinking with the content.
 */

/** The pin's body size in screen px. */
export const PIN_SIZE = 26

/** What the panel and the canvas agree a thread looks like. */
export type PinThread = {
  id: string
  anchorX: number
  anchorY: number
  resolved: boolean
  /** ISO string from the API, or a Date — only used for ordering. */
  createdAt: string | Date
}

export type Pin = {
  id: string
  /** 1-based, and stable: the number a person reads off the board and says out loud. */
  n: number
  /** World coordinates of the pin's POINT — the exact spot being commented on. */
  x: number
  y: number
  resolved: boolean
}

/**
 * Numbers every thread, oldest first.
 *
 * Numbering is by creation order rather than by the panel's display order, and that is
 * the point: the list re-sorts when you switch filters, and a pin whose number changed
 * because you clicked a tab would be useless for "look at pin 3". Resolved threads keep
 * their number and stay in the sequence, so resolving thread 2 does not renumber 3 into 2
 * while somebody is talking about it.
 */
export function numberThreads(threads: PinThread[]): Pin[] {
  return [...threads]
    .sort((a, b) => {
      const ta = new Date(a.createdAt).getTime()
      const tb = new Date(b.createdAt).getTime()
      // Ties broken by id so the order is total and stable — two comments posted in the
      // same millisecond must not swap numbers between renders.
      return ta === tb ? a.id.localeCompare(b.id) : ta - tb
    })
    .map((t, i) => ({ id: t.id, n: i + 1, x: t.anchorX, y: t.anchorY, resolved: t.resolved }))
}

/**
 * The pin's box in screen space, given where its point landed.
 *
 * The body sits UP and to the RIGHT of the point, so the marker never covers the thing it
 * is pointing at — you place a pin on a shape and still see the shape.
 */
export function pinBox(screenX: number, screenY: number, size = PIN_SIZE) {
  return { x: screenX, y: screenY - size, w: size, h: size }
}

/**
 * The topmost pin under a screen point, or null.
 *
 * Iterates backwards so the pin drawn LAST — the one visually on top where two overlap —
 * is the one that gets the click, matching what pickObject does for board objects.
 */
export function pickPin(
  pins: { pin: Pin; screenX: number; screenY: number }[],
  px: number,
  py: number,
  size = PIN_SIZE,
): Pin | null {
  for (let i = pins.length - 1; i >= 0; i--) {
    const { pin, screenX, screenY } = pins[i]
    const b = pinBox(screenX, screenY, size)
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return pin
  }
  return null
}

/**
 * Traces the marker: a rounded square with one SHARP corner at the bottom-left.
 *
 * That single un-rounded corner is what turns a badge into a pointer — it gives the shape
 * a tip, and the tip is what says "this exact spot" rather than "somewhere around here".
 * The path is traced in screen space by the caller, which resets the transform first.
 */
export function tracePin(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  size = PIN_SIZE,
) {
  const { x, y, w, h } = pinBox(screenX, screenY, size)
  const r = size * 0.3

  ctx.beginPath()
  ctx.moveTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r) // top-left
  ctx.arcTo(x + w, y, x + w, y + r, r) // top-right
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r) // bottom-right
  // Bottom-left is NOT arced — straight into the corner, which is the point itself.
  ctx.lineTo(x, y + h)
  ctx.closePath()
}
