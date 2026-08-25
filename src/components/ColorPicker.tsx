"use client"

export type Swatch = { color: string; label: string }

/**
 * A native color input dressed as a swatch.
 *
 * `<input type="color">` rather than a hand-rolled wheel: it is one element, it is
 * keyboard and screen-reader accessible for free, and it opens the OS picker people
 * already know. The visible chip is the input itself — styling the control beats
 * overlaying a fake swatch on a hidden input, which loses the focus ring.
 *
 * Standalone so the toolbar rows, which have their own sizing, can drop one in without
 * adopting the whole ColorPicker layout.
 */
export function CustomColorSwatch({
  value,
  onChange,
  className = "h-7 w-7",
}: {
  value: string
  onChange: (c: string) => void
  className?: string
}) {
  return (
    <span className={`relative inline-block shrink-0 ${className}`}>
      {/* The conic ring is the affordance — without it this reads as one more preset
          rather than "any color". Purely decorative, hence aria-hidden. */}
      <span
        className="pointer-events-none absolute inset-0 rounded"
        style={{
          background:
            "conic-gradient(#ef4444,#eab308,#22c55e,#3b82f6,#a855f7,#ef4444)",
        }}
        aria-hidden="true"
      />
      {/* The input itself is invisible and covers the whole swatch; the chip below
          draws the current color over the ring. Browsers style a color input's own
          chip inconsistently, so painting it here is what makes it match the presets.
          `peer` carries focus down to that chip, or the focus ring would be invisible
          along with the input. */}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Custom color"
        title="Custom color"
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <span
        className="pointer-events-none absolute inset-[3px] rounded border border-outline-variant peer-focus-visible:ring-2 peer-focus-visible:ring-primary"
        style={{ backgroundColor: value }}
        aria-hidden="true"
      />
    </span>
  )
}

/**
 * Presets plus a custom option, for any place a color is chosen.
 *
 * One component for the shape outline, the shape fill and the note color, because the
 * control is identical and only the palette differs. `null` is the no-color state and
 * is offered only when `onNone` is passed — fills can be absent, an outline colour
 * cannot.
 *
 * `fallback` is what the custom input shows while nothing is chosen, so opening it
 * starts from something related to the object rather than from black.
 */
export function ColorPicker({
  value,
  onChange,
  swatches,
  onNone,
  noneLabel = "None",
  fallback,
}: {
  value: string | null
  onChange: (c: string) => void
  swatches: Swatch[]
  onNone?: () => void
  noneLabel?: string
  fallback: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {onNone && (
        <button
          type="button"
          onClick={onNone}
          aria-label={noneLabel}
          title={noneLabel}
          aria-pressed={value === null}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border transition-colors ${
            value === null ? "border-primary" : "border-outline-variant hover:border-primary"
          }`}
        >
          {/* The standard empty-swatch mark: an outlined square struck through. */}
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect
              x="1.5"
              y="1.5"
              width="13"
              height="13"
              rx="2.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              className="text-on-surface-variant"
            />
            <line x1="3" y1="13" x2="13" y2="3" stroke="#ef4444" strokeWidth="1.6" />
          </svg>
        </button>
      )}

      {swatches.map((s) => {
        const active = value?.toLowerCase() === s.color.toLowerCase()
        return (
          <button
            key={s.label}
            type="button"
            onClick={() => onChange(s.color)}
            aria-label={s.label}
            title={s.label}
            aria-pressed={active}
            className={`h-7 w-7 shrink-0 rounded border transition-colors ${
              active ? "border-primary" : "border-outline-variant hover:border-primary"
            }`}
            style={{ backgroundColor: s.color }}
          />
        )
      })}

      <CustomColorSwatch value={value ?? fallback} onChange={onChange} />
    </div>
  )
}
