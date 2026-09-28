/**
 * landing-billboard.service.ts — which real expert, if any, has taken a billboard tile, and the
 * LIVE LISTING that tile then renders (ledger `2026-09-28-landing-reorder`, item 5; follow-up 4,
 * ledger `2026-09-28-billboard-override-listing`).
 *
 * The billboard is CURATED (shared/landing-billboard.ts). A real expert takes a tile only when they
 * pass the BYLINE GATE for that tile's market — approved application, a claimed handle, a live
 * storefront, a verified neighbourhood there — asked of `checkBylineEligibility` itself, never a
 * second copy of its rules (§18 rule 1). The listing comes from that expert's PUBLIC storefront
 * read, `loadStorefront` (approved + active listings only, the same read the gate asks), filtered to
 * listings whose own city resolves to the market; a listing with no city is not placed on a city's
 * tile (§13 — never guessed). The response carries a handle, a role label and the listing's own
 * fields: no user id (Locked Decision 40), and no price composed here.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { providerServices } from "@shared/schema";
import { BILLBOARD_TILES } from "@shared/landing-billboard";
import {
  assignBillboardOverrides,
  listingLines,
  type BillboardListing,
  type BillboardOverride,
  type QualifiedExpert,
} from "@shared/landing-billboard-override";
import { isProviderRole } from "@shared/roles";
import { checkBylineEligibility } from "./blog-byline-gate.service";
import { resolveMarketSlug } from "./trend-engine/operating-markets";

/** Candidates: experts with a VERIFIED neighbourhood whose city resolves to the market. */
async function candidateExpertIds(marketKey: string): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT DISTINCT en.expert_id AS id, cn.city AS city
      FROM expert_neighborhoods en
      JOIN city_neighborhoods cn ON cn.id = en.neighborhood_id
     WHERE en.verified_at IS NOT NULL
  `);
  return Array.from(
    new Set(
      (rows.rows as any[])
        .filter((r) => resolveMarketSlug(String(r.city ?? "")) === marketKey)
        .map((r) => String(r.id)),
    ),
  ).sort();
}

/** The injectable steps, so the gate-then-listing rule is testable without a database. */
export interface BillboardOverrideDeps {
  candidates: (marketKey: string) => Promise<string[]>;
  gate: (expertId: string, marketKey: string) => Promise<{ eligible: boolean }>;
  /** The expert's public handle, role and storefront listings in the market (already public-gated). */
  qualify: (expertId: string, marketKey: string) => Promise<QualifiedExpert | null>;
}

async function qualifyFromStorefront(expertId: string, marketKey: string): Promise<QualifiedExpert | null> {
  const u = await db.execute(sql`SELECT handle FROM users WHERE id = ${expertId} LIMIT 1`);
  const handle = (u.rows[0] as any)?.handle as string | null;
  if (!handle) return null;
  const { loadStorefront } = await import("../routes/storefront.routes");
  const sf: any = await loadStorefront(handle);
  if (!sf) return null;
  const inMarket = ((sf.services ?? []) as any[]).filter(
    (s) => s.city && resolveMarketSlug(String(s.city)) === marketKey,
  );
  if (inMarket.length === 0) return null;
  // The listing's own text lines, read under the SAME public gate the storefront applies.
  const text = await db
    .select({
      id: providerServices.id,
      shortDescription: providerServices.shortDescription,
      description: providerServices.description,
    })
    .from(providerServices)
    .where(
      and(
        inArray(providerServices.id, inMarket.map((s) => String(s.id))),
        eq(providerServices.approvalStatus, "approved"),
        eq(providerServices.status, "active"),
      ),
    );
  const textById = new Map(text.map((t) => [t.id, t]));
  const listings: BillboardListing[] = inMarket
    .filter((s) => textById.has(String(s.id)))
    .map((s) => {
      const t = textById.get(String(s.id))!;
      return {
        id: String(s.id),
        title: String(s.serviceName),
        lines: listingLines(t.shortDescription, t.description),
        price: s.price ?? null,
        priceType: s.priceType ?? null,
        pricingUnit: s.pricingUnit ?? null,
        showPrice: s.showPrice !== false,
        imageUrl: s.serviceImage || null,
      };
    })
    // Deterministic: a listing with its own photo first, then by title, then id.
    .sort(
      (a, b) =>
        Number(!!b.imageUrl) - Number(!!a.imageUrl) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
    );
  return {
    handle,
    roleLabel: isProviderRole(sf.earner?.role) ? "Service provider" : "Local expert",
    listings,
  };
}

const DEFAULT_DEPS: BillboardOverrideDeps = {
  candidates: candidateExpertIds,
  gate: checkBylineEligibility,
  qualify: qualifyFromStorefront,
};

/** Per market and per tile: which tiles a byline-gated expert's live listing takes. */
export async function resolveBillboardOverrides(deps: BillboardOverrideDeps = DEFAULT_DEPS): Promise<BillboardOverride[]> {
  const markets = Array.from(new Set(BILLBOARD_TILES.map((t) => t.marketKey)));
  const qualifiedByMarket = new Map<string, QualifiedExpert[]>();
  for (const marketKey of markets) {
    const qualified: QualifiedExpert[] = [];
    for (const id of await deps.candidates(marketKey)) {
      const decision = await deps.gate(id, marketKey);
      if (!decision.eligible) continue;
      const q = await deps.qualify(id, marketKey);
      if (q && q.listings.length > 0) qualified.push(q);
    }
    qualifiedByMarket.set(marketKey, qualified);
  }
  return assignBillboardOverrides(BILLBOARD_TILES, qualifiedByMarket);
}
