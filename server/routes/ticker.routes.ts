// LW-1f (ledger `2026-10-16-lw1f-kyoto-ticker`; hand-off Part A): the launch-market ticker.
//
//   GET   /api/public/ticker?market=<slug>  — public. Active lines inside their window that link only to live pages,
//                                             in order, text and href only. Cached briefly (30 s, here and in the
//                                             browser). Only the launch market has lines; any other is empty.
//                                             LW-1f-b: also `betaCities` — the names of the cities on the beta list
//                                             (`beta_market_slugs`, default the launch city), for the left label.
//   GET   /api/admin/ticker                 — every line of the launch market, with whether each is showing.
//   POST  /api/admin/ticker                 — add a line (`.strict()` allowlist body, §19).
//   PATCH /api/admin/ticker/:id             — edit a line: text, link, on/off, start/end.
//   PUT   /api/admin/ticker/order           — reorder: every id of the market, in the new order.
//
// Every admin write and its audit row are one transaction (ticker.service.ts). /api/admin/* is also behind the
// blanket requireAdmin guard (CLAUDE.md §2); the DB-role check here is the second layer.
import { Router } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { getAdminRole } from "../services/admin-query.service";
import { getBetaMarketSlugs, getLaunchMarketSlug } from "../services/platform-flags";
import { betaCityNames } from "@shared/ticker";
import { logger } from "../infrastructure/logger";
import {
  TICKER_CACHE_MS,
  TickerRefusal,
  adminTickerItems,
  createTickerItem,
  publicTickerItems,
  reorderTickerItems,
  updateTickerItem,
} from "../services/ticker.service";
import { tickerItemCreateSchema, tickerItemPatchSchema, tickerReorderSchema } from "@shared/ticker";
import { LIVE_MARKETS_ROUTE } from "@shared/live-markets";

const router = Router();

router.get("/api/public/ticker", async (req, res) => {
  const raw = typeof req.query.market === "string" ? req.query.market.trim().toLowerCase() : "";
  const market = await getLaunchMarketSlug();
  // The ticker is the launch market's only (Part A): any other market has no lines. Answering only that one also
  // keeps the in-process cache to a single key, whatever a caller sends.
  if (!market || (raw && raw !== market)) return res.json({ items: [] });
  try {
    const items = await publicTickerItems(market);
    const betaCities = betaCityNames(await getBetaMarketSlugs());
    res.set("Cache-Control", `public, max-age=${Math.floor(TICKER_CACHE_MS / 1000)}`);
    return res.json({ items, betaCities });
  } catch (err: any) {
    // The ribbon shows nothing on an empty list, so a failed read hides it rather than breaking the page.
    logger.error(`[ticker] public read failed: ${err?.code ?? err?.message ?? "unknown"}`);
    return res.json({ items: [] });
  }
});

// SH-1 item 3: the live market keys (`beta_market_slugs`), for the homepage rail. Cached in-process ~60 s; a failed read
// answers an empty list, which hides the rail rather than guessing.
const LIVE_MARKETS_CACHE_MS = 60_000;
let liveMarketsCache: { at: number; marketKeys: string[] } | null = null;
router.get(LIVE_MARKETS_ROUTE, async (_req, res) => {
  try {
    if (!liveMarketsCache || Date.now() - liveMarketsCache.at > LIVE_MARKETS_CACHE_MS) {
      liveMarketsCache = { at: Date.now(), marketKeys: await getBetaMarketSlugs() };
    }
    res.set("Cache-Control", `public, max-age=${Math.floor(LIVE_MARKETS_CACHE_MS / 1000)}`);
    return res.json({ marketKeys: liveMarketsCache.marketKeys });
  } catch (err: any) {
    logger.error(`[live-markets] read failed: ${err?.code ?? err?.message ?? "unknown"}`);
    return res.json({ marketKeys: [] });
  }
});

/** Test seam: forget the cached live-markets answer. */
export function resetLiveMarketsCache(): void {
  liveMarketsCache = null;
}

async function requireAdminUser(req: any, res: any): Promise<{ id: string; role: string } | null> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const user = await getAdminRole(userId);
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return { id: userId, role: user.role };
}

async function launchMarket(res: any): Promise<string | null> {
  const market = await getLaunchMarketSlug();
  if (!market) res.status(503).json({ error: "No launch market is set (platform setting launch_market_slug)." });
  return market;
}

function actorOf(admin: { id: string; role: string }, req: any) {
  return { id: admin.id, role: admin.role, ipAddress: req.ip ?? null, userAgent: req.get("user-agent") ?? null };
}

function answer(res: any, err: any, what: string) {
  if (err instanceof TickerRefusal) return res.status(err.status).json({ error: err.message });
  logger.error(`[ticker] ${what} failed: ${err?.code ?? err?.message ?? "unknown"}`);
  return res.status(500).json({ error: "Could not save the ticker." });
}

router.get("/api/admin/ticker", isAuthenticated, async (req, res) => {
  const admin = await requireAdminUser(req, res);
  if (!admin) return;
  const market = await launchMarket(res);
  if (!market) return;
  res.set("Cache-Control", "no-store");
  res.json({ marketSlug: market, items: await adminTickerItems(market) });
});

router.post("/api/admin/ticker", isAuthenticated, async (req, res) => {
  const admin = await requireAdminUser(req, res);
  if (!admin) return;
  const parsed = tickerItemCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Check the line: text up to 90 characters, and only the fields this form sends." });
  const market = await launchMarket(res);
  if (!market) return;
  try {
    const id = await createTickerItem(market, parsed.data, actorOf(admin, req));
    return res.status(201).json({ id });
  } catch (err) {
    return answer(res, err, "create");
  }
});

// Declared before `/:id` so "order" is never read as an id.
router.put("/api/admin/ticker/order", isAuthenticated, async (req, res) => {
  const admin = await requireAdminUser(req, res);
  if (!admin) return;
  const parsed = tickerReorderSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Send the line ids in their new order." });
  const market = await launchMarket(res);
  if (!market) return;
  try {
    await reorderTickerItems(market, parsed.data.ids, actorOf(admin, req));
    return res.json({ ok: true });
  } catch (err) {
    return answer(res, err, "reorder");
  }
});

router.patch("/api/admin/ticker/:id", isAuthenticated, async (req, res) => {
  const admin = await requireAdminUser(req, res);
  if (!admin) return;
  const parsed = tickerItemPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Check the line: text up to 90 characters, and only the fields this form sends." });
  const market = await launchMarket(res);
  if (!market) return;
  try {
    await updateTickerItem(market, String(req.params.id), parsed.data, actorOf(admin, req));
    return res.json({ ok: true });
  } catch (err) {
    return answer(res, err, "update");
  }
});

export default router;
