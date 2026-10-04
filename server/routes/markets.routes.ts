/**
 * markets.routes.ts — mount: app.use(marketsRoutes) — declares GET /api/markets/geography.
 *
 * Public, unauthenticated read of a market's self-rendered geography layer (migration 186 /
 * CLAUDE.md ruling, Aug 9 2026). Display data only — no §14 money/identity concerns; same posture
 * as any other public read (Discover feeds, storefront pages).
 */
import { Router } from "express";
import { getMarketGeographyForDestination } from "../services/market-geography.service";

const router = Router();

router.get("/api/markets/geography", async (req, res) => {
  try {
    const destination = typeof req.query.destination === "string" ? req.query.destination : null;
    const geography = await getMarketGeographyForDestination(destination);
    res.set("Cache-Control", "public, max-age=300");
    return res.status(200).json({ geography });
  } catch (err: any) {
    console.error("[markets] geography lookup error:", err);
    return res.status(500).json({ message: "Failed to load market geography" });
  }
});

/**
 * Step 5 (ruling 9): the Leaflet/OSM fallback renderer's tiles. The URL is DEPLOYMENT config
 * (`MAP_FALLBACK_TILE_URL`, a keyed or paid provider — public OSM tiles are against their usage
 * policy at production volume). Absent ⇒ public OSM tiles, and the server says so once in its log.
 * ODbL attribution is always returned and always drawn.
 */
let warnedPublicTiles = false;
router.get("/api/maps/tiles", (_req, res) => {
  const configured = (process.env.MAP_FALLBACK_TILE_URL ?? "").trim();
  if (!configured && !warnedPublicTiles) {
    warnedPublicTiles = true;
    console.warn("[maps] MAP_FALLBACK_TILE_URL is not set — the fallback map uses public OpenStreetMap tiles");
  }
  res.set("Cache-Control", "public, max-age=300");
  res.json({
    url: configured || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    source: configured ? "configured" : "public_osm",
  });
});

export default router;
