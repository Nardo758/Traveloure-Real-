#!/usr/bin/env tsx

/**
 * Anchor-registry → dmo_sources SYNC (Operation Trailhead T2.2).
 *
 * Turns the human-curated anchor source registry (docs/planning/TRAILHEAD_ANCHOR_SOURCE_REGISTRY_v1.md)
 * into `dmo_sources` rows: Kyoto's confirmable anchor (kept live) and the seven staged markets' DMO
 * portals (born INERT). Mirrors the existing `dmo-sources.seed.ts` pattern EXACTLY — idempotent upsert
 * on the (domain, market) unique constraint — so a Replit run APPLIES this; it is never run here (no DB).
 *
 * The deterministic data + pure row-builder live in `./lib/dmo-anchor-registry.ts` (DB-free, so they are
 * unit-testable without a database — this file imports `../db`). Design decisions, documented so a
 * reviewer sees the judgment:
 *
 * 1. AFFILIATE IS NOT A DMO SOURCE. The legend's affiliate access rungs (AFF-TP / AFF-NET — Viator,
 *    GetYourGuide, Klook, Fever…) are the AFFILIATE substrate (R-T1-a, §4, §16), a different system
 *    (Travelpayouts / the central content registry). They are NOT synced into `dmo_sources`; the builder
 *    rejects any AFF-* access so one can never slip in.
 *
 * 2. NO NEW COLUMNS. `dmo_sources` has no `access`/`rights` column, and adding them would mean a
 *    schema.ts + migration change (decision-maker-gated, publish-trap-exposed, colliding with a live
 *    sibling lane already editing schema.ts). Instead the legend's ACCESS and RIGHTS ride existing
 *    columns: ACCESS → `source_type` + `scrapeConfig.access`; RIGHTS → `attributionText` + `notes` +
 *    `scrapeConfig.rights`. First-class access/rights columns would be a follow-up migration (needs
 *    approval) — flagged, not silently built.
 *
 * 3. NEVER ASSUME LIVE (§13). This agent has NO outbound egress, so it cannot confirm ANY URL is live —
 *    including the four the registry author marked ✓ "verified this week" (that ✓ is the human's claim,
 *    recorded as `registryMark`, not this agent's verification). Every NEW row is therefore born
 *    `unverified`: `source_type='unverified'` (the enum's own value for exactly this state) and
 *    `is_active=false`, so a Replit run must VERIFY the URL (with egress) before flipping it live. The
 *    four primary city-DMO portals are "the four unverified DMO URLs" the registry's T0 list names.
 *    Kyoto's kyoto.travel is the ONE exception — an already-committed, already-live registry row that
 *    this sync only ENRICHES with legend metadata (live+verified state preserved).
 *
 * 4. NEVER INVENT A DOMAIN (§13). Registry entries named without an explicit, real domain (JNTO, the
 *    Kyoto temples, VisitScotland, Forever Edinburgh, Visit Porto, HES…) are NOT created — a row needs a
 *    `domain` and inventing one is fabrication. Entries already covered by the committed registry
 *    (visitportugal.com, procolombia.co, incredibleindia.org) are not duplicated.
 *
 * Run (Replit, with a DB + egress-verified URLs): `tsx server/seeds/dmo-anchor-registry-sync.seed.ts`
 */

import { db } from "../db";
import { dmoSources } from "@workspace/db";
import { ANCHOR_REGISTRY_SOURCES, buildAnchorSourceRow } from "./lib/dmo-anchor-registry";

// Re-export the pure surface so callers/tests can import either module (L6 — one home).
export {
  ANCHOR_REGISTRY_SOURCES,
  buildAnchorSourceRow,
} from "./lib/dmo-anchor-registry";
export type {
  RegistryAccess,
  RegistryMark,
  AnchorSourceDef,
  DmoSourceRowValues,
} from "./lib/dmo-anchor-registry";

/**
 * Idempotent upsert of every anchor source into `dmo_sources` — the SAME (domain, market) conflict target
 * and update shape as `dmo-sources.seed.ts`. Applied by a Replit run; NOT run here (no DB).
 */
export async function syncAnchorRegistrySources(): Promise<{ upserted: number; verified: number; unverified: number }> {
  let upserted = 0;
  let verified = 0;
  let unverified = 0;

  for (const def of ANCHOR_REGISTRY_SOURCES) {
    const row = buildAnchorSourceRow(def);
    if (row.isActive) verified += 1;
    else unverified += 1;

    await db
      .insert(dmoSources)
      .values(row)
      .onConflictDoUpdate({
        target: [dmoSources.domain, dmoSources.market],
        set: {
          name: row.name,
          sourceType: row.sourceType,
          marketRegion: row.marketRegion,
          scrapeConfig: row.scrapeConfig,
          confidence: row.confidence,
          attributionRequired: row.attributionRequired,
          attributionText: row.attributionText,
          isActive: row.isActive,
          notes: row.notes,
          updatedAt: new Date(),
        },
      });
    upserted += 1;
  }

  return { upserted, verified, unverified };
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  syncAnchorRegistrySources()
    .then((result) => {
      console.log(
        `[dmo-anchor-registry-sync] upserted ${result.upserted} anchor sources ` +
          `(${result.verified} live, ${result.unverified} born-unverified/inert)`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("[dmo-anchor-registry-sync] failed:", err);
      process.exit(1);
    });
}
