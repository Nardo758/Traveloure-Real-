/**
 * Exercise the real sendEmail adapter with the SDK method mocked, not a sendEmail
 * replacement. Synthetic keys/config only; any unexpected network call fails.
 * This proves argument forwarding, never Resend's dedup retention or delivery.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Resend } from "resend";
import { db } from "../db";
import { invalidatePlatformFlagCache } from "../services/platform-flags";
import { sendEmail } from "../services/email.service";

test("cart retry key and payload survive the actual sendEmail → Resend SDK adapter", async t => {
  assert.equal(process.env.NODE_ENV, "test");
  // The allowlisted verifier removes real provider credentials before import.
  assert.equal(process.env.RESEND_API_KEY, undefined);
  const keys = ["RESEND_API_KEY", "EMAIL_FROM_NOREPLY", "EMAIL_REPLY_TO"] as const;
  const previous = keys.map(key => process.env[key]);
  process.env.RESEND_API_KEY = "re_synthetic_provider_proof_only";
  process.env.EMAIL_FROM_NOREPLY = "proof@traveloure-qa.test";
  process.env.EMAIL_REPLY_TO = "reply@traveloure-qa.test";
  let networkCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    networkCalls++;
    throw new Error("Network is forbidden in provider proof");
  });
  // No flags changed; only the isolated unit reader returns the default empty settings.
  t.mock.method(db, "execute", async () => ({ rows: [] }));
  invalidatePlatformFlagCache();
  const calls: { payload: unknown; options: unknown }[] = [];
  const accepted = new Map<string, string>();
  const sdkPrototype = Object.getPrototypeOf(new Resend("re_synthetic_probe_only").emails);
  t.mock.method(sdkPrototype, "send", async (payload: unknown, options: { idempotencyKey: string }) => {
    calls.push({ payload: structuredClone(payload), options: structuredClone(options) });
    assert.match(options.idempotencyKey, /^cart-reminder-\d+$/);
    if (!accepted.has(options.idempotencyKey)) {
      accepted.set(options.idempotencyKey, `synthetic_${accepted.size + 1}`);
    }
    return { data: { id: accepted.get(options.idempotencyKey) }, error: null };
  });
  try {
    const params = {
      to: "recipient@traveloure-qa.test", subject: "Synthetic reminder", html: "<p>Test only</p>",
      text: "Test only", idempotencyKey: "cart-reminder-42",
    };
    const first = await sendEmail(params);
    const retry = await sendEmail(params);
    assert.deepEqual(first, { ok: true, id: "synthetic_1" });
    assert.deepEqual(retry, first);
    assert.equal(calls.length, 2, "two submissions stay visible even when the mock deduplicates acceptance");
    assert.deepEqual(calls[1], calls[0]);
    assert.deepEqual(calls[0], {
      payload: {
        from: "proof@traveloure-qa.test", to: params.to, subject: params.subject,
        html: params.html, text: params.text, replyTo: "reply@traveloure-qa.test",
      },
      options: { idempotencyKey: "cart-reminder-42" },
    });
    const distinct = await sendEmail({ ...params, idempotencyKey: "cart-reminder-43" });
    assert.deepEqual(distinct, { ok: true, id: "synthetic_2" });
    assert.equal(accepted.size, 2, "different outbox rows must not share a provider key");
    assert.equal(networkCalls, 0);
  } finally {
    t.mock.restoreAll();
    invalidatePlatformFlagCache();
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
