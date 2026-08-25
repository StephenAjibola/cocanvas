"use client"

import { useEffect, useState } from "react"
import type { BoardObject } from "@/lib/objects"
import { contentSignature, renderThumbnail } from "@/lib/thumbnail"

/**
 * Rendered previews, cached for the life of the tab.
 *
 * Module-level rather than component state, so navigating away from the dashboard and
 * back does not re-fetch and re-draw every card. Keyed by board id; the stored signature
 * is what decides whether a re-render is actually needed when the objects come back
 * changed — see contentSignature.
 *
 * Deliberately NOT localStorage: a data URL per board is tens of kilobytes, the quota is
 * a few megabytes, and a stale preview surviving a reload is worse than redrawing one.
 */
const cache = new Map<string, { signature: string; dataUrl: string }>()

/** In-flight fetches, so a re-render mid-request does not start a second one. */
const inflight = new Map<string, Promise<void>>()

export const THUMB_W = 320
export const THUMB_H = 176

export function BoardThumbnail({
  boardId,
  background,
  fallback,
}: {
  boardId: string
  /** The board's own canvas colour, so the preview matches what you'd open. */
  background: string
  /** Shown for an empty board, a failed fetch, or before the first paint. */
  fallback: React.ReactNode
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(
    () => cache.get(boardId)?.dataUrl ?? null,
  )

  useEffect(() => {
    let live = true

    // No synchronous setState here on purpose. The lazy useState initializer already
    // seeds from the cache on mount, so painting a cached preview immediately needs no
    // effect at all — and setting state in an effect body just to repeat what the
    // initializer did is a cascading render for nothing. The revalidation below is the
    // only thing this effect owes: it is what notices somebody else edited the board.
    const run =
      inflight.get(boardId) ??
      (async () => {
        try {
          const res = await fetch(`/api/board/${encodeURIComponent(boardId)}/objects`)
          if (!res.ok) throw new Error(String(res.status))
          const { objects } = (await res.json()) as { objects: BoardObject[] }

          const signature = contentSignature(objects)
          // The whole point of the signature: an unchanged board costs a fetch, not a
          // re-render of every card on the page.
          if (cache.get(boardId)?.signature === signature) return

          const url = renderThumbnail(objects, THUMB_W, THUMB_H, background)
          if (url) cache.set(boardId, { signature, dataUrl: url })
          else cache.delete(boardId) // board went empty — fall back rather than keep a ghost
        } catch (err) {
          console.error(`Thumbnail for board ${boardId} failed:`, err)
        } finally {
          inflight.delete(boardId)
        }
      })()

    inflight.set(boardId, run)
    void run.then(() => {
      if (live) setDataUrl(cache.get(boardId)?.dataUrl ?? null)
    })

    return () => {
      live = false
    }
  }, [boardId, background])

  if (!dataUrl) return <>{fallback}</>

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a canvas data URL, not a file
    <img
      src={dataUrl}
      alt=""
      aria-hidden="true"
      className="h-full w-full object-cover"
      draggable={false}
    />
  )
}
