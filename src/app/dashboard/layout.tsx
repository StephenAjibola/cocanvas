import { Suspense, type ReactNode } from "react"
import { requireWorkspace } from "@/lib/workspace"
import { DashboardSidebar } from "@/components/DashboardSidebar"
import { DashboardHeader } from "@/components/DashboardHeader"

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, workspace, role, memberships } = await requireWorkspace()

  return (
    <div className="flex min-h-screen bg-surface">
      {/**
       * Both of these read the query string via useSearchParams to know which nav row is
       * current, which opts their subtree into client rendering. The Suspense boundaries
       * keep that from forcing the whole dashboard to render on the client.
       */}
      <Suspense fallback={<div className="w-60 shrink-0 border-r border-outline-variant" />}>
        <DashboardSidebar currentWorkspaceId={workspace.id} workspaces={memberships} role={role} />
      </Suspense>

      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="h-[61px] border-b border-outline-variant" />}>
          <DashboardHeader
            user={{ name: user.name ?? null, email: user.email!, image: user.image ?? null }}
          />
        </Suspense>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
      </div>
    </div>
  )
}
