import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, canEdit } from "@/lib/workspace"
import { TrashGrid } from "@/components/TrashGrid"
import { ClearTrashButton } from "@/components/ClearTrashButton"

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
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-medium">Trash</h1>
        {/* Renders nothing when the Trash is empty — an enabled "Clear Trash" with
            nothing to clear is a destructive-looking button that does nothing. */}
        <ClearTrashButton count={boards.length} />
      </div>
      <TrashGrid boards={boards.map((b) => ({ ...b, deletedAt: b.deletedAt! }))} />
    </main>
  )
}
