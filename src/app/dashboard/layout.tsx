import { Suspense, type ReactNode } from "react"
import { requireWorkspace } from "@/lib/workspace"
import { DashboardSidebar } from "@/components/DashboardSidebar"
import { DashboardHeader } from "@/components/DashboardHeader"

/**
 * The layout itself awaits NOTHING, and that is the whole point of its shape.
 *
 * It used to await requireWorkspace() at the top, which held the entire first paint —
 * shell, skeleton and all — behind a session lookup plus a remote Postgres round trip,
 * so a fresh load was a blank white screen for seconds. Now the shell paints at once,
 * the sidebar and header stream in behind their fallbacks, and the page streams behind
 * loading.tsx. requireWorkspace is cache()d per request, so the three callers still cost
 * one lookup, and its redirect("/login") still works from inside a streamed boundary.
 */
async function Sidebar() {
  const { workspace, role, memberships } = await requireWorkspace()
  return <DashboardSidebar currentWorkspaceId={workspace.id} workspaces={memberships} role={role} />
}

async function Header() {
  const { user } = await requireWorkspace()
  return (
    <DashboardHeader user={{ name: user.name ?? null, email: user.email!, image: user.image ?? null }} />
  )
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-surface-container-low">
      {/* Suspense also keeps the sidebar and header's useSearchParams from forcing the
          whole dashboard onto the client. Fallbacks match the real boxes, so nothing
          shifts when they land. */}
      <Suspense
        fallback={
          <div className="w-60 shrink-0 border-r border-outline-variant bg-surface-container-lowest" />
        }
      >
        <Sidebar />
      </Suspense>

      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="h-[61px] border-b border-outline-variant" />}>
          <Header />
        </Suspense>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
      </div>
    </div>
  )
}
