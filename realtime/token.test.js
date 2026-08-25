// node --test
import { test } from "node:test"
import assert from "node:assert/strict"
import { signToken, verifyToken } from "./token.js"

const SECRET = "test-secret"
const valid = () => ({ boardId: "board1", userId: "u1", name: "Ada", exp: Date.now() + 60_000 })

test("a token signed with the secret round-trips", () => {
  const claims = verifyToken(signToken(valid(), SECRET), SECRET)
  assert.equal(claims.boardId, "board1")
  assert.equal(claims.userId, "u1")
})

test("a token signed with a different secret is rejected", () => {
  assert.equal(verifyToken(signToken(valid(), "other-secret"), SECRET), null)
})

test("an expired token is rejected", () => {
  const stale = { ...valid(), exp: Date.now() - 1 }
  assert.equal(verifyToken(signToken(stale, SECRET), SECRET), null)
})

test("tampering with the payload invalidates the signature", () => {
  // The attack this is really guarding: swap the boardId to join someone else's room
  // while keeping a signature that was legitimately issued for your own.
  const token = signToken(valid(), SECRET)
  const [, sig] = token.split(".")
  const forgedBody = Buffer.from(
    JSON.stringify({ ...valid(), boardId: "someone-elses-board" }),
  ).toString("base64url")
  assert.equal(verifyToken(`${forgedBody}.${sig}`, SECRET), null)
})

test("malformed input is rejected rather than throwing", () => {
  for (const bad of [null, undefined, 42, "", ".", "nodot", "a.b", "....", {}]) {
    assert.equal(verifyToken(bad, SECRET), null, `${JSON.stringify(bad)} should not verify`)
  }
})
