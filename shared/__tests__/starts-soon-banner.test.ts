/**
 * B1 — "YOUR TRIP STARTS SOON" NEEDS REAL DATES AND A START STILL AHEAD
 * (ledger `2026-10-08-starts-soon-needs-real-dates`).
 *
 *   S1  placeholder window (dates_confirmed_at NULL ⇒ datesConfirmed false): no banner, even inside 48 h
 *   S2  past start (underway, or already over): no "starts soon"
 *   S3  real dates, start ahead inside the window: the banner
 *   S4  a final version reads "ready" once the dates are chosen; an unconfirmed window shows no banner (GATE-1)
 *
 * Run: npx tsx --test shared/__tests__/starts-soon-banner.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tripCardBannerState, tripStartsSoon } from "../trip-primary-surface";

const now = new Date("2026-11-10T12:00:00Z");
const ahead = { startDate: "2026-11-11", endDate: "2026-11-14", now, finalizedAt: null };

test("S1 placeholder: an unconfirmed window never says 'starts soon'", () => {
  const today = { startDate: "2026-11-10", endDate: "2026-11-10", now, finalizedAt: null };
  assert.equal(tripStartsSoon({ ...today, datesConfirmed: false }), false);
  assert.equal(tripCardBannerState({ ...today, datesConfirmed: false, finalVersion: null }), null);
  assert.equal(tripCardBannerState({ ...ahead, datesConfirmed: false, finalVersion: null }), null);
});

test("S2 past: a trip underway or over has not 'started soon'", () => {
  const underway = { startDate: "2026-11-08", endDate: "2026-11-12", now, finalizedAt: null };
  const over = { startDate: "2026-11-01", endDate: "2026-11-05", now, finalizedAt: null };
  assert.equal(tripCardBannerState({ ...underway, datesConfirmed: true, finalVersion: null }), null);
  assert.equal(tripCardBannerState({ ...over, datesConfirmed: true, finalVersion: null }), null);
  assert.equal(tripStartsSoon({ ...underway, datesConfirmed: true }), false);
});

test("S3 future: real dates with the start ahead inside the window show the banner", () => {
  assert.equal(tripStartsSoon({ ...ahead, datesConfirmed: true }), true);
  assert.equal(tripCardBannerState({ ...ahead, datesConfirmed: true, finalVersion: null }), "finalize_now");
});

// SANCTIONED TEST EDIT (GATE-1 + PARTNER-1 brief §7, ledger `2026-11-03-gate1-partner1`): this pinned the banner on an
// unconfirmed trip ("ready" with datesConfirmed false). The Trip Card banner now waits for dates — `tripCardIsPrimary`
// is false while datesConfirmed is false (brief §4f) — so that case is null; the ready arm still holds with chosen dates.
test("S4 the ready arm holds with chosen dates; an unconfirmed window has no banner", () => {
  assert.equal(tripCardBannerState({ ...ahead, datesConfirmed: true, finalVersion: 2 }), "ready");
  assert.equal(tripCardBannerState({ ...ahead, datesConfirmed: false, finalVersion: 2 }), null);
});
