"use client"

import { useState } from "react"

type Role = "OWNER" | "EDITOR" | "VIEWER"
type Member = { id: string; role: Role; user: { id: string; name: string | null; email: string; image: string | null } }
type Invite = {
  id: string
  email: string
  role: Role
  expiresAt: Date
  /** Null for invites created before join codes existed — their link still works. */
  code: string | null
}

const ROLE_LABEL: Record<Role, string> = { OWNER: "Owner", EDITOR: "Editor", VIEWER: "Viewer" }

export function PeoplePanel({
  members: initialMembers,
  invites: initialInvites,
  canManage,
  currentUserId,
}: {
  members: Member[]
  invites: Invite[]
  canManage: boolean
  currentUserId: string
}) {
  const [members, setMembers] = useState(initialMembers)
  const [invites, setInvites] = useState(initialInvites)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"EDITOR" | "VIEWER">("EDITOR")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [sending, setSending] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Which code was just copied, so the button can confirm it happened.
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setNotice("")
    setSending(true)
    try {
      const res = await fetch("/api/workspace/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Couldn't send that invite")
      setInvites((inv) => [
        { id: data.id, email: data.email, role: data.role, code: data.code ?? null, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        ...inv.filter((i) => i.email !== data.email),
      ])
      setEmail("")
      setNotice(`Invite sent to ${data.email}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that invite")
    } finally {
      setSending(false)
    }
  }

  async function revoke(id: string) {
    setBusyId(id)
    const prior = invites
    setInvites((inv) => inv.filter((i) => i.id !== id))
    try {
      const res = await fetch(`/api/workspace/invites/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`revoke failed: ${res.status}`)
    } catch (err) {
      console.error("Revoke invite failed:", err)
      setInvites(prior)
    } finally {
      setBusyId(null)
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this person from the workspace?")) return
    setBusyId(id)
    const prior = members
    setMembers((m) => m.filter((row) => row.id !== id))
    try {
      const res = await fetch(`/api/workspace/members/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`remove failed: ${res.status}`)
    } catch (err) {
      console.error("Remove member failed:", err)
      setMembers(prior)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      {canManage && (
        <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-ink-500">Invite by email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              required
              className="w-full rounded border border-ink-400 bg-white px-3 py-2 text-sm placeholder:text-ink-500 focus:border-pink-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "EDITOR" | "VIEWER")}
              className="rounded border border-ink-400 bg-white px-3 py-2 text-sm"
            >
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={sending}
            className="rounded bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send invite"}
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-ink-700">{notice}</p>}

      <section>
        <h2 className="mb-3 text-sm font-medium text-ink-500">Members</h2>
        <div className="divide-y divide-ink-200 rounded-xl border border-ink-200 bg-white">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">
                  {m.user.name || m.user.email}
                  {m.user.id === currentUserId && <span className="text-ink-500"> (you)</span>}
                </p>
                <p className="truncate text-xs text-ink-500">{m.user.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-paper-100 px-2 py-0.5 text-[11px] font-medium text-ink-700">
                  {ROLE_LABEL[m.role]}
                </span>
                {canManage && m.role !== "OWNER" && (
                  <button
                    type="button"
                    disabled={busyId === m.id}
                    onClick={() => remove(m.id)}
                    className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {canManage && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-ink-500">Pending invites</h2>
          {invites.length === 0 ? (
            <p className="text-sm text-ink-500">No pending invites.</p>
          ) : (
            <div className="divide-y divide-ink-200 rounded-xl border border-ink-200 bg-white">
              {invites.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{i.email}</p>
                    <p className="text-xs text-ink-500">
                      Expires {new Date(i.expiresAt).toLocaleDateString()}
                    </p>
                    {/* The join code, shown so it can be read out or pasted into chat —
                        which is the whole reason it exists, since the emailed link is the
                        part that fails. Click to copy: nobody wants to retype 9
                        characters by hand. */}
                    {i.code && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(i.code!).then(
                            () => setCopiedId(i.id),
                            () => {}, // clipboard can be refused; the code stays readable
                          )
                        }}
                        title="Copy join code"
                        className="mt-1.5 rounded bg-paper-100 px-2 py-1 font-mono text-label-mono text-ink-900 transition-colors hover:bg-paper-50"
                      >
                        {copiedId === i.id ? "Copied" : i.code}
                      </button>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-paper-100 px-2 py-0.5 text-[11px] font-medium text-ink-700">
                      {ROLE_LABEL[i.role]}
                    </span>
                    <button
                      type="button"
                      disabled={busyId === i.id}
                      onClick={() => revoke(i.id)}
                      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
