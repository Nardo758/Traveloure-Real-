/**
 * BOT-1 Phase 1 — the admin side of the bot channel (ledger `2026-10-15-bot1-phase1`). Every path is under
 * /api/admin, so the blanket `adminApiGuard` (CLAUDE.md §2) decides who reaches it. Decision C: any admin may approve;
 * `verified_by` records who. Every action writes an admin audit row naming the actor and its role.
 *
 * Slice 0 (Addendum A v2): bot keys — create, scope, revoke — are owner-only (the guard's owner-only map) and audited
 * as bot_key.create / .scope / .revoke, the scope list in metadata and never the token. Proposals are market-scoped:
 * a regional manager sees and decides rows in its assigned markets (one 404 outside), a moderator reads the drafts
 * assigned to it, and owner / platform_admin see everything. Each row carries "proposed by {bot}" (admin-only).
 */
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { getFullAdminUser, recordAdminAudit } from "../services/admin-query.service";
import { actorMarketScope, scopeCovers, staffMayActOn, type StaffActor } from "../services/staff-scope";
import { listBotAudit } from "../services/bot-audit.service";
import {
  approveBotProposal,
  assignBotProposal,
  createBotAccount,
  getBotProposalMarket,
  setBotScopes,
  listBotAccounts,
  listBotProposalsForReview,
  rejectBotProposal,
  revokeBotAccount,
} from "../services/bot-proposals.service";
import { BOT_PROPOSAL_STATUSES } from "@shared/bot-proposals";
import { approveRefreshFact, listRefreshFactsForReview } from "../services/fact-review.service";

const router = Router();

/** The guard's DB read of the actor (server/routes.ts `req.staffActor`); never the session's claims. */
function actorOf(req: any): StaffActor {
  return req.staffActor ?? { id: getUserId(req)!, role: null };
}

const audit = (req: any, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown>) =>
  recordAdminAudit({
    actorId: getUserId(req)!,
    actorRole: actorOf(req).role ?? "unknown",
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
    const warning = await audit(req, "bot_key.create", "bot_account", out.bot.id, { name: out.bot.name, scopes: out.bot.scopes });
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
    const warning = await audit(req, "bot_key.revoke", "bot_account", String(req.params.id), {});
    res.json({ ok: true, ...(warning ? { auditWarning: warning } : {}) });
  } catch (err) {
    console.error("[admin bot-accounts revoke]", err);
    res.status(500).json({ error: "Could not revoke the bot" });
  }
});

// Slice 0: scope a live bot key (owner-only at the guard). `.strict()` — the scope list and nothing else.
const scopesBody = z.object({ scopes: z.array(z.string()).min(1).max(20) }).strict();

router.patch("/api/admin/bot-accounts/:id/scopes", isAuthenticated, async (req: any, res) => {
  const parsed = scopesBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid body", code: "bad_body" });
  try {
    const out = await setBotScopes(String(req.params.id), parsed.data.scopes);
    if (!out.ok) return res.status(out.reason === "not_found" ? 404 : 400).json({ error: "Scopes not set", code: out.reason });
    const warning = await audit(req, "bot_key.scope", "bot_account", String(req.params.id), { scopes: out.scopes });
    res.json({ ok: true, scopes: out.scopes, ...(warning ? { auditWarning: warning } : {}) });
  } catch (err) {
    console.error("[admin bot-accounts scopes]", err);
    res.status(500).json({ error: "Could not set the scopes" });
  }
});

router.get("/api/admin/bot-proposals", isAuthenticated, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  if (!(BOT_PROPOSAL_STATUSES as readonly string[]).includes(status)) return res.status(400).json({ error: "Unknown status" });
  try {
    const actor = actorOf(req);
    // Slice 0: a moderator reads the drafts assigned to it; every other role reads its market scope.
    const scope = actor.role === "moderator"
      ? { markets: [] as string[], assignedTo: actor.id }
      : { markets: await actorMarketScope(actor) };
    res.json(await listBotProposalsForReview(status, scope));
  } catch (err) {
    console.error("[admin bot-proposals]", err);
    res.status(500).json({ error: "Could not list proposals" });
  }
});

// CS-1 item 3: the reviewer's expiry — required for a safety fact (last admission), optional for hours. Nothing else.
const approveBody = z.object({ expiresAt: z.string().trim().min(1).max(40).optional() }).strict();
const EXPIRY_REFUSALS = new Set(["expiry_required", "expiry_invalid", "expiry_past", "expiry_after_limit"]);

/** Slice 0: outside the actor's markets a proposal does not exist for them (one 404, LD 40). */
async function proposalInScope(req: any, id: string): Promise<boolean> {
  const p = await getBotProposalMarket(id);
  return p.found && (await staffMayActOn(actorOf(req), p.market));
}

router.post("/api/admin/bot-proposals/:id/approve", isAuthenticated, async (req: any, res) => {
  const parsed = approveBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Approve takes only an expiry date", code: "bad_body" });
  try {
    if (!(await proposalInScope(req, String(req.params.id)))) return res.status(404).json({ error: "Not approved", code: "not_found" });
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
    if (!(await proposalInScope(req, String(req.params.id)))) return res.status(404).json({ error: "Not rejected", code: "not_found" });
    const out = await rejectBotProposal(String(req.params.id), getUserId(req)!, parsed.data.reason);
    if (!out.ok) return res.status(out.reason === "not_found" ? 404 : 409).json({ error: "Not rejected", code: out.reason });
    const warning = await audit(req, "bot_proposal_reject", "bot_proposal", String(req.params.id), { reason: parsed.data.reason });
    res.json({ ok: true, ...(warning ? { auditWarning: warning } : {}) });
  } catch (err) {
    console.error("[admin bot-proposals reject]", err);
    res.status(500).json({ error: "Could not reject the proposal" });
  }
});

// Slice 0: assign a pending draft to a moderator, or clear the assignment (null). owner / platform_admin / an in-scope
// regional manager (the guard's map); the assignee must be a moderator who holds the proposal's market. Audited.
const assignBody = z.object({ userId: z.string().trim().min(1).max(100).nullable() }).strict();

router.post("/api/admin/bot-proposals/:id/assign", isAuthenticated, async (req: any, res) => {
  const parsed = assignBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid body", code: "bad_body" });
  const id = String(req.params.id);
  try {
    const p = await getBotProposalMarket(id);
    if (!p.found || !(await staffMayActOn(actorOf(req), p.market))) return res.status(404).json({ error: "Not found", code: "not_found" });
    const assignee = parsed.data.userId;
    if (assignee) {
      const target = await getFullAdminUser(assignee);
      if (!target || target.role !== "moderator") return res.status(400).json({ error: "Only a moderator can be assigned", code: "not_a_moderator" });
      if (!scopeCovers(await actorMarketScope({ id: target.id, role: target.role }), p.market)) {
        return res.status(400).json({ error: "That moderator does not hold this market", code: "out_of_scope" });
      }
    }
    const out = await assignBotProposal(id, assignee);
    if (!out.ok) return res.status(409).json({ error: "Not assigned", code: "not_pending" });
    const warning = await audit(req, "bot_proposal.assign", "bot_proposal", id, { assignedTo: assignee });
    res.json({ ok: true, assignedTo: assignee, ...(warning ? { auditWarning: warning } : {}) });
  } catch (err) {
    console.error("[admin bot-proposals assign]", err);
    res.status(500).json({ error: "Could not assign the proposal" });
  }
});

// Slice 0: the bot audit log, filterable by bot (owner, platform_admin, support — read only).
router.get("/api/admin/bot-audit", isAuthenticated, async (req, res) => {
  const botId = typeof req.query.botId === "string" && req.query.botId.trim() ? req.query.botId.trim() : null;
  try {
    res.json({ rows: await listBotAudit({ botId, limit: Number(req.query.limit) || 100 }) });
  } catch (err) {
    console.error("[admin bot-audit]", err);
    res.status(500).json({ error: "Could not read the bot audit log" });
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
