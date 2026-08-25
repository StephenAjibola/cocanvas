// node --test src/lib/sections.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { addBoxFor, cardsIn, hitsAdd, newCardFor, sectionsOf } from "./sections.ts"
import { type BoardObject, objectBounds } from "./objects.ts"
import { templateObjects } from "./templates.ts"

const KANBAN = templateObjects("kanban")

test("only lanes the template marked are sections", () => {
  // Never inferred from geometry. A tall filled rectangle somebody drew by hand must not
  // sprout a quick-add button.
  const lanes = sectionsOf(KANBAN)
  assert.equal(lanes.length, 4, "expected one section per Kanban column")
  for (const l of lanes) assert.equal(l.section, true)

  const drawnByHand: BoardObject = {
    id: "x",
    type: "stroke",
    points: [0, 0, 300, 0, 300, 900, 0, 900, 0, 0],
    shape: "rect",
    color: "#000",
    fill: "#fff",
    width: 2,
    createdAt: 1,
  }
  assert.equal(sectionsOf([drawnByHand]).length, 0, "an untagged tall rect became a column")
})

test("column headings and count badges are not cards", () => {
  // Both are bare labels sitting inside the lane. Counting them would make "+" clone a
  // heading, and would make the derived count badges wrong the moment one was added.
  const lanes = sectionsOf(KANBAN)
  const todo = lanes[0]
  const cards = cardsIn(KANBAN, todo)
  for (const c of cards) {
    assert.ok(!(c.type === "note" && c.bare), "a bare label was counted as a card")
  }
  // "To Do" holds three cards; each is a panel with the ticket text plus its tag note.
  const withText = cards.filter((c) => c.type === "stroke" && c.text)
  assert.equal(withText.length, 3, "expected the three To Do tickets")
})

test("cards come back top to bottom", () => {
  const lane = sectionsOf(KANBAN)[0]
  const ys = cardsIn(KANBAN, lane).map((c) => objectBounds(c).minY)
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b), "cards are not in visual order")
})

test("a lane never counts its own neighbours", () => {
  // Columns sit side by side and must not reach into each other, or "+" on To Do would
  // clone a card out of In Progress.
  const lanes = sectionsOf(KANBAN)
  for (const lane of lanes) {
    const b = objectBounds(lane)
    for (const c of cardsIn(KANBAN, lane)) {
      const cb = objectBounds(c)
      assert.ok(cb.minX >= b.minX && cb.maxX <= b.maxX, "a card from another column leaked in")
    }
  }
})

test("the new card copies the column's existing card, emptied and moved below it", () => {
  const lane = sectionsOf(KANBAN)[0]
  const before = cardsIn(KANBAN, lane)
  const last = before[before.length - 1]
  const card = newCardFor(KANBAN, lane)
  assert.ok(card, "no card produced")

  // Same look — that is the entire point of cloning rather than generating.
  assert.equal(card.type, last.type)
  if (card.type === "stroke" && last.type === "stroke") {
    assert.equal(card.fill, last.fill)
    assert.equal(card.color, last.color)
    assert.equal(card.width, last.width)
    assert.equal(card.shape, last.shape)
    assert.equal(card.text, "", "the copy kept the text it was cloned from")
  }
  // Same size, strictly below, and still inside the lane.
  const cb = objectBounds(card)
  const lb = objectBounds(last)
  assert.equal(Math.round(cb.maxX - cb.minX), Math.round(lb.maxX - lb.minX))
  assert.equal(Math.round(cb.maxY - cb.minY), Math.round(lb.maxY - lb.minY))
  assert.ok(cb.minY >= lb.maxY, "the new card overlaps the one above it")
  assert.ok(cb.minX >= objectBounds(lane).minX, "the new card fell out of its column")
})

test("an empty column still gets a card, sized to the lane", () => {
  // Deleting every card must not disable the button that puts one back.
  const lane = sectionsOf(KANBAN)[0]
  const card = newCardFor([lane], lane)
  assert.ok(card, "an empty lane produced nothing")
  const cb = objectBounds(card)
  const lb = objectBounds(lane)
  assert.ok(cb.minX > lb.minX && cb.maxX < lb.maxX, "card is not inset within the lane")
  assert.ok(cb.minY >= lb.minY && cb.maxY <= lb.maxY, "card does not fit in the lane")
})

test("the add button sits at the foot of its lane and only responds there", () => {
  const lane = sectionsOf(KANBAN)[0]
  const size = 26
  const box = addBoxFor(lane, size)
  const b = objectBounds(lane)
  assert.ok(box.y + box.h <= b.maxY, "button hangs below the lane")
  assert.ok(box.y > (b.minY + b.maxY) / 2, "button is not at the foot")

  assert.ok(hitsAdd(lane, box.x + size / 2, box.y + size / 2, size), "centre does not hit")
  assert.ok(!hitsAdd(lane, b.minX + 4, b.minY + 4, size), "the lane's top-left hits the button")
  assert.ok(!hitsAdd(lane, box.x - size, box.y, size), "hit region reaches outside the button")
})

test("the button scales with zoom rather than staying a fixed world size", () => {
  // Passed in as a world size derived from screen px, so it stays the same on screen at
  // any zoom — the same rule the selection handles and connector grips follow.
  const lane = sectionsOf(KANBAN)[0]
  assert.ok(addBoxFor(lane, 40).w > addBoxFor(lane, 20).w)
})
