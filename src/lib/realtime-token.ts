import { createHmac } from "node:crypto"

/**
 * Mints short-lived room tokens for the realtime service.
 *
 * The verifier is realtime/token.js — a deliberate duplicate, because that service is
 * standalone and must not import from this source tree. The wire format is
 * base64url(payload) "." base64url(HMAC-SHA256), and realtime/token.test.js pins it.
 * If you change the format here, change it there.
 *
 * Server-only: it reads AUTH_SECRET and uses node:crypto. Never import from a client
 * component.
 */

export const TOKEN_TTL_MS = 15 * 60 * 1000

export type RoomClaims = {
  boardId: string
  userId: string
  name: string
  /** Epoch ms. The service rejects anything at or past this. */
  exp: number
}

export function signToken(claims: RoomClaims, secret: string) {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url")
  const sig = createHmac("sha256", secret).update(body).digest("base64url")
  return `${body}.${sig}`
}
