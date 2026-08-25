/**
 * Board canvas colors. Same principle as the Logo component: light background gets
 * dark elements, dark background gets light ones — one lookup, no theme context,
 * because every caller already knows which board it is rendering.
 *
 * `dark` and `light` are the original two-way toggle, kept under their own names on
 * purpose: they are the values already written to Board.theme by every board that
 * existed before the canvas panel, so widening the set costs no migration and no
 * backfill. They read as "Black" and "White" in the picker — the key is storage, the
 * label is the UI.
 */
export type Theme = "light" | "grey" | "blue" | "cream" | "dark"

export const THEMES = {
  light: { label: "White", bg: "#fafafa", dot: "#d4d4d4", stroke: "#171717" },
  // The three added canvases are all LIGHTER than they look like they should be, and the
  // reason is green. Every mid-tone swatch scores worse the darker the paper gets, and
  // #22c55e is the weakest in the palette — it clears the 2.0 stroke floor on white by
  // only 2.18, so a light grey at the obvious #ececec drags it to 1.93 and makes green
  // an invisible pen. These are the darkest values that keep the whole shipped palette
  // legible; theme.test.ts is what found that, and what will find it again.
  grey: { label: "Light grey", bg: "#f2f2f2", dot: "#c9c9c9", stroke: "#171717" },
  blue: { label: "Light blue", bg: "#edf3fc", dot: "#c3d5ec", stroke: "#171717" },
  cream: { label: "Cream", bg: "#faf4e4", dot: "#dccfae", stroke: "#171717" },
  dark: { label: "Black", bg: "#0a0a0a", dot: "#2b2b2b", stroke: "#ededed" },
} satisfies Record<Theme, { label: string; bg: string; dot: string; stroke: string }>

/**
 * Picker order: lightest to darkest, which is also the order the brief lists them in.
 *
 * Derived from THEMES rather than written out twice — Object.keys would lose the literal
 * types, so the tuple is explicit and the `satisfies` below is what makes it impossible
 * to add a canvas and forget to offer it.
 */
export const CANVAS_KEYS = ["light", "grey", "blue", "cream", "dark"] satisfies Theme[]

/**
 * How the grid is drawn under the objects.
 *
 * A board property rather than a viewer preference: two people looking at the same
 * board should see the same page. Stored in Board.gridStyle, validated here.
 */
export type GridStyle = "none" | "dot" | "line"

export const GRID_STYLES = ["none", "dot", "line"] satisfies GridStyle[]

export const GRID_LABELS: Record<GridStyle, string> = {
  none: "None",
  dot: "Dots",
  line: "Lines",
}

/** Narrows an untrusted value from the request body, same job as isTheme. */
export function isGridStyle(v: unknown): v is GridStyle {
  return v === "none" || v === "dot" || v === "line"
}

/**
 * Quick-pick hues, shown alongside the current theme's ink.
 *
 * Mid-tone on purpose: each has to stay legible on #0a0a0a and on #fafafa, since one
 * board can be either and a stroke keeps its color across a theme switch.
 *
 * Hues ONLY — no neutral belongs here. useBoardSync assigns peer cursor colors by
 * hashing into this list, and a grey cursor is one you lose track of on either board.
 * Neutrals join the palette in pickerSwatches instead.
 */
export const SWATCHES = [
  // Deeper than the obvious #eab308: a bright yellow scores 1.84 against the light
  // board's #fafafa, which is a stroke you cannot see. This one holds 2.8 on both and
  // still reads as yellow rather than as a second orange. See theme.test.ts.
  { color: "#ca8a04", label: "Yellow" },
  { color: "#ea580c", label: "Orange" },
  { color: "#ef4444", label: "Red" },
  { color: "#22c55e", label: "Green" },
  { color: "#3b82f6", label: "Blue" },
  { color: "#a855f7", label: "Purple" },
]

/**
 * The neutral in every picker.
 *
 * Mid-grey, and mid on purpose: it is the one neutral that survives both boards, where
 * a light grey disappears into #fafafa and a dark one into #0a0a0a.
 */
export const GREY = { color: "#7c8391", label: "Grey" }

/**
 * The preset row a color picker offers, for ink that has to be seen as a thin line.
 *
 * Theme ink leads, so returning to the default is one click rather than something to
 * match by eye — and it is also how the black/white end of the palette is covered.
 * Fixed black and white cannot both be offered here: black vanishes on a dark board and
 * white on a light one, so exactly one of them would always be a dead swatch. The
 * theme-aware default is the honest version of that pair.
 *
 * A function rather than a constant because it depends on the theme, and it replaces
 * the same two-line spread that the toolbar and the panel had each written for
 * themselves.
 */
export function pickerSwatches(theme: Theme) {
  return [{ color: THEMES[theme].stroke, label: "Default" }, ...SWATCHES, GREY]
}

/**
 * Extra presets offered for FILLS only.
 *
 * A filled area is large and carries its own outline, so it reads fine in a color that
 * would be invisible as a hairline — which is what lets cream and near-black be real
 * choices here when pickerSwatches has to refuse them.
 */
export const FILL_SWATCHES = [
  { color: "#fdf6e3", label: "Cream" },
  { color: "#171717", label: "Black" },
]

/** Narrows an untrusted value from the request body. */
export function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (CANVAS_KEYS as string[]).includes(v)
}
