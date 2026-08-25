"use client"

import { useState } from "react"

/**
 * Downloads the board as a raster file.
 *
 * Takes a renderer rather than the objects: the only thing that can paint this board is
 * the canvas effect's own draw path, so the export is produced there (see
 * renderToCanvas) and this component only decides the file format and the filename.
 *
 * SVG is deliberately absent. Every renderer here is canvas-imperative — quadratic
 * segments, per-sample pressure widths, offset texture passes, globalAlpha settling —
 * so emitting SVG means a SECOND renderer that has to agree with the first forever.
 * That is its own task, not a format flag on this one.
 */
export function ExportButton({
  render,
  name,
}: {
  render: (scale?: number, pad?: number) => HTMLCanvasElement | null
  name: string
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Filesystem-safe stem from the board's title, so downloads are identifiable. */
  const stem = name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "board"

  function withCanvas(fn: (c: HTMLCanvasElement) => void) {
    setError(null)
    const canvas = render()
    if (!canvas) {
      setError("Nothing on the board yet.")
      return
    }
    fn(canvas)
    setOpen(false)
  }

  function save(blob: Blob, ext: string) {
    // Object URL rather than a data: URL — a large board's PNG comfortably exceeds what
    // some browsers will accept in an href.
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${stem}.${ext}`
    a.click()
    // Revoked on the next tick, not immediately: revoking synchronously can cancel the
    // download the click just started.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const exportPng = () =>
    withCanvas((c) =>
      c.toBlob((blob) => {
        if (blob) save(blob, "png")
      }, "image/png"),
    )

  const exportPdf = () =>
    withCanvas(async (c) => {
      // Imported here rather than at module scope so the PDF library is only fetched
      // by someone who actually asks for a PDF — it is by far the heaviest thing on
      // this page and most sessions never touch it.
      const { jsPDF } = await import("jspdf")
      // JPEG, not PNG: jsPDF embeds JPEG directly as DCTDecode, while a PNG has to be
      // re-encoded, which on a large board is slow enough to look like a hang.
      const data = c.toDataURL("image/jpeg", 0.92)
      const landscape = c.width >= c.height
      const doc = new jsPDF({
        orientation: landscape ? "landscape" : "portrait",
        unit: "pt",
        // The page IS the image — a whiteboard has no paper size of its own, and
        // fitting it to A4 would letterbox every export.
        format: [c.width, c.height],
      })
      doc.addImage(data, "JPEG", 0, 0, c.width, c.height)
      doc.save(`${stem}.pdf`)
    })

  // Stacked above the zoom control, which now owns the bottom-right corner.
  return (
    <div className="fixed bottom-20 right-6">
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-44 rounded-xl border border-outline-variant elevation-2 p-1 backdrop-blur-md">
          <button
            type="button"
            onClick={exportPng}
            className="block w-full rounded px-2 py-1.5 text-left text-xs text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            PNG image
          </button>
          <button
            type="button"
            onClick={exportPdf}
            className="block w-full rounded px-2 py-1.5 text-left text-xs text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            PDF document
          </button>
          {error && <span className="block px-2 py-1 text-xs text-on-surface-variant">{error}</span>}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Export board"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-outline-variant elevation-2 text-on-surface-variant backdrop-blur-md transition-colors hover:text-on-surface-variant"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12" />
          <path d="M7 10l5 5 5-5" />
          <path d="M4 20h16" />
        </svg>
      </button>
    </div>
  )
}
