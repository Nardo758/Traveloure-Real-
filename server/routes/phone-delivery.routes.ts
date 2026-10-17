// §8 phone delivery (ledger `2026-10-17-phone-delivery-calendar`; Part C ratified by Leon Oct 16, 2026).
//
//   GET    /api/trips/:tripId/phone-delivery              — the owner's chooser state: which channels are switched on,
//                                                          whether a calendar link is live, the Home Screen choice.
//                                                          Never a token. Not the owner ⇒ 404.
//   POST   /api/trips/:tripId/phone-delivery/calendar     — mint the calendar link, or reset it (the old one dies at
//                                                          once). Returns the link's path ONCE. Switch off or not the
//                                                          owner ⇒ 404; no final / unconfirmed dates ⇒ 409; ended ⇒ 410.
//   DELETE /api/trips/:tripId/phone-delivery/calendar     — stop the link (opt-out).
//   POST   /api/trips/:tripId/phone-delivery/home-screen  — record the Add to Home Screen opt-in / opt-out
//                                                          (`.strict()` `{ optedIn }`, §19).
//   GET    /cal/:file                                     — the feed, `<token>.ics`. Public, read-only, not a sign-in;
//                                                          noindex + no-store. Unknown / revoked / switched off ⇒ 404;
//                                                          from 7 days after the trip ends ⇒ 410.
//
// The owner is always the session (§14); every write is one transaction with its phone_delivery_choices row.
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { generalRateLimiter } from "../infrastructure/rate-limiter";
import { logger } from "../infrastructure/logger";
import {
  PhoneDeliveryRefusal,
  mintCalendarFeed,
  phoneDeliveryState,
  recordHomeScreen,
  renderCalendarFeed,
  revokeCalendarFeed,
} from "../services/phone-delivery.service";

const router = Router();

function refuse(res: any, err: unknown, what: string) {
  if (err instanceof PhoneDeliveryRefusal) return res.status(err.status).json({ error: err.message, code: err.code });
  logger.error(`[phone-delivery] ${what} failed: ${(err as any)?.code ?? (err as any)?.message ?? "unknown"}`);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
}

router.get("/api/trips/:tripId/phone-delivery", isAuthenticated, async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await phoneDeliveryState(String(req.params.tripId), getUserId(req)!));
  } catch (err) {
    refuse(res, err, "state");
  }
});

router.post("/api/trips/:tripId/phone-delivery/calendar", isAuthenticated, async (req, res) => {
  try {
    const { token, reset } = await mintCalendarFeed(String(req.params.tripId), getUserId(req)!);
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({ path: `/cal/${token}.ics`, reset });
  } catch (err) {
    refuse(res, err, "mint");
  }
});

router.delete("/api/trips/:tripId/phone-delivery/calendar", isAuthenticated, async (req, res) => {
  try {
    res.json({ revoked: await revokeCalendarFeed(String(req.params.tripId), getUserId(req)!) });
  } catch (err) {
    refuse(res, err, "revoke");
  }
});

const homeScreenBody = z.object({ optedIn: z.boolean() }).strict();
router.post("/api/trips/:tripId/phone-delivery/home-screen", isAuthenticated, async (req, res) => {
  const parsed = homeScreenBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  try {
    await recordHomeScreen(String(req.params.tripId), getUserId(req)!, parsed.data.optedIn);
    res.json({ ok: true });
  } catch (err) {
    refuse(res, err, "home-screen");
  }
});

router.get("/cal/:file", generalRateLimiter, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const file = String(req.params.file ?? "");
  const token = file.endsWith(".ics") ? file.slice(0, -4) : "";
  try {
    const result = await renderCalendarFeed(token);
    if (result.status !== 200) return res.status(result.status).type("text/plain").send(result.status === 410 ? "Gone" : "Not found");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="trip-card.ics"');
    return res.send(result.body);
  } catch (err: any) {
    // Never log the token.
    logger.error(`[phone-delivery] feed failed: ${err?.code ?? err?.message ?? "unknown"}`);
    return res.status(500).type("text/plain").send("Error");
  }
});

export default router;
