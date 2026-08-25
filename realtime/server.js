import http from "node:http"
import { WebSocketServer } from "ws"
import { setupWSConnection } from "./rooms.js"
import { verifyToken } from "./token.js"

const PORT = Number(process.env.REALTIME_PORT ?? 1234)
// Loopback by default. This service has no transport security of its own, so it
// should not be reachable from the LAN without a deliberate REALTIME_HOST override.
const HOST = process.env.REALTIME_HOST ?? "127.0.0.1"
const SECRET = process.env.AUTH_SECRET

if (!SECRET) {
  console.error("AUTH_SECRET is not set — refusing to start without a signing secret.")
  console.error("Run via `npm start` in realtime/, which loads ../.env.")
  process.exit(1)
}

const server = http.createServer((req, res) => {
  // Plain HTTP hits are health checks; the real traffic is the upgrade path below.
  res.writeHead(200, { "content-type": "text/plain" })
  res.end("cocanvas realtime: ok\n")
})

const wss = new WebSocketServer({ noServer: true })

server.on("upgrade", (req, socket, head) => {
  let room
  let claims
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    room = decodeURIComponent(url.pathname.slice(1))
    claims = verifyToken(url.searchParams.get("token"), SECRET)
  } catch {
    claims = null
  }

  // Rejected before the handshake completes, so an unauthorised client never reaches
  // setupWSConnection and never joins a document.
  if (!claims || claims.boardId !== room) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n")
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (conn) => {
    // docName comes from the signed claim, never the raw URL path — otherwise a valid
    // token for one board could be replayed against another board's room.
    setupWSConnection(conn, claims.boardId)
  })
})

server.listen(PORT, HOST, () => {
  console.log(`cocanvas realtime listening on ws://${HOST}:${PORT}`)
})
