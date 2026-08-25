import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isGridStyle, isTheme } from "@/lib/theme"

/** Long enough for a real title, short enough that the column cannot be used as
 * storage. Mirrored by maxLength on the input, so the field cannot compose one that
 * would be rejected here. */
const MAX_NAME = 100

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    // Built field by field rather than spreading the body: this is the only thing
    // standing between a request and the row, and a spread would carry whatever else
    // the caller decided to send.
    const data: { theme?: string; name?: string; gridStyle?: string } = {}

    if (body.theme !== undefined) {
      // Never the raw body into the column — the DB column is a plain string.
      if (!isTheme(body.theme)) {
        return NextResponse.json({ error: "Invalid theme" }, { status: 400 })
      }
      data.theme = body.theme
    }

    if (body.gridStyle !== undefined) {
      // Same contract as theme: a plain string column, so the guard here is the only
      // thing keeping an arbitrary value out of it.
      if (!isGridStyle(body.gridStyle)) {
        return NextResponse.json({ error: "Invalid grid style" }, { status: 400 })
      }
      data.gridStyle = body.gridStyle
    }

    if (body.name !== undefined) {
      // Trimmed before the emptiness check, so whitespace cannot pass as a name.
      const name = typeof body.name === "string" ? body.name.trim() : ""
      if (!name || name.length > MAX_NAME) {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 })
      }
      data.name = name
    }

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
    }

    const { boardId } = await params
    // Scoped write: unlike the read path, this must not let any signed-in user
    // re-theme an arbitrary board id. updateMany lets the membership join live in
    // the where clause, so a miss is 0 rows rather than a thrown 500.
    const { count } = await prisma.board.updateMany({
      where: {
        id: boardId,
        deletedAt: null, // a trashed board isn't editable until restored
        workspace: {
          memberships: {
            some: { user: { email: session.user.email }, role: { in: ["OWNER", "EDITOR"] } },
          },
        },
      },
      data,
    })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Echoes what was actually written, not what was asked for — the client shows the
    // trimmed name, so it has to be told which one won.
    return NextResponse.json(data)
  } catch (err) {
    console.error("PATCH /api/board/[boardId] failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { boardId } = await params
    // Soft delete: moves the board to Trash rather than dropping the row. Same
    // membership-scoped shape as the PATCH above. Restore is /restore, permanent
    // removal is /purge — this route only ever sets the flag.
    const { count } = await prisma.board.updateMany({
      where: {
        id: boardId,
        deletedAt: null,
        workspace: {
          memberships: {
            some: { user: { email: session.user.email }, role: { in: ["OWNER", "EDITOR"] } },
          },
        },
      },
      data: { deletedAt: new Date() },
    })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("DELETE /api/board/[boardId] failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
