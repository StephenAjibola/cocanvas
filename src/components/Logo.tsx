import Image from "next/image"
import mark from "../../public/cocanvas-logo.png"

export function Logo({
  variant,
  className = "",
}: {
  variant: "light" | "dark"
  className?: string
}) {
  /**
   * The CoCanvas mark, rendered from the supplied artwork.
   *
   * This is the actual PNG, imported as a static asset — NOT a redrawn vector. An earlier
   * pass approximated it as a circle plus one arc, which lost the interlaced double-swirl
   * entirely and was the wrong call: a brand mark is artwork to reproduce, not a shape to
   * paraphrase.
   *
   * Importing the file (rather than referencing "/cocanvas-logo.png" by string) is what
   * gives next/image the intrinsic dimensions at build time, so the layout box is known
   * before the bytes arrive and the sidebar cannot shift as it loads.
   *
   * ONE mark, no light/dark variants: the badge carries its own blue ground, so it needs
   * no adaptation and must not be given any. `variant` therefore only decides the colour
   * of the WORDMARK beside it, which is type and does have to stay legible on both
   * grounds.
   */
  const wordmark = variant === "light" ? "text-on-surface" : "text-inverse-on-surface"

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src={mark}
        alt=""
        width={36}
        height={36}
        // The mark is decorative next to the wordmark, which already says "CoCanvas" —
        // alt="" keeps a screen reader from announcing the name twice.
        aria-hidden="true"
        // Above the fold on every authenticated page, so it should not wait for lazy
        // loading to notice it.
        priority
        className="rounded"
      />
      <span className={`text-xl font-semibold tracking-tight ${wordmark}`}>CoCanvas</span>
    </div>
  )
}
