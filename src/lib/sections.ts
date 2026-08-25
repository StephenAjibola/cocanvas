// Value imports, so the explicit .ts specifier is required for `node --test` to
// resolve them at runtime — the type-only imports are erased and need none.
import { type BoardObject, objectBounds } from "./objects.ts"
import type { Stroke } from "./strokes"

/**
 * Quick-add on column templates.
 *
 * A "section" is a lane that holds cards — a Kanban column, a roadmap phase. The lane
 * says so itself via `Stroke.section`, set by the template that laid it out, rather than
 * being guessed from geometry: "a tall filled rectangle is probably a column" would put
 * a quick-add button on any tall rectangle somebody drew by hand.
 *
 * Everything here is pure and reads only bounds, so it can be tested without a canvas.
 */

/** Screen px of the "+" hit target, and its inset from the lane's foot. */
export const ADD_SIZE = 26
export const ADD_INSET = 16

/** Every lane on the board, bottom-most first is not meaningful — order is paint order. */
export function sectionsOf(objects: BoardObject[]): Stroke[] {
  return objects.filter((o): o is Stroke => o.type === "stroke" && Boolean(o.section))
}

/** The "+" button's world-space box, centred at the foot of the lane. */
export function addBoxFor(lane: BoardObject, size: number) {
  const b = objectBounds(lane)
  return {
    x: (b.minX + b.maxX) / 2 - size / 2,
    y: b.maxY - ADD_INSET - size,
    w: size,
    h: size,
  }
}

/** Whether a world point lands on the lane's "+". */
export function hitsAdd(lane: BoardObject, x: number, y: number, size: number) {
  const a = addBoxFor(lane, size)
  return x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h
}

/**
 * The objects sitting INSIDE a lane, in top-to-bottom order.
 *
 * Bare notes are excluded, and that exclusion is what makes this work at all: a column's
 * name and its count badge are bare labels positioned inside the lane, so counting them
 * as cards would clone a heading every time somebody pressed "+".
 */
export function cardsIn(objects: BoardObject[], lane: BoardObject): BoardObject[] {
  const b = objectBounds(lane)
  return objects
    .filter((o) => {
      if (o === lane || o.id === lane.id) return false
      if (o.type === "note" && o.bare) return false
      if (o.type === "stroke" && o.section) return false
      const c = objectBounds(o)
      return c.minX >= b.minX && c.maxX <= b.maxX && c.minY >= b.minY && c.maxY <= b.maxY
    })
    .sort((p, q) => objectBounds(p).minY - objectBounds(q).minY)
}

/** Default card height when a lane is empty and there is nothing to copy. */
const EMPTY_CARD_H = 82
/** Default gap below a card, and the side inset, when only one card exists to measure. */
const FALLBACK_GAP = 22
const SIDE_INSET = 16

/**
 * The card a "+" press should add to this lane: a copy of the bottom-most one, empty.
 *
 * Cloning rather than generating is the whole point of the feature — the new card
 * inherits the fill, outline, width and size the column already uses, so it does not
 * arrive looking like something else. `createdAt` and `id` are the caller's to set,
 * since only it knows the board's paint order.
 *
 * The vertical gap is MEASURED from the two bottom-most cards when there are two, so a
 * column with tight rows stays tight and a roomy one stays roomy. With fewer than two
 * there is nothing to measure and FALLBACK_GAP stands in.
 *
 * ponytail: clones the bottom-most OBJECT, which in a Kanban column is the card panel
 * itself — not the coloured tag note above it, which is a separate object. A new card
 * therefore arrives untagged. Clone the whole visual group instead if tags start
 * mattering; nothing else here changes.
 */
export function newCardFor(objects: BoardObject[], lane: BoardObject): BoardObject | null {
  const b = objectBounds(lane)
  const cards = cardsIn(objects, lane)

  if (cards.length === 0) {
    // Nothing to copy: a plain panel the width of the lane, in the lane's own outline
    // colour so it still belongs to the column it lands in.
    if (lane.type !== "stroke") return null
    const x = b.minX + SIDE_INSET
    const y = b.minY + SIDE_INSET
    const w = b.maxX - b.minX - SIDE_INSET * 2
    return {
      id: "",
      type: "stroke",
      points: [x, y, x + w, y, x + w, y + EMPTY_CARD_H, x, y + EMPTY_CARD_H, x, y],
      shape: "rect",
      color: lane.color,
      fill: "#ffffff",
      width: lane.width,
      text: "",
      createdAt: 0,
    }
  }

  const last = cards[cards.length - 1]
  const lastBox = objectBounds(last)
  const gap =
    cards.length >= 2
      ? Math.max(lastBox.minY - objectBounds(cards[cards.length - 2]).maxY, 4)
      : FALLBACK_GAP
  const dy = lastBox.maxY - lastBox.minY + gap

  // Structural clone, then moved down and emptied. Cloning by hand field-by-field would
  // drop whatever style the column's cards happen to carry, which is the one thing this
  // is supposed to preserve.
  const copy = JSON.parse(JSON.stringify(last)) as BoardObject
  copy.id = ""
  copy.createdAt = 0
  if (copy.type === "stroke") {
    for (let i = 1; i < copy.points.length; i += 2) copy.points[i] += dy
    copy.text = ""
  } else if (copy.type === "note") {
    copy.y += dy
    copy.text = ""
  }
  return copy
}
