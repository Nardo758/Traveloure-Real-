/**
 * Slice 0 (Addendum A v2) — staff roles, market grants, the owner sign-off queue and the per-market issue queue.
 *
 * Every path is under /api/admin, so the blanket `adminApiGuard` decides who reaches it (shared/staff-permissions.ts):
 *   GET  /api/admin/staff/me              any staff role — its own role and markets
 *   GET  /api/admin/staff                 owner, platform_admin — staff accounts and their markets
 *   POST /api/admin/staff/:userId/role    OWNER ONLY — grant a staff role (never owner, never an earner role)
 *   POST /api/admin/staff/:userId/markets OWNER ONLY — grant or revoke one market
 *   GET  /api/admin/owner-signoff         owner, platform_admin — approvals waiting for the owner (derived)
 *   GET  /api/admin/issue-queue           owner, platform_admin, regional_manager (its markets only)
 * Every grant and revoke writes access_audit_logs with actorRole = the actor's role. Bodies are `.strict()` (§19).
 */
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { staffMarketAssignments } from "@shared/schema";
import { GRANTABLE_STAFF_ROLES, STAFF_ROLES, canonicalStaffRole, isOwnerRole } from "@shared/roles";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { recordAdminAudit } from "../services/admin-query.service";
import { actorMarketScope, assignedMarkets, isOperatingMarketKey, type StaffActor } from "../services/staff-scope";
import { listOwnerSignoffQueue, readProviderSignoffSetting } from "../services/staff-signoff.service";
import { listIssueQueue } from "../services/issue-queue.service";

const router = Router();

function actorOf(req: any): StaffActor {
  return req.staffActor ?? { id: getUserId(req)!, role: null };
}

const audit = (req: any, action: string, resourceType: string, resourceId: string, targetUserId: string | null, metadata: Record<string, unknown>) =>
  recordAdminAudit({
    actorId: getUserId(req)!,
    actorRole: actorOf(req).role ?? "unknown",
    action,
    resourceType,
    resourceId,
    targetUserId,
    metadata,
    ipAddress: req.ip ?? null,
    userAgent: req.get?.("user-agent") ?? null,
  });

router.get("/api/admin/staff/me", isAuthenticated, async (req, res) => {
  const actor = actorOf(req);
  try {
    const scope = await actorMarketScope(actor);
    res.json({ role: actor.role ?? null, canonicalRole: canonicalStaffRole(actor.role), markets: scope });
  } catch (err) {
    console.error("[admin staff me]", err);
    res.status(500).json({ error: "Could not read your staff scope" });
  }
});

router.get("/api/admin/staff", isAuthenticated, async (_req, res) => {
  try {
    const rows = await db
      .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: users.role })
      .from(users)
      .where(inArray(users.role, [...STAFF_ROLES]));
    const out = [];
    for (const r of rows) out.push({ ...r, canonicalRole: canonicalStaffRole(r.role), markets: await assignedMarkets(r.id) });
    res.json({ staff: out });
  } catch (err) {
    console.error("[admin staff list]", err);
    res.status(500).json({ error: "Could not list staff" });
  }
});

const roleBody = z.object({ role: z.enum(GRANTABLE_STAFF_ROLES) }).strict();

router.post("/api/admin/staff/:userId/role", isAuthenticated, async (req: any, res) => {
  // Belt-and-braces: the guard already refuses this path to everyone but the owner.
  if (!isOwnerRole(actorOf(req).role)) return res.status(403).json({ error: "Owner only" });
  const parsed = roleBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "role must be one of " + GRANTABLE_STAFF_ROLES.join(", "), code: "bad_role" });
  const targetId = String(req.params.userId);
  if (targetId === actorOf(req).id) return res.status(400).json({ error: "The owner's own role is not changed here", code: "self" });
  try {
    const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, targetId)).limit(1);
    if (!target) return res.status(404).json({ error: "Not found" });
    if (isOwnerRole(target.role)) return res.status(400).json({ error: "The owner's role is not changed here", code: "target_owner" });
    const [updated] = await db
      .update(users)
      .set({ role: parsed.data.role, updatedAt: new Date() } as any)
      .where(and(eq(users.id, targetId), eq(users.role, target.role as string)))
      .returning({ id: users.id });
    if (!updated) return res.status(409).json({ error: "The role changed while you were saving", code: "conflict" });
    const warning = await audit(req, "staff.role_grant", "user", targetId, targetId, { oldRole: target.role, newRole: parsed.data.role });
    res.json({ ok: true, role: parsed.data.role, ...(warning ? { auditWarning: warning } : {}) });
  } catch (err) {
    console.error("[admin staff role]", err);
    res.status(500).json({ error: "Could not change the role" });
  }
});

const marketBody = z.object({ marketSlug: z.string().trim().min(1).max(64), revoke: z.boolean().optional() }).strict();

router.post("/api/admin/staff/:userId/markets", isAuthenticated, async (req: any, res) => {
  if (!isOwnerRole(actorOf(req).role)) return res.status(403).json({ error: "Owner only" });
  const parsed = marketBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid body", code: "bad_body" });
  const { marketSlug, revoke } = parsed.data;
  if (!isOperatingMarketKey(marketSlug)) return res.status(400).json({ error: "Unknown market", code: "unknown_market" });
  const targetId = String(req.params.userId);
  try {
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1);
    if (!target) return res.status(404).json({ error: "Not found" });
    if (revoke) {
      const rows = await db
        .update(staffMarketAssignments)
        .set({ revokedAt: new Date(), revokedBy: actorOf(req).id } as any)
        .where(and(eq(staffMarketAssignments.userId, targetId), eq(staffMarketAssignments.marketSlug, marketSlug), isNull(staffMarketAssignments.revokedAt)))
        .returning({ id: staffMarketAssignments.id });
      if (rows.length === 0) return res.json({ ok: true, changed: false, markets: await assignedMarkets(targetId) });
      const warning = await audit(req, "staff.market_revoke", "user", targetId, targetId, { marketSlug });
      return res.json({ ok: true, changed: true, markets: await assignedMarkets(targetId), ...(warning ? { auditWarning: warning } : {}) });
    }
    // The partial UNIQUE (user, market) WHERE revoked_at IS NULL makes a repeat grant a no-op, never a second row.
    const rows = await db
      .insert(staffMarketAssignments)
      .values({ id: randomUUID(), userId: targetId, marketSlug, grantedBy: actorOf(req).id } as any)
      .onConflictDoNothing()
      .returning({ id: staffMarketAssignments.id });
    if (rows.length === 0) return res.json({ ok: true, changed: false, markets: await assignedMarkets(targetId) });
    const warning = await audit(req, "staff.market_grant", "user", targetId, targetId, { marketSlug });
    res.json({ ok: true, changed: true, markets: await assignedMarkets(targetId), ...(warning ? { auditWarning: warning } : {}) });
  } catch (err) {
    console.error("[admin staff markets]", err);
    res.status(500).json({ error: "Could not change the markets" });
  }
});

router.get("/api/admin/owner-signoff", isAuthenticated, async (_req, res) => {
  try {
    res.json({ setting: await readProviderSignoffSetting(), items: await listOwnerSignoffQueue() });
  } catch (err) {
    console.error("[admin owner-signoff]", err);
    res.status(500).json({ error: "Could not read the sign-off queue" });
  }
});

router.get("/api/admin/issue-queue", isAuthenticated, async (req, res) => {
  try {
    const scope = await actorMarketScope(actorOf(req));
    res.json({ scope, items: await listIssueQueue(scope) });
  } catch (err) {
    console.error("[admin issue-queue]", err);
    res.status(500).json({ error: "Could not read the issue queue" });
  }
});

export default router;
