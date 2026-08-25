"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"

// ponytail: one component for both auth pages — the markup was identical
export function OAuthButtons({ redirectTo = "/dashboard" }: { redirectTo?: string }) {
  // The signIn POST takes 1-8s (Auth.js fetches the provider's discovery doc) with no
  // visible feedback. Extra clicks fire more POSTs, each overwriting the PKCE
  // `code_verifier` cookie, while the browser navigates with the *first* code_challenge —
  // Google then rejects the callback with "Invalid code verifier". One click only.
  const [busy, setBusy] = useState(false)
  const go = (provider: string) => {
    setBusy(true)
    signIn(provider, { redirectTo })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => go("google")}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded border border-ink-400 bg-white py-2 font-medium hover:bg-paper-50 disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 11v3.4h5.6c-.24 1.5-1.76 4.4-5.6 4.4-3.37 0-6.12-2.79-6.12-6.2S8.63 6.4 12 6.4c1.92 0 3.2.82 3.94 1.52l2.68-2.58C16.9 3.72 14.65 2.8 12 2.8 6.9 2.8 2.8 6.9 2.8 12s4.1 9.2 9.2 9.2c5.31 0 8.84-3.73 8.84-8.99 0-.6-.07-1.06-.15-1.51H12z" />
        </svg>
        Continue with Google
      </button>

      <button
        type="button"
        onClick={() => go("github")}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded border border-ink-400 bg-white py-2 font-medium hover:bg-paper-50 disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 22 12c0-5.52-4.48-10-10-10z" />
        </svg>
        Continue with GitHub
      </button>

      <div className="flex items-center gap-3 py-1 text-sm text-ink-700">
        <span className="h-px flex-1 bg-ink-200" />
        or
        <span className="h-px flex-1 bg-ink-200" />
      </div>
    </>
  )
}
