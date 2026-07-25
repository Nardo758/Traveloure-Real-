/**
 * catalog-ingest.service.ts — §16 catalog unification (P7, U1+U2).
 *
 * Folds the parallel Travelpayouts catalog feed into the CENTRAL content system: fetches a network's
 * live catalog (the same per-network services the /api/catalog/* endpoints proxy), normalizes each
 * item into `affiliate_products`, and mirrors it into `content_registry` via registerAffiliateProduct
 * — so the central resolver + placement rules + origin grouping + CTA engine all see it (which they
 * cannot today, per docs/audits/central-content-audit.md).
 *
 * Governing rules honored:
 *   • §13 never-fabricate + key-gate: no Travelpayouts token ⇒ ZERO writes, never invents inventory.
 *   • Tag-at-ingest: city/country/coordinates set from the item at write time; unresolvable ⇒ NULL
 *     (the row simply won't surface until tagged — no guessed city).
 *   • D1a partner gate: each network is one `affiliate_partners` row, born 'submitted' (admin approves
 *     once). Products inherit the partner's approval — the G-SEC read-gate then holds automatically.
 *   • §15 idempotent: dedup on (partner_id, external_id); a re-run updates in place, never duplicates.
 *   • booking_type = 'affiliate_bookable' (agent rail) — the ratified default for partner inventory.
 *
 * Live fetch runs at DEPLOY only (the agent proxy 403s the external APIs); local runs are a no-op
 * (mirrors the DMO-ingestion posture). The DB normalize/upsert half is unit-provable with a mock item.
 */
import { db } from "../db";
import { affiliatePartners, affiliateProducts } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { getTravelpayoutsToken } from "./travelpayouts/travelpayouts-client";

// Minimal shape we read from any Travelpayouts network item (decoupled from the per-network union
// types). Fields are read defensively — a missing field just yields a NULL column (§13, never faked).
interface CatalogInput {
  id?: string;
  externalId?: string;
  title?: string;
  description?: string | null;
  type?: string;
  categories?: string[];
  price?: number | null;
  currency?: string;
  imageUrl?: string | null;
  bookingUrl?: string | null;
  affiliateUrl?: string | null;
  destination?: string | null;
  location?: { lat: number; lng: number } | null;
  rating?: number | null;
  reviewCount?: number | null;
  duration?: string | null;
  tags?: string[];
}

// ─── Network registry (U1 partner definitions + U2 fetchers) ────────────────────────────────────

interface NetworkDef {
  key: string;
  partnerName: string;
  websiteUrl: string;
  category: string;
  /** Live fetch for a city → normalized CatalogItem[]. Dynamically imported (deploy-only). */
  fetch: (city: string) => Promise<CatalogInput[]>;
}

export const CATALOG_NETWORKS: NetworkDef[] = [
  {
    key: "tiqets",
    partnerName: "Tiqets",
    websiteUrl: "https://www.tiqets.com",
    category: "activity",
    fetch: async (city) => (await import("./travelpayouts/tiqets.service")).searchTiqetsProducts({ city, limit: 40 }),
  },
  {
    key: "getyourguide",
    partnerName: "GetYourGuide",
    websiteUrl: "https://www.getyourguide.com",
    category: "activity",
    fetch: async (city) => (await import("./travelpayouts/getyourguide.service")).searchGetYourGuide({ destination: city, limit: 40 }),
  },
  {
    key: "klook",
    partnerName: "Klook",
    websiteUrl: "https://www.klook.com",
    category: "activity",
    fetch: async (city) => (await import("./travelpayouts/klook.service")).searchKlook({ destination: city, limit: 40 }),
  },
];

// ─── Partner seed (U1) ──────────────────────────────────────────────────────────────────────────

/** Ensure the network's affiliate_partners row exists (born 'submitted', D1a). Returns its id. */
export async function ensureCatalogPartner(net: NetworkDef): Promise<string> {
  const [existing] = await db.select().from(affiliatePartners)
    .where(and(eq(affiliatePartners.name, net.partnerName), eq(affiliatePartners.source, "travelpayouts")))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(affiliatePartners).values({
    name: net.partnerName,
    websiteUrl: net.websiteUrl,
    category: net.category,
    source: "travelpayouts",
    // Born submitted per D1a — an admin approves once; until then the G-SEC read-gate hides its products.
    approvalStatus: "submitted",
    isActive: true,
  } as any).returning();
  return created.id;
}

// ─── Normalize + upsert (U2) ────────────────────────────────────────────────────────────────────

/** Parse "City, Country" (best-effort). Never fabricates — blanks stay blank. */
function splitDestination(dest: string | null): { city: string | null; country: string | null } {
  if (!dest) return { city: null, country: null };
  const parts = dest.split(",").map(s => s.trim()).filter(Boolean);
  if (!parts.length) return { city: null, country: null };
  return { city: parts[0] || null, country: parts.length > 1 ? parts[parts.length - 1] : null };
}

/** Upsert one normalized CatalogItem into affiliate_products (+ registry mirror). Idempotent. */
export async function upsertCatalogItem(partnerId: string, item: CatalogInput): Promise<"created" | "updated" | "skipped"> {
  const externalId = item.externalId || item.id;
  if (!externalId) return "skipped";
  const { city, country } = splitDestination(item.destination ?? null);
  const coordinates = item.location ? { lat: item.location.lat, lng: item.location.lng } : null;

  const [existing] = await db.select().from(affiliateProducts)
    .where(and(eq(affiliateProducts.partnerId, partnerId), eq(affiliateProducts.externalId, externalId)))
    .limit(1);

  const values = {
    partnerId,
    externalId,
    name: item.title || externalId,
    description: item.description ?? null,
    category: item.type || (item.categories?.[0] ?? null),
    price: item.price != null ? String(item.price) : null,
    currency: item.currency || "USD",
    imageUrl: item.imageUrl ?? null,
    productUrl: item.bookingUrl || item.affiliateUrl || "",
    affiliateUrl: item.affiliateUrl || item.bookingUrl || null,
    // Tag-at-ingest (§13: NULL if the item didn't carry a resolvable location — no guessed city).
    city,
    country,
    location: item.destination ?? null,
    coordinates: coordinates as any,
    rating: item.rating != null ? String(item.rating) : null,
    reviewCount: item.reviewCount ?? null,
    duration: item.duration ?? null,
    tags: (item.tags || []) as any,
    // Ratified default: partner inventory is agent-rail bookable (the CTA classifier).
    bookingType: "affiliate_bookable",
    isActive: true,
    lastScrapedAt: new Date(),
  };

  let productId: string;
  let outcome: "created" | "updated";
  if (existing) {
    await db.update(affiliateProducts).set({ ...values, updatedAt: new Date() }).where(eq(affiliateProducts.id, existing.id));
    productId = existing.id;
    outcome = "updated";
  } else {
    const [row] = await db.insert(affiliateProducts).values(values as any).returning();
    productId = row.id;
    outcome = "created";
  }
  // Mirror into content_registry (central system). Best-effort — never blocks the upsert.
  try {
    await storage.registerAffiliateProduct({
      id: productId,
      name: item.title || externalId,
      description: item.description ?? null,
      partnerId,
      externalId,
      price: values.price,
      isActive: true,
    });
  } catch { /* non-blocking */ }
  return outcome;
}

// ─── Ingest a network for a city (deploy-only live fetch) ───────────────────────────────────────

export async function ingestNetwork(networkKey: string, city: string): Promise<{
  ready: boolean; network: string; created: number; updated: number; skipped: number; scanned: number;
}> {
  const net = CATALOG_NETWORKS.find(n => n.key === networkKey);
  if (!net) throw new Error(`Unknown catalog network: ${networkKey}`);
  // §13 key-gate: no token ⇒ zero writes, never fabricates.
  if (!getTravelpayoutsToken()) {
    return { ready: false, network: networkKey, created: 0, updated: 0, skipped: 0, scanned: 0 };
  }
  const partnerId = await ensureCatalogPartner(net);
  let items: CatalogInput[] = [];
  try {
    items = await net.fetch(city);
  } catch (err) {
    console.warn(`[catalog-ingest] ${networkKey} fetch failed`, (err as any)?.message);
    return { ready: true, network: networkKey, created: 0, updated: 0, skipped: 0, scanned: 0 };
  }
  let created = 0, updated = 0, skipped = 0;
  for (const item of items) {
    try {
      const r = await upsertCatalogItem(partnerId, item);
      if (r === "created") created++;
      else if (r === "updated") updated++;
      else skipped++;
    } catch (err) {
      skipped++;
      console.warn(`[catalog-ingest] ${networkKey} upsert failed`, (err as any)?.message);
    }
  }
  return { ready: true, network: networkKey, created, updated, skipped, scanned: items.length };
}

/** Ingest all registered networks for a city. */
export async function ingestAllNetworks(city: string) {
  const results = [];
  for (const net of CATALOG_NETWORKS) {
    results.push(await ingestNetwork(net.key, city));
  }
  return results;
}
