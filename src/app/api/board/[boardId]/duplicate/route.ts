import { NextResponse } from "next/server"
import type { InputJsonValue } from "@/generated/prisma/internal/prismaNamespace"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Clones a board: a new Board row plus a copy of every BoardObject row, both scoped
 * to the caller's own membership the same way every other board-scoped route is.
 *
 * Not a single nested-create write: BoardObject rows carry their own ids (referenced
 * nowhere else, so that's harmless to duplicate), and there can be hundreds of them —
 * a createMany after the board exists is one INSERT instead of one per object inside
 * the same transaction Prisma would otherwise build for a deep nested create.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { boardId } = await params
    const source = await prisma.board.findFirst({
      where: {
        id: boardId,
        deletedAt: null,
        workspace: {
          memberships: {
            some: { user: { email: session.user.email }, role: { in: ["OWNER", "EDITOR"] } },
          },
        },
      },
      include: { objects: { select: { type: true, data: true } } },
    })
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const copy = await prisma.board.create({
      data: {
        name: `${source.name} (copy)`,
        workspaceId: source.workspaceId,
        theme: source.theme,
      },
    })
    if (source.objects.length) {
      await prisma.boardObject.createMany({
        data: source.objects.map((o) => ({
          boardId: copy.id,
          type: o.type,
          // The read type of a Json column includes null, the write type does not — so
          // a value that just came OUT of this column cannot go straight back in without
          // this. The column is non-nullable, so the null arm is unreachable in practice;
          // the assertion says exactly that rather than inventing a `?? {}` fallback that
          // would quietly rewrite a row's contents if it ever were reachable.
          data: o.data as InputJsonValue,
        })),
      })
    }

    return NextResponse.json({ id: copy.id, name: copy.name })
  } catch (err) {
    console.error("POST /api/board/[boardId]/duplicate failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
