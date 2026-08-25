"use client"

import { useState } from "react"
import { Modal, Toggle } from "@/components/Modal"
import { type PrefKey, clearLocalCache, readPref, writePref } from "@/lib/prefs"

const TABS = ["Preference", "About"] as const
type Tab = (typeof TABS)[number]

/**
 * Board settings: the per-browser preferences, and what this build is.
 *
 * Two tabs, and deliberately no third one for theme or display. The canvas background
 * lives in the canvas panel because it is a property of the BOARD — a column everyone
 * sees — and an app-wide light/dark theme is ruled out by the white-background brand
 * rule. A Display tab here would have to be either a duplicate of the canvas panel or
 * empty.
 */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("Preference")

  return (
    <Modal title="Settings" onClose={onClose} tone="light">
      <div className="flex gap-1 border-b border-outline-variant px-3 pt-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-current={tab === t}
            className={`rounded-t-lg px-3 py-2 text-[13px] transition-colors ${
              tab === t
                ? "border-b-2 border-accent-600 text-on-surface"
                : "border-b-2 border-transparent text-on-surface-variant hover:text-on-surface-variant"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-3">{tab === "Preference" ? <PreferenceTab /> : <AboutTab />}</div>
    </Modal>
  )
}

/** A preference bound straight to localStorage — no context, no provider, no store. */
function usePref(key: PrefKey) {
  // Lazy initialiser, so the read happens on the client after mount rather than during
  // the server render where localStorage does not exist.
  const [value, setValue] = useState(() => readPref(key))
  return [
    value,
    (next: boolean) => {
      setValue(next)
      writePref(key, next)
    },
  ] as const
}

function PreferenceTab() {
  const [defaultBrushes, setDefaultBrushes] = usePref("defaultBrushes")

  return (
    <div className="space-y-0.5">
      <Toggle
        label="Always use default brushes"
        description="Start every board with the default pen, instead of the brush and colour you last used."
        checked={defaultBrushes}
        onChange={setDefaultBrushes}
      />
      <p className="px-2 pt-3 text-[11px] leading-relaxed text-on-surface-variant">
        Preferences are stored in this browser only. They are not shared with the other
        people on your boards.
      </p>
    </div>
  )
}

function AboutTab() {
  // Inlined by next.config at build time — see the note there on why these are build
  // values and not runtime ones.
  const sha = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "unknown"
  const builtAt = process.env.NEXT_PUBLIC_BUILD_TIME
  const env = process.env.NEXT_PUBLIC_DEPLOY_ENV ?? "development"

  // null until pressed, then the number of keys actually removed — so a second press
  // honestly reports 0 rather than repeating the first press's number.
  const [cleared, setCleared] = useState<number | null>(null)

  return (
    <div className="space-y-4 px-2 py-1">
      <dl className="space-y-2 text-[13px]">
        <Row label="Version">
          <span className="font-mono text-on-surface">{sha}</span>
          {env !== "production" && (
            <span className="ml-2 rounded-full bg-surface-container px-2 py-0.5 text-[10px] text-on-surface-variant">
              {env}
            </span>
          )}
        </Row>
        <Row label="Built">
          <span className="text-on-surface">
            {builtAt ? new Date(builtAt).toLocaleString() : "unknown"}
          </span>
        </Row>
      </dl>

      <div className="border-t border-outline-variant pt-4">
        <button
          type="button"
          onClick={() => setCleared(clearLocalCache())}
          className="rounded border border-outline-variant px-3 py-1.5 text-[13px] text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          Clear local cache
        </button>
        <p className="mt-2 text-[11px] leading-relaxed text-on-surface-variant">
          {cleared === null ? (
            // Says exactly what it clears. Board content is not cached in this browser —
            // it lives on the server and arrives over the realtime connection — so
            // calling this a document cache would be a lie, and it would also imply your
            // work is at risk when it is not.
            <>
              Resets the preferences above to their defaults. Your account, your boards
              and their contents are not affected.
            </>
          ) : cleared === 0 ? (
            <>Nothing to clear — preferences are already at their defaults.</>
          ) : (
            <>
              Cleared {cleared} {cleared === 1 ? "preference" : "preferences"}. Reload for
              them to take effect everywhere.
            </>
          )}
        </p>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}
