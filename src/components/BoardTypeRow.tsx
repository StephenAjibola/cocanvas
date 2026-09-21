"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { RISE_GRID, RISE_ITEM, PRESS } from "@/lib/motion"

/**
 * "Create new" — the board TYPES, which is a different question from the template row.
 *
 * A template decides what is already drawn on a board; a type decides what the board IS.
 * Only Whiteboard exists today, so the other three are placeholders and say so.
 *
 * They are real disabled <button>s rather than divs styled to look inert: a disabled
 * button cannot be clicked, cannot be tabbed to, and announces itself as disabled, so
 * there is no version of this that silently swallows a click. The cursor, the dimming and
 * the "Coming soon" pill are three independent tells before you even press.
 *
 * The previews are CSS, not artwork — a few gradients each. They exist to tell the four
 * surfaces apart at a glance, which is the whole job of this row, and an asset per card
 * would be four files to keep in sync with a palette they should just follow.
 */
/**
 * A Link that can take variants. `display: contents` cannot be the answer here — a
 * contents box has no layout box, so it cannot be transformed, and the card would fade
 * without ever moving.
 */
const MotionLink = motion.create(Link)

const SURFACE = {
  whiteboard: {
    // White with the same dot grid the light canvas actually opens on.
    background: "#ffffff",
    backgroundImage: "radial-gradient(#c9ccd6 1px, transparent 1px)",
    backgroundSize: "12px 12px",
  },
  chalkboard: {
    // Slate green: a fine noise grain for the slate, then three dot layers at co-prime
    // tile sizes so the chalk dust scatters instead of lining up into a grid. Same
    // abstract-pattern language as the other three — texture, no drawing.
    background: "#1f2b26",
    backgroundImage:
      "radial-gradient(rgba(255,255,255,.26) .7px, transparent 1.2px)," +
      "radial-gradient(rgba(255,255,255,.16) .6px, transparent 1px)," +
      "radial-gradient(rgba(255,255,255,.1) 1px, transparent 1.6px)," +
      `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.09'/%3E%3C/svg%3E")`,
    backgroundSize: "23px 19px, 13px 17px, 37px 29px, 120px 120px",
    backgroundPosition: "3px 5px, 9px 2px, 17px 11px, 0 0",
  },
  architecture: {
    // Blueprint navy: a fine grid with every fourth line drawn heavier.
    background: "#12233f",
    backgroundImage:
      "linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px)," +
      "linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)," +
      "linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px)," +
      "linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px)",
    backgroundSize: "32px 32px, 32px 32px, 8px 8px, 8px 8px",
  },
  notebook: {
    // Ruled cream with the margin rule down the left.
    background: "#fdfbf4",
    backgroundImage:
      "linear-gradient(90deg, transparent 15px, rgba(200,90,90,.45) 15px, rgba(200,90,90,.45) 16px, transparent 16px)," +
      "repeating-linear-gradient(#fdfbf4 0 13px, #cfd6e4 13px 14px)",
  },
} satisfies Record<string, React.CSSProperties>

const SOON: { key: keyof typeof SURFACE; name: string; hint: string }[] = [
  { key: "chalkboard", name: "Chalkboard", hint: "Dark surface for sketching and teaching" },
  { key: "architecture", name: "Architecture Board", hint: "Scaled drawings on a blueprint grid" },
  { key: "notebook", name: "Notebook", hint: "Ruled pages for longer-form notes" },
]

/** One shell, so a real card and a placeholder are the same object at different states. */
const CARD =
  "relative flex flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest text-left shadow-1 transition-[box-shadow,border-color]"

function Preview({ look }: { look: React.CSSProperties }) {
  return <span aria-hidden className="block h-20 w-full border-b border-outline-variant" style={look} />
}

/**
 * The pill rides on the preview rather than beside the title: at five to a row a name as
 * long as "Architecture Board" and a badge cannot share a line without one of them
 * wrapping raggedly, and the corner is where a status badge is looked for anyway.
 */
function Soon() {
  return (
    <span className="absolute right-2 top-2 rounded-full border border-outline-variant bg-surface-container-lowest px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-on-surface-variant">
      Coming soon
    </span>
  )
}

function Body({ name, hint }: { name: string; hint: string }) {
  return (
    <span className="flex flex-1 flex-col p-3">
      <span className="block text-body-sm font-semibold text-on-surface">{name}</span>
      <span className="mt-0.5 block text-body-sm text-on-surface-variant">{hint}</span>
    </span>
  )
}

export function BoardTypeRow({
  canCreate,
  createWhiteboard,
}: {
  canCreate: boolean
  createWhiteboard: () => Promise<void>
}) {
  return (
    <motion.div
      className="grid grid-cols-2 gap-gutter lg:grid-cols-5"
      variants={RISE_GRID}
      initial="hidden"
      animate="show"
    >
      {/* Whiteboard is the create action that used to be the "New canvas" button — same
          server action, same board, just given the shape of the thing it makes. */}
      {/* The form is `display: contents`, so the BUTTON is the grid cell — and therefore
          the thing that has to carry the stagger variant and the press. */}
      <form action={createWhiteboard} className="contents">
        <motion.button
          type="submit"
          disabled={!canCreate}
          variants={RISE_ITEM}
          {...PRESS}
          className={`${CARD} hover:border-primary hover:shadow-1-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-outline-variant`}
        >
          <Preview look={SURFACE.whiteboard} />
          <Body name="Whiteboard" hint="A blank canvas with a dot grid" />
        </motion.button>
      </form>

      {SOON.map(({ key, name, hint }) => (
        <motion.button
          key={key}
          type="button"
          disabled
          variants={RISE_ITEM}
          title={`${name} — coming soon`}
          className={`${CARD} cursor-not-allowed`}
        >
          <Preview look={SURFACE[key]} />
          <Soon />
          <span className="flex flex-1 opacity-55">
            <Body name={name} hint={hint} />
          </span>
        </motion.button>
      ))}

      <MotionLink href="/dashboard/templates" variants={RISE_ITEM} className={`${CARD} hover:border-primary hover:shadow-1-hover`}>
        {/* The template card shows a stack rather than a surface, because it is the one
            card here that opens a CHOICE instead of a board. */}
        <span
          aria-hidden
          className="flex h-20 w-full items-center justify-center border-b border-outline-variant bg-surface-container"
        >
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-on-surface-variant">
            <rect x="6" y="3" width="14" height="14" rx="2" />
            <path d="M16 20H6a2 2 0 0 1-2-2V7" />
          </svg>
        </span>
        <Body name="Start from template" hint="Kanban, mind map, SWOT and more" />
      </MotionLink>
    </motion.div>
  )
}
