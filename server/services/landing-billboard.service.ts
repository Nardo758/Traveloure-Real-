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
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../db";
import {
  providerServices,
  travelPulseHiddenGems,
  users,
} from "@shared/schema";
import { CANCELLATION_POLICY_TYPES } from "@shared/cancellation-schedule";
import { resolveBillboardCredit, BILLBOARD_TILES, type PhotoAttribution } from "@shared/landing-billboard";
import {
  assignBillboardOverrides,
  listingLines,
  type BillboardDispatchSlot,
  type BillboardMarketSelection,
  type BillboardListing,
  type BillboardOverride,
  type QualifiedExpert,
} from "@shared/landing-billboard-override";
import { isEarnerRole, isProviderRole } from "@shared/roles";
import { isTestAccountEmail } from "./demand-test-exclusion";
import { checkBylineEligibility } from "./blog-byline-gate.service";
import { getMarketByKey, resolveMarketSlug } from "./trend-engine/operating-markets";
import { parseCoord } from "./advisor-fundamentals.service";
import { buildListingBuyActions, hasPublishedPrice, resolveNextAvailableSlots, type ListingBuyRow } from "./buy-action-payload";
import type { BuyAction } from "@shared/buy-action";

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

export interface BillboardGemCandidate {
  id: string;
  city: string;
  name: string;
  score: number | null;
  curatorExpertId: string | null;
  curatorHandle: string | null;
  /** Only set when source attribution was independently captured and verified. */
  image?: { url: string; attribution: string };
}

export interface BillboardSliceReadyCandidate {
  id: string;
  city: string;
  handle: string;
  listing: BillboardListing;
  latitude: string | number | null;
  longitude: string | number | null;
  cancellationPolicyType: string | null;
  action: BuyAction | null;
  nextOpenSlot: { date: string; startTime: string | null } | null;
}

export interface BillboardDispatchDeps extends BillboardOverrideDeps {
  creditedMarkets: () => Promise<ReadonlySet<string>>;
  /** The clock the daily market rotation reads (injected so the pick is proven without waiting a day). */
  now?: () => Date;
  gems: (marketKey: string) => Promise<BillboardGemCandidate[]>;
  sliceReadyListings: (marketKey: string) => Promise<BillboardSliceReadyCandidate[]>;
}

/** Billboard dispatch never treats reserved test accounts or non-earners as live owners. */
export function isBillboardLiveOwner(role: string | null | undefined, email: string | null | undefined): boolean {
  return isEarnerRole(role) && !isTestAccountEmail(email);
}

async function dispatchBylineGate(expertId: string, marketKey: string): Promise<{ eligible: boolean }> {
  const [owner] = await db
    .select({ role: users.role, email: users.email })
    .from(users)
    .where(eq(users.id, expertId))
    .limit(1);
  if (!owner || !isBillboardLiveOwner(owner.role, owner.email)) return { eligible: false };
  return checkBylineEligibility(expertId, marketKey);
}

const BILLBOARD_MARKET_CONSTRAINT =
  "Only markets with existing credited billboard tile inventory and a real slot-1 expert listing can be selected; current curated tiles are Kyoto-only.";

async function creditedTileMarkets(): Promise<ReadonlySet<string>> {
  const file = join(process.cwd(), "client/public/images/landing/ATTRIBUTION.json");
  const attributions = JSON.parse(readFileSync(file, "utf8")) as PhotoAttribution[];
  return new Set(
    BILLBOARD_TILES
      .filter((tile) => resolveBillboardCredit(tile.imagePath, attributions) !== null)
      .map((tile) => tile.marketKey),
  );
}

async function gemCandidates(marketKey: string): Promise<BillboardGemCandidate[]> {
  const rows = await db
    .select({
      id: travelPulseHiddenGems.id,
      city: travelPulseHiddenGems.city,
      name: travelPulseHiddenGems.placeName,
      score: travelPulseHiddenGems.gemScore,
      curatorExpertId: travelPulseHiddenGems.curatedByExpertId,
      curatorHandle: users.handle,
    })
    .from(travelPulseHiddenGems)
    .leftJoin(users, eq(users.id, travelPulseHiddenGems.curatedByExpertId))
    .orderBy(sql`${travelPulseHiddenGems.gemScore} DESC NULLS LAST`);
  return rows
    .filter((row) => resolveMarketSlug(row.city) === marketKey)
    .map((row) => ({
      id: row.id,
      city: row.city,
      name: row.name,
      score: row.score == null ? null : Number(row.score),
      curatorExpertId: row.curatorExpertId ?? null,
      curatorHandle: row.curatorHandle ?? null,
    }));
}

async function sliceReadyListingCandidates(marketKey: string): Promise<BillboardSliceReadyCandidate[]> {
  const rows = await db
    .select({
      id: providerServices.id,
      ownerUserId: providerServices.userId,
      handle: users.handle,
      role: users.role,
      email: users.email,
      serviceName: providerServices.serviceName,
      shortDescription: providerServices.shortDescription,
      description: providerServices.description,
      price: providerServices.price,
      priceType: providerServices.priceType,
      pricingUnit: providerServices.pricingUnit,
      showPrice: providerServices.showPrice,
      serviceImage: providerServices.serviceImage,
      deliveryMethod: providerServices.deliveryMethod,
      productShape: providerServices.productShape,
      bookingMode: providerServices.bookingMode,
      categoryId: providerServices.categoryId,
      expertOfferingTypeKey: providerServices.expertOfferingTypeKey,
      latitude: providerServices.latitude,
      longitude: providerServices.longitude,
      city: providerServices.city,
      cancellationPolicyType: providerServices.cancellationPolicyType,
      approvalStatus: providerServices.approvalStatus,
      status: providerServices.status,
    })
    .from(providerServices)
    .innerJoin(users, eq(users.id, providerServices.userId))
    .where(
      and(
        eq(providerServices.approvalStatus, "approved"),
        eq(providerServices.status, "active"),
        gte(providerServices.price, "0.01"),
      ),
    );
  const inMarket = rows.filter((row) =>
    !!row.handle &&
    isBillboardLiveOwner(row.role, row.email) &&
    resolveMarketSlug(row.city) === marketKey &&
    parseCoord(row.latitude, row.longitude) !== null &&
    hasPublishedPrice(row.price) &&
    row.showPrice === true &&
    (CANCELLATION_POLICY_TYPES as readonly string[]).includes(row.cancellationPolicyType ?? ""),
  );
  if (inMarket.length === 0) return [];

  // These are the canonical card-action and future-open-slot readers used by storefront surfaces.
  const actionRows: ListingBuyRow[] = inMarket.map((row) => ({
    id: row.id,
    ownerUserId: row.ownerUserId,
    bookingMode: row.bookingMode,
    deliveryMethod: row.deliveryMethod,
    productShape: row.productShape,
    price: row.price,
    isLive: true,
    priceType: row.priceType,
    pricingUnit: row.pricingUnit,
    categoryId: row.categoryId,
    expertOfferingTypeKey: row.expertOfferingTypeKey,
  }));
  const [actions, nextSlots] = await Promise.all([
    buildListingBuyActions(actionRows, { principal: "guest", plans: "none" }),
    resolveNextAvailableSlots(inMarket.map((row) => row.id)),
  ]);
  const rowById = new Map(inMarket.map((row) => [row.id, row]));
  return inMarket
    .map((row) => {
      const action = actions.get(row.id) ?? null;
      const nextOpenSlot = nextSlots.get(row.id) ?? null;
      const listing: BillboardListing = {
        id: row.id,
        title: row.serviceName,
        lines: listingLines(row.shortDescription, row.description),
        price: row.price,
        priceType: row.priceType,
        pricingUnit: row.pricingUnit,
        showPrice: row.showPrice === true,
        imageUrl: row.serviceImage || null,
      };
      return {
        id: row.id,
        city: row.city ?? "",
        handle: row.handle!,
        listing,
        latitude: row.latitude,
        longitude: row.longitude,
        cancellationPolicyType: row.cancellationPolicyType ?? null,
        action,
        nextOpenSlot,
      };
    })
    .filter((candidate) => {
      const source = rowById.get(candidate.id)!;
      const action = candidate.action;
      return !!source.handle &&
        parseCoord(candidate.latitude, candidate.longitude) !== null &&
        hasPublishedPrice(source.price) &&
        (CANCELLATION_POLICY_TYPES as readonly string[]).includes(candidate.cancellationPolicyType ?? "") &&
        action?.primary.kind === "book" &&
        action.ask.includes("slot") &&
        candidate.nextOpenSlot !== null;
    })
    .sort((a, b) => a.listing.title.localeCompare(b.listing.title) || a.id.localeCompare(b.id));
}

const DEFAULT_DISPATCH_DEPS: BillboardDispatchDeps = {
  ...DEFAULT_DEPS,
  gate: dispatchBylineGate,
  creditedMarkets: creditedTileMarkets,
  gems: gemCandidates,
  sliceReadyListings: sliceReadyListingCandidates,
};

/**
 * The day's slot-1 anchor: one qualifying market per UTC day, in operating-market order, then that
 * market's first qualifying override. Pure; an empty list answers null (every slot stays curated).
 */
export function pickRotatedSlotOne(qualifying: readonly BillboardOverride[], now: Date): BillboardOverride | null {
  const markets: string[] = [];
  for (const o of qualifying) if (!markets.includes(o.marketKey)) markets.push(o.marketKey);
  if (!markets.length) return null;
  const day = Math.floor(now.getTime() / 86_400_000);
  const marketKey = markets[day % markets.length];
  return qualifying.find((o) => o.marketKey === marketKey) ?? null;
}

/**
 * Resolve the three typed billboard slots. The legacy override array remains separately available
 * so #1167 callers keep the exact pure assignment API and payload representation they already use.
 */
export async function resolveBillboardDispatch(
  deps: BillboardDispatchDeps = DEFAULT_DISPATCH_DEPS,
): Promise<{ overrides: BillboardOverride[]; marketSelection: BillboardMarketSelection }> {
  const [overrides, creditedMarkets] = await Promise.all([
    resolveBillboardOverrides(deps),
    deps.creditedMarkets(),
  ]);
  // Market rotation (dispatch, Sep 29, 2026): ONLY among markets that can fill slot 1 for real —
  // a byline-gated expert's live listing in a market with credited tiles. A market that cannot is
  // never selected, so the anchor is never a curated fallback wearing another market's name.
  const slotOneOverride = pickRotatedSlotOne(
    overrides.filter((item) => creditedMarkets.has(item.marketKey)),
    (deps.now ?? (() => new Date()))(),
  );
  if (!slotOneOverride) {
    return {
      overrides,
      marketSelection: { market: null, slots: [], constraint: BILLBOARD_MARKET_CONSTRAINT },
    };
  }

  const marketKey = slotOneOverride.marketKey;
  const market = getMarketByKey(marketKey);
  const slots: BillboardDispatchSlot[] = [{
    slot: 1,
    marketKey,
    override: slotOneOverride,
  }];

  // Slots 2 and 3 fail independently: absence leaves each curated tile untouched.
  try {
    for (const gem of await deps.gems(marketKey)) {
      if (!gem.curatorExpertId || !Number.isFinite(gem.score) || gem.score === null) continue;
      if (resolveMarketSlug(gem.city) !== marketKey) continue;
      const decision = await deps.gate(gem.curatorExpertId, marketKey);
      if (!decision.eligible) continue;
      if (!gem.curatorHandle) continue;
      const attributedImage = gem.image?.url.trim() && gem.image.attribution.trim()
        ? { url: gem.image.url, attribution: gem.image.attribution }
        : undefined;
      slots.push({
        slot: 2,
        marketKey,
        handle: gem.curatorHandle,
        gem: {
          id: gem.id,
          name: gem.name,
          score: gem.score,
          ...(attributedImage ? { image: attributedImage } : {}),
        },
      });
      break;
    }
  } catch (error: any) {
    console.error("[landing-billboard] slot 2 unavailable; keeping its curated tile:", error?.message ?? error);
  }

  try {
    const sliceReady = (await deps.sliceReadyListings(marketKey)).find((candidate) => {
      return resolveMarketSlug(candidate.city) === marketKey &&
        !!candidate.handle &&
        parseCoord(candidate.latitude, candidate.longitude) !== null &&
        hasPublishedPrice(candidate.listing.price) &&
        candidate.listing.showPrice === true &&
        (CANCELLATION_POLICY_TYPES as readonly string[]).includes(candidate.cancellationPolicyType ?? "") &&
        candidate.action?.primary.kind === "book" &&
        candidate.action.ask.includes("slot") &&
        candidate.nextOpenSlot !== null;
    });
    if (sliceReady) {
      slots.push({
        slot: 3,
        marketKey,
        handle: sliceReady.handle,
        listing: sliceReady.listing,
        nextOpenSlot: sliceReady.nextOpenSlot!,
      });
    }
  } catch (error: any) {
    console.error("[landing-billboard] slot 3 unavailable; keeping its curated tile:", error?.message ?? error);
  }

  return {
    overrides,
    marketSelection: {
      market: market ? { key: market.marketKey, cityName: market.cityName } : null,
      slots,
      constraint: BILLBOARD_MARKET_CONSTRAINT,
    },
  };
}
