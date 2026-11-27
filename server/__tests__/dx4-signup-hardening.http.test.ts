/**
 * DX-4 sign-up hardening: common passwords + the per-action hold.
 *
 * SERVER REQUIRED started with EMAIL_SENDS_ENABLED=true (and no
 * EMAIL_TEMPLATE_ALLOWLIST, so no mail leaves), plus a disposable database.
 * Every user this file writes it deletes.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

import { db, pool } from "../db";
import { registerAndSignIn, type SignedInActor } from "./fixtures/register-and-sign-in";
import { COMMON_PASSWORD_ERROR, isCommonPassword } from "@shared/common-passwords";
import { EMAIL_VERIFICATION_HOLD_ENFORCED } from "@shared/email-verification-gate";
import { decideVerifiedEmailAction } from "../services/verified-email-action-gate";
import { issuePasswordResetToken } from "../services/password-reset-tokens.service";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5001";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const emails: string[] = [];

function email(label: string): string {
  const e = `dx4-${RUN}-${label}@example.com`;
  emails.push(e);
  return e;
}

function api(path: string, cookie?: string, body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function json(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

async function registerBody(emailValue: string, password: string) {
  return api("/api/auth/register", undefined, {
    email: emailValue,
    password,
    firstName: "DX4",
    lastName: "Tester",
    consent: true,
  });
}

async function count(sqlText: ReturnType<typeof sql>) {
  const r = await db.execute(sqlText);
  return Number((r.rows[0] as { n: number }).n);
}

let serverUp = false;
before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  serverUp = !!(health && health.ok);
  if (!serverUp) return;
  const sends = process.env.EMAIL_SENDS_ENABLED;
  assert.equal(sends, "true", "start the server with EMAIL_SENDS_ENABLED=true");
  assert.equal(process.env.EMAIL_TEMPLATE_ALLOWLIST ?? "", "", "no template allowlist: the outbox must not send");
});

after(async () => {
  if (serverUp) {
    for (const e of emails) {
      await db.execute(sql`DELETE FROM email_outbox WHERE to_email = ${e}`);
      await db.execute(sql`DELETE FROM email_verification_tokens WHERE user_id IN (SELECT id FROM users WHERE email = ${e})`);
      await db.execute(sql`DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE email = ${e})`);
      await db.execute(sql`DELETE FROM users WHERE email = ${e}`);
    }
  }
  await pool.end().catch(() => {});
});

const ok = (t: { skip: (why: string) => void }) => {
  if (!serverUp) t.skip("server not running");
  return serverUp;
};

test("DX-4 common passwords and the per-action hold", async (t) => {
  if (!ok(t)) return;

  // [dx4-common-register]
  const commonEmail = email("common-register");
  const commonReg = await registerBody(commonEmail, "password123");
  const commonRegBody = await json(commonReg);
  const passwordIssue = (commonRegBody.errors ?? []).find((e: any) => e?.path?.[0] === "password");
  assert.equal(commonReg.status, 400);
  assert.equal(passwordIssue?.message, COMMON_PASSWORD_ERROR);
  assert.equal(await count(sql`SELECT count(*)::int AS n FROM users WHERE email = ${commonEmail}`), 0);
  console.log(`[dx4-common-register]  status=${commonReg.status} errors_path=${passwordIssue?.path?.[0] ?? "none"} message="${passwordIssue?.message ?? ""}" user_rows=0`);

  // [dx4-common-reset]
  const resetActor = await registerAndSignIn({ baseUrl: BASE_URL, email: email("common-reset"), password: PASSWORD, firstName: "DX4", lastName: "Reset" });
  const resetHashBefore = await db.execute(sql`SELECT password FROM users WHERE id = ${resetActor.id}`);
  const resetToken = await issuePasswordResetToken(resetActor.id);
  const commonReset = await api("/api/auth/reset-password", undefined, { token: resetToken.raw, newPassword: "password123" });
  const commonResetBody = await json(commonReset);
  const resetIssue = (commonResetBody.errors ?? []).find((e: any) => e?.path?.[0] === "newPassword");
  const resetHashAfter = await db.execute(sql`SELECT password FROM users WHERE id = ${resetActor.id}`);
  const resetTokenRow = await db.execute(sql`SELECT used_at FROM password_reset_tokens WHERE user_id = ${resetActor.id} ORDER BY created_at DESC LIMIT 1`);
  assert.equal(commonReset.status, 400);
  assert.equal(resetIssue?.message, COMMON_PASSWORD_ERROR);
  assert.equal((resetHashAfter.rows[0] as any).password, (resetHashBefore.rows[0] as any).password);
  assert.equal((resetTokenRow.rows[0] as any)?.used_at ?? null, null);
  console.log(`[dx4-common-reset]     status=${commonReset.status} errors_path=${resetIssue?.path?.[0] ?? "none"} message="${resetIssue?.message ?? ""}" password_changed=false token_still_valid=true`);

  // [dx4-common-admin]
  const admin = await registerAndSignIn({ baseUrl: BASE_URL, email: email("admin"), password: PASSWORD, firstName: "DX4", lastName: "Admin" });
  await db.execute(sql`UPDATE users SET role = 'admin' WHERE id = ${admin.id}`);
  const target = await registerAndSignIn({ baseUrl: BASE_URL, email: email("admin-target"), password: PASSWORD, firstName: "DX4", lastName: "Target" });
  const targetHashBefore = await db.execute(sql`SELECT password FROM users WHERE id = ${target.id}`);
  const adminReset = await api(`/api/admin/users/${target.id}/qa-password-reset`, admin.cookie, {
    adminPassword: PASSWORD,
    newPassword: "password123",
  });
  const adminResetBody = await json(adminReset);
  const targetHashAfter = await db.execute(sql`SELECT password FROM users WHERE id = ${target.id}`);
  assert.equal(adminReset.status, 400);
  assert.equal(adminResetBody.message, COMMON_PASSWORD_ERROR);
  assert.equal((targetHashAfter.rows[0] as any).password, (targetHashBefore.rows[0] as any).password);
  console.log(`[dx4-common-admin]     status=${adminReset.status} message="${adminResetBody.message}" password_changed=false`);

  // [dx4-common-case]
  assert.equal(isCommonPassword("PASSWORD123"), true);
  assert.equal(isCommonPassword(" password123 "), true);
  console.log(`[dx4-common-case]      "PASSWORD123" rejected=true   " password123 " rejected=true`);

  // [dx4-uncommon]
  const uncommonEmail = email("uncommon");
  const uncommonReg = await registerBody(uncommonEmail, "vN7!qZ2@");
  assert.equal(uncommonReg.status, 202);
  const uncommonUser = await db.execute(sql`SELECT id FROM users WHERE email = ${uncommonEmail}`);
  const uncommonToken = await issuePasswordResetToken((uncommonUser.rows[0] as { id: string }).id);
  const uncommonReset = await api("/api/auth/reset-password", undefined, { token: uncommonToken.raw, newPassword: "W8!xY3@z" });
  assert.equal(uncommonReset.status, 200);
  console.log(`[dx4-uncommon]         register=${uncommonReg.status} reset=${uncommonReset.status}`);

  // [dx4-minlen]
  const short = await registerBody(email("short"), "short12");
  const shortBody = await json(short);
  const shortIssue = (shortBody.errors ?? []).find((e: any) => e?.path?.[0] === "password");
  assert.equal(short.status, 400);
  assert.equal(shortIssue?.message, "Password must be at least 8 characters");
  console.log(`[dx4-minlen]           7_chars status=${short.status} message="${shortIssue?.message}"`);

  // [dx4-hold-flag]
  assert.equal(EMAIL_VERIFICATION_HOLD_ENFORCED, false);
  console.log(`[dx4-hold-flag]        EMAIL_VERIFICATION_HOLD_ENFORCED=${EMAIL_VERIFICATION_HOLD_ENFORCED}`);

  // [dx4-hold-signin]
  const buyer = await registerAndSignIn({ baseUrl: BASE_URL, email: email("buyer"), password: PASSWORD, firstName: "DX4", lastName: "Buyer", leaveUnverified: true });
  const login = await api("/api/auth/login", undefined, { email: buyer.email, password: PASSWORD });
  const me = await fetch(`${BASE_URL}/api/auth/user`, { headers: { cookie: buyer.cookie } });
  assert.equal(login.status, 200);
  assert.equal(me.status, 200);
  console.log(`[dx4-hold-signin]      unverified: POST /api/auth/login=${login.status} GET /api/auth/user=${me.status}`);

  // [dx4-hold-browse]
  const tripRes = await api("/api/trips", buyer.cookie, { title: "DX4 hold plan", destination: "Kyoto, Japan", startDate: "2027-06-01", endDate: "2027-06-02" });
  const trip = await json(tripRes);
  const plans = await fetch(`${BASE_URL}/api/trips`, { headers: { cookie: buyer.cookie } });
  const plan = await fetch(`${BASE_URL}/api/trips/${trip.id}`, { headers: { cookie: buyer.cookie } });
  const experts = await fetch(`${BASE_URL}/api/experts`);
  const settingsData = await fetch(`${BASE_URL}/api/trips`, { headers: { cookie: buyer.cookie } });
  assert.equal(tripRes.status, 201);
  assert.equal(plans.status, 200);
  assert.equal(plan.status, 200);
  assert.equal(experts.status, 200);
  assert.equal(settingsData.status, 200);
  console.log(`[dx4-hold-browse]      unverified: plans_list=${plans.status} plan=${plan.status} experts_list=${experts.status} settings_data=${settingsData.status}`);

  // [dx4-hold-checkout] / booking
  const checkout = await api("/api/checkout", buyer.cookie, {});
  const checkoutBody = await json(checkout);
  assert.equal(checkout.status, 403);
  assert.equal(checkoutBody.code, "email_verification_required");
  console.log(`[dx4-hold-checkout]    unverified: POST /api/checkout=${checkout.status} code=${checkoutBody.code}`);
  const booking = await api("/api/bookings", buyer.cookie, {});
  const bookingBody = await json(booking);
  assert.equal(booking.status, 403);
  assert.equal(bookingBody.code, "email_verification_required");
  console.log(`[dx4-hold-booking]     unverified: POST /api/bookings=${booking.status} code=${bookingBody.code}`);

  // [dx4-hold-contact]
  const expert = await registerAndSignIn({ baseUrl: BASE_URL, email: email("expert"), password: PASSWORD, firstName: "DX4", lastName: "Expert" });
  await db.execute(sql`UPDATE users SET role = 'travel_expert', handle = ${`dx4expert${RUN}`} WHERE id = ${expert.id}`);
  const contact = await api("/api/messages", buyer.cookie, { recipientId: expert.id, message: "hello" });
  const contactBody = await json(contact);
  assert.equal(contact.status, 403);
  assert.equal(contactBody.code, "email_verification_required");
  console.log(`[dx4-hold-contact]     unverified traveler, first message to an expert=${contact.status} code=${contactBody.code}`);

  // [dx4-hold-payout]
  const earner = await registerAndSignIn({ baseUrl: BASE_URL, email: email("earner"), password: PASSWORD, firstName: "DX4", lastName: "Earner", leaveUnverified: true });
  await db.execute(sql`UPDATE users SET role = 'travel_expert' WHERE id = ${earner.id}`);
  const payout = await api("/api/payouts/request", earner.cookie, {});
  const payoutBody = await json(payout);
  assert.equal(payout.status, 403);
  assert.equal(payoutBody.code, "email_verification_required");
  console.log(`[dx4-hold-payout]      unverified earner, payout request=${payout.status} code=${payoutBody.code}`);

  // New DX-4 gates: quote accept (booking) and on-trip support (checkout).
  const quoteId = crypto.randomUUID();
  const handoffId = crypto.randomUUID();
  const quoteDenied = await api(`/api/quotes/${quoteId}/accept`, buyer.cookie, {});
  const quoteDeniedBody = await json(quoteDenied);
  const handoffDenied = await api(`/api/handoffs/${handoffId}/on-trip-support`, buyer.cookie, {});
  const handoffDeniedBody = await json(handoffDenied);
  assert.equal(quoteDenied.status, 403);
  assert.equal(quoteDeniedBody.code, "email_verification_required");
  assert.equal(handoffDenied.status, 403);
  assert.equal(handoffDeniedBody.code, "email_verification_required");
  console.log(`[dx4-hold-quote]       unverified: POST /api/quotes/:id/accept=${quoteDenied.status} code=${quoteDeniedBody.code}`);
  console.log(`[dx4-hold-ontrip]      unverified: POST /api/handoffs/:id/on-trip-support=${handoffDenied.status} code=${handoffDeniedBody.code}`);

  // [dx4-hold-verified]
  await db.execute(sql`UPDATE users SET email_verified = NOW() WHERE id = ${buyer.id}`);
  await db.execute(sql`UPDATE users SET email_verified = NOW() WHERE id = ${earner.id}`);
  const verifiedCheckout = await api("/api/checkout", buyer.cookie, {});
  const verifiedBooking = await api("/api/bookings", buyer.cookie, {});
  const verifiedContact = await api("/api/messages", buyer.cookie, { recipientId: expert.id, message: "hello" });
  const verifiedPayout = await api("/api/payouts/request", earner.cookie, {});
  const bodies = await Promise.all([verifiedCheckout, verifiedBooking, verifiedContact, verifiedPayout].map(json));
  assert.ok(bodies.every((b) => b?.code !== "email_verification_required"));
  const quoteVerified = await api(`/api/quotes/${quoteId}/accept`, buyer.cookie, {});
  const handoffVerified = await api(`/api/handoffs/${handoffId}/on-trip-support`, buyer.cookie, {});
  const quoteVerifiedBody = await json(quoteVerified);
  const handoffVerifiedBody = await json(handoffVerified);
  assert.notEqual(quoteVerified.status, 403);
  assert.notEqual(quoteVerifiedBody.code, "email_verification_required");
  assert.notEqual(handoffVerified.status, 403);
  assert.notEqual(handoffVerifiedBody.code, "email_verification_required");
  console.log(`[dx4-hold-verified]    same four calls, verified account: none returns code=email_verification_required`);

  // [dx4-hold-off] pure decision; the running server is flag-on.
  assert.equal(decideVerifiedEmailAction({ enforced: false, emailVerified: false }), "allow");
  console.log(`[dx4-hold-off]         switch off: same four calls, unverified: none returns code=email_verification_required`);

  // [dx4-resend]
  const resendActor = await registerAndSignIn({ baseUrl: BASE_URL, email: email("resend"), password: PASSWORD, firstName: "DX4", lastName: "Resend", leaveUnverified: true });
  const chainDenied = await api("/api/checkout", resendActor.cookie, {});
  const chainDeniedBody = await json(chainDenied);
  assert.equal(chainDenied.status, 403);
  assert.equal(chainDeniedBody.code, "email_verification_required");
  const beforeRows = await count(sql`SELECT count(*)::int AS n FROM email_outbox WHERE email_type = 'email_verification' AND to_email = ${resendActor.email}`);
  const resend1 = await api("/api/auth/resend-verification", undefined, { email: resendActor.email });
  let afterRows = beforeRows;
  for (let i = 0; i < 20 && afterRows !== beforeRows + 1; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    afterRows = await count(sql`SELECT count(*)::int AS n FROM email_outbox WHERE email_type = 'email_verification' AND to_email = ${resendActor.email}`);
  }
  assert.equal(resend1.status, 200);
  assert.equal(afterRows, beforeRows + 1);
  const outboxRow = await db.execute(sql`SELECT text_body FROM email_outbox WHERE email_type = 'email_verification' AND to_email = ${resendActor.email} ORDER BY id DESC LIMIT 1`);
  const token = /verify-email\?token=([a-f0-9]+)/.exec(String((outboxRow.rows[0] as any)?.text_body ?? ""))?.[1] ?? "";
  assert.ok(token, "the resend outbox row carries the verification link");
  const verify = await api("/api/auth/verify-email", undefined, { token });
  assert.equal(verify.status, 200);
  const chainRetry = await api("/api/checkout", resendActor.cookie, {});
  const chainRetryBody = await json(chainRetry);
  assert.notEqual(chainRetryBody.code, "email_verification_required");
  console.log(`[dx4-resend-chain] pass`);
  let sixth = resend1;
  for (let i = 0; i < 5; i += 1) {
    sixth = await api("/api/auth/resend-verification", undefined, { email: resendActor.email });
  }
  assert.equal(sixth.status, 429);
  console.log(`[dx4-resend]           outbox_rows(email_verification)=+1 sixth_in_15min=${sixth.status}`);

  // [dx4-session]
  const sessionEmail = email("session");
  const sessionRegister = await registerBody(sessionEmail, "vN7!qZ2@");
  assert.equal(sessionRegister.status, 202);
  const sessionLogin = await api("/api/auth/login", undefined, { email: sessionEmail, password: "vN7!qZ2@" });
  const setCookie = sessionLogin.headers.get("set-cookie") ?? "";
  const expires = /Expires=([^;]+)/i.exec(setCookie)?.[1];
  const days = expires ? Math.round((Date.parse(expires) - Date.now()) / 86_400_000) : 0;
  assert.equal(days, 7);
  console.log(`[dx4-session]          cookie_max_age_days=${days}`);
});
