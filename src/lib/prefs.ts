/**
 * Per-browser preferences: the settings that describe how YOU want to work, not what
 * the board is.
 *
 * The split is deliberate and worth stating, because the two nearly-identical toggles in
 * this app land on opposite sides of it. Canvas colour and grid style are columns on
 * Board — everyone looking at that board sees the same page. "Hide others' cursors" and
 * "always use default brushes" are here — they change what one person sees, and pushing
 * them to the server would mean one collaborator's choice reaching into another's view.
 *
 * localStorage rather than a User column for the same reason it isn't a cookie: nothing
 * on the server needs to read these, they must survive a reload, and they are worth
 * exactly as much as the browser they were set in.
 */

/**
 * Every key this app writes, in one place.
 *
 * This object is the whole contract for "Clear local cache" — that button iterates these
 * and nothing else, which is what makes it safe to describe as clearing preferences
 * rather than as a vague reset. A key added here is cleared automatically; a key written
 * anywhere else is a bug this comment exists to prevent.
 *
 * Namespaced so that clearing ours can never take an unrelated key out with it.
 */
export const PREFS = {
  /** Reset brush selection to the default pen each time a board opens. */
  defaultBrushes: "tf:pref:default-brushes",
  /** Don't render other people's cursors on this board. */
  hideCursors: "tf:pref:hide-cursors",
  /** Align a dragged object to its neighbours, and draw the guides that show why. */
  smartGuides: "tf:pref:smart-guides",
} as const

export type PrefKey = keyof typeof PREFS

/**
 * Remembered state, as opposed to preferences: what you were last using, not what you
 * asked for.
 *
 * These exist because of the "always use default brushes" preference. That toggle only
 * means something if the app otherwise REMEMBERS your brush — without this, every reload
 * already resets to the default pen, and the setting would be a switch wired to nothing.
 * So the preference is the real feature and this is its other half.
 *
 * Same namespace, and cleared by the same button, since "reset my preferences" plainly
 * includes "stop remembering the pen I was using".
 */
export const MEMORY = {
  brush: "tf:mem:brush",
  penColor: "tf:mem:pen-color",
} as const

export type MemoryKey = keyof typeof MEMORY

/** Reads remembered state, or null when absent, unreadable, or switched off. */
export function readMemory(key: MemoryKey): string | null {
  // The preference is checked HERE rather than at each call site: "always use default
  // brushes" means every read of remembered style has to come back empty, and putting
  // that in one place is what stops a later caller from forgetting to ask.
  if (readPref("defaultBrushes")) return null
  return storage()?.getItem(MEMORY[key]) ?? null
}

export function writeMemory(key: MemoryKey, value: string) {
  try {
    storage()?.setItem(MEMORY[key], value)
  } catch {
    // Same as writePref: a blocked or full store costs the memory, not the session.
  }
}

/**
 * Defaults, applied when a key was never written or the browser refuses to answer.
 *
 * Smart guides default ON because an alignment nudge is what people expect from a
 * whiteboard and it is discoverable only by happening. The other two default OFF because
 * both HIDE something, and a tool that starts by hiding your collaborators has made a
 * decision that wasn't its to make.
 */
export const PREF_DEFAULTS: Record<PrefKey, boolean> = {
  defaultBrushes: false,
  hideCursors: false,
  smartGuides: true,
}

/**
 * localStorage, or null where there isn't one.
 *
 * Two separate failures, same answer: server-side render (no `window` at all) and a
 * browser that throws on access because site data is blocked. Both mean "you get the
 * defaults", and neither is worth propagating to a caller that could not do anything
 * about it anyway.
 */
function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export function readPref(key: PrefKey): boolean {
  const raw = storage()?.getItem(PREFS[key])
  // Only the two strings we write are recognised. Anything else — a hand-edited value, a
  // key left by an older build — falls back rather than being coerced, since every
  // non-empty string is otherwise truthy and "false" would read as true.
  if (raw === "true") return true
  if (raw === "false") return false
  return PREF_DEFAULTS[key]
}

export function writePref(key: PrefKey, value: boolean) {
  try {
    storage()?.setItem(PREFS[key], String(value))
  } catch {
    // Quota or a blocked store. The in-memory state has already updated, so the toggle
    // works for this session and simply won't survive a reload — better than throwing
    // out of a click handler.
  }
}

/**
 * Removes every key in PREFS and MEMORY, and reports how many were actually there.
 *
 * The count is what the About tab shows. It is deliberately the number REMOVED rather
 * than the number of keys that exist, so pressing the button twice says "3 cleared" and
 * then "0 cleared" — which is the honest answer to "did that do anything".
 *
 * Scope is preferences only. There is no local document cache to clear: board content
 * lives in Postgres and reaches the client over the realtime connection, with no
 * IndexedDB persistence in between. If y-indexeddb is ever added, its store belongs in
 * this function and in the button's description — not silently in one or the other.
 */
export function clearLocalCache(store: Storage | null = storage()): number {
  if (!store) return 0
  let cleared = 0
  for (const key of [...Object.values(PREFS), ...Object.values(MEMORY)]) {
    try {
      if (store.getItem(key) === null) continue
      store.removeItem(key)
      cleared++
    } catch {
      // One unreadable key must not abandon the rest.
    }
  }
  return cleared
}
