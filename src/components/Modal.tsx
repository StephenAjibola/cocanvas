"use client"

import { useEffect, useRef, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

/**
 * The dialog shell the board's Settings and Keyboard-shortcuts modals share.
 *
 * Dark chrome, because both are opened from the board header and sit over the canvas —
 * same ink-850 surface as the toolbar and the context menu, so a modal reads as part of
 * the same floating chrome rather than as a page that arrived from somewhere else.
 *
 * Deliberately not <dialog>: showModal() moves focus and locks the top layer in ways
 * that fight the canvas's own window-level key handling, and the two behaviours worth
 * having from it — Escape to close, click-outside to close — are four lines here.
 */
export function Modal({
  title,
  onClose,
  children,
  width = "max-w-lg",
  tone = "dark",
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  width?: string
  /**
   * Which ground the panel paints on.
   *
   * "dark" is the board's own chrome — Settings and Shortcuts are opened from the board
   * header and belong to the same floating surface as the toolbar. "light" is for dialogs
   * about the WORKSPACE rather than the canvas: sharing and access are the same subject
   * as the People page, and reading as a page dialog rather than as canvas furniture is
   * what makes that connection.
   *
   * The backdrop is shared either way — that is the part that says "modal".
   */
  tone?: "dark" | "light"
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const light = tone === "light"

  /**
   * Whether we are on the client yet, so the portal has a document.body to target.
   *
   * useSyncExternalStore rather than a mount effect: it takes a distinct server snapshot
   * (false) and client snapshot (true) without a setState-in-effect cascade, the same
   * pattern ShareModal uses to read window.location.origin.
   */
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      // Stopped before the canvas sees it: Escape there clears the selection, and
      // closing a modal must not also deselect what you had.
      e.stopPropagation()
      onClose()
    }
    // Capture phase, so this runs before the window listeners BoardCanvas binds.
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [onClose])

  useEffect(() => {
    // Focus moves into the panel so the modal is where the keyboard is — without it,
    // focus stays on the menu item that opened this and Tab walks the page behind.
    panelRef.current?.focus()
  }, [])

  // Nothing to portal into during the server render; the client pass mounts it.
  if (!mounted) return null

  return createPortal(
    /**
     * PORTALLED TO document.body, and that is the fix — not a positioning tweak.
     *
     * This dialog is opened from a control INSIDE the board header, and that header
     * carries `backdrop-blur-md`. Per spec, an element with a backdrop-filter becomes the
     * containing block for its `position: fixed` descendants — so `fixed inset-0` here
     * resolved against the header's own box, which is 56px tall. The whole modal was
     * being laid out inside a 56px strip at the top of the screen: header, invite field
     * and buttons pushed out of view, with only the bottom of the panel visible.
     *
     * No amount of top/transform/centring maths fixes that, because the coordinate space
     * itself is wrong. Rendering into document.body puts the dialog outside every
     * blurred ancestor, so `fixed` means the viewport again.
     *
     * Same trap applies to any future fixed-position UI opened from the header or the
     * toolbar — both are blurred surfaces.
     */
    /**
     * Two elements, not one, and the split is the second half of the fix.
     *
     * `flex items-center` alone centres a panel beautifully until the panel is TALLER
     * than the viewport — at which point it overflows equally in both directions and the
     * top half, header and all, sits above y=0 where nothing can scroll to it. The Share
     * dialog is the first one here tall enough to hit that: its invite field, member list
     * and link section stack past a laptop viewport, so its header and buttons were
     * simply gone.
     *
     * The scroll container goes on the OUTER element and `min-h-full` on the inner one.
     * Short content still centres exactly as before, because min-height does nothing
     * until the content exceeds it; tall content grows the inner box instead of
     * overflowing it, and the outer box scrolls to reach every part of the panel.
     */
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-ink-950/60 backdrop-blur-sm"
      // Closes on a press that lands anywhere outside the panel, across BOTH layers —
      // a target-identity check would only match whichever of the two was pressed. Using
      // mousedown rather than click is what stops a text selection dragged out of the
      // panel and released on the backdrop from dismissing the dialog and losing the edit.
      onMouseDown={(e) => {
        if (!panelRef.current?.contains(e.target as Node)) onClose()
      }}
    >
      <div className="flex min-h-full items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // Level 3: a dialog floats over everything, so it takes the glass surface plus
        // the primary-tinted cast shadow. Safe to blur here precisely BECAUSE this is
        // portalled to document.body — the containing-block trap documented in
        // globals.css needs a fixed-position DESCENDANT to bite, and this has none.
        //
        // The dark tone keeps its solid shell until Phase 7 re-skins the board chrome;
        // white glass on the navy board would be that phase's work done halfway.
        className={`w-full ${width} overflow-hidden rounded-lg outline-none ${
          light
            ? "elevation-3 text-on-surface"
            : "border border-ink-700 bg-ink-850 text-paper-300 shadow-2xl"
        }`}
      >
        <div
          className={`flex items-center justify-between border-b px-5 py-3.5 ${
            light ? "border-ink-200" : "border-ink-700"
          }`}
        >
          <h2 className={`text-sm font-medium ${light ? "text-ink-900" : "text-paper-100"}`}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              light
                ? "text-ink-500 hover:bg-paper-50 hover:text-ink-900"
                : "text-paper-500 hover:bg-ink-700 hover:text-paper-100"
            }`}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * A labelled on/off row — the shape every preference in these modals takes.
 *
 * The whole row is the control, not just the switch: a 36px-wide target for something
 * with a 200px label is a needless miss, and wrapping it in <label> means the hit area
 * comes from the platform rather than from a click handler on a div.
 */
export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded px-2 py-2 transition-colors hover:bg-surface-container">
      <span className="min-w-0">
        <span className="block text-[13px] text-on-surface">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[11px] leading-snug text-on-surface-variant">
            {description}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden
        // Every Modal is tone="light" now, so the dark-chrome accent and ink track
        // that used to live here rendered a white label on a white panel.
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-outline-variant"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </label>
  )
}
