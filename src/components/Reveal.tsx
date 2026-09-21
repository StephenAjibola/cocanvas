"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import {
  REVEAL_DURATION,
  REVEAL_EASE,
  REVEAL_FROM,
  REVEAL_STAGGER,
  REVEAL_START,
  type RevealFrom,
} from "@/lib/motion"

/**
 * Before paint on the client, a no-op on the server.
 *
 * It has to be the layout effect: `gsap.from` leaves the element at its FINAL state until
 * the tween is built, so running it after paint shows one frame of the finished page and
 * then yanks it back to the start. Plain useEffect here is a visible flash on every load.
 */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect

/**
 * One entrance, wrapped around whatever should perform it.
 *
 * A wrapper rather than a hook per section because the landing page is a server component
 * — this is the client boundary, and keeping it to a single leaf means the page, its copy
 * and its images all still render on the server.
 *
 * Why `gsap.from` and not a hidden-by-default class: the page is served complete and
 * visible. If this component never mounts — JS blocked, hydration failed, a crawler
 * reading the markup — the content is simply there, unanimated. Starting from opacity:0
 * in CSS would make the whole pitch depend on a tween firing.
 */
export function Reveal({
  children,
  from = "up",
  delay = 0,
  stagger = false,
  load = false,
  className,
}: {
  children: React.ReactNode
  /** Which direction the element travels in from. */
  from?: RevealFrom
  delay?: number
  /** Animate the direct children in sequence instead of the wrapper as one block. */
  stagger?: boolean
  /** Play once on mount rather than waiting for the element to scroll into view. */
  load?: boolean
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useBeforePaint(() => {
    const el = ref.current
    if (!el) return
    // Leave the page exactly as served — no fade to sit through, no transform to undo.
    // MotionProvider covers Framer for the rest of the app; GSAP runs on its own ticker
    // outside React and has to ask separately, the same way BoardCanvas does.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    gsap.registerPlugin(ScrollTrigger)

    // context() so cleanup is one call: it kills the tween, kills the ScrollTrigger it
    // created, and strips the inline styles GSAP wrote back off the element.
    const ctx = gsap.context(() => {
      gsap.from(stagger ? el.children : el, {
        opacity: 0,
        ...REVEAL_FROM[from],
        duration: REVEAL_DURATION,
        ease: REVEAL_EASE,
        delay,
        stagger: stagger ? REVEAL_STAGGER : 0,
        // `once`: an entrance, not a scrubbed effect. Replaying every time a section
        // re-crosses the line is what makes a scrolling page tiring to read twice.
        scrollTrigger: load ? undefined : { trigger: el, start: REVEAL_START, once: true },
      })
    }, el)
    return () => ctx.revert()
  }, [from, delay, stagger, load])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
