/**
 * Operation Trailhead LANE T3.2 — provider matcher (PURE, DB-free, NO LLM).
 *
 * Rung 1 of the resolution waterfall (R-T3-a): does a published scraped stub correspond to a LIVE
 * platform provider service? If so the stub links to that internal listing and never competes with it.
 *
 * R-T3-b is the safety ruling this file enforces: a match requires name similarity AND geo proximity
 * AND category agreement — ALL THREE — because a wrong match books a traveler into the wrong venue.
 * There is NO LLM, no embedding, no fuzzy auto-promotion here: name similarity is a deterministic
 * token-set Jaccard, geo is the same haversine the map uses (REUSED from market-insights.service.ts,
 * not re-derived), category is the R-T1-a crosswalk. Below any single threshold ⇒ no match ⇒ the stub
 * stays 'external'. Every returned match carries the evidence it matched on (R-T3-b) so the T3.6
 * first-pass HARD STOP can audit each one before render consumes it.
 *
 * DB-free: callers pass provider rows in (the pass runner loads them). The one service that owns the
 * waterfall orchestration (stub-resolution.service.ts, L6) composes this pure evidence producer.
 */

import { haversineKm, parseCoord } from "./market-insights.service";
import { crosswalk, isDmoContentType } from "./content-gap-taxonomy";
import {
  PROVIDER_MATCH_MAX_KM,
  PROVIDER_MATCH_MIN_NAME_SIMILARITY,
  PROVIDER_MATCH_CONFIDENCE_WEIGHTS,
} from "../config/trailhead.config";

/** The stub side of a candidate match (dmo_raw_content shape; coords are stored as strings). */
export interface StubMatchInput {
  id: string;
  name: string;
  /** dmoContentTypeEnum member — the stub's content grain. */
  contentType: string;
  latitude: string | number | null;
  longitude: string | number | null;
}

/** One provider service the pass has already scoped to the stub's market/city. */
export interface ProviderServiceCandidate {
  id: string;
  serviceName: string;
  latitude: string | number | null;
  longitude: string | number | null;
  /** service_categories.category_key resolved via the service's categoryId (the crosswalk key). */
  categoryKey: string | null;
  /** Only an approved, live listing is bookable — a provider match must point at one (R-T3-a). */
  approvalStatus: string | null;
}

/** The evidence a match matched on — stored + surfaced to the T3.6 review table (R-T3-b). */
export interface ProviderMatchEvidence {
  nameSimilarity: number; // 0..1 token-set Jaccard (or 1.0 exact-normalized)
  distanceKm: number; // haversine straight-line
  stubContentType: string;
  providerCategoryKey: string;
  crosswalkContentType: string; // what the provider category crosswalks to (== stubContentType on a hit)
}

export interface ProviderMatch {
  serviceId: string;
  confidence: number; // 0..1 composite (weighted name+geo, gated behind category agreement)
  evidence: ProviderMatchEvidence;
}

// ── Name normalization + similarity (deterministic, NO LLM) ───────────────────────────────────────

/** Lowercase, strip accents, drop punctuation to spaces, collapse whitespace. */
function normalizeName(s: string): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining accent marks (Unicode diacritics block)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenSet(s: string): Set<string> {
  const n = normalizeName(s);
  return new Set(n ? n.split(" ") : []);
}

/**
 * Token-set Jaccard similarity of two names in [0,1]. Exact-normalized equality short-circuits to 1.0
 * (covers punctuation/case/accent-only differences). Two empty names are NOT similar (0) — an unnamed
 * candidate can never match. Order-independent, deterministic, no external call.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  const inter = Array.from(sa).filter((t) => sb.has(t)).length;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ── The matcher ───────────────────────────────────────────────────────────────────────────────────

/** Composite confidence: weighted mean of name similarity and geo closeness (1 - dist/maxKm). */
function composite(nameSim: number, distanceKm: number): number {
  const geoCloseness = Math.max(0, 1 - distanceKm / PROVIDER_MATCH_MAX_KM);
  const w = PROVIDER_MATCH_CONFIDENCE_WEIGHTS;
  const score = nameSim * w.name + geoCloseness * w.geo;
  // Round to 2 decimals — match_confidence is stored NUMERIC(3,2).
  return Math.round(score * 100) / 100;
}

/**
 * Best provider match for a stub, or null. Evaluates EVERY candidate against all three hard gates
 * (category agreement, name ≥ threshold, geo ≤ threshold) and returns the highest-composite survivor.
 * A tie breaks on the higher name similarity, then the shorter distance — deterministic ordering so a
 * re-run over the same inputs is identical (R-T3-c / the determinism test).
 */
export function matchStubToProvider(
  stub: StubMatchInput,
  candidates: ProviderServiceCandidate[],
): ProviderMatch | null {
  const stubPin = parseCoord(stub.latitude, stub.longitude);
  if (!stubPin) return null; // geo is a REQUIRED leg — an unlocated stub can never resolve to a provider

  let best: ProviderMatch | null = null;
  for (const c of candidates) {
    // Gate 0: only a live (approved) listing is a valid provider target (R-T3-a).
    if ((c.approvalStatus ?? "") !== "approved") continue;

    // Gate 1: category agreement via the R-T1-a crosswalk (provider category_key → content_type).
    if (!c.categoryKey) continue;
    const target = crosswalk(c.categoryKey);
    if (!target || !isDmoContentType(target)) continue; // affiliate_rung / service_only never agree
    if (target !== stub.contentType) continue;

    // Gate 2: name similarity ≥ threshold.
    const nameSim = nameSimilarity(stub.name, c.serviceName);
    if (nameSim < PROVIDER_MATCH_MIN_NAME_SIMILARITY) continue;

    // Gate 3: geo proximity ≤ threshold (both located).
    const cPin = parseCoord(c.latitude, c.longitude);
    if (!cPin) continue;
    const distanceKm = haversineKm(stubPin, cPin);
    if (distanceKm > PROVIDER_MATCH_MAX_KM) continue;

    const confidence = composite(nameSim, distanceKm);
    const candidate: ProviderMatch = {
      serviceId: c.id,
      confidence,
      evidence: {
        nameSimilarity: Math.round(nameSim * 1000) / 1000,
        distanceKm: Math.round(distanceKm * 1000) / 1000,
        stubContentType: stub.contentType,
        providerCategoryKey: c.categoryKey,
        crosswalkContentType: target,
      },
    };
    if (
      !best ||
      candidate.confidence > best.confidence ||
      (candidate.confidence === best.confidence && candidate.evidence.nameSimilarity > best.evidence.nameSimilarity) ||
      (candidate.confidence === best.confidence &&
        candidate.evidence.nameSimilarity === best.evidence.nameSimilarity &&
        candidate.evidence.distanceKm < best.evidence.distanceKm)
    ) {
      best = candidate;
    }
  }
  return best;
}
