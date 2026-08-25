/**
 * WCAG relative luminance and contrast ratio.
 *
 * Real photometry, not a lightness proxy: the sRGB channels are gamma-decoded and
 * weighted for human sensitivity (green counts for ~72%, blue for ~7%), which is why a
 * mid-blue and a mid-yellow of the same nominal "brightness" are wildly different to
 * read against. Averaging the raw channels — the shortcut theme.test.ts uses for its
 * much weaker "are these two obviously different" check — gets that badly wrong, and
 * body text on a shape is exactly where it would show.
 *
 * Lives here rather than in notes.ts because shape colors come from a free color
 * input: there is no palette to look the answer up in, so it has to be computed.
 */

/** The WCAG AA bar for normal-size text. */
export const READABLE = 4.5

/** Channels of a #rgb or #rrggbb color, or null if it isn't one. */
function channels(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, "")
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  if (h.length !== 6 || !/^[0-9a-f]{6}$/i.test(h)) return null
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ]
}

/** Gamma expansion — the step that separates this from a lightness average. */
const linearize = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** WCAG relative luminance, 0 (black) to 1 (white). NaN for an unparseable color. */
export function relativeLuminance(hex: string) {
  const ch = channels(hex)
  if (!ch) return NaN
  const [r, g, b] = ch.map(linearize)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Contrast ratio between two colors, 1 (identical) to 21 (black on white).
 *
 * Returns 0 for anything unparseable, so an unrecognised color can never be mistaken
 * for a readable one — callers fall back instead of painting invisible text.
 */
export function contrastRatio(a: string, b: string) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  if (Number.isNaN(la) || Number.isNaN(lb)) return 0
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * `preferred` when it is legible on `bg`, otherwise `fallback`.
 *
 * What makes a shape's label take the shape's own color — which reads as cohesive and
 * is what diagram tools do — without that becoming invisible text the moment somebody
 * picks near-black on a dark board. The free color input makes that one click away.
 */
export function readableInk(preferred: string, bg: string, fallback: string) {
  return contrastRatio(preferred, bg) >= READABLE ? preferred : fallback
}
