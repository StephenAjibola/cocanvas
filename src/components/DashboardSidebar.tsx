"use client"

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
  { view: "", label: "All Boards", glyph: icon(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>) },
  { view: "recent", label: "Recent", glyph: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>) },
  { view: "starred", label: "Starred", glyph: icon(<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z" />) },
]

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
  const view = params.get("view") ?? ""
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
      <Logo variant="light" className="mb-4 px-2" />
      <div className="mb-6">
        <WorkspaceSwitcher current={current} workspaces={workspaces} />
      </div>

      <nav className="flex flex-col gap-1">
        {VIEWS.map((v) => (
          <Link
            key={v.label}
            href={v.view ? `/dashboard?view=${v.view}` : "/dashboard"}
            className={rowClass(pathname === "/dashboard" && view === v.view)}
          >
            {v.glyph}
            {v.label}
          </Link>
        ))}
        {/* A VIEWER cannot delete anything, so Trash has nothing for them to do. */}
        {role !== "VIEWER" && (
          <Link href={TRASH.href} className={rowClass(pathname === TRASH.href)}>
            {TRASH.glyph}
            {TRASH.label}
          </Link>
        )}
      </nav>

      <h2 className="mt-7 mb-2 px-3 font-mono text-label-mono uppercase text-on-surface-variant">
        Workspaces
      </h2>
      <nav className="flex flex-col gap-1">
        {WORKSPACE_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={rowClass(
              l.href.startsWith("/dashboard?")
                ? pathname === "/dashboard" && view === "shared"
                : pathname === l.href,
            )}
          >
            {l.glyph}
            {l.label}
          </Link>
        ))}
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
