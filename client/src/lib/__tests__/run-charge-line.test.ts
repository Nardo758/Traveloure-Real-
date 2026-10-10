/** Held-batch-1 item 23: the board header's paid line (`runChargeLine`). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runChargeLine } from "../versions-board";

const fmt = { formatDate: () => "Oct 3", formatTime: () => "3:00 PM" };
const paid = { basis: "paid" as const, amountCents: 599, currency: "usd", at: "2026-10-03T15:00:00.000Z" };
const ENDS = "2026-10-04T15:00:00.000Z";

test("RL1 paid, inside the re-time window", () => {
  assert.equal(
    runChargeLine(paid, { ...fmt, windowEndsAt: ENDS, now: new Date("2026-10-03T16:00:00Z") }),
    "Paid Oct 3 · $5.99 · free re-times until 3:00 PM",
  );
});

test("RL2 paid, window closed ⇒ no re-time clause", () => {
  assert.equal(runChargeLine(paid, { ...fmt, windowEndsAt: ENDS, now: new Date("2026-10-05T00:00:00Z") }), "Paid Oct 3 · $5.99");
});

test("RL3 covered runs and the absent charge", () => {
  const o = { ...fmt, windowEndsAt: ENDS, now: new Date("2026-10-03T16:00:00Z") };
  assert.equal(runChargeLine({ ...paid, basis: "trip_pass" }, o), "Included with your Trip Pass");
  assert.equal(runChargeLine({ ...paid, basis: "free_rerun" }, o), "Free re-run");
  assert.equal(runChargeLine(null, o), null);
  assert.equal(runChargeLine(undefined, o), null);
  assert.equal(runChargeLine({ ...paid, currency: "eur" }, { ...o, now: new Date("2026-10-06T00:00:00Z") }), "Paid Oct 3 · EUR 5.99");
});
