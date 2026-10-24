/**
 * Ops gap 6 — critical mail is one outbox row per logical send.
 *
 *   npx tsx --test --test-concurrency=1 server/__tests__/critical-email-outbox.test.ts
 *
 * The provider is the outbox test seam. No Resend call is made.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db.js";
import { _outboxTestHooks } from "../services/email-outbox.service.js";
import { invalidatePlatformFlagCache } from "../services/platform-flags.js";
import {
  sendBookingCancellationWithRefundEmail,
  sendEmail,
  sendEmailVerificationEmail,
  sendExpertApplicationApprovalEmail,
  sendExpertApplicationRejectionEmail,
  sendPasswordResetEmail,
  sendPaymentFailedEmail,
  sendProviderApplicationApprovalEmail,
  sendProviderApplicationRejectionEmail,
} from "../services/email.service.js";

type Stored = { id: number; emailType: string; subject: string; html: string; metadata: Record<string, unknown> };

let stored: Stored[] = [];
let inserts = 0;
let sends = 0;
let origTransaction: typeof db.transaction;
let origExecute: typeof db.execute;
let origInsert: typeof db.insert;
const priorEnv = process.env.NODE_ENV;
const priorInbox = process.env.ITINERARY_OUTCOME_TEST_EMAIL;

function clauseText(clause: unknown): string {
  if (typeof clause === "string") return clause;
  if (clause && typeof clause === "object" && "queryChunks" in clause) {
    return ((clause as { queryChunks: unknown[] }).queryChunks).map(clauseText).join("");
  }
  if (clause && typeof clause === "object" && "value" in clause) {
    const value = (clause as { value: unknown }).value;
    return value == null ? "" : String(value);
  }
  return String(clause ?? "");
}

beforeEach(() => {
  stored = [];
  inserts = 0;
  sends = 0;
  process.env.EMAIL_SENDS_ENABLED = "true";
  process.env.EMAIL_TEMPLATE_ALLOWLIST = "password_reset,email_verification,payment_failed,cancellation_refund,expert_application_approved,expert_application_rejected,provider_application_approved,provider_application_rejected";
  invalidatePlatformFlagCache();
  origTransaction = db.transaction.bind(db);
  origExecute = db.execute.bind(db);
  origInsert = db.insert.bind(db);
  _outboxTestHooks.sendEmailFn = async () => {
    sends += 1;
    return { ok: true, id: "outbox-test" };
  };
  (db as any).execute = () => Promise.resolve({ rows: [] });
  const tx = {
    execute: () => Promise.resolve({ rows: [] }),
    select: () => ({
      from: () => ({
        where: (clause: unknown) => ({
          limit: () => {
            const text = clauseText(clause);
            const hit = stored.find((row) => typeof row.metadata.dedupeKey === "string" && text.includes(String(row.metadata.dedupeKey)));
            return Promise.resolve(hit ? [{ id: hit.id }] : []);
          },
        }),
      }),
    }),
    insert: () => ({
      values: (row: Stored) => ({
        returning: () => {
          inserts += 1;
          const saved = { ...row, id: inserts };
          stored.push(saved);
          return Promise.resolve([{ id: saved.id }]);
        },
      }),
    }),
  };
  (db as any).transaction = async function mockedTransaction(fn: (trx: typeof tx) => Promise<unknown>) {
    return fn(tx);
  };
  (db as any).insert = () => ({
    values: (row: Stored) => ({
      returning: () => {
        inserts += 1;
        const saved = { ...row, id: inserts };
        stored.push(saved);
        return Promise.resolve([{ id: saved.id }]);
      },
    }),
  });
});

afterEach(() => {
  (db as any).transaction = origTransaction;
  (db as any).execute = origExecute;
  (db as any).insert = origInsert;
  delete _outboxTestHooks.sendEmailFn;
  invalidatePlatformFlagCache();
  if (priorEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = priorEnv;
  if (priorInbox === undefined) delete process.env.ITINERARY_OUTCOME_TEST_EMAIL;
  else process.env.ITINERARY_OUTCOME_TEST_EMAIL = priorInbox;
});

describe("canQueueGenerationNotice on sendEmail", () => {
  it("refuses a development recipient that is not the approved inbox", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.ITINERARY_OUTCOME_TEST_EMAIL;
    const result = await sendEmail({
      to: "traveler@example.com",
      subject: "Reset your Traveloure password",
      html: "<p>x</p>",
      authCritical: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.suppressed, "development_gate");
    assert.equal(result.error, "No approved development inbox");
  });
});

describe("critical senders enqueue one row", () => {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  it("enqueues password reset once for the same token and keeps the issued expiry", async () => {
    const params = {
      toEmail: "traveler@example.com",
      firstName: "Aiko",
      resetUrl: "https://app.example/reset-password?token=raw-token",
      expiresInMinutes: 60,
      linkExpiresAt: expiresAt,
      tokenHash: "abc123",
    };
    await sendPasswordResetEmail(params);
    await sendPasswordResetEmail(params);
    assert.equal(inserts, 1);
    assert.equal(sends, 1);
    assert.equal(stored[0].emailType, "password_reset");
    assert.equal(stored[0].subject, "Reset your Traveloure password");
    assert.equal(stored[0].metadata.dedupeKey, "password_reset:abc123");
    assert.equal(stored[0].metadata.authCritical, true);
    assert.equal(stored[0].metadata.linkExpiresAt, expiresAt.toISOString());
    assert.match(stored[0].html, /expires in 60 minutes/);
    assert.match(stored[0].html, /reset-password\?token=raw-token/);
  });

  it("enqueues verification once and keeps the 24h sentence", async () => {
    await sendEmailVerificationEmail({
      toEmail: "traveler@example.com",
      verifyUrl: "https://app.example/verify-email?token=raw-verify",
      expiresInHours: 24,
      linkExpiresAt: expiresAt,
      tokenHash: "verifyhash",
    });
    await sendEmailVerificationEmail({
      toEmail: "traveler@example.com",
      verifyUrl: "https://app.example/verify-email?token=raw-verify",
      expiresInHours: 24,
      linkExpiresAt: expiresAt,
      tokenHash: "verifyhash",
    });
    assert.equal(inserts, 1);
    assert.equal(sends, 1);
    assert.equal(stored[0].emailType, "email_verification");
    assert.equal(stored[0].subject, "Confirm your Traveloure email");
    assert.equal(stored[0].metadata.dedupeKey, "email_verification:verifyhash");
    assert.equal(stored[0].metadata.linkExpiresAt, expiresAt.toISOString());
    assert.match(stored[0].html, /expires in 24 hours/);
  });

  it("enqueues payment-failed once per booking", async () => {
    const params = { toEmail: "traveler@example.com", userName: "Aiko", bookingTitle: "Tea ceremony", bookingId: "bk-1" };
    await sendPaymentFailedEmail(params);
    await sendPaymentFailedEmail(params);
    assert.equal(inserts, 1);
    assert.equal(stored[0].emailType, "payment_failed");
    assert.equal(stored[0].metadata.dedupeKey, "payment_failed:bk-1");
    assert.match(stored[0].subject, /Payment failed — Tea ceremony/);
    assert.equal(stored[0].metadata.authCritical, undefined);
  });

  it("enqueues cancellation-with-refund once per booking", async () => {
    const params = {
      toEmail: "traveler@example.com",
      refundAmount: 40,
      bookingId: "bk-9",
      serviceName: "Walk",
    };
    await sendBookingCancellationWithRefundEmail(params);
    await sendBookingCancellationWithRefundEmail(params);
    assert.equal(inserts, 1);
    assert.equal(stored[0].emailType, "cancellation_refund");
    assert.equal(stored[0].metadata.dedupeKey, "cancellation_refund:bk-9");
    assert.match(stored[0].html, /Full Refund Issued/);
  });

  it("enqueues each application decision once, and a changed rejection note again", async () => {
    await sendExpertApplicationApprovalEmail({
      toEmail: "expert@example.com", applicationId: "app-1", priorStatus: "pending",
    });
    await sendExpertApplicationApprovalEmail({
      toEmail: "expert@example.com", applicationId: "app-1", priorStatus: "pending",
    });
    await sendProviderApplicationApprovalEmail({
      toEmail: "provider@example.com", applicationId: "app-2", priorStatus: "pending",
    });
    await sendExpertApplicationRejectionEmail({
      toEmail: "expert@example.com", applicationId: "app-1", priorStatus: "pending", rejectionMessage: "Need a clearer bio",
    });
    await sendExpertApplicationRejectionEmail({
      toEmail: "expert@example.com", applicationId: "app-1", priorStatus: "pending", rejectionMessage: "Need a clearer bio",
    });
    await sendProviderApplicationRejectionEmail({
      toEmail: "provider@example.com", applicationId: "app-2", priorStatus: "pending", rejectionMessage: "First note",
    });
    await sendProviderApplicationRejectionEmail({
      toEmail: "provider@example.com", applicationId: "app-2", priorStatus: "pending", rejectionMessage: "Updated note",
    });

    const types = stored.map((row) => row.emailType);
    assert.deepEqual(types, [
      "expert_application_approved",
      "provider_application_approved",
      "expert_application_rejected",
      "provider_application_rejected",
      "provider_application_rejected",
    ]);
    assert.equal(sends, 5);
    assert.match(stored[0].subject, /expert application has been approved/);
    assert.match(stored[2].html, /Need a clearer bio/);
    assert.notEqual(stored[3].metadata.dedupeKey, stored[4].metadata.dedupeKey);
  });
});
