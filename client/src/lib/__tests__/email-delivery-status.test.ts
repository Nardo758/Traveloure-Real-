/**
 * The admin test-email panel never says "delivered" before Resend does (board #1426). Pure.
 *   D1 accepted / queued / unknown is "Accepted by Resend", not delivered, and not terminal.
 *   D2 delivered (and opened/clicked) is delivered.
 *   D3 bounced / failed / suppressed are errors and terminal.
 * Run: npx tsx --test client/src/lib/__tests__/email-delivery-status.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryDisplay } from "../email-delivery-status";

test("D1: accepted is not delivered", () => {
  for (const e of [undefined, null, "sent", "queued", "scheduled", "delivery_delayed"]) {
    const d = deliveryDisplay(e as any);
    assert.equal(d.tone, "pending");
    assert.match(d.title, /Accepted by Resend/);
    assert.equal(d.terminal, false);
  }
});

test("D2: delivered", () => {
  for (const e of ["delivered", "opened", "clicked"]) assert.deepEqual(deliveryDisplay(e), { tone: "success", title: "Delivered", terminal: true });
});

test("D3: failures are errors", () => {
  for (const e of ["bounced", "failed", "suppressed", "complained", "canceled"]) {
    const d = deliveryDisplay(e);
    assert.equal(d.tone, "error");
    assert.equal(d.terminal, true);
  }
});
