import Link from "next/link"
import { requireUser } from "@/lib/workspace"
import { Logo } from "@/components/Logo"

// ponytail: no account settings exist yet — this just confirms who you're signed in
// as, so "Manage Account" isn't a dead link. Expand in place when there's something
// to actually manage (name, avatar, password, connected providers).
export default async function AccountPage() {
  const user = await requireUser()

  return (
    <main className="min-h-screen text-ink-900">
      <div className="mx-auto max-w-lg px-6 py-12">
        <Logo variant="light" className="mb-10" />
        <h1 className="mb-6 text-2xl font-medium">Account</h1>

        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-sm font-medium text-ink-900">{user.name || "—"}</p>
          <p className="mt-1 text-sm text-ink-500">{user.email}</p>
        </div>

        <p className="mt-4 text-sm text-ink-500">
          Account settings are coming soon. For now, this just confirms who you&apos;re
          signed in as.
        </p>

        <Link href="/dashboard" className="mt-6 inline-block text-sm text-accent-500 hover:text-accent-700">
          ← Back to dashboard
        </Link>
      </div>
    </main>
  )
}
