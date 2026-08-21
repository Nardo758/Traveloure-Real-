/**
 * Anchor-registry → dmo_sources sync — PURE core (Operation Trailhead T2.2), DB-free so it is unit-testable
 * without a database. The seed `dmo-anchor-registry-sync.seed.ts` imports this and adds the DB upsert.
 * All design rationale lives in the seed's header; this file is the deterministic data + row builder.
 */

export type RegistryAccess = "SCRAPE" | "OPEN" | "PARTNER" | "TRADE" | "AFF-TP" | "AFF-NET";

/** Registry legend — the author's verification mark for the entry. */
export type RegistryMark = "verified_this_week" | "high_confidence_unchecked";

/** A rights posture string, sourced from the registry's rights legend (never invented). */
const RIGHTS_BY_ACCESS: Readonly<Record<Exclude<RegistryAccess, "AFF-TP" | "AFF-NET">, string>> = {
  SCRAPE:
    "Facts only — names, addresses, coordinates, links, event dates. Never descriptions/photos from " +
    "commercial sources; DMO editorial only under partnership or explicit license.",
  OPEN: "Open license — attribution per the source's stated license (e.g. ODbL/CC-BY-SA).",
  PARTNER: "Formal content partnership — rights granted by a signed partner pack; scrape only facts until then.",
  TRADE: "B2B / travel-trade portal — wholesale rates behind account approval; expert-rail wholesale endgame.",
};

/** ACCESS → `dmo_sources.source_type` (for a VERIFIED row; unverified rows override to 'unverified'). */
const SOURCE_TYPE_BY_ACCESS: Readonly<Record<Exclude<RegistryAccess, "AFF-TP" | "AFF-NET">, string>> = {
  SCRAPE: "scraped",
  OPEN: "api",
  PARTNER: "partner_portal",
  TRADE: "partner_portal",
};

/** ACCESS → `dmo_sources.confidence` (for a VERIFIED row). */
const CONFIDENCE_BY_ACCESS: Readonly<Record<Exclude<RegistryAccess, "AFF-TP" | "AFF-NET">, string>> = {
  SCRAPE: "scraped",
  OPEN: "official_api",
  PARTNER: "scraped", // not partner_pack until a pack is actually signed (§13 — no unearned confidence)
  TRADE: "scraped",
};

export interface AnchorSourceDef {
  id: string;
  name: string;
  domain: string;
  /** Broad market string, matching the committed registry convention (country-level: japan, colombia, india, portugal…). */
  market: string;
  marketRegion: "apac" | "europe" | "americas" | "mea";
  access: RegistryAccess;
  /** The registry author's ✓ state — informational; NOT this agent's verification (see §13 note above). */
  registryMark: RegistryMark;
  /**
   * TRUE only for an already-committed, already-live registry source this sync merely enriches (kyoto.travel).
   * FALSE (the default for every new row) ⇒ born `unverified` + inert until a Replit run verifies the URL.
   */
  agentVerified: boolean;
  attributionRequired?: boolean;
  attributionText?: string;
  /** One clause of provenance/context for the notes column (never a fabricated fact). */
  note: string;
}

/**
 * The anchor-registry sources with a REAL, explicit domain that are not already covered by the committed
 * DMOSourceRegistry. Kyoto (enriched, live) + the seven staged markets' primary DMO portals (inert).
 * Affiliate entries are deliberately absent (see decision 1). Ordered by market for a stable seed.
 */
export const ANCHOR_REGISTRY_SOURCES: readonly AnchorSourceDef[] = [
  // ── KYOTO (wedge) — the one confirmable anchor already live in the committed registry; enrich only. ──
  {
    id: "dmo-jp-kyoto-travel", // matches the committed registry id — upsert enriches the same row
    name: "Kyoto City Tourism Association (kyoto.travel)",
    domain: "kyoto.travel",
    market: "japan",
    marketRegion: "apac",
    access: "SCRAPE", // registry: SCRAPE → PARTNER (partnership = rights + credibility, endgame)
    registryMark: "verified_this_week",
    agentVerified: true, // already-committed, already-live registry source — not a new unverifiable URL
    attributionRequired: false,
    note:
      "Kyoto City Tourism Association — the seeded Kyoto wedge anchor. Registry access SCRAPE→PARTNER: " +
      "facts direct now, formal content partnership the endgame for editorial rights + credibility.",
  },

  // ── COLOMBIA — Bogotá IDT + Cartagena Corpoturismo (the two Colombian primary city DMOs). ──
  {
    id: "dmo-co-idt-bogota",
    name: "IDT — Instituto Distrital de Turismo de Bogotá",
    domain: "bogota.gov.co",
    market: "colombia",
    marketRegion: "americas",
    access: "SCRAPE", // registry: SCRAPE → PARTNER
    registryMark: "verified_this_week", // registry ✓ — but this agent cannot confirm live (born unverified)
    agentVerified: false,
    note:
      "Official Bogotá city tourism institute; the 'Bogotá, Your Home' catalog (103 attractions / 39 " +
      "routes) is a ready-made anchor list. Distinct from the existing idrd.gov.co (recreation institute).",
  },
  {
    id: "dmo-co-corpoturismo-cartagena",
    name: "Corpoturismo — Cartagena de Indias",
    domain: "cartagenadeindias.travel",
    market: "colombia",
    marketRegion: "americas",
    access: "SCRAPE", // registry: SCRAPE → PARTNER
    registryMark: "verified_this_week",
    agentVerified: false,
    note:
      "Official Cartagena DMO. Distinct from the existing cartagenadeindias.gov.co registry row (city " +
      "government portal) — this is the tourism corporation's dedicated .travel site.",
  },

  // ── INDIA — Mumbai MTDC, Goa GTDC, Jaipur Rajasthan Tourism + RTDC ops arm. ──
  {
    id: "dmo-in-mtdc-maharashtra",
    name: "MTDC — Maharashtra Tourism Development Corporation",
    domain: "mtdc.co",
    market: "india",
    marketRegion: "apac",
    access: "SCRAPE", // registry: SCRAPE → PARTNER
    registryMark: "verified_this_week",
    agentVerified: false,
    note: "Maharashtra's state DMO (Mumbai market). Not previously in the committed registry.",
  },
  {
    id: "dmo-in-gtdc-goa",
    name: "Goa Tourism / GTDC",
    domain: "goa-tourism.com",
    market: "india",
    marketRegion: "apac",
    access: "SCRAPE", // registry: SCRAPE → PARTNER
    registryMark: "high_confidence_unchecked",
    agentVerified: false,
    note: "Goa's state DMO; GTDC also operates hotels/boats. Goa = India's destination-wedding capital (events lens).",
  },
  {
    id: "dmo-in-rajasthan-tourism-jaipur",
    name: "Rajasthan Tourism",
    domain: "tourism.rajasthan.gov.in",
    market: "india",
    marketRegion: "apac",
    access: "SCRAPE", // registry: SCRAPE → PARTNER
    registryMark: "verified_this_week",
    agentVerified: false,
    note: "Rajasthan's state DMO (Jaipur market). RTDC is the ops arm (hotels, Palace on Wheels).",
  },
  {
    id: "dmo-in-rtdc-rajasthan",
    name: "RTDC — Rajasthan Tourism Development Corporation",
    domain: "rtdc.tourism.rajasthan.gov.in",
    market: "india",
    marketRegion: "apac",
    access: "SCRAPE",
    registryMark: "high_confidence_unchecked",
    agentVerified: false,
    note: "Rajasthan Tourism's operations arm (hotels, Palace on Wheels) — secondary to the primary tourism portal.",
  },
] as const;

/** Rows built here go into `dmo_sources` — the exact insert/update value shape (pure; unit-testable, no DB). */
export interface DmoSourceRowValues {
  id: string;
  name: string;
  domain: string;
  sourceType: string;
  market: string;
  marketRegion: string;
  confidence: string;
  attributionRequired: boolean;
  attributionText: string | null;
  scrapeConfig: Record<string, unknown>;
  isActive: boolean;
  notes: string;
}

/**
 * Pure builder: an anchor def → the `dmo_sources` row values. Encodes the design decisions above:
 *   - AFF-* access is rejected (affiliate is not a DMO source).
 *   - agentVerified=false ⇒ source_type='unverified' + is_active=false (born inert; §13 never assume live).
 *   - ACCESS + RIGHTS ride source_type / scrapeConfig / attributionText / notes (no new columns).
 * Deterministic — no clock, no randomness — so it is testable without a database.
 */
export function buildAnchorSourceRow(def: AnchorSourceDef): DmoSourceRowValues {
  if (def.access === "AFF-TP" || def.access === "AFF-NET") {
    throw new Error(
      `[anchor-sync] refusing to sync affiliate source "${def.id}" (${def.access}) into dmo_sources — ` +
        `affiliate is the AFFILIATE rung (R-T1-a/§4/§16), not a DMO content source.`,
    );
  }
  const access = def.access; // narrowed to the non-affiliate rungs
  const rights = RIGHTS_BY_ACCESS[access];
  const verified = def.agentVerified;

  return {
    id: def.id,
    name: def.name,
    domain: def.domain,
    // Unverified (no egress to confirm the URL) ⇒ the enum's own 'unverified' state; verified ⇒ access mapping.
    sourceType: verified ? SOURCE_TYPE_BY_ACCESS[access] : "unverified",
    market: def.market,
    marketRegion: def.marketRegion,
    confidence: verified ? CONFIDENCE_BY_ACCESS[access] : "scraped",
    attributionRequired: def.attributionRequired ?? false,
    attributionText: def.attributionText ?? null,
    scrapeConfig: {
      // Legend fields ride scrapeConfig since dmo_sources has no access/rights column (decision 2).
      access,
      rights,
      registryMark: def.registryMark,
      agentVerified: verified,
      rateLimit: 1,
      respectRobotsTxt: true,
    },
    // Born INERT unless this is the already-live Kyoto anchor. A Replit run verifies the URL, then flips active.
    isActive: verified,
    notes:
      `${def.note} [access=${access}; rights: ${rights}] ` +
      (verified
        ? "Live registry source enriched by anchor-sync."
        : "UNVERIFIED — URL not confirmed live by anchor-sync (no egress). Born inert (source_type=unverified, " +
          "is_active=false); a Replit run must verify the URL before activating."),
  };
}

