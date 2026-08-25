/**
 * What a board's share link grants.
 *
 * Shared by the API route that validates it and the modal that renders it, so the three
 * tiers are declared once — the same reason isTheme/isGridStyle live next to THEMES.
 *
 * Not a Prisma enum, and not a Role. See the note on Board.shareAccess: a link visitor
 * has no session and no Membership row, so this describes the LINK, not a person.
 */
export type ShareAccess = "off" | "view" | "comment"

export const SHARE_ACCESS: ShareAccess[] = ["off", "view", "comment"]

/**
 * The segmented control's labels and the sentence under each.
 *
 * The descriptions carry the two facts a person actually needs before handing a link
 * out — whether an account is required, and whether the recipient can change anything —
 * because "Comment" alone does not answer either.
 */
export const SHARE_LABELS: Record<ShareAccess, { label: string; hint: string }> = {
  off: { label: "Off", hint: "Only workspace members can open this board." },
  view: { label: "View", hint: "Anyone with the link can view. No account needed." },
  comment: {
    label: "Comment",
    hint: "Anyone with the link can view. Signing in is required to comment.",
  },
}

/** Narrows an untrusted value from the request body. */
export function isShareAccess(v: unknown): v is ShareAccess {
  return v === "off" || v === "view" || v === "comment"
}

/** Whether a link at this tier opens the board at all. */
export function grantsAccess(access: string): boolean {
  return access === "view" || access === "comment"
}
