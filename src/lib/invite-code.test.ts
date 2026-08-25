// node --test src/lib/invite-code.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  JOIN_CODE_ROLE,
  formatInviteCode,
  generateInviteCode,
  normalizeInviteCode,
} from "./invite-code.ts"

test("a generated code is 8 symbols, grouped, from the safe alphabet", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateInviteCode()
    assert.match(code, /^[23456789A-HJ-NP-TV-Z]{4}-[23456789A-HJ-NP-TV-Z]{4}$/, code)
  }
})

test("generated codes never contain the confusable characters", () => {
  // 0/O and 1/I/L are the pairs people mistype off a screen; U is excluded to keep the
  // generator from producing accidental words.
  for (let i = 0; i < 500; i++) {
    const bare = generateInviteCode().replace("-", "")
    for (const bad of ["0", "O", "1", "I", "L", "U"]) {
      assert.ok(!bare.includes(bad), `${bare} contains ${bad}`)
    }
  }
})

test("codes are not repeated in any small run", () => {
  // Not a randomness proof — a smoke test that the generator is actually drawing per
  // call rather than returning a constant, which a broken refactor would produce.
  const seen = new Set<string>()
  for (let i = 0; i < 500; i++) seen.add(generateInviteCode())
  assert.equal(seen.size, 500)
})

test("normalize forgives case, spaces and dashes", () => {
  const canonical = "ABCD-2345"
  for (const typed of ["ABCD-2345", "abcd-2345", "ABCD2345", "abcd 2345", "  AbCd-2345  "]) {
    assert.equal(normalizeInviteCode(typed), canonical, typed)
  }
})

test("normalize refuses an excluded character rather than guessing", () => {
  // A typed "0" could be a misread 8, D or Q. Remapping it would turn one wrong code
  // into a different wrong code and fail twice; failing once is the honest answer.
  for (const bad of ["0BCD-2345", "IBCD-2345", "LBCD-2345", "OBCD-2345", "UBCD-2345"]) {
    assert.equal(normalizeInviteCode(bad), null, bad)
  }
})

test("normalize refuses the wrong length", () => {
  assert.equal(normalizeInviteCode("ABCD-234"), null)
  assert.equal(normalizeInviteCode("ABCD-23456"), null)
  assert.equal(normalizeInviteCode(""), null)
})

test("normalize refuses anything that isn't a string", () => {
  // This value comes straight off a request body.
  for (const bad of [null, undefined, 42, {}, ["ABCD-2345"], true]) {
    assert.equal(normalizeInviteCode(bad), null, JSON.stringify(bad))
  }
})

test("a generated code always normalizes back to itself", () => {
  // The round trip is what lets the route look up by the normalized form and match what
  // was stored at creation.
  for (let i = 0; i < 200; i++) {
    const code = generateInviteCode()
    assert.equal(normalizeInviteCode(code), code)
    assert.equal(normalizeInviteCode(code.replace("-", "").toLowerCase()), code)
  }
})

test("format regroups a bare code for display", () => {
  assert.equal(formatInviteCode("ABCD2345"), "ABCD-2345")
  assert.equal(formatInviteCode("ABCD-2345"), "ABCD-2345")
})

test("a workspace join code can never grant more than VIEWER", () => {
  // The one line standing between "a code read out in a meeting" and "anyone who
  // overhears it can edit the workspace". An addressed invite carries the role its
  // inviter chose; this one has chosen nobody, so raising it is a deliberate act that
  // has to fail here first.
  assert.equal(JOIN_CODE_ROLE, "VIEWER")
})

test("workspace join codes are the same shape the join field accepts", () => {
  // Both kinds of code go through one input and one normalize() in the redeem route.
  // A workspace code generated in a different shape would be rejected client-side
  // before the route ever saw it.
  for (let i = 0; i < 50; i++) {
    const code = generateInviteCode()
    assert.equal(normalizeInviteCode(code), code)
    assert.equal(normalizeInviteCode(code.toLowerCase().replace("-", " ")), code)
  }
})
