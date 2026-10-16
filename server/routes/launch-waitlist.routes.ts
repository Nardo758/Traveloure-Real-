// LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the launch-market waitlist.
//
//   POST /api/waitlist               — public, rate-limited (strictRateLimiter), `.strict()` allowlist body (§19),
//                                      honeypot `homepage`. The market is the `launch_market_slug` setting, never
//                                      the body. Always answers `{ ok: true }` — whether the address was already
//                                      on the list is never revealed. No email is sent (Launch ruling 1).
//   GET  /api/admin/waitlist         — counts for the launch market: travelers (by trip type and source) and
//                                      providers (by service type) apart, never mixed. Admin only.
//   GET  /api/admin/waitlist/export  — CSV of the launch market's list (`?role=traveler|provider`, else both).
//                                      Admin only; every export is audit-logged.
//
// /api/admin/* is also behind the blanket requireAdmin guard (CLAUDE.md §2); the explicit DB-role checks here are
// the second layer, as on the other admin routes.
import { Router } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { strictRateLimiter } from "../infrastructure/rate-limiter";
import { getAdminRole, recordAdminAudit } from "../services/admin-query.service";
import { getLaunchMarketSlug } from "../services/platform-flags";
import { WAITLIST_CSV_COLUMNS, joinWaitlist, waitlistCounts, waitlistExportRows } from "../services/launch-waitlist.service";
import { WAITLIST_EMAIL_ERROR, waitlistJoinBodySchema } from "@shared/launch-waitlist";
import { logger } from "../infrastructure/logger";
import { csvCell } from "../utils/csv";
import { resolveWaitlistReferral } from "../services/waitlist-referral.service";

const router = Router();

router.post("/api/waitlist", strictRateLimiter, async (req, res) => {
  const raw = req.body ?? {};
  // Honeypot first: a filled hidden field is a bot. Answer exactly as a success would, and write nothing.
  if (typeof raw.homepage === "string" && raw.homepage.trim() !== "") return res.json({ ok: true });
  const parsed = waitlistJoinBodySchema.safeParse(raw);
  if (!parsed.success) return res.status(400).json({ error: WAITLIST_EMAIL_ERROR });
  const { homepage: _honeypot, ref, ...body } = parsed.data;
  try {
    const marketSlug = await getLaunchMarketSlug();
    if (!marketSlug) return res.status(503).json({ error: "The waitlist is not open right now." });
    // LW-1d: credit comes only from the short link the visitor arrived through, resolved here from its raw code; a
    // refusal (made-up, expired, someone else's trip, the visitor's own link) is logged and the sign-up goes on.
    const referral = await resolveWaitlistReferral({ ref: ref ?? null, viewerUserId: getUserId(req) ?? null });
    const credit = referral.credited
      ? { referrerUserId: referral.referrerUserId, shortLinkCode: referral.shortLinkCode }
      : null;
    await joinWaitlist(body, marketSlug, credit);
    return res.json({ ok: true });
  } catch (err: any) {
    // Never log the address (no email in logs).
    logger.error(`[waitlist] join failed: ${err?.code ?? err?.message ?? "unknown"}`);
    return res.status(500).json({ error: "Could not join the waitlist. Please try again." });
  }
});

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

router.get("/api/admin/waitlist", isAuthenticated, async (req, res) => {
  const admin = await requireAdminUser(req, res);
  if (!admin) return;
  const marketSlug = await getLaunchMarketSlug();
  res.json(await waitlistCounts(marketSlug));
});

router.get("/api/admin/waitlist/export", isAuthenticated, async (req, res) => {
  const admin = await requireAdminUser(req, res);
  if (!admin) return;
  const marketSlug = await getLaunchMarketSlug();
  const roleParam = req.query.role;
  const role = roleParam === "traveler" || roleParam === "provider" ? roleParam : null;
  const rows = await waitlistExportRows(marketSlug, role);
  await recordAdminAudit({
    actorId: admin.id,
    actorRole: admin.role,
    action: "waitlist_export",
    resourceType: "launch_waitlist",
    resourceId: marketSlug ?? "all",
    metadata: { rows: rows.length, role: role ?? "all" },
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  });
  const lines = [
    WAITLIST_CSV_COLUMNS.join(","),
    ...rows.map((r: any) => WAITLIST_CSV_COLUMNS.map((c) => csvCell(r[c])).join(",")),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="waitlist-${marketSlug ?? "all"}-${role ?? "all"}.csv"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(lines.join("\n"));
});

export default router;
