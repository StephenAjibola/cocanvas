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
  for (const id of TEMPLATE_IDS) {
    for (const o of templateObjects(id)) {
      if (o.type !== "stroke") continue
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
    ["kanban", "Fix authentication token expiration issue"],
    ["affinity", "Checkout process is too long."],
    ["persona", "Alex the Data Analyst"],
    ["journey", "Sees targeted ad on tech blog"],
    ["usability", "U_002"],
    ["roadmap", "Strategy Doc"],
    ["blueprint", "Process Registration"],
    ["mindmap", "Project Phoenix"],
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

test("mind map connectors are solid arrows, closed and painted under the notes", () => {
  const objects = templateObjects("mindmap")
  const links = objects.filter((o) => o.type === "stroke")
  assert.ok(links.length >= 3, "expected a branch per node")
  for (const l of links) {
    if (l.type !== "stroke") continue
    assert.equal(l.shape, "arrow", "branches must be solid directional arrows")
    // fill() needs the outline to return to its start; an open path paints a wedge.
    assert.equal(l.points[0], l.points[l.points.length - 2], "arrow outline is not closed in x")
    assert.equal(l.points[1], l.points[l.points.length - 1], "arrow outline is not closed in y")
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
