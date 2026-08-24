/**
 * Operation Trailhead LANE T3.3 — affiliate matcher (PURE, DB-free, NO LLM, NO live scrape).
 *
 * Rungs 2 & 3 of the resolution waterfall (R-T3-a): affiliate_direct (the operator's own program) and
 * affiliate_ota (Klook/Tiqets/Viator/GYG/Civitatis). Runs AFTER the provider rung and only if it
 * missed — provider always wins (R-T3-a).
 *
 * ALL PROGRAMS ARE DISABLED (T0 gate). Every row in AFFILIATE_PROGRAMS (trailhead.config.ts) is born
 * `enabled: false`; T0 self-unlocks a program by flipping its flag, and the next resolution pass
 * (R-T3-c re-runnable) then produces affiliate resolutions for it. Until then this matcher returns
 * null for every stub, so a stub that would have matched stays 'external' — proven by
 * trailhead-t3-affiliate-matcher.test.ts.
 *
 * R-T3-b (high-confidence): where a program exposes a searchable catalog (hasCatalog), we product-match
 * on the SAME deterministic name similarity + geo gates the provider matcher uses (REUSED, not forked).
 * Where it does not, the only honest resolution is a PROGRAM-LEVEL link ("book on <program>") — never
 * a fabricated product deep-link (§13).
 *
 * R-T3-d (official-channel): an affiliate rung becomes a booking CTA ONLY via a recognized catalog
 * (the OTA programs here are recognized by definition) or an operator's verified domain
 * (affiliate_direct requires `verifiedDomain: true` on the candidate). A scraped tout/reseller URL is
 * never promoted here — it stays content-only external.
 *
 * LINK MECHANICS (§16): this matcher NEVER builds or returns a partner URL. It returns a program+product
 * REF only. At click time the resolved CTA rides the EXISTING affiliate rail — the server-side deep-link
 * builders in server/services/affiliate.service.ts (buildViatorLink / buildGetYourGuideLink /
 * buildTwelveGoDeepLink …, URLSearchParams + affiliateId + baseUrl) mint the URL server-side, the client
 * holds only an opaque token, and the booking goes through POST /api/affiliate-booking-requests /
 * the affiliate_clicks rail (mirrors client/src/components/travelpayouts/useAgentBooking.ts). No second
 * link rail is created here.
 */

import { parseCoord, haversineKm } from "./market-insights.service";
import { nameSimilarity } from "./stub-provider-matcher";
import {
  AFFILIATE_PROGRAMS,
  type AffiliateProgramConfig,
  PROVIDER_MATCH_MIN_NAME_SIMILARITY,
  PROVIDER_MATCH_MAX_KM,
  PROVIDER_MATCH_CONFIDENCE_WEIGHTS,
  AFFILIATE_UNCORROBORATED_GEO_CLOSENESS,
} from "../config/trailhead.config";
import type { ResolutionSubclass } from "@shared/trailhead-resolution";

export interface AffiliateMatchInput {
  id: string;
  name: string;
  contentType: string;
  latitude: string | number | null;
  longitude: string | number | null;
}

/** One product from a program's searchable catalog (a FEED/config row — never live-scraped here). */
export interface AffiliateCatalogProduct {
  productId: string;
  name: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

export interface AffiliateMatchOptions {
  /** Override the program registry (tests). Defaults to AFFILIATE_PROGRAMS (all disabled). */
  programs?: Readonly<Record<string, AffiliateProgramConfig>>;
  /** Per-program catalog products (feeds/config). Empty ⇒ program-level link is the only option. */
  catalogs?: Readonly<Record<string, AffiliateCatalogProduct[]>>;
  /** Program keys whose direct operator domain is verified for THIS stub (R-T3-d). */
  verifiedDirectPrograms?: readonly string[];
}

export interface AffiliateMatch {
  programKey: string;
  /** affiliate_direct | affiliate_ota — the R-T3-a rung, stored as resolution_subclass. */
  subclass: ResolutionSubclass;
  /** 'product' (a catalog product matched) | 'program' (a browse/search link, no product match). */
  matchType: "product" | "program";
  /** resolution_ref: "programKey:productId" for a product match, "programKey" for program-level. */
  ref: string;
  /** 0..1 name/geo composite for a product match; null for a program-level link (no product to score). */
  confidence: number | null;
  evidence: {
    program: string;
    nameSimilarity?: number;
    distanceKm?: number;
  };
}

// Rungs in R-T3-a preference order: affiliate_direct (2) beats affiliate_ota (1).
const SUBCLASS_PREF: Record<ResolutionSubclass, number> = { affiliate_direct: 2, affiliate_ota: 1 };

/**
 * Best affiliate match for a stub, or null. Iterates ENABLED programs in rung-preference order
 * (direct before ota — R-T3-a) and returns the first program that yields an honest resolution:
 *   • a product-level match (name + geo gates clear, R-T3-b) against a recognized catalog, else
 *   • a program-level link when the program has no searchable catalog (recognized OTA only).
 * A DISABLED program yields nothing; with the shipped config (every program disabled) this always
 * returns null and the stub stays 'external'.
 */
export function matchStubToAffiliate(
  stub: AffiliateMatchInput,
  options: AffiliateMatchOptions = {},
): AffiliateMatch | null {
  const programs = options.programs ?? AFFILIATE_PROGRAMS;
  const catalogs = options.catalogs ?? {};
  const verifiedDirect = new Set(options.verifiedDirectPrograms ?? []);

  const enabled = Object.values(programs)
    .filter((p) => p.enabled)
    .sort((a, b) => SUBCLASS_PREF[b.rung] - SUBCLASS_PREF[a.rung]);

  for (const program of enabled) {
    // R-T3-d: an affiliate_direct rung requires the operator's OWN verified domain for this stub.
    if (program.rung === "affiliate_direct" && !verifiedDirect.has(program.key)) continue;

    if (program.hasCatalog) {
      const product = bestCatalogProduct(stub, catalogs[program.key] ?? []);
      if (product) {
        return {
          programKey: program.key,
          subclass: program.rung,
          matchType: "product",
          ref: `${program.key}:${product.productId}`,
          confidence: product.confidence,
          evidence: { program: program.key, nameSimilarity: product.nameSim, distanceKm: product.distanceKm },
        };
      }
      // Catalog present but no product cleared the gates: fall through — a program-level browse link
      // is still honest for a recognized OTA (it lands on a search, never a specific wrong venue).
    }

    // Program-level link (recognized OTA with no catalog, or no product match). R-T3-b: this is a
    // "book on <program>" browse link, not a venue-specific booking, so it carries no product confidence.
    return {
      programKey: program.key,
      subclass: program.rung,
      matchType: "program",
      ref: program.key,
      confidence: null,
      evidence: { program: program.key },
    };
  }

  return null;
}

/** Best catalog product for the stub by the same name/geo gates as the provider matcher, or null. */
function bestCatalogProduct(
  stub: AffiliateMatchInput,
  products: AffiliateCatalogProduct[],
): { productId: string; confidence: number; nameSim: number; distanceKm: number } | null {
  const stubPin = parseCoord(stub.latitude, stub.longitude);
  let best: { productId: string; confidence: number; nameSim: number; distanceKm: number } | null = null;
  for (const p of products) {
    const nameSim = nameSimilarity(stub.name, p.name);
    if (nameSim < PROVIDER_MATCH_MIN_NAME_SIMILARITY) continue;
    // Geo is a required leg only when BOTH sides are located; a catalog product with no coordinate
    // relies on name alone but is capped below a fully-corroborated match.
    let distanceKm = 0;
    let geoCloseness = 1;
    const pPin = parseCoord(p.latitude ?? null, p.longitude ?? null);
    if (stubPin && pPin) {
      distanceKm = haversineKm(stubPin, pPin);
      if (distanceKm > PROVIDER_MATCH_MAX_KM) continue;
      geoCloseness = Math.max(0, 1 - distanceKm / PROVIDER_MATCH_MAX_KM);
    } else {
      geoCloseness = AFFILIATE_UNCORROBORATED_GEO_CLOSENESS; // uncorroborated geo — never full-confidence
    }
    const w = PROVIDER_MATCH_CONFIDENCE_WEIGHTS;
    const confidence = Math.round((nameSim * w.name + geoCloseness * w.geo) * 100) / 100;
    if (!best || confidence > best.confidence) {
      best = { productId: p.productId, confidence, nameSim: Math.round(nameSim * 1000) / 1000, distanceKm: Math.round(distanceKm * 1000) / 1000 };
    }
  }
  return best;
}
