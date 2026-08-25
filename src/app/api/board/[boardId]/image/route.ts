import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/** PNG/JPG only — what the Insert Image tool offers, and all the canvas ever decodes. */
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg"])

/** A generous ceiling for a board image, well under Vercel Blob's own request limit. */
const MAX_BYTES = 10 * 1024 * 1024

/**
 * Uploads one image to Vercel Blob and hands back its public URL.
 *
 * A separate route from the objects PUT: that one persists the converged Yjs document,
 * which is JSON all the way down, and a file's bytes have no business riding in that
 * body. The client uploads here first, then places an ImageObject holding the URL this
 * returns — the same two-step split the web platform already uses for `<input
 * type=file>` plus a src attribute.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { boardId } = await params
    // Same membership scoping as every other board-scoped route: a miss is 0 rows,
    // never a 500, and no signed-in user can push a blob onto a board they cannot edit.
    const board = await prisma.board.findFirst({
      where: {
        id: boardId,
        workspace: {
          memberships: {
            some: { user: { email: session.user.email }, role: { in: ["OWNER", "EDITOR"] } },
          },
        },
      },
      select: { id: true },
    })
    if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const form = await req.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Only PNG and JPG images are supported" }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image is too large (10MB max)" }, { status: 413 })
    }

    const ext = file.type === "image/png" ? "png" : "jpg"
    const blob = await put(`boards/${boardId}/${crypto.randomUUID()}.${ext}`, file, {
      access: "public",
      addRandomSuffix: false,
    })

    return NextResponse.json({ url: blob.url })
  } catch (err) {
    console.error("POST /api/board/[boardId]/image failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
