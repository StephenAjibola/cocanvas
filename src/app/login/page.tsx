"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { signIn } from "next-auth/react"
import { Logo } from "@/components/Logo"
import { OAuthButtons } from "@/components/OAuthButtons"

// Auth.js redirects OAuth failures to `pages.signIn` with ?error=<code>
const OAUTH_ERRORS: Record<string, string> = {
  OAuthAccountNotLinked:
    "You already have an account with this email. Log in with your password below.",
  OAuthCallback: "That sign-in didn't complete. Try again.",
  AccessDenied: "That account doesn't have access.",
  Configuration: "That sign-in didn't complete. Try again.",
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const justReset = searchParams.get("reset") === "1"
  const oauthError = searchParams.get("error")
  const next = searchParams.get("next") || ""
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [unverified, setUnverified] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setUnverified(false)
    setLoading(true)

    const res = await signIn("credentials", { email, password, redirect: false })
    setLoading(false)

    if (res?.code === "EMAIL_NOT_VERIFIED") {
      setUnverified(true)
      setError("Please verify your email before logging in.")
      return
    }

    if (res?.error) {
      setError("Incorrect email or password.")
      return
    }

    router.push(next || "/dashboard")
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-hero text-ink-900 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <Logo variant="light" className="mb-8" />

        <h1 className="text-2xl font-medium">Welcome back</h1>

        <OAuthButtons redirectTo={next || "/dashboard"} />

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded bg-white border border-ink-400 px-3 py-2 placeholder:text-ink-500 focus:border-pink-600 focus:outline-none"
        />

        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded bg-white border border-ink-400 px-3 py-2 pr-10 placeholder:text-ink-500 focus:border-pink-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-500 hover:text-ink-900"
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm text-accent-500 underline underline-offset-2 hover:text-accent-700"
          >
            Forgot password?
          </Link>
        </div>

        {justReset && (
          <p className="text-sm text-ink-900" role="status">
            Password updated. Log in with your new password.
          </p>
        )}

        {oauthError && !error && (
          <p className="text-sm text-ink-900" role="alert">
            {OAUTH_ERRORS[oauthError] || "Couldn't sign you in. Try again."}
          </p>
        )}

        {error && (
          <p className="text-sm text-ink-900" role="alert">
            {error}
            {unverified && (
              <>
                {" "}
                <Link
                  href={`/verify?email=${encodeURIComponent(email)}${next ? `&next=${encodeURIComponent(next)}` : ""}`}
                  className="text-accent-500 underline underline-offset-2 hover:text-accent-700"
                >
                  Verify now
                </Link>
              </>
            )}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-accent-500 py-2 font-medium text-white hover:bg-accent-700 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Log in"}
        </button>

        <p className="text-sm text-ink-700">
          Don&apos;t have an account?{" "}
          <Link
            href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
            className="text-accent-500 underline underline-offset-2 hover:text-accent-700"
          >
            Sign up
          </Link>
        </p>
      </form>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
