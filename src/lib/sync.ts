import { type BoardObject, sortByOrder } from "./objects.ts"

/**
 * Content sync between the board's Y.Map and the local objects array.
 *
 * The array stays the source of truth for RENDERING and hit-testing — the canvas effect
 * captures `objectsRef.current` once and paints from that exact reference, so this
 * module never replaces it, only mutates it in place. The Y.Map is the transport.
 *
 * Objects are opaque map VALUES, one key per object id, never per-point CRDT structures.
 * A stroke is written once by one author and never co-edited mid-gesture, so there is
 * nothing for a finer-grained merge to do except cost bytes. What that trades away is
 * two people dragging the SAME object at once — last write wins, and the loser's drag
 * snaps. Per-field maps would fix it and are not worth it until somebody hits it.
 *
 * Deliberately free of yjs imports: everything here takes the minimal structural
 * interface below, so the whole reconciliation is testable with a plain Map and no
 * websocket, no provider, and no document.
 */

/** The slice of Y.Map this module needs. Structural, so a plain Map satisfies it. */
export type ObjectMap = {
  get(id: string): BoardObject | undefined
  set(id: string, value: BoardObject): void
  delete(id: string): void
  has(id: string): boolean
  forEach(fn: (value: BoardObject, key: string) => void): void
  keys(): IterableIterator<string>
}

/**
 * Objects travel as plain JSON, so a value pulled out of the map is a fresh object
 * every time — never the live instance the draw loop is mutating.
 *
 * structuredClone rather than JSON round-tripping: it keeps the number arrays as
 * numbers without a stringify pass, and `points` is by far the biggest field on the
 * board. Absent optional fields stay absent, which is what `"fill" in patch` semantics
 * elsewhere depend on.
 */
export const snapshot = (o: BoardObject): BoardObject => structuredClone(o)

/**
 * Copies `from` onto `into` in place, so the array and any live reference to the object
 * keep pointing at the same instance.
 *
 * Stale keys are deleted rather than left behind: absence is meaningful on these types
 * — no `fill` means transparent, no `dash` means solid, no `z` means creation order —
 * so an assign that only ever adds keys would make a cleared fill impossible to sync.
 */
export function overwrite(into: BoardObject, from: BoardObject) {
  for (const k of Object.keys(into)) {
    if (!(k in from)) delete (into as Record<string, unknown>)[k]
  }
  Object.assign(into, from)
  return into
}

/**
 * Pushes the given local objects into the map.
 *
 * Ids that are no longer in `objects` are removed from the map — that is how a delete
 * travels. Callers pass the ids they touched rather than the whole board, so a drag
 * publishes one object instead of re-serialising every stroke on screen.
 */
export function publish(map: ObjectMap, objects: BoardObject[], ids: Iterable<string>) {
  for (const id of ids) {
    const o = objects.find((x) => x.id === id)
    if (o) map.set(id, snapshot(o))
    else if (map.has(id)) map.delete(id)
  }
}

/**
 * Publishes the WHOLE local board, adding and deleting so the map matches it exactly.
 *
 * For undo and redo, which can add, remove, restyle and reorder in one step — and for a
 * batch entry, arbitrarily many of each. Tracking exactly which ids an unwind touched
 * would mean threading a callback through every branch of history's apply(); a board is
 * small and Ctrl+Z is not a hot path, so this pays a full pass instead.
 */
export function publishAll(map: ObjectMap, objects: BoardObject[]) {
  const live = new Set(objects.map((o) => o.id))
  for (const o of objects) map.set(o.id, snapshot(o))
  // Keys are materialised first: deleting while iterating the map's own iterator is
  // how you silently skip entries.
  for (const id of [...map.keys()]) {
    if (!live.has(id)) map.delete(id)
  }
}

/**
 * Rebuilds the local array from the map, in place, and reports whether anything moved.
 *
 * Existing objects are updated through `overwrite` rather than replaced, because the
 * canvas holds live references to them: `selected`, an in-flight `dragging`, and the
 * history stack all point at instances, and swapping in fresh ones would leave a drag
 * moving an object that is no longer on the board.
 *
 * `skip` protects whatever the local user is mid-gesture on. Without it a peer's echo
 * of an older state lands on top of the stroke currently being dragged and it jumps
 * backwards under the cursor — the classic collaborative-drag stutter.
 *
 * Returns false when nothing changed, so the caller can skip a repaint.
 */
export function applyRemote(
  map: ObjectMap,
  objects: BoardObject[],
  skip?: (id: string) => boolean,
) {
  const byId = new Map(objects.map((o) => [o.id, o]))
  const seen = new Set<string>()
  let changed = false

  map.forEach((value, id) => {
    seen.add(id)
    if (skip?.(id)) return
    const local = byId.get(id)
    if (!local) {
      objects.push(snapshot(value))
      changed = true
      return
    }
    // Cheap equality: these are small JSON values and the alternative is a per-field
    // walk that would have to know every optional field on both members of the union.
    if (JSON.stringify(local) !== JSON.stringify(value)) {
      overwrite(local, value)
      changed = true
    }
  })

  // Anything the map no longer has was erased by a peer.
  for (let i = objects.length - 1; i >= 0; i--) {
    const id = objects[i].id
    if (seen.has(id) || skip?.(id)) continue
    objects.splice(i, 1)
    changed = true
  }

  if (changed) sortByOrder(objects)
  return changed
}

/**
 * Fills an EMPTY map from the database snapshot, and reports whether it did.
 *
 * Guarded on emptiness because the first client into a room is the only one that should
 * seed it: a later joiner already receives the live document, and writing its own stale
 * copy of the database over the top would resurrect objects other people just erased.
 * Emptiness is the only signal available here that nobody has been in the room yet.
 */
export function seed(map: ObjectMap, objects: BoardObject[]) {
  for (const _ of map.keys()) return false
  for (const o of objects) map.set(o.id, snapshot(o))
  return true
}

/** Every object in the map, in paint order. What the persistence layer writes out. */
export function readAll(map: ObjectMap): BoardObject[] {
  const out: BoardObject[] = []
  map.forEach((value) => out.push(snapshot(value)))
  return sortByOrder(out)
}
