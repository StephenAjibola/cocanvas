import { Suspense } from "react"
import { redirect } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, canEdit } from "@/lib/workspace"
import { BoardGrid } from "@/components/BoardGrid"
import { SharedWithMe } from "@/components/SharedWithMe"
import { JoinWithCode } from "@/components/JoinWithCode"
import { BoardTypeRow } from "@/components/BoardTypeRow"
import { RecentMenu } from "@/components/RecentMenu"
import DashboardLoading from "./loading"
import type { InputJsonValue } from "@/generated/prisma/internal/prismaNamespace"
import { TEMPLATE_NAMES, type TemplateId, templateObjects } from "@/lib/templates"

/**
 * How many boards the front page's Recent strip shows. A quick-access strip, not the
 * inventory — the full list lives behind the sidebar's All Boards.
 */
const RECENT_LIMIT = 10

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


/**
 * Recent / All Boards / Starred / search are the SAME route with a different query
 * string, and Next does not show loading.tsx for a query-string-only navigation — the
 * segment never changes, so its boundary never remounts. Keying a Suspense on the query
 * does remount it, so every sidebar click shows the skeleton immediately instead of
 * leaving the old view up until the database answers.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>
}) {
  const { view = "", q = "" } = await searchParams
  return (
    <Suspense key={`${view}|${q}`} fallback={<DashboardLoading />}>
      <DashboardContent view={view} q={q} />
    </Suspense>
  )
}

async function DashboardContent({ view, q }: { view: string; q: string }) {
  const { workspace, role, user } = await requireWorkspace()

  /**
   * The three lists are independent, so they go out together rather than one after the
   * other. Sequential awaits cost three round trips to a remote Postgres on every
   * sidebar click, which is most of the delay that made a click look like it had done
   * nothing at all.
   */
  const boardsQuery = prisma.board.findMany({
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
      // When THIS user last opened it. Same bounded-take pattern as starredBy above, so
      // Recent costs no extra round trip — and null means "never opened", which is a
      // different thing from "opened long ago" and has to stay distinguishable.
      views: { where: { userId: user.id }, take: 1, select: { viewedAt: true } },
    },
  })

  /**
   * "Shared with me" = boards in a workspace somebody ELSE owns.
   *
   * Derived rather than stored: a board reaches you through workspace membership, so the
   * boards that are "shared with" you are exactly those in workspaces where you are not
   * the owner. No new column, and it cannot drift out of sync with the permissions that
   * actually govern access.
   */
  const sharedQuery = prisma.board.findMany({
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
  const sharedRolesQuery = prisma.membership.findMany({
    where: { userId: user.id, role: { not: "OWNER" } },
    select: { workspaceId: true, role: true },
  })
  const [boards, shared, sharedRoles] = await Promise.all([
    boardsQuery,
    sharedQuery,
    sharedRolesQuery,
  ])

  const rows = boards.map(({ starredBy, views, ...b }) => ({
    ...b,
    starred: starredBy.length > 0,
    viewedAt: views[0]?.viewedAt ?? null,
  }))

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

  /**
   * Recent is what you OPENED, newest first — Board.updatedAt is the last edit by anyone
   * and answers a different question, which is why BoardView exists at all.
   *
   * Boards you have never opened are excluded rather than sorted last: a quick-access
   * strip padded out with things you have never seen is just All Boards wearing a
   * different heading, and All Boards is one click away in the sidebar.
   */
  const recent = rows
    .filter((b) => b.viewedAt)
    .sort((a, b) => b.viewedAt!.getTime() - a.viewedAt!.getTime())
    .slice(0, RECENT_LIMIT)

  // "recent" is the old URL for what is now simply the dashboard's front page; it still
  // resolves so existing links and bookmarks land where they always did.
  const isRecent = view !== "starred" && view !== "all"
  const visible = view === "starred" ? starred : view === "all" ? rows : recent
  const heading = view === "starred" ? "Starred" : view === "all" ? "All Boards" : "Recent"

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-4">
          <h1>Create new</h1>
          {/* The subtext AND the code field both live here — the link is a phrase inside
              the sentence, so the field opens under the words that offered it. Joining is
              available to everyone including a VIEWER: redeeming a code is not an edit,
              and the invite's own role decides what you get on the other side. */}
          <JoinWithCode />
        </div>
        {/* The standalone "New canvas" button is gone: it is the Whiteboard card now.
            One create action, given the shape of the board it makes, sitting beside the
            types that do not exist yet and the templates page. */}
        <BoardTypeRow canCreate={canEdit(role)} createWhiteboard={createBoard} />
      </section>

      {view !== "shared" && (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2>{q ? `Results for “${q}”` : heading}</h2>
            {q ? (
              <Link href="/dashboard" className="text-body-sm text-primary hover:underline">
                Clear search
              </Link>
            ) : (
              // Only on Recent, and only for someone who could delete a board one at a
              // time anyway — this is that same soft-delete, applied to the strip.
              isRecent &&
              canEdit(role) && <RecentMenu boardIds={visible.map((b) => b.id)} />
            )}
          </div>
          <BoardGrid
            boards={visible}
            canEdit={canEdit(role)}
            // Not on Starred: a new board is never born starred, so the tile would drop
            // its result into a different section than the one you pressed it in — which
            // is the contract BoardGrid documents on this prop.
            newBoardAction={
              canEdit(role) && !q && view !== "starred" ? createBoard : undefined
            }
          />
        </section>
      )}

      {(view === "shared" || (!q && sharedWithPermission.length > 0)) && (
        <SharedWithMe boards={sharedWithPermission} />
      )}
    </div>
  )
}
