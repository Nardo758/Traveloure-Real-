/**
 * LW-1d (ledger `2026-10-16-lw1d-source-and-referral`): the Ready-Made page's waitlist-mode button.
 *
 *   RW1  Waitlist mode replaces buying with the launch market's waitlist; open or unread mode buys as usual.
 *   RW2  The link carries only the raw arrival code, and only a well-formed one; never a guessed market.
 *   RW3  The arrival code is this page's own ?ref= first, else the session's captured one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrivalRef, readyMadeWaitlistHref, READY_MADE_WAITLIST_LABEL } from "../ready-made-waitlist";

const waitlist = { mode: "waitlist" as const, launchMarketSlug: "kyoto" };

test("RW1 — waitlist mode shows the waitlist; open or unread mode shows no waitlist", () => {
  assert.equal(readyMadeWaitlistHref(waitlist, null), "/kyoto#join");
  assert.equal(readyMadeWaitlistHref({ mode: "open", launchMarketSlug: "kyoto" }, "abc123"), null);
  assert.equal(readyMadeWaitlistHref(null, "abc123"), null);
  assert.equal(readyMadeWaitlistHref(undefined, null), null);
  assert.equal(READY_MADE_WAITLIST_LABEL, "Join the Kyoto waitlist");
});

test("RW2 — only a well-formed code rides along, and no market is guessed", () => {
  assert.equal(readyMadeWaitlistHref(waitlist, "abc123"), "/kyoto?ref=abc123#join");
  assert.equal(readyMadeWaitlistHref(waitlist, "../x"), "/kyoto#join");
  assert.equal(readyMadeWaitlistHref({ mode: "waitlist", launchMarketSlug: null }, "abc123"), null);
  assert.equal(readyMadeWaitlistHref({ mode: "waitlist", launchMarketSlug: "../evil" }, null), null);
});

test("RW3 — the page's own ref wins over the session's", () => {
  assert.equal(arrivalRef("?ref=PAGE01", "sess01"), "page01");
  assert.equal(arrivalRef("", "sess01"), "sess01");
  assert.equal(arrivalRef("?ref=bad code", "sess01"), "sess01");
  assert.equal(arrivalRef("?ref=bad code", null), null);
});
