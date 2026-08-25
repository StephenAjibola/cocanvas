import { randomInt } from "node:crypto"

/**
 * Human-enterable join codes for workspace invites.
 *
 * The code is a SECOND way to redeem the invite that already exists — not a new way in.
 * Redeeming still requires being signed in as the invited address, exactly as the emailed
 * link does, so a code that leaks is no more use to a stranger than a link that leaks.
 * That is what keeps this from being a new authorization surface.
 *
 * It exists because email is the weak link: a message can land in spam, be delayed, or —
 * as in this project's own dev setup — be undeliverable to anyone but the account that
 * owns the sending domain. A code can be read down a phone or pasted into chat.
 */

/**
 * Deliberately missing 0/O/1/I/L/U.
 *
 * The first five are the pairs people mistype when copying a code by eye. U is dropped
 * separately: with the vowels gone from a 32-symbol set, excluding it removes most of the
 * accidental profanity a random generator would otherwise produce.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"

/** 8 symbols over a 30-symbol alphabet — about 39 bits. */
const LENGTH = 8

/**
 * A fresh code, grouped as XXXX-XXXX.
 *
 * randomInt from node:crypto, never Math.random: this is a credential, and a predictable
 * one would let someone enumerate live invites and learn which addresses were invited.
 * The dash is presentation only — normalize() strips it, so a user may type it or not.
 */
export function generateInviteCode(): string {
  let out = ""
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)]
  return `${out.slice(0, 4)}-${out.slice(4)}`
}

/**
 * Folds whatever the user typed into the stored form, or null if it cannot be one.
 *
 * Case, spaces and dashes are forgiven, because those are formatting rather than content
 * — someone pasting "abcd efgh" or "ABCD-EFGH" or "abcdefgh" meant the same code.
 *
 * Excluded characters are NOT silently remapped. It is tempting to treat a typed "0" as
 * "O" and so on, but the alphabet has neither, so there is no correct answer to map it
 * to: a "0" could be a misread 8, D, or Q. Guessing would turn one wrong code into a
 * different wrong code and produce "invalid" a second time, which is worse than saying so
 * at once. The exclusions exist so the code never CONTAINS a confusable in the first
 * place; they are not a licence to accept one.
 *
 * Returning null rather than a best-effort string lets the route reject a malformed code
 * without a database round trip — and without that round trip being an oracle for
 * whether some other code exists.
 */
export function normalizeInviteCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null

  const bare = raw.toUpperCase().replace(/[\s-]/g, "")
  if (bare.length !== LENGTH) return null
  if (![...bare].every((c) => ALPHABET.includes(c))) return null
  return `${bare.slice(0, 4)}-${bare.slice(4)}`
}

/**
 * What a workspace join code grants — never more than this.
 *
 * A workspace code is bearer authority: it is meant to be read out in a meeting, so
 * anyone who repeats it can join. An addressed invite can carry EDITOR because the
 * inviter picked the person; a code has picked nobody, so it grants the least useful
 * thing that still gets someone into the room, and a manager promotes from the People
 * list afterwards. Named here rather than inlined in the route so there is exactly one
 * place this can be raised, deliberately.
 */
export const JOIN_CODE_ROLE = "VIEWER" as const

/** The stored/display form, for a code that is already known-good. */
export function formatInviteCode(code: string) {
  const bare = code.replace(/-/g, "")
  return `${bare.slice(0, 4)}-${bare.slice(4)}`
}
