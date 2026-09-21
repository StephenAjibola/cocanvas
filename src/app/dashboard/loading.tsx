/**
 * What the dashboard shows while a sidebar click is in flight.
 *
 * Without this file the click reads as DEAD, and it was reported that way twice. These
 * pages are fully dynamic — every view is database round trips to a remote Postgres — and
 * with no Suspense boundary Next has nowhere to paint until the server answers, so it
 * keeps the OLD page on screen, unchanged, for up to ~3s (measured: 2.9s cold on Trash,
 * 0.5s warm). The URL has not moved yet either, so there is genuinely nothing on screen
 * saying the click registered.
 *
 * A loading boundary fixes it at the source — Next paints this immediately on click and
 * swaps in the real page when it arrives. It covers Trash, Templates and People too.
 *
 * The blocks mirror the front page's real shapes — the five board-type cards, then the
 * thumbnail grid — so the swap lands content where the placeholders already were rather
 * than reflowing. Same card shell (white, Level 1 shadow) as the real thing.
 */
function Card({ preview }: { preview: string }) {
  return (
    <div className="overflow-hidden rounded-lg bg-surface-container-lowest shadow-1">
      <div className={`${preview} bg-surface-container`} />
      <div className="space-y-2 p-3">
        <div className="h-3.5 w-2/3 rounded bg-surface-container" />
        <div className="h-3 w-1/3 rounded bg-surface-container" />
      </div>
    </div>
  )
}

export default function DashboardLoading() {
  return (
    // aria-busy, and not a spinner graphic: a screen reader gets told the region is
    // loading, which the silent grey blocks below cannot say on their own.
    <div aria-busy="true" aria-label="Loading" className="animate-pulse space-y-10">
      <section>
        <div className="mb-4 h-8 w-48 rounded bg-surface-container" />
        <div className="grid grid-cols-2 gap-gutter lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Card key={i} preview="h-20" />
          ))}
        </div>
      </section>
      <section>
        <div className="mb-4 h-7 w-32 rounded bg-surface-container" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Card key={i} preview="h-36" />
          ))}
        </div>
      </section>
    </div>
  )
}
