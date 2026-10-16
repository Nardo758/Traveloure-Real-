// LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the launch-market waitlist.
//
//   POST /api/waitlist               — public, rate-limited (strictRateLimiter), `.strict()` allowlist body (§19),
//                                      honeypot `website`. The market is the `launch_market_slug` setting, never
//                                      the body. Always answers `{ ok: true }` — whether the address was already
//                                      on the list is never revealed. No email is sent (Launch ruling 1).
//   GET  /api/admin/waitlist         — counts (total, consented, by source) for the launch market. Admin only.
//   GET  /api/admin/waitlist/export  — CSV of the launch market's list. Admin only; every export is audit-logged.
//
// /api/admin/* is also behind the blanket requireAdmin guard (CLAUDE.md §2); the explicit DB-role checks here are
// the second layer, as on the other admin routes.
import { Router } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { strictRateLimiter } from "../infrastructure/rate-limiter";
import { getAdminRole, recordAdminAudit } from "../services/admin-query.service";
import { getLaunchMarketSlug } from "../services/platform-flags";
import { joinWaitlist, waitlistCounts, waitlistExportRows } from "../services/launch-waitlist.service";
import { waitlistJoinBodySchema } from "@shared/launch-waitlist";
import { logger } from "../infrastructure/logger";

const router = Router();

router.post("/api/waitlist", strictRateLimiter, async (req, res) => {
  const parsed = waitlistJoinBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Please enter a valid email address." });
  const body = parsed.data;
  // Honeypot: a filled hidden field is a bot. Answer exactly as a success would, and write nothing.
  if (body.website && body.website.trim() !== "") return res.json({ ok: true });
  try {
    const marketSlug = await getLaunchMarketSlug();
    if (!marketSlug) return res.status(503).json({ error: "The waitlist is not open right now." });
    await joinWaitlist({
      email: body.email,
      marketSlug,
      source: body.source,
      sourceRef: body.sourceRef,
      consent: body.consent,
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

router.get("/api/admin/waitlist", isAuthenticated, async (req, res) => {
  const admin = await requireAdminUser(req, res);
  if (!admin) return;
  const marketSlug = await getLaunchMarketSlug();
  res.json(await waitlistCounts(marketSlug));
});

/** RFC 4180 quoting plus formula neutralisation (the vendor-export posture). */
function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const WAITLIST_CSV_COLUMNS = [
  "email",
  "market_slug",
  "source",
  "source_ref",
  "consent_at",
  "consent_version",
  "created_at",
  "updated_at",
] as const;

router.get("/api/admin/waitlist/export", isAuthenticated, async (req, res) => {
  const admin = await requireAdminUser(req, res);
  if (!admin) return;
  const marketSlug = await getLaunchMarketSlug();
  const rows = await waitlistExportRows(marketSlug);
  await recordAdminAudit({
    actorId: admin.id,
    actorRole: admin.role,
    action: "waitlist_export",
    resourceType: "launch_waitlist",
    resourceId: marketSlug ?? "all",
    metadata: { rows: rows.length },
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  });
  const lines = [
    WAITLIST_CSV_COLUMNS.join(","),
    ...rows.map((r: any) => WAITLIST_CSV_COLUMNS.map((c) => csvCell(r[c])).join(",")),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="waitlist-${marketSlug ?? "all"}.csv"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(lines.join("\n"));
});

export default router;
