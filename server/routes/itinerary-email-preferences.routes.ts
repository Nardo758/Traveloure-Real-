import { Router } from "express";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { escHtml } from "../utils/email-escape";
import { cancelItineraryFollowups } from "../services/itinerary-followup.service";
import { updateUserPreferences } from "../services/user-preferences-writer";
import { marketingPreferences } from "../services/itinerary-followup-email";

const router = Router();
const bodySchema = z.object({
  enabled: z.boolean(), timeZone: z.string().max(100).optional(),
  quietStart: z.string().max(5).optional(), quietEnd: z.string().max(5).optional(),
}).strict();

async function savePreferences(userId: string, input: unknown) {
  const parsed = bodySchema.parse(input);
  if (parsed.enabled && !marketingPreferences({ itineraryMarketing: parsed })) {
    throw new Error("Choose a valid timezone and quiet-hour start/end times.");
  }
  // The ONE writer of users.preferences (ledger 2026-09-23-preferences-one-writer). It locks the same
  // users row lockFollowupTraveler locks, and the opt-out cancel commits in its transaction.
  await updateUserPreferences(
    userId,
    (current) => ({ preferences: { ...current, itineraryMarketing: parsed }, result: parsed }),
    async (tx) => {
      if (!parsed.enabled) await cancelItineraryFollowups(tx, userId, "Traveler unsubscribed");
    },
  );
}

const page = (title: string, content: string) => `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title>
<style>body{font:16px system-ui;max-width:600px;margin:48px auto;padding:0 24px;color:#182b32}
label{display:block;margin:20px 0 8px}input:not([type=checkbox]){display:block;padding:10px;width:90%;font:inherit}
button{margin:24px 0;padding:12px 20px;font:inherit;cursor:pointer}a{color:#08675b}p{line-height:1.6}</style>
<main><h1>${escHtml(title)}</h1>${content}<p><a href="/profile">Back to your profile</a></p></main></html>`;

router.get("/api/me/itinerary-email-preferences", isAuthenticated, async (req, res, next) => {
  try {
    const result = await db.execute(sql`SELECT preferences->'itineraryMarketing' AS preferences FROM users WHERE id = ${getUserId(req)}`);
    res.set("Cache-Control", "no-store").json((result.rows[0] as { preferences: unknown } | undefined)?.preferences ?? { enabled: false });
  } catch (error) { next(error); }
});
router.patch("/api/me/itinerary-email-preferences", isAuthenticated, async (req, res, next) => {
  try { await savePreferences(getUserId(req)!, req.body); res.json({ saved: true }); }
  catch (error) {
    if (error instanceof z.ZodError || (error instanceof Error && error.message.startsWith("Choose"))) {
      res.status(400).json({ message: "Provide a boolean consent value, valid timezone, and HH:MM quiet hours." });
    } else next(error);
  }
});

router.get("/email-preferences", isAuthenticated, async (req, res, next) => {
  try {
    const result = await db.execute(sql`SELECT preferences->'itineraryMarketing' AS preferences FROM users WHERE id = ${getUserId(req)}`);
    const preferences = (result.rows[0] as { preferences?: Record<string, unknown> } | undefined)?.preferences ?? {};
    const session = req.session as typeof req.session & { itineraryMarketingCsrf?: string };
    session.itineraryMarketingCsrf = randomUUID();
    res.set("Cache-Control", "no-store").type("html").send(page("Itinerary follow-up emails", `
      <p>Choose whether to receive planning reminders. Booking, security, and itinerary-ready or failed notices are not affected.</p>
      <form method="post" action="/email-preferences">
      <input type="hidden" name="csrf" value="${session.itineraryMarketingCsrf}">
      <label><input type="checkbox" name="enabled" ${preferences.enabled === true ? "checked" : ""}> Receive itinerary follow-up emails</label>
      <label for="zone">Your timezone (for example, Asia/Calcutta)</label>
      <input id="zone" name="timeZone" value="${escHtml(String(preferences.timeZone ?? ""))}" maxlength="100">
      <label for="start">Quiet hours start</label><input id="start" name="quietStart" type="time" value="${escHtml(String(preferences.quietStart ?? ""))}">
      <label for="end">Quiet hours end</label><input id="end" name="quietEnd" type="time" value="${escHtml(String(preferences.quietEnd ?? ""))}">
      <p>Reminders wait outside your quiet hours. Equal start and end times explicitly disable quiet hours. At most one marketing email is attempted per local calendar day.</p>
      <button type="submit">Save email preferences</button></form>
      <script>const zone=document.getElementById('zone');if(!zone.value){try{zone.value=Intl.DateTimeFormat().resolvedOptions().timeZone}catch{}}</script>
    `));
  } catch (error) { next(error); }
});
router.post("/email-preferences", isAuthenticated, async (req, res, next) => {
  const session = req.session as typeof req.session & { itineraryMarketingCsrf?: string };
  if (!session.itineraryMarketingCsrf || req.body?.csrf !== session.itineraryMarketingCsrf) {
    res.status(403).send("Reload the preferences page and try again."); return;
  }
  try {
    await savePreferences(getUserId(req)!, {
      enabled: req.body.enabled === "on",
      timeZone: String(req.body.timeZone ?? ""), quietStart: String(req.body.quietStart ?? ""), quietEnd: String(req.body.quietEnd ?? ""),
    });
    res.set("Cache-Control", "no-store").type("html").send(page("Preferences saved", "<p>Your itinerary email preferences have been updated.</p>"));
  } catch (error) {
    if (error instanceof z.ZodError || (error instanceof Error && error.message.startsWith("Choose"))) {
      res.status(400).type("html").send(page("Check your preferences", "<p>Choose a valid timezone and quiet-hour start/end times before enabling reminders.</p><a href='/email-preferences'>Try again</a>"));
    } else next(error);
  }
});

async function unsubscribeOwner(token: string) {
  if (!z.string().uuid().safeParse(token).success) return null;
  const result = await db.execute(sql`SELECT metadata->>'travelerId' AS owner FROM email_outbox
    WHERE metadata->>'travelerFollowupVersion' = '1' AND metadata->>'unsubscribeToken' = ${token} LIMIT 1`);
  return (result.rows[0] as { owner?: string } | undefined)?.owner ?? null;
}
router.get("/email-preferences/unsubscribe/:token", async (req, res, next) => {
  try {
    if (!await unsubscribeOwner(req.params.token)) { res.status(404).send("This email preference link is unavailable."); return; }
    // Email scanners may follow GET links. Only an explicit POST changes preferences.
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }).type("html").send(page("Unsubscribe from itinerary follow-ups",
      `<p>Itinerary-ready, failed, booking and security notices remain enabled.</p><form method="post"><button type="submit">Unsubscribe</button></form>`));
  } catch (error) { next(error); }
});
router.post("/email-preferences/unsubscribe/:token", async (req, res, next) => {
  try {
    const owner = await unsubscribeOwner(req.params.token);
    if (!owner) { res.status(404).send("This email preference link is unavailable."); return; }
    await savePreferences(owner, { enabled: false });
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }).type("html").send(page("Unsubscribed", "<p>You will no longer receive itinerary follow-up emails.</p>"));
  } catch (error) { next(error); }
});
export default router;