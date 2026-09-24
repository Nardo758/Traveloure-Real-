/**
 * Ledger 2026-09-24-earner-email-notifications — the earner activity email builder.
 * Run with: npx tsx --test server/utils/__tests__/activity-email-copy.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildActivityEmail } from "../activity-email-copy";

describe("buildActivityEmail", () => {
  it("E1: a message email names the sender, links to the thread and quotes no message body", () => {
    const e = buildActivityEmail({ kind: "new_message", actorName: "Aiko", url: "https://x.test/chat" });
    assert.equal(e.subject, "New message from Aiko");
    assert.match(e.html, /href="https:\/\/x\.test\/chat"/);
    assert.match(e.text, /Read and reply: https:\/\/x\.test\/chat/);
  });

  it("E2: user-controlled names are escaped in the HTML", () => {
    const e = buildActivityEmail({ kind: "review_received", actorName: "<b>x</b>", subject: "Tea & <i>y</i>", url: "https://x.test/r" });
    assert.ok(!e.html.includes("<b>x</b>"));
    assert.ok(e.html.includes("&lt;b&gt;x&lt;/b&gt;"));
    assert.ok(e.html.includes("Tea &amp; &lt;i&gt;y&lt;/i&gt;"));
  });

  it("E3: an absent actor or subject is left out, never invented", () => {
    const e = buildActivityEmail({ kind: "quote_request", url: "https://x.test/q" });
    assert.equal(e.subject, "A traveler asked you for a quote");
    assert.match(e.text, /^A traveler asked you for a quote\. Nothing is booked/);
  });

  it("E4: a quote request says nothing is booked; an invite says the plan opens on accept", () => {
    assert.match(buildActivityEmail({ kind: "quote_request", subject: "Tea", url: "u" }).text, /Nothing is booked/);
    assert.match(buildActivityEmail({ kind: "advisor_invite", subject: "Kyoto", url: "u" }).text, /Accept it in your Inbox/);
  });
});
