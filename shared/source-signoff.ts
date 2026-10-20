/**
 * CS-1 item 1 — SOURCE SIGN-OFF AND TERMS CLASS (decision-maker, Oct 18, 2026; ledger `2026-10-18-cs1-source-signoff`;
 * migration 395, HELD). The pure rules; the ONE writer is `server/services/content-sources.service.ts`.
 *
 *   · `signoff_status` — pending | approved | rejected. NULL reads as pending: a source nobody signed off is pending,
 *     never approved. Only the allowlisted approver (the activator allowlist) sets approved or rejected.
 *   · `terms_class` — store | extract | link_out | link_out_no_link. A link-out source is never read: it is named
 *     (and, for `link_out`, linked) in findings, and its adapter is forced to `manual`.
 *   · `automated_access_allowed` — the site's terms and robots allow a machine to fetch it. A scheduled refresh or a
 *     per-plan fetch reads ONLY a source that is approved, of a reading class, and allows automated access; any other
 *     store/extract source goes on the manual recheck list.
 *   · `credit_text` — the credit line the source asks for, as stated.
 * A change to the terms a sign-off covered returns the source to pending and deactivates it (TERMS_BOUND).
 * No db, no clock.
 */

export const TERMS_CLASSES = ["store", "extract", "link_out", "link_out_no_link"] as const;
export type TermsClass = (typeof TERMS_CLASSES)[number];

export const SIGNOFF_STATUSES = ["pending", "approved", "rejected"] as const;
export type SignoffStatus = (typeof SIGNOFF_STATUSES)[number];

/** The decisions the approver may record (pending is never "recorded"; it is what an edit returns a row to). */
export const SIGNOFF_DECISIONS = ["approved", "rejected"] as const;
export type SignoffDecision = (typeof SIGNOFF_DECISIONS)[number];

export function isTermsClass(v: unknown): v is TermsClass {
  return typeof v === "string" && (TERMS_CLASSES as readonly string[]).includes(v);
}

/** A link-out source: never fetched, never a stored fact or price. */
export function isLinkOutClass(v: unknown): boolean {
  return v === "link_out" || v === "link_out_no_link";
}

/** The classes a machine may read facts from. */
export function isReadingClass(v: unknown): boolean {
  return v === "store" || v === "extract";
}

/** Pure. The adapter a source is stored with: a link-out class forces `manual` (decision-maker ruling 1, Oct 18). */
export function adapterForTermsClass(termsClass: unknown, adapter: string): string {
  return isLinkOutClass(termsClass) ? "manual" : adapter;
}

/** Pure. NULL (never signed off) reads as pending. */
export function signoffStatusOf(row: { signoffStatus?: string | null }): SignoffStatus {
  const s = row.signoffStatus;
  return s === "approved" || s === "rejected" ? s : "pending";
}

export interface SignoffRow {
  active?: boolean | null;
  signoffStatus?: string | null;
  termsClass?: string | null;
  automatedAccessAllowed?: boolean | null;
}

/** Pure. May activation be asked for? Signed off as approved, with a terms class. */
export function signoffAllowsActivation(row: SignoffRow): boolean {
  return signoffStatusOf(row) === "approved" && isTermsClass(row.termsClass);
}

/**
 * Pure. May a machine fetch this source — a scheduled refresh or a per-plan extract? Approved, a reading class, and the
 * site allows automated access. Everything else is read by a person, if at all.
 */
export function autoFetchAllowed(row: SignoffRow): boolean {
  return signoffStatusOf(row) === "approved" && isReadingClass(row.termsClass) && row.automatedAccessAllowed === true;
}

/**
 * Pure. Does this source belong on the manual recheck list — a reading-class source whose terms or robots do not let a
 * machine fetch it (answered no, or never answered)? A person rechecks it by hand.
 */
export function needsManualRecheck(row: SignoffRow): boolean {
  return isReadingClass(row.termsClass) && row.automatedAccessAllowed !== true;
}

/** Edits to these fields change what a sign-off covered; the row returns to pending (and the terms check clears). */
export const SIGNOFF_BOUND_FIELDS = ["homepage", "termsUrl", "licenseClass", "adapter", "termsClass", "automatedAccessAllowed"] as const;

/** CS-1 item 3: what the approver is told when activating a source that is read. */
export const REFRESH_REVIEW_NOTE = "This source's refresh facts need review before they show.";
