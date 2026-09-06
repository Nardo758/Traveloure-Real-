/**
 * shared/handle-suggestion.ts — the ONE handle SUGGESTION.
 *
 * Ledger `2026-09-05-handles-are-claimed` (CLAUDE.md Locked Decision 40). Post-publish QA found
 * 0 of 12 public experts carrying a handle, so `/experts/:id` — the printed LD 40 exemption — is
 * still the public addressing scheme in practice. The platform does NOT fix that by generating a
 * handle: a handle is the earner's PUBLIC IDENTITY, the one name a person can be told out loud,
 * and a name the platform picked is not one the earner chose. So it ASKS, and this module is the
 * only thing it brings to the asking: a SUGGESTION, computed once from the name the earner has
 * already given us, shown pre-filled, and written only when they submit it.
 *
 * ONE implementation, three readers (the console banner, the local-expert wizard, the provider
 * wizard) — a second copy would be the derivation-drift class §18 rule 1 names, and the copies
 * would disagree the moment the shape rules move.
 *
 * IT RESTATES NOTHING. The shape authority is `shared/handle.ts` (`HANDLE_RE`,
 * `HANDLE_MIN_LENGTH`, `HANDLE_MAX_LENGTH`) — the same module `PATCH /api/me/handle` validates
 * with — imported here rather than re-typed, so a suggestion can never be a shape the server
 * would refuse.
 *
 * §13 — WHAT IT REFUSES TO DO:
 *   • It NEVER appends random digits, a year, or a counter to force a result. `yuki-2` is not
 *     this person's name; it is the platform's guess dressed as their identity.
 *   • A name that yields nothing usable (empty, punctuation only, a script that folds away)
 *     returns **null**, and the field is left EMPTY for the earner to type. "We could not
 *     suggest one" is a finished answer; a fabricated one is not.
 *   • It says NOTHING about whether the handle is free, reserved, or claimable. Uniqueness is
 *     the SERVER's answer at submit (409/400) and is surfaced verbatim — a client that guessed
 *     availability would be inventing a fact only the database holds.
 */
import { HANDLE_RE, HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH } from "./handle";

export interface HandleSuggestionSource {
  /** A single display name, when the surface has one ("Yuki Tanaka", a business name). */
  displayName?: string | null;
  /** The two-field shape both application wizards and `users` carry. */
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Fold a name to the handle alphabet: NFKD-decompose so a diacritic becomes a separate combining
 * mark, DROP the marks (so "José" → "jose", never "jos" and never "jos-"), lowercase, and turn
 * every run of anything else into a single hyphen. Deliberately a DROP rather than a
 * transliteration: transliterating would need a per-script table, which is a second vocabulary to
 * maintain and to get wrong.
 */
function foldToHandleAlphabet(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The suggested handle for this person, or `null` when their name yields nothing usable.
 *
 * Never claims the handle is available — see the module header.
 */
export function suggestHandle(source: HandleSuggestionSource | string | null | undefined): string | null {
  if (source == null) return null;

  const raw =
    typeof source === "string"
      ? source
      : (source.displayName && source.displayName.trim().length > 0
          ? source.displayName
          : [source.firstName, source.lastName].filter((p) => typeof p === "string" && p.trim().length > 0).join(" "));

  if (typeof raw !== "string" || raw.trim().length === 0) return null;

  let candidate = foldToHandleAlphabet(raw);
  if (candidate.length > HANDLE_MAX_LENGTH) {
    // Truncate, then re-strip: a cut that lands on a hyphen would leave a trailing one, which
    // HANDLE_RE refuses — and silently returning null there would hide a perfectly good name.
    candidate = candidate.slice(0, HANDLE_MAX_LENGTH).replace(/-+$/g, "");
  }

  if (candidate.length < HANDLE_MIN_LENGTH) return null;
  // Final authority is the server's own regex, never a re-derivation of it.
  return HANDLE_RE.test(candidate) ? candidate : null;
}
