/**
 * City-knowledge pass rule, draw, retakes, and the 21 Oct 2026 fact-check pins.
 * No database. The answer key is read here only so the pins can see it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import path from "path";
import {
  authorizesApproval,
  calendarDateInZone,
  capTimingScore,
  drawItemIds,
  evaluateTiming,
  isDrawable,
  localExpertApprovalDecision,
  mayGrantRetake,
  mayStartAttempt,
  numericPass,
  overallPercent,
  parseMetricReviews,
  partBPercent,
  publicTopicBadges,
  retakeDecision,
  routingScore,
  topicScores,
  uniformAnswerPace,
  type DrawableItem,
} from "../city-knowledge";

const bank = JSON.parse(readFileSync(path.join(process.cwd(), "data/city-knowledge/kyoto.json"), "utf8"));
const item = (id: string) => bank.items.find((row: { id: string }) => row.id === id);
const claim = (id: string) => bank.briefs[0].scoringClaims.find((row: { id: string }) => row.id === id);

test("the seeded bank stays unverified", () => {
  assert.equal(bank.verificationStatus, "unverified");
  assert.equal(bank.factCheckedOn, "2026-10-21");
  assert.equal(bank.cityKey, "kyoto");
});

test("fact-check pins for the items Leon marked", () => {
  const k28 = item("K28");
  const correct = k28.options.find((option: { id: string }) => option.id === "b").text as string;
  assert.match(correct, /last boat is 15:30/);
  assert.match(correct, /last boat is 14:30/);
  assert.match(correct, /when the boat is full/);
  assert.doesNotMatch(correct, /hourly until 13 Dec/);
  assert.equal(k28.status, "active");

  const hozu = claim("b1-hozugawa");
  assert.equal(hozu.status, "active");
  assert.match(hozu.text, /15:30/);
  assert.match(hozu.text, /14:30/);
  assert.doesNotMatch(hozu.text, /hourly until 13 Dec/);

  for (const id of ["K17", "K26", "K27", "K31"]) {
    const row = item(id);
    assert.equal(row.status, "inactive", id);
    assert.equal(row.factCheck, "unverified", id);
    assert.equal(isDrawable(row, "2026-10-21"), false, id);
  }
  for (const id of ["b1-sagano-daily", "b1-sagano-rain-refund"]) {
    const row = claim(id);
    assert.equal(row.status, "inactive", id);
    assert.equal(row.factCheck, "unverified", id);
  }

  const k30 = item("K30");
  assert.equal(k30.expiresAfter, "2026-10-23");
  assert.equal(isDrawable(k30, "2026-10-21"), true);
  assert.equal(isDrawable(k30, "2026-10-23"), true);
  assert.equal(isDrawable(k30, "2026-10-24"), false);

  const k23 = item("K23");
  assert.doesNotMatch(k23.answerText, /quieter/i);
  assert.match(k23.options.find((option: { id: string }) => option.id === "a").text, /Chawan-zaka/);
  assert.match(k23.answerText, /no car park/i);

  const k29 = item("K29").options.find((option: { id: string }) => option.id === "b").text as string;
  assert.match(k29, /Gaunkyō/);
  assert.match(k29, /Tsūtenkyō/);
  assert.doesNotMatch(k29, /weekend/i);
  assert.doesNotMatch(k29, /holiday/i);
});

test("the draw holds back inactive and expired items", () => {
  const drawn = drawItemIds(bank.items, "2026-10-21", "fact-check-seed");
  assert.ok(drawn);
  assert.equal(drawn!.length, 20);
  for (const id of ["K17", "K26", "K27", "K31"]) assert.equal(drawn!.includes(id), false);
  const later = drawItemIds(bank.items, "2026-10-24", "fact-check-seed");
  assert.ok(later);
  assert.equal(later!.includes("K30"), false);
  const same = drawItemIds(bank.items, "2026-10-21", "fact-check-seed");
  assert.deepEqual(same, drawn);
});

test("a thin bank is not drawn", () => {
  const few: DrawableItem[] = Array.from({ length: 25 }, (_, i) => ({
    id: `Q${i}`,
    status: "active",
    factCheck: "ok",
  }));
  assert.equal(drawItemIds(few, "2026-10-21", "thin"), null);
});

test("pass floors are not rounded up", () => {
  const justUnder = { partA: 70, b1: 70, b2: 69.9 };
  assert.equal(partBPercent(justUnder.b1, justUnder.b2) < 70, true);
  assert.equal(numericPass(justUnder), false);
  const floors = { partA: 70, b1: 100, b2: 100 };
  assert.equal(overallPercent(floors) >= 80, true);
  assert.equal(numericPass(floors), true);
  const highOverallThinA = { partA: 69.9, b1: 100, b2: 100 };
  assert.equal(numericPass(highOverallThinA), false);
});

test("an unsigned bank and an attention flag do not authorize approval", () => {
  const percents = { partA: 100, b1: 100, b2: 100 };
  assert.equal(authorizesApproval({
    percents,
    attention: false,
    scoresComplete: true,
    bankSignedOff: false,
    bankContentHash: "h",
    attemptBankContentHash: "h",
  }), false);
  assert.equal(authorizesApproval({
    percents,
    attention: true,
    scoresComplete: true,
    bankSignedOff: true,
    bankContentHash: "h",
    attemptBankContentHash: "h",
  }), false);
  assert.equal(authorizesApproval({
    percents,
    attention: false,
    scoresComplete: true,
    bankSignedOff: true,
    bankContentHash: "h",
    attemptBankContentHash: "other",
  }), false);
  assert.equal(authorizesApproval({
    percents,
    attention: false,
    scoresComplete: false,
    bankSignedOff: true,
    bankContentHash: "h",
    attemptBankContentHash: "h",
  }), false);
  assert.equal(authorizesApproval({
    percents,
    attention: false,
    scoresComplete: true,
    bankSignedOff: true,
    bankContentHash: "h",
    attemptBankContentHash: "h",
  }), true);
});

test("approval copy refuses a local expert without a signed pass", () => {
  const unsigned = localExpertApprovalDecision({
    expertType: "local_expert",
    cityKey: "kyoto",
    bankPublished: true,
    bankSignedOff: false,
    qualifyingPass: false,
  });
  assert.equal(unsigned.allowed, false);
  if (!unsigned.allowed) assert.match(unsigned.message, /not signed off/);
  const failed = localExpertApprovalDecision({
    expertType: "local_expert",
    cityKey: "kyoto",
    bankPublished: true,
    bankSignedOff: true,
    qualifyingPass: false,
  });
  assert.equal(failed.allowed, false);
  if (!failed.allowed) assert.match(failed.message, /cannot be overridden/);
  assert.equal(localExpertApprovalDecision({
    expertType: "travel_expert",
    cityKey: null,
    bankPublished: false,
    bankSignedOff: false,
    qualifyingPass: false,
  }).allowed, true);
});

test("topic flags and badges", () => {
  const topics = topicScores({
    partA: [
      { topic: "HRS", correct: false },
      { topic: "HRS", correct: true },
      { topic: "ETQ", correct: true },
    ],
    briefs: [{ id: "b2", percent: 100, metrics: { e: 4 } }],
  });
  const hrs = topics.find((topic) => topic.topic === "HRS");
  assert.equal(hrs?.percent, 50);
  assert.equal(hrs?.flagged, true);
  const etq = topics.find((topic) => topic.topic === "ETQ");
  assert.equal(etq?.flagged, false);
  const badges = publicTopicBadges(topics, "Kyoto", true);
  assert.equal(badges.some((badge) => badge.topic === "HRS"), false);
  assert.equal(badges.every((badge) => !/vetted|verified/i.test(badge.label)), true);
  assert.deepEqual(publicTopicBadges(topics, "Kyoto", false), []);
});

test("retakes wait, and a grant does not waive the wait or a fail", () => {
  const fail = (completedAt: string) => ({ completedAt, numericPass: false, authorizesApproval: false });
  const first = retakeDecision([fail("2026-10-01T00:00:00.000Z")], new Date("2026-10-10T00:00:00.000Z"), true);
  assert.equal(first.state, "wait");
  const ready = retakeDecision([fail("2026-10-01T00:00:00.000Z")], new Date("2026-10-20T00:00:00.000Z"), false);
  assert.equal(ready.state, "needs_grant");
  assert.equal(mayStartAttempt(ready, false), false);
  assert.equal(mayGrantRetake(ready), true);
  const granted = retakeDecision([fail("2026-10-01T00:00:00.000Z")], new Date("2026-10-20T00:00:00.000Z"), true);
  assert.equal(granted.state, "eligible");
  assert.equal(mayStartAttempt(granted, false), true);
  const second = retakeDecision(
    [fail("2026-10-01T00:00:00.000Z"), fail("2026-11-01T00:00:00.000Z")],
    new Date("2026-12-01T00:00:00.000Z"),
    true,
  );
  assert.equal(second.state, "wait");
  const blocked = retakeDecision(
    [fail("2026-01-01T00:00:00.000Z"), fail("2026-03-01T00:00:00.000Z"), fail("2026-06-01T00:00:00.000Z")],
    new Date("2026-10-21T00:00:00.000Z"),
    true,
  );
  assert.equal(blocked.state, "reapply");
  const reopened = retakeDecision(
    [fail("2025-01-01T00:00:00.000Z"), fail("2025-03-01T00:00:00.000Z"), fail("2025-06-01T00:00:00.000Z")],
    new Date("2026-10-21T00:00:00.000Z"),
    false,
  );
  assert.equal(reopened.state, "not_started");
  const recorded = retakeDecision(
    [{ completedAt: "2026-10-21T00:00:00.000Z", numericPass: true, authorizesApproval: false }],
    new Date("2026-10-22T00:00:00.000Z"),
    false,
  );
  assert.equal(recorded.state, "recorded");
  assert.equal(mayStartAttempt(recorded, false), false);
  assert.equal(mayGrantRetake(recorded), true);
});

test("routing bands and the timing cap use only supplied facts", () => {
  assert.deepEqual(routingScore({ applicantMinutes: null, referenceMinutes: 40, backtracks: 0, infeasible: false }), { score: null, unverifiable: true });
  assert.equal(routingScore({ applicantMinutes: 47, referenceMinutes: 40, backtracks: 0, infeasible: false }).score, 3);
  assert.equal(routingScore({ applicantMinutes: 40, referenceMinutes: 40, backtracks: 2, infeasible: false }).score, 1);
  assert.equal(capTimingScore(4, 1), 1);
  assert.equal(capTimingScore(4, 2), 0);
  const facts = bank.timingFacts;
  const closed = evaluateTiming([{ date: "2026-11-30", stopName: "Katsura Villa", plannedArrival: "10:00" }], facts);
  assert.equal(closed.violations >= 1, true);
  const hozu = evaluateTiming([{ date: "2026-12-02", stopName: "Hozugawa boat", plannedArrival: "15:00" }], facts);
  assert.equal(hozu.violations, 1);
  const early = evaluateTiming([{ date: "2026-11-30", stopName: "Hozugawa boat", plannedArrival: "15:30" }], facts);
  assert.equal(early.violations, 0);
  const sagano = evaluateTiming([{ date: "2026-12-01", stopName: "Sagano Romantic Train", plannedArrival: "10:00" }], facts);
  assert.equal(sagano.unverifiable, true);
  assert.equal(sagano.violations, 0);
});

test("a low-confidence review flags the attempt", () => {
  const parsed = parseMetricReviews({ metrics: { a: { score: 4, confidence: "high", unverifiable: false, rationale: "ok", sourcesChecked: [] } } });
  assert.equal(parsed.attention, true);
  assert.equal(parsed.metrics.b.score, null);
});

test("uniform pace is the spec's 85 seconds, and the city date uses the bank zone", () => {
  assert.equal(uniformAnswerPace([85, 85, 85]), true);
  assert.equal(uniformAnswerPace([10, 10, 10]), false);
  const date = calendarDateInZone(new Date("2026-10-23T15:30:00.000Z"), "Asia/Tokyo");
  assert.equal(date, "2026-10-24");
});
