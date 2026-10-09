/**
 * THE HANDOFF BOARD (slip conformance, boards rev 15; ledger `2026-10-08-slip-handoff-board`).
 * The board look's handoff phrases are pure and stated once in `@/lib/handoff-client`; each is a real
 * value or nothing (§13): no neighbourhood, reason, host count or zero is invented.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  handoffAgo,
  handoffBoardPills,
  handoffBoardSubline,
  handoffBoardTitle,
  handoffDayStat,
  handoffFooterLine,
  handoffHoldsPen,
  handoffPenScope,
} from "../handoff-client";

const NOW = Date.parse("2026-10-08T12:00:00Z");

test("H1: the pen is held only while accepted or delivered, and the scope is empty otherwise", () => {
  for (const status of ["accepted", "delivered"]) assert.equal(handoffHoldsPen({ status }), true);
  for (const status of ["authorizing", "proposed", "unmatched", "approved", "withdrawn", "released"]) {
    assert.equal(handoffHoldsPen({ status }), false);
    assert.equal(handoffPenScope({ status, scopeItemIds: ["a"] }).size, 0);
  }
  assert.deepEqual([...handoffPenScope({ status: "accepted", scopeItemIds: ["a", "b"] })], ["a", "b"]);
  assert.equal(handoffPenScope(null).size, 0);
});

test("H2: the title names the disclosed expert, else 'Your local' — never a placeholder", () => {
  assert.equal(handoffBoardTitle({ expertName: "Ana" }), "Ana has your plan");
  assert.equal(handoffBoardTitle({ expertName: null }), "Your local has your plan");
  assert.equal(handoffBoardTitle({ expertName: "  " }), "Your local has your plan");
});

test("H3: the subline is the ask, the scope size and when — an unreadable instant is omitted", () => {
  const base = { kind: "polish" as const, scopeItemIds: ["a", "b", "c"], deliveredAt: null, status: "accepted" };
  assert.equal(handoffBoardSubline({ ...base, acceptedAt: "2026-10-08T11:20:00Z" }, NOW), "Polish my plan · 3 stops · accepted 40 min ago");
  assert.equal(handoffBoardSubline({ ...base, acceptedAt: null }, NOW), "Polish my plan · 3 stops");
  assert.equal(handoffBoardSubline({ ...base, scopeItemIds: ["a"], acceptedAt: "garbage" }, NOW), "Polish my plan · 1 stop");
  assert.equal(
    handoffBoardSubline({ ...base, status: "delivered", acceptedAt: null, deliveredAt: "2026-10-08T09:00:00Z" }, NOW),
    "Polish my plan · 3 stops · ready 3 h ago",
  );
  assert.equal(handoffAgo("2026-10-06T12:00:00Z", NOW), "2 days ago");
  assert.equal(handoffAgo("2026-10-08T11:59:30Z", NOW), "just now");
});

test("H4: pills omit a zero count and an unknown fee; the fee is 'paid' only from accept on", () => {
  const h = { status: "accepted", feeCents: 4900, travelerFeeCents: 300, prepaid: false };
  assert.deepEqual(handoffBoardPills({ pending: 2, booked: 1, handoff: h }), [
    { key: "suggestions", text: "2 suggestions waiting" },
    { key: "booked", text: "1 booked" },
    { key: "fee", text: "fee paid · $52.00" },
  ]);
  assert.deepEqual(handoffBoardPills({ pending: 0, booked: 0, handoff: { ...h, feeCents: 0, travelerFeeCents: 0 } }), []);
  assert.deepEqual(handoffBoardPills({ pending: 1, booked: null, handoff: { ...h, status: "proposed" } }), [
    { key: "suggestions", text: "1 suggestion waiting" },
  ]);
  assert.deepEqual(handoffBoardPills({ pending: 0, booked: null, handoff: { ...h, prepaid: true } }), [
    { key: "fee", text: "included with your plan" },
  ]);
});

test("H5: the day stat counts the expert's stops and the owner's — null when none are in scope", () => {
  const scope = new Set(["a", "b", "c"]);
  assert.equal(handoffDayStat(["a", "b", "c", "d", "e"], scope, "Ana", true), "3 with Ana · 2 yours");
  assert.equal(handoffDayStat(["a", "b", "c", "d", "e"], scope, "you", false), "3 with you");
  assert.equal(handoffDayStat(["a", "b", "c"], scope, "Ana", true), "3 with Ana");
  assert.equal(handoffDayStat(["d", "e"], scope, "Ana", true), null);
  assert.equal(handoffDayStat(["a"], new Set(), "Ana", true), null);
});

test("H6: the footer says the expert is paid on approval and not before (R323)", () => {
  const line = handoffFooterLine("Ana");
  assert.match(line, /Approve hands every item back to you and pays Ana\./);
  assert.match(line, /Nothing is paid to them before that\./);
});

test("H7: the board's controls keep the plain banner's testids, and Approve waits for delivery", () => {
  const src = readFileSync(new URL("../../components/plan/HandoffBanner.tsx", import.meta.url), "utf8");
  const footer = src.slice(src.indexOf("export function HandoffFooter("));
  for (const id of ["handoff-approve", "handoff-request-changes", "handoff-withdraw", "handoff-changes-note", "handoff-approve-not-yet"]) {
    assert.ok(footer.includes(`data-testid="${id}"`), `${id} in the footer`);
  }
  // Approve is offered only on a delivered request; before that it is a disabled "not yet".
  assert.match(footer, /\{delivered \? \(\s*<button[\s\S]{0,300}?data-testid="handoff-approve"/);
  // R-t: the withdrawal's cost line comes before the controls.
  assert.ok(footer.indexOf('data-testid="handoff-withdraw-cost"') < footer.indexOf('data-testid="handoff-withdraw"'));
  // Ruling 2: the board's primary is the coral fill, never gold or navy as a button fill.
  assert.ok(!/bg-\[color:var\(--slip-gold\)\][^"]*px-/.test(src.replace(/border-\[color:var\(--slip-gold\)\]/g, "")), "no gold button fill");
});

test("H8: a suggestion's summary is readable words — an edit that only moves a stop says where to", async () => {
  const { suggestionSummary } = await import("@shared/handoff");
  assert.equal(suggestionSummary({ kind: "edit", payload: { updates: { startTime: "15:30" } } }), "Move to 15:30");
  assert.equal(suggestionSummary({ kind: "edit", payload: { updates: { dayNumber: 2, startTime: "09:00:00" } } }), "Move to day 2 at 09:00");
  assert.equal(suggestionSummary({ kind: "edit", payload: { updates: { dayNumber: 3 } } }), "Move to day 3");
  assert.equal(suggestionSummary({ kind: "edit", payload: { updates: { title: "X", location: "Y", latitude: 1 } } }), "Change the name, place");
  assert.equal(suggestionSummary({ kind: "edit", payload: { updates: { mystery: 1 } } }), "Change the details");
  assert.equal(suggestionSummary({ kind: "edit", payload: { updates: {} } }), "Edit this stop");
  assert.equal(suggestionSummary({ kind: "add", payload: { item: { title: "Gion evening walk", dayNumber: 2 } } }), "Add “Gion evening walk” to day 2");
  assert.equal(suggestionSummary({ kind: "remove", payload: { title: "Tofuku-ji" } }), "Remove “Tofuku-ji”");
  // No raw column name ever reaches a row.
  for (const k of ["startTime", "dayNumber", "estimatedCost", "latitude"]) {
    assert.ok(!suggestionSummary({ kind: "edit", payload: { updates: { [k]: "x", title: "t" } } }).includes(k));
  }
});
