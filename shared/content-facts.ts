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
] as const;
export type FactOrigin = (typeof FACT_ORIGINS)[number];

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
  traveler_note: 4,
};

/** Lower is read first. An unknown origin sorts last — never ahead of a known one (§13). */
export function originTier(origin: string | null | undefined): number {
  return origin && origin in ORIGIN_TIER ? ORIGIN_TIER[origin as FactOrigin] : 99;
}

/** The smallest shape the rules read. */
export interface FactLike {
  origin: string | null | undefined;
  license?: string | null;
  verifiedAt?: Date | string | null;
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
  if (fact.origin !== "crawled") return false;
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
  if (origin === "crawled") return isOfficialPublicFact(fact);
  return PLATFORM_OWNED.has(origin);
}

const toMs = (v: Date | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(n) ? n : null;
};

/** A fact past its `expires_at` still renders — as "checked <date>", never as current (brief §3). */
export function isFactStale(fact: FactLike, now: Date = new Date()): boolean {
  const exp = toMs(fact.expiresAt);
  return exp !== null && exp <= now.getTime();
}

/** Brief §6 / Google's attribution rule: a Places fact names "Google Maps". */
export const PLACES_ATTRIBUTION = "Google Maps";

/**
 * THE provenance line a surface renders beside a fact (brief §3: "never shown without provenance").
 * "Google Maps · checked 29 Sep 2026". The source name comes from the fact's own row; an origin
 * with no name says what it is ("Your expert", "Traveloure").
 */
export function factProvenanceLine(fact: FactLike & { sourceName?: string | null }, now: Date = new Date()): string {
  const name =
    fact.sourceName?.trim() ||
    (fact.origin === "places_api"
      ? PLACES_ATTRIBUTION
      : fact.origin === "expert_nugget"
        ? "A local expert"
        : fact.origin === "traveler_note"
          ? "Your note"
          : fact.origin === "crawled"
            ? "Web source"
            : "Traveloure");
  const at = toMs(fact.fetchedAt);
  const verified = fact.origin === "expert_nugget" && fact.verifiedAt ? " · verified" : "";
  if (at === null) return `${name}${verified}`;
  const d = new Date(at);
  const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${name}${verified} · checked ${label}${isFactStale(fact, now) ? " (may have changed)" : ""}`;
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
): PublicFactAttribution | null {
  if (!isOfficialPublicFact(fact)) return null;
  const name = fact.sourceName?.trim();
  const url = fact.sourceUrl?.trim();
  if (!name || !url) return null;
  const at = toMs(fact.fetchedAt);
  if (at === null) return null;
  const checked = `checked ${new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
  return { label: `from ${name}`, sourceName: name, sourceUrl: url, checked };
}

/** A public page drops a fact that is publishable only by the official path but cannot be attributed. */
export function mustOmitOnPublicPage(fact: FactLike & { sourceName?: string | null; sourceUrl?: string | null }): boolean {
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
  stale: boolean;
  publishable: boolean;
}
