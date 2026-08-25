"use client"

import { Modal } from "@/components/Modal"

/**
 * A reference card for the shortcuts that actually exist.
 *
 * Every row here is bound somewhere in BoardCanvas or ZoomControl — this is a reference,
 * not a wishlist, and a shortcut listed but not implemented is worse than one that is
 * simply undocumented. When a binding is added or removed, this list is the other half
 * of that change.
 *
 * No backend and no state: it is a static table behind a menu item.
 */
const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Canvas",
    items: [
      ["Pan", "Hold Space + drag"],
      ["Pan", "Middle-click + drag"],
      ["Zoom", "Scroll wheel"],
      ["Zoom to fit", "Ctrl+1"],
      ["Zoom to 100%", "Ctrl+0"],
      ["Hide interface", "Ctrl+\\"],
    ],
  },
  {
    title: "Editing",
    items: [
      ["Undo", "Ctrl+Z"],
      ["Redo", "Ctrl+Shift+Z or Ctrl+Y"],
      ["Copy", "Ctrl+C"],
      ["Cut", "Ctrl+X"],
      ["Paste", "Ctrl+V"],
      ["Duplicate", "Ctrl+D"],
      ["Delete selection", "Delete or Backspace"],
    ],
  },
  {
    title: "While drawing",
    items: [
      ["Constrain to a straight line", "Hold Shift"],
      ["Draw a straight line", "Hold Alt"],
      ["Finish editing text", "Escape"],
    ],
  },
]

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} tone="light" width="max-w-xl">
      <div className="max-h-[65vh] space-y-5 overflow-y-auto p-5">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
              {group.title}
            </h3>
            <dl className="space-y-1">
              {group.items.map(([action, keys]) => (
                <div
                  key={`${group.title}:${action}:${keys}`}
                  className="flex items-baseline justify-between gap-4 rounded px-2 py-1.5 odd:bg-surface-container-low"
                >
                  <dt className="text-body-sm text-on-surface-variant">{action}</dt>
                  {/* label-mono — the other job the mono tier is specified for. Equal
                      advance width is what lets a column of key combos be scanned. */}
                  <dd className="shrink-0 font-mono text-label-mono text-on-surface">{keys}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <p className="text-[11px] leading-relaxed text-on-surface-variant">
          On a Mac, use Cmd wherever Ctrl is shown. If your browser claims Ctrl+1 or
          Ctrl+0 for its own tabs and page zoom, Shift+1 and Shift+0 do the same thing
          here.
        </p>
      </div>
    </Modal>
  )
}
