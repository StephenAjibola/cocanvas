// Explicit .ts specifier: these are *value* imports, so `node --test` has to resolve
// them at runtime. The extensionless imports elsewhere in lib/ are type-only and erased.
import {
  type BoardObject,
  type Geom,
  isLabelable,
  sortByOrder,
  translateObject,
  writeGeom,
} from "./objects.ts"
import type { LineStyle } from "./strokes"

/**
 * Undo/redo for the board.
 *
 * Entries are *data*, never closures: a closure cannot be tagged with an origin or
 * serialized, and both are what the collaborative story needs. Once the board moves
 * into Y.Map<id, BoardObject>, this module is deleted outright and undo becomes a
 * Y.UndoManager with `trackedOrigins` set to the local origin — which is what scopes
 * Ctrl+Z to your own actions instead of letting it revert a peer's work.
 *
 * Nothing here holds a reference to a live object for its *before* state. The draw loop
 * mutates in place (translateObject, Object.assign), so a stored reference would mutate
 * along with the document and undo would silently no-op. Deltas and scalars only.
 */

/**
 * Structural rather than Pick<Stroke, …>: it spans both members of the union. A stroke
 * patch may carry either field, a note patch only ever carries `color` — notes have no
 * width — so one type covers both without a second entry kind.
 *
 * `fill`, `dash` and `curve` are keyed on PRESENCE, not on value: an explicit
 * `fill: undefined` is how "no fill" is expressed — likewise `dash: undefined` for solid
 * and `curve: undefined` for straight — so anything reading a patch has to ask
 * `"fill" in patch` rather than compare against undefined. Object.assign copies the key
 * either way, and JSON.stringify drops it, which is the same thing absence already means
 * on a Stroke. A `!== undefined` test typechecks here and silently breaks undo.
 */
export type StylePatch = {
  color?: string
  width?: number
  fill?: string
  dash?: LineStyle
  curve?: number
  /** Text size, world units. Only meaningful on a note — see Note.font. */
  font?: number
}

export type Entry =
  /** Anything placed on the board. `index` is paint order — see apply(). */
  | { kind: "add"; object: BoardObject; index: number }
  | { kind: "remove"; object: BoardObject; index: number }
  | { kind: "move"; id: string; dx: number; dy: number }
  | { kind: "style"; id: string; before: StylePatch; after: StylePatch }
  /**
   * One entry per editing session, not per keystroke. While the textarea has focus
   * isTypingTarget() keeps board-level Ctrl+Z out of the way and the browser's own
   * field undo handles the typing, so history only needs the before/after of the
   * whole edit.
   */
  | { kind: "text"; id: string; before: string; after: string }
  /**
   * Several changes that happened as one gesture, undone as one step.
   *
   * A single eraser drag can take out a dozen objects; without this each would need its
   * own Ctrl+Z, which breaks the one-gesture-one-step rule every other tool here
   * follows. Undo replays in reverse so re-inserted indices line up.
   */
  | { kind: "batch"; entries: Entry[] }
  /**
   * Bring to front / send to back.
   *
   * Carries `z` VALUES, not array indices. Array position used to be z-order outright,
   * which stopped working the moment the board became a Y.Map: a map has no order, so
   * two peers splicing at index 3 do not agree on what index 3 means. An explicit key
   * is the thing that survives the round trip — see orderOf in objects.ts.
   *
   * `before` is optional because most objects have never been reordered and carry no
   * `z` at all; undoing back to absent is what restores creation order.
   */
  | { kind: "reorder"; id: string; before: number | undefined; after: number }
  | { kind: "lock"; id: string; locked: boolean }
  /**
   * A resize or rotate gesture. One entry covers both, because both mutate the same
   * geometry — and one gesture stays one undo step, like every other tool here.
   */
  | { kind: "transform"; id: string; before: Geom; after: Geom }

/**
 * How long a run of edits to one field stays one undo step.
 *
 * The width slider fires React onChange per pixel of drag, so without this a single
 * drag would bury the rest of the history under hundreds of entries. React maps
 * onChange to the `input` event and gives no commit event to hook instead, so a time
 * window is genuinely less code than synthesizing one.
 */
export const COALESCE_MS = 600

const byId = (objects: BoardObject[], id: string) => objects.find((o) => o.id === id)

const sameKeys = (a: StylePatch, b: StylePatch) => {
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i])
}

function removeObject(objects: BoardObject[], object: BoardObject, index: number) {
  // Trust the recorded index only if the object is still sitting there. Undo runs
  // LIFO so it usually is, but an index that has drifted would splice out a bystander.
  const i = objects[index] === object ? index : objects.indexOf(object)
  if (i >= 0) objects.splice(i, 1)
}

function apply(objects: BoardObject[], e: Entry, undo: boolean) {
  switch (e.kind) {
    case "add":
    case "remove": {
      // Mirror images: undoing an add is exactly redoing a remove.
      const removing = (e.kind === "add") === undo
      // splice at the recorded index, never push — array position IS z-order, so a
      // restored object has to land back under whatever was painted over it.
      if (removing) removeObject(objects, e.object, e.index)
      else objects.splice(e.index, 0, e.object)
      break
    }
    case "move": {
      const o = byId(objects, e.id)
      if (o) translateObject(o, undo ? -e.dx : e.dx, undo ? -e.dy : e.dy)
      break
    }
    case "style": {
      const o = byId(objects, e.id)
      if (o) Object.assign(o, undo ? e.before : e.after)
      break
    }
    case "reorder": {
      const o = byId(objects, e.id)
      if (!o) break
      o.z = undo ? e.before : e.after
      // The array is kept in paint order so drawObjects can stay a plain forward loop.
      sortByOrder(objects)
      break
    }
    case "lock": {
      const o = byId(objects, e.id)
      if (o) o.locked = undo ? !e.locked : e.locked
      break
    }
    case "transform": {
      const o = byId(objects, e.id)
      if (o) writeGeom(o, undo ? e.before : e.after)
      break
    }
    case "batch": {
      // Reverse on undo: entry N was recorded against the array state entry N-1 left
      // behind, so unwinding has to walk back through it in the same order.
      const list = undo ? [...e.entries].reverse() : e.entries
      for (const sub of list) apply(objects, sub, undo)
      break
    }
    case "text": {
      const o = byId(objects, e.id)
      // Notes and labelled shapes both carry text; a freehand stroke never does, so an
      // entry aimed at one is dropped rather than grafting a stray field onto it.
      if (o && isLabelable(o)) o.text = undo ? e.before : e.after
      break
    }
  }
}

/**
 * Operates on the caller's array in place — it never replaces it. The canvas effect
 * captures `objectsRef.current` once and renders from that exact array; handing back a
 * new one would leave the draw loop painting a dead copy. This is also why snapshots
 * are not an option here.
 */
export function createHistory(objects: BoardObject[]) {
  const past: Entry[] = []
  const future: Entry[] = []
  let lastPush = 0

  return {
    /** `now` is injectable so the coalescing window is testable without a fake clock. */
    push(entry: Entry, now = Date.now()) {
      future.length = 0 // a new action forks the timeline; the redo branch is gone
      const top = past[past.length - 1]
      if (
        entry.kind === "style" &&
        top?.kind === "style" &&
        top.id === entry.id &&
        sameKeys(top.after, entry.after) &&
        now - lastPush < COALESCE_MS
      ) {
        // Keep the original `before`, so the whole drag undoes to where it started.
        top.after = entry.after
      } else {
        past.push(entry)
      }
      lastPush = now
    },
    undo() {
      const e = past.pop()
      if (!e) return false
      apply(objects, e, true)
      future.push(e)
      return true
    },
    redo() {
      const e = future.pop()
      if (!e) return false
      apply(objects, e, false)
      past.push(e)
      return true
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  }
}
