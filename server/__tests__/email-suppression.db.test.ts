/**
 * Z-21 suppression and stream split. Disposable rows only.
 *
 *   S1  every known email_type is transactional or marketing, with no overlap
 *   S2  EMAIL_TEMPLATE_ALLOWLIST still allows nothing until it is set, and the
 *       function does not name a marketing type
 *   S3  hard bounce refuses marketing, transactional, and security
 *   S4  complaint refuses marketing and transactional, and security still sends
 *   S5  marketing uses the env sender and tag; transactional does not
 *   S6  a marketing sender that copies the transactional sender is refused
 *   S7  the outbox stores the refusal reason and does not attempt delivery
 *
 *   npx tsx --test server/__tests__/email-suppression.db.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://ubuntu@localhost/traveloure?host=/var/run/postgresql";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_email_suppression";
}

const { Pool } = await import("pg");
const {
  CANCELLED_BY_DEFAULT_EMAIL_TYPES,
  MARKETING_EMAIL_TYPES,
  MUST_HAVE_EMAIL_TYPES,
  NOT_ACCOUNT_BOUND_EMAIL_TYPES,
  OLD_ADDRESS_BY_DESIGN_EMAIL_TYPES,
  PASSWORD_CHANGED_EMAIL_TYPE,
  SECURITY_EMAIL_TYPES,
  STREAM_MARKETING_EMAIL_TYPES,
  emailStreamForType,
  knownOutboxEmailTypes,
  suppressionTreatsAsSecurity,
} = await import("../services/email-outbox-classes.js");
const { ITINERARY_FOLLOWUPS } = await import("../services/itinerary-followup-email.js");
const {
  EMAIL_FROM_MARKETING_ENV,
  MARKETING_STREAM_UNCONFIGURED,
  RESEND_MARKETING_AUDIENCE_ENV,
  RESEND_MARKETING_TAG_ENV,
} = await import("../services/email-stream.js");
const {
  SUPPRESSED_COMPLAINT,
  SUPPRESSED_HARD_BOUNCE,
  suppressionRefusalReason,
} = await import("../services/email-suppression.js");
const {
  _emailProviderTestHooks,
  emailTemplateAllowlist,
  emailTemplateAllowed,
  sendEmail,
} = await import("../services/email.service.js");
const { deliverQueuedEmail } = await import("../services/email-outbox.service.js");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags.js");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const RUN = randomUUID().slice(0, 8);
const addr = (label: string) => `z21-${label}-${RUN}@example.test`;

const ENV_KEYS = [
  "EMAIL_SENDS_ENABLED",
  "EMAIL_TEMPLATE_ALLOWLIST",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_FROM_NOREPLY",
  "EMAIL_REPLY_TO",
  EMAIL_FROM_MARKETING_ENV,
  RESEND_MARKETING_TAG_ENV,
  RESEND_MARKETING_AUDIENCE_ENV,
  "NODE_ENV",
] as const;

const saved: Record<string, string | undefined> = {};
let providerCalls: Array<{ payload: { from?: string; tags?: Array<{ name: string; value: string }> }; emailType: string }> = [];

function arm(allowlist: string): void {
  process.env.NODE_ENV = "production";
  process.env.EMAIL_SENDS_ENABLED = "true";
  process.env.EMAIL_TEMPLATE_ALLOWLIST = allowlist;
  process.env.RESEND_API_KEY = "re_test_z21";
  process.env.EMAIL_FROM = "Traveloure <noreply@example.test>";
  process.env.EMAIL_FROM_NOREPLY = "Traveloure <noreply@example.test>";
  process.env.EMAIL_REPLY_TO = "reply@example.test";
  delete process.env[EMAIL_FROM_MARKETING_ENV];
  delete process.env[RESEND_MARKETING_TAG_ENV];
  delete process.env[RESEND_MARKETING_AUDIENCE_ENV];
  invalidatePlatformFlagCache();
}

function armMarketing(): void {
  process.env[EMAIL_FROM_MARKETING_ENV] = "Traveloure <news@example.test>";
  process.env[RESEND_MARKETING_TAG_ENV] = "launch-news";
  process.env[RESEND_MARKETING_AUDIENCE_ENV] = "aud_z21";
}

before(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  _emailProviderTestHooks.send = async (payload, _options, emailType) => {
    providerCalls.push({
      payload: payload as { from?: string; tags?: Array<{ name: string; value: string }> },
      emailType,
    });
    return { data: { id: "msg_z21" }, error: null };
  };
});

after(async () => {
  delete _emailProviderTestHooks.send;
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await pool.query(`DELETE FROM email_suppressions WHERE email LIKE $1`, [`%${RUN}@example.test`]);
  await pool.query(`DELETE FROM email_outbox WHERE to_email LIKE $1`, [`%${RUN}@example.test`]);
  await pool.end();
});

async function suppress(email: string, reason: "hard_bounce" | "complaint"): Promise<void> {
  await pool.query(
    `INSERT INTO email_suppressions (id, email, reason, recorded_at, created_at)
     VALUES ($1, $2, $3, NOW(), NOW())`,
    [randomUUID(), email, reason],
  );
}

test("S1 every known email_type is exactly one stream", () => {
  const known = knownOutboxEmailTypes();
  assert.equal(new Set(known).size, known.length);
  const marketing = new Set<string>(STREAM_MARKETING_EMAIL_TYPES);
  assert.deepEqual([...marketing].sort(), [
    "itinerary_followup_24h",
    "itinerary_nudge_2h",
    "itinerary_reengagement_5d",
    "waitlist_open",
  ]);
  for (const type of MARKETING_EMAIL_TYPES) assert.ok(marketing.has(type));
  for (const followup of ITINERARY_FOLLOWUPS) assert.ok(marketing.has(followup.kind));
  for (const type of known) {
    const stream = emailStreamForType(type);
    assert.equal(stream, marketing.has(type) ? "marketing" : "transactional", type);
  }
  assert.equal(emailStreamForType("zz_unknown"), "transactional");
  assert.equal(emailStreamForType(PASSWORD_CHANGED_EMAIL_TYPE), "transactional");
  assert.equal(suppressionTreatsAsSecurity("password_reset", false), true);
  assert.equal(suppressionTreatsAsSecurity(PASSWORD_CHANGED_EMAIL_TYPE, true), true);
  assert.equal(suppressionTreatsAsSecurity("booking_decline", false), false);
  assert.equal(suppressionRefusalReason({
    emailType: "password_reset", authCritical: true, reasons: ["complaint"],
  }), null);
  assert.equal(suppressionRefusalReason({
    emailType: "password_reset", authCritical: true, reasons: ["hard_bounce"],
  }), SUPPRESSED_HARD_BOUNCE);
  const classed = [
    ...SECURITY_EMAIL_TYPES,
    ...MUST_HAVE_EMAIL_TYPES,
    ...OLD_ADDRESS_BY_DESIGN_EMAIL_TYPES,
    ...NOT_ACCOUNT_BOUND_EMAIL_TYPES,
    ...CANCELLED_BY_DEFAULT_EMAIL_TYPES,
  ];
  for (const type of classed) assert.ok(known.includes(type), type);
  const streamSource = readFileSync("server/services/email-stream.ts", "utf8");
  assert.doesNotMatch(streamSource, /@[a-z0-9.-]+\.[a-z]{2,}/i);
  const migration = readFileSync("server/migrations/421_email_suppressions.sql", "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS email_suppressions/);
  assert.doesNotMatch(migration, /SQL approved/);
  assert.match(readFileSync("server/migrations/migration-files.ts", "utf8"), /421_email_suppressions\.sql/);
});

test("S2 the allowlist still allows nothing until it is set", () => {
  const prior = process.env.EMAIL_TEMPLATE_ALLOWLIST;
  delete process.env.EMAIL_TEMPLATE_ALLOWLIST;
  try {
    assert.deepEqual([...emailTemplateAllowlist()], []);
    for (const type of STREAM_MARKETING_EMAIL_TYPES) assert.equal(emailTemplateAllowed(type), false);
    assert.equal(emailTemplateAllowed("password_reset"), false);
  } finally {
    if (prior === undefined) delete process.env.EMAIL_TEMPLATE_ALLOWLIST;
    else process.env.EMAIL_TEMPLATE_ALLOWLIST = prior;
  }
  const source = readFileSync("server/services/email.service.ts", "utf8");
  const fn = source.slice(
    source.indexOf("export function emailTemplateAllowlist"),
    source.indexOf("export function emailTemplateAllowed"),
  );
  for (const type of STREAM_MARKETING_EMAIL_TYPES) assert.equal(fn.includes(type), false, type);
});

test("S3 a hard bounce refuses marketing, transactional, and security", async () => {
  const bounced = addr("bounce");
  await suppress(bounced, "hard_bounce");
  arm("waitlist_open,booking_decline,password_reset");
  armMarketing();
  providerCalls = [];
  const marketing = await sendEmail({
    to: bounced, subject: "s", html: "<p>x</p>", emailType: "waitlist_open",
  });
  const transactional = await sendEmail({
    to: bounced, subject: "s", html: "<p>x</p>", emailType: "booking_decline",
  });
  const security = await sendEmail({
    to: bounced, subject: "s", html: "<p>x</p>", emailType: "password_reset", authCritical: true,
  });
  assert.equal(marketing.suppressed, "address_suppressed");
  assert.equal(marketing.error, SUPPRESSED_HARD_BOUNCE);
  assert.equal(transactional.error, SUPPRESSED_HARD_BOUNCE);
  assert.equal(security.error, SUPPRESSED_HARD_BOUNCE);
  assert.equal(providerCalls.length, 0);
});

test("S4 a complaint refuses marketing and transactional, and security still sends", async () => {
  const complained = addr("complaint");
  await suppress(complained, "complaint");
  arm("waitlist_open,booking_decline,password_reset");
  armMarketing();
  providerCalls = [];
  const marketing = await sendEmail({
    to: complained, subject: "s", html: "<p>x</p>", emailType: "waitlist_open",
  });
  const transactional = await sendEmail({
    to: complained, subject: "s", html: "<p>x</p>", emailType: "booking_decline",
  });
  const security = await sendEmail({
    to: complained, subject: "s", html: "<p>x</p>", emailType: "password_reset", authCritical: true,
  });
  assert.equal(marketing.error, SUPPRESSED_COMPLAINT);
  assert.equal(transactional.error, SUPPRESSED_COMPLAINT);
  assert.equal(security.ok, true);
  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0].emailType, "password_reset");
  assert.equal(providerCalls[0].payload.from, process.env.EMAIL_FROM_NOREPLY);
  assert.equal(providerCalls[0].payload.tags, undefined);
});

test("S5 marketing and transactional use different streams", async () => {
  const clean = addr("clean");
  arm("waitlist_open,itinerary_nudge_2h,booking_decline");
  providerCalls = [];
  const unconfigured = await sendEmail({
    to: clean, subject: "s", html: "<p>x</p>", emailType: "waitlist_open", authCritical: true,
  });
  assert.equal(unconfigured.suppressed, "marketing_stream");
  assert.equal(unconfigured.error, MARKETING_STREAM_UNCONFIGURED);
  assert.equal(providerCalls.length, 0);

  armMarketing();
  const marketing = await sendEmail({
    to: clean, subject: "s", html: "<p>x</p>", emailType: "itinerary_nudge_2h", authCritical: true,
  });
  const transactional = await sendEmail({
    to: clean, subject: "s", html: "<p>x</p>", emailType: "booking_decline", authCritical: true,
  });
  assert.equal(marketing.ok, true, marketing.error);
  assert.equal(transactional.ok, true, transactional.error);
  assert.equal(providerCalls.length, 2);
  const marketingCall = providerCalls.find((call) => call.emailType === "itinerary_nudge_2h");
  const transactionalCall = providerCalls.find((call) => call.emailType === "booking_decline");
  assert.ok(marketingCall && transactionalCall);
  assert.equal(marketingCall.payload.from, "Traveloure <news@example.test>");
  assert.deepEqual(marketingCall.payload.tags, [
    { name: "stream", value: "launch-news" },
    { name: "audience", value: "aud_z21" },
  ]);
  assert.equal(transactionalCall.payload.from, "Traveloure <noreply@example.test>");
  assert.equal(transactionalCall.payload.tags, undefined);
  assert.notEqual(marketingCall.payload.from, transactionalCall.payload.from);
});

test("S6 a marketing sender copied from the transactional sender is refused", async () => {
  arm("waitlist_open");
  process.env[EMAIL_FROM_MARKETING_ENV] = process.env.EMAIL_FROM_NOREPLY;
  process.env[RESEND_MARKETING_TAG_ENV] = "launch-news";
  providerCalls = [];
  const result = await sendEmail({
    to: addr("same-from"), subject: "s", html: "<p>x</p>", emailType: "waitlist_open", authCritical: true,
  });
  assert.equal(result.suppressed, "marketing_stream");
  assert.equal(providerCalls.length, 0);
});

test("S7 the outbox stores the refusal and does not count an attempt", async () => {
  const bounced = addr("outbox");
  await suppress(bounced, "hard_bounce");
  arm("password_reset");
  const inserted = await pool.query(
    `INSERT INTO email_outbox (email_type, to_email, subject, html, status, attempt_count, metadata)
     VALUES ('password_reset', $1, 'Reset', '<p>x</p>', 'pending', 0, '{"authCritical":true}'::jsonb)
     RETURNING id`,
    [bounced],
  );
  const id = Number(inserted.rows[0].id);
  providerCalls = [];
  await deliverQueuedEmail(id);
  const row = await pool.query(
    `SELECT status, attempt_count, last_error FROM email_outbox WHERE id = $1`,
    [id],
  );
  assert.equal(row.rows[0].status, "cancelled");
  assert.equal(row.rows[0].attempt_count, 0);
  assert.equal(row.rows[0].last_error, SUPPRESSED_HARD_BOUNCE);
  assert.equal(providerCalls.length, 0);
});
