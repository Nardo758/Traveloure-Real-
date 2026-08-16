/**
 * T-REP (docs/briefs/SERVICE_CREATION_EXECUTION_MAP.md, G5 #13) — pure formatting/derivation
 * proofs for `../service-good-to-know.ts`, the traveler service-detail page's "Good to know" card.
 *
 * Run: npx tsx --test client/src/lib/__tests__/service-good-to-know.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatHours,
  formatMinutes,
  formatPartySize,
  formatStartWindow,
  formatTransportProvision,
  resolveDepositPreview,
  hasDepositTerms,
  formatCheckInOut,
  hasAmenities,
  formatResponseWindow,
  formatWeeklyPattern,
} from "../service-good-to-know";

describe("formatHours", () => {
  it("collapses an exact multiple of 24 to day units", () => {
    assert.equal(formatHours(24), "1 day");
    assert.equal(formatHours(48), "2 days");
  });
  it("keeps a non-multiple of 24 in hour units — never a misleading fractional day", () => {
    assert.equal(formatHours(30), "30 hours");
  });
  it("singularizes 1 hour", () => {
    assert.equal(formatHours(1), "1 hour");
  });
});

describe("formatMinutes", () => {
  it("renders hours+minutes, hours-only, and minutes-only", () => {
    assert.equal(formatMinutes(90), "1h 30m");
    assert.equal(formatMinutes(60), "1h");
    assert.equal(formatMinutes(45), "45m");
    assert.equal(formatMinutes(0), "0m");
  });
});

describe("formatPartySize (§13 — omit, never guess)", () => {
  it("returns null when neither bound is set", () => {
    assert.equal(formatPartySize(null, null), null);
    assert.equal(formatPartySize(undefined, undefined), null);
  });
  it("states an exact count when min === max", () => {
    assert.equal(formatPartySize(4, 4), "4 people");
    assert.equal(formatPartySize(1, 1), "1 person");
  });
  it("states a range when both differ", () => {
    assert.equal(formatPartySize(2, 8), "2–8 people");
  });
  it("states an open-ended bound when only one side is set", () => {
    assert.equal(formatPartySize(3, null), "3+ people");
    assert.equal(formatPartySize(null, 10), "Up to 10 people");
  });
});

describe("formatStartWindow (§13 — honest timezone qualifier)", () => {
  it("returns null when neither bound is set", () => {
    assert.equal(formatStartWindow(null, null, "Asia/Tokyo"), null);
  });
  it("states the real IANA zone when the listing declared one", () => {
    assert.equal(formatStartWindow("09:00", "17:00", "Asia/Tokyo"), "Between 09:00 and 17:00 (Asia/Tokyo)");
  });
  it("falls back to an honest 'provider's local time' qualifier — never a silently assumed zone", () => {
    assert.equal(formatStartWindow("09:00", "17:00", null), "Between 09:00 and 17:00 (provider's local time)");
  });
  it("handles a single-sided window", () => {
    assert.equal(formatStartWindow("09:00", null, null), "No earlier than 09:00 (provider's local time)");
    assert.equal(formatStartWindow(null, "17:00", null), "No later than 17:00 (provider's local time)");
  });
});

describe("formatTransportProvision", () => {
  it("returns null for not_applicable and for unset — the trust panel's plain yes/no line already covers those", () => {
    assert.equal(formatTransportProvision(null), null);
    assert.equal(formatTransportProvision(undefined), null);
    assert.equal(formatTransportProvision("not_applicable"), null);
  });
  it("labels the three real provisions", () => {
    assert.equal(formatTransportProvision("pickup_included"), "Pickup included — the provider collects you");
    assert.equal(formatTransportProvision("pickup_available"), "Pickup available — can be arranged");
    assert.equal(formatTransportProvision("meet_at_point"), "Meet at the meeting point — make your own way there");
  });
  it("falls back to the raw value for an unrecognized enum member rather than dropping it silently", () => {
    assert.equal(formatTransportProvision("teleport"), "teleport");
  });
});

const fmtPrice = (n: number) => `$${n.toFixed(2)}`;

describe("hasDepositTerms / resolveDepositPreview (§8/§18 — display-only preview, never the charge)", () => {
  it("hasDepositTerms is false when deposits are off or the type is unset", () => {
    assert.equal(hasDepositTerms({ depositEnabled: false, depositType: "percentage" }), false);
    assert.equal(hasDepositTerms({ depositEnabled: true, depositType: null }), false);
    assert.equal(hasDepositTerms({ depositEnabled: true, depositType: "percentage" }), true);
  });

  it("percentage preview mirrors deposit.service.ts's own formula when price is known", () => {
    const preview = resolveDepositPreview(
      { depositEnabled: true, depositType: "percentage", depositPercentage: 30 },
      fmtPrice,
      200,
    );
    assert.equal(preview, "30% due now ($60.00), balance due before the service");
  });

  it("percentage preview omits the dollar figure honestly when price is unknown (0 / custom quote)", () => {
    const preview = resolveDepositPreview(
      { depositEnabled: true, depositType: "percentage", depositPercentage: 30 },
      fmtPrice,
      0,
    );
    assert.equal(preview, "30% due now, balance due before the service");
  });

  it("flat preview states the flat amount", () => {
    const preview = resolveDepositPreview(
      { depositEnabled: true, depositType: "flat", depositFlatAmount: "50.00" },
      fmtPrice,
      500,
    );
    assert.equal(preview, "$50.00 due now, balance due before the service");
  });

  it("returns null (never a guessed number) for an incomplete/invalid config", () => {
    assert.equal(
      resolveDepositPreview({ depositEnabled: true, depositType: "percentage", depositPercentage: null }, fmtPrice, 200),
      null,
    );
    assert.equal(
      resolveDepositPreview({ depositEnabled: true, depositType: "flat", depositFlatAmount: null }, fmtPrice, 200),
      null,
    );
    assert.equal(resolveDepositPreview({ depositEnabled: false, depositType: "flat" }, fmtPrice, 200), null);
  });
});

// S8 (Gate G2, docs/briefs/WAVE3_SCHEMA_PROPOSALS.md, ledger row 102) — property builder fields.
describe("formatCheckInOut", () => {
  it("renders both bounds together", () => {
    assert.equal(formatCheckInOut("15:00", "11:00"), "Check-in 15:00 · Check-out 11:00");
  });
  it("renders check-in only", () => {
    assert.equal(formatCheckInOut("15:00", null), "Check-in 15:00");
  });
  it("renders check-out only", () => {
    assert.equal(formatCheckInOut(undefined, "11:00"), "Check-out 11:00");
  });
  it("returns null when neither is set — nothing to state (§13)", () => {
    assert.equal(formatCheckInOut(null, null), null);
    assert.equal(formatCheckInOut(undefined, undefined), null);
  });
});

describe("hasAmenities", () => {
  it("is true for a non-empty array", () => {
    assert.equal(hasAmenities(["WiFi", "Kitchen"]), true);
  });
  it("is false for null (never captured), undefined, and an empty array (cleared) alike — the page renders identically for both (§13)", () => {
    assert.equal(hasAmenities(null), false);
    assert.equal(hasAmenities(undefined), false);
    assert.equal(hasAmenities([]), false);
  });
});

describe("formatResponseWindow (S9, docs/DECISIONS.md ledger row 102 — §13 never a guessed 'soon')", () => {
  it("returns null when never captured", () => {
    assert.equal(formatResponseWindow(null), null);
    assert.equal(formatResponseWindow(undefined), null);
  });
  it("returns null for a non-positive value rather than a fabricated promise", () => {
    assert.equal(formatResponseWindow(0), null);
    assert.equal(formatResponseWindow(-5), null);
  });
  it("states an hour value in prose", () => {
    assert.equal(formatResponseWindow(6), "Replies within 6 hours");
    assert.equal(formatResponseWindow(1), "Replies within 1 hour");
  });
  it("reuses formatHours's day-collapsing on an exact multiple of 24", () => {
    assert.equal(formatResponseWindow(24), "Replies within 1 day");
    assert.equal(formatResponseWindow(48), "Replies within 2 days");
  });
});

// ── formatWeeklyPattern (lane M3 — gap #13's "Starts" row) ─────────────────────────────────────
// The weekly repeat rule had NO public read before this lane, so these are the first proofs that
// an authored `service_availability_patterns` row can be stated to a traveler at all.
describe("formatWeeklyPattern", () => {
  it("renders the mock's own case — two days at one time", () => {
    assert.equal(
      formatWeeklyPattern([
        { dayOfWeek: 2, startTime: "18:00" },
        { dayOfWeek: 4, startTime: "18:00" },
      ], "Asia/Tokyo"),
      "Tuesdays & Thursdays at 18:00 (Asia/Tokyo)",
    );
  });

  it("orders days by the week, not by insertion order", () => {
    assert.equal(
      formatWeeklyPattern([
        { dayOfWeek: 5, startTime: "09:00" },
        { dayOfWeek: 1, startTime: "09:00" },
        { dayOfWeek: 3, startTime: "09:00" },
      ], "Asia/Tokyo"),
      "Mondays, Wednesdays & Fridays at 09:00 (Asia/Tokyo)",
    );
  });

  it("keeps two different start times as two clauses — never flattens them into one wrong sentence", () => {
    assert.equal(
      formatWeeklyPattern([
        { dayOfWeek: 6, startTime: "10:00" },
        { dayOfWeek: 2, startTime: "18:00" },
      ], null),
      "Saturdays at 10:00 · Tuesdays at 18:00 (provider's local time)",
    );
  });

  it("collapses all seven days to 'Every day'", () => {
    const all = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startTime: "07:00" }));
    assert.equal(formatWeeklyPattern(all, "Asia/Tokyo"), "Every day at 07:00 (Asia/Tokyo)");
  });

  it("collapses a duplicate day at the same time to one mention", () => {
    assert.equal(
      formatWeeklyPattern([
        { dayOfWeek: 2, startTime: "18:00" },
        { dayOfWeek: 2, startTime: "18:00" },
      ], "Asia/Tokyo"),
      "Tuesdays at 18:00 (Asia/Tokyo)",
    );
  });

  it("§13 — no rows means NO claim, not a guessed rhythm", () => {
    assert.equal(formatWeeklyPattern([], "Asia/Tokyo"), null);
    assert.equal(formatWeeklyPattern(null, "Asia/Tokyo"), null);
    assert.equal(formatWeeklyPattern(undefined, null), null);
  });

  it("drops a malformed row rather than rendering `undefined` — day_of_week has no DB CHECK", () => {
    assert.equal(
      formatWeeklyPattern([
        { dayOfWeek: 9, startTime: "18:00" },
        { dayOfWeek: 2, startTime: "18:00" },
      ], "Asia/Tokyo"),
      "Tuesdays at 18:00 (Asia/Tokyo)",
    );
    // Every row malformed ⇒ nothing to say, not an empty clause.
    assert.equal(formatWeeklyPattern([{ dayOfWeek: -1, startTime: "" }], null), null);
  });

  it("falls back to an explicit local-time qualifier, never a silently assumed zone", () => {
    assert.equal(
      formatWeeklyPattern([{ dayOfWeek: 0, startTime: "11:00" }], null),
      "Sundays at 11:00 (provider's local time)",
    );
  });
});
