// node --test src/lib/share.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { SHARE_ACCESS, SHARE_LABELS, grantsAccess, isShareAccess } from "./share.ts"

test("isShareAccess rejects everything that isn't a tier", () => {
  // This guards the PATCH body on its way to a plain string column, same job as isTheme.
  for (const tier of SHARE_ACCESS) assert.ok(isShareAccess(tier), `${tier} should be a tier`)
  for (const bad of ["OFF", "", "edit", "VIEWER", "public", null, undefined, 0, {}, ["view"]]) {
    assert.ok(!isShareAccess(bad), `${JSON.stringify(bad)} should not be a tier`)
  }
})

test("a role name is never a share tier, and vice versa", () => {
  // The two vocabularies are deliberately separate: a link visitor has no Membership, so
  // a Role can never describe link access. If these ever start overlapping it means
  // somebody has begun conflating them, which is the mistake this split exists to avoid.
  for (const role of ["OWNER", "EDITOR", "VIEWER", "COMMENTER"]) {
    assert.ok(!isShareAccess(role), `${role} is a Role, not a share tier`)
  }
})

test("only view and comment open the board", () => {
  assert.equal(grantsAccess("view"), true)
  assert.equal(grantsAccess("comment"), true)
  assert.equal(grantsAccess("off"), false)
})

test("an unrecognised stored value denies access rather than granting it", () => {
  // The column is a plain string, so a row written by a future build — or by hand — can
  // hold anything. /view/[token] calls this to decide whether to serve a board with no
  // session behind it, so the fallback has to be closed, not open.
  for (const junk of ["", "VIEW", "public", "true", "off "]) {
    assert.equal(grantsAccess(junk), false, `${JSON.stringify(junk)} must not grant access`)
  }
})

test("every tier has a label and a hint, so the control can never render blank", () => {
  for (const tier of SHARE_ACCESS) {
    assert.ok(SHARE_LABELS[tier].label.length > 0, `${tier} has no label`)
    assert.ok(SHARE_LABELS[tier].hint.length > 0, `${tier} has no hint`)
  }
})

test("the comment tier's hint says an account is required", () => {
  // Comment.authorId is non-nullable, so commenting cannot be anonymous. The control is
  // the only place a person learns that before handing the link out, and this pins the
  // promise so a later copy edit cannot quietly drop it.
  assert.match(SHARE_LABELS.comment.hint, /sign/i)
  // View must NOT claim the same thing — that tier really is account-free.
  assert.doesNotMatch(SHARE_LABELS.view.hint, /sign/i)
})
