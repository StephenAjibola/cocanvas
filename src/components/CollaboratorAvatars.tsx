"use client"

import { type RefObject, useEffect, useRef, useState } from "react"
import type { RemoteCursor } from "@/lib/useBoardSync"

/**
 * The header's "who's here" row: one avatar per distinct peer, no coordinates.
 *
 * `cursorsRef` updates at pointer rate — every remote pointermove touches it, the
 * same firehose the canvas reads for the on-canvas cursor labels. A header re-render
 * on every one of those would cost far more than the canvas repaint it's next to, so
 * this polls instead (same pattern as SyncBadge and ZoomControl) and only calls
 * setState when the distinct name+color SET actually changes, not on every tick.
 */
export function CollaboratorAvatars({ cursorsRef }: { cursorsRef: RefObject<RemoteCursor[]> }) {
  const [peers, setPeers] = useState<{ name: string; color: string }[]>([])
  const keyRef = useRef("")

  useEffect(() => {
    const id = setInterval(() => {
      const seen = new Map<string, string>()
      for (const c of cursorsRef.current) seen.set(c.name, c.color)
      const entries = [...seen].sort(([a], [b]) => a.localeCompare(b))
      const key = entries.map(([name]) => name).join("|")
      if (key === keyRef.current) return
      keyRef.current = key
      setPeers(entries.map(([name, color]) => ({ name, color })))
    }, 1000)
    return () => clearInterval(id)
  }, [cursorsRef])

  if (!peers.length) return null

  return (
    <div className="flex items-center -space-x-2" aria-label="Currently viewing">
      {peers.map((p) => (
        <div
          key={p.name}
          title={p.name}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface-container-lowest text-[11px] font-medium text-on-surface"
          style={{ backgroundColor: p.color }}
        >
          {p.name.slice(0, 1).toUpperCase()}
        </div>
      ))}
    </div>
  )
}
