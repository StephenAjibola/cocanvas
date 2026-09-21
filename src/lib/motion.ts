/**
 * Shared motion values for the UI chrome.
 *
 * Here rather than inline so the dashboard's two grids enter identically — a board card
 * and a board-type card arriving on different curves is the kind of mismatch nobody can
 * name but everybody feels. Data only, no React: this file is imported by server and
 * client components alike.
 *
 * The house style for chrome is SHORT. 150-250ms, small travel, no bounce — motion here
 * is meant to say "this arrived", not to be watched. The overshoot lives on the canvas,
 * where an object being placed is a physical event; see DROP_EASE in lib/notes.ts.
 */

/** Seconds between one card starting and the next. */
const STAGGER = 0.035

/**
 * The grid. Carries no visual change of its own — it exists to own the stagger, which is
 * why `hidden` and `show` are empty apart from the transition.
 */
export const RISE_GRID = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER } },
}

/**
 * One card: up and in.
 *
 * 8px of travel, deliberately. Enough to read as arriving from below, small enough that a
 * grid of twelve does not look like a wave — and short enough that the last card in the
 * stagger is still in under half a second.
 */
export const RISE_ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" as const } },
}

/**
 * A dialog: scale and fade, centred.
 *
 * 0.96 not 0.8 — a modal that grows from small reads as a notification popping up. This
 * is closer to a focus pull: it is already the size it will be, it just resolves.
 */
export const DIALOG = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.16, ease: "easeOut" as const } },
  // Faster out than in. Leaving should feel like getting out of the way.
  gone: { opacity: 0, scale: 0.98, transition: { duration: 0.12, ease: "easeIn" as const } },
}

/** The backdrop fades on its own — scaling it would scale the whole screen. */
export const SCRIM = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.16 } },
  gone: { opacity: 0, transition: { duration: 0.12 } },
}

/**
 * Press feedback for a primary button.
 *
 * 0.97, which is about a pixel on a 40px button — you feel it far more than you see it,
 * which is the point. Spread onto a motion.button as {...PRESS}.
 */
export const PRESS = {
  whileTap: { scale: 0.97 },
  transition: { duration: 0.12, ease: "easeOut" as const },
}

/**
 * The landing page's one entrance: fade, plus a little travel from wherever the element
 * belongs. Deliberately a single pattern reused four ways rather than an effect per
 * section — a marketing page that performs a different trick at every scroll position
 * reads as a demo of a scroll library, not as a product.
 *
 * Longer and further than the chrome values above (0.22s / 8px): those fire on a click
 * you just made, these fire on a section you are arriving at, and have a whole viewport
 * of travel to feel proportionate to.
 */
export const REVEAL_DURATION = 0.5
export const REVEAL_EASE = "power2.out"
/** Seconds between staggered siblings — headline, then subhead, then button. */
export const REVEAL_STAGGER = 0.09
/**
 * Where a section starts animating: its top at 78% of the viewport height, i.e. just
 * after it crosses into view from below. Earlier and the motion is over before you look
 * at it; later and you watch a blank gap fill in.
 */
export const REVEAL_START = "top 78%"

/**
 * How long the hero screenshot waits behind the text above it.
 *
 * Long enough to land after the button (three staggered lines at REVEAL_STAGGER, plus
 * most of one duration) so the eye finishes the sentence before the picture arrives —
 * the order the page is meant to be read in.
 */
export const REVEAL_HERO_IMAGE_DELAY = 0.3

/**
 * Travel per direction, in px. `scale` is the hero screenshot — it has no side to come
 * from, sitting centred under the text, so it resolves in place instead.
 */
export const REVEAL_FROM = {
  up: { y: 24 },
  left: { x: -28 },
  right: { x: 28 },
  scale: { scale: 0.97 },
} as const

export type RevealFrom = keyof typeof REVEAL_FROM

/**
 * Which side each half of a feature row enters from.
 *
 * Each half comes from its OWN outer edge, so the row closes inward as you reach it. The
 * failure this exists to prevent is both halves sliding the same way, which reads as the
 * page shifting sideways rather than as a row assembling — and which is invisible in
 * review precisely because each half looks right on its own.
 */
export function revealSides(flip: boolean): {
  text: "left" | "right"
  image: "left" | "right"
} {
  // `flip` puts the image on the left and the text on the right; see FEATURES in page.tsx.
  return flip ? { text: "right", image: "left" } : { text: "left", image: "right" }
}
