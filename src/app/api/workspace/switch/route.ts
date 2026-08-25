import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CURRENT_WORKSPACE_COOKIE } from "@/lib/workspace"

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { workspaceId } = await req.json()
    if (typeof workspaceId !== "string") {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 })
    }

    // Only switch to a workspace this user actually belongs to.
    const membership = await prisma.membership.findFirst({
      where: { workspaceId, user: { email: session.user.email } },
      select: { id: true },
    })
    if (!membership) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const cookieStore = await cookies()
    cookieStore.set(CURRENT_WORKSPACE_COOKIE, workspaceId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("POST /api/workspace/switch failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
