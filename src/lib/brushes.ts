/**
 * Pen brush types.
 *
 * A brush changes only how a stroke is laid down and painted — width, opacity, grain,
 * and whether it persists at all. It is NOT a new object type: every persisting brush
 * still produces an ordinary Stroke, so selection, dragging, recolour, erasing, undo
 * and the Y.Map sync model all keep working with no new code.
 */

export type BrushKind =
  | "pen"
  | "marker"
  | "pencil"
  | "laser"
  | "watercolor"
  | "chalk"

export const BRUSH_KINDS: BrushKind[] = [
  "pen",
  "marker",
  "pencil",
  "laser",
  "watercolor",
  "chalk",
]

/**
 * Extra offset passes layered over the main stroke.
 *
 * One mechanism covers all three textured brushes; only the numbers differ. Passes
 * NARROWER than the stroke break its body up (graphite, chalk dust); passes WIDER than
 * it bleed past the edge (watercolour pooling). That is the whole difference.
 */
export type Texture = {
  /** How many extra passes. */
  passes: number
  /** Offset per point, as a fraction of the stroke width. */
  offset: number
  /** Alpha of each pass, relative to the stroke's own. */
  alpha: number
  /** Width of each pass, as a fraction of the stroke width. */
  width: number
}

export type Brush = {
  label: string
  /** Screen px at the zoom the stroke is drawn at, same contract as the old PEN_WIDTH. */
  width: number
  /** Multiplied into the settle alpha, never replacing it. */
  alpha: number
  /** Absent means a clean single pass. */
  texture?: Texture
  /**
   * False means the stroke never enters the document: no history entry, no Y.Map key.
   * The laser is a gesture, not board content — see the note on LASER_FADE.
   */
  persists: boolean
}

export const BRUSHES: Record<BrushKind, Brush> = {
  // The original pen, unchanged — Shift recognition and the settle were tuned against
  // these numbers, so this entry is the one that must not drift.
  pen: { label: "Pen", width: 2.5, alpha: 1, persists: true },
  marker: { label: "Marker", width: 9, alpha: 1, persists: true },
  // Thin and pale, with an offset pass so it breaks up like graphite on tooth rather
  // than just reading as a faded pen.
  pencil: {
    label: "Pencil",
    width: 1.6,
    alpha: 0.55,
    texture: { passes: 1, offset: 0.9, alpha: 0.5, width: 0.6 },
    persists: true,
  },
  laser: { label: "Laser", width: 3.5, alpha: 0.95, persists: false },
  // Wide, thin pigment. The extra passes are WIDER than the stroke and barely visible
  // on their own; where they overlap they accumulate, which is what makes the edges
  // pool and a crossing darken like real washes.
  watercolor: {
    label: "Watercolor",
    width: 16,
    alpha: 0.22,
    texture: { passes: 3, offset: 0.3, alpha: 0.55, width: 1.35 },
    persists: true,
  },
  // Dry and dusty: several narrow, heavily displaced passes scatter off the body of
  // the stroke instead of bleeding past it.
  chalk: {
    label: "Chalk",
    width: 7,
    alpha: 0.8,
    texture: { passes: 4, offset: 1.3, alpha: 0.35, width: 0.45 },
    persists: true,
  },
}

export const brushOf = (kind: BrushKind | undefined) => BRUSHES[kind ?? "pen"]

/** How long a laser trail lingers after release, in seconds. */
export const LASER_FADE = 0.9
export const LASER_EASE = "power2.in"

/**
 * Seed shift between texture passes.
 *
 * Without it every pass lands on identical offsets and they stack into one thicker
 * line instead of scattering — no texture at all, just a heavier stroke.
 */
export const PASS_SEED_STEP = 7919

/**
 * Deterministic per-point offset, in [-1, 1].
 *
 * Deterministic is the whole point: seeding from Math.random would re-roll on every
 * repaint and the grain would crawl and shimmer as you pan. Seeded from the stroke's
 * own createdAt, the texture is baked in from the moment it is drawn.
 */
export function grainOffset(seed: number, i: number) {
  const v = Math.sin(seed * 0.0001 + i * 12.9898) * 43758.5453
  return (v - Math.floor(v)) * 2 - 1
}

/**
 * Paths a jittered copy of the points, for the grain pass. Straight segments — this is
 * a texture overlay, so it must not re-smooth geometry the main pass already drew.
 */
export function grainPath(
  ctx: CanvasRenderingContext2D,
  p: number[],
  seed: number,
  amount: number,
) {
  ctx.moveTo(p[0] + grainOffset(seed, 0) * amount, p[1] + grainOffset(seed, 1) * amount)
  for (let i = 2; i < p.length; i += 2) {
    ctx.lineTo(
      p[i] + grainOffset(seed, i) * amount,
      p[i + 1] + grainOffset(seed, i + 1) * amount,
    )
  }
}
