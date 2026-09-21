"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Logo } from "@/components/Logo"
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher"

type Role = "OWNER" | "EDITOR" | "VIEWER"

const icon = (d: React.ReactNode) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0"
  >
    {d}
  </svg>
)

/**
 * The board views. These are FILTERS over the same list rather than separate pages —
 * `?view=` on /dashboard — so switching between them costs a server render of one grid
 * instead of four routes that each have to re-derive the same query.
 */
const VIEWS = [
  // Recent is the bare /dashboard now: the front page shows what you last opened, so the
  // row that names that view is the row that points at the front page.
  { view: "", label: "Recent", glyph: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>) },
  // All Boards keeps the complete, uncapped list it always had — it just needs a view of
  // its own now that the front page is no longer it.
  { view: "all", label: "All Boards", glyph: icon(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>) },
  { view: "starred", label: "Starred", glyph: icon(<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z" />) },
]

/**
 * Templates, and Trash: the two rows that are their own ROUTE rather than a view of the
 * board list, which is why neither is in VIEWS above.
 *
 * Templates moved here off the dashboard's front page. As a permanent row above the
 * board grid it competed with the boards themselves on every visit, and the thing you
 * came for is your work — starting a new one from a template is a deliberate act, so it
 * gets a deliberate place to go.
 */
const TEMPLATES = {
  href: "/dashboard/templates",
  label: "Templates",
  // A page with a smaller page behind it — the "copy this to start" idea, and distinct
  // from the four-square All Boards grid it sits under.
  glyph: icon(<><rect x="8" y="3" width="13" height="13" rx="1.5" /><path d="M16 19H4.5A1.5 1.5 0 013 17.5V6" /></>),
}

const TRASH = {
  href: "/dashboard/trash",
  label: "Trash",
  glyph: icon(<><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>),
}

/**
 * The workspace section.
 *
 * "Team Workspaces" is where PEOPLE lives now. The mockup does not picture a People
 * entry, but the invite/roles/members feature is real, shipped and reachable from
 * nowhere else — dropping it to match a mockup would delete working functionality. It
 * belongs here on the merits: managing who is in a workspace IS workspace management.
 */
const WORKSPACE_LINKS = [
  {
    href: "/dashboard/people",
    label: "Team Workspaces",
    glyph: icon(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 9.5a3 3 0 100-6" /><path d="M15.5 14.2c2.6.5 4.5 2.8 4.5 5.8" /></>),
  },
  {
    href: "/dashboard?view=shared",
    label: "Shared Folders",
    glyph: icon(<><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></>),
  },
]

/**
 * A nav row: the link, and an instant pending state while its navigation is in flight.
 *
 * The pending state is OPTIMISTIC — set from this component on click, not read from the
 * router — and that is the whole point. These rows point at fully dynamic pages, so the
 * server takes 0.5-3s to answer, and until it does Next leaves the current page on screen
 * with the URL unchanged. Nothing says the click registered, which is why the rows have
 * now been reported as dead twice.
 *
 * The previous attempt read `useLinkStatus().pending` instead. It did not work: measured
 * against a 513ms navigation, `pending` first turned true at 514ms — the moment the new
 * page committed and the feedback was no longer needed. Owning the state here means the
 * row lights up on the click itself, before any of the round trip has happened.
 *
 * `loading.tsx` covers the other half — the CONTENT area — but only when the route
 * segment changes. Switching ?view= re-renders the same segment and shows no loading
 * boundary at all, so for three of these five rows this is the only feedback there is.
 */
function NavRow({
  href,
  glyph,
  label,
  active,
  pending,
  onNavigate,
  className,
}: {
  href: string
  glyph: React.ReactNode
  label: string
  active: boolean
  pending: boolean
  onNavigate: (href: string) => void
  className: string
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        // A modifier click opens a new tab and leaves THIS page where it is, so marking
        // the row pending would light up a navigation that is never going to happen here.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        onNavigate(href)
      }}
    >
      {glyph}
      {label}
      {/* Only while pending AND not yet arrived — the row it lands on is already
          highlighted, and a spinner that outlives its navigation is its own bug. */}
      {pending && !active && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className="ml-auto shrink-0 animate-spin"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
          <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      )}
    </Link>
  )
}

export function DashboardSidebar({
  currentWorkspaceId,
  workspaces,
  role,
}: {
  currentWorkspaceId: string
  workspaces: { id: string; name: string; role: Role }[]
  role: Role
}) {
  const pathname = usePathname()
  const params = useSearchParams()
  // "recent" is the old URL for what is now the bare front page — normalised here so an
  // existing bookmark still lights up the row it belongs to.
  const raw = params.get("view") ?? ""
  const view = raw === "recent" ? "" : raw
  /**
   * The href the browser is on, written the same way the rows above write theirs, so a
   * row can be compared against it directly.
   */
  const here = pathname === "/dashboard" ? (view ? `/dashboard?view=${view}` : "/dashboard") : pathname
  /**
   * The row we are navigating TO, remembered together with the page we left FROM.
   *
   * Storing `from` is what makes this self-clearing with no effect and no timer: `here`
   * only changes once the new page commits, so the moment it does, the stored `from` no
   * longer matches and the pending state is stale by construction. That covers arriving,
   * the back button, and a navigation started anywhere else on the page.
   */
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null)
  const pendingHref = pending && pending.from === here ? pending.href : null
  const current = workspaces.find((w) => w.id === currentWorkspaceId) ?? {
    id: currentWorkspaceId,
    name: "Workspace",
    role,
  }

  const rowClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded px-3 py-2 text-body-sm font-medium transition-colors ${
      active
        ? "bg-primary-fixed text-on-primary-fixed"
        : "text-on-surface-variant hover:bg-surface-container"
    }`

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-outline-variant bg-surface-container-lowest px-4 py-6">
      <Logo variant="light" href="/dashboard" className="mb-4 px-2" />
      <div className="mb-6">
        <WorkspaceSwitcher current={current} workspaces={workspaces} />
      </div>

      <nav className="flex flex-col gap-1">
        {VIEWS.map((v) => {
          const href = v.view ? `/dashboard?view=${v.view}` : "/dashboard"
          return (
            <NavRow
              key={v.label}
              href={href}
              glyph={v.glyph}
              label={v.label}
              active={pathname === "/dashboard" && view === v.view}
              pending={pendingHref === href}
              onNavigate={(href) => setPending({ href, from: here })}
              className={rowClass(pathname === "/dashboard" && view === v.view)}
            />
          )
        })}
        {/* Open to a VIEWER too: the page itself decides what they can do with it, and
            it is worth being able to see what a template IS before asking for access to
            create one. */}
        <NavRow
          href={TEMPLATES.href}
          glyph={TEMPLATES.glyph}
          label={TEMPLATES.label}
          active={pathname === TEMPLATES.href}
          pending={pendingHref === TEMPLATES.href}
          onNavigate={(href) => setPending({ href, from: here })}
          className={rowClass(pathname === TEMPLATES.href)}
        />
        {/* A VIEWER cannot delete anything, so Trash has nothing for them to do. */}
        {role !== "VIEWER" && (
          <NavRow
            href={TRASH.href}
            glyph={TRASH.glyph}
            label={TRASH.label}
            active={pathname === TRASH.href}
            pending={pendingHref === TRASH.href}
            onNavigate={(href) => setPending({ href, from: here })}
            className={rowClass(pathname === TRASH.href)}
          />
        )}
      </nav>

      <h2 className="mt-7 mb-2 px-3 font-mono text-label-mono uppercase text-on-surface-variant">
        Workspaces
      </h2>
      <nav className="flex flex-col gap-1">
        {WORKSPACE_LINKS.map((l) => {
          const active = l.href.startsWith("/dashboard?")
            ? pathname === "/dashboard" && view === "shared"
            : pathname === l.href
          return (
            <NavRow
              key={l.href}
              href={l.href}
              glyph={l.glyph}
              label={l.label}
              active={active}
              pending={pendingHref === l.href}
              onNavigate={(href) => setPending({ href, from: here })}
              className={rowClass(active)}
            />
          )
        })}
      </nav>

      {/**
       * Upgrade card — PRESENTATIONAL ONLY, and deliberately so.
       *
       * There is no billing in this app: no plan tier on Workspace, no payment provider,
       * no entitlement check anywhere. Wiring a real upgrade flow is a product decision
       * with legal and financial consequences, not a layout task, so this renders the
       * card the mockup asks for and stops short of pretending a purchase exists. The
       * button is inert until somebody confirms that billing is actually in scope.
       */}
      <div className="mt-auto rounded-lg border border-outline-variant bg-primary-fixed/40 p-4">
        <p className="text-body-sm font-semibold text-on-surface">Upgrade to Pro</p>
        <p className="mt-1 text-label-mono font-sans leading-relaxed text-on-surface-variant">
          Unlimited boards, version history and advanced sharing.
        </p>
        <button
          type="button"
          disabled
          title="Billing isn't wired up yet"
          className="mt-3 w-full cursor-not-allowed rounded-full bg-primary px-3 py-2 text-body-sm font-medium text-on-primary opacity-60"
        >
          Upgrade
        </button>
      </div>
    </aside>
  )
}
