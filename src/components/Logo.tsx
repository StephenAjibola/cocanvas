import Link from "next/link"

export function Logo({
  variant,
  mark = true,
  wordmark = true,
  href,
  className = "",
}: {
  variant: "light" | "dark"
  /**
   * Whether to draw the swirl beside the wordmark.
   *
   * On by default, including in the sidebar — it was dropped there once for competing
   * with the workspace name below it, and asked for back, so the header now carries the
   * same lockup as the auth pages and the tab icon. The prop stays because the board
   * header still wants the mark WITHOUT the wordmark (see `wordmark`).
   */
  mark?: boolean
  /**
   * Whether to draw the "CoCanvas" text. False leaves the mark alone — the board header
   * is a tight bar where the board's own name is the identity that matters, so the
   * product only needs its glyph there.
   */
  wordmark?: boolean
  /**
   * Makes the whole lockup a link. Supplied as /dashboard wherever the logo doubles as
   * the way home, which is the behaviour every app trains people to expect of it; left
   * undefined on the auth pages, where there is no "home" to go to yet.
   */
  href?: string
  className?: string
}) {
  /**
   * The CoCanvas mark and wordmark.
   *
   * The mark is the swirl ALONE — the blue badge ground it shipped on has been keyed out
   * and the shape re-fills as flat black or flat white, so it sits on whatever surface it
   * lands on instead of carrying a square of brand colour around with it. Both variants
   * come off one alpha mask, so they are the same shape at the same weight, and neither
   * has a single pixel of the original blue in it. See scripts/build-logo.py — re-run it
   * if the source artwork is ever replaced.
   *
   * `variant` names the SURFACE, not the ink: on a light surface the mark is black and
   * the wordmark is dark; on a dark one both go white.
   *
   * Plain <img> with a srcSet rather than next/image, because the three sizes are already
   * rendered as real files — resampled from the 1024px master, not scaled by the browser.
   * There is nothing left for the image pipeline to optimise, and width/height on the tag
   * reserves the box just as well.
   */
  const ink = variant === "light" ? "black" : "white"

  const shell = `flex items-center gap-2.5 ${className}`
  const inner = (
    <>
      {mark && (
      /* eslint-disable-next-line @next/next/no-img-element -- the rule is about
         unoptimised photography; this is a 1.5KB mark that is already emitted at every
         size it renders at, so there is nothing for the optimiser to do. */
      <img
        src={`/cocanvas-mark-${ink}-36.png`}
        srcSet={`/cocanvas-mark-${ink}-36.png 1x, /cocanvas-mark-${ink}-72.png 2x, /cocanvas-mark-${ink}-108.png 3x`}
        alt=""
        width={36}
        height={36}
        // Decorative next to the wordmark, which already says "CoCanvas" — alt="" keeps a
        // screen reader from announcing the name twice.
        aria-hidden="true"
      />
      )}
      {wordmark && (
        <span
          className={`text-xl font-semibold tracking-tight ${
            variant === "light" ? "text-on-surface" : "text-inverse-on-surface"
          }`}
        >
          CoCanvas
        </span>
      )}
    </>
  )

  // Branching on the element rather than on a dynamic tag: `<Tag href={maybe}>` cannot
  // be typed, and the shared `inner` already guarantees the two render the same lockup.
  return href ? (
    <Link href={href} className={`${shell} rounded transition-opacity hover:opacity-80`}>
      {inner}
    </Link>
  ) : (
    <div className={shell}>{inner}</div>
  )
}
