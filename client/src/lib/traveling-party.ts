/**
 * THE TRAVELING PARTY — the body one participant write may carry, stated once.
 * Ledger `2026-09-04-plan-islands`; CLAUDE.md Locked Decision 37, §14, §19.
 *
 * ── WHAT THIS LIST IS, AND WHAT IT IS NOT ───────────────────────────────────────────────────
 * `trip_participants` is the TRAVELING PARTY — who is coming with you. It is a different
 * population under a different predicate from the plan's GUEST roster, which is derived from
 * `event_invites` per event (`plan-guest-roster.service.ts`, Locked Decision 37) and answers
 * "who is invited". Ruling 37 says the two are NEVER merged, and this module is on the traveling
 * side of that line: it never reads an invite, never dedupes against one, and the surface it
 * feeds says which question it is answering out loud.
 *
 * ── WHY THE BODY IS A LIST AND NOT A SPREAD (§19) ───────────────────────────────────────────
 * The server admits a participant body through a pick-based allowlist on BOTH rails
 * (`tripParticipantCreateSchema` / `tripParticipantPatchSchema`, `server/routes/content.routes.ts`).
 * A client that posts a whole form object leans on that allowlist to strip what it should not
 * have sent — which works, and teaches the wrong lesson: the next field added to the form rides
 * along until the server refuses it. So the client names its own fields too. The two lists are
 * NOT a second authority: the server's is the one that decides, and this one can only ever be a
 * subset. What it buys is that a money column cannot be typed into this surface by accident.
 *
 * ── MONEY IS NOT ON THIS SCREEN (§14) ───────────────────────────────────────────────────────
 * `amount_owed` / `amount_paid` / `payment_status` / `payment_method` are real columns on the
 * row and are DELIBERATELY absent here — not rendered, not sent, not derived. They are owned by
 * `POST /api/participants/:id/payment`, which computes the running total from the stored row;
 * a settle-up screen is a separate lane with its own gate.
 *
 * ── §13: ABSENT IS ABSENT ───────────────────────────────────────────────────────────────────
 * Every field but the name is optional, and an empty one is sent as `null` — CLEARED — rather
 * than omitted, so a traveler can take back an answer they typed by mistake. What is never done
 * is inventing one: an unstated arrival is not the plan's first day, an unstated mobility level
 * is not "high" (the column's DB default exists for rows nobody has been asked about, and this
 * surface does not re-assert it as the traveler's own answer), and an unstated role is not
 * "guest".
 *
 * Pure: no React, no fetch. Tested by `client/src/lib/__tests__/plan-islands.test.ts`.
 */

/** The roles this surface offers. `trip_participants.role` is free varchar with no DB CHECK, so
 *  this is the SURFACE's list, not a schema claim — it matches the column's own comment
 *  (organizer, co-organizer, guest, vendor_contact) and nothing here rejects a stored value
 *  outside it (an existing row renders whatever it holds). */
export const TRAVELING_PARTY_ROLES = ["organizer", "co-organizer", "guest", "vendor_contact"] as const;
export type TravelingPartyRole = (typeof TRAVELING_PARTY_ROLES)[number];

/** `trip_participants.mobility_level` — the column's three documented values. Same posture as
 *  the roles above: a surface list over a CHECK-less column, never a schema assertion. */
export const MOBILITY_LEVELS = ["high", "medium", "low"] as const;
export type MobilityLevel = (typeof MOBILITY_LEVELS)[number];

/** What the form holds. Every field is a string because that is what an input yields; the
 *  normalizer below is the one place they become the row's shapes. */
export interface TravelingPartyForm {
  name: string;
  role: string;
  /** "YYYY-MM-DD" or a full ISO instant — whatever the input produced. */
  arrival: string;
  departure: string;
  /** Free text, comma-separated. `accessibility_needs` is a jsonb ARRAY on the row. */
  accessibilityNeeds: string;
  mobilityLevel: string;
}

/** The exact body one write may carry. Nothing else is ever sent to either participant rail. */
export interface TravelingPartyBody {
  name: string;
  role: string | null;
  arrivalDatetime: string | null;
  departureDatetime: string | null;
  accessibilityNeeds: string[];
  mobilityLevel: string | null;
}

export const EMPTY_TRAVELING_PARTY_FORM: TravelingPartyForm = {
  name: "",
  role: "",
  arrival: "",
  departure: "",
  accessibilityNeeds: "",
  mobilityLevel: "",
};

const MAX_NAME = 200;

function trimmedOrNull(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : null;
}

/**
 * Split the free-text accessibility field into the array the jsonb column holds.
 *
 * Comma-separated, trimmed, blanks dropped, duplicates collapsed case-insensitively with the
 * FIRST spelling kept (the traveler's own capitalisation is their answer, not something to
 * normalise away). An empty field yields `[]` — the column's own default and the honest "nothing
 * was stated"; it is never rendered back as "no accessibility needs", a claim only the person can
 * make.
 */
export function parseAccessibilityNeeds(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const clean = part.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/** The array back into the field, so an edit shows what is stored rather than re-deriving it. */
export function formatAccessibilityNeeds(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim())
    .join(", ");
}

/**
 * Is this form submittable? ONLY the name is required — it is `NOT NULL` on the row and it is
 * what the party list is a list OF. Everything else may honestly be unanswered.
 */
export function isSubmittableTravelingParty(form: TravelingPartyForm): boolean {
  return form.name.trim().length > 0;
}

/**
 * THE ONE BODY BUILDER, shared by add and edit.
 *
 * A second copy — one for POST, one for PATCH — is how the two rails start disagreeing about
 * what a blank field means (§18 rule 1). Blank ⇒ `null` (CLEARED), never omitted and never
 * back-filled from the plan.
 */
export function travelingPartyBody(form: TravelingPartyForm): TravelingPartyBody {
  return {
    name: form.name.trim().slice(0, MAX_NAME),
    role: trimmedOrNull(form.role),
    arrivalDatetime: trimmedOrNull(form.arrival),
    departureDatetime: trimmedOrNull(form.departure),
    accessibilityNeeds: parseAccessibilityNeeds(form.accessibilityNeeds),
    mobilityLevel: trimmedOrNull(form.mobilityLevel),
  };
}

/**
 * The keys a write may carry, as data, so the negative test can assert the money family is not
 * among them without re-typing the list. Derived from a real body so it cannot drift from the
 * builder above.
 */
export function travelingPartyBodyKeys(): string[] {
  return Object.keys(travelingPartyBody(EMPTY_TRAVELING_PARTY_FORM)).sort();
}
