import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, canManageMembers } from "@/lib/workspace"
import { generateInviteCode } from "@/lib/invite-code"

/**
 * The workspace's standing join code: issue, rotate, revoke.
 *
 * POST both issues and rotates, because they are the same write — rotating IS revoking
 * the old code and issuing a new one, and giving them separate verbs would imply the old
 * one survives a rotation.
 *
 * Managers only, on both verbs. The code is bearer authority over workspace membership,
 * so handing out the ability to mint one is handing out the ability to open the door.
 */

/** The auth guard every route here shares — see the note in workspace/members. */
async function guard() {
  const session = await auth()
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  const { workspace, role } = await requireWorkspace()
  if (!canManageMembers(role)) {
    return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) }
  }
  return { workspaceId: workspace.id }
}

export async function POST() {
  try {
    const g = await guard()
    if (g.error) return g.error

    // Retried on collision rather than assumed unique. 39 bits makes a clash vanishingly
    // unlikely, but "vanishingly unlikely" is not "impossible", and the failure mode
    // without this is a 500 in front of someone mid-meeting. Bounded so a genuinely
    // broken generator cannot spin here forever.
    for (let attempt = 0; attempt < 5; attempt++) {
      const joinCode = generateInviteCode()
      const clash = await prisma.workspace.findUnique({
        where: { joinCode },
        select: { id: true },
      })
      if (clash) continue
      await prisma.workspace.update({
        where: { id: g.workspaceId },
        data: { joinCode },
      })
      return NextResponse.json({ joinCode })
    }
    return NextResponse.json({ error: "Could not generate a code" }, { status: 500 })
  } catch (err) {
    console.error("POST /api/workspace/join-code failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const g = await guard()
    if (g.error) return g.error

    // null is OFF. Existing members keep their membership — revoking the code closes the
    // door, it does not evict the people who already walked through it.
    await prisma.workspace.update({
      where: { id: g.workspaceId },
      data: { joinCode: null },
    })
    return NextResponse.json({ joinCode: null })
  } catch (err) {
    console.error("DELETE /api/workspace/join-code failed:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
