// node --test realtime/live.test.js
//
// The seam nothing else covers.
//
// rooms.test.js proves the relay forwards generic Yjs updates between two sockets.
// sync.test.ts proves publish/applyRemote reconcile correctly against a plain Map.
// Neither runs the app's OWN write path — publish() into a real Y.Map, over a real
// WebsocketProvider, through the real relay, into a second client's ymap.observe.
//
// That gap is exactly where a two-tab bug can live while every existing test is green,
// so this walks the whole chain with a real Stroke and asserts the observer FIRES.
import { test } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import { WebSocketServer } from "ws"
import * as Y from "yjs"
import { WebsocketProvider } from "y-websocket"
import { setupWSConnection } from "./rooms.js"
import { publish, applyRemote } from "../src/lib/sync.ts"

/** Mirrors useBoardSync's origin marker, so the observer can skip its own echo. */
const LOCAL = Symbol("local")

const stroke = (id) => ({
  id,
  type: "stroke",
  points: [0, 0, 10, 10, 20, 5],
  pressures: [0.5, 0.9, 0.3],
  color: "#fff",
  width: 2,
  createdAt: Date.now(),
})

/** Starts the real relay on an ephemeral port. */
async function relay() {
  const server = http.createServer()
  const wss = new WebSocketServer({ noServer: true })
  // Auth is server.js's job and is covered by token.test.js; this exercises the room.
  server.on("upgrade", (req, socket, head) => {
    const room = decodeURIComponent(new URL(req.url, "http://x").pathname.slice(1))
    wss.handleUpgrade(req, socket, head, (conn) => setupWSConnection(conn, room))
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  return { url: `ws://127.0.0.1:${server.address().port}`, server, wss }
}

/** One client, wired the way useBoardSync wires a tab. */
function tab(url, room) {
  const doc = new Y.Doc()
  // disableBc: the socket is what is under test. In a browser BroadcastChannel would
  // mask a broken socket path entirely — which is why two same-profile tabs are a
  // useless manual test and this one is not.
  const provider = new WebsocketProvider(url, room, doc, { disableBc: true })
  const ymap = doc.getMap("objects")
  const objects = []
  const events = []

  ymap.observe((_e, tr) => {
    if (tr.origin === LOCAL) return
    events.push(applyRemote(ymap, objects, () => false))
  })

  const synced = new Promise((r) => (provider.synced ? r() : provider.on("sync", (s) => s && r())))
  return { doc, provider, ymap, objects, events, synced }
}

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms))

test("a stroke published by one tab reaches an ALREADY-CONNECTED tab", async () => {
  const { url, server, wss } = await relay()
  const room = "board-live"
  const a = tab(url, room)
  const b = tab(url, room)
  await Promise.all([a.synced, b.synced])

  // B is connected and idle BEFORE A writes — the reported scenario exactly.
  const s = stroke("s1")
  a.objects.push(s)
  a.doc.transact(() => publish(a.ymap, a.objects, ["s1"]), LOCAL)

  await settle()

  assert.equal(a.events.length, 0, "A must not observe its own LOCAL write")
  assert.ok(b.events.length > 0, "B's ymap.observe never fired for a remote stroke")
  assert.equal(b.events.at(-1), true, "B observed the update but applyRemote saw no change")
  assert.equal(b.objects.length, 1, "the stroke did not land in B's objects array")
  assert.deepEqual(b.objects[0].points, s.points, "points did not survive the round trip")
  assert.deepEqual(b.objects[0].pressures, s.pressures, "pressures did not survive")

  a.provider.destroy(); a.doc.destroy()
  b.provider.destroy(); b.doc.destroy()
  wss.close(); server.close()
})

test("a later edit to the same stroke also reaches the idle tab", async () => {
  const { url, server, wss } = await relay()
  const room = "board-live-2"
  const a = tab(url, room)
  const b = tab(url, room)
  await Promise.all([a.synced, b.synced])

  const s = stroke("s1")
  a.objects.push(s)
  a.doc.transact(() => publish(a.ymap, a.objects, ["s1"]), LOCAL)
  await settle()

  // A drag republishes the same id — the path that must not be swallowed as "no change".
  s.color = "#f00"
  a.doc.transact(() => publish(a.ymap, a.objects, ["s1"]), LOCAL)
  await settle()

  assert.equal(b.objects.length, 1, "the edit duplicated the object instead of updating it")
  assert.equal(b.objects[0].color, "#f00", "B never saw the restyle")

  a.provider.destroy(); a.doc.destroy()
  b.provider.destroy(); b.doc.destroy()
  wss.close(); server.close()
})
