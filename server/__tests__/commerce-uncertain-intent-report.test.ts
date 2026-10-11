import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { buildUncertainEmailDigestSection, buildDeadEmailDigestSection } from "../services/email.service";

for (let loop=1; loop<=2; loop++) test(`held report is truthful, escaped, no retry guidance: loop ${loop}`, () => {
  const receipt = randomUUID();
  const html = buildUncertainEmailDigestSection({ total: 1, rows: [{
    id: loop, emailType: "<test>", status: "processing", phase: "intent",
    ageSeconds: 600, lastError: "provider_acceptance_unknown", providerMessageId: receipt,
  }] });
  assert.match(html, /Provider outcome uncertain; automatic resend blocked/);
  assert.match(html, /separate approval/);
  assert.match(html, /&lt;test&gt;/);
  assert.ok(html.includes(receipt));
  assert.doesNotMatch(html, /never delivered|POST|\/retry/);
  assert.equal(buildUncertainEmailDigestSection({ total: 0, rows: [] }), "");
  const dead = buildDeadEmailDigestSection({ total: 1, newInLast24h: 1, rows: [] });
  assert.match(dead, /does not prove non-delivery/);
  assert.doesNotMatch(dead, /never delivered|POST/);
});
