// node --test src/lib/names.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { defaultWorkspaceName, titleCaseName } from "./names.ts"

test("an all-lowercase name gets title-cased", () => {
  // The reported bug: "soboyede stephen's Workspace".
  assert.equal(titleCaseName("soboyede stephen"), "Soboyede Stephen")
  assert.equal(titleCaseName("ada"), "Ada")
})

test("a name that already carries capitals is left exactly alone", () => {
  // This is what stops the fix being worse than the bug. Blanket title-casing mangles
  // names that were typed correctly, and a mangled name is more offensive than an
  // uncapitalised one because it looks like the app decided it knew better.
  for (const name of ["McDonald", "van der Berg", "IBM", "Jo-Anne O'Neill", "e e cummings Jr"]) {
    assert.equal(titleCaseName(name), name, `${name} must survive untouched`)
  }
})

test("a deliberately all-lowercase name IS capitalised — the known cost of this rule", () => {
  // Stated as a test rather than left as a surprise. "danah boyd" lowercases her name on
  // purpose, and nothing in the string distinguishes that from someone typing quickly, so
  // this rule cannot preserve it.
  //
  // Accepted because of WHERE this is used: it builds a workspace LABEL, and never writes
  // back to User.name. The person's own name is untouched in the database and everywhere
  // it is displayed — only the auto-generated "…'s Workspace" title is affected, and that
  // is a string they can be given a way to edit. Getting the common case right (a name
  // typed all-lowercase at signup) is worth this, where mutating the stored name would
  // not have been.
  assert.equal(titleCaseName("danah boyd"), "Danah Boyd")
})

test("hyphens and apostrophes are word boundaries too", () => {
  assert.equal(titleCaseName("mary-jane o'brien"), "Mary-Jane O'Brien")
  // The curly apostrophe people's phones actually produce.
  assert.equal(titleCaseName("mary o’brien"), "Mary O’Brien")
})

test("surrounding and repeated whitespace is normalised", () => {
  assert.equal(titleCaseName("  stephen   ajibola  "), "Stephen Ajibola")
})

test("an empty name stays empty rather than becoming punctuation", () => {
  assert.equal(titleCaseName(""), "")
  assert.equal(titleCaseName("   "), "")
})

test("the workspace name falls back to the email's local part, made readable", () => {
  // "soboyede.stephen" is a name with separators, not a word — turning them into spaces
  // before casing is what stops "Soboyede.stephen's Workspace".
  assert.equal(
    defaultWorkspaceName(null, "soboyede.stephen@example.com"),
    "Soboyede Stephen's Workspace",
  )
  assert.equal(defaultWorkspaceName(null, "ada_lovelace@example.com"), "Ada Lovelace's Workspace")
})

test("a real name beats the email, and keeps its own casing", () => {
  assert.equal(
    defaultWorkspaceName("McDonald", "someone@example.com"),
    "McDonald's Workspace",
  )
  assert.equal(
    defaultWorkspaceName("soboyede stephen", "x@example.com"),
    "Soboyede Stephen's Workspace",
  )
})

test("a blank name falls through to the email rather than producing \"'s Workspace\"", () => {
  assert.equal(defaultWorkspaceName("   ", "ada@example.com"), "Ada's Workspace")
})
