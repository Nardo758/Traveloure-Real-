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

export default router;
