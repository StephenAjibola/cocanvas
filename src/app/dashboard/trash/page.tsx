import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, canEdit } from "@/lib/workspace"
import { TrashGrid } from "@/components/TrashGrid"

export default async function TrashPage() {
  const { workspace, role } = await requireWorkspace()
  // Not just a hidden nav item — a VIEWER typing the URL directly gets bounced too.
  if (!canEdit(role)) redirect("/dashboard")

  const boards = await prisma.board.findMany({
    where: { workspaceId: workspace.id, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    select: { id: true, name: true, deletedAt: true },
  })

  return (
    <main className="text-ink-900">
      <h1 className="mb-8 text-2xl font-medium">Trash</h1>
      <TrashGrid boards={boards.map((b) => ({ ...b, deletedAt: b.deletedAt! }))} />
    </main>
  )
}
