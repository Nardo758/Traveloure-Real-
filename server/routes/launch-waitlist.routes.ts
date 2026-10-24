// LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the launch-market waitlist.
//
//   POST /api/waitlist               — public, rate-limited (strictRateLimiter), `.strict()` allowlist body (§19),
//                                      honeypot `homepage`. LW-2: an optional `market` — ONE operating-market key;
//                                      absent ⇒ the `launch_market_slug` setting; any other value ⇒ 400
//                                      UNKNOWN_MARKET. Always answers `{ ok: true }` — whether the address was
//                                      already on the list is never revealed. A provider row born for a live city
//                                      may send one apply invite (S-22); a repeat, a traveler, a city that is not
//                                      live, or a missing marketing footer enqueues nothing. EMAIL_SENDS_ENABLED
//                                      holds a queued invite instead of sending it. The join still stands.
//   GET  /api/admin/waitlist         — counts for one market (`?market=<key>|all`, default the launch market):
//                                      travelers (by trip type and source) and providers (by service type) apart,
//                                      never mixed; LW-2 `byMarket` gives every market's two totals. Admin only.
//   GET  /api/admin/waitlist/export  — CSV (`?market=<key>|all`, default the launch market;
//                                      `?role=traveler|provider`, else both; the `market_slug` column names each row's city).
//                                      Admin only; every export is audit-logged. QA rows (QA-domain addresses) are
//                                      left out unless `?includeQa=1` (LW-1e); every row carries `id` and `is_qa`.
//   GET  /api/admin/waitlist/search  — LW-1e: rows whose email contains `?email=` (at least 3 characters), every
//                                      market, newest first, capped. Admin only.
//   DELETE /api/admin/waitlist/:id   — LW-1e: hard-delete ONE row; its audit row (row id + sha256 of the email,
//                                      never the address) is written in the same transaction. Admin only.
//
// /api/admin/* is also behind the blanket requireAdmin guard (CLAUDE.md §2); the explicit DB-role checks here are
// the second layer, as on the other admin routes.
import { Router } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { strictRateLimiter } from "../infrastructure/rate-limiter";
import { getAdminRole, recordAdminAudit } from "../services/admin-query.service";
import { getLaunchMarketSlug } from "../services/platform-flags";
import {
  WAITLIST_CSV_COLUMNS, deleteWaitlistRow, joinWaitlist, searchWaitlistByEmail, waitlistCounts, waitlistExportRows,
} from "../services/launch-waitlist.service";
import {
  WAITLIST_EMAIL_ERROR, WAITLIST_SEARCH_MIN_CHARS, WAITLIST_UNKNOWN_MARKET, resolveWaitlistMarket, waitlistCityName,
  waitlistJoinBodySchema,
} from "@shared/launch-waitlist";
import { logger } from "../infrastructure/logger";
import { csvCell } from "../utils/csv";
import { resolveWaitlistReferral } from "../services/waitlist-referral.service";
import { notifyWaitlistProviderApply } from "../services/waitlist-apply-invite-email";

const router = Router();

router.post("/api/waitlist", strictRateLimiter, async (req, res) => {
  const raw = req.body ?? {};
  // Honeypot first: a filled hidden field is a bot. Answer exactly as a success would, and write nothing.
  if (typeof raw.homepage === "string" && raw.homepage.trim() !== "") return res.json({ ok: true });
  const parsed = waitlistJoinBodySchema.safeParse(raw);
  if (!parsed.success) return res.status(400).json({ error: WAITLIST_EMAIL_ERROR });
  const { homepage: _honeypot, ref, market, ...body } = parsed.data;
  try {
    const launchMarketSlug = await getLaunchMarketSlug();
    if (!launchMarketSlug) return res.status(503).json({ error: "The waitlist is not open right now." });
    const resolved = resolveWaitlistMarket(market, launchMarketSlug);
    if (!resolved.ok) return res.status(400).json({ error: "Please choose a city from the list.", code: WAITLIST_UNKNOWN_MARKET });
    const marketSlug = resolved.market;
    // LW-1d: credit comes only from the short link the visitor arrived through, resolved here from its raw code; a
    // refusal (made-up, expired, someone else's trip, the visitor's own link) is logged and the sign-up goes on.
    const referral = await resolveWaitlistReferral({ ref: ref ?? null, viewerUserId: getUserId(req) ?? null });
    const credit = referral.credited
      ? { referrerUserId: referral.referrerUserId, shortLinkCode: referral.shortLinkCode }
      : null;
    const { inserted } = await joinWaitlist(body, marketSlug, credit);
    await notifyWaitlistProviderApply({
      inserted,
      role: body.role ?? "traveler",
      marketSlug,
      email: body.email,
      contactName: body.contactName ?? null,
      businessName: body.businessName ?? null,
      serviceType: body.serviceType ?? null,
    });
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

/**
 * LW-2: the admin market filter. Absent ⇒ the launch market (the behavior before LW-2); `all` ⇒ every market
 * (null); an operating-market key ⇒ that market; anything else ⇒ undefined (the route answers 400).
 */
async function adminMarketFilter(raw: unknown): Promise<string | null | undefined> {
  if (raw === undefined || raw === "") return getLaunchMarketSlug();
  if (raw === "all") return null;
  return typeof raw === "string" && waitlistCityName(raw) ? raw : undefined;
}

router.get("/api/admin/waitlist", isAuthenticated, async (req, res) => {
  const admin = await requireAdminUser(req, res);
  if (!admin) return;
  const marketSlug = await adminMarketFilter(req.query.market);
  if (marketSlug === undefined) return res.status(400).json({ error: "Unknown market", code: WAITLIST_UNKNOWN_MARKET });
  res.json(await waitlistCounts(marketSlug));
});

router.get("/api/admin/waitlist/export", isAuthenticated, async (req, res) => {
  const admin = await requireAdminUser(req, res);
  if (!admin) return;
  const marketSlug = await adminMarketFilter(req.query.market);
  if (marketSlug === undefined) return res.status(400).json({ error: "Unknown market", code: WAITLIST_UNKNOWN_MARKET });
  const roleParam = req.query.role;
  const role = roleParam === "traveler" || roleParam === "provider" ? roleParam : null;
  const includeQa = req.query.includeQa === "1";
  const rows = await waitlistExportRows(marketSlug, role, { includeQa });
  await recordAdminAudit({
    actorId: admin.id,
    actorRole: admin.role,
    action: "waitlist_export",
    resourceType: "launch_waitlist",
    resourceId: marketSlug ?? "all",
    metadata: { rows: rows.length, role: role ?? "all", includeQa },
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

router.get("/api/admin/waitlist/search", isAuthenticated, async (req, res) => {
  const admin = await requireAdminUser(req, res);
  if (!admin) return;
  const q = typeof req.query.email === "string" ? req.query.email.trim() : "";
  if (q.length < WAITLIST_SEARCH_MIN_CHARS || q.length > 254) {
    return res.status(400).json({ error: `Enter at least ${WAITLIST_SEARCH_MIN_CHARS} characters of an email address.` });
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ rows: await searchWaitlistByEmail(q) });
});

router.delete("/api/admin/waitlist/:id", isAuthenticated, async (req, res) => {
  const admin = await requireAdminUser(req, res);
  if (!admin) return;
  const id = String(req.params.id ?? "");
  if (!/^[0-9a-f-]{1,64}$/i.test(id)) return res.status(404).json({ error: "Not found" });
  try {
    const deleted = await deleteWaitlistRow(id, {
      id: admin.id,
      role: admin.role,
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    if (!deleted) return res.status(404).json({ error: "Not found" });
    return res.json({ deleted: true });
  } catch (err: any) {
    // The delete and its audit row are one transaction: a failure leaves the row in place. Never log the address.
    logger.error(`[waitlist] delete failed: ${err?.code ?? err?.message ?? "unknown"}`);
    return res.status(500).json({ error: "Could not delete the row." });
  }
});

export default router;
