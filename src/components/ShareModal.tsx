"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { Modal } from "@/components/Modal"
import { SHARE_ACCESS, SHARE_LABELS, type ShareAccess, grantsAccess } from "@/lib/share"

type Role = "OWNER" | "EDITOR" | "VIEWER"
type Member = {
  id: string
  role: Role
  user: { id: string; name: string | null; email: string; image: string | null }
}
type Invite = { id: string; email: string; role: Role; expiresAt: string; code?: string | null }

const ROLE_LABEL: Record<Role, string> = { OWNER: "Owner", EDITOR: "Editor", VIEWER: "Viewer" }

/**
 * Share & access — who is in the workspace, what each of them can do, and what the
 * public link grants.
 *
 * Replaces the old ShareButton dropdown, which did only the link half and did it with a
 * bug: it built the URL from window.location.origin during render, and a client component
 * is still server-rendered, so any board that HAD a token crashed the whole page on SSR.
 * The origin is read in an effect here, which is the fix as well as the reason this is
 * not just a restyle.
 *
 * Membership is a WORKSPACE fact, not a board one, so everything above the link section
 * is the same data /dashboard/people shows and writes through the same routes. This is a
 * second surface onto that feature, not a second copy of it — no board-scoped sharing
 * model exists, and inventing one here would silently disagree with the People page.
 */
export function ShareModal({
  boardId,
  initialToken,
  initialAccess,
  onClose,
}: {
  boardId: string
  initialToken: string | null
  initialAccess: ShareAccess
  onClose: () => void
}) {
  const [access, setAccess] = useState<ShareAccess>(initialAccess)
  const [token, setToken] = useState(initialToken)
  /**
   * The origin the link has to carry, read the one way that is safe here.
   *
   * This component is server-rendered on first paint, where `window` does not exist — and
   * reading it in the render body is exactly the bug the old ShareButton shipped, which
   * crashed the whole board page for any board that had a token.
   *
   * useSyncExternalStore rather than an effect: it takes a separate SERVER snapshot, so
   * the server renders "" and the client renders the real origin with React reconciling
   * the difference itself. An effect would do the same job by triggering a second render
   * pass, which is the cascade react-hooks/set-state-in-effect exists to prevent.
   *
   * The subscribe function is a no-op because an origin cannot change without a
   * navigation, which unmounts this anyway.
   */
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  )
  const [people, setPeople] = useState<{
    workspace: { id: string; name: string; joinCode: string | null }
    members: Member[]
    invites: Invite[]
    canManage: boolean
    currentUserId: string
  } | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [email, setEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"EDITOR" | "VIEWER">("EDITOR")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Tracked separately from the share link's `copied` so copying one does not flash
  // "Copied" on the other.
  const [codeCopied, setCodeCopied] = useState(false)

  // Fetched on open rather than passed down, so the member list stays off the board
  // page's render path — see the note on GET /api/workspace/members.
  useEffect(() => {
    let live = true
    fetch("/api/workspace/members")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => live && setPeople(data))
      .catch((err) => {
        console.error("Loading workspace members failed:", err)
        if (live) setLoadError(true)
      })
    // Guards against a state write after the modal closed mid-flight.
    return () => {
      live = false
    }
  }, [])

  const url = token && origin ? `${origin}/view/${token}` : null

  async function changeAccess(next: ShareAccess) {
    const prev = { access, token }
    setAccess(next)
    try {
      const res = await fetch(`/api/board/${encodeURIComponent(boardId)}/share`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ access: next }),
      })
      if (!res.ok) throw new Error(`PATCH share failed: ${res.status}`)
      const body = await res.json()
      // The token comes back from the server because moving up a tier may have minted
      // one — the client cannot know the new value.
      setToken(body.shareToken)
    } catch (err) {
      console.error("Share access change failed:", err)
      setAccess(prev.access)
      setToken(prev.token)
      setNotice("Could not change link access.")
    }
  }

  async function regenerate() {
    setBusy(true)
    try {
      const res = await fetch(`/api/board/${encodeURIComponent(boardId)}/share`, { method: "POST" })
      if (!res.ok) throw new Error(`regenerate failed: ${res.status}`)
      const body = await res.json()
      setToken(body.shareToken)
      setCopied(false)
      setNotice("New link created. The old one no longer works.")
    } catch (err) {
      console.error("Share link regenerate failed:", err)
      setNotice("Could not create a new link.")
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // Clipboard access can be refused outright. The field is selectable, so there is
      // still a way to get the link — say nothing rather than throw.
    }
  }

  /**
   * Issues a workspace join code, or rotates the existing one.
   *
   * One button for both because they are one write — rotating revokes the old code, and
   * a separate "revoke" step would suggest otherwise.
   */
  async function rotateJoinCode() {
    setBusy(true)
    try {
      const res = await fetch("/api/workspace/join-code", { method: "POST" })
      if (!res.ok) throw new Error(`join code failed: ${res.status}`)
      const body = await res.json()
      setPeople((p) =>
        p ? { ...p, workspace: { ...p.workspace, joinCode: body.joinCode } } : p,
      )
      setCodeCopied(false)
      setNotice("New join code. Any code shared earlier no longer works.")
    } catch (err) {
      console.error("Join code rotate failed:", err)
      setNotice("Could not create a join code.")
    } finally {
      setBusy(false)
    }
  }

  async function revokeJoinCode() {
    setBusy(true)
    try {
      const res = await fetch("/api/workspace/join-code", { method: "DELETE" })
      if (!res.ok) throw new Error(`join code delete failed: ${res.status}`)
      setPeople((p) => (p ? { ...p, workspace: { ...p.workspace, joinCode: null } } : p))
      setCodeCopied(false)
      setNotice("Join code turned off. People already in the workspace keep their access.")
    } catch (err) {
      console.error("Join code revoke failed:", err)
      setNotice("Could not turn the code off.")
    } finally {
      setBusy(false)
    }
  }

  async function copyJoinCode() {
    const code = people?.workspace.joinCode
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCodeCopied(true)
    } catch {
      // Same as the share link: the field is selectable, so refusal is not worth a message.
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    const address = email.trim()
    if (!address || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch("/api/workspace/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, role: inviteRole }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `invite failed: ${res.status}`)
      setEmail("")
      setPeople((p) =>
        p
          ? {
              ...p,
              // Replace-or-append: the route upserts on (workspace, email), so re-inviting
              // the same address must not stack a second row in the list either.
              invites: [
                { id: body.id, email: body.email, role: body.role, expiresAt: "" },
                ...p.invites.filter((i) => i.email !== body.email),
              ],
            }
          : p,
      )
      setNotice(`Invite sent to ${body.email}.`)
    } catch (err) {
      console.error("Invite failed:", err)
      setNotice(err instanceof Error ? err.message : "Could not send the invite.")
    } finally {
      setBusy(false)
    }
  }

  async function changeRole(membershipId: string, role: Role) {
    const prev = people
    setPeople((p) =>
      p ? { ...p, members: p.members.map((m) => (m.id === membershipId ? { ...m, role } : m)) } : p,
    )
    try {
      const res = await fetch(`/api/workspace/members/${membershipId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) throw new Error(`role change failed: ${res.status}`)
    } catch (err) {
      console.error("Role change failed:", err)
      setPeople(prev)
      setNotice("Could not change that role.")
    }
  }

  async function revokeInvite(id: string) {
    const prev = people
    setPeople((p) => (p ? { ...p, invites: p.invites.filter((i) => i.id !== id) } : p))
    try {
      const res = await fetch(`/api/workspace/invites/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`revoke failed: ${res.status}`)
    } catch (err) {
      console.error("Invite revoke failed:", err)
      setPeople(prev)
    }
  }

  const canManage = people?.canManage ?? false

  return (
    <Modal title="Share & access" onClose={onClose} tone="light" width="max-w-xl">
      <div className="space-y-5 p-5">
        {canManage && (
          <form onSubmit={invite} className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Invite by email"
              className="min-w-0 flex-1 rounded border border-ink-400 bg-paper-0 px-3 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-500 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "EDITOR" | "VIEWER")}
              aria-label="Role for the invited person"
              className="rounded border border-ink-400 bg-paper-0 px-2 py-2 text-sm text-ink-900 outline-none focus:border-accent-500"
            >
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
            >
              Invite
            </button>
          </form>
        )}

        {notice && (
          <p role="status" className="rounded bg-paper-50 px-3 py-2 text-xs text-ink-500">
            {notice}
          </p>
        )}

        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">
            People with access
          </h3>

          {loadError ? (
            <p className="text-sm text-ink-500">Could not load the member list.</p>
          ) : !people ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : (
            <ul className="divide-y divide-ink-200 rounded border border-ink-200 bg-paper-0">
              {/* The workspace group row. Every member reaches this board through the
                  workspace — there is no per-board membership — so saying so once is more
                  honest than repeating "via workspace" on every row below. */}
              <li className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-paper-100 text-xs font-medium text-ink-900">
                  {people.members.length}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink-900">
                    Everyone at {people.workspace.name}
                  </span>
                  <span className="block text-xs text-ink-500">
                    Access to this board comes from the workspace
                  </span>
                </span>
              </li>

              {people.members.map((m) => {
                const isSelf = m.user.id === people.currentUserId
                // OWNER is never editable — it cannot be granted or removed by dropdown,
                // which is exactly what the PATCH route enforces server-side.
                const locked = m.role === "OWNER" || !canManage
                return (
                  <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                    {m.user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- external OAuth avatar
                      <img
                        src={m.user.image}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-600 text-xs font-medium text-white">
                        {(m.user.name || m.user.email).trim().slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink-900">
                        {m.user.name || m.user.email}
                        {isSelf && <span className="ml-1 text-ink-500">(you)</span>}
                      </span>
                      <span className="block truncate text-xs text-ink-500">{m.user.email}</span>
                    </span>
                    {locked ? (
                      <span className="shrink-0 text-xs text-ink-500">{ROLE_LABEL[m.role]}</span>
                    ) : (
                      <select
                        value={m.role}
                        onChange={(e) => changeRole(m.id, e.target.value as Role)}
                        aria-label={`Role for ${m.user.name || m.user.email}`}
                        className="shrink-0 rounded border border-ink-400 bg-paper-0 px-2 py-1 text-xs text-ink-900 outline-none focus:border-accent-500"
                      >
                        <option value="EDITOR">Editor</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                    )}
                  </li>
                )
              })}

              {people.invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-ink-400 text-xs text-ink-500">
                    ?
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink-900">{i.email}</span>
                    <span className="block text-xs text-ink-500">
                      Invited as {ROLE_LABEL[i.role].toLowerCase()} — not yet accepted
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => revokeInvite(i.id)}
                    className="shrink-0 rounded px-2 py-1 text-xs text-ink-500 transition-colors hover:bg-paper-50 hover:text-red-600"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Managers only — the route will not return a code to anyone else, so a VIEWER
            gets no section rather than an empty one they cannot act on. */}
        {canManage && people && (
          <section className="border-t border-ink-200 pt-4">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">
              Workspace join code
            </h3>

            {people.workspace.joinCode ? (
              <>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={people.workspace.joinCode}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label="Workspace join code"
                    // Monospace and spaced, matching the field people type it into: the
                    // thing being read aloud should look the same at both ends.
                    className="min-w-0 flex-1 rounded border border-ink-200 bg-paper-50 px-3 py-2 text-center font-mono text-sm uppercase tracking-[0.2em] text-ink-900 outline-none"
                  />
                  <button
                    type="button"
                    onClick={copyJoinCode}
                    className="shrink-0 rounded border border-ink-400 px-3 py-2 text-xs text-ink-900 transition-colors hover:bg-paper-50"
                  >
                    {codeCopied ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={rotateJoinCode}
                    disabled={busy}
                    title="Replaces the code. The old one stops working."
                    className="shrink-0 rounded border border-ink-400 px-3 py-2 text-xs text-ink-900 transition-colors hover:bg-paper-50 disabled:opacity-50"
                  >
                    Regenerate
                  </button>
                  <button
                    type="button"
                    onClick={revokeJoinCode}
                    disabled={busy}
                    className="shrink-0 rounded border border-ink-400 px-3 py-2 text-xs text-ink-900 transition-colors hover:bg-paper-50 disabled:opacity-50"
                  >
                    Turn off
                  </button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-ink-500">
                  Anyone signed in who enters this code joins as a viewer. Promote them
                  above once they are in. Unlike an emailed invite it is not tied to an
                  address and is not used up, so turn it off when you are done with it.
                </p>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={rotateJoinCode}
                  disabled={busy}
                  className="rounded border border-ink-400 px-3 py-2 text-xs text-ink-900 transition-colors hover:bg-paper-50 disabled:opacity-50"
                >
                  Create a join code
                </button>
                <p className="mt-2 text-xs leading-relaxed text-ink-500">
                  A code you can read out instead of emailing an invite. Anyone signed in
                  who has it joins as a viewer, until you turn it off.
                </p>
              </>
            )}
          </section>
        )}

        <section className="border-t border-ink-200 pt-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">
            Anyone with the link
          </h3>

          <div
            role="group"
            aria-label="Link access"
            className="flex gap-1 rounded bg-paper-100 p-1"
          >
            {SHARE_ACCESS.map((tier) => {
              const active = tier === access
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => changeAccess(tier)}
                  disabled={!canManage}
                  aria-pressed={active}
                  className={`flex-1 rounded px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                    active
                      ? "bg-paper-0 font-medium text-ink-900 shadow-sm"
                      : "text-ink-500 hover:text-ink-900"
                  }`}
                >
                  {SHARE_LABELS[tier].label}
                </button>
              )
            })}
          </div>

          <p className="mt-2 text-xs leading-relaxed text-ink-500">{SHARE_LABELS[access].hint}</p>

          {grantsAccess(access) && (
            <div className="mt-3 flex gap-2">
              <input
                readOnly
                // Empty only for the instant before the origin effect runs.
                value={url ?? ""}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Share link"
                className="min-w-0 flex-1 rounded border border-ink-200 bg-paper-50 px-3 py-2 text-xs text-ink-500 outline-none"
              />
              <button
                type="button"
                onClick={copy}
                className="shrink-0 rounded border border-ink-400 px-3 py-2 text-xs text-ink-900 transition-colors hover:bg-paper-50"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={busy}
                  title="Replaces the link. The old one stops working."
                  className="shrink-0 rounded border border-ink-400 px-3 py-2 text-xs text-ink-900 transition-colors hover:bg-paper-50 disabled:opacity-50"
                >
                  Regenerate
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
