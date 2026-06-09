/**
 * Web Push — subscription plumbing only (Phase 3, SMS/PWA delivery lane).
 *
 *   GET  /api/push/vapid-public-key — the client needs this to subscribe.
 *   POST /api/push/subscribe        — store a browser PushSubscription.
 *
 * NO send layer here (Phase 4). The VAPID private key is never exposed; the
 * public key is safe to serve. Subscriptions persist in push_subscriptions
 * (migration 051), upserted by endpoint. Raw SQL (mirrors the upsell engine)
 * so this lane doesn't touch shared/schema.ts.
 */
import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";

const router = Router();

/** GET /api/push/vapid-public-key — public key for pushManager.subscribe(). */
router.get("/api/push/vapid-public-key", (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: "push_not_configured" });
  res.json({ publicKey: key });
});

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

/** POST /api/push/subscribe — store (or refresh) the caller's PushSubscription. */
router.post("/api/push/subscribe", isAuthenticated, async (req, res) => {
  try {
    const { endpoint, keys } = subscribeSchema.parse(req.body);
    const userId = (req as any).user?.id ?? (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "unauthenticated" });
    const userAgent = req.get("user-agent") ?? null;
    await db.execute(sql`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
      VALUES (${userId}, ${endpoint}, ${keys.p256dh}, ${keys.auth}, ${userAgent})
      ON CONFLICT (endpoint) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        updated_at = NOW()
    `);
    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

export default router;
