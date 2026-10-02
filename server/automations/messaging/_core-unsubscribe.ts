import crypto from "node:crypto";
import type { Express } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { lockJourney } from "./_core-store";

function signature(userId: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET required for unsubscribe signatures");
  return crypto.createHmac("sha256", secret).update(`journey-unsubscribe:${userId}`).digest("hex");
}
export function unsubscribePath(userId: string) {
  return `/api/auth/journey-unsubscribe?user=${encodeURIComponent(userId)}&signature=${signature(userId)}`;
}
export function registerJourneyUnsubscribe(app: Express) {
  app.all("/api/auth/journey-unsubscribe", async (req, res) => {
    if (req.method !== "GET" && req.method !== "POST") return res.sendStatus(405);
    const userId = typeof req.query.user === "string" ? req.query.user : "";
    const supplied = typeof req.query.signature === "string" ? req.query.signature : "";
    if (!userId || !/^[a-f0-9]{64}$/.test(supplied)) return res.sendStatus(400);
    try {
      if (!crypto.timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(signature(userId), "hex"))) {
        return res.sendStatus(403);
      }
      // GET shows confirmation; scanners and link previews cannot opt somebody out.
      if (req.method === "GET") {
        return res.type("html").send('<!doctype html><title>Traveloure email preferences</title><h1>Stop marketing emails?</h1><form method="post"><button>Unsubscribe</button></form>');
      }
      await db.transaction(async (tx) => {
        await lockJourney(tx, userId);
        await tx.execute(sql`UPDATE users SET preferences=jsonb_set(
          COALESCE(preferences,'{}'::jsonb),'{journeyMarketingOptOut}','true'::jsonb,true)
          WHERE id=${userId}`);
        await tx.execute(sql`UPDATE signup_journey_jobs SET status='cancelled',
          skip_reason='unsubscribed',lease_until=NULL,updated_at=NOW()
          WHERE user_id=${userId} AND message_type IN ('profile_nudge','planner_nudge')
            AND status IN ('pending','failed','processing')`);
        await tx.execute(sql`UPDATE email_outbox SET status='cancelled',updated_at=NOW()
          WHERE metadata->>'journeyUserId'=${userId} AND metadata->>'journeyKind' IN ('profile_nudge','planner_nudge')
            AND status IN ('pending','failed')`);
      });
      res.type("html").send("<!doctype html><title>Unsubscribed</title><p>Marketing emails stopped. Security and account emails continue.</p>");
    } catch {
      res.status(500).json({ message: "Could not update email preferences. Please try again." });
    }
  });
}