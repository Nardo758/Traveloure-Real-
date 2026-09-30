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
 */
export function isPublishable(fact: FactLike): boolean {
  const origin = fact.origin ?? "";
  if (fact.license === "partner" || fact.license === "restricted") return false;
  if (origin === "expert_nugget") return fact.verifiedAt != null && String(fact.verifiedAt) !== "";
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

/** Brief §5: no source goes active without a terms check and a license class. */
export function canActivateSource(src: { termsCheckedAt?: Date | string | null; licenseClass?: string | null }): boolean {
  return toMs(src.termsCheckedAt ?? null) !== null && (LICENSE_CLASSES as readonly string[]).includes(src.licenseClass ?? "");
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
  factType: FactType;
  need: ContentNeed;
  value: Record<string, unknown>;
  origin: FactOrigin;
  sourceUrl: string | null;
  provenance: string;
  stale: boolean;
  publishable: boolean;
}
