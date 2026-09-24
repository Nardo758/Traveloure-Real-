/**
 * LIVE HELP — the rails (Locked Decision 54, ledger `2026-09-24-live-chat-qa-sessions`).
 *
 *   GET  /api/me/available-now              the session earner's own switch
 *   PUT  /api/me/available-now              switch it on (for the configured window) or off
 *   GET  /api/qa-sessions/:bookingId        a Q&A Session's state, for the traveler or the expert
 *   POST /api/qa-sessions/:bookingId/start  start it (one atomic stamp; a repeat reads it back)
 *
 * §14: the account is always the session; no body carries an identity or a time. §19: the one
 * body is a `.strict()` object. LD 40: a Q&A session that does not exist, is not yours or is not a
 * Q&A listing is ONE 404.
 */
import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { users } from "@shared/schema";
import { isEarnerRole } from "@shared/roles";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { isAvailableNow } from "@shared/live-availability";
import { availableNowWindowMinutes } from "../config/available-now.config";
import { readQaSession, startQaSession } from "../services/qa-session.service";

const router = Router();

const availableNowBody = z.object({ on: z.boolean() }).strict();

async function readMine(userId: string) {
  const [me] = await db
    .select({ role: users.role, availableNowUntil: users.availableNowUntil, vacationUntil: users.vacationUntil })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return me ?? null;
}

function shape(me: { availableNowUntil: Date | null; vacationUntil: Date | null }) {
  const onVacation = !!me.vacationUntil && me.vacationUntil.getTime() > Date.now();
  return {
    availableNow: isAvailableNow(me),
    until: isAvailableNow(me) && me.availableNowUntil ? me.availableNowUntil.toISOString() : null,
    onVacation,
    windowMinutes: availableNowWindowMinutes(),
  };
}

router.get("/api/me/available-now", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const me = await readMine(userId);
    if (!me) return res.status(401).json({ message: "Authentication required" });
    res.json(shape(me));
  } catch (err) {
    console.error("[available-now] read failed:", err);
    res.status(500).json({ message: "Could not read your availability" });
  }
});

router.put("/api/me/available-now", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const parsed = availableNowBody.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid body" });
    const me = await readMine(userId);
    if (!me) return res.status(401).json({ message: "Authentication required" });
    if (!isEarnerRole(me.role)) return res.status(403).json({ message: "Only experts and providers can go available" });
    if (parsed.data.on && me.vacationUntil && me.vacationUntil.getTime() > Date.now()) {
      return res.status(409).json({ reason: "on_vacation", message: "Turn off vacation mode first." });
    }
    const until = parsed.data.on ? new Date(Date.now() + availableNowWindowMinutes() * 60_000) : null;
    await db.update(users).set({ availableNowUntil: until, updatedAt: new Date() }).where(eq(users.id, userId));
    res.json(shape({ availableNowUntil: until, vacationUntil: me.vacationUntil }));
  } catch (err) {
    console.error("[available-now] write failed:", err);
    res.status(500).json({ message: "Could not update your availability" });
  }
});

router.get("/api/qa-sessions/:bookingId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const r = await readQaSession(String(req.params.bookingId), userId);
    if (!r.ok) return res.status(r.status).json({ reason: r.reason });
    res.json(r.view);
  } catch (err) {
    console.error("[qa-session] read failed:", err);
    res.status(500).json({ message: "Could not load the session" });
  }
});

router.post("/api/qa-sessions/:bookingId/start", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const r = await startQaSession(String(req.params.bookingId), userId);
    if (!r.ok) return res.status(r.status).json({ reason: r.reason });
    res.json({ ...r.view, started: r.started });
  } catch (err) {
    console.error("[qa-session] start failed:", err);
    res.status(500).json({ message: "Could not start the session" });
  }
});

export default router;
