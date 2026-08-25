import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { grantsAccess, isShareAccess } from "@/lib/share"

/**
 * The share link for a board, and what it grants.
 *
 * PATCH sets the tier and is what the modal's segmented control calls — it mints a token
 * on the way up if there isn't one, so "Off → View" is a single request rather than a
 * create-then-set pair the client has to sequence.
 *
 * POST regenerates: overwriting the token is exactly what invalidates every copy of the
 * old link, so "regenerate" and "revoke and reissue" are the same operation. DELETE
 * revokes outright, clearing the token AND the tier so a re-share cannot silently come
 * back at whatever level it was last set to.
 *
 * Every write is scoped by the membership join rather than checked separately, the same
 * shape the theme/name PATCH uses: a miss is 0 rows instead of a thrown 500, and there
 * is no window between the check and the write.
 */

/**
 * 128 bits, base64url.
 *
 * This token IS the authentication for /view/[token] — there is no session behind it —
 * so it has to be unguessable rather than merely unique. randomBytes, never Math.random
 * or a cuid: both are predictable from previous outputs.
 */
const newToken = () => randomBytes(16).toString("base64url")

async function requireEmail() {
  const session = await auth()
  return session?.user?.email ?? null
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const email = await requireEmail()
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { boardId } = await params
    const shareToken = newToken()
    const { count } = await prisma.board.updateMany({
      where: {
        id: boardId,
        workspace: { memberships: { some: { user: { email }, role: { in: ["OWNER", "EDITOR"] } } } },
      },
      // The tier is deliberately NOT touched here. Regenerating is about invalidating the
      // old URL, and silently re-opening a board that was set to "off" — or downgrading
      // one set to "comment" — is not what the person clicking Regenerate asked for.
      data: { shareToken },
    })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Path only. The origin belongs to the browser that will display it — a server
    // guess would be wrong behind any proxy, and wrong in a way nobody notices until
    // they paste the link.
    return NextResponse.json({ shareToken, path: `/view/${shareToken}` })
  } catch (err) {
    console.error("POST /api/board/[boardId]/share failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}

/** Sets the tier, minting a token if one is needed and does not exist yet. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const email = await requireEmail()
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    if (!isShareAccess(body.access)) {
      return NextResponse.json({ error: "Invalid access" }, { status: 400 })
    }
    const access: string = body.access

    const { boardId } = await params
    // Read first, because whether a token needs minting depends on whether one exists —
    // and the same membership join that authorises the write authorises this read, so a
    // caller who may not touch the board cannot use it to probe for one either.
    const board = await prisma.board.findFirst({
      where: {
        id: boardId,
        workspace: { memberships: { some: { user: { email }, role: { in: ["OWNER", "EDITOR"] } } } },
      },
      select: { shareToken: true },
    })
    if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Going up to a tier that grants access with no token yet is the "share this for the
    // first time" case. Going down to "off" keeps the token, so re-enabling later does
    // not invalidate a URL people have already saved — that is what DELETE is for.
    const shareToken =
      grantsAccess(access) && !board.shareToken ? newToken() : board.shareToken

    await prisma.board.update({
      where: { id: boardId },
      data: { shareAccess: access, shareToken },
    })

    return NextResponse.json({
      shareAccess: access,
      shareToken,
      path: shareToken ? `/view/${shareToken}` : null,
    })
  } catch (err) {
    console.error("PATCH /api/board/[boardId]/share failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const email = await requireEmail()
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { boardId } = await params
    const { count } = await prisma.board.updateMany({
      where: {
        id: boardId,
        workspace: { memberships: { some: { user: { email }, role: { in: ["OWNER", "EDITOR"] } } } },
      },
      // Both, together: a cleared token with the tier left at "view" would mean the next
      // Regenerate silently republishes a board somebody had deliberately unshared.
      data: { shareToken: null, shareAccess: "off" },
    })
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({ shareToken: null, shareAccess: "off" })
  } catch (err) {
    console.error("DELETE /api/board/[boardId]/share failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
