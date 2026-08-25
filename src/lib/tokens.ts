/**
 * CSS custom properties, read once, for the code that cannot use them.
 *
 * A canvas 2D context takes colour strings — `ctx.fillStyle = "var(--accent)"` is not a
 * thing. Without this, every canvas colour has to be a literal, which is exactly how the
 * comment pin ended up hardcoded to an accent value that then went stale the moment the
 * palette changed. This keeps the stylesheet as the single source of truth for canvas
 * paint too.
 *
 * Read once and cached rather than per draw: getComputedStyle forces a style resolution,
 * and the draw loop runs at pointer rate. The cache is invalidated by nothing, because
 * these tokens are static for the life of the document — there is no runtime theme
 * switch on the page chrome (see the note on dark mode in globals.css).
 */

const cache = new Map<string, string>()

/**
 * Resolves a custom property off the document root.
 *
 * `fallback` is not defensive padding — it is what server-side rendering and the first
 * paint before stylesheets resolve actually need, and it keeps this usable from a Node
 * test where there is no document at all.
 */
export function cssVar(name: string, fallback: string): string {
  const cached = cache.get(name)
  if (cached) return cached

  if (typeof window === "undefined" || typeof document === "undefined") return fallback

  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const resolved = value || fallback
  cache.set(name, resolved)
  return resolved
}

/** The tokens the canvas renderer paints with, resolved from the stylesheet. */
export function canvasTokens() {
  return {
    /** Open comment pins. */
    accent: cssVar("--accent", "#6D4FEB"),
    /** Resolved pins — the muted-on-navy neutral, which reads as "settled". */
    muted: cssVar("--paper-500", "#9ba6c6"),
    /** Alignment guides. The interaction pink, so a guide reads as the app talking. */
    guide: cssVar("--pink-400", "#e87ba8"),
    /**
     * The quick-add "+" on a column.
     *
     * A white chip with a hairline edge and the accent for the cross: it has to read as
     * a CONTROL sitting on the board rather than as another card, and the templates it
     * appears on are all pale lanes where a filled accent circle would shout.
     */
    addFill: cssVar("--surface-container-lowest", "#ffffff"),
    addEdge: cssVar("--outline-variant", "#cbd5e1"),
    addInk: cssVar("--primary", "#7F00FF"),
  }
}
