/**
 * Content-gap TAXONOMY — the pure, DB-free core of the content-gap module (Operation Trailhead T2.1).
 *
 * This file carries everything that is pure data + pure computation, so it is importable and testable
 * WITHOUT a database (its sibling `content-gap.service.ts` imports `../db` and therefore cannot be).
 * `content-gap.service.ts` re-exports this file's public surface, so "the content-gap module" still
 * exposes the crosswalk, the plans and the derivation as one thing (L6 — one home, no duplication).
 *
 * Contents:
 *   1. GAP_MARKET / GAP_CITY / KYOTO_CONTENT_PLAN — the hand-set Kyoto editorial plan (authoritative
 *      for Kyoto; moved here from the service so it stays DB-free).
 *   2. R-T1-a taxonomy CROSSWALK — the ONE `category_key → content_type` bridge, importing BOTH
 *      taxonomies so `tsc` breaks on drift. No DB table.
 *   3. R-T1-b/-d slot-derivation — composes the template_category_matrix (REQ/REC/OPT) through the
 *      crosswalk into per-market browsable-minimum content plans (Kyoto derived for the diff; the
 *      seven staged markets emitted as INERT config).
 */
import { dmoContentTypeEnum } from "@workspace/db";
import { OPERATING_MARKETS, type OperatingMarket } from "@shared/operating-markets";
import { STRENGTH_WEIGHTS, TIER2_BROWSABLE_MINIMUM } from "../config/trailhead.config";

export const GAP_MARKET = "japan";
export const GAP_CITY = "Kyoto";

/** A member of the DMO content-type taxonomy (`dmoContentTypeEnum`) — the holdings/targets axis. */
export type DmoContentType = (typeof dmoContentTypeEnum)[number];

// ── The hand-set Kyoto editorial plan (authoritative for Kyoto) ──────────────────────────────────

/** One content type's editorial plan: how much we want, where discovered rows attach, how to find them. */
export interface ContentTypePlan {
  /** dmoContentTypeEnum value. */
  contentType: DmoContentType;
  /** Human label for the admin UI. */
  label: string;
  /** Editorial target — how many curated items we want in this category for a launch-ready Kyoto catalog. */
  target: number;
  /** DMO source id (dmo_sources.id) discovered rows are attributed to. Must exist (seeded from the registry). */
  sourceId: string;
  /** Tavily discovery queries — each returns a list of distinct places we turn into born-hidden stubs. */
  discoveryQueries: string[];
}

/**
 * Kyoto editorial content plan (§12). Targets reflect the experience-planning lens (weddings/events):
 * a traveler planning a Kyoto experience needs venues, restaurants and events, not only temples.
 * Kyoto is the wedge, so this hand-set plan runs DEEPER than the Tier-2 browsable minimum (R-T1-b) —
 * it stays authoritative for Kyoto; the derived plan (below) is only diffed against it, never applied.
 */
export const KYOTO_CONTENT_PLAN: ContentTypePlan[] = [
  {
    contentType: "attraction",
    label: "Attractions & heritage sites",
    target: 15,
    sourceId: "dmo-jp-kyoto-travel",
    discoveryQueries: [
      "top attractions and temples to visit in Kyoto Japan",
      "must-see cultural sights in Kyoto Japan",
    ],
  },
  {
    contentType: "venue",
    label: "Event & wedding venues",
    target: 12,
    sourceId: "dmo-jp-wedding-venues",
    discoveryQueries: [
      "best wedding venues in Kyoto Japan",
      "private event venues for celebrations in Kyoto Japan",
    ],
  },
  {
    contentType: "restaurant",
    label: "Restaurants (dining & receptions)",
    target: 12,
    sourceId: "dmo-jp-gurunavi",
    discoveryQueries: [
      "best fine dining restaurants in Kyoto Japan",
      "private dining and reception restaurants in Kyoto Japan",
    ],
  },
  {
    contentType: "event",
    label: "Seasonal & cultural events",
    target: 10,
    sourceId: "dmo-jp-kyoto-travel",
    discoveryQueries: [
      "annual festivals and seasonal events in Kyoto Japan",
      "cultural experiences and ceremonies in Kyoto Japan",
    ],
  },
  {
    contentType: "destination",
    label: "Neighborhoods & areas",
    target: 8,
    sourceId: "dmo-jp-kyoto-travel",
    discoveryQueries: [
      "best neighborhoods and districts to explore in Kyoto Japan",
    ],
  },
];

const planByType = new Map(KYOTO_CONTENT_PLAN.map((p) => [p.contentType, p]));

/** Look up a content type's plan (used by the ingestion pass to resolve source + queries for a gap). */
export function getContentTypePlan(contentType: string): ContentTypePlan | undefined {
  return planByType.get(contentType as DmoContentType);
}

// ── R-T1-a: the taxonomy crosswalk (ONE exported constant, both taxonomies imported) ─────────────
//
// The platform holds two DISJOINT taxonomies (the T1/F1 finding):
//   • template_category_matrix keys `service_categories.category_key` — a catalog of SERVICE
//     categories a template needs (florist, caterer, private_transportation…).
//   • DMO holdings/targets key `dmoContentTypeEnum` — a catalog of PLACE/CONTENT types we scrape
//     (attraction, venue, restaurant, event, destination…).
// The crosswalk is the editorial bridge between them. It is a code-level map, not a DB table (L6):
// importing `dmoContentTypeEnum` for the value side and deriving `CategoryKey` from this const for the
// key side makes `tsc` break the moment either taxonomy drifts away from the map.
//
// Two categories of service key have NO scraped-content substrate and map to a NON-DMO rung, never a
// content type:
//   • AFFILIATE_RUNG — stays + OTA-affiliate categories (`accommodation` is explicitly excluded from
//     DMO scraping per R-T1-a; the `aff_*` categories are affiliate inventory by definition).
//   • SERVICE_ONLY — a provider service that produces no browsable place/content row (a florist, an
//     officiant, a hair-and-makeup artist). Mapping these to a content type would invent scraped-content
//     demand that no scrape can honestly satisfy (§13).

/** Stays / OTA-affiliate substrate — NOT a DMO content type (R-T1-a: `accommodation` → the affiliate rung). */
export const AFFILIATE_RUNG = "affiliate_rung" as const;
/** A provider service with no scraped place/content substrate — NOT a DMO content type. */
export const SERVICE_ONLY = "service_only" as const;

/** A crosswalk target: a real DMO content type, or one of the two non-DMO rungs. */
export type CrosswalkTarget = DmoContentType | typeof AFFILIATE_RUNG | typeof SERVICE_ONLY;

/**
 * `category_key → content_type` crosswalk. Values are `satisfies Record<string, CrosswalkTarget>` so a
 * value that is not a real `dmoContentTypeEnum` member (or a named rung) fails to compile. The key set
 * IS the canonical service-category vocabulary the template-matrix uses (see TEMPLATE_CATEGORY_MATRIX,
 * whose rows are typed `CategoryKey`, so a matrix category with no crosswalk entry also fails to compile).
 *
 * Editorial judgment per key is documented inline — the bridge is a decision, not a mechanical mapping.
 */
export const CATEGORY_TO_CONTENT_TYPE = {
  // ── categories with a real scraped-content substrate ──
  private_transportation: "transport",   // getting around → transport content
  tour_guide:             "attraction",  // a guide's substrate is sights/attractions
  dining_venue:           "restaurant",  // dining rooms → restaurant content
  activity_provider:      "attraction",  // activities happen at attractions
  private_chef:           "restaurant",  // a private-dining experience → restaurant content
  caterer:                "restaurant",  // food service → restaurant content
  event_coordinator:      "venue",       // an event needs a VENUE — its primary content substrate
  officiant:              "venue",       // ceremonies happen at (wedding) venues
  entertainment:          "event",       // performances/shows → event content
  // ── stays / OTA-affiliate rung (never DMO-scraped) ──
  accommodation:          AFFILIATE_RUNG,      // R-T1-a: stays are the affiliate substrate, excluded
  aff_activities:         AFFILIATE_RUNG,
  aff_events:             AFFILIATE_RUNG,
  aff_ground_transport:   AFFILIATE_RUNG,
  aff_air_hotel:          AFFILIATE_RUNG,
  // ── provider services with no browsable place/content substrate ──
  photography:            SERVICE_ONLY,
  concierge_vip:          SERVICE_ONLY,
  childcare_family:       SERVICE_ONLY,
  accessibility_specialist: SERVICE_ONLY,
  florist:                SERVICE_ONLY,
  hair_makeup:            SERVICE_ONLY,
  videographer:           SERVICE_ONLY,
  av_tech:                SERVICE_ONLY,
  rentals:                SERVICE_ONLY,
  printing_materials:     SERVICE_ONLY,
  custom_other:           SERVICE_ONLY,
} satisfies Record<string, CrosswalkTarget>;

/** The canonical service-category vocabulary — the crosswalk's key set (drift-guarded via `tsc`). */
export type CategoryKey = keyof typeof CATEGORY_TO_CONTENT_TYPE;

/** Resolve a category key to its crosswalk target (or undefined if the key is not in the vocabulary). */
export function crosswalk(categoryKey: string): CrosswalkTarget | undefined {
  return (CATEGORY_TO_CONTENT_TYPE as Record<string, CrosswalkTarget>)[categoryKey];
}

/** True when the crosswalk target is a real DMO content type (i.e. not one of the non-DMO rungs). */
export function isDmoContentType(target: CrosswalkTarget): target is DmoContentType {
  return target !== AFFILIATE_RUNG && target !== SERVICE_ONLY;
}

// ── The template requirement matrix, encoded from the committed seed (source of truth) ───────────
//
// Encoded VERBATIM from `server/migrations/035_phase1_seed_template_matrix.sql` (SEED_DATA §3), so
// the derivation is pure + deterministic + DB-free. The seed remains the source of truth; if it
// changes, update this constant to match. The `custom` template is OPT for every category (the seed
// generates it programmatically from `service_categories`); we reproduce that below by mapping OPT
// over the crosswalk's full key set, matching the seed's semantics without a DB read.

export interface MatrixRow {
  templateKey: string;
  categoryKey: CategoryKey;
  strength: "REQ" | "REC" | "OPT";
}

const EXPLICIT_MATRIX_ROWS: readonly MatrixRow[] = [
  // travel
  { templateKey: "travel", categoryKey: "private_transportation", strength: "REC" },
  { templateKey: "travel", categoryKey: "tour_guide", strength: "REC" },
  { templateKey: "travel", categoryKey: "photography", strength: "OPT" },
  { templateKey: "travel", categoryKey: "accommodation", strength: "REC" },
  { templateKey: "travel", categoryKey: "dining_venue", strength: "REC" },
  { templateKey: "travel", categoryKey: "activity_provider", strength: "REC" },
  { templateKey: "travel", categoryKey: "private_chef", strength: "OPT" },
  { templateKey: "travel", categoryKey: "concierge_vip", strength: "OPT" },
  { templateKey: "travel", categoryKey: "childcare_family", strength: "OPT" },
  { templateKey: "travel", categoryKey: "accessibility_specialist", strength: "OPT" },
  { templateKey: "travel", categoryKey: "aff_activities", strength: "REC" },
  { templateKey: "travel", categoryKey: "aff_events", strength: "REC" },
  { templateKey: "travel", categoryKey: "aff_ground_transport", strength: "REC" },
  { templateKey: "travel", categoryKey: "aff_air_hotel", strength: "REC" },
  // wedding
  { templateKey: "wedding", categoryKey: "private_transportation", strength: "REC" },
  { templateKey: "wedding", categoryKey: "photography", strength: "REQ" },
  { templateKey: "wedding", categoryKey: "accommodation", strength: "REC" },
  { templateKey: "wedding", categoryKey: "dining_venue", strength: "REQ" },
  { templateKey: "wedding", categoryKey: "activity_provider", strength: "OPT" },
  { templateKey: "wedding", categoryKey: "private_chef", strength: "OPT" },
  { templateKey: "wedding", categoryKey: "concierge_vip", strength: "OPT" },
  { templateKey: "wedding", categoryKey: "childcare_family", strength: "OPT" },
  { templateKey: "wedding", categoryKey: "event_coordinator", strength: "REQ" },
  { templateKey: "wedding", categoryKey: "caterer", strength: "REQ" },
  { templateKey: "wedding", categoryKey: "florist", strength: "REC" },
  { templateKey: "wedding", categoryKey: "entertainment", strength: "REC" },
  { templateKey: "wedding", categoryKey: "hair_makeup", strength: "REC" },
  { templateKey: "wedding", categoryKey: "videographer", strength: "REC" },
  { templateKey: "wedding", categoryKey: "av_tech", strength: "OPT" },
  { templateKey: "wedding", categoryKey: "rentals", strength: "REC" },
  { templateKey: "wedding", categoryKey: "officiant", strength: "OPT" },
  { templateKey: "wedding", categoryKey: "accessibility_specialist", strength: "OPT" },
  { templateKey: "wedding", categoryKey: "printing_materials", strength: "OPT" },
  { templateKey: "wedding", categoryKey: "aff_activities", strength: "OPT" },
  { templateKey: "wedding", categoryKey: "aff_ground_transport", strength: "OPT" },
  { templateKey: "wedding", categoryKey: "aff_air_hotel", strength: "OPT" },
  // proposal
  { templateKey: "proposal", categoryKey: "private_transportation", strength: "REC" },
  { templateKey: "proposal", categoryKey: "tour_guide", strength: "OPT" },
  { templateKey: "proposal", categoryKey: "photography", strength: "REQ" },
  { templateKey: "proposal", categoryKey: "accommodation", strength: "OPT" },
  { templateKey: "proposal", categoryKey: "dining_venue", strength: "REQ" },
  { templateKey: "proposal", categoryKey: "activity_provider", strength: "REC" },
  { templateKey: "proposal", categoryKey: "private_chef", strength: "REC" },
  { templateKey: "proposal", categoryKey: "concierge_vip", strength: "OPT" },
  { templateKey: "proposal", categoryKey: "event_coordinator", strength: "REC" },
  { templateKey: "proposal", categoryKey: "florist", strength: "REC" },
  { templateKey: "proposal", categoryKey: "entertainment", strength: "OPT" },
  { templateKey: "proposal", categoryKey: "hair_makeup", strength: "OPT" },
  { templateKey: "proposal", categoryKey: "videographer", strength: "OPT" },
  { templateKey: "proposal", categoryKey: "rentals", strength: "OPT" },
  { templateKey: "proposal", categoryKey: "accessibility_specialist", strength: "OPT" },
  { templateKey: "proposal", categoryKey: "aff_activities", strength: "REC" },
  { templateKey: "proposal", categoryKey: "aff_events", strength: "OPT" },
  { templateKey: "proposal", categoryKey: "aff_ground_transport", strength: "OPT" },
  // date_night
  { templateKey: "date_night", categoryKey: "private_transportation", strength: "OPT" },
  { templateKey: "date_night", categoryKey: "dining_venue", strength: "REQ" },
  { templateKey: "date_night", categoryKey: "activity_provider", strength: "REC" },
  { templateKey: "date_night", categoryKey: "private_chef", strength: "REC" },
  { templateKey: "date_night", categoryKey: "concierge_vip", strength: "OPT" },
  { templateKey: "date_night", categoryKey: "florist", strength: "OPT" },
  { templateKey: "date_night", categoryKey: "accessibility_specialist", strength: "OPT" },
  { templateKey: "date_night", categoryKey: "aff_activities", strength: "REC" },
  { templateKey: "date_night", categoryKey: "aff_events", strength: "REC" },
  // birthday
  { templateKey: "birthday", categoryKey: "private_transportation", strength: "OPT" },
  { templateKey: "birthday", categoryKey: "tour_guide", strength: "OPT" },
  { templateKey: "birthday", categoryKey: "photography", strength: "REC" },
  { templateKey: "birthday", categoryKey: "accommodation", strength: "OPT" },
  { templateKey: "birthday", categoryKey: "dining_venue", strength: "REQ" },
  { templateKey: "birthday", categoryKey: "activity_provider", strength: "REC" },
  { templateKey: "birthday", categoryKey: "private_chef", strength: "OPT" },
  { templateKey: "birthday", categoryKey: "concierge_vip", strength: "OPT" },
  { templateKey: "birthday", categoryKey: "childcare_family", strength: "OPT" },
  { templateKey: "birthday", categoryKey: "event_coordinator", strength: "REC" },
  { templateKey: "birthday", categoryKey: "caterer", strength: "REC" },
  { templateKey: "birthday", categoryKey: "florist", strength: "OPT" },
  { templateKey: "birthday", categoryKey: "entertainment", strength: "REC" },
  { templateKey: "birthday", categoryKey: "videographer", strength: "OPT" },
  { templateKey: "birthday", categoryKey: "av_tech", strength: "OPT" },
  { templateKey: "birthday", categoryKey: "rentals", strength: "REC" },
  { templateKey: "birthday", categoryKey: "accessibility_specialist", strength: "OPT" },
  { templateKey: "birthday", categoryKey: "printing_materials", strength: "OPT" },
  { templateKey: "birthday", categoryKey: "aff_activities", strength: "REC" },
  { templateKey: "birthday", categoryKey: "aff_events", strength: "REC" },
  { templateKey: "birthday", categoryKey: "aff_ground_transport", strength: "OPT" },
  { templateKey: "birthday", categoryKey: "aff_air_hotel", strength: "OPT" },
  // corporate
  { templateKey: "corporate", categoryKey: "private_transportation", strength: "REC" },
  { templateKey: "corporate", categoryKey: "tour_guide", strength: "OPT" },
  { templateKey: "corporate", categoryKey: "photography", strength: "REC" },
  { templateKey: "corporate", categoryKey: "accommodation", strength: "REC" },
  { templateKey: "corporate", categoryKey: "dining_venue", strength: "REQ" },
  { templateKey: "corporate", categoryKey: "activity_provider", strength: "REC" },
  { templateKey: "corporate", categoryKey: "private_chef", strength: "OPT" },
  { templateKey: "corporate", categoryKey: "concierge_vip", strength: "OPT" },
  { templateKey: "corporate", categoryKey: "childcare_family", strength: "OPT" },
  { templateKey: "corporate", categoryKey: "event_coordinator", strength: "REQ" },
  { templateKey: "corporate", categoryKey: "caterer", strength: "REQ" },
  { templateKey: "corporate", categoryKey: "florist", strength: "OPT" },
  { templateKey: "corporate", categoryKey: "entertainment", strength: "REC" },
  { templateKey: "corporate", categoryKey: "av_tech", strength: "REQ" },
  { templateKey: "corporate", categoryKey: "rentals", strength: "REC" },
  { templateKey: "corporate", categoryKey: "accessibility_specialist", strength: "OPT" },
  { templateKey: "corporate", categoryKey: "printing_materials", strength: "REC" },
  { templateKey: "corporate", categoryKey: "aff_activities", strength: "REC" },
  { templateKey: "corporate", categoryKey: "aff_ground_transport", strength: "OPT" },
  { templateKey: "corporate", categoryKey: "aff_air_hotel", strength: "OPT" },
];

/**
 * The full encoded matrix: the explicit six templates verbatim, plus `custom` = OPT for every category
 * (the seed's programmatic tail, reproduced deterministically over the crosswalk's key set). Sorted by
 * (templateKey, categoryKey) so the constant — and everything derived from it — is order-stable.
 */
export const TEMPLATE_CATEGORY_MATRIX: readonly MatrixRow[] = [
  ...EXPLICIT_MATRIX_ROWS,
  ...(Object.keys(CATEGORY_TO_CONTENT_TYPE) as CategoryKey[]).map(
    (categoryKey): MatrixRow => ({ templateKey: "custom", categoryKey, strength: "OPT" }),
  ),
]
  .slice()
  .sort((a, b) =>
    a.templateKey.localeCompare(b.templateKey) || a.categoryKey.localeCompare(b.categoryKey),
  );

// ── R-T1-b / R-T1-d: slot-derived per-market content plans ───────────────────────────────────────

/** One content type in a derived plan: its config target plus the demand the matrix places on it. */
export interface DerivedContentTarget {
  contentType: DmoContentType;
  /** Editorial target magnitude from TIER2_BROWSABLE_MINIMUM (config, R-T1-b). */
  target: number;
  /** Σ strength weights of every matrix row whose category crosswalks to this content type. */
  demandWeight: number;
  /** Service category_keys that crosswalk here and contributed demand (sorted, for traceability). */
  demandingCategories: string[];
}

export interface DerivedContentPlan {
  marketKey: string;
  city: string;
  country: string;
  /** Browsable-minimum content types with config target + derived demand, demand-ordered. */
  targets: DerivedContentTarget[];
  /** Σ of all targets (the ~26 browsable-minimum shape). */
  totalTarget: number;
  /**
   * Content types the matrix demands that are NOT in the browsable minimum (e.g. `transport`) — surfaced
   * honestly as deferred, never silently dropped. Ordered by demand.
   */
  demandOutsideMinimum: Array<{ contentType: DmoContentType; demandWeight: number }>;
  /**
   * Browsable-minimum content types with ZERO matrix demand (e.g. `destination` — neighborhoods are
   * browsability scaffolding, not template-demanded). Surfaced honestly (§13), never faked into the matrix.
   */
  minimumWithoutDemand: DmoContentType[];
}

/** Aggregate the matrix through the crosswalk into demand-weight-per-content-type (pure). */
function demandByContentType(): Map<DmoContentType, { weight: number; categories: Set<string> }> {
  const demand = new Map<DmoContentType, { weight: number; categories: Set<string> }>();
  for (const row of TEMPLATE_CATEGORY_MATRIX) {
    const target = crosswalk(row.categoryKey);
    if (!target || !isDmoContentType(target)) continue; // affiliate/service rung → no DMO demand
    const entry = demand.get(target) ?? { weight: 0, categories: new Set<string>() };
    entry.weight += STRENGTH_WEIGHTS[row.strength];
    entry.categories.add(row.categoryKey);
    demand.set(target, entry);
  }
  return demand;
}

/**
 * Derive a market's Tier-2 browsable-minimum content plan by composing the template_category_matrix
 * (REQ/REC/OPT weights) through the crosswalk. The plan is pure + deterministic: the matrix is the
 * same for every market, so the derived SHAPE is market-agnostic — the target magnitudes come from
 * TIER2_BROWSABLE_MINIMUM (config) and the labels from the market. Config is authoritative for WHICH
 * content types + magnitudes; the matrix decides the demand-ORDER and records WHICH service categories
 * drive each (traceability), and surfaces honest mismatches (deferred demand / demand-less minimums).
 */
export function deriveContentPlan(market: OperatingMarket): DerivedContentPlan {
  const demand = demandByContentType();

  const targets: DerivedContentTarget[] = Object.keys(TIER2_BROWSABLE_MINIMUM)
    .map((ct): DerivedContentTarget => {
      const contentType = ct as DmoContentType;
      const d = demand.get(contentType);
      return {
        contentType,
        target: TIER2_BROWSABLE_MINIMUM[ct],
        demandWeight: d?.weight ?? 0,
        demandingCategories: d ? Array.from(d.categories).sort() : [],
      };
    })
    .sort((a, b) => b.demandWeight - a.demandWeight || a.contentType.localeCompare(b.contentType));

  const minimumSet = new Set(Object.keys(TIER2_BROWSABLE_MINIMUM));
  const demandOutsideMinimum = Array.from(demand.entries())
    .filter(([ct]) => !minimumSet.has(ct))
    .map(([contentType, d]) => ({ contentType, demandWeight: d.weight }))
    .sort((a, b) => b.demandWeight - a.demandWeight || a.contentType.localeCompare(b.contentType));

  const minimumWithoutDemand = targets
    .filter((t) => t.demandWeight === 0)
    .map((t) => t.contentType)
    .sort();

  return {
    marketKey: market.marketKey,
    city: market.cityName,
    country: market.country,
    targets,
    totalTarget: targets.reduce((sum, t) => sum + t.target, 0),
    demandOutsideMinimum,
    minimumWithoutDemand,
  };
}

const KYOTO_MARKET = OPERATING_MARKETS.find((m) => m.marketKey === "kyoto")!;

/** The DERIVED Kyoto plan (browsable-minimum shape) — for the T2.1.3 diff ONLY; NEVER applied (Kyoto's hand plan is authoritative). */
export const KYOTO_DERIVED_CONTENT_PLAN: DerivedContentPlan = deriveContentPlan(KYOTO_MARKET);

/**
 * R-T1-d — the seven non-Kyoto markets' Tier-2 content plans, derived + committed as config, INERT.
 * INERT = data only; NO per-market ignition flag is set here. Later ignition of any one is a Leon go +
 * a flag flip, never a schedule. Keyed by marketKey. (Kyoto is excluded — it has its own hand-set plan.)
 */
export const INERT_MARKET_CONTENT_PLANS: Readonly<Record<string, DerivedContentPlan>> = Object.freeze(
  Object.fromEntries(
    OPERATING_MARKETS.filter((m) => m.marketKey !== "kyoto").map((m) => [m.marketKey, deriveContentPlan(m)]),
  ),
);

// ── T2.1.3: Kyoto derived-vs-hand plan diff (report-only; hand plan stays authoritative) ─────────

export interface KyotoPlanDivergence {
  contentType: string;
  /** Hand-set KYOTO_CONTENT_PLAN target (null if the content type is absent from the hand plan). */
  handTarget: number | null;
  /** Derived browsable-minimum target (null if absent from the derived plan). */
  derivedTarget: number | null;
  delta: number | null;
  note: string;
}

/**
 * Diff the DERIVED Kyoto plan against the hand-set KYOTO_CONTENT_PLAN. Report-only: it lists where the
 * two diverge so a human can see them; it NEVER reconciles (the hand plan is authoritative for Kyoto,
 * R-T1-b). Divergence is expected — Kyoto is the wedge and its hand plan runs deeper than the minimum.
 */
export function diffKyotoPlan(): KyotoPlanDivergence[] {
  const handByType = new Map(KYOTO_CONTENT_PLAN.map((p) => [p.contentType as string, p.target]));
  const derivedByType = new Map(KYOTO_DERIVED_CONTENT_PLAN.targets.map((t) => [t.contentType as string, t.target]));
  const allTypes = Array.from(new Set([...Array.from(handByType.keys()), ...Array.from(derivedByType.keys())])).sort();

  const divergences: KyotoPlanDivergence[] = [];
  for (const contentType of allTypes) {
    const handTarget = handByType.get(contentType) ?? null;
    const derivedTarget = derivedByType.get(contentType) ?? null;
    if (handTarget === derivedTarget) continue; // no divergence
    const delta = handTarget !== null && derivedTarget !== null ? handTarget - derivedTarget : null;
    let note: string;
    if (handTarget === null) note = "in derived browsable-minimum, absent from hand plan";
    else if (derivedTarget === null) note = "in hand plan, absent from derived browsable-minimum";
    else note = `hand plan deeper by ${delta} (Kyoto wedge runs deeper than the Tier-2 minimum)`;
    divergences.push({ contentType, handTarget, derivedTarget, delta, note });
  }
  return divergences;
}
