/**
 * CONTENT FACTS — the pure rules (Track A step A5; content sourcing brief
 * `docs/planning/briefs/content-sourcing-brief.md` §2–§7; ledger `2026-09-29-a5-draft-open-set`).
 *
 * Every fact the engine can use about a place is ONE `place_facts` row with its provenance. This
 * module is the ONE home for the vocabulary (needs, fact types, origins, license classes, adapters),
 * the origin order the engine reads facts in, the ONE `isPublishable` predicate, and the ONE
 * provenance line a surface renders beside a fact (§18 rule 1). No imports but types, so the client
 * bundle, the server and a `node:test` unit share it.
 *
 * Value sets are APP-enforced: the two tables carry NO CHECK (the publish-trap posture).
 */

/** Brief §4 — what a plan has to know. The registry is organised by need, not by site. */
export const CONTENT_NEEDS = [
  "lodging",
  "transport.intercity",
  "transport.local",
  "transport.cruise",
  "stop.hours",
  "stop.ticketing",
  "dining",
  "activity",
  "event",
  "practicalities",
  "neighbourhood",
] as const;
export type ContentNeed = (typeof CONTENT_NEEDS)[number];

/**
 * A6 decision 1B (ledger `2026-10-01-a6-sub-needs`): a SMALL, NAMED list of dotted sub-needs, one
 * level deep. The engine still asks for the parent need (A5 unchanged); a sub-need exists so a
 * source can say "intercity, but not rail" in `does_not_cover`, and so the coverage report can show
 * that gap. Free text ("everything else", "last-service rules") is refused everywhere — it belongs
 * in `notes`.
 */
export const CONTENT_SUB_NEEDS = {
  "transport.intercity.rail": "transport.intercity",
  "transport.intercity.bus": "transport.intercity",
  "transport.intercity.ferry": "transport.intercity",
  "transport.local.fares": "transport.local",
  // FD-3 ruling 3 (ledger `2026-10-10-fd3-feasibility`): an operator's last departure per line or station,
  // from a registered official operator source. Its fact type is `last_service` (shared/feasibility-facts.ts).
  "transport.local.last_service": "transport.local",
} as const satisfies Record<string, ContentNeed>;
export type ContentSubNeed = keyof typeof CONTENT_SUB_NEEDS;
/** A value a `covers` / `does_not_cover` entry may hold: a need or a named sub-need. */
export type ContentNeedKey = ContentNeed | ContentSubNeed;

export function isContentNeed(v: unknown): v is ContentNeed {
  return typeof v === "string" && (CONTENT_NEEDS as readonly string[]).includes(v);
}
export function isContentSubNeed(v: unknown): v is ContentSubNeed {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(CONTENT_SUB_NEEDS, v);
}
export function isContentNeedKey(v: unknown): v is ContentNeedKey {
  return isContentNeed(v) || isContentSubNeed(v);
}
/** The top-level need a key belongs to (itself for a top-level need), or null when it is not ours. */
export function parentNeed(v: unknown): ContentNeed | null {
  if (isContentNeed(v)) return v;
  return isContentSubNeed(v) ? CONTENT_SUB_NEEDS[v] : null;
}
/** The named sub-needs under one need, in declaration order. */
export function subNeedsOf(need: ContentNeed): ContentSubNeed[] {
  return (Object.keys(CONTENT_SUB_NEEDS) as ContentSubNeed[]).filter((k) => CONTENT_SUB_NEEDS[k] === need);
}

/**
 * THE ONE RULE for "does a registry entry reach this need" (§18 rule 1). `entry` is one value from
 * a source's `covers` or `does_not_cover`; `asked` is the need or sub-need being asked about. A
 * parent reaches its own sub-needs; a sub-need never reaches its parent or a sibling. Unknown
 * strings reach nothing (never coerced).
 */
export function needCovers(entry: unknown, asked: unknown): boolean {
  if (!isContentNeedKey(entry) || !isContentNeedKey(asked)) return false;
  if (entry === asked) return true;
  return isContentNeed(entry) && isContentSubNeed(asked) && CONTENT_SUB_NEEDS[asked] === entry;
}

/**
 * How one source stands on one need or sub-need:
 *   `covers`   — a `covers` entry reaches it and no `does_not_cover` entry does;
 *   `partial`  — it covers a parent need but excludes at least one of that need's sub-needs
 *                (12Go: intercity yes, rail no);
 *   `excludes` — a `does_not_cover` entry reaches it (an exclusion always wins);
 *   `none`     — the source says nothing about it.
 * A source covering only a sub-need does NOT cover the parent: a rail-only source is not an
 * intercity source.
 */
export type NeedStanding = "covers" | "partial" | "excludes" | "none";
export function sourceNeedStanding(
  src: { covers?: readonly unknown[] | null; doesNotCover?: readonly unknown[] | null },
  asked: ContentNeedKey,
): NeedStanding {
  const covers = src.covers ?? [];
  const excl = src.doesNotCover ?? [];
  if (excl.some((e) => needCovers(e, asked))) return "excludes";
  if (!covers.some((c) => needCovers(c, asked))) return "none";
  if (isContentNeed(asked) && excl.some((e) => isContentSubNeed(e) && CONTENT_SUB_NEEDS[e] === asked)) return "partial";
  return "covers";
}

/**
 * Admission for a `covers` / `does_not_cover` list (the registry surface's writer reads this):
 * trimmed, de-duplicated, and every value a need or a named sub-need. Anything else is REFUSED by
 * name, never dropped silently.
 */
export function admitNeedList(values: unknown): { ok: true; needs: ContentNeedKey[] } | { ok: false; refused: string[] } {
  if (!Array.isArray(values)) return { ok: false, refused: [String(values)] };
  const needs: ContentNeedKey[] = [];
  const refused: string[] = [];
  for (const raw of values) {
    const v = typeof raw === "string" ? raw.trim() : raw;
    if (isContentNeedKey(v)) { if (!needs.includes(v)) needs.push(v); }
    else refused.push(String(raw));
  }
  return refused.length ? { ok: false, refused } : { ok: true, needs };
}

/**
 * Brief §3's eight fact types, plus TWO the brief's own adapters produce and §3 does not name:
 * `location` (§6/§10: Places supplies "coordinates") and `dining_basics` (§6: "dining basics" —
 * reservable, vegetarian). Stated additions, not renames. A THIRD, `address` (ledger
 * `2026-09-30-places-address`): the Places answer's `formattedAddress` / `shortFormattedAddress`,
 * shown beside the item with the Maps attribution — a display fact, never written onto the item row.
 */
export const FACT_TYPES = [
  "hours",
  "closure",
  "price",
  "ticketing_rule",
  "transit",
  "event",
  "description",
  "tip",
  "location",
  "dining_basics",
  "address",
  // R297 (ledger `2026-10-04-photo-references`): a Place Details answer's photo REFERENCES (resource
  // names + author attributions) — never an image. Same place-ID key and TTL as the other Places facts;
  // the photo resolver reads them, and only the Place Photo media call is made per render.
  "photo_ref",
  // FD-3 (ledger `2026-10-10-fd3-feasibility`): two STRUCTURED operational facts, admitted only through
  // `admitFeasibilityFact` (shared/feasibility-facts.ts) — an official source required, never parsed from text.
  "last_admission",
  "last_service",
] as const;
export type FactType = (typeof FACT_TYPES)[number];

export const FACT_ORIGINS = [
  "platform_listing",
  "expert_nugget",
  "gem",
  "event",
  "hotel_cache",
  "places_api",
  "crawled",
  "traveler_note",
  // SS-1b ruling 1 (ledger `2026-10-10-ss1b-official-refresh`): a fact the market-level refresh read off an
  // official source's own page on a schedule, outside any plan. Read exactly as an official crawl is
  // (`isPageReadOrigin`); the difference is only WHO fetched it and on what clock.
  "official_refresh",
  // BOT-1 Phase 1 ruling 3 (ledger `2026-10-15-bot1-phase1`): a fact a bot proposed from an official page and an
  // admin approved. A pending proposal is never a row; on approval it is written by `recordFacts` with
  // `verified_by` = the approving admin and read exactly as the official refresh is (`isPageReadOrigin`).
  "bot_proposal",
] as const;
export type FactOrigin = (typeof FACT_ORIGINS)[number];

/**
 * SS-1b: the origins whose fact was READ OFF A SOURCE'S PAGE — the per-plan crawl, the market-level
 * official refresh and (BOT-1) an admin-approved bot proposal. Every rule that treats a page-read fact (tier, publishability, tagging, feasibility
 * admission, the cross-plan read) asks this ONE predicate, so the two can never disagree (§18 rule 1).
 */
export const PAGE_READ_ORIGINS = ["crawled", "official_refresh", "bot_proposal"] as const;
export function isPageReadOrigin(origin: string | null | undefined): boolean {
  return (PAGE_READ_ORIGINS as readonly string[]).includes(origin ?? "");
}

/**
 * GH-1 (ledger `2026-10-17-gh1-no-google-hours`; terms ruling, Oct 16, 2026): Google's opening hours are never
 * stored and never read. The ONE rule: the writer refuses such a draft, and every reader skips such a row (a
 * row stored before GH-1 expires on its own within the 30-day Places cap; nothing deletes it).
 */
export function isGoogleHoursFact(f: { origin: string | null | undefined; factType: string | null | undefined }): boolean {
  return f.origin === "places_api" && f.factType === "hours";
}

export const LICENSE_CLASSES = ["official", "editorial", "partner", "restricted"] as const;
export type LicenseClass = (typeof LICENSE_CLASSES)[number];

export const SOURCE_ADAPTERS = ["tavily_crawl", "tavily_extract", "api", "affiliate_feed", "manual"] as const;
export type SourceAdapterKind = (typeof SOURCE_ADAPTERS)[number];

export const PLACE_REF_KINDS = ["place_id", "listing_id", "event_id", "hotel_cache_id", "free_text"] as const;
export type PlaceRefKind = (typeof PLACE_REF_KINDS)[number];

/**
 * Brief §3: the engine orders facts platform-native → verified → Places → crawled → traveler note.
 * Platform-native is every origin the platform itself holds; `hotel_cache` sits last among them
 * because it is partner data we cache rather than content we own.
 */
const ORIGIN_TIER: Record<FactOrigin, number> = {
  platform_listing: 0,
  gem: 0,
  event: 0,
  hotel_cache: 0,
  expert_nugget: 1,
  places_api: 2,
  crawled: 3,
  official_refresh: 3,
  bot_proposal: 3,
  traveler_note: 4,
};

/** Lower is read first. An unknown origin sorts last — never ahead of a known one (§13). */
export function originTier(origin: string | null | undefined): number {
  return origin && origin in ORIGIN_TIER ? ORIGIN_TIER[origin as FactOrigin] : 99;
}

/** The smallest shape the rules read. */
/**
 * CS-1 item 3 (ledger `2026-10-19-cs1-fact-review`): the DATED fact types — hours plus the SAFETY set — show only
 * after a person has reviewed them (`verified_by` holds a person's id), when a machine read them (REVIEWED_ORIGINS). SAFETY facts go live only with a
 * reviewer-entered expiry. ticketing_rule and the rest are not dated. Review rules: shared/fact-review.ts.
 */
export const SAFETY_FACT_TYPES = ["last_admission", "last_service", "closure", "transit", "event"] as const;
export const DATED_FACT_TYPES = ["hours", ...SAFETY_FACT_TYPES] as const;
export type DatedFactType = (typeof DATED_FACT_TYPES)[number];
export function isDatedFactType(t: unknown): t is DatedFactType {
  return typeof t === "string" && (DATED_FACT_TYPES as readonly string[]).includes(t);
}
export function isSafetyFactType(t: unknown): boolean {
  return typeof t === "string" && (SAFETY_FACT_TYPES as readonly string[]).includes(t);
}
/**
 * The origins a MACHINE reads off a page or an API: the per-plan crawl, the official refresh, a bot's proposal and the
 * Places lookup. Only their dated facts wait for a person's review; platform-owned content (a listing, a gem, an event,
 * the hotel cache) and a person's own words (an expert's nugget, a traveler's note) keep their existing rules.
 */
export const REVIEWED_ORIGINS = ["crawled", "official_refresh", "bot_proposal", "places_api"] as const;
/** Pure. May a reader show this row? A dated, machine-read fact needs a person's id in `verified_by`. */
export function factIsReviewed(row: { factType?: string | null; origin?: string | null; verifiedBy?: string | null }): boolean {
  if (!isDatedFactType(row.factType)) return true;
  if (!(REVIEWED_ORIGINS as readonly string[]).includes(row.origin ?? "")) return true;
  return typeof row.verifiedBy === "string" && row.verifiedBy.trim() !== "";
}

export interface FactLike {
  origin: string | null | undefined;
  license?: string | null;
  verifiedAt?: Date | string | null;
  /** The reviewer — a person's id (CS-1 item 3). */
  verifiedBy?: string | null;
  fetchedAt?: Date | string | null;
  expiresAt?: Date | string | null;
  /** The row's `fact_type` — read only by the official-source path below. */
  factType?: string | null;
  /** The fact's SOURCE row, joined by `source_id` — read only by the official-source path below. */
  sourceLicenseClass?: string | null;
  sourcePublicOk?: boolean | null;
}

/**
 * Ruling R-p (2026-10-03, ledger `2026-10-03-official-facts-public-ok`): the ONLY fact types an
 * official source's crawled fact may carry onto a public page. Operational facts a venue states about
 * itself. `description` and `tip` NEVER qualify by this path — prose stays plan-only until an expert
 * verifies it (§8's flywheel).
 */
export const PUBLIC_OK_FACT_TYPES = ["hours", "closure", "ticketing_rule", "transit", "event"] as const satisfies readonly FactType[];

/**
 * The official-source path, on its own so a surface can ask whether a publishable fact owes the
 * "from <source> · checked <date>" attribution: a CRAWLED fact whose source is `official` AND marked
 * `public_ok` at terms check, of an operational fact type. Every condition is required; NULL is no.
 */
export function isOfficialPublicFact(fact: FactLike): boolean {
  if (!isPageReadOrigin(fact.origin)) return false;
  if (fact.license === "partner" || fact.license === "restricted") return false;
  if (fact.sourceLicenseClass !== "official" || fact.sourcePublicOk !== true) return false;
  return (PUBLIC_OK_FACT_TYPES as readonly string[]).includes(fact.factType ?? "");
}

const PLATFORM_OWNED: ReadonlySet<string> = new Set(["platform_listing", "gem", "event"]);

/**
 * Brief §2: THE ONE PREDICATE for "may this fact appear on a public surface" (blog, city pages,
 * sitemap). Public feeds get only platform-originated, verified content — derived from `origin` and
 * `license`, never re-decided per page.
 *   · places_api / crawled / hotel_cache / traveler_note ⇒ false, always (Places is display-only
 *     inside a plan; crawled and partner content is attributed and linked, never republished; a
 *     traveler's note is theirs).
 *   · expert_nugget ⇒ true only once VERIFIED (`verified_at`), the flywheel's last step (§8).
 *   · platform_listing / gem / event ⇒ true.
 *   · a partner or restricted license ⇒ false whatever the origin says.
 *   · AMENDED by ruling R-p (ledger `2026-10-03-official-facts-public-ok`): a `crawled` fact IS
 *     publishable when its source is `official` AND marked `public_ok` AND the fact type is one of
 *     `PUBLIC_OK_FACT_TYPES` (`isOfficialPublicFact`). It then carries "from <source> · checked
 *     <date>" wherever it renders (`publicFactAttribution`). Everything else is unchanged.
 */
export function isPublishable(fact: FactLike): boolean {
  const origin = fact.origin ?? "";
  if (fact.license === "partner" || fact.license === "restricted") return false;
  if (origin === "expert_nugget") return fact.verifiedAt != null && String(fact.verifiedAt) !== "";
  if (isPageReadOrigin(origin)) return isOfficialPublicFact(fact);
  return PLATFORM_OWNED.has(origin);
}

const toMs = (v: Date | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(n) ? n : null;
};

/** A fact past its `expires_at`. Admin surfaces badge it; no traveler surface reads one (`isFactLive`, CS-1 item 2). */
export function isFactStale(fact: FactLike, now: Date = new Date()): boolean {
  const exp = toMs(fact.expiresAt);
  return exp !== null && exp <= now.getTime();
}

/**
 * CS-1 item 2 (ledger `2026-10-19-cs1-live-facts`): THE ONE "live" rule every fact reader applies — plan rows,
 * findings, public pages and bots. A fact is live when it is not superseded and its `expires_at` is in the future.
 * A machine-read fact (REVIEWED_ORIGINS) with no `expires_at` is never live; platform-owned, expert and traveler
 * facts keep their existing rule (no `expires_at` = no expiry). The SQL form is `liveFactRow()` in the place-facts
 * service. Nothing is deleted: an expired row is simply not read.
 */
export function isFactLive(fact: FactLike & { supersededBy?: string | null }, now: Date = new Date()): boolean {
  if (fact.supersededBy) return false;
  const exp = toMs(fact.expiresAt);
  if (exp === null) return !(REVIEWED_ORIGINS as readonly string[]).includes(fact.origin ?? "");
  return exp > now.getTime();
}

/** Brief §6 / Google's attribution rule: a Places fact names "Google Maps". */
export const PLACES_ATTRIBUTION = "Google Maps";

/**
 * THE provenance line a surface renders beside a fact (brief §3: "never shown without provenance").
 * "Google Maps · checked 29 Sep 2026". The source name comes from the fact's own row; an origin
 * with no name says what it is ("Your expert", "Traveloure").
 */
/**
 * LG-1 item 5 (decision-maker, Oct 17, 2026): a "checked" date is the calendar day in the PLAN's zone (Asia/Tokyo for
 * Kyoto) — the same day the slip's facts line and the routed-leg label draw. No zone ⇒ the UTC day, as before (a plan
 * with no `trips.timezone` claims none, LD 30). An unknown zone falls back to UTC rather than throwing.
 */
export function checkedDayLabel(at: Date, timeZone?: string | null, opts: { year?: boolean } = {}): string {
  const fmt = (tz: string) =>
    at.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(opts.year === false ? {} : { year: "numeric" }), timeZone: tz });
  if (timeZone) {
    try {
      return fmt(timeZone);
    } catch {
      /* an unknown zone reads as UTC */
    }
  }
  return fmt("UTC");
}

/** The traveler label for a reviewed dated fact: "Checked <date> · Source: <official site>". Never "verified". */
export function reviewedFactLabel(checkedAt: Date, sourceName: string, timeZone?: string | null): string {
  return `Checked ${checkedDayLabel(checkedAt, timeZone)} · Source: ${sourceName}`;
}

export function factProvenanceLine(fact: FactLike & { sourceName?: string | null }, now: Date = new Date(), timeZone?: string | null): string {
  const name =
    fact.sourceName?.trim() ||
    (fact.origin === "places_api"
      ? PLACES_ATTRIBUTION
      : fact.origin === "expert_nugget"
        ? "A local expert"
        : fact.origin === "traveler_note"
          ? "Your note"
          : isPageReadOrigin(fact.origin)
            ? "Web source"
            : "Traveloure");
  const at = toMs(fact.fetchedAt);
  // CS-1 item 3: a reviewed dated fact read from an official page reads "Checked <date> · Source: <site>" — never
  // "verified". The check date is the read; the review is not shown.
  if (at !== null && isPageReadOrigin(fact.origin) && isDatedFactType(fact.factType) && factIsReviewed(fact)) {
    return reviewedFactLabel(new Date(at), name, timeZone);
  }
  const verified = fact.origin === "expert_nugget" && fact.verifiedAt ? " · verified" : "";
  if (at === null) return `${name}${verified}`;
  const label = checkedDayLabel(new Date(at), timeZone);
  // CS-1 item 2: a traveler never sees an expired value, so the line carries no "(may have changed)" suffix.
  return `${name}${verified} · checked ${label}`;
}

/**
 * What a PUBLIC page renders beside a publishable crawled-official fact (ruling R-p): "from <source
 * name>" linking to the fact's own `source_url`, and "checked <date>". Null for any fact that is not
 * on the official-source path — platform-owned and verified facts render as they always have. A fact
 * with no `source_url`, no source name or no fetch date gets NO attribution object, and a surface must then not
 * render the fact at all (`mustOmitOnPublicPage`): an unattributed crawled fact is never shown.
 */
export interface PublicFactAttribution {
  label: string;
  sourceName: string;
  sourceUrl: string;
  checked: string;
}
export function publicFactAttribution(
  fact: FactLike & { sourceName?: string | null; sourceUrl?: string | null },
  timeZone?: string | null,
): PublicFactAttribution | null {
  if (!isOfficialPublicFact(fact)) return null;
  const name = fact.sourceName?.trim();
  const url = fact.sourceUrl?.trim();
  if (!name || !url) return null;
  const at = toMs(fact.fetchedAt);
  if (at === null) return null;
  const checked = `checked ${checkedDayLabel(new Date(at), timeZone)}`;
  return { label: `from ${name}`, sourceName: name, sourceUrl: url, checked };
}

/**
 * A public page drops a fact that is publishable only by the official path but cannot be attributed — and, CS-1
 * item 2, any fact that is not live (`isFactLive`).
 */
export function mustOmitOnPublicPage(
  fact: FactLike & { sourceName?: string | null; sourceUrl?: string | null; supersededBy?: string | null },
  now: Date = new Date(),
): boolean {
  if (!isFactLive(fact, now)) return true;
  if (!isPublishable(fact)) return true;
  return isOfficialPublicFact(fact) && publicFactAttribution(fact) === null;
}

/**
 * Ruling R-p: may a source be ASKED "may its facts appear on public pages" — an `official` license
 * class and a terms check on the row. The server's atomic conditional states the same two conditions
 * in SQL; the admin control reads this, so the surface never restates the rule (§18 rule 1).
 */
export function publicOkEligibleSource(src: { licenseClass?: string | null; termsCheckedAt?: Date | string | null }): boolean {
  return src.licenseClass === "official" && toMs(src.termsCheckedAt ?? null) !== null;
}

/** Brief §5: no source goes active without a terms check and a license class. */
export function canActivateSource(src: { termsCheckedAt?: Date | string | null; licenseClass?: string | null }): boolean {
  return toMs(src.termsCheckedAt ?? null) !== null && (LICENSE_CLASSES as readonly string[]).includes(src.licenseClass ?? "");
}

/**
 * A6 (4) (ledger `2026-10-01-a6-expert-confirm`; brief §8's flywheel): which facts an expert may
 * CONFIRM into a verified nugget. ONLY a `crawled` fact that is not under a partner or restricted
 * license and not already verified. A Places fact is NEVER confirmable — Google's display terms keep
 * its content inside the plan, and a verified nugget is publishable, so confirming it would
 * republish Google data under our name. A traveler's own note is theirs, not a source to verify.
 */
export function isConfirmableFact(f: { origin?: string | null; license?: string | null; verifiedAt?: Date | string | null }): boolean {
  // SS-1b: an `official_refresh` fact is NOT confirmable — it is re-read from the official page on its own
  // interval and carries `verified_at`, so turning it into a nugget would freeze a fact the refresh keeps current.
  if (f.origin !== "crawled") return false;
  if (f.license === "partner" || f.license === "restricted") return false;
  return f.verifiedAt == null || String(f.verifiedAt) === "";
}

/** The origin a stored row claims, or null when it is not one of ours (never coerced). */
export function asFactOrigin(v: unknown): FactOrigin | null {
  return typeof v === "string" && (FACT_ORIGINS as readonly string[]).includes(v) ? (v as FactOrigin) : null;
}

/** Which need a plan item asks of a source: a meal is `dining`, anything else a stop's hours. */
export function needForItemType(type: string | null | undefined): ContentNeed {
  const t = (type || "").toLowerCase();
  return /^(meal|breakfast|lunch|dinner|restaurant|dining|food|cafe|bar)$/.test(t) ? "dining" : "stop.hours";
}

/** What a plan item's surface renders for one fact — the server's projection, never re-derived. */
export interface FactView {
  /** The `place_facts` row id — what the expert's confirm control names (A6 (4)). */
  id?: string;
  /** `isConfirmableFact` on this row, computed server-side (A6 (4)). */
  confirmable?: boolean;
  factType: FactType;
  need: ContentNeed;
  value: Record<string, unknown>;
  origin: FactOrigin;
  sourceUrl: string | null;
  provenance: string;
  /**
   * When the fact was checked (its `fetched_at`, ISO), for the `ItemRow` facts line's "checked <d
   * Mon>" (surface spec v1.2 §3). Null when the row carries no fetch time. Additive key.
   */
  checkedAt?: string | null;
  stale: boolean;
  publishable: boolean;
}
