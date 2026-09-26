/**
 * READING A PLAN NEVER REWRITES ITS OCCASION (ledger `2026-09-26-occasion-read-only`; audit
 * `docs/planning/trip-slip-ui-audit.md` G4/G5 — both VERIFIED in the running app).
 *
 * G4: opening a wedding plan's slip after a vacation plan pushed `eventType: "vacation"` into the
 *     wedding plan's `trip_contexts` row — the pen carried the previous plan's coarse event type.
 * G5: visiting `/experiences/wedding` with a Kyoto vacation plan active wrote `experienceSlug:
 *     "wedding"`, `experienceType: "Wedding"` and a "Wedding Experience" title into that plan's pen,
 *     so the Trip Strip read "Your Kyoto Wedding" and the plan modal would seed — and save — Wedding.
 *
 * What these hold (the pen shims of `rc345-active-plan.test.ts`; no DOM, no DB):
 *   C1  opening plan B after plan A carries NONE of A's occasion into B's pen or its push.
 *   C2  every push from a read surface says `occasionEdit: false` — the server keeps the stored
 *       occasion (proven against Postgres in `server/__tests__/occasion-read-only.db.test.ts`).
 *   C3  the template page's pen write keeps a BOUND plan's occasion and title.
 *   C4  on an UNBOUND draft the template's occasion still rides (a draft is what it describes).
 *   C5  the plan modal's occasion commit is the one flagged edit, and Clear plan is too.
 *   C6  source pins: the template page has no direct occasion write left; the modal-open door does
 *       not write an occasion onto a bound pen.
 *
 * Run: npx tsx --test client/src/lib/__tests__/occasion-read-only.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const store = new Map<string, string>();
(globalThis as any).sessionStorage = {
  get length() {
    return store.size;
  },
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
(globalThis as any).CustomEvent = class {
  type: string;
  constructor(type: string) {
    this.type = type;
  }
};
(globalThis as any).window = { dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} };

/** Every PUT the pen sends: its query and parsed body. */
const puts: { url: string; body: any }[] = [];
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  if (init?.method === "PUT") puts.push({ url, body: JSON.parse(init.body ?? "{}") });
  return { ok: true, json: async () => ({ context: {} }) } as unknown as Response;
};

import { bindPenPrincipal, getTripContext, updateTripContext, clearTripContext } from "../trip-context";
import { activateOpenedPlan } from "../trip-selection";
import { writeTemplatePen } from "../template-pen";

const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const settle = () => new Promise((r) => setTimeout(r, 1700)); // past the 1.5s push debounce

const vacation = { id: "trip-vac", destination: "Kyoto", startDate: "2027-04-10", endDate: "2027-04-14", title: "Kyoto spring", eventType: "vacation" };
const wedding = { id: "trip-wed", destination: "Kyoto", startDate: "2027-06-01", endDate: "2027-06-03", title: "Our wedding", eventType: "wedding" };

beforeEach(async () => {
  await bindPenPrincipal(null);
  store.clear();
  await bindPenPrincipal("user-a");
  await settle();
  puts.length = 0;
});

describe("G4 — opening a slip does not carry another plan's occasion", () => {
  it("C1/C2: vacation plan, then the wedding plan's slip ⇒ no 'vacation' reaches the wedding plan", async () => {
    activateOpenedPlan(vacation, "owner", "user-a");
    // The vacation plan's modal once recorded its occasion (an explicit edit, long ago).
    updateTripContext({ experienceSlug: "travel", eventType: "vacation" }, { occasionEdit: true });
    await settle();
    puts.length = 0;

    activateOpenedPlan(wedding, "owner", "user-a");
    const pen = getTripContext();
    assert.equal(pen.tripId, "trip-wed");
    assert.notEqual(pen.eventType, "vacation", "the previous plan's event type is not carried");
    assert.notEqual(pen.experienceSlug, "travel", "the previous plan's slug is not carried");

    await settle();
    const push = puts.find((p) => p.url.includes("tripId=trip-wed"));
    assert.ok(push, "the slip load pushed the wedding plan's pen");
    assert.notEqual(push!.body.context.eventType, "vacation");
    assert.equal(push!.body.occasionEdit, false, "a slip load is never an occasion edit");
  });
});

describe("G5 — reading a template page does not relabel the active plan", () => {
  it("C3: a bound Kyoto vacation plan keeps its occasion and title on /experiences/wedding", async () => {
    activateOpenedPlan(vacation, "owner", "user-a");
    updateTripContext({ experienceSlug: "travel" }, { occasionEdit: true });
    await settle();
    puts.length = 0;
    const before = getTripContext();

    // The page's mount sync, and its "add and go to cart" handler.
    writeTemplatePen({ slug: "wedding", occasionName: "Wedding", destination: "Kyoto", startDate: "2027-04-10", endDate: "2027-04-14" });
    writeTemplatePen({ slug: "wedding", title: "Wedding Experience", occasionName: "Wedding", destination: "Kyoto, Japan" });

    const pen = getTripContext();
    assert.equal(pen.tripId, "trip-vac", "the plan stays bound (same city)");
    assert.equal(pen.experienceSlug, "travel");
    assert.equal(pen.experienceType, before.experienceType);
    assert.equal(pen.title, "Kyoto spring", "the plan's title is not replaced by the template's");

    await settle();
    for (const p of puts) {
      assert.notEqual(p.body.context.experienceSlug, "wedding");
      assert.notEqual(p.body.context.experienceType, "Wedding");
      assert.equal(p.body.occasionEdit, false);
    }
  });

  it("C4: with no plan behind the pen, the template's occasion rides the draft", async () => {
    writeTemplatePen({ slug: "wedding", occasionName: "Wedding", destination: "Lisbon" });
    const pen = getTripContext();
    assert.equal(pen.tripId, undefined);
    assert.equal(pen.experienceSlug, "wedding");
    assert.equal(pen.experienceType, "Wedding");
  });

  it("C4b: a DIFFERENT city leaves the plan — the new draft carries the template's occasion", async () => {
    activateOpenedPlan(vacation, "owner", "user-a");
    writeTemplatePen({ slug: "wedding", occasionName: "Wedding", destination: "Lisbon" });
    const pen = getTripContext();
    assert.equal(pen.tripId, undefined);
    assert.equal(pen.experienceType, "Wedding");
    assert.equal(pen.experienceSlug, "wedding");
  });
});

describe("the explicit edits are the flagged ones", () => {
  it("C5: an occasion commit pushes occasionEdit: true, and Clear plan does too", async () => {
    activateOpenedPlan(vacation, "owner", "user-a");
    await settle();
    puts.length = 0;
    updateTripContext({ experienceSlug: "honeymoon", eventType: "honeymoon" }, { occasionEdit: true });
    await settle();
    assert.equal(puts.at(-1)?.body.occasionEdit, true);

    puts.length = 0;
    clearTripContext();
    await settle();
    assert.ok(puts.length > 0);
    for (const p of puts) assert.equal(p.body.occasionEdit, true, "Clear plan clears the occasion too");
  });

  it("C6: source pins — no direct occasion write left on the template page; the modal door is gated", () => {
    const page = read("client/src/pages/experience-template.tsx");
    assert.equal(/updateTripContext\(\{\s*experienceSlug/.test(page), false, "no direct slug write");
    assert.equal(page.includes("switchTripContextPreservingId({"), false, "identity writes go through writeTemplatePen");
    assert.ok((page.match(/writeTemplatePen\(/g) ?? []).length >= 5);

    const modal = read("client/src/components/trip/plan-modal.tsx");
    assert.match(modal, /\{ occasionEdit: true \}/);

    const planning = read("client/src/contexts/PlanningContext.tsx");
    assert.match(planning, /next\?\.experienceSlug && !getTripContext\(\)\.tripId/);
  });
});
