/**
 * sendEmail is the only provider exit, and it checks EMAIL_TEMPLATE_ALLOWLIST.
 *
 * Run with:
 *   npx tsx --test server/__tests__/email-single-exit.test.ts
 *
 * There is no code default. An unlisted outbox row is left to the drain's
 * claim query and does not reach the provider.
 */

import { describe, it, before, beforeEach, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://ubuntu@localhost/traveloure?host=/var/run/postgresql";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_email_single_exit";
}

const { db } = await import("../db.js");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags.js");
const { logger } = await import("../infrastructure/logger.js");
const {
  _emailProviderTestHooks,
  sendAdminDigestEmail,
  sendBookingDeclineEmail,
  sendEmail,
  sendExpiredClaimEmail,
  sendLateSuccessRefundEmail,
  sendPlanApprovedEmail,
  sendPlanChangesRequestedEmail,
  sendPlanDeliveredEmail,
  sendNewSuggestionEmail,
  sendVerificationDecisionEmail,
} = await import("../services/email.service.js");
const emailTypes = await import("../services/email.service.js");
type SendEmailParams = emailTypes.SendEmailParams;
const { _outboxTestHooks, deliverQueuedEmail, drainOutbox } = await import("../services/email-outbox.service.js");
const { settleAdminDigestDelivery } = await import("../services/admin-digest-scheduler.service.js");
const { claimAdminDigestSend, releaseAdminDigestClaim } = await import("../services/admin-digest-claim.js");
const { sendWaitlistOpenEmail } = await import("../services/waitlist-open-email.js");
const { VendorManagementService } = await import("../services/vendor-management.service.js");
const { runDailyAdminDigest } = await import("../jobs/dailyAdminDigest.js");
const { deliverNightlyQaEmails } = await import("../jobs/nightlyQA.js");
const { MARKETING_EMAIL_FOOTER_FIELDS } = await import("@shared/marketing-email-footer");

const TO = "traveler-single-exit@example.com";
const ROOT = path.resolve(import.meta.dirname, "../..");

const MIGRATED = [
  "booking_decline",
  "late_success_refund",
  "expired_claim",
  "waitlist_open",
  "vendor_bulk_email",
  "admin_daily_digest",
  "nightly_qa",
  "admin_digest_24h",
  "verification_decision",
  "plan_delivered",
  "plan_approved",
  "plan_changes_requested",
  "new_suggestion",
  "admin_test_email",
] as const;

const ENV_KEYS = [
  "EMAIL_SENDS_ENABLED",
  "EMAIL_TEMPLATE_ALLOWLIST",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_FROM_NOREPLY",
  "EMAIL_REPLY_TO",
  "ADMIN_EMAIL",
  "NODE_ENV",
] as const;

type ProviderCall = { payload: Record<string, unknown>; emailType: string };

const OUTBOX_TYPES = [
  "booking_decline",
  "verification_decision",
  "plan_delivered",
  "plan_approved",
  "plan_changes_requested",
  "new_suggestion",
] as const;

const DIRECT_TYPES = [
  "late_success_refund",
  "expired_claim",
  "waitlist_open",
  "vendor_bulk_email",
  "admin_daily_digest",
  "nightly_qa",
  "admin_digest_24h",
] as const;

let origExecute: typeof db.execute;
let origSelect: typeof db.select;
let origInsert: typeof db.insert;
let origTransaction: typeof db.transaction;
let savedEnv: Record<string, string | undefined>;

function snapshotEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

function chunkToString(c: unknown): string {
  if (c === null) return "NULL";
  if (typeof c === "string") return c;
  if (c && typeof c === "object") {
    const obj = c as { queryChunks?: unknown[]; value?: unknown };
    if (obj.queryChunks !== undefined) return obj.queryChunks.map(chunkToString).join("");
    if ("value" in obj) return obj.value === null ? "NULL" : String(obj.value);
  }
  return String(c);
}

function sqlText(query: unknown): string {
  if (typeof query === "string") return query;
  const chunks = (query as { queryChunks?: unknown[] } | null)?.queryChunks;
  if (chunks) return chunks.map(chunkToString).join("");
  return String(query);
}

function makeChain(value: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const p = Promise.resolve(value);
  for (const method of ["from", "where", "set", "values", "limit", "orderBy", "returning", "innerJoin", "leftJoin"]) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => p.then(resolve, reject);
  chain.catch = (reject: (e: unknown) => unknown) => p.catch(reject);
  return chain;
}

function armMail(allowlist: string | undefined): void {
  process.env.NODE_ENV = "production";
  process.env.EMAIL_SENDS_ENABLED = "true";
  if (allowlist === undefined) delete process.env.EMAIL_TEMPLATE_ALLOWLIST;
  else process.env.EMAIL_TEMPLATE_ALLOWLIST = allowlist;
  process.env.RESEND_API_KEY = "re_test_single_exit";
  process.env.EMAIL_FROM = "Traveloure <noreply@example.com>";
  process.env.EMAIL_FROM_NOREPLY = "Traveloure <noreply@example.com>";
  process.env.EMAIL_REPLY_TO = "reply@example.com";
  invalidatePlatformFlagCache();
}

function installProvider(): ProviderCall[] {
  const calls: ProviderCall[] = [];
  _emailProviderTestHooks.send = async (payload, _options, emailType) => {
    calls.push({ payload: payload as unknown as Record<string, unknown>, emailType });
    return { data: { id: "msg_single_exit" }, error: null };
  };
  return calls;
}

function stubExecute(rowsFor: (text: string) => unknown[] = () => []): string[] {
  const captured: string[] = [];
  (db as { execute: (query: unknown) => Promise<{ rows: unknown[] }> }).execute = (query: unknown) => {
    const text = sqlText(query);
    captured.push(text);
    return Promise.resolve({ rows: rowsFor(text) });
  };
  return captured;
}

function footerRows(): unknown[] {
  const values: Record<string, string> = {
    marketing_email_sender_name: "Ada Lovelace",
    marketing_email_opt_out_address: "optout@example.com",
    marketing_email_postal_address: "1 Main St",
    marketing_email_complaint_contact: "complaints@example.com",
  };
  return MARKETING_EMAIL_FOOTER_FIELDS.map((field) => ({
    setting_key: field.key,
    setting_value: values[field.key],
  }));
}

function baseMessage(): SendEmailParams {
  return {
    to: TO,
    subject: "A subject",
    html: "<p>hello</p>",
    emailType: "booking_decline",
  };
}

function stubOutboxInsert(): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  const insert = () => ({
    values(value: Record<string, unknown>) {
      rows.push(value);
      return { returning: () => Promise.resolve([{ id: rows.length }]) };
    },
  });
  (db as { insert: () => unknown }).insert = insert as unknown as typeof db.insert;
  (db as { transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> }).transaction = async (fn) => fn({
    execute: (query: unknown) => (db as { execute: (query: unknown) => Promise<unknown> }).execute(query),
    select: () => makeChain([]),
    insert,
  });
  return rows;
}

function captureLoggerWarn() {
  const lines: Array<{ obj: unknown; msg?: string }> = [];
  const orig = logger.warn.bind(logger);
  (logger as unknown as { warn: (obj: unknown, msg?: string) => void }).warn = (obj, msg) => {
    lines.push({ obj, msg });
  };
  return {
    lines,
    restore() {
      (logger as unknown as { warn: typeof orig }).warn = orig;
    },
  };
}

function spyConsole() {
  const errors: string[] = [];
  const warns: string[] = [];
  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };
  console.warn = (...args: unknown[]) => {
    warns.push(args.map(String).join(" "));
  };
  return {
    errors,
    warns,
    restore() {
      console.error = origError;
      console.warn = origWarn;
    },
  };
}

function assertNoRecipient(text: string): void {
  assert.equal(text.includes(TO), false, "refusal log named the recipient");
  assert.equal(text.includes("vendor@example.com"), false);
  assert.equal(text.includes("admin-digest@example.com"), false);
}

class ProbeVendor extends VendorManagementService {
  async getContract(id: string) {
    return {
      id,
      tripId: "trip-1",
      vendorEmail: "vendor@example.com",
      vendorName: "Vendor",
    } as Awaited<ReturnType<VendorManagementService["getContract"]>>;
  }
  async logCommunication(): Promise<Awaited<ReturnType<VendorManagementService["logCommunication"]>>> {
    return undefined;
  }
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "build") continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

function sliceObject(source: string, start: number): string {
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;
  let escape = false;
  let expr = 0;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    const n = source[i + 1];
    if (quote === "`") {
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === "`" && expr === 0) { quote = null; continue; }
      if (c === "$" && n === "{") { expr++; i++; continue; }
      if (c === "{" && expr > 0) { expr++; continue; }
      if (c === "}" && expr > 0) { expr--; continue; }
      continue;
    }
    if (quote) {
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "/" && n === "/") {
      const nl = source.indexOf("\n", i);
      i = nl === -1 ? source.length : nl;
      continue;
    }
    if (c === "/" && n === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

function missingEmailTypeLines(source: string): number[] {
  const lines: number[] = [];
  const re = /sendEmail\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const before = source.slice(Math.max(0, match.index - 24), match.index);
    if (/function\s+$/.test(before)) continue;
    let i = match.index + match[0].length;
    while (/\s/.test(source[i] ?? "")) i++;
    if (source[i] !== "{") continue;
    const obj = sliceObject(source, i);
    if (!obj.includes("emailType")) lines.push(source.slice(0, match.index).split("\n").length);
  }
  return lines;
}

function usesRealSendEmail(file: string, source: string): boolean {
  if (file.endsWith(`${path.sep}email.service.ts`)) return true;
  if (/import\s*\{[^}]*\bsendEmail\b[^}]*\}\s*from\s*["'][^"']*email\.service/.test(source)) return true;
  return /\{[^}]*\bsendEmail\b[^}]*\}\s*=\s*await\s+import\(\s*["'][^"']*email\.service/.test(source)
    || /import\(\s*["'][^"']*email\.service["']\s*\)\s*\)\s*\.\s*sendEmail\b/.test(source);
}

before(() => {
  origExecute = db.execute.bind(db);
  origSelect = db.select.bind(db);
  origInsert = db.insert.bind(db);
  origTransaction = db.transaction.bind(db);
  savedEnv = snapshotEnv();
});

beforeEach(() => {
  delete _emailProviderTestHooks.send;
  delete _outboxTestHooks.sendEmailFn;
  armMail(MIGRATED.join(","));
});

afterEach(() => {
  (db as { execute: typeof origExecute }).execute = origExecute;
  (db as { select: typeof origSelect }).select = origSelect;
  (db as { insert: typeof origInsert }).insert = origInsert;
  (db as { transaction: typeof origTransaction }).transaction = origTransaction;
  delete _emailProviderTestHooks.send;
  delete _outboxTestHooks.sendEmailFn;
  restoreEnv(savedEnv);
  invalidatePlatformFlagCache();
});

after(() => {
  restoreEnv(savedEnv);
  invalidatePlatformFlagCache();
});

describe("sendEmail allowlist gate", () => {
  it("refuses a missing or empty type and never calls the provider", async () => {
    const calls = installProvider();
    stubExecute();
    const warns = captureLoggerWarn();
    try {
      const missing = await sendEmail({ to: TO, subject: "s", html: "<p>x</p>" } as SendEmailParams);
      const empty = await sendEmail({ ...baseMessage(), emailType: "" });
      assert.equal(missing.ok, false);
      assert.equal(missing.suppressed, "template_not_allowed");
      assert.equal(missing.error, "email_type_required");
      assert.equal(empty.suppressed, "template_not_allowed");
      assert.equal(empty.error, "email_type_required");
      assert.equal(calls.length, 0);
      const logged = JSON.stringify(warns.lines);
      assert.match(logged, /email_type_required/);
      assertNoRecipient(logged);
    } finally {
      warns.restore();
    }
  });

  it("refuses a listed type when EMAIL_SENDS_ENABLED is not true", async () => {
    delete process.env.EMAIL_SENDS_ENABLED;
    const calls = installProvider();
    const warns = captureLoggerWarn();
    try {
      const result = await sendEmail(baseMessage());
      assert.equal(result.suppressed, "sends_disabled");
      assert.equal(calls.length, 0);
      assertNoRecipient(JSON.stringify(warns.lines));
    } finally {
      warns.restore();
    }
  });

  it("still names sends_disabled when the type is also missing and sends are off", async () => {
    delete process.env.EMAIL_SENDS_ENABLED;
    const calls = installProvider();
    const result = await sendEmail({ to: TO, subject: "s", html: "<p>x</p>" } as SendEmailParams);
    assert.equal(result.suppressed, "sends_disabled");
    assert.equal(calls.length, 0);
  });

  it("refuses every type when the allowlist is unset", async () => {
    armMail(undefined);
    const calls = installProvider();
    stubExecute();
    const warns = captureLoggerWarn();
    try {
      const result = await sendEmail(baseMessage());
      assert.equal(result.ok, false);
      assert.equal(result.suppressed, "template_not_allowed");
      assert.equal(result.error, "EMAIL_TEMPLATE_ALLOWLIST");
      assert.equal(calls.length, 0);
      const logged = JSON.stringify(warns.lines);
      assert.match(logged, /booking_decline/);
      assertNoRecipient(logged);
    } finally {
      warns.restore();
    }
  });

  it("sends a listed type and keeps the type off the provider payload", async () => {
    armMail("booking_decline");
    const calls = installProvider();
    stubExecute();
    const result = await sendEmail(baseMessage());
    assert.equal(result.ok, true);
    assert.equal(result.id, "msg_single_exit");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].emailType, "booking_decline");
    assert.equal("emailType" in calls[0].payload, false);
    assert.equal(calls[0].payload.replyTo, "reply@example.com");
    assert.equal(calls[0].payload.to, TO);
  });

  it("uses EMAIL_REPLY_TO when replyTo is omitted and an explicit replyTo wins", async () => {
    const calls = installProvider();
    stubExecute();
    const omitted = await sendEmail({ to: TO, subject: "s", html: "<p>x</p>", emailType: "booking_decline" });
    const explicit = await sendEmail({
      to: TO, subject: "s", html: "<p>x</p>", emailType: "booking_decline", replyTo: "desk@example.com",
    });
    const blank = await sendEmail({
      to: TO, subject: "s", html: "<p>x</p>", emailType: "booking_decline", replyTo: "  ",
    });
    assert.equal(omitted.ok, true);
    assert.equal(explicit.ok, true);
    assert.equal(blank.ok, true);
    assert.equal(calls[0].payload.replyTo, "reply@example.com");
    assert.equal(calls[1].payload.replyTo, "desk@example.com");
    assert.equal(calls[2].payload.replyTo, "reply@example.com");
  });

  it("refuses an unlisted type and is case-sensitive", async () => {
    armMail("booking_decline");
    const calls = installProvider();
    stubExecute();
    const other = await sendEmail({ ...baseMessage(), emailType: "plan_delivered" });
    const wrongCase = await sendEmail({ ...baseMessage(), emailType: "Booking_Decline" });
    assert.equal(other.suppressed, "template_not_allowed");
    assert.equal(wrongCase.suppressed, "template_not_allowed");
    assert.equal(calls.length, 0);
    armMail("Booking_Decline");
    const still = await sendEmail(baseMessage());
    assert.equal(still.suppressed, "template_not_allowed");
    assert.equal(calls.length, 0);
  });
});

describe("migrated callers pass their email_type", () => {
  it("reaches the provider seam with the type for each caller", async () => {
    const calls = installProvider();
    stubExecute((text) => (text.includes("marketing_email_sender_name") ? footerRows() : []));
    (db as { select: () => unknown }).select = () => makeChain([{
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      city: "Kyoto",
      stripeConnectStatus: "restricted",
      stripeAccountId: "acct_test",
      destination: "Kyoto",
      reason: "unread",
      createdAt: new Date("2026-10-01T00:00:00Z"),
    }]);
    process.env.ADMIN_EMAIL = "admin-digest@example.com";

    await sendLateSuccessRefundEmail({ toEmail: TO, refundAmount: 12 });
    await sendExpiredClaimEmail({ toEmail: TO, serviceName: "Tea" });
    const waitlist = await sendWaitlistOpenEmail({
      to: TO,
      cityName: "Kyoto",
      unsubscribeUrl: "https://example.com/unsub",
    });
    assert.equal(waitlist.sent, true);
    const vendor = await new ProbeVendor().sendBulkVendorEmail("trip-1", ["c1"], "Hello", "Body");
    assert.equal(vendor.sent, 1);
    assert.equal(vendor.failed, 0);
    await runDailyAdminDigest();
    await deliverNightlyQaEmails({
      recipients: ["admin-digest@example.com"],
      subject: "QA",
      html: "<p>qa</p>",
      text: "qa",
    });
    const digest = await sendAdminDigestEmail({
      toEmail: "admin-digest@example.com",
      unresolvedNotifications: [],
      expertsWithoutPayout: [],
    });
    assert.equal(digest.outcome, "sent");

    const seen = calls.map((call) => call.emailType);
    for (const type of DIRECT_TYPES) {
      assert.equal(seen.filter((name) => name === type).length, 1, type);
    }
    assert.equal(calls.every((call) => !("emailType" in call.payload)), true);
    assert.equal(calls.find((call) => call.emailType === "vendor_bulk_email")?.payload.replyTo, "reply@example.com");
    assert.equal(calls.find((call) => call.emailType === "admin_digest_24h")?.payload.replyTo, "reply@example.com");
  });

  it("the admin test-email route sends admin_test_email through sendEmail", async () => {
    const { default: adminRouter } = await import("../routes/admin.routes.js");
    const layer = (adminRouter as unknown as { stack: Array<{ route?: { path?: string; methods?: { post?: boolean }; stack: Array<{ handle: Function }> } }> }).stack.find(
      (entry) => entry.route?.path === "/api/admin/system/test-email" && entry.route?.methods?.post,
    );
    assert.ok(layer?.route);
    const handle = layer.route.stack[layer.route.stack.length - 1].handle;
    (db as { select: () => unknown }).select = () => makeChain([{
      id: "admin-1",
      role: "admin",
      email: "admin-digest@example.com",
      firstName: "Admin",
      lastName: "User",
    }]);
    stubExecute();
    const calls = installProvider();
    const captured = { status: 200, body: null as { ok?: boolean; id?: string; suppressed?: string } | null };
    const res = {
      status(code: number) {
        captured.status = code;
        return { json(data: unknown) { captured.body = data as typeof captured.body; } };
      },
      json(data: unknown) { captured.body = data as typeof captured.body; },
    };
    await handle({ user: { id: "admin-1" }, isAuthenticated: () => true, body: {}, params: {} }, res, () => {});
    assert.equal(captured.status, 200);
    assert.equal(captured.body?.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].emailType, "admin_test_email");
    assert.equal("emailType" in calls[0].payload, false);
    assert.equal(calls[0].payload.replyTo, "reply@example.com");
  });

  async function postTestEmail(env: { sends?: boolean; allowlist?: string; killSwitch?: boolean }) {
    const { default: adminRouter } = await import("../routes/admin.routes.js");
    const layer = (adminRouter as unknown as { stack: Array<{ route?: { path?: string; methods?: { post?: boolean }; stack: Array<{ handle: Function }> } }> }).stack.find(
      (entry) => entry.route?.path === "/api/admin/system/test-email" && entry.route?.methods?.post,
    );
    const handle = layer!.route!.stack[layer!.route!.stack.length - 1].handle;
    if (env.sends === false) delete process.env.EMAIL_SENDS_ENABLED;
    else process.env.EMAIL_SENDS_ENABLED = "true";
    if (env.allowlist === undefined) delete process.env.EMAIL_TEMPLATE_ALLOWLIST;
    else process.env.EMAIL_TEMPLATE_ALLOWLIST = env.allowlist;
    invalidatePlatformFlagCache();
    (db as { select: () => unknown }).select = () => makeChain([{
      id: "admin-1", role: "admin", email: "admin-digest@example.com", firstName: "Admin", lastName: "User",
    }]);
    stubExecute(() => (env.killSwitch ? [{ setting_value: "false" }] : []));
    const calls = installProvider();
    const captured = { status: 200, body: null as { ok?: boolean; error?: string; reason?: string; suppressed?: string; to?: string } | null };
    const res = {
      status(code: number) {
        captured.status = code;
        return { json(data: unknown) { captured.body = data as typeof captured.body; } };
      },
      json(data: unknown) { captured.body = data as typeof captured.body; },
    };
    const logs = spyConsole();
    try {
      await handle({ user: { id: "admin-1" }, isAuthenticated: () => true, body: { to: "admin-digest@example.com" }, params: {} }, res, () => {});
    } finally {
      logs.restore();
    }
    return { captured, calls, logs };
  }

  it("returns the sends-flag refusal on the test-email response", async () => {
    const { captured, calls } = await postTestEmail({ sends: false, allowlist: "admin_test_email" });
    assert.equal(captured.status, 200);
    assert.equal(captured.body?.ok, false);
    assert.equal(captured.body?.reason, "sends_flag");
    assert.match(captured.body?.error ?? "", /sends flag/);
    assert.equal(calls.length, 0);
    assert.equal((captured.body?.error ?? "").includes("admin-digest@example.com"), false);
  });

  it("returns the allowlist refusal on the test-email response", async () => {
    const { captured, calls } = await postTestEmail({ allowlist: "password_reset" });
    assert.equal(captured.status, 200);
    assert.equal(captured.body?.ok, false);
    assert.equal(captured.body?.suppressed, "template_not_allowed");
    assert.equal(captured.body?.reason, "allowlist");
    assert.match(captured.body?.error ?? "", /template allowlist/);
    assert.equal(calls.length, 0);
  });

  it("returns the kill-switch refusal on the test-email response", async () => {
    const { captured, calls } = await postTestEmail({ allowlist: "admin_test_email", killSwitch: true });
    assert.equal(captured.status, 200);
    assert.equal(captured.body?.ok, false);
    assert.equal(captured.body?.reason, "kill_switch");
    assert.match(captured.body?.error ?? "", /kill switch/);
    assert.equal(calls.length, 0);
  });
});

describe("a suppressed result is not a failure", () => {
  it("does not throw and does not log a failure for each caller class", async () => {
    armMail(undefined);
    stubOutboxInsert();
    stubExecute((text) => (text.includes("marketing_email_sender_name") ? footerRows() : []));
    (db as { select: () => unknown }).select = () => makeChain([{
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      city: "Kyoto",
      stripeConnectStatus: "restricted",
      stripeAccountId: "acct_test",
      destination: "Kyoto",
      reason: "unread",
      createdAt: new Date("2026-10-01T00:00:00Z"),
    }]);
    process.env.ADMIN_EMAIL = "admin-digest@example.com";
    const calls = installProvider();
    const logs = spyConsole();
    try {
      await sendBookingDeclineEmail({ toEmail: TO });
      await sendVerificationDecisionEmail({ toEmail: TO, decision: "rejected" });
      await sendPlanDeliveredEmail({ toEmail: TO, tripId: "trip-1" });
      await sendPlanApprovedEmail({ toEmail: TO, tripId: "trip-1" });
      await sendPlanChangesRequestedEmail({ toEmail: TO, tripId: "trip-1", note: "Shorter" });
      await sendNewSuggestionEmail({ toEmail: TO, tripId: "trip-1", suggestionTitle: "A walk" });
      const digest = await sendAdminDigestEmail({
        toEmail: "admin-digest@example.com",
        unresolvedNotifications: [],
        expertsWithoutPayout: [],
      });
      assert.equal(digest.outcome, "not_sent");
      assert.equal(digest.reason, "template_not_allowed");
      await runDailyAdminDigest();
      await deliverNightlyQaEmails({
        recipients: ["admin-digest@example.com"],
        subject: "QA",
        html: "<p>qa</p>",
        text: "qa",
      });
      const vendor = await new ProbeVendor().sendBulkVendorEmail("trip-1", ["c1"], "Hello", "Body");
      assert.equal(vendor.sent, 0);
      assert.equal(vendor.failed, 0);
      const waitlist = await sendWaitlistOpenEmail({
        to: TO,
        cityName: "Kyoto",
        unsubscribeUrl: "https://example.com/unsub",
      });
      assert.equal(waitlist.sent, false);
      assert.equal(calls.length, 0);
      const errorText = logs.errors.join("\n");
      assert.equal(/failed/i.test(errorText), false, errorText);
      assert.match(logs.warns.join("\n"), /not sent/);
      assertNoRecipient(logs.warns.filter((line) => /not sent/.test(line)).join("\n"));
    } finally {
      logs.restore();
    }
  });
});

describe("outbox senders hold an unlisted type and the drain sends a listed one", () => {
  it("stores each sender's payload, holds it unlisted, and sends that payload once listed", async () => {
    armMail("password_reset");
    const calls = installProvider();
    const inserted = stubOutboxInsert();
    const captured = stubExecute();
    await sendBookingDeclineEmail({ toEmail: TO, serviceName: "Tea", bookingId: "book-1" });
    await sendVerificationDecisionEmail({
      toEmail: TO, decision: "verified", userId: "provider-1", priorStatus: "pending",
    });
    await sendPlanDeliveredEmail({ toEmail: TO, tripId: "trip-1" });
    await sendPlanApprovedEmail({ toEmail: TO, tripId: "trip-1" });
    await sendPlanChangesRequestedEmail({ toEmail: TO, tripId: "trip-1", note: "Shorter" });
    await sendNewSuggestionEmail({ toEmail: TO, tripId: "trip-1", suggestionTitle: "A walk", suggestionId: "sug-1" });
    assert.equal(calls.length, 0);
    assert.deepEqual(inserted.map((row) => row.emailType), [...OUTBOX_TYPES]);
    for (const row of inserted) {
      assert.equal(typeof row.subject, "string");
      assert.equal(typeof row.html, "string");
      assert.ok(String(row.html).length > 0);
      assert.equal(row.replyTo, undefined);
    }
    assert.equal((inserted[0].metadata as { dedupeKey?: string }).dedupeKey, "booking_decline:book-1");
    assert.match(String((inserted[1].metadata as { dedupeKey?: string }).dedupeKey), /^verification_decision:provider-1:pending:verified:/);
    assert.equal((inserted[2].metadata as { tripId?: string; dedupeKey?: string }).tripId, "trip-1");
    assert.equal((inserted[2].metadata as { dedupeKey?: string }).dedupeKey, undefined);
    assert.equal((inserted[5].metadata as { dedupeKey?: string }).dedupeKey, "new_suggestion:sug-1");
    assert.equal(captured.filter((text) => text.includes("held")).length >= OUTBOX_TYPES.length, true);
    assert.equal(captured.some((text) => /attempt_count\s*=/.test(text)), false);

    for (const row of inserted) {
      const emailType = String(row.emailType);
      armMail(emailType);
      const sent = installProvider();
      stubExecute((text) => {
        if (text.includes("FOR UPDATE SKIP LOCKED") && text.includes(emailType)) {
          return [{
            id: 40,
            to_email: TO,
            subject: row.subject,
            html: row.html,
            text_body: row.textBody ?? null,
            from_address: null,
            reply_to: null,
            attempt_count: 0,
            max_attempts: 6,
            email_type: emailType,
            metadata: row.metadata ?? {},
          }];
        }
        return [];
      });
      const drain = await drainOutbox();
      assert.equal(drain.drained, 1, emailType);
      assert.equal(sent.length, 1, emailType);
      assert.equal(sent[0].emailType, emailType);
      assert.equal(sent[0].payload.html, row.html);
      assert.equal(sent[0].payload.subject, row.subject);
      assert.equal(sent[0].payload.replyTo, "reply@example.com");
      assert.equal("emailType" in sent[0].payload, false);
    }
  });
});

describe("admin digest claim", () => {
  it("releases the UTC-day claim when the send is suppressed and logs the reason and type", async () => {
    const dateKey = "2098-07-04";
    await releaseAdminDigestClaim(dateKey);
    assert.equal(await claimAdminDigestSend(dateKey), true);
    const logs = spyConsole();
    try {
      await settleAdminDigestDelivery(dateKey, {
        outcome: "not_sent",
        reason: "template_not_allowed",
        emailType: "admin_digest_24h",
      });
      const warned = logs.warns.join("\n");
      assert.match(warned, /template_not_allowed/);
      assert.match(warned, /email_type=admin_digest_24h/);
      assert.equal(warned.includes("@"), false);
      assert.equal(await claimAdminDigestSend(dateKey), true);
      const source = readFileSync(path.join(ROOT, "server/services/admin-digest-scheduler.service.ts"), "utf8");
      assert.match(source, /delivery\.outcome !== "sent"[\s\S]*settleAdminDigestDelivery\(dateKey, delivery\)/);
    } finally {
      logs.restore();
      await releaseAdminDigestClaim(dateKey);
    }
  });
});

describe("outbox claim stays in front of sendEmail", () => {
  it("does not deliver an unlisted row and does not call the provider", async () => {
    armMail("booking_confirmation");
    const calls = installProvider();
    const captured = stubExecute((text) => {
      const claim = text.includes("FOR UPDATE SKIP LOCKED");
      const named = text.includes("ARRAY[") && text.includes("booking_decline");
      if (claim && named) {
        return [{
          id: 7,
          to_email: TO,
          subject: "Decline",
          html: "<p>no</p>",
          text_body: null,
          from_address: null,
          reply_to: null,
          attempt_count: 0,
          max_attempts: 6,
          email_type: "booking_decline",
          metadata: {},
        }];
      }
      if (text.includes("SELECT email_type FROM email_outbox")) {
        return [{ email_type: "booking_decline" }];
      }
      return [];
    });
    const drain = await drainOutbox();
    assert.equal(drain.drained, 0);
    await deliverQueuedEmail(7);
    assert.equal(calls.length, 0);
    const claimSql = captured.find((text) => text.includes("FOR UPDATE SKIP LOCKED")) ?? "";
    assert.match(claimSql, /email_type = ANY/);
    assert.equal(claimSql.includes("booking_decline"), false);
    assert.equal(captured.some((text) => /attempt_count\s*=/.test(text)), false);
  });

  it("delivers a listed row once through sendEmail with that type", async () => {
    armMail("booking_confirmation");
    const calls = installProvider();
    const captured = stubExecute((text) => {
      const claim = text.includes("FOR UPDATE SKIP LOCKED");
      const named = text.includes("ARRAY[") && text.includes("booking_confirmation");
      if (claim && named) {
        return [{
          id: 8,
          to_email: TO,
          subject: "Confirmed",
          html: "<p>yes</p>",
          text_body: null,
          from_address: null,
          reply_to: "reply@example.com",
          attempt_count: 0,
          max_attempts: 6,
          email_type: "booking_confirmation",
          metadata: {},
        }];
      }
      return [];
    });
    const drain = await drainOutbox();
    assert.equal(drain.drained, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].emailType, "booking_confirmation");
    assert.equal("emailType" in calls[0].payload, false);
    const sent = captured.find((text) => text.includes("status") && text.includes("sent") && text.includes("resend_id"));
    assert.ok(sent, "listed row was not marked sent");
    assert.equal(captured.filter((text) => text.includes("EMAIL_TEMPLATE_ALLOWLIST") && text.includes("held")).length, 0);
  });
});

describe("one provider call", () => {
  it("server source has one emails.send call and no deleted confirmation sender", () => {
    const callNeedle = "emails" + ".send(";
    const deletedNeedle = "sendBooking" + "ConfirmationEmail";
    const serverFiles: string[] = [];
    walk(path.join(ROOT, "server"), serverFiles);
    const hits = serverFiles.filter((file) => /\.(ts|tsx|js|mjs|cjs)$/.test(file) && readFileSync(file, "utf8").includes(callNeedle));
    assert.deepEqual(hits.map((file) => path.relative(ROOT, file)), ["server/services/email.service.ts"]);

    const deleted: string[] = [];
    for (const top of ["server", "scripts", "docs", "client"]) {
      const files: string[] = [];
      walk(path.join(ROOT, top), files);
      for (const file of files) {
        if (!/\.(ts|tsx|js|mjs|cjs|md)$/.test(file)) continue;
        if (readFileSync(file, "utf8").includes(deletedNeedle)) deleted.push(path.relative(ROOT, file));
      }
    }
    assert.deepEqual(deleted, []);

    const missing: string[] = [];
    for (const file of serverFiles) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      if (file.includes(`${path.sep}__tests__${path.sep}`) || file.endsWith(".test.ts")) continue;
      const source = readFileSync(file, "utf8");
      if (!usesRealSendEmail(file, source)) continue;
      for (const line of missingEmailTypeLines(source)) missing.push(`${path.relative(ROOT, file)}:${line}`);
    }
    assert.deepEqual(missing, []);

    const replyNull = "replyTo" + ": null";
    const replyHits = serverFiles.filter((file) => {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) return false;
      if (file.includes(`${path.sep}__tests__${path.sep}`) || file.endsWith(".test.ts")) return false;
      return readFileSync(file, "utf8").includes(replyNull);
    });
    assert.deepEqual(replyHits.map((file) => path.relative(ROOT, file)), []);
  });
});
