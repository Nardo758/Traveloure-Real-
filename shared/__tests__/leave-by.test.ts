/**
 * 9b-c — leave-by (9b spec v1.0 LB1–LB9; ledger `2026-10-17-9b-c-leave-by`).
 *   LBT1 one walking leg: start − minutes − walk buffer (0), planning tier rounded DOWN to 5, provenance kept
 *   LBT2 a chosen taxi takes the taxi buffer (5); an unchosen drive draws no time and no line
 *   LBT3 transit ⇒ "Transit times in Google Maps"; an unrouted leg ⇒ "Leave-by needs a routed leg"; not located ⇒
 *        "Not on the map yet…"
 *   LBT4 the previous stop's end unknown ⇒ no leave-by; its end after the leave-by ⇒ the conflict line
 *   LBT5 the stay is stop 0 only with coordinates and a routed leg to stop 1
 *   LBT6 an anchor measures against its buffered time with no mode buffer; missed ⇒ a conflict banner
 *   LBT7 the hero is the first leave-by strictly after now; missed rows say "missed · next: HH:MM"
 *   LBT8 live tier: the exact minute and "checked today …"
 *   LBT9 last entry: measured against it and said; settings absent ⇒ the ruled defaults
 *   LBT10 TRAVEL · PLANNED sums routed legs only and says so when any is unrouted
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  LEAVE_BY_CONFIG_DEFAULTS,
  LEAVE_BY_COPY,
  anchorMissedBanner,
  deriveLeaveBy,
  leaveByConfig,
  leaveByHero,
  leaveByMissed,
  missedLine,
  travelPlanned,
  type LeaveByLeg,
  type LeaveByStop,
} from "../leave-by";

const PROV = "© OpenStreetMap contributors · checked 12 Oct";
const stop = (o: Partial<LeaveByStop> & { id: string }): LeaveByStop => ({ name: o.id.toUpperCase(), start: null, durationMin: 60, located: true, ...o });
const walk = (min: number, o: Partial<LeaveByLeg> = {}): LeaveByLeg => ({ routed: true, durationMin: min, mode: "walk", modeChosen: false, provenanceLine: PROV, ...o });

test("LBT1: one walking leg — start − minutes, rounded down to 5, with its provenance", () => {
  const rows = deriveLeaveBy({
    stops: [stop({ id: "a", start: "09:00", durationMin: 60 }), stop({ id: "b", start: "10:30" })],
    legs: [null, walk(17)],
    stayLocated: true,
  });
  assert.deepEqual(rows[1], { kind: "leave_by", stopId: "b", minute: 610, time: "10:10", tier: "planning", line: `leave by about 10:10 · ${PROV}`, anchor: false, lastEntryNote: null });
});

test("LBT2: a chosen taxi takes 5 minutes' buffer; an unchosen drive draws nothing", () => {
  const stops = [stop({ id: "a", start: "09:00", durationMin: 30 }), stop({ id: "b", start: "11:00" })];
  const taxi = deriveLeaveBy({ stops, legs: [null, walk(20, { mode: "taxi", modeChosen: true })], stayLocated: true });
  assert.equal(taxi[1].kind === "leave_by" && taxi[1].time, "10:35");
  const drive = deriveLeaveBy({ stops, legs: [null, walk(20, { mode: "drive" })], stayLocated: true });
  assert.deepEqual(drive[1], { kind: "none", stopId: "b", reason: "ineligible_mode", line: null });
});

test("LBT3: transit, unrouted and unlocated each say why", () => {
  const stops = [stop({ id: "a", start: "09:00" }), stop({ id: "b", start: "11:00" }), stop({ id: "c", start: "13:00" }), stop({ id: "d", start: "15:00", located: false })];
  const rows = deriveLeaveBy({ stops, legs: [null, walk(20, { mode: "transit" }), walk(20, { routed: false }), walk(10)], stayLocated: true });
  assert.equal(rows[1].kind === "none" && rows[1].line, LEAVE_BY_COPY.transit);
  assert.equal(rows[2].kind === "none" && rows[2].line, LEAVE_BY_COPY.needsRoutedLeg);
  assert.equal(rows[3].kind === "none" && rows[3].line, LEAVE_BY_COPY.notOnMap);
});

test("LBT4: an unknown previous end ⇒ no leave-by; an end after it ⇒ the conflict line", () => {
  const unknown = deriveLeaveBy({ stops: [stop({ id: "a", start: "09:00", durationMin: null }), stop({ id: "b", start: "10:30" })], legs: [null, walk(15)], stayLocated: true });
  assert.deepEqual(unknown[1], { kind: "none", stopId: "b", reason: "missing_input", line: null });
  const tight = deriveLeaveBy({ stops: [stop({ id: "a", start: "09:00", durationMin: 90 }), stop({ id: "b", start: "10:30" })], legs: [null, walk(15)], stayLocated: true });
  assert.deepEqual(tight[1], { kind: "conflict", stopId: "b", line: "Not enough time to get here from A", anchor: false });
});

test("LBT5: stop 1 has a leave-by only from a located stay over a routed leg", () => {
  const stops = [stop({ id: "a", start: "09:00" })];
  assert.equal(deriveLeaveBy({ stops, legs: [walk(12)], stayLocated: true })[0].kind, "leave_by");
  assert.equal(deriveLeaveBy({ stops, legs: [walk(12)], stayLocated: false })[0].kind, "none");
  assert.equal(deriveLeaveBy({ stops, legs: [null], stayLocated: true })[0].kind, "none");
});

test("LBT6: an anchor measures against its buffered time with no mode buffer; missed is a banner", () => {
  const stops = [stop({ id: "a", start: "09:00", durationMin: 30 }), stop({ id: "kix", name: "KIX", start: "14:00", anchorBuffered: "12:30" })];
  const rows = deriveLeaveBy({ stops, legs: [null, walk(40, { mode: "taxi", modeChosen: true })], stayLocated: true });
  assert.equal(rows[1].kind === "leave_by" && rows[1].time, "11:50", "12:30 − 40, no taxi buffer");
  assert.equal(anchorMissedBanner(rows[1], 12 * 60, "KIX"), "You may miss KIX — the time to leave has passed");
  assert.equal(anchorMissedBanner(rows[1], 11 * 60, "KIX"), null);
});

test("LBT7: the hero is the next leave-by after now; a missed row names the next", () => {
  const stops = [stop({ id: "a", start: "09:00", durationMin: 30 }), stop({ id: "b", start: "10:30", durationMin: 30 }), stop({ id: "c", start: "13:00" })];
  const rows = deriveLeaveBy({ stops, legs: [walk(10), walk(15), walk(20)], stayLocated: true });
  assert.equal(leaveByHero(rows, 7 * 60)?.stopId, "a", "before the first stop, stop 1's");
  assert.equal(leaveByHero(rows, 10 * 60 + 20)?.stopId, "c");
  assert.equal(leaveByMissed(rows[1], 10 * 60 + 20), true);
  assert.equal(missedLine(rows, 10 * 60 + 20), "missed · next: 12:40");
  assert.equal(leaveByHero(rows, 23 * 60), null, "after the last, omitted");
});

test("LBT8: live tier — exact minute and when it was checked", () => {
  const rows = deriveLeaveBy({
    stops: [stop({ id: "a", start: "09:00", durationMin: 30 }), stop({ id: "b", start: "10:30" })],
    legs: [null, walk(17, { live: { minutes: 16, checkedLabel: "9:40 AM" } })],
    stayLocated: true,
  });
  assert.equal(rows[1].kind === "leave_by" && rows[1].line, "leave by 10:14 · checked today 9:40 AM");
});

test("LBT9: last entry is measured against and said; absent settings are the ruled defaults", () => {
  const rows = deriveLeaveBy({
    stops: [stop({ id: "a", start: "09:00", durationMin: 30 }), stop({ id: "b", start: "17:00", lastEntry: { time: "16:30", kind: "last_entry" } })],
    legs: [null, walk(20)],
    stayLocated: true,
  });
  assert.equal(rows[1].kind === "leave_by" && rows[1].line, `leave by about 16:10 · ${PROV} · Last entry 4:30 PM`);
  assert.deepEqual(leaveByConfig(), { ...LEAVE_BY_CONFIG_DEFAULTS });
  assert.equal(leaveByConfig({ leave_by_buffer_taxi_min: 8 }).leave_by_buffer_taxi_min, 8);
  assert.equal(leaveByConfig({ leave_by_buffer_taxi_min: "x" }).leave_by_buffer_taxi_min, 5);
});

test("LBT10: travel planned sums routed legs only and says so", () => {
  assert.deepEqual(travelPlanned([null, walk(10), walk(20)]), { minutes: 30, routedOnly: false });
  assert.deepEqual(travelPlanned([walk(10), walk(20, { routed: false })]), { minutes: 10, routedOnly: true });
  assert.equal(travelPlanned([walk(20, { routed: false })]), null);
});
