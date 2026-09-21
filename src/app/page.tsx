import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Logo } from "@/components/Logo"
import { Reveal } from "@/components/Reveal"
import { REVEAL_HERO_IMAGE_DELAY, revealSides } from "@/lib/motion"

/**
 * The public landing page. Replaces the placeholder that rendered the logo alone on the
 * hero gradient for everyone, signed in or not.
 *
 * Everything claimed here is built and reachable: the screenshots are captures of this
 * app, and the copy names only features the board and dashboard actually ship. No
 * metrics, testimonials or customer logos — there are none to report, and inventing them
 * is the one thing a portfolio piece cannot afford.
 */
export const metadata = {
  description:
    "A real-time collaborative whiteboard: draw, add sticky notes and shapes, start from a template, and work the same board with your team.",
}

/** Copy and image for one feature row; `flip` puts the image on the left. */
const FEATURES = [
  {
    title: "See each other work",
    body: "Everyone on the board gets a live cursor with their name on it, and an avatar in the header while they are here. Edits land on everyone's canvas as they happen.",
    src: "/marketing/collaboration.jpg",
    alt: "A CoCanvas Kanban board with a second collaborator's labelled cursor on a card and their avatar in the header",
    flip: false,
  },
  {
    title: "Start from a template, not a blank page",
    body: "Twelve starting points — Sprint Kanban, SWOT, mind map, user flow, persona profile and more. Each one opens a real board you can rearrange, extend or clear out.",
    src: "/marketing/templates.jpg",
    alt: "The CoCanvas templates gallery, showing twelve template cards",
    flip: true,
  },
  {
    title: "Draw, connect, annotate",
    body: "Freehand ink, shapes, arrows that stay attached as you move things, text and sticky notes. Arrows re-route themselves when the boxes they join move.",
    src: "/marketing/board-mindmap.jpg",
    alt: "A CoCanvas mind map board with labelled boxes joined by arrows",
    flip: false,
  },
  {
    title: "Share a workspace with a code",
    body: "Invite teammates by email, or hand out a workspace join code that anyone signed in can redeem. Boards can stay workspace-only, or open to anyone with the link for viewing or commenting.",
    src: "/marketing/share-join-code.jpg",
    alt: "The Share and access dialog showing a workspace join code and link access options",
    flip: true,
  },
] as const

function SignUp({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/signup"
      className={`inline-flex items-center justify-center rounded-full bg-accent-500 px-5 py-2.5 font-medium text-white shadow-1 transition-colors hover:bg-accent-700 ${className}`}
    >
      Get started
    </Link>
  )
}

export default async function Home() {
  // Someone already signed in has no use for the pitch — send them to their boards.
  if (await auth()) redirect("/dashboard")

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <header className="sticky top-0 z-50 border-b border-outline-variant bg-surface-container-lowest/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Logo variant="light" href="/" />
          <nav className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-full px-4 py-2 text-body-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-accent-500 px-4 py-2 text-body-sm font-medium text-white transition-colors hover:bg-accent-700"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="bg-hero">
          <div className="mx-auto max-w-6xl px-6 pb-16 pt-20 text-center">
            <Reveal load stagger>
              <h1 className="mx-auto max-w-3xl">A shared canvas for thinking out loud</h1>
              <p className="mx-auto mt-4 max-w-2xl text-body-lg text-on-surface-variant">
                CoCanvas is a real-time collaborative whiteboard. Sketch, drop sticky notes and
                shapes, start from a template, and work the same board as your team — cursors and
                all.
              </p>
              <SignUp className="mt-8" />
            </Reveal>

            {/* A capture of the app, not an illustration: the Sprint Kanban template on a
                real board, with the tool rail and zoom controls as they ship. */}
            <Reveal load from="scale" delay={REVEAL_HERO_IMAGE_DELAY} className="mt-14">
              <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-2">
                <Image
                  src="/marketing/board-kanban.jpg"
                  alt="A CoCanvas board showing a Sprint Kanban template with cards across To Do, In Progress, Testing and Done"
                  width={1400}
                  height={655}
                  priority
                  className="w-full"
                />
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-6xl space-y-24 px-6 py-24">
          {FEATURES.map((f) => {
            const sides = revealSides(f.flip)
            return (
              <div key={f.title} className="grid items-center gap-10 lg:grid-cols-2">
                <Reveal from={sides.text} className={f.flip ? "lg:order-2" : undefined}>
                  <h2>{f.title}</h2>
                  <p className="mt-3 text-body-lg text-on-surface-variant">{f.body}</p>
                </Reveal>
                {/* The card, not the Reveal wrapper, carries the hover: GSAP owns the
                    wrapper's transform for the entrance, and a CSS hover scale on the same
                    element would fight it mid-tween. */}
                <Reveal from={sides.image} className={f.flip ? "lg:order-1" : undefined}>
                  <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-1 transition-[scale,box-shadow] duration-200 hover:scale-[1.02] hover:shadow-1-hover">
                    <Image src={f.src} alt={f.alt} width={1400} height={655} className="w-full" />
                  </div>
                </Reveal>
              </div>
            )
          })}
        </section>

        <section className="border-t border-outline-variant bg-surface-container-low">
          <div className="mx-auto max-w-6xl px-6 py-20 text-center">
            <Reveal stagger>
              <h2>Open a canvas</h2>
              <SignUp className="mt-6" />
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-outline-variant bg-surface-container-lowest">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <Logo variant="light" />
          <p className="text-body-sm text-on-surface-variant">
            © {new Date().getFullYear()} CoCanvas
          </p>
        </div>
      </footer>
    </div>
  )
}
