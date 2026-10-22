/**
 * CS-1 item 3 — A DATED FACT SHOWS ONLY AFTER A PERSON HAS REVIEWED IT (decision-maker, Oct 19, 2026; ledger
 * `2026-10-19-cs1-fact-review`). No migration: the review is `place_facts.verified_by` (a person's id) and
 * `verified_at`. Nothing deletes rows — an unreviewed dated fact is simply not read.
 *
 *   · DATED      — hours, plus the SAFETY set.
 *   · SAFETY     — last_admission, last_service, closed_dates, transit (timetables), event (official viewing and
 *                  illumination dates). A safety fact goes live only with a reviewer-entered expiry taken
 *                  from the source.
 *   · hours      — expire at the latest allowed date unless the reviewer enters a shorter one.
 *   · ticketing_rule, timed_entry_required (ruled Oct 20, 2026) and every other type are not dated and are
 *     untouched by this rule.
 *   · only machine-read origins wait (REVIEWED_ORIGINS: crawled, official_refresh, bot_proposal, places_api). A
 *     listing's, gem's or event's own fact and an expert's or traveler's words keep their existing rules.
 *
 * The latest allowed expiry is never a literal: it is the check date plus the source's admin expiry setting
 * (`refresh_interval_days`), falling back to the `bot_fact_default_expiry_days` platform setting
 * (`botFactExpiryDays`). Neither ⇒ the review is refused (`expiry_unset`). A date the reviewer takes from the
 * source (a season end) wins even when it is sooner.
 *
 * No machine writer (the official refresh, the per-plan fetch, the Places lookup, a bot) ever sets
 * `verified_by`; they write through `machineFacts` in the place-facts service, which strips it.
 * No db, no clock (callers pass `now`).
 */
import { botFactExpiryDays } from "./bot-proposals";
import { DATED_FACT_TYPES, REVIEWED_ORIGINS, SAFETY_FACT_TYPES, factIsReviewed, isDatedFactType, isSafetyFactType, reviewedFactLabel, type DatedFactType } from "./content-facts";

// The sets and the read rule live in shared/content-facts.ts (the provenance line reads them); re-exported here so
// review callers import one module.
export { DATED_FACT_TYPES, REVIEWED_ORIGINS, SAFETY_FACT_TYPES, factIsReviewed, isDatedFactType, isSafetyFactType, reviewedFactLabel, type DatedFactType };

export type ReviewExpiryRefusal = "expiry_unset" | "expiry_required" | "expiry_invalid" | "expiry_past" | "expiry_after_limit";

const DAY_MS = 86_400_000;

/**
 * Pure. The expiry a reviewed fact goes live with.
 *   · `latest`   = checkedAt + botFactExpiryDays(source interval, platform setting); neither ⇒ `expiry_unset`.
 *   · safety     — `entered` is required (`expiry_required`).
 *   · hours      — `entered` optional; absent ⇒ `latest`.
 *   · `entered` must parse, be after `now`, and be no later than `latest`.
 *   · `requireEntered` (row 126, a bot's timed-entry proposal): `entered` is required whatever the type.
 */
export function resolveReviewedExpiry(input: {
  factType: string;
  checkedAt: Date;
  sourceIntervalDays: number | null | undefined;
  settingValue: string | null | undefined;
  entered?: unknown;
  now: Date;
  requireEntered?: boolean;
}): { ok: true; expiresAt: Date; latest: Date } | { ok: false; reason: ReviewExpiryRefusal; latest?: Date } {
  const days = botFactExpiryDays(input.sourceIntervalDays, input.settingValue);
  if (days === null) return { ok: false, reason: "expiry_unset" };
  const latest = new Date(input.checkedAt.getTime() + days * DAY_MS);
  const raw = input.entered;
  const given = raw !== undefined && raw !== null && raw !== "";
  if (!given) {
    if (isSafetyFactType(input.factType) || input.requireEntered) return { ok: false, reason: "expiry_required", latest };
    if (latest.getTime() <= input.now.getTime()) return { ok: false, reason: "expiry_past", latest };
    return { ok: true, expiresAt: latest, latest };
  }
  const t = raw instanceof Date ? raw.getTime() : typeof raw === "string" ? Date.parse(raw) : NaN;
  if (!Number.isFinite(t)) return { ok: false, reason: "expiry_invalid", latest };
  if (t <= input.now.getTime()) return { ok: false, reason: "expiry_past", latest };
  if (t > latest.getTime()) return { ok: false, reason: "expiry_after_limit", latest };
  return { ok: true, expiresAt: new Date(t), latest };
}

/**
 * What a stop shows while its last entry is not checked: "Last entry not checked yet. See <Place>'s official site
 * before you go." The link is the source's TOP-LEVEL page (its origin), never a deep link. A `link_out_no_link`
 * source is named in plain text with no URL; any other class links. No homepage ⇒ no link.
 */
export interface WaitingLine {
  text: string;
  linkText: string;
  url: string | null;
}
export function lastEntryWaitingLine(input: { placeName: string; homepage?: string | null; termsClass?: string | null }): WaitingLine {
  const linkText = `${input.placeName}'s official site`;
  const text = `Last entry not checked yet. See ${linkText} before you go.`;
  return { text, linkText, url: officialTopLevelUrl(input) };
}

/** A Google Maps / Places host: never a waiting line's link (the link is the stored official site). */
function isMapsHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return /(^|\.)google\.[a-z.]+$/.test(h) || /(^|\.)goo\.gl$/.test(h) || /(^|\.)googleapis\.com$/.test(h);
}

/**
 * The source's top-level page for a waiting line; none for a `link_out_no_link` source, an unreadable homepage, or a
 * Google Maps / Places host.
 */
function officialTopLevelUrl(input: { homepage?: string | null; termsClass?: string | null }): string | null {
  if (input.termsClass === "link_out_no_link") return null;
  try {
    if (input.homepage) {
      const u = new URL(input.homepage);
      if (isMapsHost(u.hostname)) return null;
      if (u.protocol === "https:" || u.protocol === "http:") return `${u.origin}/`;
    }
  } catch {
    /* unreadable ⇒ no link */
  }
  return null;
}

/** GH-1's line where a stop's hours are not checked. */
export const HOURS_NOT_CHECKED_TEXT = "Hours not checked yet";

/**
 * CS-1 item 2: what a stop shows once its stored official hours have expired — "Hours not checked yet. See the
 * official site for <Place> before you go." with the stored official source's top-level link (never a Places or map
 * link); with no link to give, plain "Hours not checked yet".
 */
export function hoursWaitingLine(input: { placeName: string; homepage?: string | null; termsClass?: string | null }): WaitingLine {
  const url = officialTopLevelUrl(input);
  if (!url) return { text: HOURS_NOT_CHECKED_TEXT, linkText: "", url: null };
  const linkText = `the official site for ${input.placeName}`;
  return { text: `${HOURS_NOT_CHECKED_TEXT}. See ${linkText} before you go.`, linkText, url };
}
