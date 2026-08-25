"use client"

import { type ReactNode, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FILL_SWATCHES, pickerSwatches, type Theme } from "@/lib/theme"
import { SHAPE_KINDS, type PlacedShape, isFillable } from "@/lib/shapes"
import { ColorPicker, CustomColorSwatch } from "@/components/ColorPicker"
import { STICKY_COLORS } from "@/lib/notes"
import { BRUSHES, BRUSH_KINDS, type BrushKind } from "@/lib/brushes"

export type Tool = "select" | "pen" | "shape" | "note" | "text" | "eraser"

const BRUSH_ICONS: Record<BrushKind, ReactNode> = {
  pen: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19l7-7-4-4-7 7-1 5z" />
      <path d="M16 5l3 3" />
    </svg>
  ),
  marker: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 20H5v-4l9-9 4 4z" />
      <path d="M14 4l6 6" />
    </svg>
  ),
  pencil: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20l1-4L17 4l3 3L8 19z" />
      <path d="M5 16l3 3" />
    </svg>
  ),
  laser: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  ),
  watercolor: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3s6 6.5 6 10.5a6 6 0 01-12 0C6 9.5 12 3 12 3z" />
      <path d="M9.5 14a2.5 2.5 0 002.5 2.5" />
    </svg>
  ),
  chalk: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21l-4-4L15 6l4 4z" />
      <path d="M13 4l3 3" strokeDasharray="1.5 2" />
      <path d="M5 13l3 3" strokeDasharray="1.5 2" />
    </svg>
  ),
}

const SHAPE_ICONS: Record<PlacedShape, ReactNode> = {
  line: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M5 19L19 5" />
    </svg>
  ),
  rect: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="4" y="6" width="16" height="12" rx="1" />
    </svg>
  ),
  ellipse: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
    </svg>
  ),
  triangle: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 5l8 14H4z" />
    </svg>
  ),
  diamond: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 4l8 8-8 8-8-8z" />
    </svg>
  ),
  rightTriangle: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M5 4v16h15z" />
    </svg>
  ),
  parallelogram: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M9 6h11l-5 12H4z" />
    </svg>
  ),
  star: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M12 3.5l2.6 5.7 6.2.7-4.6 4.2 1.2 6.1-5.4-3.1-5.4 3.1 1.2-6.1L3.2 9.9l6.2-.7z" />
    </svg>
  ),
  arrow: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h16M14 7l5 5-5 5" />
    </svg>
  ),
  doubleArrow: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h18M8 7l-5 5 5 5M16 7l5 5-5 5" />
    </svg>
  ),
}

const SHAPE_LABELS: Record<PlacedShape, string> = {
  line: "Line",
  rect: "Rectangle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  diamond: "Diamond",
  rightTriangle: "Right triangle",
  parallelogram: "Parallelogram",
  star: "Star",
  arrow: "Arrow",
  doubleArrow: "Double arrow",
}

const SUN = (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </svg>
)

const MOON = (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 13a8.5 8.5 0 01-10-10 8.5 8.5 0 1010 10z" />
  </svg>
)

const UNDO = (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a5.5 5.5 0 010 11h-5" />
  </svg>
)

const REDO = (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H10a5.5 5.5 0 000 11h5" />
  </svg>
)

const INSERT_IMAGE = (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
    <path d="M21 16l-5.5-5.5L6 19" strokeLinecap="round" />
  </svg>
)

// `icon` is omitted for Shapes alone — it wears whichever shape is armed, resolved at
// render from SHAPE_ICONS. See the note in the tool row below.
//
// Text lives in the "..." overflow, not here — see TEXT_ICON and MORE_ITEMS below.
// This array is the always-visible rail, kept to the five tools reached for on nearly
// every stroke; everything used less often moved out so the rail stops growing with
// every feature this board picks up.
const TOOLS: { id: Tool; label: string; icon?: ReactNode }[] = [
  {
    id: "select",
    label: "Select",
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M4 3l7.5 17 2.3-6.9 6.9-2.3z" />
      </svg>
    ),
  },
  {
    id: "pen",
    label: "Pen",
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19l7-7-4-4-7 7-1 5z" />
        <path d="M16 5l3 3" />
      </svg>
    ),
  },
  { id: "shape", label: "Shapes" },
  {
    id: "eraser",
    label: "Eraser",
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 20H5l-2-2a2 2 0 010-3L13 5a2 2 0 013 0l4 4a2 2 0 010 3l-8 8z" />
        <path d="M9 11l6 6" />
      </svg>
    ),
  },
  {
    id: "note",
    label: "Sticky note",
    // Filled, unlike every other tool glyph, because a note IS a filled object — and
    // the fill is tinted with the armed color at render, same idea as Shapes wearing
    // the armed kind.
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M4 4h16v10l-6 6H4z" />
        <path d="M20 14h-6v6" />
      </svg>
    ),
  },
]

// The classic type-tool glyph: a serif A over a baseline. Stroked like the rest,
// unlike the note above, because text is ink rather than a filled object.
const TEXT_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 20h14" />
    <path d="M12 4L7 16" />
    <path d="M12 4l5 12" />
    <path d="M9 12h6" />
  </svg>
)

const MORE = (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
)

export function Toolbar({
  tool,
  onChange,
  theme,
  onOpenCanvasPanel,
  penColor,
  onPenColorChange,
  shapeKind,
  onShapeKindChange,
  shapeFill,
  onShapeFillChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  noteColor,
  onNoteColorChange,
  brush,
  onBrushChange,
  onInsertImage,
}: {
  tool: Tool
  onChange: (t: Tool) => void
  theme: Theme
  /**
   * Opens the canvas background/grid panel.
   *
   * Was onToggleTheme, which flipped the board between two backgrounds directly from
   * this menu. There are five now, plus a grid style, which is more than a menu row can
   * carry — so the row opens the panel that owns those choices instead of being one.
   */
  onOpenCanvasPanel: () => void
  penColor: string
  onPenColorChange: (c: string) => void
  shapeKind: PlacedShape
  onShapeKindChange: (k: PlacedShape) => void
  shapeFill: string | null
  onShapeFillChange: (c: string | null) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  noteColor: string
  onNoteColorChange: (c: string) => void
  brush: BrushKind
  onBrushChange: (b: BrushKind) => void
  /** Opens the file picker and uploads whatever comes back. Not a mode — see INSERT_IMAGE below. */
  onInsertImage: () => void
}) {
  // Which tool's popover is showing, rather than one boolean per tool: several now
  // have one, they are mutually exclusive, and a second flag would mean a second
  // dismiss effect saying the same thing. "more" is the overflow list, not a tool —
  // it rides the same slot because it is exactly as mutually-exclusive with the rest.
  const [openPopover, setOpenPopover] = useState<Tool | "more" | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openPopover) return
    // Any press outside the toolbar dismisses it — including on the canvas, which is
    // why this listens on the document rather than on a backdrop element.
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenPopover(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPopover(null)
    }
    document.addEventListener("pointerdown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [openPopover])

  function pickTool(id: Tool) {
    // Clicking a tool that owns a popover while it is already active toggles that
    // popover, so it can be dismissed the same way it was opened.
    const owns = id === "shape" || id === "note"
    setOpenPopover(owns && !(tool === id && openPopover === id) ? id : null)
    onChange(id)
  }
  const swatches = pickerSwatches(theme)

  // ponytail: pill stays dark on both themes — it reads as a floating control, not
  // part of the board surface.
  return (
    <div
      ref={rootRef}
      className="fixed left-4 top-1/2 flex -translate-y-1/2 items-start gap-2"
    >
      {/* The rail itself — tool selection, undo/redo and theme, always visible.
          Popovers and the always-on pen rows render as a second column to its right
          (below), never above it: a vertical rail has no "above" to open into. */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-outline-variant elevation-2 p-1.5 backdrop-blur-md">
      {TOOLS.map((t) => {
        const active = t.id === tool
        // Shapes wears the armed shape instead of a category glyph. Once the popover
        // closes this button is the ONLY thing saying what the next drag will draw —
        // a generic icon there reads as "shapes work" and leaves you to find out which
        // one by drawing it, which is how you end up stacking arrows expecting lines.
        const shapeTool = t.id === "shape"
        const icon = shapeTool ? SHAPE_ICONS[shapeKind] : t.icon
        // Announced too, not just drawn: the armed kind is state, and a screen reader
        // gets no icon.
        const noteSwatch = STICKY_COLORS.find(
          (c) => c.fill.toLowerCase() === noteColor.toLowerCase(),
        )
        const label = shapeTool
          ? `${t.label}: ${SHAPE_LABELS[shapeKind]}`
          : t.id === "note" && noteSwatch
            ? `${t.label}: ${noteSwatch.name}`
            : t.label
        return (
          <motion.button
            key={t.id}
            type="button"
            onClick={() => pickTool(t.id)}
            aria-label={label}
            title={label}
            aria-pressed={active}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className={`relative flex h-12 w-12 items-center justify-center rounded transition-colors ${
              active ? "text-on-primary" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {/* layoutId slides the highlight between buttons instead of cross-fading. */}
            {active && (
              <motion.span
                layoutId="toolbar-active"
                className="absolute inset-0 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            {/* The note glyph is tinted with the armed color so the toolbar says which
                sticky you are about to place, the same way Shapes says which shape. */}
            <span
              className="relative"
              style={t.id === "note" ? { color: noteColor } : undefined}
            >
              {icon}
            </span>
          </motion.button>
        )
      })}

      {/* Everything reached for less than every stroke — Text, Insert image, Undo,
          Redo, theme — lives behind this instead of stretching the rail. Not an entry
          in TOOLS: it is a menu, not a mode, except when Text is armed, where it
          borrows the same highlight so the rail still shows something is active. */}
      <div className="mx-2 my-1 h-px bg-surface-container" />
      <motion.button
        type="button"
        onClick={() => setOpenPopover((p) => (p === "more" ? null : "more"))}
        aria-label="More tools"
        aria-haspopup="menu"
        aria-expanded={openPopover === "more"}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        className={`relative flex h-12 w-12 items-center justify-center rounded transition-colors ${
          tool === "text" ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface-variant"
        }`}
      >
        {tool === "text" && (
          <motion.span
            layoutId="toolbar-active"
            className="absolute inset-0 rounded-full bg-primary"
            transition={{ type: "spring", stiffness: 500, damping: 38 }}
          />
        )}
        <span className="relative">{MORE}</span>
      </motion.button>
      </div>

      {/* Popovers and the always-on pen rows, stacked in a column to the right of the
          rail. Each slides in FROM the rail (x, not y) now that there is no "above"
          to animate from. */}
      <div className="flex flex-col gap-2">
      <AnimatePresence>
        {openPopover === "more" && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            role="menu"
            aria-label="More tools"
            className="w-44 rounded-xl border border-outline-variant elevation-2 p-1 backdrop-blur-md"
          >
            {(
              [
                {
                  label: "Text",
                  icon: TEXT_ICON,
                  onClick: () => pickTool("text"),
                },
                {
                  label: "Insert image",
                  icon: INSERT_IMAGE,
                  onClick: () => {
                    onInsertImage()
                    setOpenPopover(null)
                  },
                },
                {
                  label: "Undo",
                  shortcut: "Ctrl+Z",
                  icon: UNDO,
                  enabled: canUndo,
                  onClick: () => {
                    onUndo()
                    setOpenPopover(null)
                  },
                },
                {
                  label: "Redo",
                  shortcut: "Ctrl+Shift+Z",
                  icon: REDO,
                  enabled: canRedo,
                  onClick: () => {
                    onRedo()
                    setOpenPopover(null)
                  },
                },
                {
                  // The icon still tracks the background, so the row reads as "the
                  // canvas" at a glance: a sun on a dark board, a moon on a light one.
                  label: "Canvas…",
                  icon: theme === "dark" ? SUN : MOON,
                  onClick: () => {
                    onOpenCanvasPanel()
                    setOpenPopover(null)
                  },
                },
              ] as const
            ).map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={"enabled" in item && !item.enabled}
                onClick={item.onClick}
                className="flex w-full items-center justify-between gap-3 rounded px-2.5 py-1.5 text-left text-[13px] text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:pointer-events-none disabled:text-on-surface-variant/40"
              >
                <span className="flex items-center gap-2.5">
                  <span className="flex h-[18px] w-[18px] items-center justify-center">{item.icon}</span>
                  {item.label}
                </span>
                {"shortcut" in item && (
                  <span className="text-[11px] tabular-nums text-on-surface-variant">{item.shortcut}</span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tool === "note" && openPopover === "note" && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            role="group"
            aria-label="Sticky note color"
            className="grid grid-cols-5 gap-1 rounded-xl border border-outline-variant elevation-2 p-1 backdrop-blur-md"
          >
            {STICKY_COLORS.map((c) => {
              const active = c.fill.toLowerCase() === noteColor.toLowerCase()
              return (
                <motion.button
                  key={c.fill}
                  type="button"
                  onClick={() => {
                    onNoteColorChange(c.fill)
                    setOpenPopover(null)
                  }}
                  aria-label={c.name}
                  aria-pressed={active}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  className={`flex h-10 w-10 items-center justify-center rounded border transition-colors ${
                    active ? "border-primary" : "border-transparent hover:border-primary"
                  }`}
                >
                  {/* A filled square, not a dot: it previews the note, and the note is
                      a filled box. */}
                  <span
                    className="block h-6 w-6 rounded"
                    style={{ backgroundColor: c.fill }}
                    aria-hidden="true"
                  />
                </motion.button>
              )
            })}
            {/* Safe beyond the hand-tuned pairs because inkFor falls back to a
                computed high-contrast ink for any fill not in the table. */}
            <CustomColorSwatch
              value={noteColor}
              onChange={onNoteColorChange}
              className="h-10 w-10"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tool === "shape" && openPopover === "shape" && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            role="group"
            aria-label="Shape"
            // Width pinned to the 5×2 shape grid (5 × 2.5rem + 4 gaps + padding). Without
            // it the fill row — a flex-wrap of twelve swatches — laid out on one line and
            // dragged the whole popover to 400px, stretching the shape grid and clipping
            // the last swatch on the panel edge.
            className="w-56 rounded-xl border border-outline-variant elevation-2 p-1 backdrop-blur-md"
          >
            {/* Ten in a row would be wider than the toolbar it sits above, so the kinds
                wrap to a 5×2 grid. */}
            <div className="grid grid-cols-5 gap-1">
            {SHAPE_KINDS.map((kind) => {
              const active = kind === shapeKind
              return (
                <motion.button
                  key={kind}
                  type="button"
                  onClick={() => {
                    onShapeKindChange(kind)
                    setOpenPopover(null)
                  }}
                  aria-label={SHAPE_LABELS[kind]}
                  aria-pressed={active}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  className={`flex h-10 w-10 items-center justify-center rounded border transition-colors ${
                    active
                      ? "border-primary text-on-surface"
                      : "border-transparent text-on-surface-variant hover:text-on-surface-variant"
                  }`}
                >
                  {SHAPE_ICONS[kind]}
                </motion.button>
              )
            })}
            </div>

            {/* Hidden for a line, which has no interior — offering a fill that cannot
                apply is worse than not offering it. */}
            {isFillable(shapeKind) && (
              <div className="mt-1 border-t border-outline-variant px-1 pb-0.5 pt-1.5">
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-on-surface-variant">
                  Fill
                </span>
                <ColorPicker
                  value={shapeFill}
                  onChange={onShapeFillChange}
                  onNone={() => onShapeFillChange(null)}
                  noneLabel="No fill"
                  swatches={[...swatches, ...FILL_SWATCHES]}
                  fallback={penColor}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {/* Always visible with the Pen rather than behind a popover: the brush changes
            what the next stroke IS, so hiding it repeats the armed-shape mistake. */}
        {tool === "pen" && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            role="group"
            aria-label="Brush"
            className="flex gap-1 rounded-xl border border-outline-variant elevation-2 p-1 backdrop-blur-md"
          >
            {BRUSH_KINDS.map((k) => {
              const active = k === brush
              return (
                <motion.button
                  key={k}
                  type="button"
                  onClick={() => onBrushChange(k)}
                  aria-label={BRUSHES[k].label}
                  title={BRUSHES[k].label}
                  aria-pressed={active}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  // Icon-only, like the shapes popover: six labelled buttons would be
                  // wider than the toolbar under them. Safe here because this row is
                  // always visible with the active brush lit, so nothing is hidden.
                  className={`flex h-9 w-9 items-center justify-center rounded transition-colors ${
                    active ? "bg-primary-fixed text-on-primary-fixed" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {BRUSH_ICONS[k]}
                </motion.button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {/* Shapes take the pen colour, so the swatches have to be reachable in both. */}
        {(tool === "pen" || tool === "shape") && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="flex gap-1 rounded-xl border border-outline-variant elevation-2 p-1 backdrop-blur-md"
          >
            {swatches.map((s) => {
              const active = s.color.toLowerCase() === penColor.toLowerCase()
              return (
                <motion.button
                  key={s.label}
                  type="button"
                  onClick={() => onPenColorChange(s.color)}
                  aria-label={`${s.label} pen`}
                  aria-pressed={active}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  className={`h-7 w-7 rounded border transition-colors ${
                    active ? "border-primary" : "border-outline-variant hover:border-primary"
                  }`}
                >
                  <span
                    className="mx-auto block h-4 w-4 rounded-full"
                    style={{ backgroundColor: s.color }}
                    aria-hidden="true"
                  />
                </motion.button>
              )
            })}
            {/* Last in the row, after every preset: it is the escape hatch, not a
                peer of the presets. Seeded with the current color so the OS picker
                opens on what is already selected rather than on black. */}
            <CustomColorSwatch value={penColor} onChange={onPenColorChange} />
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  )
}
