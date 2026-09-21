"use client"

import { MotionConfig } from "framer-motion"

/**
 * One place where "respect the OS reduced-motion setting" is declared for the whole app.
 *
 * `reducedMotion="user"` makes every Framer animation under it drop transforms — scale,
 * slide, the dashboard stagger — while keeping opacity, so a card still fades in and a
 * dialog still appears; they just stop moving. Per-component useReducedMotion() would be
 * the same decision written eight times and forgotten on the ninth.
 *
 * This does NOT reach the canvas. GSAP runs on its own ticker, outside React entirely,
 * so BoardCanvas asks for the setting itself — see reduceMotion() there.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
