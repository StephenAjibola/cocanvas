"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

type WorkspaceOption = { id: string; name: string; role: "OWNER" | "EDITOR" | "VIEWER" }

/**
 * Only worth showing as a dropdown once there's more than one workspace to switch
 * between — before invites existed nobody ever had a second one, which is why this
 * didn't exist yet. See lib/workspace.ts for how the cookie it writes gets read back.
 */
export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: WorkspaceOption
  workspaces: WorkspaceOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  async function switchTo(workspaceId: string) {
    if (workspaceId === current.id) {
      setOpen(false)
      return
    }
    setPending(true)
    try {
      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      })
      if (!res.ok) throw new Error(`switch failed: ${res.status}`)
      setOpen(false)
      router.push("/dashboard")
      router.refresh()
    } catch (err) {
      console.error("Workspace switch failed:", err)
      setPending(false)
    }
  }

  if (workspaces.length <= 1) {
    return <p className="truncate px-2 text-sm font-medium text-ink-900">{current.name}</p>
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm font-medium text-ink-900 hover:bg-paper-50 disabled:opacity-50"
      >
        <span className="truncate">{current.name}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-500">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 w-full min-w-[200px] overflow-hidden rounded-xl border border-ink-200 bg-white p-1 shadow-lg"
        >
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              role="menuitem"
              onClick={() => switchTo(w.id)}
              className={`flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-sm ${
                w.id === current.id ? "bg-paper-100 text-ink-900" : "text-ink-700 hover:bg-paper-50"
              }`}
            >
              <span className="truncate">{w.name}</span>
              <span className="text-xs text-ink-500">{w.role.charAt(0) + w.role.slice(1).toLowerCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
