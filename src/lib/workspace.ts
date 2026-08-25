import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { defaultWorkspaceName } from "@/lib/names"
import type { Role } from "@/generated/prisma/client"

type UserRow = { id: string; email: string; name: string | null }

/** Which of the signed-in user's workspaces the dashboard is currently showing. */
export const CURRENT_WORKSPACE_COOKIE = "tf-workspace"

/** VIEWER can open and watch a board; only these two can change anything about it. */
export function canEdit(role: Role) {
  return role !== "VIEWER"
}

/** Only these two can invite, revoke, or remove people — see the People page. */
export function canManageMembers(role: Role) {
  return role === "OWNER" || role === "EDITOR"
}

/**
 * Creates the workspace and its OWNER membership in one nested write, so they can
 * never exist apart. Not an upsert: Prisma drops the atomic INSERT..ON CONFLICT path
 * whenever create has a nested write, which turns upsert into read-then-write and
 * loses the race we're guarding against. Losing the insert race is fine — whoever
 * won created an identical row, so take theirs.
 */
async function bootstrap(user: UserRow, slug: string) {
  try {
    return await prisma.workspace.create({
      data: {
        slug,
        name: defaultWorkspaceName(user.name, user.email),
        memberships: { create: { userId: user.id, role: "OWNER" } },
      },
    })
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e
    return prisma.workspace.findUniqueOrThrow({ where: { slug } })
  }
}

/**
 * The signed-in user, every workspace they belong to, and which one is "current" —
 * the cookie's pick if they're still a member there, else their own personal
 * workspace (bootstrapped on first call). Redirects to /login when signed out.
 *
 * A user can now belong to more than one workspace once invites exist (see
 * WorkspaceInvite), which is why this returns the whole list rather than just one —
 * the sidebar's workspace switcher reads it directly off this instead of a second
 * query.
 */
export async function requireWorkspace() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  const rows = await prisma.membership.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, workspace: { select: { id: true, name: true, slug: true } } },
  })

  const cookieStore = await cookies()
  const wanted = cookieStore.get(CURRENT_WORKSPACE_COOKIE)?.value
  let current = rows.find((m) => m.workspace.id === wanted)

  if (!current) {
    // Deterministic slug so parallel first-login requests collide on the unique index
    // instead of each creating a workspace.
    const slug = `ws-${user.id}`
    current = rows.find((m) => m.workspace.slug === slug)
    if (!current) {
      const workspace = await bootstrap(user, slug)
      current = { role: "OWNER", workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug } }
      rows.push(current)
    }
  }

  return {
    user,
    workspace: current.workspace,
    role: current.role,
    memberships: rows.map((m) => ({ id: m.workspace.id, name: m.workspace.name, role: m.role })),
  }
}

/** Just the auth gate, for pages that don't need the workspace. */
export async function requireUser() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")
  return session.user
}
