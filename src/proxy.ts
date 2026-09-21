import { NextResponse, type NextRequest } from "next/server"

/**
 * A real 307 to /login for a visitor with no session cookie at all.
 *
 * The dashboard layout streams (see its comment), so requireWorkspace's redirect lands
 * after the response has started and can only redirect client-side — a signed-out visit
 * would flash the skeleton first. This catches the common case before any rendering.
 *
 * ponytail: PRESENCE check only, not verification. A stale or forged cookie gets past
 * here and is still turned away by requireWorkspace, which is the actual gate.
 * Auth.js chunks a large JWT into `.0`, `.1`…, hence the prefix match.
 */
export function proxy(req: NextRequest) {
  const signedIn = req.cookies
    .getAll()
    .some((c) => /^(__Secure-)?authjs\.session-token/.test(c.name))
  if (signedIn) return NextResponse.next()
  return NextResponse.redirect(new URL("/login", req.url))
}

export const config = { matcher: ["/dashboard/:path*"] }
