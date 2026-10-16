// LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the launch-market waitlist. ONE spelling of the body the public
// form may send, the source value set and the consent wording's key, read by the server's one writer and the
// client page (§18 rule 1). Table and columns: migration 381 (`launch_waitlist`, `consent_texts`).
import { z } from "zod";

/**
 * Where a waitlist sign-up came from. App-enforced (no DB CHECK); anything else is stored as `other`.
 * `signin` = a traveler sent here by the sign-up switch (`?blocked=1`); `blog` = a blog post's CTA;
 * `expert_link` = an expert's short link (LW-1d); `ticker` = the ticker (LW-1f).
 */
export const WAITLIST_SOURCES = ["direct", "blog", "signin", "expert_link", "ticker", "other"] as const;
export type WaitlistSource = (typeof WAITLIST_SOURCES)[number];

export function normalizeWaitlistSource(value: unknown): WaitlistSource {
  if (typeof value !== "string" || value === "") return "direct";
  return (WAITLIST_SOURCES as readonly string[]).includes(value) ? (value as WaitlistSource) : "other";
}

/** A source reference (e.g. a blog post's slug): lower-case slug characters, at most 200; anything else is dropped. */
export function normalizeSourceRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,199}$/.test(v) ? v : null;
}

/** Trimmed, lower-cased — the identity the UNIQUE (email, market_slug) index keys on. */
export function normalizeWaitlistEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The public form's body — an ALLOWLIST (§19), `.strict()` so an unknown key is refused, never silently kept.
 * `website` is the honeypot: a person never sees or fills it; a non-empty value is answered like a success and
 * nothing is written. No market, referrer or consent timestamp is ever taken from the body.
 */
export const waitlistJoinBodySchema = z
  .object({
    email: z.string().trim().email().max(254),
    consent: z.boolean().optional(),
    source: z.string().max(32).optional(),
    sourceRef: z.string().max(200).optional(),
    website: z.string().max(200).optional(),
  })
  .strict();
export type WaitlistJoinBody = z.infer<typeof waitlistJoinBodySchema>;

/** The consent wording's key and version. A wording change is a new version, never an edit (migration 381). */
export const WAITLIST_CONSENT_KEY = "launch_waitlist_updates";
/**
 * PLACEHOLDER until Marketing's F1 copy (hand-off file) reaches the Launch session: this version name says so,
 * so no consent recorded against it can be mistaken for consent to the final wording.
 */
export const WAITLIST_CONSENT_VERSION = "placeholder-v0";
export const WAITLIST_CONSENT_TEXT = "[Placeholder — F1 consent copy pending] Email me launch updates.";
