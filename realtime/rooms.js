import * as Y from "yjs"
import * as syncProtocol from "y-protocols/sync"
import * as awarenessProtocol from "y-protocols/awareness"
import * as encoding from "lib0/encoding"
import * as decoding from "lib0/decoding"

/**
 * A minimal Yjs websocket relay.
 *
 * Written out rather than pulled in: `y-websocket` v3 ships only the client half, and
 * the server package that replaced it (`@y/websocket-server`) is a v14 prerelease whose
 * own dependencies disagree — it mixes `@y/y@14.0.0-rc.7` with a nested `yjs@14.0.0-16`
 * and throws `store.getClock is not a function` on the first sync message, while this
 * app is on the stable `yjs@13`. Awareness rides a different message type, so cursors
 * appeared to work while every document update was being dropped.
 *
 * The protocol is small enough that owning it is less code than reconciling those
 * versions: two message types, and a broadcast on each.
 *
 * ponytail: memory only, and rooms are dropped when the last peer leaves. Durability
 * lives in Postgres — clients save the converged document — so the relay never needs to
 * be the thing that remembers. Give it its own persistence only if boards ever have to
 * survive with nobody connected AND no client having saved.
 */

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1

/** One shared document per board id, alive while at least one peer is connected. */
const rooms = new Map()

function getRoom(name) {
  let room = rooms.get(name)
  if (room) return room

  const doc = new Y.Doc()
  const awareness = new awarenessProtocol.Awareness(doc)
  // The server is a relay, not a peer: it holds no cursor of its own, and a local
  // awareness state here would show up as a phantom user in every client's list.
  awareness.setLocalState(null)
  // Which awareness client ids each connection speaks for. A peer can only be cleaned
  // up on disconnect if we know which states were its own — the socket carries no
  // client id of its own, so it has to be learned from the updates it sends.
  room = { doc, awareness, conns: new Set(), controlled: new Map() }

  doc.on("update", (update, origin) => {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    const message = encoding.toUint8Array(encoder)
    // Skipping the origin connection is not just an optimisation: echoing an update
    // back to its author is a wasted round trip on every stroke of every drag.
    for (const conn of room.conns) {
      if (conn !== origin) send(conn, message)
    }
  })

  awareness.on("update", ({ added, updated, removed }, origin) => {
    const owned = room.controlled.get(origin)
    if (owned) {
      for (const id of added) owned.add(id)
      for (const id of updated) owned.add(id)
      for (const id of removed) owned.delete(id)
    }
    const changed = added.concat(updated, removed)
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changed),
    )
    const message = encoding.toUint8Array(encoder)
    for (const conn of room.conns) {
      if (conn !== origin) send(conn, message)
    }
  })

  rooms.set(name, room)
  return room
}

function send(conn, message) {
  // 1 === WebSocket.OPEN. A socket that has started closing throws on send, and a
  // broadcast must not be abandoned partway because one peer left mid-loop.
  if (conn.readyState !== 1) return
  try {
    conn.send(message)
  } catch {
    conn.close()
  }
}

/**
 * Joins `conn` to `docName`'s room and drives the protocol for its lifetime.
 *
 * `docName` comes from the caller's verified claim, never from the request URL — see
 * the note at the upgrade handler in server.js.
 */
export function setupWSConnection(conn, docName) {
  conn.binaryType = "arraybuffer"
  const room = getRoom(docName)
  room.conns.add(conn)
  room.controlled.set(conn, new Set())

  conn.on("message", (data) => {
    try {
      const message = new Uint8Array(data)
      const decoder = decoding.createDecoder(message)
      const encoder = encoding.createEncoder()
      switch (decoding.readVarUint(decoder)) {
        case MESSAGE_SYNC: {
          encoding.writeVarUint(encoder, MESSAGE_SYNC)
          // `conn` is passed as the transaction origin, which is what lets the doc's
          // update handler above skip echoing to the sender.
          syncProtocol.readSyncMessage(decoder, encoder, room.doc, conn)
          // Length 1 means the reply carries only the message type and nothing to say.
          if (encoding.length(encoder) > 1) send(conn, encoding.toUint8Array(encoder))
          break
        }
        case MESSAGE_AWARENESS: {
          awarenessProtocol.applyAwarenessUpdate(
            room.awareness,
            decoding.readVarUint8Array(decoder),
            conn,
          )
          break
        }
      }
    } catch (err) {
      // One malformed frame must not take the room down with it.
      console.error("realtime: bad message", err)
    }
  })

  const close = () => {
    if (!room.conns.delete(conn)) return // close and error can both fire
    // Drop this peer's cursor for everyone else. Without it a closed tab leaves a
    // cursor parked on the board forever — the reason cursors live in awareness.
    const owned = room.controlled.get(conn)
    room.controlled.delete(conn)
    if (owned?.size) {
      awarenessProtocol.removeAwarenessStates(room.awareness, [...owned], null)
    }
    if (room.conns.size === 0) {
      room.awareness.destroy()
      room.doc.destroy()
      rooms.delete(docName)
    }
  }
  conn.on("close", close)
  conn.on("error", close)

  // Sync step 1: tell the client what we have, so it can send back what we are missing.
  {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeSyncStep1(encoder, room.doc)
    send(conn, encoding.toUint8Array(encoder))
  }
  // And hand over everyone's current cursor, so a joiner sees peers before they move.
  const states = room.awareness.getStates()
  if (states.size > 0) {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...states.keys()]),
    )
    send(conn, encoding.toUint8Array(encoder))
  }
}

/** Rooms currently held in memory. Exported for the health check and for tests. */
export const roomCount = () => rooms.size

/** Whether a specific board is still held. Order-independent, unlike roomCount. */
export const hasRoom = (name) => rooms.has(name)
