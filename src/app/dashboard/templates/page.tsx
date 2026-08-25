import Link from "next/link"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, canEdit } from "@/lib/workspace"
import { TemplateRow } from "@/components/TemplateRow"
import type { InputJsonValue } from "@/generated/prisma/internal/prismaNamespace"
import { TEMPLATE_NAMES, type TemplateId, isTemplateId, templateObjects } from "@/lib/templates"

/**
 * Same creation path as the dashboard's row.
 *
 * Duplicated as a server action rather than shared, because a server action has to be
 * declared in a module the route owns — but both call the same templateObjects() and
 * write the same rows, so there is one definition of what a template IS.
 */
async function createFromTemplate(formData: FormData) {
  "use server"
  const raw = formData.get("template")
  const id: TemplateId = isTemplateId(raw) ? raw : "blank"

  const { workspace, role } = await requireWorkspace()
  if (!canEdit(role)) return

  const board = await prisma.board.create({
    data: {
      name: TEMPLATE_NAMES[id],
      workspaceId: workspace.id,
      // Light canvas. The dark board was the schema's original default, from before the
      // app went light — and it is why a seeded template looked nothing like the design
      // it came from: pale card frames and pastel stickies on near-black. Every source
      // mockup is a light canvas with a dot grid, so that is what a template opens on.
      theme: "light",
    },
  })

  const objects = templateObjects(id)
  if (objects.length) {
    await prisma.boardObject.createMany({
      data: objects.map((o) => ({
        id: o.id,
        boardId: board.id,
        type: o.type,
        data: o as unknown as InputJsonValue,
      })),
    })
  }

  redirect(`/board/${board.id}`)
}

export const metadata = { title: "Templates" }

export default async function TemplatesPage() {
  const { role } = await requireWorkspace()

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard"
          className="text-body-sm text-on-surface-variant hover:text-on-surface"
        >
          ← Back to boards
        </Link>
        <h1 className="mt-3">Templates</h1>
        <p className="mt-1.5 text-body-lg text-on-surface-variant">
          Every template starts a new board you can rearrange or clear out.
        </p>
      </div>

      {/* The same four cards the dashboard shows — one definition, two places. There are
          no additional templates to list yet, and inventing filler ones to justify a
          separate page would be worse than a short page that is true. */}
      <TemplateRow canCreate={canEdit(role)} action={createFromTemplate} showHeading={false} />
    </div>
  )
}
