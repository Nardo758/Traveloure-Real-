/**
 * Row 294 — a ticked news box stores its own consent timestamp; an unticked box stores none.
 *
 * The sentence lives in consent_texts (existing table). The tick lives in consent_records.consented_at
 * (existing column), not on the account and not on the waitlist-updates tick (launch_waitlist.consent_at).
 * No new column.
 *
 *   S1  a tick stores one launch_marketing_news row with consented_at, and does not stamp the
 *       updates consent or create a user.
 *   S2  an explicit false and an omitted box each store no consent row.
 *   S3  the seed is one row whose body is the approved sentence, and a second call adds nothing.
 *   S4  boot seeds that text before routes are registered.
 *
 * Run: npx tsx --test server/__tests__/row294-marketing-consent.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://ubuntu@localhost/traveloure?host=/var/run/postgresql";
process.env.SESSION_SECRET ??= "row294-marketing-consent-test-secret";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_row294_marketing_consent";
}

const host = (() => {
  try { return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); }
  catch { return "<none>"; }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[row294] REFUSING to write fixtures to '${host}'.`);
}

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { ensureMarketingConsentText, joinWaitlist } = await import("../services/launch-waitlist.service.js");
const {
  WAITLIST_MARKETING_CONSENT_KEY,
  WAITLIST_MARKETING_CONSENT_LINE,
  WAITLIST_MARKETING_CONSENT_VERSION,
} = await import("../../shared/launch-waitlist.js");

const RUN = crypto.randomUUID().slice(0, 8);
const email = (n: string) => `r294-${n}-${RUN}@traveloure-qa.test`;

async function waitlist(address: string) {
  const r = await pool.query(`SELECT id, consent_at, consent_text_version FROM launch_waitlist WHERE email = $1`, [address]);
  return r.rows[0] as { id: string; consent_at: Date | null; consent_text_version: string | null } | undefined;
}

async function consents(waitlistId: string) {
  const r = await pool.query(
    `SELECT consent_key, consent_text_version, consented_at, revoked_at
     FROM consent_records WHERE waitlist_id = $1 ORDER BY consent_key`,
    [waitlistId],
  );
  return r.rows as { consent_key: string; consent_text_version: string | null; consented_at: Date | null; revoked_at: Date | null }[];
}

before(async () => {
  await ensureMarketingConsentText();
});

after(async () => {
  await pool.query(`DELETE FROM launch_waitlist WHERE email LIKE $1`, [`r294-%-${RUN}@traveloure-qa.test`]);
  await pool.end();
});

test("S3 — one seeded sentence, and a second seed writes nothing more", async () => {
  await ensureMarketingConsentText();
  const rows = await pool.query(
    `SELECT version, body FROM consent_texts WHERE consent_key = $1 AND version = $2`,
    [WAITLIST_MARKETING_CONSENT_KEY, WAITLIST_MARKETING_CONSENT_VERSION],
  );
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0].body, WAITLIST_MARKETING_CONSENT_LINE);
  assert.equal(rows.rows[0].body, "Send me news and offers from Traveloure. You can unsubscribe at any time.");
});

test("S1 — a tick stores true as its own consent row and timestamp", async () => {
  const address = email("tick");
  await joinWaitlist({ email: address, role: "traveler", consent: false, marketingConsent: true }, "kyoto");
  const row = await waitlist(address);
  assert.ok(row, "the waitlist row exists");
  assert.equal(row.consent_at, null, "the updates tick is a different consent");
  assert.equal(row.consent_text_version, null);
  const stored = await consents(row.id);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].consent_key, WAITLIST_MARKETING_CONSENT_KEY);
  assert.equal(stored[0].consent_text_version, WAITLIST_MARKETING_CONSENT_VERSION);
  assert.ok(stored[0].consented_at, "its own timestamp");
  assert.equal(stored[0].revoked_at, null);
  const users = await pool.query(`SELECT id, created_at, terms_accepted_at FROM users WHERE lower(email) = $1`, [address]);
  assert.equal(users.rows.length, 0, "no account, so this timestamp is not account creation or terms acceptance");
});

test("S2 — an unticked box stores no consent", async () => {
  for (const [name, marketingConsent] of [["off", false], ["omit", undefined]] as const) {
    const address = email(name);
    await joinWaitlist(
      { email: address, role: "traveler", consent: false, ...(marketingConsent === undefined ? {} : { marketingConsent }) },
      "kyoto",
    );
    const row = await waitlist(address);
    assert.ok(row, name);
    assert.equal(row.consent_at, null, name);
    assert.deepEqual(await consents(row.id), [], name);
  }
});

test("S4 — boot seeds the sentence before routes register", () => {
  const boot = readFileSync("server/index.ts", "utf8");
  const seed = boot.indexOf("await ensureMarketingConsentText()");
  const routes = boot.indexOf("await registerRoutes(httpServer, app)");
  assert.ok(seed > 0 && routes > seed, "the seed runs, and it runs first");
});
