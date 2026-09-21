"use client"

import { type RefObject, useEffect, useRef } from "react"
import * as Y from "yjs"
import { WebsocketProvider } from "y-websocket"
import { SWATCHES } from "@/lib/theme"
import type { BoardObject } from "@/lib/objects"
import { type ObjectMap, applyRemote, publish, publishAll, seed } from "@/lib/sync"

const WS_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? "ws://localhost:1234"

/** How long the board stays quiet before its contents are written to Postgres. */
const SAVE_DEBOUNCE_MS = 1500

/**
 * TEMPORARY: traces the live-content path in dev, to settle a report that a stroke
 * drawn in one tab does not reach an already-open second tab.
 *
 * The whole chain reproduces correctly outside the browser — real WebsocketProvider,
 * real relay, real publish/applyRemote — so what it cannot show is which link is
 * missing in an actual page. Remove once that is answered.
 */
const trace = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") console.log("[sync]", ...args)
}

/**
 * Names a transaction origin for the trace.
 *
 * The three that matter are distinguishable: our own writes carry LOCAL, anything the
 * provider applied off the wire carries the provider itself, and `null` is Yjs's own
 * origin for a local doc mutation nobody tagged.
 */
const originName = (o: unknown) =>
  o === LOCAL ? "LOCAL" : o === null ? "null" : o?.constructor?.name ?? String(o)

/**
 * Marks transactions this client originated, so the observer can ignore its own echo.
 *
 * Without it every local publish comes straight back through observe and costs a full
 * reconcile — correct, because applyRemote finds nothing changed, but a JSON compare of
 * the whole board on every pointer frame is exactly the work this avoids.
 */
const LOCAL = Symbol("local")

/**
 * Live counters for the dev-only sync badge.
 *
 * DIAGNOSTIC: exists to answer one question from inside a real tab without devtools —
 * does `ymap.observe` fire when a peer draws? Console tracing could not answer it,
 * because the tab being tested is the one nobody has the console open on.
 *
 * Read the badge in the IDLE tab while the other draws:
 *   remote stays 0    -> nothing reached this tab's document (socket/relay/room)
 *   remote climbs,
 *     applied stays 0 -> it arrived but applyRemote saw no change (hold set, or equal)
 *   applied climbs,
 *     nothing renders -> the break is render-side, not sync-side
 */
export type SyncStats = {
  status: string
  /** Every update applied to the doc, whatever its origin. */
  docUpdates: number
  /** ymap.observe firings with a non-LOCAL origin — a PEER's write. */
  remote: number
  /** ymap.observe firings that were our own echo. */
  own: number
  /** Remote firings where applyRemote actually changed the local array. */
  applied: number
  /** performance.now() of the last remote firing, 0 for never. */
  lastRemoteAt: number
  mapSize: number
  objects: number
}

/** Cursor position is in WORLD coordinates — see the note in useBoardSync. */
export type RemoteCursor = { name: string; color: string; x: number; y: number }

/** Stable per user, so a person is the same color in every tab without storing it. */
function colorFor(userId: string) {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  return SWATCHES[h % SWATCHES.length].color
}

/**
 * Joins the board's realtime room: peer cursors AND board content, over one socket.
 *
 * The two travel by deliberately different routes. Cursors live in Yjs *awareness*,
 * which is ephemeral peer state the server drops on disconnect and on timeout, so a
 * closed tab cannot leave a cursor behind. Content lives in the shared document, where
 * it must survive exactly that. Same room, same provider, opposite durability.
 *
 * Positions travel in world coordinates. Screen coordinates would put a peer's cursor
 * in the wrong place the moment two people were at different pan or zoom — and would
 * look correct until someone scrolled.
 *
 * Returns refs rather than state: cursors move constantly, and re-rendering React on
 * every remote pointer move is exactly what the canvas avoids elsewhere.
 */
export function useBoardSync(
  /**
   * Null disconnects the hook entirely — used by the read-only share view, which has
   * no token to fetch, nothing to publish, and no business appearing as a peer in the
   * room. Returning the same inert refs means BoardCanvas needs no branch of its own.
   */
  boardId: string | null,
  redrawRef: RefObject<() => void>,
  objectsRef: RefObject<BoardObject[]>,
  initialObjects: BoardObject[],
) {
  const cursorsRef = useRef<RemoteCursor[]>([])
  const publishRef = useRef<(x: number, y: number) => void>(() => {})
  /** Mark an object id as locally changed. Absent from the array means "erased". */
  const touchRef = useRef<(id: string) => void>(() => {})
  /** Publish the whole board. For undo/redo, which can change anything at once. */
  const resyncRef = useRef<() => void>(() => {})
  /**
   * Ids the local user is mid-gesture on, which remote updates must not overwrite.
   * The canvas adds on gesture start and removes on release.
   */
  const holdRef = useRef<Set<string>>(new Set())
  /** True once the initial document state has arrived and been applied. */
  const readyRef = useRef(false)
  /** DIAGNOSTIC: see SyncStats. Remove with the badge once the two-tab bug is closed. */
  const statsRef = useRef<SyncStats>({
    status: "connecting",
    docUpdates: 0,
    remote: 0,
    own: 0,
    applied: 0,
    lastRemoteAt: 0,
    mapSize: 0,
    objects: 0,
  })

  // The seed is only read on first connect. Holding it in a ref keeps it out of the
  // effect's dependencies, so a new array identity from the server component on
  // re-render cannot tear down a live socket.
  const seedRef = useRef(initialObjects)

  useEffect(() => {
    // Before anything else, so the whole connect path is unreachable for a viewer and
    // the refs stay the no-ops they were initialised with.
    if (!boardId) return
    // Captured as a const: TypeScript discards the narrowing above inside the nested
    // closures below, because a parameter is a mutable binding.
    const room: string = boardId
    let provider: WebsocketProvider | null = null
    let doc: Y.Doc | null = null
    let refresh: ReturnType<typeof setInterval> | null = null
    let saveTimer: ReturnType<typeof setTimeout> | null = null
    let frame = 0
    const dirty = new Set<string>()
    // StrictMode mounts, unmounts and remounts; without this the first run's async
    // connect would finish after its own cleanup and leak a second provider.
    let cancelled = false
    // Captured now rather than read in cleanup: the array identity never changes, and
    // reading a ref during teardown is the pattern the lint rule exists to catch.
    const live = objectsRef.current

    const fetchToken = async () => {
      const res = await fetch(`/api/realtime/token?boardId=${encodeURIComponent(room)}`)
      if (!res.ok) throw new Error(`token request failed: ${res.status}`)
      return res.json() as Promise<{
        token: string
        userId: string
        name: string
        expiresAt: number
      }>
    }

    async function connect() {
      let auth
      try {
        auth = await fetchToken()
      } catch (err) {
        console.error("Realtime unavailable:", err)
        return
      }
      if (cancelled) return

      doc = new Y.Doc()
      provider = new WebsocketProvider(WS_URL, room, doc, {
        params: { token: auth.token },
      })
      // `ymap` for the Yjs-specific surface (observe, transact origins); `map` is the
      // same object seen through the structural interface src/lib/sync.ts is written
      // against, which is what lets that module be tested with a plain Map.
      const ymap = doc.getMap<BoardObject>("objects")
      const map = ymap as unknown as ObjectMap
      provider.on("status", (e: { status: string }) => {
        statsRef.current.status = e.status
        trace("status:", e.status)
      })

      const { awareness } = provider
      awareness.setLocalStateField("user", {
        name: auth.name,
        color: colorFor(auth.userId),
      })

      publishRef.current = (x, y) => awareness.setLocalStateField("cursor", { x, y })

      awareness.on("change", () => {
        const next: RemoteCursor[] = []
        awareness.getStates().forEach((state, clientId) => {
          if (clientId === awareness.clientID) return // our own cursor is the real one
          const user = state.user
          const cursor = state.cursor
          if (user && cursor) {
            next.push({ name: user.name, color: user.color, x: cursor.x, y: cursor.y })
          }
        })
        cursorsRef.current = next
        redrawRef.current()
      })

      // ---- content ----

      /**
       * Writes the board out to Postgres after it goes quiet.
       *
       * Debounced rather than per-change: a single pen stroke touches its object on
       * every frame, and a board is worth saving as a state, not as a keystroke log.
       *
       * ponytail: every client in the room saves, and each writes the same converged
       * document, so the redundancy is wasted work rather than a conflict. Elect one
       * writer (or move the save into the realtime server) if the write volume ever
       * matters.
       */
      const scheduleSave = () => {
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          saveTimer = null
          // The local array, NOT readAll(map) — the same source the unmount flush below
          // already uses. The map only holds what this client has published or received,
          // so a session that never synced (realtime server down, socket refused) holds
          // an EMPTY map over a full board, and saving that wiped the board's contents
          // in Postgres. The array is hydrated from the database at mount, so it is the
          // honest state of what is on screen whether or not the socket ever opened.
          const objects = objectsRef.current.map((o) => structuredClone(o))
          fetch(`/api/board/${encodeURIComponent(room)}/objects`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ objects }),
            keepalive: true, // so a save in flight survives the tab closing
          }).catch((err) => console.error("Board save failed:", err))
        }, SAVE_DEBOUNCE_MS)
      }

      // Coalesced to one publish per frame. A drag touches the same id on every
      // pointermove, and there is no point serialising it more often than it is drawn.
      const flush = () => {
        frame = 0
        if (!dirty.size || !doc) return
        const ids = [...dirty]
        dirty.clear()
        doc.transact(() => publish(map, objectsRef.current, ids), LOCAL)
        trace("published", ids.length, "id(s); map now holds", [...map.keys()].length)
        scheduleSave()
      }

      touchRef.current = (id) => {
        dirty.add(id)
        // Cancel-and-re-request, never `if (!frame)`. The latching form has already cost
        // BoardCanvas twice (see requestDraw): when a scheduled frame never RUNS — a
        // backgrounded tab, an occluded window — `frame` stays non-zero forever and every
        // later touch is a silent no-op, so edits stop being published AND stop being
        // saved with nothing on screen to say so. Coalescing is unaffected.
        if (frame) cancelAnimationFrame(frame)
        frame = requestAnimationFrame(flush)
      }

      resyncRef.current = () => {
        dirty.clear() // publishAll supersedes anything queued
        doc!.transact(() => publishAll(map, objectsRef.current), LOCAL)
        scheduleSave()
      }

      // Fires for EVERY update applied to the document, whichever type it touched.
      // This is the discriminator the previous two attempts were missing: if this logs
      // and the observer below does not, bytes arrived but did not land in the
      // "objects" map; if neither logs, nothing reached this tab at all.
      doc.on("update", (update: Uint8Array, origin: unknown) => {
        statsRef.current.docUpdates++
        trace("doc update:", update.byteLength, "bytes, origin:", originName(origin))
      })

      trace("observer registered on ymap; redraw wired:", redrawRef.current.name || "anon")

      ymap.observe((_event, transaction) => {
        // Our own writes are already in the array; re-reconciling them would compare
        // the whole board against itself on every frame of a drag.
        if (transaction.origin === LOCAL) {
          statsRef.current.own++
          trace("observe: own write, skipped")
          return
        }
        // Counted BEFORE applyRemote, so a firing is recorded even if reconciling
        // throws — "observer fired but nothing applied" is a different bug from
        // "observer never fired", and the badge has to be able to tell them apart.
        statsRef.current.remote++
        statsRef.current.lastRemoteAt = performance.now()
        const held = [...holdRef.current]
        const changed = applyRemote(map, objectsRef.current, (id) => holdRef.current.has(id))
        if (changed) statsRef.current.applied++
        statsRef.current.mapSize = [...map.keys()].length
        statsRef.current.objects = objectsRef.current.length
        trace("observe: REMOTE origin:", originName(transaction.origin), "->",
              changed ? "CHANGED" : "no change",
              "| objects:", objectsRef.current.length,
              "| map:", [...map.keys()].length,
              held.length ? `| held: ${held.join(",")}` : "")
        if (changed) redrawRef.current()
      })

      provider.on("sync", (isSynced: boolean) => {
        if (!isSynced || readyRef.current || cancelled) return
        readyRef.current = true
        trace("synced; map holds", [...map.keys()].length, "object(s)")
        // Only the first client into a room seeds it from the database. A later joiner
        // already has the live document, and writing its own copy over the top would
        // resurrect whatever everyone else just erased.
        const didSeed = doc!.transact(() => seed(map, seedRef.current), LOCAL)
        applyRemote(map, objectsRef.current, (id) => holdRef.current.has(id))
        redrawRef.current()
        if (didSeed) scheduleSave()
      })

      if (process.env.NODE_ENV !== "production") {
        /**
         * Dev-only console handle. `__tf.map()` in a tab answers the question the
         * two-tab test cannot: whether a peer's stroke reached THIS tab's document.
         * If it is in the map but not on screen the bug is render-side; if it is
         * absent the bug is upstream of this tab entirely.
         */
        ;(window as unknown as Record<string, unknown>).__tf = {
          map: () => ymap.toJSON(),
          keys: () => [...map.keys()],
          objects: () => objectsRef.current.length,
          // The ARRAY, not its length — the map only shows what has been published, so
          // this is the only way to see an object between its creation and its flush.
          array: () => objectsRef.current.map((o) => structuredClone(o)),
          held: () => [...holdRef.current],
          wsconnected: () => provider?.wsconnected,
          bcconnected: () => provider?.bcconnected,
          synced: () => provider?.synced,
          clientID: doc?.clientID,
          redraw: () => redrawRef.current(),
        }
      }

      // The provider re-reads params on every reconnect, so refreshing this field is
      // enough to keep a long-open board from reconnecting with an expired token.
      const lead = Math.max(30_000, (auth.expiresAt - Date.now()) / 2)
      refresh = setInterval(async () => {
        try {
          const next = await fetchToken()
          if (provider) provider.params.token = next.token
        } catch (err) {
          console.error("Realtime token refresh failed:", err)
        }
      }, lead)
    }

    connect()

    return () => {
      cancelled = true
      if (refresh) clearInterval(refresh)
      if (frame) cancelAnimationFrame(frame)
      // Flush a pending save rather than dropping it: the debounce window is exactly
      // where a close would otherwise lose the last edits.
      if (saveTimer) {
        clearTimeout(saveTimer)
        const objects = live.map((o) => structuredClone(o))
        void fetch(`/api/board/${encodeURIComponent(room)}/objects`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ objects }),
          keepalive: true,
        }).catch(() => {})
      }
      provider?.destroy() // closes the socket and clears our awareness state for peers
      doc?.destroy()
      publishRef.current = () => {}
      touchRef.current = () => {}
      resyncRef.current = () => {}
      cursorsRef.current = []
      readyRef.current = false
    }
  }, [boardId, redrawRef, objectsRef])

  return { cursorsRef, publishRef, touchRef, resyncRef, holdRef, statsRef }
}
