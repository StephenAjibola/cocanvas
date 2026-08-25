import { redirect } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, canEdit } from "@/lib/workspace"
import { BoardGrid } from "@/components/BoardGrid"
import { TemplateRow } from "@/components/TemplateRow"
import { SharedWithMe } from "@/components/SharedWithMe"
import { JoinWithCode } from "@/components/JoinWithCode"
import type { InputJsonValue } from "@/generated/prisma/internal/prismaNamespace"
import {
  TEMPLATE_NAMES,
  type TemplateId,
  isTemplateId,
  templateObjects,
} from "@/lib/templates"

async function createBoard() {
  "use server"
  await createFromTemplateId("blank")
}

/**
 * Creates a board and seeds it with a template's starter objects.
 *
 * One path for all four templates, Blank included — Blank simply seeds an empty array,
 * so its existing behaviour is the same code rather than a branch above it.
 *
 * The seed is written in the SAME transaction shape the objects route uses (createMany
 * after the board exists), so a template board's rows are indistinguishable from ones
 * drawn by hand. Nothing downstream needs to know a template made them.
 */
async function createFromTemplateId(id: TemplateId) {
  const { workspace, role } = await requireWorkspace()
  if (!canEdit(role)) return // VIEWER has no create affordance, and can't reach this by hand

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
        // The object's own id, not a generated cuid — it is the Y.Map key the realtime
        // document will use, exactly as the objects route does.
        id: o.id,
        boardId: board.id,
        type: o.type,
        data: o as unknown as InputJsonValue,
      })),
    })
  }

  redirect(`/board/${board.id}`)
}

/** Form-action wrapper: reads the template from the submitted form and validates it. */
async function createFromTemplate(formData: FormData) {
  "use server"
  const raw = formData.get("template")
  // Never the raw form value into the switch — this arrives from the browser like any
  // other request body.
  await createFromTemplateId(isTemplateId(raw) ? raw : "blank")
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>
}) {
  const { workspace, role, user } = await requireWorkspace()
  const { view = "", q = "" } = await searchParams

  const boards = await prisma.board.findMany({
    where: {
      workspaceId: workspace.id,
      deletedAt: null,
      // Case-insensitive so searching "brain" finds "Brainstorm".
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      theme: true,
      starredBy: { where: { userId: user.id }, take: 1, select: { boardId: true } },
    },
  })

  const rows = boards.map(({ starredBy, ...b }) => ({ ...b, starred: starredBy.length > 0 }))

  /**
   * "Shared with me" = boards in a workspace somebody ELSE owns.
   *
   * Derived rather than stored: a board reaches you through workspace membership, so the
   * boards that are "shared with" you are exactly those in workspaces where you are not
   * the owner. No new column, and it cannot drift out of sync with the permissions that
   * actually govern access.
   */
  const shared = await prisma.board.findMany({
    where: {
      deletedAt: null,
      workspaceId: { not: workspace.id },
      workspace: { memberships: { some: { userId: user.id, role: { not: "OWNER" } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: {
      id: true,
      name: true,
      updatedAt: true,
      workspaceId: true,
      workspace: {
        select: {
          name: true,
          memberships: {
            where: { role: "OWNER" },
            take: 1,
            select: { user: { select: { name: true, email: true } } },
          },
        },
      },
    },
  })

  // One query for this user's roles across the workspaces they don't own, keyed by
  // workspaceId and matched onto the rows below — the permission badge is the real
  // membership rather than an assumption, without a query per row.
  const sharedRoles = await prisma.membership.findMany({
    where: { userId: user.id, role: { not: "OWNER" } },
    select: { workspaceId: true, role: true },
  })
  const roleByWorkspace = new Map(sharedRoles.map((m) => [m.workspaceId, m.role]))

  const sharedWithPermission = shared.map((b) => ({
    id: b.id,
    name: b.name,
    updatedAt: b.updatedAt,
    workspaceName: b.workspace.name,
    sharedBy:
      b.workspace.memberships[0]?.user.name || b.workspace.memberships[0]?.user.email || "Someone",
    permission:
      roleByWorkspace.get(b.workspaceId) === "VIEWER" ? ("View only" as const) : ("Editor" as const),
  }))

  const starred = rows.filter((b) => b.starred)
  const visible = view === "starred" ? starred : view === "recent" ? rows.slice(0, 6) : rows
  const heading =
    view === "starred" ? "Starred" : view === "recent" ? "Recent Boards" : "All Boards"

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Create new</h1>
          {/* The subtext AND the code field both live here — the link is a phrase inside
              the sentence, so the field opens under the words that offered it. Joining is
              available to everyone including a VIEWER: redeeming a code is not an edit,
              and the invite's own role decides what you get on the other side. */}
          <JoinWithCode />
        </div>
        <div className="flex items-center gap-4">
          {canEdit(role) && (
            <form action={createBoard}>
              {/* "New canvas", not "Create new" — the heading already says Create new,
                  and the two actions here are exactly the two the subtext offers: start
                  with a canvas, or join with a code. */}
              <button
                type="submit"
                className="rounded-full bg-primary px-5 py-2.5 text-body-sm font-medium text-on-primary transition-colors hover:bg-accent-hover"
              >
                New canvas
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Templates are hidden while searching — a filtered view is a hunt for one board,
          and a template row in the middle of the results is noise. */}
      {!q && view !== "shared" && (
        <TemplateRow canCreate={canEdit(role)} action={createFromTemplate} limit={4} />
      )}

      {view !== "shared" && (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2>{q ? `Results for “${q}”` : heading}</h2>
            {q && (
              <Link href="/dashboard" className="text-body-sm text-primary hover:underline">
                Clear search
              </Link>
            )}
          </div>
          <BoardGrid
            boards={visible}
            canEdit={canEdit(role)}
            newBoardAction={canEdit(role) && !q ? createBoard : undefined}
          />
        </section>
      )}

      {(view === "shared" || (!q && sharedWithPermission.length > 0)) && (
        <SharedWithMe boards={sharedWithPermission} />
      )}
    </div>
  )
}
