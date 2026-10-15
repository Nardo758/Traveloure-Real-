/**
 * BOT-1 Phase 1 — the bot surface, /api/bot/* (decision-maker, Oct 15, 2026: ruling 1; ledger
 * `2026-10-15-bot1-phase1`). OUTSIDE /api/admin, so `adminApiGuard` never sees it; its own limiter is mounted in
 * server/index.ts (`botLimiter`, keyed by token) and the general /api limit still applies.
 *
 *   · OFF unless `BOT_API_ENABLED=1`: every path answers 404, so the surface is not visible.
 *   · `requireBotToken`: a Bearer token, matched by its SHA-256 and compared in constant time; revoked, expired or
 *     unknown ⇒ 401; a scope the route does not name ⇒ 403. The router checks the maintenance flag itself (503).
 *   · Every response names no plan id, no traveler's item id, no email, no booking and no user id.
 *   · Each request stamps the bot's `last_used_at` and writes one log line naming the bot. The admin audit log's
 *     `actor_id` must be a `users` row and a bot is not one, so bot requests are not written there; the admin's own
 *     actions on bots and proposals are (bot-admin.routes.ts).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { logger } from "../infrastructure/logger";
import { getPlatformFlag, FLAG_MAINTENANCE_MODE } from "../services/platform-flags";
import {
  authenticateBotToken,
  botCoverageNeeds,
  botOverdueFacts,
  fileBotProposal,
  getBotProposal,
  touchBotLastUsed,
} from "../services/bot-proposals.service";
import { BOT_API_FLAG_ENV, tokenHasScope, type BotScope } from "@shared/bot-proposals";

const router = Router();

export function botApiEnabled(): boolean {
  return process.env[BOT_API_FLAG_ENV] === "1";
}

// The surface gate, first in every route's chain (a per-route middleware, so the mutation-auth extractor resolves
// each route): off ⇒ one 404; maintenance ⇒ 503 — checked here because the platform gate is not this router's.
async function botSurfaceGate(req: Request, res: Response, next: NextFunction) {
  if (!botApiEnabled()) return res.status(404).json({ error: "Not found" });
  try {
    if (await getPlatformFlag(FLAG_MAINTENANCE_MODE, false)) {
      return res.status(503).json({ maintenance: true, message: "The platform is temporarily down for maintenance." });
    }
  } catch {
    // The flag read failing must not take the surface down (the platform gate fails open the same way).
  }
  next();
}

function requireBotToken(scope: BotScope) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ""));
    const bot = await authenticateBotToken(m?.[1] ?? null);
    if (!bot) return res.status(401).json({ error: "Unauthorized" });
    if (!tokenHasScope(bot.scopes, scope)) return res.status(403).json({ error: "Forbidden", scope });
    (req as any).bot = { id: bot.id, name: bot.name };
    void touchBotLastUsed(bot.id);
    logger.info({ bot: bot.name, botId: bot.id, method: req.method, path: req.path }, "[bot] request");
    next();
  };
}

router.get("/api/bot/coverage/needs", botSurfaceGate, requireBotToken("coverage:read"), async (req, res) => {
  const market = typeof req.query.market === "string" ? req.query.market.trim().toLowerCase() : "";
  if (!/^[a-z0-9-]{2,64}$/.test(market)) return res.status(400).json({ error: "market is required" });
  try {
    res.json(await botCoverageNeeds(market));
  } catch (err) {
    console.error("[bot coverage]", err);
    res.status(500).json({ error: "Could not read coverage" });
  }
});

router.get("/api/bot/facts/overdue", botSurfaceGate, requireBotToken("facts:read"), async (_req, res) => {
  try {
    res.json(await botOverdueFacts());
  } catch (err) {
    console.error("[bot facts overdue]", err);
    res.status(500).json({ error: "Could not read facts" });
  }
});

// §19: a pick, `.strict()` — an unknown key is refused, never stripped.
const proposalBody = z
  .object({
    kind: z.string(),
    placeId: z.string(),
    market: z.string().optional(),
    sourceId: z.string(),
    sourceUrl: z.string(),
    checkedAt: z.string(),
    text: z.string(),
    quote: z.string(),
    fields: z.record(z.unknown()),
  })
  .strict();

router.post("/api/bot/proposals", botSurfaceGate, requireBotToken("proposals:write"), async (req, res) => {
  const parsed = proposalBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid body", code: "bad_body" });
  try {
    const out = await fileBotProposal((req as any).bot, parsed.data);
    if (!out.ok) return res.status(422).json({ error: "Proposal refused", code: out.reason });
    res.status(out.duplicate ? 200 : 201).json({ proposal: out.proposal, duplicate: out.duplicate });
  } catch (err) {
    console.error("[bot proposals]", err);
    res.status(500).json({ error: "Could not file the proposal" });
  }
});

router.get("/api/bot/proposals/:id", botSurfaceGate, requireBotToken("proposals:read"), async (req, res) => {
  try {
    const p = await getBotProposal((req as any).bot.id, String(req.params.id));
    if (!p) return res.status(404).json({ error: "Not found" });
    res.json({ proposal: p });
  } catch (err) {
    console.error("[bot proposal read]", err);
    res.status(500).json({ error: "Could not read the proposal" });
  }
});

export default router;
