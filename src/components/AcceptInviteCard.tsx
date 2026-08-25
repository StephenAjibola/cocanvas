"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"

type Props =
  | { mode: "accept"; token: string; invitedEmail: string; next: string }
  | { mode: "mismatch"; token: string; invitedEmail: string; currentEmail: string; next: string }

/** The client half of /invite/[token]: either a one-click accept, or a mismatch
 * notice with a way to sign out and try again as the invited address. */
export function AcceptInviteCard(props: Props) {
  const router = useRouter()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  if (props.mode === "mismatch") {
    return (
      <div className="space-y-3 rounded-xl border border-ink-200 bg-white p-4">
        <p className="text-sm text-ink-700">
          This invite was sent to <span className="font-medium text-ink-900">{props.invitedEmail}</span>,
          but you&apos;re signed in as <span className="font-medium text-ink-900">{props.currentEmail}</span>.
        </p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: `/login?next=${encodeURIComponent(props.next)}` })}
          className="w-full rounded border border-ink-400 py-2 text-sm font-medium hover:bg-paper-50"
        >
          Sign out and try again
        </button>
      </div>
    )
  }

  async function accept() {
    setError("")
    setLoading(true)
    try {
      const res = await fetch(`/api/invites/${props.token}/accept`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Couldn't accept this invite")
      router.push("/dashboard")
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : "Couldn't accept this invite")
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={accept}
        disabled={loading}
        className="w-full rounded bg-accent-500 py-2 font-medium text-white hover:bg-accent-700 disabled:opacity-50"
      >
        {loading ? "Joining..." : "Accept invite"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
