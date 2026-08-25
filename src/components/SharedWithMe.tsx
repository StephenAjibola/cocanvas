import Link from "next/link"

type SharedBoard = {
  id: string
  name: string
  updatedAt: Date
  workspaceName: string
  sharedBy: string
  permission: "View only" | "Editor"
}

/**
 * Boards reaching you through somebody else's workspace.
 *
 * A LIST rather than another card grid, and that is the point of the section: these are
 * not yours to organise, you are visiting them. A row carries who shared it and what you
 * may do, which is the information a visitor actually needs — and none of it fits
 * comfortably on a thumbnail card.
 *
 * The permission badge is the caller's real Membership role, not a guess.
 */
export function SharedWithMe({ boards }: { boards: SharedBoard[] }) {
  if (!boards.length) {
    return (
      <section>
        <h2 className="mb-4">Shared with Me</h2>
        <p className="text-body-sm text-on-surface-variant">
          Nothing yet. Boards other people share with you show up here.
        </p>
      </section>
    )
  }

  return (
    <section>
      <h2 className="mb-4">Shared with Me</h2>
      <ul className="divide-y divide-outline-variant overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest">
        {boards.map((b) => (
          <li key={b.id}>
            <Link
              href={`/board/${b.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-container-low"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-primary-fixed text-on-primary-fixed"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M3 9h18" />
                </svg>
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-medium text-on-surface">
                  {b.name}
                </span>
                <span className="block truncate text-body-sm text-on-surface-variant">
                  {b.sharedBy} · {b.workspaceName}
                </span>
              </span>

              <span className="shrink-0 font-mono text-label-mono text-on-surface-variant">
                {new Date(b.updatedAt).toLocaleDateString()}
              </span>

              <span
                className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-label-mono uppercase ${
                  b.permission === "Editor"
                    ? "bg-primary-fixed text-on-primary-fixed"
                    : "bg-surface-container text-on-surface-variant"
                }`}
              >
                {b.permission}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
