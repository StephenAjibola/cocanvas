/**
 * Display-casing for names people typed themselves.
 *
 * Exists because the auto-generated workspace name is built from whatever went into the
 * signup field, and "soboyede stephen" became "soboyede stephen's Workspace" — a label
 * the person then sees on every page.
 */

/**
 * Title-cases a name, but ONLY when it carries no capitals of its own.
 *
 * The conditional is the whole design. Blanket title-casing destroys names that were
 * typed correctly — "McDonald" becomes "Mcdonald", "van der Berg" becomes "Van Der Berg",
 * "danah boyd" gets a capital its owner deliberately omits. An all-lowercase string is
 * the one case where nothing can be lost, because there was no casing information in it
 * to begin with: someone typed fast, not meaningfully.
 *
 * Word boundaries include hyphens and apostrophes, so "mary-jane o'brien" comes back as
 * "Mary-Jane O'Brien" rather than "Mary-jane O'brien".
 *
 * The known cost: a name lowercased ON PURPOSE ("danah boyd") is capitalised anyway,
 * because nothing in the string separates that from a hurried entry. That is tolerable
 * only because of where this is used — it builds a workspace LABEL and never writes back
 * to User.name, so the person's own name stays exactly as they entered it everywhere it
 * is shown. See names.test.ts, which pins the behaviour rather than hiding it.
 *
 * This does NOT reorder anything. If a name was entered family-name-first, that is what
 * was typed and this has no way to know it — guessing which token is the given name is
 * not something any locale-independent rule can do.
 */
export function titleCaseName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ")
  if (!name) return name
  // Any capital at all means the casing was intentional — leave it exactly as typed.
  if (name !== name.toLowerCase()) return name

  return name.replace(/(^|[\s\-'’])([a-z])/g, (_, boundary, letter: string) =>
    boundary + letter.toUpperCase(),
  )
}

/**
 * The label a brand-new workspace gets.
 *
 * Falls back to the local part of the email when there is no name — that part is often
 * "firstname.lastname" or similar, so the separators are turned into spaces before
 * casing rather than left as "soboyede.stephen's Workspace".
 */
export function defaultWorkspaceName(name: string | null, email: string): string {
  const source = name?.trim() || email.split("@")[0].replace(/[._-]+/g, " ")
  return `${titleCaseName(source)}'s Workspace`
}
