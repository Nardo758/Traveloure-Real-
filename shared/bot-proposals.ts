/**
 * BOT-1 Phase 1 — THE BOT CHANNEL, the pure rules (decision-maker, Oct 15, 2026: scope report approved as
 * scoped, decisions A–D; ledger `2026-10-15-bot1-phase1`; migration 378). Every value set and every rule the
 * router, the admin routes, the approve path and the tests read is stated here ONCE (§18 rule 1). No db, no clock.
 *
 *   · PROPOSE ONLY. A bot reads aggregates and files proposals; nothing it sends changes the platform until an
 *     admin approves it. A pending proposal is never a `place_facts` row; a rejected one never touches the table.
 *   · TWO KINDS IN PHASE 1: an hours fact and a last-admission fact for a stop. Bots never propose nugget-type
 *     facts (decision-maker, label ruling).
 *   · ROW 126 ADDS TWO (decision-maker, Oct 22, 2026: "bots may propose closed dates and timed entry — Leon"; ledger
 *     `2026-10-22-bot-closed-dates-timed-entry`): closed dates (a list of ranges) and timed entry
 *     (`{ required, opensDaysAhead? }`). Proposals only, the same review queue. The source must be the place's own
 *     official site — never Google, an OTA or a partner's domain (CS-1 Q10) — and the bot's words never claim a
 *     check: "verified" and "confirmed" are refused. The stamp a traveler reads is written by code from stored fields.
 *   · SCOPES ARE PER ENDPOINT, not per bot: a token carries the list of endpoints it may call.
 *   · AN APPROVED FACT shows only its provenance line — "<source name> · checked <approval date>" — never an
 *     author label and never "Traveloure team" (LD 65). `verified_by` is the approving admin, kept for audit.
 */

export const BOT_SCOPES = ["coverage:read", "facts:read", "proposals:write", "proposals:read"] as const;
export type BotScope = (typeof BOT_SCOPES)[number];

export const BOT_PROPOSAL_KINDS = ["place_fact.hours", "place_fact.last_admission", "place_fact.closed_dates", "place_fact.timed_entry_required"] as const;
export type BotProposalKind = (typeof BOT_PROPOSAL_KINDS)[number];

export const BOT_PROPOSAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type BotProposalStatus = (typeof BOT_PROPOSAL_STATUSES)[number];

/** The fact origin an approved proposal is written with (FACT_ORIGINS; read as a page read, beside the refresh). */
export const BOT_FACT_ORIGIN = "bot_proposal" as const;

/** The platform_settings row holding the default expiry, in days, when the source row states no interval (decision B). */
export const BOT_FACT_DEFAULT_EXPIRY_SETTING = "bot_fact_default_expiry_days" as const;

/** The flag that turns the whole /api/bot surface on. Unset ⇒ off. */
export const BOT_API_FLAG_ENV = "BOT_API_ENABLED" as const;

/** The token's printed prefix, so a leaked value is recognisable in a scanner. The rest is random. */
export const BOT_TOKEN_PREFIX = "tvb_" as const;

export type BotFactType = "hours" | "last_admission" | "closed_dates" | "timed_entry_required";

const KIND_FACT: Record<BotProposalKind, { factType: BotFactType; need: "stop.hours" }> = {
  "place_fact.hours": { factType: "hours", need: "stop.hours" },
  "place_fact.last_admission": { factType: "last_admission", need: "stop.hours" },
  "place_fact.closed_dates": { factType: "closed_dates", need: "stop.hours" },
  "place_fact.timed_entry_required": { factType: "timed_entry_required", need: "stop.hours" },
};

/**
 * Row 126: where an approved fact's expiry comes from.
 *   · `from_dates`        closed dates — midnight after the last listed date, in the plan's zone (the market's for a
 *                         registry fact); stamped by the one writer, never entered by the reviewer.
 *   · `reviewer_required` timed entry — the reviewer's date, capped by the source's expiry setting (falling back to
 *                         `bot_fact_default_expiry_days`).
 *   · `review_rule`       hours and last admission — CS-1's `resolveReviewedExpiry` as it stands.
 */
export type BotExpiryRule = "from_dates" | "reviewer_required" | "review_rule";
export function botKindExpiryRule(kind: BotProposalKind): BotExpiryRule {
  if (kind === "place_fact.closed_dates") return "from_dates";
  if (kind === "place_fact.timed_entry_required") return "reviewer_required";
  return "review_rule";
}

/**
 * Row 126 (CS-1 Q10): host labels that are never a place's own official site — maps and search, and the online travel
 * agencies. A partner's domain is refused through the registry's own hosts (`isOnPartnerHost`), not this list.
 */
export const NOT_OFFICIAL_SITE_LABELS = [
  "google", "googleapis", "goo", "bing", "yahoo",
  "booking", "expedia", "agoda", "hotels", "trip", "tripadvisor", "klook", "kkday", "viator", "getyourguide", "tiqets",
  "airbnb", "cookly", "rakuten", "jalan", "ikyu",
] as const;

/** Pure. Is this host a map, search or OTA host (any label of it is on the list)? */
export function isNotOfficialSiteHost(host: string | null | undefined): boolean {
  if (!host) return true;
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  return labels.some((l) => (NOT_OFFICIAL_SITE_LABELS as readonly string[]).includes(l));
}

/** Pure. Does the bot's text claim a check? A bot never writes "verified" or "confirmed" — a person's review does. */
export function textClaimsVerification(text: string): boolean {
  return /\b(verified|verify|confirmed|confirm)\b/i.test(text.normalize("NFKC"));
}

export function isBotScope(v: unknown): v is BotScope {
  return typeof v === "string" && (BOT_SCOPES as readonly string[]).includes(v);
}
export function isBotProposalKind(v: unknown): v is BotProposalKind {
  return typeof v === "string" && (BOT_PROPOSAL_KINDS as readonly string[]).includes(v);
}

/** The fact type and need a proposal kind writes. */
export function factForKind(kind: BotProposalKind): { factType: BotFactType; need: "stop.hours" } {
  return KIND_FACT[kind];
}

/** May a token carrying these scopes call an endpoint that needs this one? */
export function tokenHasScope(scopes: readonly unknown[] | null | undefined, need: BotScope): boolean {
  return Array.isArray(scopes) && scopes.includes(need);
}

/** Is the token live at this moment? A revoked or expired token is refused; no expiry means it does not expire. */
export function botTokenLive(row: { revokedAt?: Date | string | null; expiresAt?: Date | string | null }, now: Date): boolean {
  if (row.revokedAt != null && String(row.revokedAt) !== "") return false;
  if (row.expiresAt == null || String(row.expiresAt) === "") return true;
  const t = row.expiresAt instanceof Date ? row.expiresAt.getTime() : Date.parse(String(row.expiresAt));
  return Number.isFinite(t) && t > now.getTime();
}

/** The host of a URL, lower-cased, without a leading "www."; null when it does not parse. */
export function urlHost(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export type BotSourceRefusal = "source_not_eligible" | "url_not_https" | "url_off_source_host";

/**
 * Pure. May a proposal cite this source and page? The source row must be active, `official` and terms-checked
 * (decision D: until the row exists, `source_not_eligible` is the correct refusal). The page must be https and on
 * the source's own host (the homepage's host or a subdomain of it).
 */
export function admitBotSource(
  src: { active?: boolean | null; licenseClass?: string | null; termsCheckedAt?: Date | string | null; homepage?: string | null } | null | undefined,
  sourceUrl: string | null | undefined,
): { ok: true } | { ok: false; reason: BotSourceRefusal } {
  if (!src || src.active !== true || src.licenseClass !== "official" || src.termsCheckedAt == null || String(src.termsCheckedAt) === "") {
    return { ok: false, reason: "source_not_eligible" };
  }
  if (typeof sourceUrl !== "string" || !/^https:\/\/\S+$/i.test(sourceUrl)) return { ok: false, reason: "url_not_https" };
  const host = urlHost(sourceUrl);
  const home = urlHost(src.homepage ?? null);
  if (!host || !home || !(host === home || host.endsWith(`.${home}`))) return { ok: false, reason: "url_off_source_host" };
  return { ok: true };
}

export type BotFactRefusal = "not_bot_origin" | "no_source" | "no_official_url" | "not_official" | "no_quote" | "not_verified";

/**
 * Pure. May the ONE writer store this approved fact? The same provenance the official refresh requires (source id,
 * an official https URL, an official license, a verbatim quote), plus the verifier: an approved bot fact always
 * carries the admin who approved it. Feasibility facts additionally pass `admitFeasibilityFact` in the writer.
 */
export function admitBotFact(d: {
  origin: string;
  sourceId: string | null;
  sourceUrl: string | null;
  license: string | null;
  value: unknown;
  verifiedBy?: string | null;
}): { ok: true } | { ok: false; reason: BotFactRefusal } {
  if (d.origin !== BOT_FACT_ORIGIN) return { ok: false, reason: "not_bot_origin" };
  if (!d.sourceId) return { ok: false, reason: "no_source" };
  if (typeof d.sourceUrl !== "string" || !/^https:\/\/\S+$/i.test(d.sourceUrl)) return { ok: false, reason: "no_official_url" };
  if (d.license !== "official") return { ok: false, reason: "not_official" };
  const quote = (d.value as any)?.quote;
  if (typeof quote !== "string" || !quote.trim()) return { ok: false, reason: "no_quote" };
  if (!d.verifiedBy) return { ok: false, reason: "not_verified" };
  return { ok: true };
}

/**
 * Decision B: an approved bot fact expires after the source row's `refresh_interval_days`; where that is unset,
 * after the admin-editable `bot_fact_default_expiry_days` setting (seeded at 90 by migration 378). Neither ⇒ null,
 * and the approve path refuses with `expiry_unset` — never a number written here.
 */
export function botFactExpiryDays(sourceIntervalDays: number | null | undefined, settingValue: string | null | undefined): number | null {
  if (Number.isInteger(sourceIntervalDays) && (sourceIntervalDays as number) > 0) return sourceIntervalDays as number;
  if (typeof settingValue === "string" && /^[1-9]\d{0,3}$/.test(settingValue.trim())) return Number(settingValue.trim());
  return null;
}

/** The value a valid `bot_fact_default_expiry_days` setting may hold: a whole number of days, 1–9999. */
export function isValidExpiryDaysSetting(v: unknown): boolean {
  return typeof v === "string" && /^[1-9]\d{0,3}$/.test(v);
}

/** A canonical JSON string (sorted keys), so the dedupe key does not depend on key order. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as any)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** The string a proposal's dedupe hash is taken over: the same claim about the same place from the same page. */
export function botProposalDedupeInput(p: { kind: string; placeRef: string; sourceUrl: string; value: unknown }): string {
  return `${p.kind}|${p.placeRef}|${p.sourceUrl}|${canonicalJson(p.value)}`;
}
