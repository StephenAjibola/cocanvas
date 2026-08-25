// node --test src/lib/prefs.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { MEMORY, PREFS, clearLocalCache } from "./prefs.ts"

/** The three methods clearLocalCache actually touches, over a plain Map. */
function fakeStore(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
    get size() {
      return map.size
    },
    has: (k: string) => map.has(k),
  } as unknown as Storage & { size: number; has(k: string): boolean }
}

test("clearing removes every preference key and counts what was there", () => {
  const store = fakeStore({
    [PREFS.defaultBrushes]: "true",
    [PREFS.hideCursors]: "false",
  })
  assert.equal(clearLocalCache(store), 2)
  assert.equal(store.size, 0)
})

test("clearing reports zero the second time, so the button can't lie", () => {
  const store = fakeStore({ [PREFS.smartGuides]: "false" })
  assert.equal(clearLocalCache(store), 1)
  assert.equal(clearLocalCache(store), 0, "nothing left to clear")
})

test("clearing never touches a key this app did not write", () => {
  // The namespace exists precisely so that a reset cannot take out an unrelated key —
  // this store shares a browser origin with whatever else lives there.
  const store = fakeStore({
    [PREFS.hideCursors]: "true",
    "next-auth.session-token": "keep-me",
    "some-other-app": "keep-me-too",
  })
  assert.equal(clearLocalCache(store), 1)
  assert.ok(store.has("next-auth.session-token"), "session survived the reset")
  assert.ok(store.has("some-other-app"))
})

test("no storage at all is a no-op, not a crash", () => {
  // Server render, or a browser with site data blocked.
  assert.equal(clearLocalCache(null), 0)
})

test("a key that throws on read does not abandon the remaining keys", () => {
  const inner = fakeStore({ [PREFS.hideCursors]: "true", [PREFS.smartGuides]: "true" })
  const hostile = {
    getItem(k: string) {
      if (k === PREFS.defaultBrushes) throw new Error("blocked")
      return inner.getItem(k)
    },
    removeItem: (k: string) => inner.removeItem(k),
    setItem: (k: string, v: string) => inner.setItem(k, v),
  } as unknown as Storage

  assert.equal(clearLocalCache(hostile), 2, "the other two were still cleared")
})

test("every key this app writes is namespaced, so the clear stays scoped", () => {
  for (const key of Object.values(PREFS)) {
    assert.ok(key.startsWith("tf:pref:"), `${key} is not namespaced`)
  }
  for (const key of Object.values(MEMORY)) {
    assert.ok(key.startsWith("tf:mem:"), `${key} is not namespaced`)
  }
})

test("clearing takes remembered brush state with the preferences", () => {
  // "Clear local cache" says it resets preferences to their defaults. Leaving the
  // remembered pen behind would mean the board still opens in last week's brush after a
  // reset that claimed to have undone exactly that.
  const store = fakeStore({
    [PREFS.smartGuides]: "false",
    [MEMORY.brush]: "chalk",
    [MEMORY.penColor]: "#ef4444",
  })
  assert.equal(clearLocalCache(store), 3)
  assert.equal(store.size, 0)
})
