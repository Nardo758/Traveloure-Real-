/**
 * BOT-1 Phase 1 — the admin side of the bot channel (ledger `2026-10-15-bot1-phase1`). Every path is under
 * /api/admin, so the blanket `adminApiGuard` (CLAUDE.md §2) admits admins only. Decision C: any admin may approve;
 * `verified_by` records who. Every action writes an admin audit row naming the admin.
 */
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { recordAdminAudit } from "../services/admin-query.service";
import {
  approveBotProposal,
  createBotAccount,
  listBotAccounts,
  listBotProposalsForReview,
  rejectBotProposal,
  revokeBotAccount,
} from "../services/bot-proposals.service";
import { BOT_PROPOSAL_STATUSES } from "@shared/bot-proposals";
import { approveRefreshFact, listRefreshFactsForReview } from "../services/fact-review.service";

const router = Router();

const audit = (req: any, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown>) =>
  recordAdminAudit({
    actorId: getUserId(req)!,
    actorRole: "admin",
    action,
    resourceType,
    resourceId,
    metadata,
    ipAddress: req.ip ?? null,
    userAgent: req.get?.("user-agent") ?? null,
  });

router.get("/api/admin/bot-accounts", isAuthenticated, async (_req, res) => {
  try {
    res.json(await listBotAccounts());
  } catch (err) {
    console.error("[admin bot-accounts]", err);
    res.status(500).json({ error: "Could not list bots" });
  }
});

const createBody = z.object({ name: z.string(), scopes: z.array(z.string()), expiresAt: z.string().optional() }).strict();

router.post("/api/admin/bot-accounts", isAuthenticated, async (req: any, res) => {
  const parsed = createBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid body", code: "bad_body" });
  try {
    const out = await createBotAccount({ ...parsed.data, createdBy: getUserId(req)! });
    if (!out.ok) return res.status(400).json({ error: "Bot not created", code: out.reason });
    const warning = await audit(req, "bot_account_create", "bot_account", out.bot.id, { name: out.bot.name, scopes: out.bot.scopes });
    // The token is in this one response and nowhere else — never logged, never stored.
    res.status(201).json({ bot: out.bot, token: out.token, ...(warning ? { auditWarning: warning } : {}) });
  } catch (err) {
    console.error("[admin bot-accounts create]", err);
    res.status(500).json({ error: "Could not create the bot" });
  }
});

router.post("/api/admin/bot-accounts/:id/revoke", isAuthenticated, async (req: any, res) => {
  try {
    const out = await revokeBotAccount(String(req.params.id));
    if (!out.revoked) return res.status(404).json({ error: "No live bot with that id" });
    const warning = await audit(req, "bot_account_revoke", "bot_account", String(req.params.id), {});
    res.json({ ok: true, ...(warning ? { auditWarning: warning } : {}) });
  } catch (err) {
    console.error("[admin bot-accounts revoke]", err);
    res.status(500).json({ error: "Could not revoke the bot" });
  }
});

router.get("/api/admin/bot-proposals", isAuthenticated, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  if (!(BOT_PROPOSAL_STATUSES as readonly string[]).includes(status)) return res.status(400).json({ error: "Unknown status" });
  try {
    res.json(await listBotProposalsForReview(status));
  } catch (err) {
    console.error("[admin bot-proposals]", err);
    res.status(500).json({ error: "Could not list proposals" });
  }
});

// CS-1 item 3: the reviewer's expiry — required for a safety fact (last admission), optional for hours. Nothing else.
const approveBody = z.object({ expiresAt: z.string().trim().min(1).max(40).optional() }).strict();
const EXPIRY_REFUSALS = new Set(["expiry_required", "expiry_invalid", "expiry_past", "expiry_after_limit"]);

router.post("/api/admin/bot-proposals/:id/approve", isAuthenticated, async (req: any, res) => {
  const parsed = approveBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Approve takes only an expiry date", code: "bad_body" });
  try {
    const out = await approveBotProposal(String(req.params.id), getUserId(req)!, new Date(), { expiresAt: parsed.data.expiresAt });
    if (!out.ok) {
      const status = out.reason === "not_found" ? 404 : EXPIRY_REFUSALS.has(out.reason) ? 400 : 409;
      return res.status(status).json({ error: "Not approved", code: out.reason });
    }
    const warning = await audit(req, "bot_proposal_approve", "bot_proposal", String(req.params.id), { factId: out.factId, expiresAt: parsed.data.expiresAt ?? null });
    res.json({ ok: true, factId: out.factId, ...(warning ? { auditWarning: warning } : {}) });
  } catch (err) {
    console.error("[admin bot-proposals approve]", err);
    res.status(500).json({ error: "Could not approve the proposal" });
  }
});

const rejectBody = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

router.post("/api/admin/bot-proposals/:id/reject", isAuthenticated, async (req: any, res) => {
  const parsed = rejectBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "A reason is required", code: "reason_required" });
  try {
    const out = await rejectBotProposal(String(req.params.id), getUserId(req)!, parsed.data.reason);
    if (!out.ok) return res.status(out.reason === "not_found" ? 404 : 409).json({ error: "Not rejected", code: out.reason });
    const warning = await audit(req, "bot_proposal_reject", "bot_proposal", String(req.params.id), { reason: parsed.data.reason });
    res.json({ ok: true, ...(warning ? { auditWarning: warning } : {}) });
  } catch (err) {
    console.error("[admin bot-proposals reject]", err);
    res.status(500).json({ error: "Could not reject the proposal" });
  }
});

// CS-1 item 3: the official refresh's dated facts wait here for a person's review before any reader shows them.
router.get("/api/admin/bot-proposals/refresh-facts", isAuthenticated, async (_req, res) => {
  try {
    res.json(await listRefreshFactsForReview());
  } catch (err) {
    console.error("[admin refresh-facts]", err);
    res.status(500).json({ error: "Could not list refresh facts" });
  }
});

router.post("/api/admin/bot-proposals/refresh-facts/:id/approve", isAuthenticated, async (req: any, res) => {
  const parsed = approveBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Approve takes only an expiry date", code: "bad_body" });
  try {
    const out = await approveRefreshFact(String(req.params.id), getUserId(req)!, { expiresAt: parsed.data.expiresAt });
    if (!out.ok) {
      const status = out.reason === "not_found" ? 404 : EXPIRY_REFUSALS.has(out.reason) ? 400 : 409;
      return res.status(status).json({ error: "Not approved", code: out.reason });
    }
    const warning = await audit(req, "refresh_fact_approve", "place_fact", String(req.params.id), { factId: out.factId, expiresAt: parsed.data.expiresAt ?? null });
    res.json({ ok: true, factId: out.factId, ...(warning ? { auditWarning: warning } : {}) });
  } catch (err) {
    console.error("[admin refresh-facts approve]", err);
    res.status(500).json({ error: "Could not approve the fact" });
  }
});

export default router;
