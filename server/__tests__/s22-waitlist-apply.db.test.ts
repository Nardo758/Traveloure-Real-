/**
 * S-22 (ledger `2026-10-21-s22-waitlist-apply-path`): the apply invite is one email, and only for a
 * provider row born in a live city while the marketing footer setting is present.
 *
 *   S22e  Kyoto (on the live list) with the footer set: one outbox row, the ruled subject and body,
 *         a responsive message, and the shared marketing footer.
 *   S22f  A second sign-up for the same address writes no second email.
 *   S22g  A provider in a city that is not live gets no invite. A traveler in a live city gets none.
 *         An existing row that signs up again gets none. With the footer unset, a new live-city
 *         provider gets none.
 *   S22h  EMAIL_SENDS_ENABLED unset or "false": the invite row is held, the provider is not called,
 *         and the attempt count stays 0 (R631). The variable is restored before the test returns.
 *
 * Footer values are fixture tokens, not a postal address. Rows and the settings are restored.
 * Run: npx tsx --test server/__tests__/s22-waitlist-apply.db.test.ts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const host = (() => {
  try { return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); }
  catch { return "<none>"; }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[s22-waitlist-apply] REFUSING to write fixtures to '${host}'.`);
}

const { pool } = await import("../db");
const { joinWaitlist } = await import("../services/launch-waitlist.service");
const { notifyWaitlistProviderApply, buildWaitlistApplyInviteMessage } = await import("../services/waitlist-apply-invite-email");
const { _outboxTestHooks } = await import("../services/email-outbox.service");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");
const { MARKETING_EMAIL_FOOTER_FIELDS } = await import("@shared/marketing-email-footer");
const { BETA_MARKET_SLUGS_SETTING } = await import("@shared/ticker");
const { WAITLIST_APPLY_INVITE_EMAIL_TYPE, waitlistApplyMail } = await import("@shared/waitlist-apply-invite");

const FOOTER = "S22-FOOTER-FIXTURE";
const SENDER = "S22-SENDER-FIXTURE";
const OPT_OUT = "s22-opt-out@example.test";
const COMPLAINT = "s22-complaints@example.test";
const FOOTER_VALUES: Record<string, string> = {
  marketing_email_sender_name: SENDER,
  marketing_email_opt_out_address: OPT_OUT,
  marketing_email_postal_address: FOOTER,
  marketing_email_complaint_contact: COMPLAINT,
};
const RUN = crypto.randomUUID().slice(0, 8);
const emailFor = (n: string) => `s22-${n}-${RUN}@traveloure.test`;
const prior = new Map<string, string | null>();

async function setSetting(key: string, value: string | null) {
  if (value === null) await pool.query(`DELETE FROM platform_settings WHERE setting_key = $1`, [key]);
  else await pool.query(
    `INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
    [key, value],
  );
  invalidatePlatformFlagCache(key);
}

async function invites(email: string) {
  const r = await pool.query(
    `SELECT subject, html, text_body FROM email_outbox WHERE lower(to_email) = $1 AND email_type = $2 ORDER BY id`,
    [email.toLowerCase(), WAITLIST_APPLY_INVITE_EMAIL_TYPE],
  );
  return r.rows as { subject: string; html: string; text_body: string }[];
}

async function signUp(email: string, market: string, role: "provider" | "traveler", name = "Ada Lovelace") {
  const body = role === "provider"
    ? { role, email, contactName: name, businessName: "Ada Tours", serviceType: "experience" as const, consent: true }
    : { role, email, consent: true };
  const written = await joinWaitlist(body, market, null);
  const outcome = await notifyWaitlistProviderApply({
    inserted: written.inserted,
    role,
    marketSlug: market,
    email,
    contactName: role === "provider" ? name : null,
    businessName: role === "provider" ? "Ada Tours" : null,
    serviceType: role === "provider" ? "experience" : null,
  });
  return { ...written, outcome };
}

const priorSends = process.env.EMAIL_SENDS_ENABLED;
process.env.EMAIL_SENDS_ENABLED = "true";

before(async () => {
  for (const key of [...MARKETING_EMAIL_FOOTER_FIELDS.map((field) => field.key), BETA_MARKET_SLUGS_SETTING]) {
    const r = await pool.query(`SELECT setting_value FROM platform_settings WHERE setting_key = $1`, [key]);
    prior.set(key, r.rows.length ? String(r.rows[0].setting_value) : null);
  }
  for (const [key, value] of Object.entries(FOOTER_VALUES)) await setSetting(key, value);
  await setSetting(BETA_MARKET_SLUGS_SETTING, JSON.stringify(["kyoto"]));
  _outboxTestHooks.sendEmailFn = async () => ({ ok: true, id: "s22-test" });
});

after(async () => {
  try {
    await pool.query(`DELETE FROM email_outbox WHERE lower(to_email) LIKE $1`, [`s22-%-${RUN}@traveloure.test`]);
    await pool.query(`DELETE FROM launch_waitlist WHERE email LIKE $1`, [`s22-%-${RUN}@traveloure.test`]);
    for (const [key, value] of prior) await setSetting(key, value);
  } finally {
    delete _outboxTestHooks.sendEmailFn;
    if (priorSends === undefined) delete process.env.EMAIL_SENDS_ENABLED;
    else process.env.EMAIL_SENDS_ENABLED = priorSends;
    await pool.end();
  }
});

test("S22e — a new Kyoto provider gets one responsive invite with the footer", async () => {
  const email = emailFor("kyoto");
  const first = await signUp(email, "kyoto", "provider");
  assert.equal(first.inserted, true);
  assert.equal(first.outcome, "sent");
  const rows = await invites(email);
  assert.equal(rows.length, 1);
  const mail = waitlistApplyMail("Kyoto", "Ada");
  assert.equal(rows[0].subject, "You're on the Traveloure list");
  assert.equal(rows[0].subject, mail.subject);
  assert.ok(rows[0].text_body.startsWith(mail.body));
  assert.ok(rows[0].text_body.includes(mail.cta));
  assert.ok(rows[0].text_body.includes(FOOTER));
  assert.ok(rows[0].text_body.includes(`Sender: ${SENDER}`));
  assert.ok(rows[0].text_body.includes(`Opt out by email: ${OPT_OUT}`));
  assert.ok(rows[0].text_body.includes(`Complaints: ${COMPLAINT}`));
  assert.ok(rows[0].text_body.includes(`Unsubscribe: mailto:${OPT_OUT}`));
  assert.ok(rows[0].html.includes("width=device-width"));
  assert.ok(rows[0].html.includes("width:100%"));
  assert.ok(rows[0].html.includes("max-width:600px"));
  assert.ok(rows[0].html.includes(mail.preheader));
  assert.ok(rows[0].html.includes("Apply as a Kyoto provider"));
  assert.ok(rows[0].html.includes(FOOTER));
  assert.ok(rows[0].html.includes(`Sender: ${SENDER}`));
  assert.ok(rows[0].html.includes(`mailto:${OPT_OUT}`));
  assert.equal(rows[0].html.includes("tel:"), false);
  assert.doesNotMatch(rows[0].html, /\b\d{3}[-.)]\s*\d{3}[-.\s]\d{4}\b/);
  assert.ok(rows[0].html.includes("/become-provider?"));
  assert.ok(rows[0].html.includes("businessName=Ada+Tours") || rows[0].html.includes("businessName=Ada%20Tours"));
});

test("S22f — a duplicate sign-up sends no second email", async () => {
  const email = emailFor("dup");
  assert.equal((await signUp(email, "kyoto", "provider")).inserted, true);
  const again = await signUp(email, "kyoto", "provider", "Ada Again");
  assert.equal(again.inserted, false);
  assert.equal(again.outcome, "skipped");
  assert.equal((await invites(email)).length, 1);
  const only = (await invites(email))[0];
  assert.ok(only.text_body.startsWith("Hi Ada,"));
});

test("S22g — a non-live city, a traveler, an existing row and a missing footer send nothing", async () => {
  const goa = emailFor("goa");
  const goaJoin = await signUp(goa, "goa", "provider");
  assert.equal(goaJoin.inserted, true);
  assert.equal(goaJoin.outcome, "skipped");
  assert.equal((await invites(goa)).length, 0);

  const traveler = emailFor("traveler");
  assert.equal((await signUp(traveler, "kyoto", "traveler")).outcome, "skipped");
  assert.equal((await invites(traveler)).length, 0);

  const existing = emailFor("existing");
  await pool.query(
    `INSERT INTO launch_waitlist (id, email, market_slug, role, contact_name, business_name, service_type, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'kyoto', 'provider', 'Old Name', 'Old Co', 'experience', NOW() - interval '2 days', NOW() - interval '2 days')`,
    [existing],
  );
  const replay = await signUp(existing, "kyoto", "provider");
  assert.equal(replay.inserted, false, "a row that already existed is not a new sign-up");
  assert.equal((await invites(existing)).length, 0);

  await setSetting("marketing_email_postal_address", null);
  const bare = emailFor("nofooter");
  const bareJoin = await signUp(bare, "kyoto", "provider");
  assert.equal(bareJoin.inserted, true);
  assert.equal(bareJoin.outcome, "skipped");
  assert.equal((await invites(bare)).length, 0);
  await setSetting("marketing_email_postal_address", FOOTER);

  const message = buildWaitlistApplyInviteMessage({
    mail: waitlistApplyMail("Kyoto", "Ada"),
    applyUrl: "https://example.test/become-provider?city=Kyoto",
    footerHtml: "<p>S22-FOOTER-FIXTURE</p>",
    footerText: FOOTER,
  });
  assert.equal(message.subject, "You're on the Traveloure list");
  assert.ok(message.html.includes("width=device-width"));
  assert.throws(() => buildWaitlistApplyInviteMessage({
    mail: waitlistApplyMail("Kyoto", "Ada"),
    applyUrl: "/become-provider",
    footerHtml: "",
    footerText: "",
  }));

  const template = readFileSync("server/services/waitlist-apply-invite-email.ts", "utf8");
  assert.equal(template.includes("S22-FOOTER-FIXTURE"), false);
  assert.doesNotMatch(template, /\b\d{3}[-.)]\s*\d{3}[-.\s]\d{4}\b/);
  assert.equal(template.includes("tel:"), false);
});

test("S22h — EMAIL_SENDS_ENABLED off holds the apply invite and does not send", async () => {
  const prior = process.env.EMAIL_SENDS_ENABLED;
  const priorHook = _outboxTestHooks.sendEmailFn;
  let providerCalls = 0;
  _outboxTestHooks.sendEmailFn = async () => {
    providerCalls += 1;
    return { ok: true, id: "s22-should-not-send" };
  };
  try {
    await setSetting("marketing_email_postal_address", FOOTER);
    for (const value of [undefined, "false"] as const) {
      if (value === undefined) delete process.env.EMAIL_SENDS_ENABLED;
      else process.env.EMAIL_SENDS_ENABLED = value;
      const email = emailFor(value === undefined ? "gate-unset" : "gate-false");
      const join = await signUp(email, "kyoto", "provider");
      assert.equal(join.inserted, true);
      const r = await pool.query(
        `SELECT status, attempt_count, last_error, retry_after, sent_at, resend_id, text_body
         FROM email_outbox WHERE lower(to_email) = $1 AND email_type = $2`,
        [email.toLowerCase(), WAITLIST_APPLY_INVITE_EMAIL_TYPE],
      );
      const label = value === undefined ? "unset" : value;
      assert.equal(r.rows.length, 1, `one held invite when EMAIL_SENDS_ENABLED is ${label}`);
      const row = r.rows[0];
      assert.equal(row.status, "held");
      assert.equal(Number(row.attempt_count), 0);
      assert.equal(row.sent_at, null);
      assert.equal(row.resend_id, null);
      assert.equal(row.retry_after, null);
      assert.match(String(row.last_error), /EMAIL_SENDS_ENABLED is not true/);
      assert.match(String(row.text_body), /Apply as a Kyoto provider/);
    }
    assert.equal(providerCalls, 0);
  } finally {
    _outboxTestHooks.sendEmailFn = priorHook;
    if (prior === undefined) delete process.env.EMAIL_SENDS_ENABLED;
    else process.env.EMAIL_SENDS_ENABLED = prior;
  }
});
