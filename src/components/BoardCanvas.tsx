"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import gsap from "gsap"
import { AnimatePresence } from "framer-motion"
import {
  MAX_SCALE,
  MIN_SCALE,
  PINCH_ZOOM_SPEED,
  WHEEL_ZOOM_SPEED,
  type Viewport,
  clamp,
  normalizeWheelDelta,
  screenToWorld,
  worldToScreen,
  zoomAt,
  zoomFactor,
} from "@/lib/viewport"
import {
  MIN_POINT_DIST,
  SETTLE_DURATION,
  SETTLE_EASE,
  type Stroke,
  polylinePath,
  pressureWidth,
  pressuresOf,
  settleStyle,
  smoothPoint,
  strokePath,
  tracePath,
  variableWidthStroke,
} from "@/lib/strokes"
import { recognizeShape } from "@/lib/recognize"
import {
  DIE_DURATION,
  DIE_EASE,
  DROP_DURATION,
  DROP_EASE,
  LIFT_DURATION,
  LIFT_EASE,
  NOTE_FONT,
  NOTE_RADIUS,
  NOTE_SHADOW,
  NOTE_SHADOW_HOVER,
  NOTE_BORDER,
  NOTE_SIZE,
  SHAPE_DROP_SCALE,
  TEXT_SIZE,
  type Note,
  STICKY_COLORS,
  dieStyle,
  dropStyle,
  liftStyle,
  wrapText,
} from "@/lib/notes"
import {
  BRUSHES,
  BRUSH_KINDS,
  type BrushKind,
  LASER_EASE,
  LASER_FADE,
  PASS_SEED_STEP,
  brushOf,
  grainPath,
} from "@/lib/brushes"
import {
  type BoardObject,
  type Box,
  type Geom,
  HANDLE_HIT,
  HANDLE_SIZE,
  type HandleId,
  OPPOSITE,
  PASTE_OFFSET,
  ROTATE_DIST,
  TEXT_FONT_FAMILY,
  centerOf,
  geomBounds,
  cloneObject,
  edgeZ,
  handlesFor,
  hitsSweep,
  isLabelable,
  objectBounds,
  pickLabelTarget,
  pickObject,
  readGeom,
  scaleGeometry,
  sortByOrder,
  textBoxFor,
  textOf,
  toLocal,
  toWorldPoint,
  translateObject,
  visualBounds,
} from "@/lib/objects"
import { BULLET, fontString } from "@/lib/text-format"
import { ADD_SIZE, addBoxFor, hitsAdd, newCardFor, sectionsOf } from "@/lib/sections"
import {
  type PlacedShape,
  arrowHead,
  hasInterior,
  isBlockArrow,
  isFillable,
  shapePoints,
} from "@/lib/shapes"
import { IMAGE_MAX_SIZE, type ImageObject } from "@/lib/images"
import {
  CONNECTOR_SIDES,
  CONNECT_DIST,
  CONNECT_HIT,
  CONNECT_SIZE,
  type ConnectorSide,
  anchorOf,
  connectorPoints,
  connectorSidesFor,
  endsOf,
  isLinked,
  pickConnectTarget,
  rerouteAll,
  routeConnector,
} from "@/lib/connectors"
import { type StylePatch, createHistory } from "@/lib/history"
import { THEMES, type GridStyle, type Theme } from "@/lib/theme"
import { type Guide, computeSnap } from "@/lib/guides"
import type { ShareAccess } from "@/lib/share"
import { PIN_SIZE, type Pin, numberThreads, pickPin, tracePin } from "@/lib/pins"
import {
  COMMENTS_PANEL_WIDTH,
  CommentsPanel,
  type Thread,
} from "@/components/CommentsPanel"
import { readMemory, readPref, writeMemory, writePref } from "@/lib/prefs"
import { canvasTokens } from "@/lib/tokens"
import { useBoardSync } from "@/lib/useBoardSync"
import { SyncBadge } from "@/components/SyncBadge"
import { ExportButton } from "@/components/ExportButton"
import { Toolbar, type Tool } from "@/components/Toolbar"
import { SelectionPanel } from "@/components/SelectionPanel"
import { TextToolbar } from "@/components/TextToolbar"
import { ContextMenu, type MenuItem } from "@/components/ContextMenu"
import { BoardTitle } from "@/components/BoardTitle"
import { BoardMenu } from "@/components/BoardMenu"
import { CanvasPanel } from "@/components/CanvasPanel"
import { ShareButton } from "@/components/ShareButton"
import { AccountMenu } from "@/components/AccountMenu"
import { CollaboratorAvatars } from "@/components/CollaboratorAvatars"
import { BottomPill } from "@/components/BottomPill"
import { Logo } from "@/components/Logo"

/**
 * A straight arrow: the arrow tool's output, two endpoints and a painted head.
 *
 * Distinguished from the legacy block arrow by point count alone — see isBlockArrow.
 * Both answer to `shape: "arrow"`, because the boards that hold the old ones cannot be
 * rewritten from here.
 */
function isStraightArrow(s: { shape?: string; points: number[] }) {
  return s.shape === "arrow" && s.points.length === 4
}

const GRID_SPACING = 40 // world units between dots
// Screen px of pull toward an alignment. Screen rather than world, so the grab feels the
// same at every zoom — the caller divides by scale on its way into computeSnap.
const SNAP_TOLERANCE = 6
const SELECT_SLOP = 6 // screen px of grab tolerance around a stroke's edge
// Screen px of reach around the eraser. Wider than SELECT_SLOP: erasing is a sweeping
// gesture, and having to trace a hairline exactly would make it feel broken.
const ERASER_RADIUS = 14
// Screen px. A box allowed to reach zero can never be dragged back open, because every
// point would have collapsed onto the same coordinate.
const MIN_RESIZE = 8
// ~30Hz. A mouse reports far faster than that, and every publish is a message to
// every peer — beyond this the extra fidelity is invisible.
const CURSOR_INTERVAL = 33
// Factor per click of the zoom control's +/-. Matched to roughly one wheel notch.
const ZOOM_STEP = 1.2

/**
 * Whether a keystroke belongs to a focused field rather than to the board.
 *
 * Shared by every window-level shortcut here: the property panel's own inputs are
 * focusable, and in one of those Backspace means edit and Ctrl+Z means undo my typing.
 */
function isTypingTarget() {
  const el = document.activeElement
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
  )
}

export function BoardCanvas({
  boardId,
  initialTheme,
  initialGridStyle = "dot",
  initialStarred = false,
  role = "EDITOR",
  initialObjects = [],
  readOnly = false,
  live = true,
  boardName = "board",
  initialShareToken = null,
  initialShareAccess = "off",
  accountUser,
}: {
  boardId: string
  initialTheme: Theme
  /** The board's saved grid style. A board property, so it arrives from the row. */
  initialGridStyle?: GridStyle
  /** Whether THIS user has starred the board — drives the "..." menu's star item. */
  initialStarred?: boolean
  /** This user's workspace role, shown in the account menu's board section. */
  role?: string
  /** Only used to name exported files, and as the editable title in the header. */
  boardName?: string
  /**
   * The board's current view-only share token, if any. Only read by the header's
   * Share button — a viewer never sees it, since readOnly gates the whole header out.
   */
  initialShareToken?: string | null
  /** What that link currently grants — seeds the modal's segmented control. */
  initialShareAccess?: ShareAccess
  /**
   * The signed-in user, for the header's account menu. Undefined on the public
   * /view route — that page has no session, and readOnly already gates the whole
   * header out anyway, so there's nothing for it to render into.
   */
  accountUser?: { name: string | null; email: string; image: string | null }
  /**
   * Renders the board without any way to change it: no toolbar, no property panel, no
   * context menu. Pan and zoom stay live, because they are how you look at something
   * rather than how you edit it.
   *
   * A prop rather than a second component. The alternative is lifting a 600-line draw
   * closure out of this effect so a viewer could share it, and the two renderers would
   * then have to be kept in agreement forever. This way there is one renderer and one
   * set of gates.
   */
  readOnly?: boolean
  /**
   * Whether to open the realtime connection at all. Separate from readOnly: a
   * workspace VIEWER is readOnly but still `live` — they watch edits happen, same
   * room as everyone else, just with no local write path ever touching it. Only the
   * public /view/[token] route sets this false — no session there to fetch a
   * realtime token with, and nothing wrong with a snapshot for an anonymous visitor.
   */
  live?: boolean
  /**
   * The board as last persisted. Only ever used to SEED an empty realtime room — see
   * useBoardSync. Once a room has state, the live document wins, because this copy is
   * as old as the last save and would resurrect anything erased since.
   */
  initialObjects?: BoardObject[]
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tool, setTool] = useState<Tool>("select")
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [gridStyle, setGridStyle] = useState<GridStyle>(initialGridStyle)
  const gridStyleRef = useRef<GridStyle>(gridStyle)
  gridStyleRef.current = gridStyle
  // Whether the canvas background/grid popover is open. State, not a ref: it mounts a
  // component, unlike the values above which only the draw loop reads.
  const [canvasPanel, setCanvasPanel] = useState(false)
  /**
   * The three view-level preferences, seeded from localStorage on the client.
   *
   * Lazy initialisers because this component server-renders: reading localStorage during
   * the render pass would throw there, and a useEffect-based read would flash the
   * default first. Each is mirrored to a ref for the same reason theme is — the canvas
   * effect must never re-run.
   */
  const [smartGuides, setSmartGuides] = useState(() => readPref("smartGuides"))
  const smartGuidesRef = useRef(smartGuides)
  smartGuidesRef.current = smartGuides
  const [hideCursors, setHideCursors] = useState(() => readPref("hideCursors"))
  const hideCursorsRef = useRef(hideCursors)
  hideCursorsRef.current = hideCursors
  /**
   * Presentation mode: every piece of chrome hidden, canvas only.
   *
   * Not persisted, and that is deliberate — a preference that hides the entire interface
   * and survives a reload is one you cannot discover your way out of. It lasts as long
   * as the page does, and Ctrl+\ or Escape brings it back.
   */
  const [hideUI, setHideUI] = useState(false)

  /**
   * Comments. The panel owns the data; the canvas owns the pins drawn from it.
   *
   * Everything the draw loop reads is mirrored into a ref, for the same reason theme and
   * tool are: the canvas effect has [] deps and must never re-run, or it drops the view
   * transform and every stroke mid-gesture.
   */
  const [commentsOpen, setCommentsOpen] = useState(false)
  const commentsOpenRef = useRef(commentsOpen)
  commentsOpenRef.current = commentsOpen
  const [threads, setThreads] = useState<Thread[]>([])
  const threadsRef = useRef<Thread[]>(threads)
  threadsRef.current = threads
  const [selectedThread, setSelectedThread] = useState<string | null>(null)
  const selectedThreadRef = useRef<string | null>(selectedThread)
  selectedThreadRef.current = selectedThread
  // Armed by the panel's "New comment" button: the next canvas click drops a pin instead
  // of drawing or selecting.
  const [placing, setPlacing] = useState(false)
  const placingRef = useRef(placing)
  placingRef.current = placing
  const [pendingAnchor, setPendingAnchor] = useState<{
    x: number
    y: number
    objectId: string | null
  } | null>(null)
  // Bumped to make the panel refetch — see the realtime note where this is wired.
  const [commentsVersion, setCommentsVersion] = useState(0)
  /**
   * The two callbacks the canvas effect fires back into React.
   *
   * Refs rather than direct calls because the effect closes over its first render
   * forever — calling setPlacing from inside it would use the setter from render zero,
   * which is fine, but the surrounding logic reads state that would be stale. Assigning
   * on every render keeps the effect pointed at current behaviour without re-running it.
   */
  const onPlacedRef = useRef<(a: { x: number; y: number; objectId: string | null }) => void>(
    () => {},
  )
  onPlacedRef.current = (anchor) => {
    setPendingAnchor(anchor)
    setPlacing(false)
    setSelectedThread(null)
  }
  const onPinClickRef = useRef<(id: string) => void>(() => {})
  onPinClickRef.current = (id) => {
    setSelectedThread((cur) => (cur === id ? null : id))
  }

  // Pins are painted by the draw loop, which is driven by pointer events — without this,
  // a thread posted or resolved from the panel would not appear on the board until
  // something else happened to cause a frame.
  useEffect(() => {
    redrawRef.current()
  }, [threads, selectedThread, commentsOpen])

  /**
   * Refetch comments when the tab regains focus.
   *
   * This is the honest half of "lightweight push". Local changes are already optimistic,
   * and coming back to the tab is when someone else's comment is most likely to be
   * waiting — so this covers the common case without a second socket.
   *
   * ponytail: true push. The intended design is a `commentsVersion` counter on the
   * EXISTING y-websocket document — the socket carries a bump, REST still carries the
   * content and the authorisation, so no comment ever travels over a channel that cannot
   * verify its author. That needs a channel added to useBoardSync, which is why it is not
   * here yet.
   */
  useEffect(() => {
    if (!commentsOpen) return
    const onFocus = () => setCommentsVersion((v) => v + 1)
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [commentsOpen])
  // Surfaces an insertImage failure instead of the console-only log it used to be —
  // a failed upload used to look identical to a slow one, from the user's side.
  const [uploadError, setUploadError] = useState<string | null>(null)
  // The canvas effect must not re-run on tool or theme change — that would drop the
  // view transform and every stroke. It reads live values through these refs instead.
  const toolRef = useRef<Tool>(tool)
  const themeRef = useRef<Theme>(theme)
  // The document — strokes, shapes and notes in one paint-ordered array. Lives out here
  // rather than in the effect closure so the property panel can edit the selected
  // object directly without the canvas effect re-running.
  const objectsRef = useRef<BoardObject[]>([])
  /**
   * Hydrated from the server's snapshot, ONCE, before anything reads the array.
   *
   * The board used to start empty here and fill in only when the realtime provider
   * fired "sync". That made a websocket a precondition for seeing content the page had
   * already fetched from Postgres: with the relay down, a board with rows in the
   * database rendered blank — and then the first edit's debounced save wrote that blank
   * state back over the real rows. A freshly seeded template board is where it showed
   * up worst, because there is nothing else on it to notice going missing.
   *
   * Cloned, and pushed in place rather than assigned: `initialObjects` is a fresh array
   * from the server component on every render, while everything here — the canvas
   * effect, history, the sync hook — captures THIS array's identity exactly once.
   * seed() and applyRemote() still reconcile it against the live document on sync, so
   * the room stays the authority whenever there is a room.
   */
  const hydratedRef = useRef(false)
  if (!hydratedRef.current) {
    hydratedRef.current = true
    for (const o of initialObjects) objectsRef.current.push(structuredClone(o))
  }
  // The selected object itself, not its id: the panel needs its color and width, and
  // holding the object means render never has to look inside objectsRef — reading a
  // ref during render is what makes a component miss updates. The draw loop reads the
  // id off the mirror ref below.
  const [selected, setSelected] = useState<BoardObject | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  /**
   * The pen's color for the *next* stroke. Sticky until changed — unrelated to the
   * property panel, which edits an existing stroke.
   *
   * Seeded from what you last used, falling back to this canvas's ink. readMemory
   * returns null when the "always use default brushes" preference is on, so that
   * preference is enforced by the seed rather than by a branch here.
   */
  const [penColor, setPenColor] = useState(
    () => readMemory("penColor") ?? THEMES[initialTheme].stroke,
  )
  const penColorRef = useRef(penColor)
  const [shapeKind, setShapeKind] = useState<PlacedShape>("rect")
  const shapeKindRef = useRef(shapeKind)
  // The fill for the *next* shape, null for none. Same armed-not-retroactive contract
  // as penColor, and null rather than "" so it maps straight onto Stroke.fill.
  const [shapeFill, setShapeFill] = useState<string | null>(null)
  const shapeFillRef = useRef(shapeFill)
  // Seeded from memory like penColor, and validated on the way in: the stored string is
  // user-editable and a stale build may have written a brush that no longer exists.
  const [brush, setBrush] = useState<BrushKind>(() => {
    const remembered = readMemory("brush")
    return remembered && (BRUSH_KINDS as string[]).includes(remembered)
      ? (remembered as BrushKind)
      : "pen"
  })
  const brushRef = useRef(brush)

  /**
   * Remember the current pen style for the next board.
   *
   * Writes on change rather than on unmount: a board page is usually left by navigating
   * or closing the tab, and unmount cleanup is not guaranteed to run for either.
   *
   * Guarded on the preference, so "always use default brushes" stops the app writing the
   * memory as well as reading it — otherwise turning it on would leave a stale brush on
   * disk, ready to reappear the moment it was turned back off.
   */
  useEffect(() => {
    if (readPref("defaultBrushes")) return
    writeMemory("brush", brush)
    writeMemory("penColor", penColor)
  }, [brush, penColor])
  // Read through a ref inside the canvas effect for the same reason tool and theme are:
  // the effect must not re-run, or it drops the view transform and every stroke.
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly
  // An internal clipboard, not the system one: cross-app paste would mean serialising
  // to a MIME payload and parsing whatever arrives back, which is its own job.
  const clipboardRef = useRef<BoardObject | null>(null)
  /** Open menu, in SCREEN coords, plus the world point it was opened at (for Paste). */
  const [menu, setMenu] = useState<{ x: number; y: number; world: { x: number; y: number } } | null>(
    null,
  )
  // The fill for the *next* note. Same contract as penColor: armed, not retroactive.
  const [noteColor, setNoteColor] = useState(STICKY_COLORS[0].fill)
  const noteColorRef = useRef(noteColor)
  // The note currently open for text editing, if any. State because it mounts the
  // textarea; the effect reads the id through the mirror ref so the draw loop can
  // suppress the canvas copy of the text under the live input.
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const editingIdRef = useRef<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Positions the textarea over its note each frame — see syncEditor in the effect.
  const syncEditorRef = useRef<() => void>(() => {})
  // requestDraw lives inside the canvas effect's closure; this is the only handle
  // the outside has on it. No-op until the effect mounts.
  const redrawRef = useRef<() => void>(() => {})
  /**
   * Plays an object's exit animation. Assigned by the canvas effect.
   *
   * A ref because deleteSelected lives out here (it is bound per selection, see below)
   * while the animation state lives inside the effect with the draw loop. No-op until
   * the canvas mounts, so a delete that somehow lands first just removes the object.
   */
  const fadeOutRef = useRef<(o: BoardObject) => void>(() => {})
  // The pan/zoom transform, mirrored out of the canvas effect the same way redrawRef
  // is: insertImage needs to know what part of the board is on screen right now, and
  // the transform itself lives in that effect's closure, not in React state.
  const viewRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 })
  // Imperative handle for the zoom control's +/- buttons, same shape as redrawRef:
  // `view` lives inside the canvas effect's closure, so this is the only way in
  // from outside it. No-op until the effect mounts.
  const zoomRef = useRef<(dir: 1 | -1) => void>(() => {})
  // Same contract as zoomRef: the zoom menu and the keyboard shortcuts reach the view
  // transform through these, since it lives in the canvas effect's closure.
  const zoomToRef = useRef<(scale: number) => void>(() => {})
  const fitRef = useRef<() => void>(() => {})
  // Filled by BoardTitle, so the "..." menu's Rename opens the existing title field
  // rather than introducing a second way to rename a board.
  const renameRef = useRef<(() => void) | null>(null)
  // Renders the board to an offscreen canvas. Null when the board is empty — there is
  // no meaningful crop of nothing, and a 0x0 PNG is a worse answer than "nothing yet".
  const exportRef = useRef<(scale?: number, pad?: number) => HTMLCanvasElement | null>(
    () => null,
  )
  const { cursorsRef, publishRef, touchRef, resyncRef, holdRef, statsRef } = useBoardSync(
    // Null boardId is the hook's signal to stay disconnected — only ever true for the
    // public /view route (live=false). A workspace VIEWER still connects: readOnly
    // alone just means nothing here ever calls touchRef/resyncRef.
    live ? boardId : null,
    redrawRef,
    objectsRef,
    initialObjects,
  )

  // Entries live in a ref because the canvas effect pushes to them from outside React,
  // at pointer rates. Bound to objectsRef.current, whose identity never changes.
  const historyRef = useRef<ReturnType<typeof createHistory>>(undefined)
  historyRef.current ??= createHistory(objectsRef.current)
  // True while a draw or drag gesture is in flight. Undo mid-gesture would detach the
  // stroke the effect's live `drawing`/`dragging` reference still points at.
  const busyRef = useRef(false)
  // The only part of history React renders. `ver` is a monotonic counter, not a stack
  // length: two different edit sequences can leave the stack the same depth with the
  // board in different states, and the panel below keys off this to re-seed.
  const [hist, setHist] = useState({ ver: 0, canUndo: false, canRedo: false })

  /**
   * Republishes the history flags after a push, undo or redo.
   *
   * `reseed` is for undo/redo only. It bumps `ver`, remounting StrokePanel so its
   * inputs re-read the stroke — necessary when history moved underneath them, and
   * actively harmful on a push, because a push is usually the panel's own slider
   * mid-drag and remounting would tear the input out from under the pointer.
   *
   * useCallback with no deps: stable forever, so the canvas effect can depend on it
   * and still mount exactly once.
   */
  const commit = useCallback((reseed = false) => {
    const h = historyRef.current!
    setHist((v) => {
      const next = { ver: reseed ? v.ver + 1 : v.ver, canUndo: h.canUndo(), canRedo: h.canRedo() }
      // Returning the same object skips the render. A style drag pushes ~60 entries a
      // second and almost none of them change a flag.
      return next.ver === v.ver && next.canUndo === v.canUndo && next.canRedo === v.canRedo
        ? v
        : next
    })
  }, [])

  const step = useCallback(
    (dir: "undo" | "redo") => {
      if (busyRef.current) return
      if (!historyRef.current![dir]()) return
      // An undone "add" takes the stroke out of the document. Holding the selection
      // would leave the panel editing an object nothing renders any more.
      setSelected((s) => (s && objectsRef.current.includes(s) ? s : null))
      // One entry can add, remove, restyle and reorder at once — a batch, arbitrarily
      // many of each — so the whole board goes out rather than a tracked id set.
      resyncRef.current()
      commit(true)
      redrawRef.current()
    },
    [commit, resyncRef],
  )

  useEffect(() => {
    toolRef.current = tool
    const c = canvasRef.current
    if (c) c.style.cursor = tool === "select" ? "default" : "crosshair"
    // The canvas now paints something that depends on the armed tool — the columns'
    // quick-add "+", which only shows under Select. Without this the buttons appear a
    // frame late, whenever the next unrelated repaint happens to come along.
    redrawRef.current()
  }, [tool])

  useEffect(() => {
    themeRef.current = theme
    redrawRef.current()
  }, [theme])

  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null
    redrawRef.current()
  }, [selected])

  useEffect(() => {
    // No repaint: these only affect strokes not drawn yet.
    penColorRef.current = penColor
  }, [penColor])

  useEffect(() => {
    shapeKindRef.current = shapeKind
  }, [shapeKind])

  useEffect(() => {
    shapeFillRef.current = shapeFill
  }, [shapeFill])

  useEffect(() => {
    noteColorRef.current = noteColor
  }, [noteColor])

  useEffect(() => {
    brushRef.current = brush
  }, [brush])

  // Focus and position the textarea once it exists, and repaint so the draw loop stops
  // painting the note's own text underneath it.
  useEffect(() => {
    editingIdRef.current = editing?.id ?? null
    redrawRef.current()
    if (!editing) return
    syncEditorRef.current()
    const el = textareaRef.current
    // Caret at the end rather than at 0: you are almost always appending, and this is
    // what every other text tool does.
    el?.focus()
    el?.setSelectionRange(el.value.length, el.value.length)
  }, [editing])

  /**
   * Leaves text-editing mode, committing whatever is in the textarea.
   *
   * One history entry for the whole session, not one per keystroke — while the
   * textarea has focus isTypingTarget() keeps board-level Ctrl+Z out of the way and
   * the browser's native field undo is doing that job.
   */
  const stopEditing = useCallback(() => {
    if (!editing) return
    // Deliberately NOT inside a setEditing updater: StrictMode double-invokes updater
    // functions in development, which would push this entry onto history twice.
    const target = objectsRef.current.find((o) => o.id === editing.id)
    const next = textareaRef.current?.value ?? editing.text
    if (target && isLabelable(target) && next !== editing.text) {
      target.text = next
      historyRef.current!.push({
        kind: "text",
        id: editing.id,
        before: editing.text,
        after: next,
      })
      touchRef.current(editing.id)
      commit()
    }
    setEditing(null)
    redrawRef.current()
  }, [commit, editing, touchRef])

  // Switching tools is an event, so the selection is cleared here rather than in an
  // effect watching `tool` — clearing it there would setState during an effect and
  // cascade an extra render. Leaving Select drops the selection because the panel
  // would otherwise edit something you can no longer click.
  function changeTool(next: Tool) {
    setTool(next)
    if (next !== "select") setSelected(null)
    // Reaching for another tool is as clear an exit from typing as clicking away.
    if (next !== "note") stopEditing()
  }

  /**
   * Changes the canvas background.
   *
   * The old two-way toggle, generalised to take its destination rather than compute it —
   * everything else about it is unchanged, including the write it makes and the revert
   * that covers a failed one. `next === theme` is a no-op rather than a wasted PATCH,
   * which matters now that clicking the swatch you are already on is a thing you can do.
   */
  function changeCanvas(next: Theme) {
    const prev = theme
    if (next === prev) return
    // The pen default tracks the canvas only while you haven't overridden it: once you
    // pick a color it stays yours across background changes. No extra "is customised"
    // flag — still matching the old default IS the flag.
    const followsTheme = penColor === THEMES[prev].stroke
    if (followsTheme) setPenColor(THEMES[next].stroke)
    setTheme(next) // repaint immediately; the write is not on the critical path
    fetch(`/api/board/${boardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`PATCH failed: ${r.status}`)
      })
      .catch((err) => {
        // Revert rather than show a canvas the next reload won't honour.
        console.error("Saving board canvas failed:", err)
        setTheme(prev)
        if (followsTheme) setPenColor(THEMES[prev].stroke)
      })
  }

  /** Same optimistic-with-revert contract as changeCanvas, on the other board column. */
  function changeGridStyle(next: GridStyle) {
    const prev = gridStyle
    if (next === prev) return
    // The ref is written HERE, not left to the next render's mirror assignment: the
    // redraw below runs synchronously, before React re-renders, so a mirror-only update
    // would repaint this frame with the previous style still in the ref.
    gridStyleRef.current = next
    setGridStyle(next)
    redrawRef.current()
    fetch(`/api/board/${boardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gridStyle: next }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`PATCH failed: ${r.status}`)
      })
      .catch((err) => {
        console.error("Saving board grid style failed:", err)
        gridStyleRef.current = prev
        setGridStyle(prev)
        redrawRef.current()
      })
  }

  /**
   * The object a style patch applies to, by id.
   *
   * Split out of updateSelected because the text toolbar formats whatever is being
   * EDITED, which is not always what `selected` points at — and a second copy of the
   * before-snapshot rules is exactly the kind of duplication that drifts until undo
   * stops restoring one of the fields.
   */
  /**
   * What the text toolbar formats: whatever is open in the editor, or the selection.
   *
   * The editor wins because reaching for Bold mid-sentence must not require clicking
   * out of the words being typed — and while editing, the selection can legitimately be
   * pointing somewhere else.
   */
  const textTarget =
    (editing && objectsRef.current.find((o) => o.id === editing.id)) || selected || null

  function updateObject(id: string, patch: StylePatch) {
    const selected = objectsRef.current.find((o) => o.id === id)
    if (!selected) return
    // Snapshot the scalars being replaced BEFORE the assign. Storing `selected` itself
    // would store a reference that mutates along with the document, and undo would
    // restore the value it was already at.
    const before: StylePatch = {}
    // An image has no color, width, fill, dash, curve or font — the panel never sends
    // it a patch, but the snapshot below still has to type-check against every member
    // of BoardObject, not just the ones this call happens to see.
    if (patch.color !== undefined && selected.type !== "image") before.color = selected.color
    // Notes have no width, so there is nothing to snapshot and nothing will patch it.
    if (patch.width !== undefined && selected.type !== "note" && selected.type !== "image") {
      before.width = selected.width
    }
    // Presence, not value: clearing a fill sends `fill: undefined`, and a !== undefined
    // test would skip the snapshot and leave undo unable to put the fill back. Solid and
    // straight are expressed the same way, so dash and curve follow the same rule.
    if ("fill" in patch && selected.type !== "note" && selected.type !== "image") {
      before.fill = selected.fill
    }
    if ("dash" in patch && selected.type !== "note" && selected.type !== "image") {
      before.dash = selected.dash
    }
    if ("curve" in patch && selected.type !== "note" && selected.type !== "image") {
      before.curve = selected.curve
    }
    // Resolved rather than copied: absent means NOTE_FONT, and undo restoring an
    // explicit NOTE_FONT is indistinguishable on screen from restoring the absence.
    if (patch.font !== undefined && selected.type === "note") {
      before.font = selected.font ?? NOTE_FONT
    }
    // Presence, not value, for every mark: toggling Bold OFF sends `bold: undefined`,
    // and a !== undefined test would skip the snapshot and leave undo unable to switch
    // it back on. Same rule `fill`, `dash` and `curve` already follow.
    if (selected.type === "note" || selected.type === "stroke") {
      for (const k of ["bold", "italic", "underline", "list", "align"] as const) {
        if (k in patch) (before as Record<string, unknown>)[k] = selected[k]
      }
    }
    historyRef.current!.push({ kind: "style", id: selected.id, before, after: { ...patch } })
    touchRef.current(selected.id)
    // Mutated in place — the draw loop holds this exact object, so this is all it
    // takes for the change to land on the next frame.
    Object.assign(selected, patch)
    // A curve is baked into `points`, so changing it has to regenerate the geometry.
    // Linked connectors would be re-routed by the draw loop anyway; an unlinked one has
    // no anchors to re-route from, which is what endsOf recovers.
    if ("curve" in patch && selected.type === "stroke" && selected.shape === "connector") {
      const { from, to } = endsOf(selected)
      selected.points.length = 0
      selected.points.push(...connectorPoints(from.x, from.y, to.x, to.y, selected.curve))
    }
    commit()
    redrawRef.current()
  }

  /** The panel's entry point: same rules, applied to the current selection. */
  function updateSelected(patch: StylePatch) {
    if (selected) updateObject(selected.id, patch)
  }

  /** Adds a fresh object to the top of the board and selects it. */
  function place(o: BoardObject) {
    objectsRef.current.push(o)
    sortByOrder(objectsRef.current)
    historyRef.current!.push({
      kind: "add",
      object: o,
      index: objectsRef.current.indexOf(o),
    })
    touchRef.current(o.id)
    commit()
    setSelected(o)
    redrawRef.current()
  }

  /**
   * Uploads `file` and places it as a new image, centred in the current view.
   *
   * Sizing reads the file's own pixels via createImageBitmap rather than waiting on
   * the uploaded copy to round-trip — the bytes are already on this machine, and the
   * network request only needs to answer "where does this live now", not "how big is
   * it". Fit to IMAGE_MAX_SIZE on the long side so a phone photo doesn't land the size
   * of the whole board.
   */
  async function insertImage(file: File) {
    let w = IMAGE_MAX_SIZE
    let h = IMAGE_MAX_SIZE
    try {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, IMAGE_MAX_SIZE / Math.max(bitmap.width, bitmap.height))
      w = bitmap.width * scale
      h = bitmap.height * scale
      bitmap.close()
    } catch (err) {
      // Falls back to a square placeholder size — the upload below still validates the
      // file server-side, so a bitmap this browser cannot decode is still rejected.
      console.error("Reading image dimensions failed:", err)
    }

    const form = new FormData()
    form.append("file", file)
    let url: string
    try {
      const res = await fetch(`/api/board/${encodeURIComponent(boardId)}/image`, {
        method: "POST",
        body: form,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `upload failed: ${res.status}`)
      url = body.url
      setUploadError(null)
    } catch (err) {
      console.error("Image upload failed:", err)
      setUploadError(err instanceof Error ? err.message : "Image upload failed")
      return
    }

    const rect = canvasRef.current?.getBoundingClientRect()
    const center = rect
      ? screenToWorld(viewRef.current, rect.width / 2, rect.height / 2)
      : { x: 0, y: 0 }

    place({
      id: crypto.randomUUID(),
      type: "image",
      x: center.x - w / 2,
      y: center.y - h / 2,
      w,
      h,
      src: url,
      createdAt: Date.now(),
    })
  }

  function copySelected() {
    // Snapshot on copy, not on paste: the original can be moved, recoloured or deleted
    // before you paste, and the clipboard should still hold what you copied.
    if (selected) clipboardRef.current = structuredClone(selected)
  }

  function pasteAt(world?: { x: number; y: number }) {
    const clip = clipboardRef.current
    if (!clip) return
    if (!world) {
      place(cloneObject(clip, PASTE_OFFSET, PASTE_OFFSET))
      return
    }
    // Menu paste lands centred under the cursor, which is where you pointed.
    const b = objectBounds(clip)
    place(cloneObject(clip, world.x - (b.minX + b.maxX) / 2, world.y - (b.minY + b.maxY) / 2))
  }

  function duplicateSelected() {
    if (selected) place(cloneObject(selected, PASTE_OFFSET, PASTE_OFFSET))
  }

  function cutSelected() {
    if (!selected || selected.locked) return
    copySelected()
    deleteSelected()
  }

  /**
   * Bring to front / send to back.
   *
   * Writes an explicit `z` rather than moving the object within the array: the array is
   * a local view sorted by orderOf, and its indices mean nothing to a peer. See the
   * note on the "reorder" history entry.
   */
  function reorderSelected(edge: "front" | "back") {
    if (!selected) return
    const objects = objectsRef.current
    if (!objects.includes(selected)) return
    const before = selected.z
    const after = edgeZ(objects, edge)
    if (before === after) return
    selected.z = after
    sortByOrder(objects)
    historyRef.current!.push({ kind: "reorder", id: selected.id, before, after })
    touchRef.current(selected.id)
    commit()
    redrawRef.current()
  }

  function toggleLock() {
    if (!selected) return
    const locked = !selected.locked
    // Mutated in place — the draw loop and the selection hold this exact object, so
    // replacing it with a copy would detach both.
    selected.locked = locked
    historyRef.current!.push({ kind: "lock", id: selected.id, locked })
    touchRef.current(selected.id)
    // reseed: the flag changed underneath React on an object whose identity did not, so
    // a version bump is what makes the menu and panel re-read it.
    commit(true)
    redrawRef.current()
  }

  function deleteSelected() {
    if (readOnly) return // the Delete key reaches this without going through the canvas
    if (!selected || selected.locked) return
    const i = objectsRef.current.indexOf(selected)
    if (i >= 0) {
      objectsRef.current.splice(i, 1)
      // Out of the array first, then painted on its way out — see fadeOut.
      fadeOutRef.current(selected)
      // The index goes with it: restoring the object has to put it back under whatever
      // was painted over it, not on top.
      historyRef.current!.push({ kind: "remove", object: selected, index: i })
      touchRef.current(selected.id)
      commit()
    }
    // Deleting the note being edited has to close the editor with it, or the textarea
    // is left pointing at an object no longer in the document.
    if (editing?.id === selected.id) setEditing(null)
    setSelected(null) // the selection effect repaints
  }

  // Deliberately NOT in the canvas effect: that one has [] deps, so it would close
  // over the first render's deleteSelected forever — where selectedId is still null
  // and every keypress would delete nothing. This re-binds per selection instead.
  useEffect(() => {
    if (!selected) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return
      if (isTypingTarget()) return
      e.preventDefault() // Backspace still navigates back in some browsers
      deleteSelected()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
    // deleteSelected closes over `selected`; nothing else it touches is unstable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // Bound once, unlike the Delete handler above: undo does not depend on the selection,
  // and `step` is stable.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // metaKey as well as ctrlKey — Cmd+Z is free, and a Mac user reaching for it
      // otherwise gets nothing.
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (isTypingTarget()) return // Ctrl+Z in a field means undo my typing
      const key = e.key.toLowerCase()
      // Ctrl+Y for redo alongside Ctrl+Shift+Z: the Windows convention, and the one
      // hand position that does not need the shift.
      if (key !== "z" && key !== "y") return
      e.preventDefault()
      step(key === "y" || e.shiftKey ? "redo" : "undo")
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [step])

  /**
   * View shortcuts: fit, 100%, and hide the interface.
   *
   * Bound once — none of these depend on the selection, and all three reach the view
   * transform through refs rather than through state.
   *
   * The Shift aliases are not decoration. Chrome and Firefox claim Ctrl+1..8 for tab
   * switching and Ctrl+0 for page zoom at a level a page cannot always preventDefault
   * its way out of, so the briefed bindings are attempted first and Shift+1 / Shift+0 are
   * there for when the browser wins. Both are documented in the shortcuts modal.
   */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey || isTypingTarget()) return
      const mod = e.ctrlKey || e.metaKey

      // Escape is the way out of a hidden interface that does not require remembering
      // the shortcut that got you into it. Gated on hideUI being ON — otherwise this
      // would swallow every Escape the canvas wanted for closing an editor or clearing
      // a selection.
      if (e.key === "Escape") {
        if (hideUI) {
          e.preventDefault()
          setHideUI(false)
        }
        return
      }

      if (mod && e.key === "\\") {
        e.preventDefault()
        setHideUI((v) => !v)
        return
      }
      if ((mod || e.shiftKey) && (e.key === "1" || e.key === "!")) {
        e.preventDefault()
        fitRef.current()
        return
      }
      if ((mod || e.shiftKey) && (e.key === "0" || e.key === ")")) {
        e.preventDefault()
        zoomToRef.current(1)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
    // Re-bound when hideUI changes so the Escape branch reads the current value. The
    // zoom branches go through refs and would be happy with [] — this is the cheaper
    // trade than a second mirror ref for one boolean.
  }, [hideUI])

  // Clipboard shortcuts. Re-bound per selection like the Delete handler, since every
  // one of these closes over `selected`.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      if (isTypingTarget()) return // Ctrl+C in a field is the browser's, not ours
      const key = e.key.toLowerCase()
      if (!["c", "x", "d", "v"].includes(key)) return
      e.preventDefault()
      if (key === "c") copySelected()
      else if (key === "x") cutSelected()
      else if (key === "d") duplicateSelected()
      else pasteAt()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
    // All four close over `selected`; nothing else they touch is unstable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  useEffect(() => {
    const el = canvasRef.current
    const ctx2d = el?.getContext("2d")
    if (!el || !ctx2d) return
    // Aliased to non-nullable types: TS drops narrowing inside the hoisted
    // handler declarations below, and `!` on every use reads worse than this.
    const canvas: HTMLCanvasElement = el
    // `let`, not `const`, for exactly one reason: renderToCanvas points it at an
    // offscreen context for the duration of an export and puts it back. That is what
    // lets PNG export reuse drawObjects/drawStroke/drawNote verbatim instead of
    // growing a second renderer that has to agree with this one forever.
    let ctx: CanvasRenderingContext2D = ctx2d

    // Mutable, not state: a drag would otherwise re-render React 60x/sec for a
    // value nothing but the canvas reads.
    const view: Viewport = { x: 0, y: 0, scale: 1 }
    // Same object for the whole life of this effect — mutated in place below, never
    // reassigned — so pointing the outer ref at it once is enough to keep it live.
    viewRef.current = view
    let size = { w: 0, h: 0 } // CSS px
    let frame = 0 // pending rAF, 0 = none
    /**
     * Design tokens for the things the canvas paints that are CHROME rather than content.
     *
     * Resolved once here rather than per frame: getComputedStyle forces a style
     * resolution and this loop runs at pointer rate. Safe to cache because the page
     * chrome has no runtime theme switch — the board's own light/dark canvas colours are
     * a different system (THEMES in lib/theme.ts) and are looked up per draw as before.
     */
    const paint = canvasTokens()

    /**
     * Tools that place generated geometry by dragging a start and an end.
     *
     * Arrow joined Shapes here rather than growing its own gesture: the drag, the
     * regenerate-from-anchor on every move, the click-to-select-instead-of-stacking
     * guard and the history entry are identical work. All that differs is which kind
     * comes out, which is placedKind's job.
     */
    const isPlacingTool = (t: Tool) => t === "shape" || t === "arrow"
    /**
     * Tools in which a selected object's GRIPS are live — and, because of that, drawn.
     *
     * The resize and rotate handles used to be tested only under `tool === "select"`,
     * while drawSelectionBox painted them whenever anything was selected, in every tool.
     * That made the most natural gesture on this board dead on arrival: placing a sticky
     * leaves the Note tool armed AND the new note selected, so the grips were right
     * there on screen and a corner drag did nothing at all — the press fell through to
     * the note branch, which sees an existing note under the pointer and just re-selects
     * it. Same for a text box, a shape and an arrow.
     *
     * Pen, eraser and pan are excluded on both counts. Those own the whole press for a
     * drag of their own, and letting an 11px grip swallow the start of a stroke or an
     * erase sweep would trade this bug for a worse one — so in those tools the handles
     * are not drawn either, and the selection shows as the dashed outline alone.
     */
    const handlesLive = (t: Tool) =>
      t === "select" || t === "note" || t === "text" || isPlacingTool(t)
    /** The shape a placing drag produces: the armed kind, unless Arrow forced it. */
    const placedKind = (): PlacedShape =>
      toolRef.current === "arrow" ? "arrow" : shapeKindRef.current

    let panning = false
    let last = { x: 0, y: 0 }
    let spaceHeld = false
    let lastCursorSent = 0
    // Where a shape drag started, in world coords. Non-null only while placing a
    // shape, which is what separates that gesture from a freehand pen stroke.
    let shapeAnchor: { x: number; y: number } | null = null
    let dragging: BoardObject | null = null
    // Tracked in WORLD coords, unlike pan's screen-space `last`: the object has to
    // stay under the cursor at any zoom, and a screen delta would drift at scale ≠ 1.
    let dragLast = { x: 0, y: 0 }
    // Where the drag began, so the whole gesture lands in history as one entry rather
    // than one per pointermove.
    let dragStart = { x: 0, y: 0 }
    // The alignment offset currently applied to the dragged object. Subtracted at the
    // top of every move so the snap is recomputed from the pointer's true position
    // rather than compounding — see the note in the drag handler.
    let dragSnap = { x: 0, y: 0 }
    // The guides to paint for the drag in flight. Empty whenever nothing is aligned,
    // which is also what clears them when a gesture ends.
    let guides: Guide[] = []

    const objects = objectsRef.current
    const history = historyRef.current!
    /**
     * Publishes one object to peers. Coalesced to a frame inside useBoardSync, so
     * calling it on every pointermove of a drag costs one message per frame, not one
     * per sample. An id whose object is no longer in `objects` publishes as an erase.
     */
    const touch = (id: string) => touchRef.current(id)
    /**
     * Objects this client is mid-gesture on. Remote updates skip them, so a peer's
     * echo of an older position cannot yank the stroke out from under the cursor.
     */
    const hold = holdRef.current
    let drawing: Stroke | null = null
    let penPos = { x: 0, y: 0 } // running filtered pen position, world coords
    /**
     * Whether Shift was held at ANY point during the current stroke.
     *
     * Reading e.shiftKey only at pointerup looked equivalent and is not: people let go
     * of Shift as they finish the gesture, so a stroke drawn entirely with Shift down
     * could still be released without it and silently skip recognition. Latching it
     * across the whole stroke is what "hold Shift while drawing" actually means.
     */
    let shiftDrawn = false
    /**
     * Live straight-line constraint on the pen — Alt held while drawing.
     *
     * Distinct from both neighbours on purpose: the Shapes tool's Line is a placed
     * shape, and Shift-pen recognition cleans the path up only on release. This one
     * snaps as you draw.
     *
     * Alt because the alternatives are taken — Shift by recognition, Space by pan — and
     * the window-level Ctrl shortcuts already bail on e.altKey, so nothing else wants it.
     *
     * `anchorLen` is how long `points` was when Alt went down, NOT always the stroke's
     * origin. Holding Alt from the first moment makes the whole stroke a line (the case
     * asked for); pressing it midway constrains only from there on, so freehand can
     * resume after release instead of the earlier ink being thrown away.
     */
    let altLine: { anchorLen: number } | null = null
    /**
     * Laser trails. Deliberately NOT in `objects`: a laser is a gesture, not board
     * content, so it never reaches history, never reaches the document, and cannot be
     * selected or erased. Each entry fades itself out and then deletes itself.
     *
     * ponytail: local-only for now. To show peers, publish the points through awareness
     * alongside cursors in useBoardSync — the same ephemeral channel, never the Y.Doc.
     */
    const lasers: { points: number[]; color: string; width: number; a: { v: number } }[] = []
    let laser: (typeof lasers)[number] | null = null
    // Whole objects removed by the current eraser drag, so the whole drag undoes as one
    // step rather than one press per object.
    let erasing = false
    let erased: { object: BoardObject; index: number }[] = []
    /** Previous eraser position, so each move erases the band it swept through. */
    let eraseLast = { x: 0, y: 0 }
    // A resize or rotate in flight. `geom` is the snapshot taken at grab time, so the
    // whole gesture lands in history as one before/after pair.
    let transforming: {
      object: BoardObject
      handle: HandleId
      geom: Geom
      /** Fixed corner a resize scales about, in the object's local frame. */
      anchor: { x: number; y: number }
      /** Pointer angle at grab time, so rotation is relative rather than absolute. */
      grabAngle: number
      startAngle: number
    } | null = null
    /**
     * A connector being dragged out of a "+" grip.
     *
     * Kept OUT of `objects` while in flight, the same way a laser is: it is not board
     * content until you let go, so nothing can select it, erase it or undo it mid-drag.
     * `target` is whatever shape the pointer is currently over, which is both what the
     * highlight draws and what decides whether the finished arrow gets a link.
     */
    let connecting: {
      from: BoardObject
      side: ConnectorSide
      end: { x: number; y: number }
      target: BoardObject | null
    } | null = null
    // Animation progress by object id, deliberately kept out of the objects themselves
    // so it can never leak into a database write or a sync payload. One map for both
    // kinds — it is just "progress", and each kind reads it its own way: strokes
    // through settleStyle, notes through dropStyle. Entries delete themselves when done.
    /**
     * Whether the viewer asked the OS for less motion.
     *
     * Asked FRESH each time rather than captured once: the setting can be changed while
     * a board is open, and a value read at mount would keep animating for the rest of
     * the session. Framer's half of the app is covered by MotionConfig in
     * MotionProvider; the canvas runs on GSAP's own ticker and has to ask for itself.
     *
     * Everything it gates degrades to the FINISHED state, never to a missing one — an
     * object still appears, still disappears, still shows its selection. It just gets
     * there in one frame.
     */
    const reduceMotion = () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    /** Selection outline entrance: quick, because it answers a click. */
    const SELECT_DURATION = 0.12
    const SELECT_EASE = "power2.out"
    /** Extra screen px the outline starts out from the object, before it tightens on. */
    const SELECT_SLACK = 4

    const settling = new Map<string, { t: number; timer?: ReturnType<typeof setTimeout> }>()
    /**
     * Objects mid-EXIT: already spliced out of `objects`, still painted while they fade.
     *
     * They have to be held here rather than left in the array, because everything else —
     * hit testing, bounds, the save payload, what gets published to peers — must treat a
     * deleted object as gone the instant it is deleted. Only the paint lags.
     */
    const dying = new Map<
      string,
      { obj: BoardObject; t: number; timer?: ReturnType<typeof setTimeout> }
    >()
    /** Selection outline entrance: which id it belongs to, and how far in it is. */
    const sel = { id: null as string | null, t: 1 }
    /** Drag lift: which id is held, and how far off the board it is. */
    const lift = { id: null as string | null, t: 0 }
    /** The sticky under an idle pointer, which gets the deeper hover shadow. */
    let hoverNote: string | null = null
    /**
     * Multiplied into every object's alpha as it is painted. 1 for everything except an
     * object on its way out — see the dying pass in drawObjects.
     */
    let fade = 1
    /**
     * Slack on the entry animation's backstop below, so a tween running normally always
     * finishes first and the fallback is dead code on the happy path. `back.out` also
     * overshoots slightly past its nominal duration.
     */
    const SETTLE_GRACE_MS = 400
    // One HTMLImageElement per src, loaded lazily on first paint. A board can hold the
    // same upload more than once (duplicate, paste), and re-decoding on every one of
    // them would be wasted network and CPU for a bitmap that never changes.
    const imageCache = new Map<string, HTMLImageElement>()

    /** The decoded bitmap for `src`, or null while it is still loading. */
    function loadedImage(src: string): HTMLImageElement | null {
      const cached = imageCache.get(src)
      if (cached) return cached.complete && cached.naturalWidth ? cached : null
      const img = new window.Image()
      img.src = src
      // Not yet in the cache when this fires would mean drawing twice for one load —
      // set it first so a repaint mid-decode finds the same element instead of
      // starting a second request.
      imageCache.set(src, img)
      img.onload = () => requestDraw()
      return null
    }

    /**
     * Pointer capture keeps a gesture alive when the cursor leaves the canvas. It is
     * a convenience, never a requirement — so neither call is allowed to throw.
     *
     * Both throw NotFoundError when the pointer is no longer active, which real input
     * produces: a fast click can have the button released before the queued
     * pointerdown handler runs, and a pointercancel (or a release outside the window)
     * retires the pointer early. Unguarded, the throw in the pen branch aborted the
     * handler before the Stroke was even constructed, so the whole gesture vanished.
     */
    const capturePointer = (id: number) => {
      try {
        canvas.setPointerCapture(id)
      } catch {
        // Uncaptured. The gesture still tracks while the cursor stays on the canvas.
      }
    }
    const releasePointer = (id: number) => {
      try {
        canvas.releasePointerCapture(id)
      } catch {
        // Never captured, or already retired. Nothing to release either way.
      }
    }

    const idleCursor = () => (toolRef.current === "select" ? "default" : "crosshair")
    const toWorld = (e: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect()
      return screenToWorld(view, e.clientX - rect.left, e.clientY - rect.top)
    }

    function draw() {
      frame = 0
      const dpr = window.devicePixelRatio || 1

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = THEMES[themeRef.current].bg
      ctx.fillRect(0, 0, size.w, size.h)

      // From here on everything is drawn in world coordinates and inherits pan/zoom.
      ctx.setTransform(
        view.scale * dpr,
        0,
        0,
        view.scale * dpr,
        view.x * dpr,
        view.y * dpr,
      )
      drawGrid()
      drawObjects()
      drawSectionAdds()
      drawLasers()
      drawSelection()
      drawConnecting()
      // Above the selection outline, below the cursors: a guide has to be visible over
      // the object it is aligning, and must not be what a peer's pointer hides behind.
      drawGuides()
      drawCursors()
      // Last, and above everything: a pin is the app pointing at the board, and one
      // hidden behind a shape is one nobody can click.
      drawPins()
      // The textarea is positioned in screen space, so it has to be re-placed whenever
      // the transform it sits over changes. Doing it here rather than in a React effect
      // keeps pan and zoom off the render path entirely.
      syncEditor()
    }

    /**
     * Where each visible pin currently sits, in SCREEN coordinates.
     *
     * Recomputed by drawPins every frame and read by the pointer handler, so the hit test
     * runs against exactly the pixels that were painted — deriving it twice is how a pin
     * ends up clickable somewhere other than where it looks.
     */
    let pinHits: { pin: Pin; screenX: number; screenY: number }[] = []

    /**
     * Numbered pins for every open thread, plus the selected one even if resolved.
     *
     * Drawn in screen space with the transform reset, unlike cursors: a pin is interface
     * rather than content, so it holds its size at any zoom. Resolved threads drop off the
     * board entirely — the panel is where you go to find them again — otherwise a board
     * with a year of settled discussion is unusable.
     */
    function drawPins() {
      pinHits = []
      if (!commentsOpenRef.current) return

      const selected = selectedThreadRef.current
      const dpr = window.devicePixelRatio || 1
      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = `600 ${Math.round(PIN_SIZE * 0.42)}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"

      for (const pin of numberThreads(threadsRef.current)) {
        if (pin.resolved && pin.id !== selected) continue
        const s = worldToScreen(view, pin.x, pin.y)
        // Off-screen pins are skipped rather than drawn outside the viewport, so a board
        // with hundreds of threads costs only what is visible.
        if (s.x < -PIN_SIZE || s.y < -PIN_SIZE || s.x > size.w + PIN_SIZE || s.y > size.h + PIN_SIZE) {
          continue
        }
        pinHits.push({ pin, screenX: s.x, screenY: s.y })

        tracePin(ctx, s.x, s.y, PIN_SIZE)
        // From the stylesheet, not a literal — see lib/tokens.ts. This value was
        // hardcoded to the old accent and went stale the moment the palette moved.
        ctx.fillStyle = pin.resolved ? paint.muted : paint.accent
        ctx.fill()
        // A white keyline so the marker survives being dropped on a dark shape, a photo,
        // or the black canvas — the fill alone cannot be trusted against unknown content.
        ctx.strokeStyle = pin.id === selected ? "#ffffff" : "rgba(255,255,255,0.85)"
        ctx.lineWidth = pin.id === selected ? 2.5 : 1.5
        ctx.stroke()

        ctx.fillStyle = "#ffffff"
        ctx.fillText(String(pin.n), s.x + PIN_SIZE / 2, s.y - PIN_SIZE / 2 + 1)
      }
      ctx.restore()
    }

    // Peers' cursors, drawn in world space so they stay pinned to the board through
    // pan and zoom. Sizes divide by scale to hold a constant size on screen.
    function drawCursors() {
      // A local view preference, so it hides them here rather than unsubscribing: the
      // presence data still arrives and the header avatars still show who is on the
      // board. You stop seeing their pointers, not who they are.
      if (hideCursorsRef.current) return
      const cursors = cursorsRef.current
      if (!cursors.length) return
      const u = 1 / view.scale

      ctx.save()
      ctx.textBaseline = "middle"
      ctx.font = `${11 * u}px ui-sans-serif, system-ui, sans-serif`
      for (const c of cursors) {
        ctx.fillStyle = c.color
        ctx.beginPath()
        ctx.moveTo(c.x, c.y)
        ctx.lineTo(c.x + 11 * u, c.y + 4.5 * u)
        ctx.lineTo(c.x + 4.5 * u, c.y + 6 * u)
        ctx.lineTo(c.x + 3 * u, c.y + 12 * u)
        ctx.closePath()
        ctx.fill()

        const pad = 5 * u
        const w = ctx.measureText(c.name).width + pad * 2
        const h = 16 * u
        ctx.beginPath()
        ctx.roundRect(c.x + 11 * u, c.y + 11 * u, w, h, 4 * u)
        ctx.fill()
        ctx.fillStyle = "#ffffff"
        ctx.fillText(c.name, c.x + 11 * u + pad, c.y + 11 * u + h / 2)
      }
      ctx.restore()
    }

    /**
     * Glues the text editor over its note, in screen space.
     *
     * Called from draw(), so it follows pan and zoom without pushing `view` into React
     * at frame rate. The font scales with the zoom so what you type is laid out exactly
     * where the canvas will paint it once you blur.
     */
    function syncEditor() {
      const el = textareaRef.current
      if (!el) return
      const o = objects.find((x) => x.id === editingIdRef.current)
      if (!o) return
      const box = textBoxFor(o, themeRef.current)
      if (!box) return

      // Offset by the canvas rect rather than assuming it sits at the viewport origin —
      // the textarea is position:fixed, so the two have to agree on an origin.
      const rect = canvas.getBoundingClientRect()
      const s = view.scale
      // Rotation is rigid, so placing the box's own top-left at its rotated world
      // position and then spinning about that same corner gives the identical result to
      // rotating the whole box about the object's centre — and needs no origin maths.
      const a = o.angle ?? 0
      el.style.transformOrigin = "top left"
      el.style.transform = a ? `rotate(${a}rad)` : ""
      // Width and padding split the same way the painter splits them, so the editor
      // wraps at the identical inner width and the words do not reflow on blur.
      el.style.width = `${box.w * s}px`
      el.style.paddingLeft = `${box.indent * s}px`
      el.style.boxSizing = "border-box"
      el.style.fontSize = `${box.font * s}px`
      el.style.lineHeight = `${box.lineHeight * s}px`
      el.style.color = box.ink
      el.style.textAlign = box.align
      el.style.fontWeight = box.marks.bold ? "600" : "400"
      el.style.fontStyle = box.marks.italic ? "italic" : "normal"
      el.style.textDecoration = box.marks.underline ? "underline" : "none"

      // Local top of the text block, before rotation.
      let localTop = box.y
      if (box.valign === "top") {
        el.style.height = `${box.h * s}px`
      } else {
        // Vertical centring, which a textarea cannot do for itself. The content height
        // is measured through the SAME wrap the canvas uses rather than by reading
        // scrollHeight — a layout read here would force a reflow on every pan frame,
        // and this way the editor and the painted text agree by construction.
        ctx.font = fontString(box.font, TEXT_FONT_FAMILY, box.marks)
        const lines = wrapText(el.value, box.w - box.indent, (t) => ctx.measureText(t).width)
        const content = Math.min(Math.max(lines.length, 1) * box.lineHeight, box.h)
        el.style.height = `${content * s}px`
        localTop = box.y + (box.h - content) / 2
      }

      // Rotation is rigid, so placing the block's own top-left at its rotated world
      // position and then spinning about that same corner gives the identical result to
      // rotating the whole block about the object's centre — and needs no origin maths.
      const tl = toWorldPoint(o, box.x, localTop)
      el.style.left = `${rect.left + tl.x * s + view.x}px`
      el.style.top = `${rect.top + tl.y * s + view.y}px`
    }

    /**
     * Paints an object's text. Shared by notes and labelled shapes, so the two can
     * never drift apart in wrapping, font or alignment.
     */
    function drawLabel(o: BoardObject) {
      const editingThis = o.id === editingIdRef.current
      const text = textOf(o)
      // A bulleted object still paints its BULLETS while its text is being edited: the
      // textarea is transparent and renders no markers of its own, so without this the
      // dots blink out for the whole edit and reappear on blur. The text itself is
      // still skipped — the live textarea sits exactly here, and painting it too would
      // double it up, one copy a frame behind the other.
      if (!text && !editingThis) return
      const box = textBoxFor(o, themeRef.current)
      if (!box) return
      if (editingThis && !box.marks.list) return

      const b = objectBounds(o)
      ctx.save()
      // Clip so more text than fits crops at the object's edge rather than spilling
      // onto the board.
      ctx.beginPath()
      ctx.rect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY)
      ctx.clip()
      ctx.font = fontString(box.font, TEXT_FONT_FAMILY, box.marks)
      ctx.fillStyle = box.ink
      ctx.textBaseline = "top"
      ctx.textAlign = box.align

      // The bullet column is taken out of the wrap width, not added on top of it, or
      // the text would run past the edge it is inset from.
      const inner = box.w - box.indent
      const source = editingThis ? textareaRef.current?.value ?? text : text
      const lines = wrapText(source, inner, (t) => ctx.measureText(t).width)
      const top =
        box.valign === "middle"
          ? box.y + (box.h - lines.length * box.lineHeight) / 2
          : box.y
      const left = box.x + box.indent
      const x =
        box.align === "center" ? left + inner / 2 : box.align === "right" ? left + inner : left

      lines.forEach((line, i) => {
        const ly = top + i * box.lineHeight
        if (box.marks.list) {
          // Bullets hang in the indent column at the box's own left edge, so they line
          // up with each other whatever the text alignment does inside.
          const prev = ctx.textAlign
          ctx.textAlign = "left"
          ctx.fillText(BULLET, box.x, ly)
          ctx.textAlign = prev
        }
        if (editingThis) return // bullets only; the textarea is drawing the words
        ctx.fillText(line, x, ly)

        if (box.marks.underline) {
          // Measured per line rather than ruled across the box: an underline that runs
          // past the last word reads as a strikethrough on the empty half of a centred
          // line.
          const wLine = ctx.measureText(line).width
          if (!wLine) return
          const x0 =
            box.align === "center" ? x - wLine / 2 : box.align === "right" ? x - wLine : x
          // Below the baseline of a top-baseline draw, and scaled off the font so it
          // stays proportional rather than hairline at 40px.
          const uy = ly + box.font * 1.08
          ctx.fillRect(x0, uy, wLine, Math.max(box.font * 0.06, 0.5))
        }
      })
      ctx.restore()
    }

    // Drawn in world space like everything else, so it tracks the object through pan
    // and zoom for free. Widths are divided by scale to stay constant on screen.
    /**
     * The "+" at the foot of each column.
     *
     * Drawn after the objects so it sits on top of its own lane, and sized in SCREEN px
     * converted to world units so it stays the same size at any zoom — the same rule the
     * selection handles and connector grips follow.
     *
     * Hidden in read-only mode and while a tool that draws is armed: a "+" you cannot
     * press, or that competes with the drag you were about to start, is worse than none.
     */
    function drawSectionAdds() {
      if (readOnlyRef.current) return
      if (toolRef.current !== "select") return
      const size = ADD_SIZE / view.scale
      for (const lane of sectionsOf(objects)) {
        const a = addBoxFor(lane, size)
        const cx = a.x + a.w / 2
        const cy = a.y + a.h / 2
        const r = size / 2
        const arm = size * 0.26

        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fillStyle = paint.addFill
        ctx.fill()
        ctx.strokeStyle = paint.addEdge
        ctx.lineWidth = 1 / view.scale
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(cx - arm, cy)
        ctx.lineTo(cx + arm, cy)
        ctx.moveTo(cx, cy - arm)
        ctx.lineTo(cx, cy + arm)
        ctx.strokeStyle = paint.addInk
        ctx.lineWidth = 1.6 / view.scale
        ctx.lineCap = "round"
        ctx.stroke()
        ctx.restore()
      }
    }

    function drawSelection() {
      const s = objects.find((x) => x.id === selectedIdRef.current)
      if (!s) {
        // Nothing selected: reset so the NEXT selection animates in rather than
        // inheriting a finished tween from the last one.
        sel.id = null
        return
      }
      /**
       * Started from the draw rather than from a selection effect, because this is the
       * one place that already knows both which object is selected and that it is about
       * to be painted. A selection that changes twice before a frame runs animates once,
       * which is the correct number of times.
       */
      if (sel.id !== s.id) {
        sel.id = s.id
        // NOT an early return: the outline still has to be painted on this very frame,
        // it just skips straight to full strength.
        if (reduceMotion()) sel.t = 1
        else {
        sel.t = 0
        gsap.to(sel, {
          t: 1,
          duration: SELECT_DURATION,
          ease: SELECT_EASE,
          overwrite: true,
          onUpdate: requestDraw,
          onComplete: requestDraw,
        })
        }
      }
      // A stroke needs two points before it has a box worth outlining; a note always
      // has one.
      if (s.type === "stroke" && s.points.length < 2) return
      // The outline rides the lift with its object. Without this the object scales to
      // 102% under the drag and its own selection box stays at 100%, so the thing you
      // are holding visibly grows out of its own outline.
      const held = lift.id === s.id && lift.t > 0 ? liftStyle(lift.t) : null
      ctx.save()
      if (held) scaleAbout(s, held.scale)
      // Drawn inside the object's own rotation, so the box and its handles turn with it
      // rather than snapping back to an axis-aligned cage.
      withRotation(s, () => drawSelectionBox(s))
      ctx.restore()
    }

    function drawSelectionBox(s: BoardObject) {
      const b = objectBounds(s)
      // The pad CLOSES as the outline comes in: it starts a few px wide of the object and
      // tightens onto it, which reads as the selection grabbing hold. Paired with the
      // alpha ramp below — either alone looks like a glitch rather than a movement.
      const pad = (6 + SELECT_SLACK * (1 - sel.t)) / view.scale
      ctx.save()
      ctx.strokeStyle = THEMES[themeRef.current].stroke
      ctx.globalAlpha = 0.45 * sel.t
      ctx.lineWidth = 1 / view.scale
      ctx.setLineDash([4 / view.scale, 4 / view.scale])
      ctx.strokeRect(
        b.minX - pad,
        b.minY - pad,
        b.maxX - b.minX + pad * 2,
        b.maxY - b.minY + pad * 2,
      )
      ctx.restore()

      // A locked object gets no handles — it cannot be transformed, so offering grips
      // that do nothing would be a lie. An attached connector gets none for the same
      // reason: its geometry is rewritten from its endpoints every frame, so a resize or
      // rotate would be undone before you saw it.
      //
      // And none in a tool that would not honour them: the same rule, applied to the
      // one case that used to break it. See handlesLive — the dashed outline still says
      // what is selected, it just stops advertising a grip that press would ignore.
      if (s.locked || isLinked(s) || !handlesLive(toolRef.current)) return

      const u = 1 / view.scale // world units per screen px
      const h = handlesFor(s, ROTATE_DIST * u)
      const size = HANDLE_SIZE * u

      ctx.save()
      // The grips arrive with the box, not before it.
      ctx.globalAlpha = sel.t
      ctx.fillStyle = THEMES[themeRef.current].bg
      ctx.strokeStyle = THEMES[themeRef.current].stroke
      ctx.lineWidth = 1.25 * u

      // Stalk, then the rotate grip above the top edge.
      ctx.globalAlpha = 0.55
      ctx.beginPath()
      ctx.moveTo((b.minX + b.maxX) / 2, b.minY - pad)
      ctx.lineTo(h.rotate.x, h.rotate.y)
      ctx.stroke()
      ctx.globalAlpha = 1

      ctx.beginPath()
      ctx.arc(h.rotate.x, h.rotate.y, size * 0.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      // Square grips at the four corners, matching the reference.
      for (const id of ["nw", "ne", "se", "sw"] as const) {
        const p = h[id]
        ctx.beginPath()
        ctx.rect(p.x - size / 2, p.y - size / 2, size, size)
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()

      drawConnectGrips(s)
    }

    /**
     * The four "+" grips a connector is dragged out of.
     *
     * Only on things with an outline worth pointing an arrow at — isLabelable is already
     * exactly "a note or a shape", so a freehand scribble does not sprout four of these.
     * Drawn inside the object's rotation like every other grip, so they turn with it.
     */
    function drawConnectGrips(o: BoardObject) {
      if (!isLabelable(o)) return
      const u = 1 / view.scale
      const sides = connectorSidesFor(o, CONNECT_DIST * u)
      const r = CONNECT_SIZE * u

      ctx.save()
      ctx.fillStyle = THEMES[themeRef.current].bg
      ctx.strokeStyle = THEMES[themeRef.current].stroke
      ctx.lineWidth = 1.25 * u
      ctx.lineCap = "butt"
      // Chrome-level UI, not board content: it never inherits a drawn object's style.
      ctx.setLineDash([])
      for (const side of CONNECTOR_SIDES) {
        const p = sides[side]
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.globalAlpha = 0.9
        ctx.fill()
        ctx.stroke()
        // The plus itself, at 55% of the radius so it reads as a glyph inside the disc
        // rather than filling it edge to edge.
        ctx.globalAlpha = 1
        const arm = r * 0.55
        ctx.beginPath()
        ctx.moveTo(p.x - arm, p.y)
        ctx.lineTo(p.x + arm, p.y)
        ctx.moveTo(p.x, p.y - arm)
        ctx.lineTo(p.x, p.y + arm)
        ctx.stroke()
      }
      ctx.restore()
    }

    /**
     * The connector being dragged, plus a halo on whatever it would attach to.
     *
     * Painted from the same connectorPoints the finished arrow is built from, so the
     * preview cannot drift from the result.
     */
    function drawConnecting() {
      if (!connecting) return
      const u = 1 / view.scale
      const start = anchorOf(connecting.from, connecting.side)

      ctx.save()
      ctx.setLineDash([])
      if (connecting.target) {
        const b = objectBounds(connecting.target)
        const pad = 4 * u
        ctx.strokeStyle = THEMES[themeRef.current].stroke
        ctx.globalAlpha = 0.5
        ctx.lineWidth = 2 * u
        ctx.strokeRect(
          b.minX - pad,
          b.minY - pad,
          b.maxX - b.minX + pad * 2,
          b.maxY - b.minY + pad * 2,
        )
        ctx.globalAlpha = 1
      }
      ctx.strokeStyle = penColorRef.current
      ctx.lineWidth = BRUSHES.pen.width * u
      ctx.lineCap = "butt"
      ctx.lineJoin = "miter"
      ctx.beginPath()
      polylinePath(ctx, connectorPoints(start.x, start.y, connecting.end.x, connecting.end.y))
      ctx.stroke()
      ctx.restore()
    }

    /**
     * Which "+" grip the pointer is over, if any.
     *
     * Screen-space like hitHandle, and called BEFORE it: the north grip and the rotate
     * grip share the top-centre line, so something has to win the band between them.
     * Giving it to the "+" leaves the rotate grip's own centre reachable, whereas the
     * other order would make the north grip unreachable at some zooms.
     */
    function hitConnectSide(o: BoardObject, wx: number, wy: number): ConnectorSide | null {
      if (!isLabelable(o)) return null
      const u = 1 / view.scale
      const sides = connectorSidesFor(o, CONNECT_DIST * u)
      for (const side of CONNECTOR_SIDES) {
        const p = toWorldPoint(o, sides[side].x, sides[side].y)
        if (Math.hypot(wx - p.x, wy - p.y) * view.scale <= CONNECT_HIT) return side
      }
      return null
    }

    /**
     * Which handle, if any, the pointer is over.
     *
     * Compared in SCREEN space: handles hold a constant size however far you are zoomed,
     * so a world-space tolerance would be unusably tight zoomed out and enormous zoomed
     * in. Handle positions are local, so they rotate into world space first.
     */
    function hitHandle(o: BoardObject, wx: number, wy: number): HandleId | null {
      const u = 1 / view.scale
      const h = handlesFor(o, ROTATE_DIST * u)
      for (const id of ["rotate", "nw", "ne", "se", "sw"] as const) {
        const p = toWorldPoint(o, h[id].x, h[id].y)
        if (Math.hypot(wx - p.x, wy - p.y) * view.scale <= HANDLE_HIT) return id
      }
      return null
    }

    function drawGrid() {
      const style = gridStyleRef.current
      if (style === "none") return

      const tl = screenToWorld(view, 0, 0)
      const br = screenToWorld(view, size.w, size.h)

      // Coarsen as you zoom out, or the marks converge into a solid smear.
      let step = GRID_SPACING
      while (step * view.scale < 12) step *= 4

      const r = 1 / view.scale // hairline at any zoom — the context is scaled
      const first = (v: number) => Math.floor(v / step) * step

      if (style === "line") {
        // One path for every line rather than a stroke() per line: at a 40-unit step a
        // zoomed-out board is hundreds of lines, and each stroke() is its own rasteriser
        // pass. Same reason the dots below are fillRect and not arc().
        ctx.strokeStyle = THEMES[themeRef.current].dot
        ctx.lineWidth = r
        ctx.beginPath()
        for (let x = first(tl.x); x <= br.x; x += step) {
          ctx.moveTo(x, tl.y)
          ctx.lineTo(x, br.y)
        }
        for (let y = first(tl.y); y <= br.y; y += step) {
          ctx.moveTo(tl.x, y)
          ctx.lineTo(br.x, y)
        }
        ctx.stroke()
        return
      }

      ctx.fillStyle = THEMES[themeRef.current].dot
      for (let x = first(tl.x); x <= br.x; x += step) {
        for (let y = first(tl.y); y <= br.y; y += step) {
          ctx.fillRect(x - r / 2, y - r / 2, r, r)
        }
      }
    }

    /**
     * The alignment guides for the drag in flight, if any.
     *
     * Screen furniture, like the selection outline and the peer cursors: drawn every
     * frame from a variable the drag handler refreshes, never part of the document, and
     * deliberately absent from renderToCanvas so they cannot leak into an export.
     */
    function drawGuides() {
      if (!guides.length) return
      const u = 1 / view.scale

      ctx.save()
      // The selection accent, so a guide reads as "this is the app talking", the same as
      // the handles do — not as something drawn on the board.
      ctx.strokeStyle = paint.guide
      ctx.lineWidth = u
      // Dashed, because a solid hairline at this weight is hard to tell from a thin
      // stroke somebody actually drew.
      ctx.setLineDash([4 * u, 4 * u])
      ctx.beginPath()
      for (const g of guides) {
        if (g.axis === "x") {
          ctx.moveTo(g.at, g.from)
          ctx.lineTo(g.at, g.to)
        } else {
          ctx.moveTo(g.from, g.at)
          ctx.lineTo(g.to, g.at)
        }
      }
      ctx.stroke()
      ctx.restore()
    }

    // ponytail: repaints every object every frame. When that stops being fast enough,
    // cache finished objects to an offscreen canvas and composite the live one on top.
    function drawObjects() {
      // The single invalidation point for attached arrows. Every mutation on this board
      // — drag, resize, rotate, undo, redo, paste, the property panel — ends in
      // requestDraw(), so re-routing here covers all of them at one call site instead of
      // needing a hook bolted onto each mutator (and a tenth one forgotten).
      rerouteAll(objects)
      for (const o of objects) {
        // The lift is a TRANSFORM around the object, not a property of it: nothing about
        // the stored geometry changes while you hold it, so a drag that is interrupted
        // (tab hidden, pointer lost) can never leave an object 2% too big on the board.
        const held = lift.id === o.id && lift.t > 0 ? liftStyle(lift.t) : null
        if (held) {
          ctx.save()
          scaleAbout(o, held.scale)
          /**
           * The shadow is cast by a solid stand-in BEHIND the note, never by the note
           * itself.
           *
           * ctx.shadowBlur applies to every path drawn while it is set — so setting it
           * and then calling drawNote puts an 18px drop shadow under the card, under
           * every line of its text, and under its label. That is a smudge, not a lift.
           * Filling the bounds once, in the board's own background colour, casts exactly
           * one shadow; the note is then painted over the top and hides the stand-in.
           *
           * Notes only. A transparent PNG would gain a visible opaque rectangle, and a
           * pen stroke has no solid body to cast from — those lift by scale alone.
           */
          if (o.type === "note") {
            withRotation(o, () => {
              const b = objectBounds(o)
              ctx.save()
              ctx.shadowColor = `rgba(0,0,0,${held.alpha})`
              // Screen px, converted — a shadow specified in world units doubles when
              // you zoom in, and an object dragged at 4x would trail a black cloud.
              ctx.shadowBlur = held.blur / view.scale
              ctx.shadowOffsetY = held.blur / 3 / view.scale
              ctx.fillStyle = THEMES[themeRef.current].bg
              ctx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY)
              ctx.restore()
            })
          }
        }
        // Shapes and arrows land like a sticky does; freehand ink keeps its settle alone.
        const landing = o.type === "stroke" && o.shape ? settling.get(o.id) : undefined
        if (landing) {
          ctx.save()
          scaleAbout(o, dropStyle(landing.t, SHAPE_DROP_SCALE).scale)
        }
        withRotation(o, () =>
          o.type === "note" ? drawNote(o) : o.type === "image" ? drawImage(o) : drawStroke(o),
        )
        if (landing) ctx.restore()
        if (held) ctx.restore()
      }

      // AFTER the live objects, so something on its way out passes over what remains
      // rather than under it — it was on top when you deleted it.
      for (const d of dying.values()) {
        // Back in `objects` means the delete was undone while the fade was still
        // playing — Ctrl+Z inside 150ms, which is an easy thing to do by accident.
        // Without this the restored object and its own ghost are painted on top of each
        // other for the rest of the fade. Guarding HERE rather than in the undo handler
        // covers every route an id can come back by: undo, redo, paste, and a peer
        // re-adding it over the wire.
        if (objects.some((o) => o.id === d.obj.id)) continue
        const { scale, alpha } = dieStyle(d.t)
        ctx.save()
        fade = alpha
        scaleAbout(d.obj, scale)
        withRotation(d.obj, () =>
          d.obj.type === "note"
            ? drawNote(d.obj as Note)
            : d.obj.type === "image"
              ? drawImage(d.obj as ImageObject)
              : drawStroke(d.obj as Stroke),
        )
        fade = 1
        ctx.restore()
      }
      ctx.globalAlpha = 1
    }

    /**
     * Raises or lowers the drag lift.
     *
     * Tweened both ways rather than snapped: the lift going on instantly is a pop, and
     * the lift going off instantly is the object slapping back onto the board at the end
     * of every drag. `lift.id` is kept through the drop so the settle still has something
     * to paint; the next grab overwrites it.
     */
    function liftTo(id: string, to: 0 | 1) {
      // No lift at all, rather than an instant one: a 2% jump on grab and a snap back on
      // drop is more motion than the tween it replaces, not less.
      if (reduceMotion()) return
      lift.id = id
      gsap.to(lift, {
        t: to,
        duration: LIFT_DURATION,
        ease: LIFT_EASE,
        overwrite: true, // grabbing again mid-release must not fight the old tween
        onUpdate: requestDraw,
        onComplete: requestDraw,
      })
    }

    /**
     * Scales an object about its own centre, in world space.
     *
     * About the CENTRE, not the origin: scaling around 0,0 would slide an object toward
     * the top-left of the board by however far it happens to sit from it — the further
     * out on the canvas, the bigger the jump. Caller owns the save/restore.
     */
    function scaleAbout(o: BoardObject, scale: number) {
      if (scale === 1) return
      const b = objectBounds(o)
      const cx = (b.minX + b.maxX) / 2
      const cy = (b.minY + b.maxY) / 2
      ctx.translate(cx, cy)
      ctx.scale(scale, scale)
      ctx.translate(-cx, -cy)
    }

    /**
     * Plays an object out, then forgets it. Call AFTER it has left `objects`.
     *
     * Same wall-clock backstop as `animate`, for the same reason: gsap advances from
     * requestAnimationFrame, and in a tab that gets no frames the tween never completes.
     * Here that would leave a deleted object painted on the board forever, which is a
     * considerably worse failure than a skipped animation — so the timer removes it
     * whether or not a single frame ever ran.
     */
    function fadeOut(obj: BoardObject) {
      // Nothing is added to `dying`, so the object is gone the frame it is deleted.
      if (reduceMotion()) return
      const state: { obj: BoardObject; t: number; timer?: ReturnType<typeof setTimeout> } = {
        obj,
        t: 1,
      }
      dying.set(obj.id, state)
      state.timer = setTimeout(() => {
        if (dying.delete(obj.id)) requestDraw()
      }, DIE_DURATION * 1000 + SETTLE_GRACE_MS)
      gsap.to(state, {
        t: 0,
        duration: DIE_DURATION,
        ease: DIE_EASE,
        onUpdate: requestDraw,
        onComplete: () => {
          clearTimeout(state.timer)
          dying.delete(obj.id)
          requestDraw()
        },
      })
    }

    /**
     * Runs `fn` with the canvas rotated into the object's frame.
     *
     * The single place rotation is applied. Everything inside — geometry, labels, the
     * clip region, the selection outline and its handles — keeps working in unrotated
     * local coordinates and comes out correctly oriented for free.
     */
    function withRotation(o: BoardObject, fn: () => void) {
      const a = o.angle ?? 0
      if (!a) {
        fn()
        return
      }
      const c = centerOf(o)
      ctx.save()
      ctx.translate(c.x, c.y)
      ctx.rotate(a)
      ctx.translate(-c.x, -c.y)
      fn()
      ctx.restore()
    }

    /** Laser trails, painted above the document because they are never part of it. */
    function drawLasers() {
      if (!lasers.length) return
      ctx.save()
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      // A laser has no style of its own, so it would otherwise inherit the dash left by
      // whichever object was painted last.
      ctx.setLineDash([])
      for (const l of lasers) {
        if (l.points.length < 4) continue
        ctx.globalAlpha = l.a.v * BRUSHES.laser.alpha
        ctx.strokeStyle = l.color
        ctx.lineWidth = l.width
        ctx.beginPath()
        tracePath(ctx, l.points)
        ctx.stroke()
      }
      ctx.restore()
    }

    function drawStroke(s: Stroke) {
      // Per-stroke color again, now that it is editable. New strokes still start
      // at the theme's ink, but a stroke drawn in one theme keeps its color when
      // you switch — recoloring it is the user's call, via the property panel.
      const ink = s.color
      // Clamped: a shape's drop overshoots past 1, and a globalAlpha above 1 is not
      // clamped by the canvas but IGNORED, leaving whatever alpha was set last.
      const t = s === drawing ? 0 : Math.min(1, settling.get(s.id)?.t ?? 1)
      const { width, alpha: settled } = settleStyle(t, s.width)
      const alpha = settled * fade
      const b = brushOf(s.brush)
      // Multiplied into the settle rather than replacing it, so a pencil still lands
      // the same way a pen does — just fainter.
      ctx.globalAlpha = alpha * b.alpha

      if (s.points.length === 2) {
        // A click with no drag is a dot, not a zero-length line. Cap and join are
        // irrelevant to a filled arc, which is why this branch skips strokePath.
        ctx.fillStyle = ink
        ctx.beginPath()
        ctx.arc(s.points[0], s.points[1], pressureWidth(width, s.pressures?.[0] ?? 1) / 2, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.strokeStyle = ink
        ctx.lineWidth = width
        // Exact geometry and sharp joins for shapes, smoothing for freehand ink —
        // the choice lives in strokePath so it stays under test.
        strokePath(ctx, s)
        // Fill BEFORE stroking, so the outline paints on top of its own interior. The
        // other order lets the fill cover the inner half of every line, which reads as
        // a shape whose outline is half as thick as the width says.
        /**
         * Block arrows are SOLID, always.
         *
         * Only the LEGACY ones reach here — boards seeded while the arrow was a shape
         * carry a closed polygon outlining a shaft and head, and stroking that drew a
         * thin hollow outline of an arrow rather than an arrow. Filling by default rather
         * than at placement time is what makes those existing objects come out solid; an
         * explicit fill still wins, so recolouring keeps working.
         *
         * A straight arrow placed by the arrow tool is two endpoints and is never filled
         * — it is a line, and its head is painted below.
         */
        const blockArrow = isBlockArrow(s.shape, s.points)
        const fill = s.fill ?? (blockArrow ? ink : null)
        // Geometry decides, not the kind — see hasInterior.
        if (fill && hasInterior(s.shape, s.points)) {
          ctx.fillStyle = fill
          ctx.fill()
        }
        // A filled shape may deliberately have no outline at all — see MIN_WIDTH.
        if (width > 0) {
          // Two exclusions, both because the uniform path does something this one
          // cannot. A SHAPE is sharp geometry: variableWidthStroke traces quadratics,
          // so routing a rectangle through it would round every corner — the exact
          // regression strokePath exists to prevent. A DASHED stroke restarts its
          // pattern on every beginPath, so per-segment stroking turns one dashed line
          // into a sample-length stipple. Neither ever carries pressures today; the
          // guard is here so that stays true if something later sets them.
          const pressures = s.shape || s.dash ? null : pressuresOf(s)
          if (pressures) variableWidthStroke(ctx, s.points, pressures, width)
          else ctx.stroke()
        }

        /**
         * The arrowhead: one small solid triangle, on the END point only.
         *
         * Painted here rather than baked into `points` so the arrow stays a line for
         * every other purpose — see arrowHead. Solid regardless of the stroke's dash or
         * width, because a head is a cap on the line, not a continuation of it; a dashed
         * arrow with a dashed head reads as a broken shape.
         */
        if (isStraightArrow(s)) {
          const [ax, ay, bx2, by2] = s.points
          const h = arrowHead(ax, ay, bx2, by2)
          if (h) {
            ctx.save()
            ctx.setLineDash([])
            ctx.fillStyle = ink
            ctx.beginPath()
            ctx.moveTo(h.left.x, h.left.y)
            ctx.lineTo(h.tip.x, h.tip.y)
            ctx.lineTo(h.right.x, h.right.y)
            ctx.closePath()
            ctx.fill()
            ctx.restore()
          }
        }

        // Texture passes. The grain stays at a uniform width even on a pressure
        // stroke: it is scattered offset copies, not the stroke's body, and tapering
        // it would mean N passes x N segments of stroke() calls to make a difference
        // nobody looking at chalk can see.
        // ponytail: if a light pencil stroke ever reads too grainy at its thin end,
        // scale tx.width by the same pressureWidth the body uses.
        // Offsets are seeded from createdAt so the grain is baked into
        // the stroke — seeding from Math.random would re-roll every repaint and make it
        // crawl as you pan. Each pass shifts the seed, or they would all land on the
        // same offsets and stack into one thicker line instead of scattering.
        if (b.texture) {
          const tx = b.texture
          ctx.globalAlpha = alpha * b.alpha * tx.alpha
          ctx.lineWidth = width * tx.width
          // Grain is scattered offset copies of the same path — dashing them too breaks
          // every pass at different points and reads as noise rather than as a dashed
          // line. The outline above carries the style; the texture stays solid.
          ctx.setLineDash([])
          for (let pass = 0; pass < tx.passes; pass++) {
            ctx.beginPath()
            grainPath(ctx, s.points, s.createdAt + pass * PASS_SEED_STEP, tx.offset * width)
            ctx.stroke()
          }
          ctx.globalAlpha = alpha * b.alpha
        }

        // After the outline, so a label always reads on top of its own shape. Inherits
        // the settle alpha above, so a fresh shape and its text fade in together.
        drawLabel(s)
      }
    }

    function drawNote(n: Note) {
      const { scale, alpha: dropped } = dropStyle(settling.get(n.id)?.t ?? 1)
      const alpha = dropped * fade

      ctx.save()
      ctx.globalAlpha = alpha
      // Scale about the note's own centre, so it lands in place rather than growing
      // out of its top-left corner.
      if (scale !== 1) {
        const cx = n.x + n.w / 2
        const cy = n.y + n.h / 2
        ctx.translate(cx, cy)
        ctx.scale(scale, scale)
        ctx.translate(-cx, -cy)
      }

      // A text box is the words and nothing else — no card, no edge. Everything below
      // this point (drop animation, label, rotation, selection) is shared with a
      // sticky, which is the whole reason Text reuses Note.
      if (!n.bare) {
        ctx.beginPath()
        ctx.roundRect(n.x, n.y, n.w, n.h, NOTE_RADIUS)
        ctx.fillStyle = n.color
        // Shadow blur/offset ignore the transform, so they are in DEVICE px: scale by
        // dpr for CSS px, and they stay constant under zoom. Fill-only, so the text and
        // the edge stroke below cast nothing.
        const dpr = window.devicePixelRatio || 1
        for (const sh of hoverNote === n.id ? NOTE_SHADOW_HOVER : NOTE_SHADOW) {
          ctx.shadowColor = `rgba(0,0,0,${sh.alpha})`
          ctx.shadowBlur = sh.blur * dpr
          ctx.shadowOffsetY = sh.y * dpr
          ctx.fill()
        }
        ctx.shadowColor = "transparent"
      // The only theme-dependent thing about a note, and it isn't: a fixed translucent
      // black edge disappears against the dark board where the fill already separates
      // itself, and saves a pale note from bleeding into the light one.
        ctx.strokeStyle = NOTE_BORDER
        ctx.lineWidth = 1 / view.scale
        ctx.stroke()
      }

      drawLabel(n)
      ctx.restore()
    }

    /**
     * An uploaded image, drawn into its box.
     *
     * No card, no label, no settle bounce — an image is placed via `place()` the same
     * way paste and duplicate are, and neither of those animates either. Stretched to
     * fill x/y/w/h exactly, the same contract every other resizable object on this
     * board has — the resize handles move the box, not a crop inside it.
     */
    function drawImage(im: ImageObject) {
      const img = loadedImage(im.src)
      if (!img) return // still decoding; onload's requestDraw repaints once it is ready
      ctx.drawImage(img, im.x, im.y, im.w, im.h)
    }

    /**
     * Coalesces every event in a frame into one paint, and leaves an idle board burning
     * nothing.
     *
     * Re-schedules rather than latching. The old form was `if (!frame) frame = rAF(draw)`,
     * which is one boolean cheaper and has a failure mode that has now cost this file
     * twice: if a scheduled frame never RUNS, `frame` stays non-zero forever and every
     * later requestDraw is silently a no-op. The board then keeps working perfectly —
     * gestures apply, history records, the server persists — while the screen shows none
     * of it, which reads to a user as "dragging does nothing, no error".
     *
     * The visibilitychange handler further down already unlatches the case it can see. It
     * cannot see them all: a tab in a background WINDOW, an occluded window, and some
     * minimised states stop producing frames without ever firing that event, so the latch
     * survives. Cancelling and re-requesting cannot get stuck in the first place — the
     * newest request always wins, and whenever frames resume, one runs.
     *
     * Coalescing is unaffected: N calls in a single task still leave exactly one pending
     * callback. The cost is a cancel plus a request per call instead of a boolean test,
     * which is noise next to the paint it schedules.
     */
    function requestDraw() {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }
    redrawRef.current = requestDraw
    fadeOutRef.current = fadeOut
    syncEditorRef.current = syncEditor

    /**
     * Paints the whole board into a fresh offscreen canvas, cropped to its contents.
     *
     * Reuses the live renderer by pointing `ctx` and `view` at the offscreen target,
     * drawing, and putting both back — so an exported PNG is the same code that draws
     * the screen, and cannot drift from it.
     *
     * Deliberately paints background and objects only: grid, selection handles, laser
     * trails and peer cursors are all screen furniture, not board content.
     *
     * `scale` is a pixel multiplier over world units — 2 gives a comfortably crisp
     * raster without producing a file nobody can open.
     */
    function renderToCanvas(scale = 2, pad = 32): HTMLCanvasElement | null {
      if (!objects.length) return null

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const o of objects) {
        const b = objectBounds(o)
        if (b.minX < minX) minX = b.minX
        if (b.minY < minY) minY = b.minY
        if (b.maxX > maxX) maxX = b.maxX
        if (b.maxY > maxY) maxY = b.maxY
      }

      const w = Math.max(1, Math.ceil((maxX - minX + pad * 2) * scale))
      const h = Math.max(1, Math.ceil((maxY - minY + pad * 2) * scale))
      const off = document.createElement("canvas")
      off.width = w
      off.height = h
      const offCtx = off.getContext("2d")
      if (!offCtx) return null

      // Swap the renderer's targets. `view` is mutated rather than replaced because
      // every draw function closes over this exact object.
      const prevCtx = ctx
      const prev = { ...view }
      ctx = offCtx
      view.scale = scale
      view.x = (-minX + pad) * scale
      view.y = (-minY + pad) * scale
      try {
        offCtx.setTransform(1, 0, 0, 1, 0, 0)
        offCtx.fillStyle = THEMES[themeRef.current].bg
        offCtx.fillRect(0, 0, w, h)
        offCtx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y)
        drawObjects()
      } finally {
        // In a finally so a throw mid-render cannot leave the live canvas pointing at
        // a detached context — that would blank the board with no way back.
        ctx = prevCtx
        Object.assign(view, prev)
      }
      requestDraw() // the on-screen canvas repaints from its restored view
      return off
    }
    exportRef.current = renderToCanvas

    function resize() {
      const dpr = window.devicePixelRatio || 1
      size = { w: canvas.clientWidth, h: canvas.clientHeight }
      canvas.width = Math.round(size.w * dpr)
      canvas.height = Math.round(size.h * dpr)
      draw() // resizing wipes the backing store — repaint now, not next frame
    }

    function onWheel(e: WheelEvent) {
      // Must be non-passive, or this is ignored and the browser page-zooms instead.
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const dy = normalizeWheelDelta(e.deltaY, e.deltaMode)
      // Trackpad pinch is delivered as a ctrl-modified wheel event, with much
      // smaller deltas than a mouse wheel.
      const speed = e.ctrlKey ? PINCH_ZOOM_SPEED : WHEEL_ZOOM_SPEED
      Object.assign(
        view,
        zoomAt(view, zoomFactor(dy, speed), e.clientX - rect.left, e.clientY - rect.top),
      )
      requestDraw()
    }

    // Same zoomAt the wheel uses, anchored at the canvas center instead of the
    // cursor — a button click has no cursor position on the canvas to anchor to.
    function stepZoom(dir: 1 | -1) {
      const rect = canvas.getBoundingClientRect()
      Object.assign(
        view,
        zoomAt(view, dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, rect.width / 2, rect.height / 2),
      )
      requestDraw()
    }
    zoomRef.current = stepZoom

    /** Jump to an absolute scale, holding the canvas centre still. */
    function zoomTo(scale: number) {
      const rect = canvas.getBoundingClientRect()
      // Expressed as a FACTOR through the same zoomAt the wheel and the +/- buttons use,
      // rather than assigning view.scale directly — that is what keeps the centre pinned
      // and the MIN/MAX clamp in one place instead of three.
      Object.assign(
        view,
        zoomAt(view, scale / view.scale, rect.width / 2, rect.height / 2),
      )
      requestDraw()
    }
    zoomToRef.current = zoomTo

    /**
     * Frames every object on the board.
     *
     * An empty board has nothing to frame, so it resets to 100% at the origin instead —
     * fitting "nothing" would otherwise divide by a zero-sized bounding box.
     */
    function zoomToFit() {
      const rect = canvas.getBoundingClientRect()
      if (!objects.length) {
        view.scale = 1
        view.x = rect.width / 2
        view.y = rect.height / 2
        requestDraw()
        return
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const o of objects) {
        const b = visualBounds(o)
        if (b.minX < minX) minX = b.minX
        if (b.minY < minY) minY = b.minY
        if (b.maxX > maxX) maxX = b.maxX
        if (b.maxY > maxY) maxY = b.maxY
      }

      const pad = 48 // screen px of breathing room, so nothing sits against an edge
      // max(…, 1) guards the degenerate cases: a single dot, or a perfectly straight
      // horizontal line, both of which have a zero-width or zero-height box.
      const w = Math.max(maxX - minX, 1)
      const h = Math.max(maxY - minY, 1)
      const scale = clamp(
        Math.min((rect.width - pad * 2) / w, (rect.height - pad * 2) / h),
        MIN_SCALE,
        MAX_SCALE,
      )

      view.scale = scale
      // Centre the content's midpoint in the viewport.
      view.x = rect.width / 2 - ((minX + maxX) / 2) * scale
      view.y = rect.height / 2 - ((minY + maxY) / 2) * scale
      requestDraw()
    }
    fitRef.current = zoomToFit

    /**
     * Removes every object under the eraser.
     *
     * Whole objects, not partial paths. Splitting a stroke where the eraser crosses it
     * would mean one gesture deleting one object and creating several, which needs
     * compound history, breaks a rectangle's `shape` identity into fragments that are
     * no longer rectangles, cannot apply to notes at all, and turns one Y.Map delete
     * into a delete plus several adds under concurrent editing.
     *
     * ponytail: whole-object erase. Add segment splitting as a second eraser MODE if
     * freehand sketching needs it — the tool and its toolbar slot stay as they are.
     *
     * Iterates backwards so splicing cannot skip the next candidate, and removes every
     * hit rather than just the topmost, or a fast drag would leave objects behind.
     *
     * Takes the whole segment travelled since the last sample, not just where the
     * pointer is now — see hitsSweep for why point sampling silently skipped shapes.
     */
    function eraseAt(from: { x: number; y: number }, to: { x: number; y: number }) {
      const r = ERASER_RADIUS / view.scale
      let hit = false
      for (let i = objects.length - 1; i >= 0; i--) {
        const o = objects[i]
        if (o.locked) continue // pinned means pinned, including against a sweep
        if (!hitsSweep(o, from, to, r)) continue
        objects.splice(i, 1)
        fadeOut(o) // same exit as Delete — the eraser removes objects, not just ink
        erased.push({ object: o, index: i })
        touch(o.id)
        if (selectedIdRef.current === o.id) setSelected(null)
        hit = true
      }
      if (hit) requestDraw()
    }

    /**
     * Advances the live resize or rotate to the pointer.
     *
     * Resize works entirely in the object's UNROTATED frame: the pointer is mapped in,
     * the box is rebuilt against the fixed opposite corner, and the geometry is remapped
     * from old box to new. Doing it in world space would shear a rotated object.
     */
    function applyTransform(p: { x: number; y: number }, constrain: boolean) {
      const t = transforming!
      const o = t.object

      if (t.handle === "rotate") {
        const c = centerOf(o)
        const now = Math.atan2(p.y - c.y, p.x - c.x)
        let next = t.startAngle + (now - t.grabAngle)
        // Same 15° increments the shape recognizer snaps to, so the two agree.
        if (constrain) {
          const step = Math.PI / 12
          next = Math.round(next / step) * step
        }
        o.angle = next
        requestDraw()
        return
      }

      const local = toLocal(o, p.x, p.y)
      const a = t.anchor
      let dx = local.x - a.x
      let dy = local.y - a.y
      // Shift keeps the original proportions, using the larger drag so the box follows
      // the pointer rather than lagging behind whichever axis moved less.
      if (constrain) {
        const from = t.geom
        const fw = Math.abs(
          from.points
            ? Math.max(...from.points.filter((_, i) => i % 2 === 0)) -
                Math.min(...from.points.filter((_, i) => i % 2 === 0))
            : (from.w ?? 1),
        )
        const fh = Math.abs(
          from.points
            ? Math.max(...from.points.filter((_, i) => i % 2 === 1)) -
                Math.min(...from.points.filter((_, i) => i % 2 === 1))
            : (from.h ?? 1),
        )
        if (fw > 0 && fh > 0) {
          const k = Math.max(Math.abs(dx) / fw, Math.abs(dy) / fh)
          dx = Math.sign(dx) * k * fw
          dy = Math.sign(dy) * k * fh
        }
      }
      // A box is never allowed to collapse: at zero width every point maps onto one
      // coordinate and the object can never be pulled back out again.
      const minSize = MIN_RESIZE / view.scale
      if (Math.abs(dx) < minSize) dx = Math.sign(dx || 1) * minSize
      if (Math.abs(dy) < minSize) dy = Math.sign(dy || 1) * minSize

      const to = {
        minX: Math.min(a.x, a.x + dx),
        minY: Math.min(a.y, a.y + dy),
        maxX: Math.max(a.x, a.x + dx),
        maxY: Math.max(a.y, a.y + dy),
      }
      // geomBounds, not objectBounds: both ends of the mapping must be raw extents, or
      // the ink padding is scaled and then re-added and the corner drifts off the pointer.
      scaleGeometry(o, geomBounds(o), to)
      requestDraw()
    }

    function onPointerDown(e: PointerEvent) {
      /**
       * Comments intercept the press before anything else, and only on a plain left
       * click so panning and the context menu are untouched.
       *
       * Order matters: placing a pin beats hitting one (you may want a second pin right
       * next to an existing thread), and hitting one beats every board gesture below —
       * a pin sits ON the content it refers to, so the object underneath must not steal
       * the click. Both paths return, and neither runs when the panel is closed, so with
       * comments shut this whole block costs one boolean.
       */
      if (commentsOpenRef.current && e.button === 0 && !spaceHeld) {
        const rect = canvas.getBoundingClientRect()
        const sx = e.clientX - rect.left
        const sy = e.clientY - rect.top

        if (placingRef.current) {
          e.preventDefault()
          const p = toWorld(e)
          // Anchored to whatever is under the pointer, if anything — the id travels as a
          // loose string, so an object erased later leaves the thread where it was.
          const under = pickObject(objects, p.x, p.y, SELECT_SLOP / view.scale)
          onPlacedRef.current({ x: p.x, y: p.y, objectId: under?.id ?? null })
          return
        }

        const hit = pickPin(pinHits, sx, sy)
        if (hit) {
          e.preventDefault()
          onPinClickRef.current(hit.id)
          return
        }
      }

      // Middle-drag and space+drag pan in *any* tool, so you never have to leave the
      // pen to move around. They never touch the selection.
      // In a read-only view EVERY press pans: there is no tool, no selection and
      // nothing to grab, so the one gesture left is moving the camera.
      const forcePan =
        readOnlyRef.current ||
        toolRef.current === "pan" ||
        e.button === 1 ||
        (e.button === 0 && spaceHeld)

      /**
       * The selected object's grips, in EVERY tool that draws them — see handlesLive.
       *
       * Above the tool branches rather than inside the Select one, because a grip that
       * is on screen has to work wherever it is on screen. Handles also win over the
       * object underneath them: they sit on and just outside the selection's edge, so
       * picking first would make a corner grip unreachable.
       */
      if (!forcePan && e.button === 0 && handlesLive(toolRef.current)) {
        const p = toWorld(e)
        const sel = objects.find((o) => o.id === selectedIdRef.current)
        if (sel && !sel.locked && !isLinked(sel)) {
          // Before hitHandle: the north "+" and the rotate grip share the top-centre
          // line, and the "+" is the one that has to win the overlap — see hitConnectSide.
          const side = hitConnectSide(sel, p.x, p.y)
          if (side) {
            e.preventDefault()
            connecting = { from: sel, side, end: p, target: null }
            busyRef.current = true
            capturePointer(e.pointerId)
            requestDraw()
            return
          }

          const handle = hitHandle(sel, p.x, p.y)
          if (handle) {
            e.preventDefault()
            const c = centerOf(sel)
            const hs = handlesFor(sel, 0)
            transforming = {
              object: sel,
              handle,
              geom: readGeom(sel),
              anchor: handle === "rotate" ? { x: 0, y: 0 } : hs[OPPOSITE[handle]],
              grabAngle: Math.atan2(p.y - c.y, p.x - c.x),
              startAngle: sel.angle ?? 0,
            }
            hold.add(sel.id)
            busyRef.current = true
            capturePointer(e.pointerId)
            return
          }
        }
      }

      // Plain left button in Select mode: the hit test owns the gesture. An object
      // under the cursor takes it; empty canvas deselects and falls through to a pan.
      if (!forcePan && e.button === 0 && toolRef.current === "select") {
        const p = toWorld(e)

        /**
         * Quick-add, tested BEFORE the normal hit test.
         *
         * The "+" is painted on top of its lane, so a press that lands on it must not
         * fall through and select the lane underneath — which is what would happen if
         * this ran after pickObject.
         */
        const addSize = ADD_SIZE / view.scale
        const lane = sectionsOf(objects).find((l) => hitsAdd(l, p.x, p.y, addSize))
        if (lane) {
          e.preventDefault()
          const card = newCardFor(objects, lane)
          if (card) {
            card.id = crypto.randomUUID()
            card.createdAt = Date.now()
            objects.push(card)
            touch(card.id)
            history.push({ kind: "add", object: card, index: objects.length - 1 })
            commit()
            setSelected(card)
            // Open for typing straight away: the point of the button is to add a card
            // and write on it, and making that two gestures gives back the friction it
            // exists to remove.
            setEditing({ id: card.id, text: "" })
            requestDraw()
          }
          return
        }

        const hit = pickObject(objects, p.x, p.y, SELECT_SLOP / view.scale)
        setSelected(hit)
        // A locked object still selects — that is how you reach Unlock — but the drag
        // never starts, so the press falls through to a pan. An attached connector is the
        // same bargain for a different reason: it stays selectable so it can be deleted
        // or recoloured, but dragging it would be reverted by the next reroute and would
        // leave a no-op "move" on the undo stack.
        if (hit && !hit.locked && !isLinked(hit)) {
          // Select and drag are one gesture: press, move, release repositions it —
          // no separate click-first step.
          e.preventDefault()
          dragging = hit
          liftTo(hit.id, 1)
          hold.add(hit.id)
          dragLast = p
          dragStart = p
          // A fresh gesture carries no offset from the last one — otherwise the first
          // move of this drag would subtract a snap that belonged to a different object.
          dragSnap = { x: 0, y: 0 }
          busyRef.current = true
          capturePointer(e.pointerId)
          canvas.style.cursor = "grabbing"
          return
        }
      }

      const panGesture =
        forcePan || (e.button === 0 && toolRef.current === "select")
      if (panGesture) {
        e.preventDefault() // also suppresses Windows middle-click autoscroll
        panning = true
        last = { x: e.clientX, y: e.clientY }
        capturePointer(e.pointerId)
        canvas.style.cursor = "grabbing"
        return
      }
      if (e.button !== 0) return

      // A sticky is placed, not dragged out: one click, fixed size, done on pointerdown
      // so it appears under the finger rather than on release. Centred on the cursor —
      // you aim at where the note goes, not at its top-left corner.
      if (toolRef.current === "note") {
        e.preventDefault()
        const p = toWorld(e)
        // Clicking an existing note selects it instead of stacking another one on top.
        // Without this, a double-click to edit would place two more notes first — the
        // same silent-duplicate trap the shape tool had.
        const hit = pickObject(objects, p.x, p.y, SELECT_SLOP / view.scale)
        if (hit?.type === "note") {
          setSelected(hit)
          return
        }
        const note: Note = {
          id: crypto.randomUUID(),
          type: "note",
          x: p.x - NOTE_SIZE / 2,
          y: p.y - NOTE_SIZE / 2,
          w: NOTE_SIZE,
          h: NOTE_SIZE,
          color: noteColorRef.current,
          text: "",
          createdAt: Date.now(),
        }
        objects.push(note)
        touch(note.id)
        history.push({ kind: "add", object: note, index: objects.length - 1 })
        commit()
        setSelected(note)
        dropNote(note.id)
        return
      }

      // Text: click places a free-floating box already open for typing. Unlike a
      // sticky it is placed at the CLICK POINT rather than centred on it — you aim a
      // text cursor at where the words start, not at their middle.
      if (toolRef.current === "text") {
        e.preventDefault()
        const p = toWorld(e)
        const hit = pickObject(objects, p.x, p.y, SELECT_SLOP / view.scale)
        // Clicking existing text edits it instead of stacking a second box on top.
        if (hit?.type === "note") {
          setSelected(hit)
          setEditing({ id: hit.id, text: textOf(hit) })
          return
        }
        const box: Note = {
          id: crypto.randomUUID(),
          type: "note",
          bare: true,
          x: p.x,
          y: p.y,
          w: TEXT_SIZE.w,
          h: TEXT_SIZE.h,
          // Ink, not fill — see Note.bare. Follows the pen so text matches the ink
          // you were last drawing with.
          color: penColorRef.current,
          text: "",
          createdAt: Date.now(),
        }
        objects.push(box)
        touch(box.id)
        history.push({ kind: "add", object: box, index: objects.length - 1 })
        commit()
        setSelected(box)
        // No dropNote: a sticky lands with a bounce because it is an object arriving,
        // while a text box is a caret appearing. Animating it would fight the editor
        // that opens over it on the same frame.
        setEditing({ id: box.id, text: "" })
        return
      }

      // Eraser: press and drag removes whole objects. Every removal is collected so the
      // whole drag lands in history as ONE step.
      if (toolRef.current === "eraser") {
        e.preventDefault()
        busyRef.current = true
        erasing = true
        erased = []
        capturePointer(e.pointerId)
        // A press with no movement still erases what is under it: from === to.
        eraseLast = toWorld(e)
        eraseAt(eraseLast, eraseLast)
        return
      }

      if (toolRef.current !== "pen" && !isPlacingTool(toolRef.current)) return

      // With Shapes armed, a click landing ON an existing object selects it instead of
      // starting another one on top. Outline proximity, NOT bbox containment: clicking
      // the open interior of a rectangle has to keep starting a new shape, or drawing a
      // box inside a box becomes impossible. Double-click is the forgiving one.
      if (isPlacingTool(toolRef.current)) {
        const p = toWorld(e)
        const hit = pickObject(objects, p.x, p.y, SELECT_SLOP / view.scale)
        if (hit) {
          e.preventDefault()
          setSelected(hit)
          return
        }
      }

      e.preventDefault()
      busyRef.current = true
      shiftDrawn = e.shiftKey // latched here, then topped up on move and keydown
      capturePointer(e.pointerId)
      const p = toWorld(e)
      const placingShape = isPlacingTool(toolRef.current)
      shapeAnchor = placingShape ? p : null
      const brushKind = placingShape ? "pen" : brushRef.current
      const bDef = BRUSHES[brushKind]

      // A laser never becomes a Stroke. It goes straight into the ephemeral layer, so
      // there is nothing to push to history and nothing to sync.
      if (!placingShape && !bDef.persists) {
        laser = {
          points: [p.x, p.y],
          color: penColorRef.current,
          width: bDef.width / view.scale,
          a: { v: 1 },
        }
        lasers.push(laser)
        penPos = p
        requestDraw()
        return
      }

      drawing = {
        id: crypto.randomUUID(),
        type: "stroke",
        // A shape is exact from the first frame — generated geometry, never smoothed
        // ink. It starts degenerate and is regenerated on every move.
        points: placingShape
          ? shapePoints(placedKind(), p.x, p.y, p.x, p.y)
          : [p.x, p.y],
        ...(placingShape ? { shape: placedKind() } : {}),
        // Conditional spread, so an unfilled shape carries no `fill` key at all rather
        // than an explicit undefined — absence is the off state, same as `shape`.
        ...(placingShape && shapeFillRef.current && isFillable(placedKind())
          ? { fill: shapeFillRef.current }
          : {}),
        // Stylus pressure, one entry per point from here on. Recorded only for a real
        // pen: mouse and touch report a constant 0.5 for the whole gesture, so they
        // would render as uniform width anyway, and carrying no key at all is what
        // keeps those strokes byte-identical to before. Never on a placed shape —
        // exact geometry has no taper.
        ...(e.pointerType === "pen" && !placingShape ? { pressures: [e.pressure] } : {}),
        color: penColorRef.current,
        // Stored in world units, derived from the current zoom so the pen feels the
        // same thickness on screen whatever you're zoomed to when you draw.
        width: bDef.width / view.scale,
        ...(brushKind === "pen" ? {} : { brush: brushKind }),
        createdAt: Date.now(),
      }
      objects.push(drawing) // pushed live, so rendering needs no special case
      penPos = p // filter starts on the cursor, so the stroke begins exactly there
      requestDraw()
    }

    function onPointerLeave() {
      if (hoverNote === null) return
      hoverNote = null
      requestDraw()
    }

    function onPointerMove(e: PointerEvent) {
      // Before every mode branch: peers should see the cursor whatever tool is active,
      // including plain hovering, which returns early below. Time-throttled rather
      // than tied to requestDraw, since our own cursor needs no local repaint.
      const now = performance.now()
      if (now - lastCursorSent > CURSOR_INTERVAL) {
        lastCursorSent = now
        const w = toWorld(e)
        publishRef.current(w.x, w.y)
      }

      if (connecting) {
        const p = toWorld(e)
        connecting.end = p
        connecting.target = pickConnectTarget(objects, p.x, p.y, connecting.from)
        requestDraw()
        return
      }
      if (transforming) {
        applyTransform(toWorld(e), e.shiftKey)
        touch(transforming.object.id)
        return
      }
      if (dragging) {
        const p = toWorld(e)
        /**
         * The snap from the PREVIOUS frame is subtracted before the pointer delta is
         * applied, which is what keeps the object anchored to the cursor.
         *
         * Without it the offsets accumulate: each frame would add a fresh nudge on top of
         * the last one, and the object would slide further from the pointer the longer
         * you hovered near an alignment — and then refuse to come off it, because every
         * frame re-snapped from the already-snapped position. Undo, follow the pointer
         * exactly, re-snap from there.
         */
        translateObject(
          dragging,
          p.x - dragLast.x - dragSnap.x,
          p.y - dragLast.y - dragSnap.y,
        )
        dragLast = p

        // Tolerance converted from screen px to world units, so the pull is a constant
        // distance on screen however far in or out you are zoomed. A disabled toggle
        // passes 0, which computeSnap treats as "no snapping" — one code path, not two.
        const tolerance = smartGuidesRef.current ? SNAP_TOLERANCE / view.scale : 0
        const others: Box[] = []
        for (const o of objects) {
          if (o.id !== dragging.id) others.push(visualBounds(o))
        }
        const snap = computeSnap(visualBounds(dragging), others, tolerance)
        translateObject(dragging, snap.dx, snap.dy)
        dragSnap = { x: snap.dx, y: snap.dy }
        guides = snap.guides

        touch(dragging.id) // peers watch it move, not just land
        requestDraw() // the selection outline follows, it is derived from the points
        return
      }
      if (panning) {
        // Screen-space delta: panning moves the offset, not the world position.
        view.x += e.clientX - last.x
        view.y += e.clientY - last.y
        last = { x: e.clientX, y: e.clientY }
        requestDraw()
        return
      }
      if (erasing) {
        const p = toWorld(e)
        eraseAt(eraseLast, p)
        eraseLast = p
        return
      }
      if (laser) {
        // Same filter and decimation as ink, so a laser trail moves like a real stroke.
        const min = MIN_POINT_DIST / view.scale
        penPos = smoothPoint(penPos, toWorld(e))
        const n = laser.points.length
        const dx = penPos.x - laser.points[n - 2]
        const dy = penPos.y - laser.points[n - 1]
        if (dx * dx + dy * dy >= min * min) laser.points.push(penPos.x, penPos.y)
        requestDraw()
        return
      }
      if (!drawing) {
        // Idle hover: only stickies lift. Hit-tested on move, repainted only on change.
        const p = toWorld(e)
        const hit = pickObject(objects, p.x, p.y, 0)
        const id = hit?.type === "note" && !hit.bare ? hit.id : null
        if (id !== hoverNote) {
          hoverNote = id
          requestDraw()
        }
        return
      }
      if (e.shiftKey) shiftDrawn = true

      // Alt is read live off the event rather than latched like shiftDrawn: this is a
      // constraint you hold and let go of mid-stroke, not a mode the whole stroke is in.
      syncAltLine(e.altKey)
      if (altLine && !shapeAnchor) {
        // Rewritten from the anchor every move rather than accumulated, so the line
        // tracks the cursor exactly instead of drifting. No smoothing and no decimation:
        // a straight line has nothing to filter and two points describe it exactly.
        const p = toWorld(e)
        drawing.points.length = altLine.anchorLen
        drawing.points.push(p.x, p.y)
        // A constrained line is uniform by definition. Dropped rather than truncated
        // to match, and never restored — freehand resuming after Alt keeps the whole
        // stroke uniform, which is the honest reading of a half-constrained gesture.
        delete drawing.pressures
        penPos = p // so freehand resumes from the line's end, not from where Alt began
        requestDraw()
        return
      }

      if (shapeAnchor) {
        // Regenerated from the anchor each move rather than accumulated, so dragging
        // back past the origin flips the shape instead of corrupting it.
        const p = toWorld(e)
        drawing.points = shapePoints(placedKind(), shapeAnchor.x, shapeAnchor.y, p.x, p.y)
        requestDraw()
        return
      }

      const min = MIN_POINT_DIST / view.scale
      // Coalesced events recover the samples a 120Hz+ pen produces between frames.
      // Must fall back on an EMPTY array, not just a missing method: Safari and
      // untrusted events return [], which would silently record no points at all.
      const coalesced = e.getCoalescedEvents?.() ?? []
      for (const ev of coalesced.length ? coalesced : [e]) {
        // Filter first, then decimate: thinning raw samples would just pick a subset
        // of the jitter rather than averaging it away.
        penPos = smoothPoint(penPos, toWorld(ev))
        const n = drawing.points.length
        const dx = penPos.x - drawing.points[n - 2]
        const dy = penPos.y - drawing.points[n - 1]
        if (dx * dx + dy * dy >= min * min) {
          drawing.points.push(penPos.x, penPos.y)
          // Optional chaining is the lockstep rule: once pressures are dropped (a
          // constrained line, a recognized shape) they are never resumed, so the two
          // arrays cannot silently drift apart mid-stroke.
          drawing.pressures?.push(ev.pressure)
        }
      }
      requestDraw()
    }

    /**
     * Arms or disarms the live line constraint, remembering where it began.
     *
     * Split out because three places need it — pointermove, the Alt keydown (so it takes
     * effect without waiting for a move) and the keyup. Idempotent: re-arming while
     * already armed would reset the anchor to the cursor and pin the line to nothing.
     */
    function syncAltLine(held: boolean) {
      if (!drawing || shapeAnchor) return
      if (held && !altLine) {
        // Anchor at the last committed sample, so the line starts on the ink rather than
        // a filter-lag behind it.
        altLine = { anchorLen: Math.max(2, drawing.points.length) }
      } else if (!held && altLine) {
        altLine = null
      }
    }

    function onPointerUp(e: PointerEvent) {
      // Unconditional: cheaper than mirroring every branch below, and the branches that
      // never set it are the ones where clearing it is a no-op.
      busyRef.current = false

      if (connecting) {
        const c = connecting
        connecting = null
        releasePointer(e.pointerId)
        const start = anchorOf(c.from, c.side)
        const end = toWorld(e)
        // A press with no drag would leave a zero-length arrow nobody can see and nobody
        // asked for. The threshold is in screen px so it means the same at any zoom.
        if (Math.hypot(end.x - start.x, end.y - start.y) * view.scale < CONNECT_HIT) {
          requestDraw()
          return
        }

        const arrow: Stroke = {
          id: crypto.randomUUID(),
          type: "stroke",
          shape: "connector",
          points: connectorPoints(start.x, start.y, end.x, end.y),
          color: penColorRef.current,
          width: BRUSHES.pen.width / view.scale,
          createdAt: Date.now(),
          // Only a drop ON a shape attaches. Dropped on empty canvas it stays an ordinary
          // arrow — draggable, resizable and rotatable through the code that already
          // exists — which is the whole reason the link is optional.
          ...(c.target
            ? { link: { from: c.from.id, side: c.side, to: c.target.id } }
            : {}),
        }
        // Routed once here rather than waiting for the next frame, so the geometry that
        // lands in history is the geometry that gets drawn.
        if (arrow.link) routeConnector(arrow, objects)

        objects.push(arrow)
        touch(arrow.id)
        history.push({ kind: "add", object: arrow, index: objects.length - 1 })
        commit()
        setSelected(arrow)
        animate(arrow.id, DROP_DURATION, DROP_EASE)
        return
      }

      if (transforming) {
        const t = transforming
        transforming = null
        releasePointer(e.pointerId)
        const after = readGeom(t.object)
        // A grab that never moved leaves the geometry identical; recording that would
        // put a no-op step on the undo stack.
        if (JSON.stringify(after) !== JSON.stringify(t.geom)) {
          history.push({ kind: "transform", id: t.object.id, before: t.geom, after })
          touch(t.object.id)
          commit()
        }
        hold.delete(t.object.id)
        canvas.style.cursor = spaceHeld ? "grab" : idleCursor()
        return
      }
      if (dragging) {
        // How far the POINTER travelled, plus the alignment offset still applied on top
        // of it. dragSnap has to be in here: the object sits at pointer + snap, so
        // recording the pointer delta alone would make undo put it back a few units off
        // — and each drag-undo cycle would walk it further away.
        const dx = dragLast.x - dragStart.x + dragSnap.x
        const dy = dragLast.y - dragStart.y + dragSnap.y
        if (dx || dy) {
          history.push({ kind: "move", id: dragging.id, dx, dy })
          touch(dragging.id)
          commit()
        }
        hold.delete(dragging.id)
        liftTo(dragging.id, 0)
        dragging = null
        // The gesture is over: drop the offset and take the guides off the screen.
        dragSnap = { x: 0, y: 0 }
        guides = []
        requestDraw()
        releasePointer(e.pointerId)
        canvas.style.cursor = spaceHeld ? "grab" : idleCursor()
        return
      }
      if (panning) {
        panning = false
        releasePointer(e.pointerId)
        canvas.style.cursor = spaceHeld ? "grab" : idleCursor()
        return
      }
      if (erasing) {
        erasing = false
        releasePointer(e.pointerId)
        if (erased.length) {
          // One batch, so the whole sweep undoes in a single Ctrl+Z.
          history.push({
            kind: "batch",
            entries: erased.map((r) => ({
              kind: "remove" as const,
              object: r.object,
              index: r.index,
            })),
          })
          commit()
        }
        erased = []
        return
      }
      if (laser) {
        // Fades itself out and then removes itself. Nothing else has to know it existed.
        const dying = laser
        laser = null
        releasePointer(e.pointerId)
        gsap.to(dying.a, {
          v: 0,
          duration: LASER_FADE,
          ease: LASER_EASE,
          onUpdate: requestDraw,
          onComplete: () => {
            const i = lasers.indexOf(dying)
            if (i >= 0) lasers.splice(i, 1)
            requestDraw()
          },
        })
        return
      }
      if (!drawing) return

      if (shapeAnchor) {
        // The geometry is already exact — nothing to land or clean up.
        shapeAnchor = null
      } else if (altLine) {
        // Land the line on the true release point. Rewritten from the anchor, not
        // pushed, or the release would add a fourth coordinate and bend the "line".
        const end = toWorld(e)
        drawing.points.length = altLine.anchorLen
        drawing.points.push(end.x, end.y)
        delete drawing.pressures // see the live Alt branch above
        altLine = null
      } else {
        // The filter trails the cursor by a few px, so land the stroke on the true
        // release point rather than stopping short. A click that never moved stays
        // below the epsilon and remains a dot.
        const end = toWorld(e)
        const n = drawing.points.length
        const dx = end.x - drawing.points[n - 2]
        const dy = end.y - drawing.points[n - 1]
        const eps = 0.5 / view.scale
        if (dx * dx + dy * dy > eps * eps) {
          drawing.points.push(end.x, end.y)
          drawing.pressures?.push(e.pressure)
        }
      }

      // Shift-held pen strokes get cleaned up into a shape. Guarded on `!drawing.shape`
      // so this can never touch the Shapes tool's own output — the two stay additive.
      if ((shiftDrawn || e.shiftKey) && !drawing.shape) {
        const clean = recognizeShape(drawing.points)
        // No confident match keeps the raw smoothed path, rather than forcing the
        // nearest shape onto a stroke that was not one.
        if (clean) {
          drawing.points = clean.points
          // Setting `shape` is what routes this through polylinePath and miter joins.
          // Assigning only the points would render the corners as quadratics.
          drawing.shape = clean.kind
          // The point count changed and the geometry is now exact — a recognized
          // rectangle has no pressure profile to keep.
          delete drawing.pressures
        }
      }

      // Recorded on release, never on pointerdown: an undo mid-gesture would otherwise
      // pop a stroke that is still being drawn into.
      const { id, shape } = drawing
      touch(drawing.id)
      history.push({ kind: "add", object: drawing, index: objects.indexOf(drawing) })
      commit()
      drawing = null
      releasePointer(e.pointerId)

      // A shape is an object being placed, so it gets the sticky's short spring; ink is
      // a mark being made, and keeps the slower settle.
      if (shape) animate(id, DROP_DURATION, DROP_EASE)
      else animate(id, SETTLE_DURATION, SETTLE_EASE)
    }

    /**
     * Runs an object's entry animation, whatever kind it is.
     *
     * One tween helper because the bookkeeping is identical — register progress under
     * the id, repaint on every frame, delete the entry when done so an idle board
     * burns nothing. Only the curve and how drawStroke/drawNote read `t` differ.
     */
    function animate(id: string, duration: number, ease: string) {
      // No entry: `settling` never gets the id, and both draw paths already read a
      // missing entry as t=1, so the object is simply there at full size.
      if (reduceMotion()) return
      const state: { t: number; timer?: ReturnType<typeof setTimeout> } = { t: 0 }
      settling.set(id, state)
      /**
       * A wall-clock backstop, because the entry animation must never be the reason an
       * object cannot be SEEN.
       *
       * While an id is in `settling`, drawNote paints it at dropStyle(t) — at t=0 that
       * is 60% opacity and 85% scale, which reads as "the sticky has no fill, just a
       * selection outline". gsap advances t from requestAnimationFrame, and a tab that
       * gets no frames (backgrounded, occluded, some minimised states) never advances
       * it, so the tween neither progresses nor completes and the object stays faint
       * indefinitely with nothing logged. Same failure class as the requestDraw latch
       * above and the publish latch in useBoardSync — a frame that never runs.
       *
       * setTimeout keeps running where rAF does not, so this deletes the entry on time
       * either way. When the tween does run it finishes first and clears this; when it
       * does not, the object snaps to its settled state a moment late, which is the
       * right failure — an animation that was skipped, not an object that vanished.
       */
      state.timer = setTimeout(() => {
        if (settling.delete(id)) requestDraw()
      }, duration * 1000 + SETTLE_GRACE_MS)
      gsap.to(state, {
        t: 1,
        duration,
        ease,
        onUpdate: requestDraw,
        onComplete: () => {
          clearTimeout(state.timer)
          settling.delete(id)
          requestDraw()
        },
      })
    }

    const dropNote = (id: string) => animate(id, DROP_DURATION, DROP_EASE)

    function onKeyDown(e: KeyboardEvent) {
      // Covers pressing Shift mid-stroke without moving, which delivers no pointermove.
      if (e.key === "Shift" && drawing) shiftDrawn = true
      if (e.key === "Alt" && drawing) {
        // Alt alone reaches for the browser's menu bar on Windows and Linux, which
        // would steal focus mid-stroke.
        e.preventDefault()
        syncAltLine(true)
        requestDraw()
      }
      if (e.code !== "Space" || e.repeat) return
      // Space is a character before it is a pan modifier. Without this, typing on a
      // note would arm the pan gesture and swallow every space you tried to type.
      if (isTypingTarget()) return
      e.preventDefault() // space would scroll, or re-trigger a focused button
      spaceHeld = true
      if (!panning) canvas.style.cursor = "grab"
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Alt") {
        syncAltLine(false)
        requestDraw()
      }
      if (e.code !== "Space") return
      spaceHeld = false
      if (!panning) canvas.style.cursor = idleCursor()
    }

    /**
     * Double-click opens a note for editing.
     *
     * Works under any tool: a double-click is unambiguous, and having to switch to
     * Select first to fix a typo would be a step nobody expects. The preceding
     * pointerdown has already selected it and started a zero-length drag, which pushes
     * no history entry because the delta is zero.
     */
    function onDoubleClick(e: MouseEvent) {
      if (readOnlyRef.current) return // double-click opens the text editor
      const p = toWorld(e)
      // pickLabelTarget, not pickObject: a shape is labelable anywhere inside it, so you
      // are not hunting for its outline just to type a word in it.
      const hit = pickLabelTarget(objects, p.x, p.y)
      if (!hit) return
      e.preventDefault()
      setSelected(hit)
      // The text at entry, kept so exit can tell whether anything actually changed and
      // what the undo target is.
      setEditing({ id: hit.id, text: textOf(hit) })
    }

    // Alt-tabbing while space is down never delivers the keyup, leaving it stuck. Alt
    // is worse: Alt+Tab IS the gesture that blurs, so its keyup essentially never
    // arrives and the constraint would latch on until the next press.
    function onBlur() {
      spaceHeld = false
      syncAltLine(false)
      if (!panning) canvas.style.cursor = idleCursor()
    }

    function preventDefault(e: Event) {
      e.preventDefault()
    }

    /**
     * Right-click opens the object menu, selecting whatever is under the cursor first.
     *
     * On empty canvas it offers Paste instead — Copy without a way to paste would be a
     * dead end, and the reference menu has no Paste entry of its own.
     */
    function onContextMenu(e: MouseEvent) {
      // Every entry on it mutates the board, so a viewer gets the browser's own menu
      // back rather than an empty one of ours.
      if (readOnlyRef.current) return
      e.preventDefault()
      const world = toWorld(e)
      const hit = pickObject(objects, world.x, world.y, SELECT_SLOP / view.scale)
      setSelected(hit)
      setMenu({ x: e.clientX, y: e.clientY, world })
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerleave", onPointerLeave)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointercancel", onPointerUp)
    canvas.addEventListener("dblclick", onDoubleClick)
    canvas.addEventListener("auxclick", preventDefault)
    canvas.addEventListener("contextmenu", onContextMenu)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)
    /**
     * Repaints when the tab comes back to the foreground.
     *
     * A hidden tab gets no requestAnimationFrame, so every repaint requested while it
     * was in the background was queued behind a frame that never ran — and because
     * requestDraw latches on `frame`, the FIRST such request swallowed all the rest.
     * A peer's stroke arriving in a background tab therefore lands in the objects array
     * and stays invisible. Content sync is what made this reachable: before it, nothing
     * could change the board while the tab was not being looked at.
     *
     * Forced rather than routed through requestDraw, which would see the stale latch
     * and do nothing.
     */
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      requestDraw()
    }
    document.addEventListener("visibilitychange", onVisible)
    resize()

    return () => {
      ro.disconnect()
      if (frame) cancelAnimationFrame(frame)
      gsap.killTweensOf([...settling.values(), ...dying.values(), sel, lift, ...lasers.map((l) => l.a)])
      // killTweensOf does not run onComplete, so the backstops it leaves behind would
      // fire against a torn-down canvas.
      for (const s of settling.values()) clearTimeout(s.timer)
      for (const d of dying.values()) clearTimeout(d.timer)
      canvas.removeEventListener("wheel", onWheel)
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerleave", onPointerLeave)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointercancel", onPointerUp)
      canvas.removeEventListener("dblclick", onDoubleClick)
      canvas.removeEventListener("auxclick", preventDefault)
      canvas.removeEventListener("contextmenu", onContextMenu)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
      document.removeEventListener("visibilitychange", onVisible)
    }
    // All stable — useRef objects from useBoardSync, and a useCallback with no deps —
    // so this effect still runs exactly once. Listing them satisfies the linter without
    // reintroducing the re-run that would drop the view transform and every stroke.
  }, [cursorsRef, publishRef, touchRef, holdRef, commit])

  useEffect(() => {
    if (!uploadError) return
    const id = setTimeout(() => setUploadError(null), 6000)
    return () => clearTimeout(id)
  }, [uploadError])

  return (
    <>
      {/* The canvas is INSET by the panel's width rather than sitting under it. That is
          what keeps every pin clickable — a panel floating over the board would cover the
          markers it lists. The canvas effect needs no part in this: a ResizeObserver on
          the element already repaints and re-measures whenever this box changes. */}
      <div
        className="absolute inset-y-0 left-0 transition-[right] duration-150"
        style={{ right: commentsOpen && !hideUI ? COMMENTS_PANEL_WIDTH : 0 }}
      >
        <canvas
          ref={canvasRef}
          className={`block h-full w-full touch-none ${placing ? "cursor-crosshair" : ""}`}
        />
      </div>
      {uploadError && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-red-400/40 elevation-2 px-4 py-2 text-sm text-red-300 backdrop-blur-md"
        >
          {uploadError}
        </div>
      )}
      {/* Export and zoom are the two controls a VIEWER keeps: one reads the board and
          writes a file, the other only changes how you're looking at it — neither
          edits anything. Outside the chrome gate for that reason.

          hideUI takes Export: "hide interface" that left a floating pill on screen would
          not have hidden the interface. The zoom pill stays, collapsed to its eye — that
          eye is the only on-screen way back, and hiding it would strand anyone who does
          not already know Ctrl+\ or Escape. */}
      {/* A VIEWER, and a guest on a comment-tier link, get no editing chrome at all — so
          the header's Comments button is out of reach for them. This is the same control
          in the one place they can still see, alongside Export and Zoom, which they keep
          for the same reason: reading and discussing a board is not editing it. */}
      {readOnly && !hideUI && (
        <button
          type="button"
          onClick={() => setCommentsOpen((v) => !v)}
          aria-pressed={commentsOpen}
          style={{ right: commentsOpen ? COMMENTS_PANEL_WIDTH + 24 : 24 }}
          className="fixed top-6 z-40 rounded-xl border border-outline-variant elevation-2 px-3 py-1.5 text-sm text-on-surface-variant backdrop-blur-md transition-colors hover:text-on-surface"
        >
          Comments
        </button>
      )}
      {!hideUI && (
        <ExportButton render={(scale, pad) => exportRef.current(scale, pad)} name={boardName} />
      )}
      <BottomPill
        viewRef={viewRef}
        tool={tool}
        onToolChange={changeTool}
        canUndo={hist.canUndo}
        canRedo={hist.canRedo}
        onUndo={() => step("undo")}
        onRedo={() => step("redo")}
        onZoom={(dir) => zoomRef.current(dir)}
        onZoomTo={(scale) => zoomToRef.current(scale)}
        onZoomToFit={() => fitRef.current()}
        hideUI={hideUI}
        onHideUIChange={setHideUI}
      />
      {/**
        * DIAGNOSTIC for the content-sync investigation. Two gates, both required.
        *
        * NODE_ENV was already here and already meant this could never reach production —
        * it renders in dev because dev is what you run locally, not because it leaks.
        * The env var is the added half: it makes the HUD opt-IN rather than on by
        * default, so a normal dev session (and anyone you hand a dev URL to) sees a clean
        * board, while the tool is one variable away when the investigation needs it.
        *
        * Kept rather than deleted deliberately — the sync bug it was built for is still
        * open, and this is the instrument that reads it. Set NEXT_PUBLIC_SYNC_HUD=1 in
        * .env to bring it back. Delete both this and the counters in useBoardSync once
        * content sync is confirmed in two real tabs.
        */}
      {process.env.NODE_ENV !== "production" &&
        process.env.NEXT_PUBLIC_SYNC_HUD === "1" &&
        !readOnly &&
        !hideUI && <SyncBadge statsRef={statsRef} />}
      {/* Everything below is editing chrome, and a viewer gets none of it. The canvas
          above is the whole read-only board — pan and zoom still work, because they are
          how you look at something rather than how you change it. */}
      {!readOnly && !hideUI && (
      <>
      {/* The persistent header: identity (title and its menu) on the left, presence and
          sharing on the right. A real bar, not a floating pill — it owns the whole top
          edge now that the tool rail has moved off it. */}
      <div className="elevation-2 fixed inset-x-0 top-0 flex h-14 items-center justify-between gap-3 border-x-0 border-t-0 border-b border-b-outline-variant px-3">
        <div className="flex min-w-0 items-center gap-1">
          {/* The way out. A board is the one place with no sidebar, so without this the
              logo — the control every app trains you to treat as "home" — is simply not
              on screen. Glyph only: the board's own name is the identity that matters in
              this bar, and the product just needs to be clickable. */}
          <Logo variant="dark" wordmark={false} href="/dashboard" className="mr-1 shrink-0" />
          <BoardTitle boardId={boardId} initialName={boardName} startRef={renameRef} />
          <BoardMenu
            boardId={boardId}
            initialStarred={initialStarred}
            // Optional-chained because BoardTitle only fills the ref while it is
            // mounted — which is always, here, but the ref's type says "maybe" and
            // pretending otherwise would be the kind of assertion that ages badly.
            onRename={() => renameRef.current?.()}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCommentsOpen((v) => !v)}
            aria-pressed={commentsOpen}
            className={`rounded px-2 py-1 text-sm transition-colors ${
              commentsOpen
                ? "bg-surface-container text-on-surface"
                : "text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            Comments
            {/* Open threads only. A count that included resolved ones would never go
                down, which makes it a decoration rather than a number worth reading. */}
            {threads.some((t) => !t.resolved) && (
              <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-on-primary">
                {threads.filter((t) => !t.resolved).length}
              </span>
            )}
          </button>
          <CollaboratorAvatars cursorsRef={cursorsRef} />
          <ShareButton
            boardId={boardId}
            initialToken={initialShareToken}
            initialAccess={initialShareAccess}
          />
          {accountUser && (
            <AccountMenu
              user={accountUser}
              board={{
                role,
                hideCursors,
                onHideCursorsChange: (next) => {
                  setHideCursors(next)
                  writePref("hideCursors", next)
                  // The cursors are painted by the draw loop, which is driven by pointer
                  // events — without this, they linger until something else moves.
                  redrawRef.current()
                },
              }}
            />
          )}
        </div>
      </div>
      {canvasPanel && (
        <CanvasPanel
          theme={theme}
          onThemeChange={changeCanvas}
          gridStyle={gridStyle}
          onGridStyleChange={changeGridStyle}
          smartGuides={smartGuides}
          onSmartGuidesChange={(next) => {
            setSmartGuides(next)
            writePref("smartGuides", next)
          }}
          onClose={() => setCanvasPanel(false)}
        />
      )}
      <Toolbar
        tool={tool}
        onChange={changeTool}
        theme={theme}
        onOpenCanvasPanel={() => setCanvasPanel((v) => !v)}
        penColor={penColor}
        onPenColorChange={setPenColor}
        shapeKind={shapeKind}
        shapeFill={shapeFill}
        onShapeFillChange={setShapeFill}
        onShapeKindChange={setShapeKind}
        noteColor={noteColor}
        onNoteColorChange={setNoteColor}
        brush={brush}
        onBrushChange={setBrush}
        onInsertImage={() => fileInputRef.current?.click()}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Reset first, not after: insertImage is async, and clearing it once the
          // file is already read is what lets picking the SAME file twice in a row
          // fire onChange the second time too.
          e.target.value = ""
          if (file) void insertImage(file)
        }}
      />
      {editing && (
        /**
         * A real textarea over the note, not a caret drawn on the canvas: this is where
         * selection, IME, clipboard and arrow keys come from for free. Position, size
         * and font are written imperatively by syncEditor on every frame, so pan and
         * zoom keep it glued without any of it passing through React.
         *
         * Blur commits — clicking the canvas or any control blurs it, so "click
         * elsewhere to exit" needs no code of its own.
         */
        <textarea
          ref={textareaRef}
          defaultValue={editing.text}
          onBlur={stopEditing}
          // A centred label grows about its middle, so the box has to be re-measured as
          // you type. Notes are top-anchored and this costs them nothing.
          onInput={() => syncEditorRef.current()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              stopEditing()
            }
            // Everything else is the textarea's business. Stopping propagation keeps
            // the board's window-level shortcuts out of it — isTypingTarget already
            // does that, and this makes it true regardless of where focus reports.
            e.stopPropagation()
          }}
          aria-label="Object text"
          spellCheck={false}
          // The exact family the canvas measures with — anything else and the wrap the
          // editor shows differs from the wrap that gets painted on blur.
          style={{ fontFamily: TEXT_FONT_FAMILY }}
          className="fixed resize-none overflow-hidden border-none bg-transparent p-0 outline-none"
        />
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={
            selected
              ? ([
                  {
                    label: "Edit",
                    // Freehand strokes have no interior to write in.
                    disabled: !isLabelable(selected),
                    onSelect: () => setEditing({ id: selected.id, text: textOf(selected) }),
                  },
                  { label: "Copy", shortcut: "Ctrl+C", onSelect: copySelected },
                  { label: "Duplicate", shortcut: "Ctrl+D", onSelect: duplicateSelected },
                  {
                    label: "Cut",
                    shortcut: "Ctrl+X",
                    disabled: Boolean(selected.locked),
                    onSelect: cutSelected,
                  },
                  {
                    label: "Bring to front",
                    separated: true,
                    onSelect: () => reorderSelected("front"),
                  },
                  { label: "Send to back", onSelect: () => reorderSelected("back") },
                  {
                    label: selected.locked ? "Unlock" : "Lock",
                    separated: true,
                    onSelect: toggleLock,
                  },
                  {
                    label: "Delete",
                    shortcut: "Backspace",
                    danger: true,
                    disabled: Boolean(selected.locked),
                    onSelect: deleteSelected,
                  },
                ] satisfies MenuItem[])
              : ([
                  {
                    label: "Paste",
                    shortcut: "Ctrl+V",
                    disabled: !clipboardRef.current,
                    onSelect: () => pasteAt(menu.world),
                  },
                ] satisfies MenuItem[])
          }
        />
      )}
      {/* One formatting bar for every text-bearing object, shown while it is selected
          OR mid-edit — reaching for Bold should not first mean clicking out of the words
          you are typing. `textTarget` is the edited object when there is one, so the bar
          keeps formatting what has focus. */}
      {textTarget && isLabelable(textTarget) && (
        <TextToolbar
          // Prefixed, because SelectionPanel is a sibling keyed the same way and can be
          // showing for the SAME object — two children under one parent carrying the
          // identical key is a React duplicate-key error.
          key={`text:${textTarget.id}:${hist.ver}`}
          object={textTarget}
          onChange={(patch) => updateObject(textTarget.id, patch)}
          theme={theme}
        />
      )}
      {selected && !(selected.type === "note" && selected.bare) && (
        // key remounts the panel per selection, so its inputs re-seed from the
        // newly selected object instead of holding the previous one's values. hist.ver
        // does the same after an undo or redo moved the object out from under them.
        //
        // A free TEXT BOX is excluded: colour and size moved into TextToolbar, which
        // leaves the panel with nothing but Delete — and Delete already has the key and
        // the context menu. A 224px panel holding one button is not a panel.
        <SelectionPanel
          key={`panel:${selected.id}:${hist.ver}`}
          object={selected}
          onChange={updateSelected}
          onDelete={deleteSelected}
          theme={theme}
        />
      )}
      </>
      )}

      {/* Outside the readOnly gate on purpose: commenting is discussion, not editing, so
          a workspace VIEWER and a signed-in guest on a comment-tier link both get it. The
          routes decide what each of them may actually do — the panel only renders what it
          is told it is allowed to. */}
      <AnimatePresence>
      {commentsOpen && !hideUI && (
        <CommentsPanel
          key="comments"
          boardId={boardId}
          shareToken={initialShareToken}
          onClose={() => setCommentsOpen(false)}
          onThreadsChange={setThreads}
          selectedId={selectedThread}
          onSelect={setSelectedThread}
          pendingAnchor={pendingAnchor}
          onPendingResolved={() => setPendingAnchor(null)}
          onStartPlacing={() => setPlacing(true)}
          placing={placing}
          version={commentsVersion}
        />
      )}
      </AnimatePresence>
    </>
  )
}
