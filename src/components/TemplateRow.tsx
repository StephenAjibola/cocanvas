import Link from "next/link"
import { TEMPLATE_HINTS, TEMPLATE_IDS, TEMPLATE_NAMES, type TemplateId } from "@/lib/templates"

/**
 * "Start from a Template".
 *
 * Names and hints come from lib/templates.ts rather than being restated here, so adding a
 * template is one edit and a card cannot describe something the seed does not build. Only
 * the icon and tint live locally — those are presentation, and the seed has no opinion
 * about them.
 */
const LOOK: Record<TemplateId, { tint: string; glyph: React.ReactNode }> = {
  brainstorming: {
    tint: "bg-tertiary-fixed text-on-tertiary-fixed",
    glyph: <><circle cx="12" cy="12" r="3.5" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>,
  },
  kanban: {
    tint: "bg-primary-fixed text-on-primary-fixed",
    glyph: <><rect x="3" y="4" width="4" height="16" rx="1" /><rect x="9" y="4" width="4" height="11" rx="1" /><rect x="15" y="4" width="4" height="7" rx="1" /></>,
  },
  mindmap: {
    tint: "bg-secondary-fixed text-on-secondary-fixed",
    glyph: <><circle cx="12" cy="12" r="3" /><circle cx="4" cy="5" r="2" /><circle cx="20" cy="5" r="2" /><circle cx="20" cy="19" r="2" /><path d="M9.6 10.4L5.6 6.6M14.4 10.4l4-3.8M14.4 13.6l4 3.8" /></>,
  },
  swot: {
    tint: "bg-primary-fixed text-on-primary-fixed",
    glyph: <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /></>,
  },
  journey: {
    tint: "bg-tertiary-fixed text-on-tertiary-fixed",
    glyph: <><path d="M3 18c4-1 5-10 9-10s5 6 9 5" /><circle cx="3" cy="18" r="1.6" /><circle cx="21" cy="13" r="1.6" /></>,
  },
  userflow: {
    tint: "bg-secondary-fixed text-on-secondary-fixed",
    glyph: <><rect x="2" y="9" width="6" height="6" rx="1" /><path d="M15 12l-3-3-3 3 3 3z" /><rect x="17" y="9" width="5" height="6" rx="1" /><path d="M8 12h1M15 12h2" /></>,
  },
  affinity: {
    tint: "bg-primary-fixed text-on-primary-fixed",
    glyph: <><rect x="3" y="4" width="6" height="6" rx="1" /><rect x="7" y="9" width="6" height="6" rx="1" /><rect x="14" y="5" width="6" height="6" rx="1" /><rect x="15" y="13" width="6" height="6" rx="1" /></>,
  },
  persona: {
    tint: "bg-tertiary-fixed text-on-tertiary-fixed",
    glyph: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" /></>,
  },
  roadmap: {
    tint: "bg-secondary-fixed text-on-secondary-fixed",
    glyph: <><rect x="3" y="5" width="10" height="4" rx="1" /><rect x="7" y="11" width="12" height="4" rx="1" /><rect x="4" y="17" width="8" height="4" rx="1" /></>,
  },
  blueprint: {
    tint: "bg-primary-fixed text-on-primary-fixed",
    glyph: <><path d="M3 6h18M3 12h18M3 18h18" /><path d="M8 3v18" strokeDasharray="2 2" /></>,
  },
  usability: {
    tint: "bg-tertiary-fixed text-on-tertiary-fixed",
    glyph: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></>,
  },
  blank: {
    tint: "bg-surface-container-high text-on-surface",
    glyph: <rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 3" />,
  },
}

export function TemplateRow({
  canCreate,
  action,
  showHeading = true,
  /** The dashboard shows a row; the templates page shows the lot. */
  limit,
}: {
  canCreate: boolean
  action: (formData: FormData) => Promise<void>
  showHeading?: boolean
  limit?: number
}) {
  const ids = limit ? TEMPLATE_IDS.slice(0, limit) : TEMPLATE_IDS

  return (
    <section>
      {showHeading && (
        <div className="mb-4 flex items-baseline justify-between">
          <h2>Start from a Template</h2>
          <Link
            href="/dashboard/templates"
            className="text-body-sm text-primary hover:underline"
          >
            View all
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
        {ids.map((id) => (
          <form key={id} action={action} className="contents">
            <input type="hidden" name="template" value={id} />
            <button
              type="submit"
              disabled={!canCreate}
              // The whole card is the control. A card with a button inside it gives two
              // targets for one action and leaves most of the card inert.
              className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4 text-left transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-outline-variant"
            >
              <span
                aria-hidden
                className={`mb-3 flex h-10 w-10 items-center justify-center rounded ${LOOK[id].tint}`}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {LOOK[id].glyph}
                </svg>
              </span>
              <span className="block text-body-sm font-semibold text-on-surface">
                {TEMPLATE_NAMES[id]}
              </span>
              <span className="mt-0.5 block text-body-sm text-on-surface-variant">
                {TEMPLATE_HINTS[id]}
              </span>
            </button>
          </form>
        ))}
      </div>
    </section>
  )
}
