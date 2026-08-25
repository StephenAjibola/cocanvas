import { prisma } from "@/lib/prisma"
import { requireWorkspace, canManageMembers } from "@/lib/workspace"
import { PeoplePanel } from "@/components/PeoplePanel"

export default async function PeoplePage() {
  const { workspace, user, role } = await requireWorkspace()
  const manage = canManageMembers(role)

  const members = await prisma.membership.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, user: { select: { id: true, name: true, email: true, image: true } } },
  })

  // Pending invites are only meaningful to whoever can act on them — a VIEWER sees
  // the member list but not who's mid-invite.
  const invites = manage
    ? await prisma.workspaceInvite.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, role: true, expiresAt: true, code: true },
      })
    : []

  return (
    <main className="text-ink-900">
      <h1 className="mb-8 text-2xl font-medium">People</h1>
      <PeoplePanel
        members={members}
        invites={invites}
        canManage={manage}
        currentUserId={user.id}
      />
    </main>
  )
}
