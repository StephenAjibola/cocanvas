// node --test src/lib/templates.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  TEMPLATE_HINTS,
  TEMPLATE_IDS,
  TEMPLATE_NAMES,
  isTemplateId,
  templateObjects,
} from "./templates.ts"
import { isBoardObject, visualBounds } from "./objects.ts"

test("every template produces objects the API will actually accept", () => {
  // isBoardObject is the guard PUT /objects runs at the trust boundary. A template that
  // fails it would be silently dropped on the first save, so the board would seed and
  // then empty itself.
  for (const id of TEMPLATE_IDS) {
    for (const o of templateObjects(id)) {
      assert.ok(isBoardObject(o), `${id} produced an object the route would reject`)
    }
  }
})

test("blank stays empty — its existing behaviour is unchanged", () => {
  assert.deepEqual(templateObjects("blank"), [])
})

test("every non-blank template actually seeds something", () => {
  // A template that silently produces nothing is indistinguishable from Blank, which is
  // the failure mode of adding one and forgetting to wire its case.
  for (const id of TEMPLATE_IDS) {
    if (id === "blank") continue
    assert.ok(templateObjects(id).length > 0, `${id} seeded an empty board`)
  }
})

test("object ids are unique within a template", () => {
  // Ids are the Y.Map keys and the BoardObject primary key. A duplicate would collapse
  // two objects into one on save.
  for (const id of TEMPLATE_IDS) {
    const objects = templateObjects(id)
    const ids = new Set(objects.map((o) => o.id))
    assert.equal(ids.size, objects.length, `${id} has duplicate ids`)
  }
})

test("no template starts off-screen at the board's opening view", () => {
  // A board opens with the world origin at the TOP-LEFT of the screen, not the centre.
  // Geometry built around (0,0) puts half of itself off the top and left edges — which is
  // exactly how the first mind map shipped, core clipped by the header and two satellites
  // out of view. Extent may exceed the viewport; the ORIGIN may not.
  const RAIL = 96
  for (const id of TEMPLATE_IDS) {
    for (const o of templateObjects(id)) {
      const b = visualBounds(o)
      assert.ok(b.minX >= RAIL, `${id}: an object starts at x=${Math.round(b.minX)}, under the rail`)
      assert.ok(b.minY >= 0, `${id}: an object starts at y=${Math.round(b.minY)}, above the top edge`)
    }
  }
})

test("every template's opening corner is visible without panning", () => {
  const VIEW_W = 1100
  const VIEW_H = 620
  for (const id of TEMPLATE_IDS) {
    const objects = templateObjects(id)
    if (!objects.length) continue
    const minX = Math.min(...objects.map((o) => visualBounds(o).minX))
    const minY = Math.min(...objects.map((o) => visualBounds(o).minY))
    assert.ok(minX < VIEW_W, `${id}: nothing visible horizontally`)
    assert.ok(minY < VIEW_H, `${id}: nothing visible vertically`)
  }
})

test("every template is named and described", () => {
  for (const id of TEMPLATE_IDS) {
    assert.ok(TEMPLATE_NAMES[id]?.length, `${id} has no name`)
    assert.ok(TEMPLATE_HINTS[id]?.length, `${id} has no hint`)
  }
})

test("frames are FILLED, not hollow outlines", () => {
  // The first version drew unfilled rectangles, which read as a wireframe rather than a
  // board — a card in the source designs is a white panel with a hairline border, and an
  // outline is a drawing OF that card. Every framing shape must carry a fill.
  //
  // Arrows are the one exception, and not a loophole: an arrow is a straight LINE, so it
  // has no interior to fill. Its head is painted from its endpoints by the renderer.
  for (const id of TEMPLATE_IDS) {
    for (const o of templateObjects(id)) {
      if (o.type !== "stroke") continue
      if (o.shape === "arrow") {
        assert.ok(!o.fill, `${id}: an arrow carries a fill, but a line has nothing to fill`)
        continue
      }
      assert.ok(o.fill, `${id}: a shape has no fill and will render as a wireframe`)
    }
  }
})

test("templates carry the designs' own content, not placeholder labels", () => {
  // "Theme A" teaches nothing about what belongs in a cluster. A template that models a
  // METHOD ships the worked example the design used, so the structure is legible before
  // you have typed anything.
  const withContent: [string, string][] = [
    ["swot", "Market Leader in Core Segment"],
    ["kanban", "Fix checkout button not responding on mobile"],
    ["affinity", "Checkout process is too long."],
    ["persona", "Alex the Data Analyst"],
    ["journey", "Sees targeted ad on tech blog"],
    ["usability", "U_002"],
    ["roadmap", "Strategy Doc"],
    ["blueprint", "Process Registration"],
    ["mindmap", "New Product Launch"],
    ["userflow", "Has Account?"],
  ]
  for (const [id, needle] of withContent) {
    const text = templateObjects(id as never)
      .map((o) => (o.type === "note" ? o.text : o.type === "stroke" ? (o.text ?? "") : ""))
      .join(" | ")
    assert.ok(text.includes(needle), `${id} is missing "${needle}"`)
  }
})

test("brainstorming stays deliberately empty", () => {
  // The one template that is a blank slate by design: three stickies with nothing written
  // in them, because there is no worked example of "have an idea".
  const objects = templateObjects("brainstorming")
  const stickies = objects.filter((o) => o.type === "note" && !o.bare)
  assert.equal(stickies.length, 3)
  assert.ok(stickies.every((o) => o.type === "note" && o.text === ""))
  assert.equal(new Set(stickies.map((o) => (o.type === "note" ? o.color : ""))).size, 3)
})

test("kanban has four columns, ordered left to right and not overlapping", () => {
  const objects = templateObjects("kanban")
  const names = objects
    .filter((o) => o.type === "note" && o.bare)
    .map((o) => (o.type === "note" ? o.text : ""))
  for (const n of ["To Do", "In Progress", "Testing", "Done"]) {
    assert.ok(names.includes(n), `missing column ${n}`)
  }
  // The lane panels are the tall shapes; they must not overlap, or a card dropped between
  // two columns belongs to neither.
  const lanes = objects
    .filter((o) => o.type === "stroke")
    .map((o) => visualBounds(o))
    .filter((b) => b.maxY - b.minY > 400)
    .sort((a, b) => a.minX - b.minX)
  assert.equal(lanes.length, 4, "expected four column lanes")
  for (let i = 1; i < lanes.length; i++) {
    assert.ok(lanes[i - 1].maxX <= lanes[i].minX, `column ${i - 1} overlaps ${i}`)
  }
})

test("mind map connectors are straight arrows, painted under the notes", () => {
  const objects = templateObjects("mindmap")
  const links = objects.filter((o) => o.type === "stroke")
  assert.ok(links.length >= 3, "expected a branch per node")
  for (const l of links) {
    if (l.type !== "stroke") continue
    assert.equal(l.shape, "arrow", "branches must be arrows")
    // Two endpoints, not a closed polygon. A branch is a line with a head on it; baking
    // the head into the geometry is what made an arrow a shape rather than a connector.
    assert.equal(l.points.length, 4, "branch is not a straight two-point arrow")
  }
  const lastLink = Math.max(...links.map((o) => o.createdAt))
  const firstNote = Math.min(...objects.filter((o) => o.type === "note").map((o) => o.createdAt))
  assert.ok(lastLink < firstNote, "connectors must be created before the notes")
})

test("table and grid templates lay their cells out across, not on top of each other", () => {
  // A dropped `x += width` stacked every cell of a usability row onto the first column.
  //
  // Measured over ALL objects, not just the frames: a blueprint layer is legitimately ONE
  // wide panel per row with its cells as notes inside, so filtering to shapes would call
  // a correct layout broken. What every one of these has in common is cells at three or
  // more distinct left edges.
  for (const id of ["usability", "journey", "blueprint", "roadmap"] as const) {
    const lefts = templateObjects(id).map((o) => Math.round(visualBounds(o).minX))
    assert.ok(
      new Set(lefts).size >= 3,
      `${id}: cells share a left edge — the row never advanced`,
    )
  }
})

test("isTemplateId rejects anything that isn't one", () => {
  for (const id of TEMPLATE_IDS) assert.ok(isTemplateId(id))
  for (const bad of ["", "Blank", "gantt", "SWOT", null, undefined, 3, {}]) {
    assert.ok(!isTemplateId(bad), `${JSON.stringify(bad)} should not be a template`)
  }
})

test("no template seeds content about THIS project", () => {
  // Templates are starting points, not a record of the work that built the app. The
  // kanban once held real CoCanvas tickets (auth tokens, SCIM, "glassmorphism effects")
  // and the mind map mapped this very rebrand, so opening either read as somebody else's
  // finished notes rather than an empty method to fill in.
  //
  // Matched case-insensitively against every piece of seeded text. The list is the
  // vocabulary specific to building THIS app — a generic board would never contain it.
  const OURS = [
    "cocanvas",
    "thinkframe",
    "glassmorphism",
    "scim",
    "prisma",
    "turbopack",
    "next.js",
    "yjs",
    "sprint 24",
  ]
  for (const id of TEMPLATE_IDS) {
    for (const o of templateObjects(id)) {
      const text = (o.type === "note" ? o.text : o.type === "stroke" ? (o.text ?? "") : "")
        .toLowerCase()
      if (!text) continue
      for (const term of OURS) {
        assert.ok(!text.includes(term), `${id} seeds "${term}" — that is this project, not a template`)
      }
    }
  }
})

test("kanban column badges match the cards actually in each column", () => {
  // "Done" read 12 above a single card. A count that contradicts what is directly
  // beneath it is worse than no count, and the badges are only trustworthy while they
  // are derived rather than typed.
  const objects = templateObjects("kanban")
  const lanes = objects
    .filter((o) => o.type === "stroke")
    .map((o) => visualBounds(o))
    .filter((b) => b.maxY - b.minY > 400)
    .sort((a, b) => a.minX - b.minX)
  assert.equal(lanes.length, 4)

  // A card is the white panel carrying the ticket text; the tag above it is a note.
  const cards = objects.filter(
    (o) => o.type === "stroke" && o.text && visualBounds(o).maxY - visualBounds(o).minY < 200,
  )
  // Badges are the bare labels holding nothing but digits.
  const badges = objects.filter((o) => o.type === "note" && o.bare && /^\d+$/.test(o.text))
  assert.equal(badges.length, 4, "expected one count badge per column")

  for (const lane of lanes) {
    const inLane = (o: (typeof objects)[number]) => {
      const b = visualBounds(o)
      return b.minX >= lane.minX && b.maxX <= lane.maxX
    }
    const badge = badges.find(inLane)
    assert.ok(badge && badge.type === "note", "a column has no badge")
    const actual = cards.filter(inLane).length
    assert.equal(
      Number(badge.text),
      actual,
      `column badge says ${badge.text} but holds ${actual} cards`,
    )
  }
})
