"use client"

import { useState } from "react"
import Link from "next/link"
import { Logo } from "@/components/Logo"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage("")
    setLoading(true)

    const res = await fetch("/api/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    const data = await res.json()
    setLoading(false)
    setMessage(data.message || "If an account exists with this email, we've sent a reset link.")
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-hero text-ink-900 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <Logo variant="light" className="mb-8" />

        <h1 className="text-2xl font-medium">Reset your password</h1>
        <p className="text-sm text-ink-700">
          Enter your email and we&apos;ll send you a link to choose a new password.
        </p>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded bg-white border border-ink-400 px-3 py-2 placeholder:text-ink-500 focus:border-pink-600 focus:outline-none"
        />

        {message && (
          <p className="text-sm text-ink-900" role="status">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-accent-500 py-2 font-medium text-white hover:bg-accent-700 disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send reset link"}
        </button>

        <p className="text-sm text-ink-700">
          Remembered it?{" "}
          <Link href="/login" className="text-accent-500 underline underline-offset-2 hover:text-accent-700">
            Log in
          </Link>
        </p>
      </form>
    </main>
  )
}
