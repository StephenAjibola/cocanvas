import { execSync } from "node:child_process"
import type { NextConfig } from "next";

/**
 * The commit this bundle was built from.
 *
 * Vercel sets VERCEL_GIT_COMMIT_SHA on every deployment, and that is the value to trust
 * in production: it names the commit that was actually built, which a local `git` call
 * cannot do from inside a Vercel build (the repo there is a shallow checkout, and on
 * some build images not a git repo at all).
 *
 * The git fallback is for local dev, where there is no Vercel env but there IS a real
 * working tree. It is wrapped because the failure modes are mundane and none of them
 * should take a build down: no git on PATH, not a repo, a repo with no commits yet.
 */
function commitSha() {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (fromVercel) return fromVercel.slice(0, 7)
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
  } catch {
    return "unknown"
  }
}

const nextConfig: NextConfig = {
  /**
   * Pinned because there is a stray package-lock.json in the PARENT directory, and
   * Turbopack's inference picked that as the workspace root — warning on every start and
   * resolving from one directory above the app. This says which lockfile is ours.
   */
  turbopack: {
    root: import.meta.dirname,
  },

  /**
   * Inlined at build time, which is the only way the About tab can show them — it is a
   * client component, and process.env is not readable there at runtime.
   *
   * The timestamp is when the BUNDLE was built, not when the server started. That is the
   * honest reading of "deployed": a long-running instance would otherwise report a
   * deploy time that drifts forward from the code it is actually serving.
   */
  env: {
    NEXT_PUBLIC_COMMIT_SHA: commitSha(),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    // "production" | "preview" | "development" on Vercel; absent locally.
    NEXT_PUBLIC_DEPLOY_ENV: process.env.VERCEL_ENV ?? "development",
  },
};

export default nextConfig;
