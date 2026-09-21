/**
 * Starts the Next dev server AND the realtime relay together.
 *
 * They are two processes by design — the relay is standalone and must not import from
 * the Next source tree — but nothing collaborative works without both, and the relay
 * being silently absent is not obvious from the app: boards load and edit normally
 * (their content comes from Postgres), while cursors, presence and live updates just
 * never appear. That has already cost one "collaboration is broken" investigation.
 *
 * ponytail: a small spawner rather than `concurrently`. `a & b` in an npm script is not
 * portable to Windows' cmd.exe, which is the only reason this is a file and not a
 * one-liner — and it is not worth a dependency.
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { connect } from "node:net"

const RELAY_PORT = Number(process.env.REALTIME_PORT ?? 1234)

/**
 * Is something already serving the relay port?
 *
 * Without this check, a relay left running from an earlier session makes the whole dev
 * stack fail on EADDRINUSE — and since a dying child takes the other one down, that kills
 * Next too. Reusing what is already there is what a person would do by hand.
 */
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" })
    const done = (answer) => {
      socket.destroy()
      resolve(answer)
    }
    socket.setTimeout(500)
    socket.on("connect", () => done(true))
    socket.on("timeout", () => done(false))
    socket.on("error", () => done(false))
  })
}

const NEXT_BIN = "node_modules/next/dist/bin/next"
if (!existsSync(NEXT_BIN)) {
  console.error(`Cannot find ${NEXT_BIN} — run npm install first.`)
  process.exit(1)
}

// Both run through THIS node, so there is no npm/npx shell layer to quote around.
// --env-file is what hands the relay AUTH_SECRET, which it refuses to start without.
const relayUp = await portInUse(RELAY_PORT)
if (relayUp) {
  console.log(`[relay] already listening on ${RELAY_PORT} — reusing it, not starting a second`)
}

const procs = [
  ["next", [NEXT_BIN, "dev"]],
  ...(relayUp ? [] : [["relay", ["--env-file=.env", "realtime/server.js"]]]),
].map(([name, args]) => {
  const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] })
  const tag = (line) => `[${name}] ${line}`
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8")
    let rest = ""
    stream.on("data", (chunk) => {
      const lines = (rest + chunk).split("\n")
      rest = lines.pop() ?? ""
      for (const l of lines) console.log(tag(l))
    })
  }
  child.on("exit", (code) => {
    console.log(tag(`exited with code ${code}`))
    // One half dead is a broken dev environment that LOOKS fine, so take both down
    // rather than leave a half-running stack behind.
    stopAll()
    process.exitCode = code ?? 1
  })
  return child
})

let stopping = false
function stopAll() {
  if (stopping) return
  stopping = true
  for (const p of procs) if (p.exitCode === null) p.kill()
}

process.on("SIGINT", stopAll)
process.on("SIGTERM", stopAll)
