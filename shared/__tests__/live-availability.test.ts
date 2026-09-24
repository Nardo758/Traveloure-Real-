/**
 * Live help rules (Locked Decision 54, ledger `2026-09-24-live-chat-qa-sessions`).
 *   L1 available now needs a future window; vacation always wins; absent is not available.
 *   L2 reply time says nothing with too few samples, no median, or a slow median.
 *   L3 Q&A session lengths are the expert's menu, and labels read naturally.
 *   L4 a session is not started, live with time remaining, or ended — from its stamp and the clock.
 *   L5 per-day pricing needs a messaging listing; a chat Q&A needs a length from the menu.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  QA_SESSION_LENGTHS,
  liveListingTermsRefusal,
  REPLY_TIME_LABELS,
  isAvailableNow,
  isQaSessionLength,
  qaSessionLengthLabel,
  qaSessionState,
  replyTimeBucket,
} from "../live-availability";

const now = new Date("2026-09-24T12:00:00Z");
const later = "2026-09-24T13:00:00Z";
const earlier = "2026-09-24T11:00:00Z";

describe("live availability", () => {
  it("L1: a future window, and vacation wins", () => {
    assert.equal(isAvailableNow({ availableNowUntil: later }, now), true);
    assert.equal(isAvailableNow({ availableNowUntil: earlier }, now), false);
    assert.equal(isAvailableNow({ availableNowUntil: null }, now), false);
    assert.equal(isAvailableNow({}, now), false);
    assert.equal(isAvailableNow({ availableNowUntil: later, vacationUntil: later }, now), false);
    assert.equal(isAvailableNow({ availableNowUntil: later, vacationUntil: earlier }, now), true);
  });
  it("L2: reply time is only said when it is measured and quick enough", () => {
    assert.equal(replyTimeBucket(20, 4), null, "too few samples");
    assert.equal(replyTimeBucket(null, 10), null, "no median");
    assert.equal(replyTimeBucket(20, 5), "within_an_hour");
    assert.equal(replyTimeBucket(60, 5), "within_an_hour");
    assert.equal(replyTimeBucket(150, 5), "within_a_few_hours");
    assert.equal(replyTimeBucket(1440, 5), "within_a_day");
    assert.equal(replyTimeBucket(1441, 5), null, "slower than a day is not advertised");
    assert.equal(replyTimeBucket(Infinity, 9), null);
    for (const label of Object.values(REPLY_TIME_LABELS)) assert.match(label, /^Usually replies within/);
  });
  it("L3: session lengths", () => {
    assert.deepEqual([...QA_SESSION_LENGTHS], [15, 30, 45, 60, 90]);
    assert.equal(isQaSessionLength(30), true);
    assert.equal(isQaSessionLength(20), false);
    assert.equal(isQaSessionLength("30"), false);
    assert.equal(qaSessionLengthLabel(15), "15 min");
    assert.equal(qaSessionLengthLabel(60), "1 hour");
    assert.equal(qaSessionLengthLabel(90), "1 hr 30 min");
    assert.equal(qaSessionLengthLabel(120), "2 hours");
  });
  it("L4: session phase", () => {
    assert.deepEqual(qaSessionState(30, null, now), { phase: "not_started", lengthMinutes: 30 });
    const live = qaSessionState(30, { startedAt: earlier, endsAt: later }, now);
    assert.equal(live.phase, "live");
    assert.equal(live.phase === "live" && live.remainingMs, 3600000);
    assert.equal(qaSessionState(30, { startedAt: "2026-09-24T10:00:00Z", endsAt: earlier }, now).phase, "ended");
  });
  it("L5: the listing-terms gate (one predicate for create and update)", () => {
    assert.equal(liveListingTermsRefusal({ deliveryMethod: "async_messaging", pricingUnit: "per_day" }), null);
    assert.equal(
      liveListingTermsRefusal({ deliveryMethod: "in_person", pricingUnit: "per_day" })?.code,
      "PER_DAY_NEEDS_MESSAGING",
    );
    assert.equal(
      liveListingTermsRefusal({ deliveryMethod: "async_messaging", expertOfferingTypeKey: "ask_me_anything", durationMinutes: null })?.code,
      "QA_SESSION_LENGTH_REQUIRED",
    );
    assert.equal(
      liveListingTermsRefusal({ deliveryMethod: "async_messaging", expertOfferingTypeKey: "ask_me_anything", durationMinutes: 20 })?.code,
      "QA_SESSION_LENGTH_REQUIRED",
      "a length off the menu is refused",
    );
    assert.equal(
      liveListingTermsRefusal({ deliveryMethod: "async_messaging", expertOfferingTypeKey: "ask_me_anything", durationMinutes: "30" }),
      null,
      "a form-sent string length is read as its number",
    );
    assert.equal(
      liveListingTermsRefusal({ deliveryMethod: "video", expertOfferingTypeKey: "ask_me_anything", durationMinutes: null }),
      null,
      "a video Q&A keeps the slot flow and needs no chat length",
    );
  });
});
