// node --test realtime/rooms.test.js
import { test } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import { WebSocketServer, WebSocket } from "ws"
import * as Y from "yjs"
import * as syncProtocol from "y-protocols/sync"
import * as awarenessProtocol from "y-protocols/awareness"
import * as encoding from "lib0/encoding"
import * as decoding from "lib0/decoding"
import { setupWSConnection, hasRoom } from "./rooms.js"

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1

/**
 * A real client over a real socket.
 *
 * The bug this file exists for could not be caught any other way: the previous server
 * package imported cleanly, started cleanly, and only threw once a client sent its
 * first sync frame — which nothing but an actual connection produces.
 */
function client(url, room) {
  const doc = new Y.Doc()
  const awareness = new awarenessProtocol.Awareness(doc)
  const ws = new WebSocket(`${url}/${room}`)
  ws.binaryType = "arraybuffer"

  const send = (bytes) => ws.readyState === 1 && ws.send(bytes)

  doc.on("update", (update, origin) => {
    if (origin === "remote") return
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, MESSAGE_SYNC)
    syncProtocol.writeUpdate(enc, update)
    send(encoding.toUint8Array(enc))
  })

  awareness.on("update", ({ added, updated, removed }, origin) => {
    if (origin === "remote") return
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(
      enc,
      awarenessProtocol.encodeAwarenessUpdate(awareness, added.concat(updated, removed)),
    )
    send(encoding.toUint8Array(enc))
  })

  ws.on("message", (data) => {
    const dec = decoding.createDecoder(new Uint8Array(data))
    const enc = encoding.createEncoder()
    switch (decoding.readVarUint(dec)) {
      case MESSAGE_SYNC:
        encoding.writeVarUint(enc, MESSAGE_SYNC)
        syncProtocol.readSyncMessage(dec, enc, doc, "remote")
        if (encoding.length(enc) > 1) send(encoding.toUint8Array(enc))
        break
      case MESSAGE_AWARENESS:
        awarenessProtocol.applyAwarenessUpdate(
          awareness,
          decoding.readVarUint8Array(dec),
          "remote",
        )
        break
    }
  })

  const opened = new Promise((resolve) => ws.on("open", resolve)).then(() => {
    // Sync step 1, exactly as the browser client opens.
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, MESSAGE_SYNC)
    syncProtocol.writeSyncStep1(enc, doc)
    send(encoding.toUint8Array(enc))
  })

  // Awareness runs a setInterval to expire stale peers, so leaving one alive keeps
  // node --test's event loop open and the run never exits.
  return {
    doc,
    awareness,
    ws,
    opened,
    close: () => {
      ws.close()
      awareness.destroy()
      doc.destroy()
    },
  }
}

async function startServer() {
  const http_ = http.createServer()
  const wss = new WebSocketServer({ noServer: true })
  http_.on("upgrade", (req, socket, head) => {
    const room = decodeURIComponent(new URL(req.url, "http://x").pathname.slice(1))
    wss.handleUpgrade(req, socket, head, (conn) => setupWSConnection(conn, room))
  })
  await new Promise((resolve) => http_.listen(0, "127.0.0.1", resolve))
  const { port } = http_.address()
  // Both, and the sockets with them: an open listener keeps node --test's event loop
  // alive and the run never exits.
  return {
    url: `ws://127.0.0.1:${port}`,
    close: () => {
      wss.clients.forEach((c) => c.terminate())
      wss.close()
      http_.close()
    },
  }
}

/** Polls until `fn` is true, so tests never race a fixed sleep. */
async function until(fn, ms = 3000) {
  const started = Date.now()
  while (Date.now() - started < ms) {
    if (fn()) return true
    await new Promise((r) => setTimeout(r, 15))
  }
  return false
}

test("a document edit reaches the other peer", async () => {
  const server = await startServer()
  const a = client(server.url, "board-1")
  const b = client(server.url, "board-1")
  await Promise.all([a.opened, b.opened])

  a.doc.getMap("objects").set("s1", { id: "s1", type: "stroke" })

  assert.ok(
    await until(() => b.doc.getMap("objects").get("s1")?.id === "s1"),
    "peer B never received the stroke — this is the store.getClock failure",
  )

  // And the other direction, on the same sockets.
  b.doc.getMap("objects").set("s2", { id: "s2", type: "note" })
  assert.ok(await until(() => a.doc.getMap("objects").has("s2")), "B -> A failed")

  a.close()
  b.close()
  server.close()
})

test("a late joiner receives the document that already exists", async () => {
  const server = await startServer()
  const a = client(server.url, "board-2")
  await a.opened
  a.doc.getMap("objects").set("early", { id: "early" })
  // Let the server take it in before anyone else arrives.
  await until(() => hasRoom("board-2"))

  const b = client(server.url, "board-2")
  await b.opened
  assert.ok(
    await until(() => b.doc.getMap("objects").has("early")),
    "a joiner must be handed the existing board, not an empty one",
  )

  a.close()
  b.close()
  server.close()
})

test("rooms are isolated by board id", async () => {
  const server = await startServer()
  const a = client(server.url, "board-a")
  const b = client(server.url, "board-b")
  await Promise.all([a.opened, b.opened])

  a.doc.getMap("objects").set("secret", { id: "secret" })
  await until(() => false, 150) // give it every chance to leak

  assert.equal(b.doc.getMap("objects").has("secret"), false, "boards must not bleed")

  a.close()
  b.close()
  server.close()
})

test("awareness reaches peers and is cleared when a peer disconnects", async () => {
  const server = await startServer()
  const a = client(server.url, "board-3")
  const b = client(server.url, "board-3")
  await Promise.all([a.opened, b.opened])

  a.awareness.setLocalStateField("cursor", { x: 10, y: 20 })
  assert.ok(
    await until(() => {
      for (const [id, s] of b.awareness.getStates()) {
        if (id !== b.doc.clientID && s.cursor?.x === 10) return true
      }
      return false
    }),
    "B never saw A's cursor",
  )

  // The whole reason cursors live in awareness rather than the document.
  a.close()
  assert.ok(
    await until(() => {
      for (const [id, s] of b.awareness.getStates()) {
        if (id !== b.doc.clientID && s.cursor) return false
      }
      return true
    }),
    "a closed tab left its cursor parked on the board",
  )

  b.close()
  server.close()
})

test("the room is dropped once the last peer leaves", async () => {
  // Asserted on this board specifically, not on a global count: other tests' rooms are
  // still draining while this one runs, so a total would race them.
  const server = await startServer()
  const a = client(server.url, "board-4")
  await a.opened
  assert.ok(await until(() => hasRoom("board-4")), "the room was never created")

  a.close()
  assert.ok(await until(() => !hasRoom("board-4")), "the room leaked after everyone left")
  server.close()
})
