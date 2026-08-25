import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { cleanContent, resolveCommentAccess } from "@/lib/comments"

/**
 * A board's comment threads.
 *
 * REST rather than the Yjs document — see the note on the Comment model. The panel calls
 * GET on open and again whenever the realtime version counter bumps, which is the whole
 * of the "lightweight push": the socket carries a signal, this route carries the content
 * and the authorisation.
 *
 * The share token arrives as a query parameter rather than a header because the only
 * caller that has one is a page that was itself reached by URL.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const { boardId } = await params
    const token = new URL(req.url).searchParams.get("token")
    const access = await resolveCommentAccess(boardId, token)
    if (!access.canRead) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Threads with their replies, rather than a flat list the client has to reassemble.
    // Threads newest-first because a new thread is the one you want to see; replies
    // oldest-first because a conversation reads downward.
    const threads = await prisma.comment.findMany({
      where: { boardId, parentId: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        content: true,
        resolved: true,
        objectId: true,
        anchorX: true,
        anchorY: true,
        createdAt: true,
        authorId: true,
        author: { select: { name: true, email: true, image: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            content: true,
            createdAt: true,
            authorId: true,
            author: { select: { name: true, email: true, image: true } },
          },
        },
      },
    })

    return NextResponse.json({
      threads,
      // Echoed so the panel can decide what to offer without re-deriving the rules it
      // does not own — the filter tabs need viewerId, the actions need the rest.
      viewerId: access.userId,
      canPost: access.canPost,
      canModerate: access.canModerate,
    })
  } catch (err) {
    console.error("GET /api/board/[boardId]/comments failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const { boardId } = await params
    const body = await req.json()
    const access = await resolveCommentAccess(boardId, body.token ?? null)
    // canPost is false for an anonymous visitor even on a comment-tier link, which is
    // what makes the tier's "signing in is required" promise true.
    if (!access.canPost || !access.userId) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 })
    }

    const content = cleanContent(body.content)
    if (!content) return NextResponse.json({ error: "Invalid comment" }, { status: 400 })

    let parentId: string | null = null
    if (body.parentId != null) {
      if (typeof body.parentId !== "string") {
        return NextResponse.json({ error: "Invalid parent" }, { status: 400 })
      }
      // The parent must be a TOP-LEVEL comment on THIS board. Both halves matter: the
      // board check stops a reply being filed against another board's thread, and the
      // parentId: null check keeps replies one level deep, which the schema itself does
      // not constrain. Arbitrary nesting is a rendering problem nobody asked for.
      const parent = await prisma.comment.findFirst({
        where: { id: body.parentId, boardId, parentId: null },
        select: { id: true },
      })
      if (!parent) return NextResponse.json({ error: "Invalid parent" }, { status: 400 })
      parentId = parent.id
    }

    // A reply inherits its thread's anchor rather than carrying its own: it is part of
    // the same pin, and letting a reply place a second pin would be a different feature.
    const anchorX = parentId ? 0 : Number(body.anchorX)
    const anchorY = parentId ? 0 : Number(body.anchorY)
    if (!parentId && (!Number.isFinite(anchorX) || !Number.isFinite(anchorY))) {
      return NextResponse.json({ error: "Invalid anchor" }, { status: 400 })
    }

    const objectId = typeof body.objectId === "string" ? body.objectId : null

    const comment = await prisma.comment.create({
      data: { boardId, authorId: access.userId, content, parentId, anchorX, anchorY, objectId },
      select: {
        id: true,
        content: true,
        resolved: true,
        objectId: true,
        anchorX: true,
        anchorY: true,
        createdAt: true,
        parentId: true,
        authorId: true,
        author: { select: { name: true, email: true, image: true } },
      },
    })

    return NextResponse.json(comment)
  } catch (err) {
    console.error("POST /api/board/[boardId]/comments failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
