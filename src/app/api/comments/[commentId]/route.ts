import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveCommentAccess } from "@/lib/comments"

/**
 * One comment: resolve/reopen it, or delete it.
 *
 * Both start by loading the comment to learn which BOARD it belongs to, because that is
 * what the access rules are written against — the caller supplies a comment id, and
 * trusting it to also name its own board would let one request act on another board's
 * thread. The board comes from the row, never from the request.
 */
async function load(commentId: string) {
  return prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, boardId: true, authorId: true, parentId: true },
  })
}

/** Resolve or reopen a thread. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  try {
    const { commentId } = await params
    const body = await req.json()
    if (typeof body.resolved !== "boolean") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }

    const comment = await load(commentId)
    if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 })
    // Resolving a REPLY is meaningless — the thread is the unit that gets resolved, and
    // the panel only offers the action on a thread. Refused rather than silently applied
    // to a row nothing reads.
    if (comment.parentId) {
      return NextResponse.json({ error: "Only threads can be resolved" }, { status: 400 })
    }

    const access = await resolveCommentAccess(comment.boardId, body.token ?? null)
    // A member resolves anything; a link guest resolves only what they started.
    const allowed = access.canModerate || (access.userId && access.userId === comment.authorId)
    if (!allowed) return NextResponse.json({ error: "Not allowed" }, { status: 403 })

    await prisma.comment.update({
      where: { id: commentId },
      data: { resolved: body.resolved },
    })

    return NextResponse.json({ id: commentId, resolved: body.resolved })
  } catch (err) {
    console.error("PATCH /api/comments/[commentId] failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  try {
    const { commentId } = await params
    const token = new URL(req.url).searchParams.get("token")

    const comment = await load(commentId)
    if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const access = await resolveCommentAccess(comment.boardId, token)
    // Deletion is narrower than resolution on purpose: destroying someone else's words is
    // not the same act as marking a thread done, so this is the author only — a moderator
    // resolves rather than erases.
    if (!access.userId || access.userId !== comment.authorId) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 })
    }

    // Replies cascade with the thread via the self-relation's onDelete: Cascade, so
    // deleting a thread takes its conversation with it rather than orphaning rows that
    // the GET route would never return.
    await prisma.comment.delete({ where: { id: commentId } })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("DELETE /api/comments/[commentId] failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
