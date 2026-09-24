/**
 * PHONE PUSH — the device rails (Locked Decision 53, ledger `2026-09-24-web-push`).
 *
 *   GET    /api/push/config          is push available here, and the VAPID public key
 *   GET    /api/push/subscriptions/status?endpointHash=  is THIS browser on the session's account
 *   POST   /api/push/subscriptions   register this browser for the session's account
 *   DELETE /api/push/subscriptions   forget this browser for the session's account
 *   POST   /api/push/test            send a test notice to the session's devices
 *
 * §14: the account is always `getUserId(req)`; no body carries an identity.
 * §19: each body is a `.strict()` object; a stray key is a 400, never silently stripped.
 * §13: when VAPID keys are not configured every rail says `available: false` — nothing is
 * stored that could never be delivered to, and no test is reported as sent.
 *
 * A browser's endpoint is one device. When a different account signs in on the same browser and
 * turns push on, the row moves to that account: the device belongs to whoever is using it now.
 */
import { Router } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";

import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { isPushConfigured, pushPublicKey, sendPushToUser } from "../services/web-push.service";

const router = Router();

const subscribeBody = z
  .object({
    endpoint: z.string().url().max(2048).refine((u) => u.startsWith("https://"), "endpoint must be https"),
    keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }).strict(),
  })
  .strict();

const endpointHashQuery = z.string().regex(/^[0-9a-f]{64}$/, "endpointHash must be a sha-256 hex digest");

const unsubscribeBody = z.object({ endpoint: z.string().min(1).max(2048) }).strict();

function zodMessage(err: unknown): string | null {
  return err instanceof z.ZodError ? err.errors[0]?.message ?? "Invalid body" : null;
}

router.get("/api/push/config", isAuthenticated, (_req, res) => {
  const available = isPushConfigured();
  res.json({ available, publicKey: available ? pushPublicKey() : null });
});

// The browser sends a SHA-256 of its endpoint, never the endpoint itself: a query string reaches
// access logs, and the endpoint is the one secret that addresses the device.
router.get("/api/push/subscriptions/status", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const parsed = endpointHashQuery.safeParse(req.query.endpointHash);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid query" });
    const r = await db.execute(sql`
      SELECT
        EXISTS (
          SELECT 1 FROM push_subscriptions
          WHERE user_id = ${userId} AND encode(sha256(convert_to(endpoint, 'UTF8')), 'hex') = ${parsed.data}
        ) AS subscribed,
        (SELECT count(*)::int FROM push_subscriptions WHERE user_id = ${userId}) AS devices
    `);
    const row: any = r.rows?.[0] ?? {};
    res.json({ subscribed: row.subscribed === true, devices: Number(row.devices ?? 0) });
  } catch (err) {
    console.error("[push] status failed:", err);
    res.status(500).json({ message: "Could not read phone notification status" });
  }
});

router.post("/api/push/subscriptions", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const body = subscribeBody.parse(req.body);
    if (!isPushConfigured()) return res.status(503).json({ available: false, message: "Phone notifications are not available yet." });
    const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 300) || null;
    await db.execute(sql`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
      VALUES (${userId}, ${body.endpoint}, ${body.keys.p256dh}, ${body.keys.auth}, ${userAgent})
      ON CONFLICT (endpoint) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        failure_count = 0
    `);
    const r = await db.execute(sql`SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = ${userId}`);
    res.json({ available: true, subscribed: true, devices: Number((r.rows?.[0] as any)?.n ?? 0) });
  } catch (err) {
    const msg = zodMessage(err);
    if (msg) return res.status(400).json({ message: msg });
    console.error("[push] subscribe failed:", err);
    res.status(500).json({ message: "Could not turn on phone notifications" });
  }
});

router.delete("/api/push/subscriptions", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const body = unsubscribeBody.parse(req.body);
    await db.execute(sql`DELETE FROM push_subscriptions WHERE endpoint = ${body.endpoint} AND user_id = ${userId}`);
    const r = await db.execute(sql`SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = ${userId}`);
    res.json({ subscribed: false, devices: Number((r.rows?.[0] as any)?.n ?? 0) });
  } catch (err) {
    const msg = zodMessage(err);
    if (msg) return res.status(400).json({ message: msg });
    console.error("[push] unsubscribe failed:", err);
    res.status(500).json({ message: "Could not turn off phone notifications" });
  }
});

router.post("/api/push/test", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!isPushConfigured()) return res.status(503).json({ available: false, delivered: 0 });
    const delivered = await sendPushToUser(userId, {
      title: "Traveloure",
      body: "Phone notifications are on.",
      url: "/",
      tag: "push-test",
    });
    res.json({ available: true, delivered });
  } catch (err) {
    console.error("[push] test failed:", err);
    res.status(500).json({ message: "Could not send a test notification" });
  }
});

export default router;
