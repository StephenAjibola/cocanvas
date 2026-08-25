"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"

function VerifyForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get("email") || ""
  const next = searchParams.get("next") || ""

  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [expiresAt, setExpiresAt] = useState(searchParams.get("expires") || "")
  const [msLeft, setMsLeft] = useState(0)

  useEffect(() => {
    if (!expiresAt) return
    const tick = () => setMsLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  async function handleResend() {
    setError("")
    setNotice("")
    setResending(true)

    const res = await fetch("/api/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    const data = await res.json()
    setResending(false)

    if (!res.ok) {
      setError(data.error || "Couldn't resend the code")
      return
    }

    setExpiresAt(data.expiresAt || "")
    setNotice("New code sent. Check your inbox.")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setNotice("")
    setLoading(true)

    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || "Invalid code")
      return
    }

    router.push(next ? `/login?next=${encodeURIComponent(next)}` : "/login")
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-hero text-ink-900">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-medium">Check your email</h1>
        <p className="text-ink-700 text-sm">
          We sent a 6-digit code to {email}
        </p>

        <input
          type="text"
          placeholder="Enter code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
          required
          className="w-full rounded bg-white border border-ink-400 px-3 py-2 text-center text-2xl tracking-widest"
        />

        {expiresAt && (
          <p className="text-sm text-ink-500">
            {msLeft > 0
              ? `Code expires in ${Math.floor(msLeft / 60000)}:${String(
                  Math.floor(msLeft / 1000) % 60
                ).padStart(2, "0")}`
              : "Code expired — request a new one below"}
          </p>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {notice && <p className="text-ink-700 text-sm">{notice}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-accent-500 py-2 font-medium text-white hover:bg-accent-700 disabled:opacity-50"
        >
          {loading ? "Verifying..." : "Verify"}
        </button>

        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="w-full text-sm text-ink-700 hover:text-ink-900 disabled:opacity-50"
        >
          {resending ? "Sending..." : "Didn't get it? Resend code"}
        </button>
      </form>
    </main>
  )
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  )
}