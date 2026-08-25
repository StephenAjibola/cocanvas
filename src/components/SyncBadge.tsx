"use client"

import { type RefObject, useEffect, useState } from "react"
import type { SyncStats } from "@/lib/useBoardSync"

/**
 * DIAGNOSTIC, dev-only. Delete with the counters in useBoardSync once content sync is
 * confirmed working in two real tabs.
 *
 * Exists because the tab that has to be observed is the one nobody is looking at. A
 * console.log inside ymap.observe is the right instrument and it was already there —
 * but reading it means opening devtools on the IDLE tab, mid-test, and that step is
 * what kept not happening. This puts the same numbers on the canvas.
 *
 * Polled rather than pushed: these counters tick at pointer rates during a peer's
 * drag, and re-rendering React on each one would be a worse bug than the one being
 * chased. 4Hz is plenty to read.
 */
export function SyncBadge({ statsRef }: { statsRef: RefObject<SyncStats> }) {
  const [s, setS] = useState<SyncStats | null>(null)
  const [now, setNow] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setS({ ...statsRef.current })
      setNow(performance.now())
    }, 250)
    return () => clearInterval(id)
  }, [statsRef])

  if (!s) return null

  const age = s.lastRemoteAt ? `${((now - s.lastRemoteAt) / 1000).toFixed(1)}s ago` : "never"
  // The single most important line: zero remote firings means nothing arrived at all.
  const verdict =
    s.remote === 0
      ? "NO REMOTE UPDATES SEEN"
      : s.applied === 0
        ? "arriving, but applyRemote saw no change"
        : "arriving and applied"

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 9999,
        padding: "8px 10px",
        borderRadius: 8,
        font: "11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
        background: "rgba(0,0,0,.82)",
        color: "#e5e7eb",
        border: "1px solid rgba(255,255,255,.15)",
        pointerEvents: "none",
        whiteSpace: "pre",
      }}
    >
      {`socket   ${s.status}
doc upd  ${s.docUpdates}
observe  remote ${s.remote}  own ${s.own}
applied  ${s.applied}   last ${age}
map ${s.mapSize}  objects ${s.objects}
${verdict}`}
    </div>
  )
}
