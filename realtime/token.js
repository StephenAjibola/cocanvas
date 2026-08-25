import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Short-lived room tokens, signed with HMAC-SHA256.
 *
 * Format: base64url(payloadJSON) "." base64url(signature) — a minimal JWS, without
 * a JWT library, because the payload is four fields we control on both ends and the
 * only algorithm involved is in node:crypto already.
 *
 * The Next.js app mints these (src/lib/realtime-token.ts) and this service verifies
 * them. The two files are deliberate duplicates: the service is standalone and must
 * not import from the Next app's source tree. Keep the format in step if you touch
 * either — realtime/token.test.js pins it.
 */

const b64url = (input) => Buffer.from(input).toString("base64url")

const signature = (body, secret) =>
  b64url(createHmac("sha256", secret).update(body).digest())

export function signToken(payload, secret) {
  const body = b64url(JSON.stringify(payload))
  return `${body}.${signature(body, secret)}`
}

/** Returns the claims, or null if the token is malformed, forged, or expired. */
export function verifyToken(token, secret) {
  if (typeof token !== "string") return null
  const dot = token.indexOf(".")
  if (dot < 1) return null

  const body = token.slice(0, dot)
  const provided = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(signature(body, secret))
  // Length-check first: timingSafeEqual throws on a mismatch. Constant-time compare,
  // so a wrong signature can't be narrowed down byte by byte.
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null
  }

  // Only parsed once the signature is proven — never trust unverified bytes.
  let claims
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (typeof claims?.exp !== "number" || claims.exp < Date.now()) return null
  return claims
}
