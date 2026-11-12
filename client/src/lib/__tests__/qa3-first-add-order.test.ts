/**
 * QA round 3 PR 1 — the first-add calendar opens BEFORE the item lands (Leon, Nov 11, 2026).
 *
 *   F1 guest, undated plan: the press asks first and sends NOTHING; Skip then writes the item (Day 1, as before)
 *   F2 guest, undated plan: Save writes the dates, then the item — the press's day kept when inside the chosen range
 *   F3 guest, Save with a press day OUTSIDE the chosen range ⇒ the day is dropped (Day 1)
 *   F4 guest with NO plan yet: asked first; Save creates the plan WITH the dates (one POST), then the item
 *   F5 signed in, undated plan: no write before the answer; Save PATCHes the dates, then POSTs the item
 *   F6 signed in with no plan: nothing — not even the mint — before the answer; Save mints WITH the dates
 *   F7 a plan whose dates are chosen, or one already asked in this tab, is not asked: the write goes straight out
 *   F8 the pure day rule: kept inside the range, dropped outside, null stays null
 *
 * Network: `fetch` is stubbed and every request is recorded, so "no POST before Save/Skip" is read off the log.
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/qa3-first-add-order.test.ts
 */
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { queryClient } from "../queryClient";
import { GUEST_PLAN_QUERY_KEY } from "../waitlist-guest-plan";
import {
  __planAddRunner,
  dayInsideChosenRange,
  noteFirstAddAsked,
  onPlanAddFeedback,
  runGuestAdd,
  runSignedInRefAdd,
  type FeedbackEvent,
  type FirstAddAnswer,
} from "../plan-add-runner";

type Call = { method: string; path: string; body: any };
let calls: Call[] = [];
const realFetch = globalThis.fetch;
const store = new Map<string, string>();

function respond(method: string, path: string, body: any): any {
  if (method === "GET" && path === "/api/trips") return trips;
  if (method === "POST" && path === "/api/guest-plans") return { plan: { id: "gp-new", datesConfirmed: !!body?.startDate, startDate: body?.startDate ?? "2027-01-10", endDate: body?.endDate ?? "2027-01-10" }, items: [] };
  if (method === "PATCH" && path === "/api/guest-plans/current") return { plan: { id: "gp1", datesConfirmed: true, startDate: body.startDate, endDate: body.endDate }, items: [] };
  if (method === "POST" && path === "/api/guest-plans/current/items") return { id: "item-g", located: false, item: { dayNumber: body?.placement?.day_number ?? 1 } };
  if (method === "GET" && path === "/api/guest-plans/current") return queryClient.getQueryData(GUEST_PLAN_QUERY_KEY) ?? null;
  if (method === "POST" && path === "/api/trips") return { id: "trip-new", ...body };
  if (method === "PATCH" && /^\/api\/trips\/[^/]+$/.test(path)) return { ok: true };
  if (method === "POST" && /\/itinerary-items$/.test(path)) return { id: "item-t", dayNumber: body?.ref?.placement?.day_number ?? 1 };
  return {};
}
let trips: any[] = [];

beforeEach(() => {
  calls = [];
  trips = [];
  store.clear();
  __planAddRunner.reset();
  queryClient.clear();
  (globalThis as any).window = {
    location: { search: "" },
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  };
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = new URL(String(input), "http://x");
    const method = (init.method ?? "GET").toUpperCase();
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url.pathname, body });
    return new Response(JSON.stringify(respond(method, url.pathname, body)), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as any;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).window;
});

/** Wait for the runner to ask; returns the answer function. */
async function nextAsk(): Promise<{ answer: (a: FirstAddAnswer) => void; event: Extract<FeedbackEvent, { kind: "first_add_dates" }> }> {
  return new Promise((resolve) => {
    const off = onPlanAddFeedback((e) => {
      if (e.kind === "first_add_dates") {
        off();
        resolve({ answer: e.answer, event: e });
      }
    });
  });
}
const tick = () => new Promise((r) => setTimeout(r, 20));
const writes = () => calls.filter((c) => c.method !== "GET");
const ref = (day?: number) => ({ kind: "gem", source_id: "g1", city: "Kyoto", ...(day ? { placement: { day_number: day } } : {}) }) as any;
const undatedGuest = () =>
  queryClient.setQueryData(GUEST_PLAN_QUERY_KEY, { plan: { id: "gp1", datesConfirmed: false, startDate: "2027-01-10", endDate: "2027-01-10" }, items: [] });

describe("QA round 3 — the first-add calendar opens before the item lands", () => {
  it("F1 guest, undated: asked first, nothing sent; Skip writes the item", async () => {
    undatedGuest();
    const asked = nextAsk();
    const run = runGuestAdd({ key: "gem:g1", ref: ref(), city: "Kyoto", chosenDate: null });
    const { answer, event } = await asked;
    await tick();
    assert.deepEqual(writes(), [], "no POST before Save/Skip");
    assert.equal(event.anchor, null, "no pressed button recorded ⇒ the sheet");
    answer({ kind: "skip" });
    await run;
    assert.deepEqual(writes().map((c) => `${c.method} ${c.path}`), ["POST /api/guest-plans/current/items"]);
  });

  it("F2 guest, undated: Save writes the dates, then the item on the press's day (inside the range)", async () => {
    undatedGuest();
    const asked = nextAsk();
    const run = runGuestAdd({ key: "gem:g1", ref: ref(2), city: "Kyoto", chosenDate: null });
    const { answer } = await asked;
    await tick();
    assert.deepEqual(writes(), []);
    answer({ kind: "save", startDate: "2027-01-10", endDate: "2027-01-13" });
    await run;
    const w = writes();
    assert.deepEqual(w.map((c) => `${c.method} ${c.path}`), ["PATCH /api/guest-plans/current", "POST /api/guest-plans/current/items"]);
    assert.deepEqual(w[0].body, { startDate: "2027-01-10", endDate: "2027-01-13" });
    assert.equal(w[1].body.placement.day_number, 2);
  });

  it("F3 guest: a press day outside the chosen range is dropped (Day 1)", async () => {
    undatedGuest();
    const asked = nextAsk();
    const run = runGuestAdd({ key: "gem:g1", ref: ref(5), city: "Kyoto", chosenDate: null });
    (await asked).answer({ kind: "save", startDate: "2027-01-10", endDate: "2027-01-11" });
    await run;
    const item = writes().find((c) => c.path === "/api/guest-plans/current/items")!;
    assert.equal(item.body.placement?.day_number, undefined);
  });

  it("F4 guest with no plan: asked first; Save creates the plan with the dates, then the item", async () => {
    const asked = nextAsk();
    const run = runGuestAdd({ key: "gem:g1", ref: ref(), city: "Kyoto, Japan", chosenDate: null });
    const { answer, event } = await asked;
    await tick();
    assert.equal(event.planId, null);
    assert.deepEqual(writes(), [], "not even the plan is created before the answer");
    answer({ kind: "save", startDate: "2027-01-10", endDate: "2027-01-12" });
    await run;
    const w = writes();
    assert.deepEqual(w.map((c) => `${c.method} ${c.path}`), ["POST /api/guest-plans", "POST /api/guest-plans/current/items"]);
    assert.equal(w[0].body.startDate, "2027-01-10");
    assert.equal(w[0].body.endDate, "2027-01-12");
    assert.equal(store.get("traveloure_first_add_dates:gp-new"), "1", "the new plan counts as asked");
  });

  it("F5 signed in, undated plan: Save PATCHes the dates, then POSTs the item — nothing before the answer", async () => {
    trips = [{ id: "t1", destination: "Kyoto, Japan", startDate: "2027-01-10", endDate: "2027-01-10", datesConfirmedAt: null, updatedAt: "2026-11-11T00:00:00Z" }];
    const asked = nextAsk();
    const run = runSignedInRefAdd({ key: "gem:g1", ref: ref(3), city: "Kyoto" });
    const { answer } = await asked;
    await tick();
    assert.deepEqual(writes(), []);
    answer({ kind: "save", startDate: "2027-01-10", endDate: "2027-01-14" });
    await run;
    const w = writes();
    assert.deepEqual(w.map((c) => `${c.method} ${c.path}`), ["PATCH /api/trips/t1", "POST /api/trips/t1/itinerary-items"]);
    assert.deepEqual(w[0].body, { startDate: "2027-01-10", endDate: "2027-01-14" });
    assert.equal(w[1].body.ref.placement.day_number, 3);
  });

  it("F6 signed in with no plan: not even the mint goes out before the answer; Save mints with the dates", async () => {
    trips = [];
    const asked = nextAsk();
    const run = runSignedInRefAdd({ key: "gem:g1", ref: ref(), city: "Kyoto" });
    const { answer } = await asked;
    await tick();
    assert.deepEqual(writes(), []);
    answer({ kind: "save", startDate: "2027-01-10", endDate: "2027-01-12" });
    await run;
    const w = writes();
    assert.deepEqual(w.map((c) => `${c.method} ${c.path}`), ["POST /api/trips", "POST /api/trips/trip-new/itinerary-items"]);
    assert.equal(w[0].body.startDate, "2027-01-10");
  });

  it("F7 chosen dates, or already asked in this tab: no ask, the write goes straight out", async () => {
    let askedCount = 0;
    const off = onPlanAddFeedback((e) => {
      if (e.kind === "first_add_dates") askedCount++;
    });
    queryClient.setQueryData(GUEST_PLAN_QUERY_KEY, { plan: { id: "gp2", datesConfirmed: true, startDate: "2027-01-10", endDate: "2027-01-12" }, items: [] });
    await runGuestAdd({ key: "gem:g1", ref: ref(), city: "Kyoto", chosenDate: null });
    undatedGuest();
    noteFirstAddAsked("gp1");
    await runGuestAdd({ key: "gem:g2", ref: ref(), city: "Kyoto", chosenDate: null });
    off();
    assert.equal(askedCount, 0);
    assert.equal(writes().filter((c) => c.path === "/api/guest-plans/current/items").length, 2);
  });

  it("F8 the day rule", () => {
    const range = { startDate: "2027-01-10", endDate: "2027-01-13" };
    assert.equal(dayInsideChosenRange(4, range), 4);
    assert.equal(dayInsideChosenRange(5, range), null);
    assert.equal(dayInsideChosenRange(null, range), null);
    assert.equal(dayInsideChosenRange(1, { startDate: "2027-01-10", endDate: "2027-01-10" }), 1);
  });
});
