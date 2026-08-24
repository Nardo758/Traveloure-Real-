/**
 * admin-markets.routes.ts — mount: app.use(adminMarketsRoutes) — paths declare
 * /api/admin/markets/*; §2 blanket requireAdmin on the /api/admin prefix (server/routes.ts's
 * adminApiGuard, app.use("/api/admin", adminApiGuard)) is the auth for every route below. No
 * per-endpoint guard is added here — that pattern is what leaked before (§2).
 *
 * The admin "Add market" flow (migration 186 / CLAUDE.md ruling, Aug 9 2026): runs the Overpass
 * extract server-side (market-extract.service.ts, ported from scripts/generate-market-geography.ts)
 * and stores the result in `market_geography`, optionally seeding `city_neighborhoods` from the
 * same bbox's named place nodes. Read-only list endpoint reports what the DB can answer cheaply and
 * honestly — a check this route can't compute is omitted, never guessed (§13).
 */
import { Router } from "express";
import { z } from "zod/v4";
import { db } from "../db";
import { marketGeography, cityNeighborhoods, providerServices, dmoRawContent, dmoSources } from "@workspace/db";
import { and, eq, sql, count, inArray } from "drizzle-orm";
import {
  extractMarketGeography,
  extractNeighborhoods,
  type Bbox,
} from "../services/market-extract.service";
import { invalidateMarketGeographyCache } from "../services/market-geography.service";

const router = Router();

const OVERPASS_ERROR_MESSAGE = "Overpass unavailable, try again in a few minutes";

function isOverpassFailure(err: unknown): boolean {
  // market-extract.service throws plain Errors for every Overpass failure mode (all mirrors
  // failed, non-2xx, timeout/abort) — there's no separate error class, so any thrown Error from
  // the extract call is treated as an Overpass failure here rather than a 500. Never a fabricated
  // success (§13).
  return err instanceof Error;
}

function slugifyName(name: string, fallback: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return slug || fallback;
}

const bboxSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine(([w, s, e, n]) => w < e && s < n, {
    message: "bbox must satisfy west < east and south < north",
  })
  .refine(([w, s, e, n]) => e - w <= 1.05 && n - s <= 1.05, {
    message: "bbox span too large (max ~1 degree per side — Overpass safety)",
  });

const addMarketSchema = z.object({
  market: z
    .string()
    .regex(/^[a-z0-9-]{2,60}$/, "market must be a lowercase slug (a-z, 0-9, hyphen; 2-60 chars)"),
  displayName: z.string().trim().min(1).max(100),
  country: z.string().trim().min(1).max(100),
  bbox: bboxSchema,
  seedNeighborhoods: z.boolean(),
});

// ─── GET /api/admin/markets — list ──────────────────────────────────────────────────────────
router.get("/api/admin/markets", async (_req, res) => {
  try {
    const markets = await db.select().from(marketGeography).orderBy(marketGeography.market);

    // Neighborhood counts, grouped by city — matched against each market's displayName
    // case-insensitively (the same value POST /api/admin/markets writes as city_neighborhoods.city
    // when seeding, so an exact-insensitive match is correct for anything this endpoint itself
    // seeded; a market whose neighborhoods were seeded by hand under a differently-cased city name
    // still matches via lower()).
    const neighborhoodCounts = await db
      .select({ city: cityNeighborhoods.city, count: count() })
      .from(cityNeighborhoods)
      .groupBy(cityNeighborhoods.city);
    const neighborhoodCountByCityLower = new Map<string, number>();
    for (const row of neighborhoodCounts) {
      neighborhoodCountByCityLower.set(row.city.toLowerCase(), row.count);
    }

    const list = await Promise.all(
      markets.map(async (m) => {
        const displayNameLower = (m.displayName ?? m.market).toLowerCase();
        const neighborhoodCount = neighborhoodCountByCityLower.get(displayNameLower) ?? 0;
        const wayCounts = m.wayCounts as
          | { water?: { kept: number; total: number }; parks?: { kept: number; total: number }; roads?: { kept: number; total: number } }
          | null;

        // Cheap, straightforward DB-answerable checks only — anything that would need a fuzzier
        // join (e.g. reconciling free-text `location` strings) is left out rather than guessed.
        let approvedLodgingWithCoords: number | null = null;
        let dmoContentVisible: number | null = null;
        try {
          const [lodgingRow] = await db
            .select({ n: count() })
            .from(providerServices)
            .where(
              and(
                eq(providerServices.approvalStatus, "approved"),
                eq(providerServices.status, "active"),
                eq(providerServices.productShape, "property"),
                sql`${providerServices.latitude} IS NOT NULL`,
                sql`${providerServices.longitude} IS NOT NULL`,
                sql`lower(${providerServices.city}) LIKE ${"%" + m.market.toLowerCase() + "%"}`,
              ),
            );
          approvedLodgingWithCoords = lodgingRow?.n ?? 0;
        } catch (err) {
          console.warn(`[admin-markets] approvedLodgingWithCoords check failed for "${m.market}" — omitting:`, err);
        }
        try {
          const [dmoRow] = await db
            .select({ n: count() })
            .from(dmoRawContent)
            .where(
              and(
                eq(dmoRawContent.expertWorkspaceVisible, true),
                sql`lower(${dmoRawContent.city}) LIKE ${"%" + m.market.toLowerCase() + "%"}`,
              ),
            );
          dmoContentVisible = dmoRow?.n ?? 0;
        } catch (err) {
          console.warn(`[admin-markets] dmoContentVisible check failed for "${m.market}" — omitting:`, err);
        }

        // Source-kit check (dmoSourceKit): count of active dmo_sources rows whose `market`
        // column matches this market. Matching rule — a row counts if dmo_sources.market
        // equals EITHER (a) the market slug (m.market, lowercased — already lowercase by
        // the addMarketSchema regex, but normalized here defensively), OR (b) the market's
        // `country` lowercased and spaces→underscored (e.g. "Japan" -> "japan",
        // "United Kingdom" -> "united_kingdom" — the same convention ALL_DMO_SOURCES already
        // uses for its `market` field, see DMOSourceRegistry.ts), OR (c) the literal
        // "global" catch-all (mirrors getSourcesByMarket's `s.market === "global"` fallback).
        // If `country` is null on the market_geography row, only slug + "global" are matched.
        let dmoSourceKit: number | null = null;
        try {
          const countryKey = m.country ? m.country.toLowerCase().trim().replace(/\s+/g, "_") : null;
          const marketKeys = countryKey
            ? [m.market.toLowerCase(), countryKey, "global"]
            : [m.market.toLowerCase(), "global"];
          const [kitRow] = await db
            .select({ n: count() })
            .from(dmoSources)
            .where(and(eq(dmoSources.isActive, true), inArray(dmoSources.market, marketKeys)));
          dmoSourceKit = kitRow?.n ?? 0;
        } catch (err) {
          console.warn(`[admin-markets] dmoSourceKit check failed for "${m.market}" — omitting:`, err);
        }

        return {
          market: m.market,
          displayName: m.displayName,
          country: m.country,
          bbox: m.bbox,
          wayCounts: m.wayCounts,
          extractedAt: m.extractedAt,
          neighborhoodCount,
          launchChecklist: {
            geographyReady: {
              ok: !!m.bbox && ((wayCounts?.water?.kept ?? 0) + (wayCounts?.parks?.kept ?? 0) + (wayCounts?.roads?.kept ?? 0)) > 0,
              wayCounts: m.wayCounts,
            },
            neighborhoodsSeeded: { ok: neighborhoodCount >= 1, count: neighborhoodCount },
            // null = not computed (query failed) — the client renders "unavailable", never a fake 0.
            approvedLodgingWithCoords: approvedLodgingWithCoords === null ? null : { ok: approvedLodgingWithCoords >= 1, count: approvedLodgingWithCoords },
            dmoContentVisible: dmoContentVisible === null ? null : { ok: dmoContentVisible >= 1, count: dmoContentVisible },
            // ok threshold: >= 3 active sources matched (slug/country/global) — see the
            // matching-rule comment above where dmoSourceKit is computed.
            dmoSourceKit: dmoSourceKit === null ? null : { ok: dmoSourceKit >= 3, count: dmoSourceKit },
          },
        };
      }),
    );

    return res.status(200).json({ markets: list });
  } catch (err: any) {
    console.error("[admin-markets] list error:", err);
    return res.status(500).json({ message: "Failed to load markets" });
  }
});

// ─── POST /api/admin/markets — add a market (extract + store) ──────────────────────────────
router.post("/api/admin/markets", async (req, res) => {
  const parsed = addMarketSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
  }
  const { market, displayName, country, bbox, seedNeighborhoods } = parsed.data;

  let extract;
  try {
    extract = await extractMarketGeography(bbox as Bbox);
  } catch (err) {
    console.error(`[admin-markets] geography extract failed for "${market}":`, err);
    if (isOverpassFailure(err)) return res.status(502).json({ message: OVERPASS_ERROR_MESSAGE });
    return res.status(500).json({ message: "Failed to extract market geography" });
  }

  try {
    await db
      .insert(marketGeography)
      .values({
        market,
        displayName,
        country,
        bbox: extract.bbox,
        water: extract.water,
        parks: extract.parks,
        roads: extract.roads,
        wayCounts: extract.wayCounts,
        source: "overpass",
        extractedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: marketGeography.market,
        set: {
          displayName,
          country,
          bbox: extract.bbox,
          water: extract.water,
          parks: extract.parks,
          roads: extract.roads,
          wayCounts: extract.wayCounts,
          extractedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    invalidateMarketGeographyCache();
  } catch (err) {
    console.error(`[admin-markets] failed to store market_geography row for "${market}":`, err);
    return res.status(500).json({ message: "Failed to store market geography" });
  }

  let neighborhoods = { inserted: 0, skipped: 0 };
  let neighborhoodsError: string | undefined;
  if (seedNeighborhoods) {
    try {
      const nodes = await extractNeighborhoods(bbox as Bbox);
      const seen = new Set<string>();
      const rows = [];
      for (const node of nodes) {
        const slug = slugifyName(node.name, `node-${rows.length}`);
        const dedupeKey = `${displayName.toLowerCase()}|${country.toLowerCase()}|${slug}`;
        if (seen.has(dedupeKey)) continue; // same slug twice within this extract — collapse before insert
        seen.add(dedupeKey);
        rows.push({
          city: displayName,
          country,
          name: node.name,
          slug,
          centroidLat: node.lat.toFixed(7),
          centroidLng: node.lon.toFixed(7),
        });
      }
      if (rows.length > 0) {
        const inserted = await db
          .insert(cityNeighborhoods)
          .values(rows)
          .onConflictDoNothing({
            target: [cityNeighborhoods.city, cityNeighborhoods.country, cityNeighborhoods.slug],
          })
          .returning({ id: cityNeighborhoods.id });
        neighborhoods = { inserted: inserted.length, skipped: rows.length - inserted.length };
      }
    } catch (err) {
      console.error(`[admin-markets] neighborhood extract/seed failed for "${market}":`, err);
      neighborhoodsError = isOverpassFailure(err) ? OVERPASS_ERROR_MESSAGE : "Failed to seed neighborhoods";
    }
  }

  return res.status(200).json({
    market,
    wayCounts: extract.wayCounts,
    neighborhoods: neighborhoodsError ? { ...neighborhoods, error: neighborhoodsError } : neighborhoods,
  });
});

// ─── POST /api/admin/markets/:slug/refresh-geography — re-run the extract for an existing row ──
router.post("/api/admin/markets/:slug/refresh-geography", async (req, res) => {
  const slug = req.params.slug;
  const [existing] = await db.select().from(marketGeography).where(eq(marketGeography.market, slug));
  if (!existing) {
    return res.status(404).json({ message: `No market_geography row for "${slug}"` });
  }

  let extract;
  try {
    extract = await extractMarketGeography(existing.bbox as Bbox);
  } catch (err) {
    console.error(`[admin-markets] refresh-geography extract failed for "${slug}":`, err);
    if (isOverpassFailure(err)) return res.status(502).json({ message: OVERPASS_ERROR_MESSAGE });
    return res.status(500).json({ message: "Failed to refresh market geography" });
  }

  try {
    await db
      .update(marketGeography)
      .set({
        water: extract.water,
        parks: extract.parks,
        roads: extract.roads,
        wayCounts: extract.wayCounts,
        extractedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(marketGeography.market, slug));
    invalidateMarketGeographyCache();
  } catch (err) {
    console.error(`[admin-markets] failed to persist refreshed geography for "${slug}":`, err);
    return res.status(500).json({ message: "Failed to store refreshed market geography" });
  }

  return res.status(200).json({ market: slug, wayCounts: extract.wayCounts });
});

export default router;
