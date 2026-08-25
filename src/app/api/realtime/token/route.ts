import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TOKEN_TTL_MS, signToken } from "@/lib/realtime-token"

/**
 * Issues a token admitting the caller to one board's realtime room.
 *
 * This is the only place board membership is checked for realtime — the service
 * itself verifies the signature but has no database, so whatever is asserted here is
 * what it trusts.
 */
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const boardId = new URL(req.url).searchParams.get("boardId")
    if (!boardId) {
      return NextResponse.json({ error: "boardId is required" }, { status: 400 })
    }

    const secret = process.env.AUTH_SECRET
    if (!secret) {
      console.error("AUTH_SECRET is not set — cannot mint realtime tokens")
      return NextResponse.json({ error: "Realtime unavailable" }, { status: 500 })
    }

    // One query proves three things: the user exists, the board exists, and the user
    // belongs to the workspace that owns it.
    const membership = await prisma.membership.findFirst({
      where: {
        user: { email: session.user.email },
        workspace: { boards: { some: { id: boardId } } },
      },
      select: { userId: true, user: { select: { name: true, email: true } } },
    })
    // 404 rather than 403, so this can't be used to discover which board ids exist.
    if (!membership) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const exp = Date.now() + TOKEN_TTL_MS
    const name = membership.user.name || membership.user.email.split("@")[0]

    return NextResponse.json({
      token: signToken({ boardId, userId: membership.userId, name, exp }, secret),
      userId: membership.userId,
      name,
      expiresAt: exp,
    })
  } catch (err) {
    console.error("GET /api/realtime/token failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
