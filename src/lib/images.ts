/**
 * Uploaded images.
 *
 * A third sibling of Stroke and Note, not a repurposed Note: an image has no text, no
 * fill, no ink color — it is a box that shows a bitmap and nothing else. Cramming a
 * `src` onto Note the way the Text tool reuses it (see Note.bare) would leave every
 * consumer of Note's text/color/font fields carrying a branch for "well, unless it's
 * actually an image," which is exactly the growth Note's own comment warns against.
 *
 * The box geometry, though, IS identical to Note's, and geomBounds/hitsNote/
 * translateNote already take that shape structurally rather than by the `Note` type
 * name — so ImageObject reuses them directly instead of duplicating box math.
 */

export type ImageObject = {
  id: string
  type: "image"
  /** Top-left corner, WORLD coordinates — same space as Note and Stroke. */
  x: number
  y: number
  w: number
  h: number
  /** A Vercel Blob URL. Never a data: URL — see the upload route. */
  src: string
  createdAt: number // paint order; Y.Map is unordered
  /** See Stroke.z — explicit paint order, absent until the object is reordered. */
  z?: number
  /** See Stroke.locked — locked objects stay selectable so they can be unlocked. */
  locked?: boolean
  /** Rotation in radians about the box's centre. Same convention as Note.angle. */
  angle?: number
}

/** Placed at a fixed max dimension, aspect-preserved — see fitImageSize. */
export const IMAGE_MAX_SIZE = 320
