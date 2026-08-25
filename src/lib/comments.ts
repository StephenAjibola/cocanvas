import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * What the current viewer may do with a board's comments.
 *
 * There are two separate ways to reach a board — workspace membership, and a share link —
 * and comments have to answer for both. Keeping that resolution here rather than inline
 * in each route means the rules are stated once and the four routes cannot drift apart.
 */
export type CommentAccess = {
  /** The signed-in user's id. Null for an anonymous link visitor. */
  userId: string | null
  /** Whether the comment thread list is visible at all. */
  canRead: boolean
  /** Whether this viewer may post. Always false without a userId — see below. */
  canPost: boolean
  /** Whether this viewer may resolve ANY thread, rather than only their own. */
  canModerate: boolean
}

const NONE: CommentAccess = {
  userId: null,
  canRead: false,
  canPost: false,
  canModerate: false,
}

/**
 * Resolves what this request may do, from the session and an optional share token.
 *
 * The rules, in the order they are decided:
 *
 * - A workspace MEMBER reads, posts and moderates, whatever their role. Commenting is
 *   discussion, not editing, so a VIEWER is included — the same reasoning that lets a
 *   VIEWER star a board. Moderation is included because a member is accountable within
 *   the workspace in a way a link visitor is not.
 *
 * - A SIGNED-IN visitor holding a "comment" link reads and posts, but does not moderate:
 *   they can resolve their own thread and nothing else. That is handled by the caller,
 *   which compares authorId when canModerate is false.
 *
 * - An ANONYMOUS visitor gets nothing here, even on a "comment" link. Comment.authorId is
 *   non-nullable, so there is no anonymous author this schema can represent — the tier
 *   promises "sign in to comment" and this is where that promise is kept.
 *
 * A "view" link grants no comment access at all: it shares the board, not the discussion
 * about it.
 */
export async function resolveCommentAccess(
  boardId: string,
  shareToken?: string | null,
): Promise<CommentAccess> {
  const session = await auth()
  const email = session?.user?.email ?? null

  if (email) {
    // One query proves the user exists AND is a member of the board's workspace, the
    // same shape the star route uses.
    const member = await prisma.user.findFirst({
      where: {
        email,
        memberships: {
          some: { workspace: { boards: { some: { id: boardId, deletedAt: null } } } },
        },
      },
      select: { id: true },
    })
    if (member) {
      return { userId: member.id, canRead: true, canPost: true, canModerate: true }
    }
  }

  // Not a member. The only other way in is a comment-tier link for this exact board.
  if (!shareToken) return NONE
  const board = await prisma.board.findFirst({
    where: { id: boardId, shareToken, shareAccess: "comment", deletedAt: null },
    select: { id: true },
  })
  if (!board) return NONE

  if (!email) {
    // Holding the link is enough to READ the board (the /view route already decided
    // that), but not to author anything.
    return { userId: null, canRead: true, canPost: false, canModerate: false }
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) return NONE

  return { userId: user.id, canRead: true, canPost: true, canModerate: false }
}

/** Long enough for a real comment, short enough that the column is not storage. */
export const MAX_COMMENT = 4000

/**
 * Narrows and normalises untrusted comment text.
 *
 * Returns null for anything that is not a usable comment, so a caller cannot accidentally
 * treat "   " as content. Trimmed before the emptiness check for the same reason the
 * board-name guard does it.
 */
export function cleanContent(v: unknown): string | null {
  if (typeof v !== "string") return null
  const text = v.trim()
  if (!text || text.length > MAX_COMMENT) return null
  return text
}
