/**
 * RC-12 — AN INVENTED PARTY SIZE (ledger `2026-09-25-rc12-party-size`; decision-maker ruled
 * Sep 25, 2026). Four surfaces put a traveler count on screen or on the wire that nobody stated:
 *   (a) the slip said "1 traveler" for a plan whose Who step was never answered;
 *   (b) the AI modal sent `travelers: 2` while its own summary said "(not stated)";
 *   (c) IntakePanel's Travelers field started at 2 and sent it as the plan's party;
 *   (d) the experience page wrote its search default (2) to the pen, the Trip Strip and requests.
 *
 * What these hold:
 *   F1–F3  the slip's "Who's coming?" door opens the ONE modal on step 4 — and only for a door
 *          that names a plan (`resolvePlanSteps`), every other door unchanged.
 *   F4–F6  loading a plan into the pen replaces the previous plan's party AND occasion, so another
 *          plan's answers can neither seed step 4 nor be saved onto this one.
 *   S1–S8  source pins on the four surfaces and the two server routes: nothing sends or saves a
 *          count the traveler did not state.
 *
 * No DOM, no DB: sessionStorage / window / fetch are in-memory shims installed before the pen
 * module is imported (the clear-plan.test.ts posture).
 *
 * Run: npx tsx --test client/src/lib/__tests__/rc12-party-size.test.ts
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
(globalThis as any).window = {
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as any).fetch = async () =>
  ({ ok: false, json: async () => null }) as unknown as Response;

const { resolvePlanSteps } = await import("../plan-steps");
const { getTripContext, updateTripContext, replaceTripContextPlanAnswers } = await import(
  "../trip-context"
);
const { syncActiveTripToContext } = await import("../trip-selection");

const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("the slip's Who door (RC-12a)", () => {
  it("F1: a door naming a plan with focusStep 'who' opens on step 4", () => {
    const steps = resolvePlanSteps({ tripId: "t-1", focusStep: "who" }, null, null);
    assert.equal(steps.startStep, "who");
    assert.ok(steps.visibleSteps.includes("where") && steps.visibleSteps.includes("when"));
  });

  it("F2: without a plan the focus is ignored — the ordinary door table answers", () => {
    assert.equal(resolvePlanSteps({ focusStep: "who" }, null, null).startStep, "occasion");
    assert.equal(resolvePlanSteps({ tripId: "   ", focusStep: "who" }, null, null).startStep, "occasion");
  });

  it("F3: every other door is unchanged", () => {
    assert.equal(resolvePlanSteps({ tripId: "t-1" }, null, null).startStep, "occasion");
    assert.equal(resolvePlanSteps(null, null, null).startStep, "occasion");
  });
});

describe("loading a plan into the pen carries that plan's own answers (RC-12a)", () => {
  beforeEach(() => store.clear());

  it("F4: the previous plan's party and occasion do not survive", () => {
    updateTripContext({ tripId: "old", adults: 3, kids: 2, experienceSlug: "wedding" } as any);
    syncActiveTripToContext({
      id: "new",
      destination: "Kyoto",
      startDate: "2026-11-01",
      endDate: "2026-11-05",
      travelers: null,
      adults: null,
      kids: null,
      experienceSlug: null,
    });
    const ctx = getTripContext();
    assert.equal(ctx.tripId, "new");
    assert.equal(ctx.adults, undefined);
    assert.equal(ctx.kids, undefined);
    assert.equal(ctx.experienceSlug, undefined);
    assert.equal(ctx.travelers, undefined);
  });

  it("F5: a plan's own stated answers are loaded", () => {
    updateTripContext({ adults: 7 } as any);
    syncActiveTripToContext({ id: "p", adults: 2, kids: 1, experienceSlug: "romance" });
    const ctx = getTripContext();
    assert.equal(ctx.adults, 2);
    assert.equal(ctx.kids, 1);
    assert.equal(ctx.experienceSlug, "romance");
  });

  it("F6: 0, negative and blank are 'not stated' and are removed, never stored", () => {
    updateTripContext({ adults: 4, kids: 1, experienceSlug: "golf" } as any);
    replaceTripContextPlanAnswers({ adults: 0, kids: -1, experienceSlug: "  " });
    const ctx = getTripContext();
    assert.equal(ctx.adults, undefined);
    assert.equal(ctx.kids, undefined);
    assert.equal(ctx.experienceSlug, undefined);
  });
});

describe("nothing sends or saves a count nobody stated (RC-12 source pins)", () => {
  it("S1: the plancard assembler passes no fallback to the party ladder", () => {
    const src = read("server/services/trip-plan.service.ts");
    assert.match(src, /plancardPartyCount\(trip\.adults, trip\.kids, trip\.numberOfTravelers\)/);
  });

  it("S2: the slip header asks the owner, and the plancard readers invent no 1", () => {
    const view = read("client/src/components/plancard/SlipView.tsx");
    assert.match(view, /data-testid="slip-meta-ask-party"/);
    assert.match(view, /focusStep: "who"/);
    const rail = read("client/src/components/plancard/SlipRail.tsx");
    assert.doesNotMatch(rail, /trip\.travelers \|\| 1/);
    const finalize = read("client/src/components/plancard/FinalizeBookingModal.tsx");
    assert.doesNotMatch(finalize, /trip\.travelers \?\? 1/);
  });

  it("S3: the AI modal has no fallback count and sends none it was not given", () => {
    const src = read("client/src/components/EnhancedPlanningModal.tsx");
    assert.doesNotMatch(src, /initialTravelers : 2/);
    assert.doesNotMatch(src, /\(not stated\)/);
    assert.match(src, /\.\.\.\(travelers !== null \? \{ travelers \} : \{\}\)/);
  });

  it("S4: the generate route accepts a missing count and saves none", () => {
    const src = read("server/routes/content.routes.ts");
    const start = src.indexOf('router.post("/api/ai/generate-itinerary"');
    const end = src.indexOf('router.post("/api/ai/generate-optimized-itineraries"');
    const route = src.slice(start, end);
    assert.match(route, /const travelersStated: number \| undefined =/);
    assert.doesNotMatch(route, /if \(!travelers \|\| typeof travelers/);
    assert.match(route, /numberOfTravelers: travelersStated \?\? null/);
  });

  it("S5: save-as-trip saves no count it was not sent", () => {
    const src = read("server/routes/content.routes.ts");
    assert.match(src, /numberOfTravelers: body\.travelers \?\? null/);
    assert.doesNotMatch(src, /numberOfTravelers: body\.travelers \?\? 1/);
  });

  it("S6: IntakePanel starts empty and sends only a typed count", () => {
    const src = read("client/src/components/intake-panel.tsx");
    assert.doesNotMatch(src, /useState\(2\)/);
    assert.doesNotMatch(src, /numberOfTravelers: travelers,/);
    assert.match(src, /partyStated !== undefined \? \{ numberOfTravelers: partyStated \}/);
  });

  it("S7: the experience page never writes its search assumption as the party", () => {
    const src = read("client/src/pages/experience-template.tsx");
    for (const m of src.matchAll(/switchTripContextPreservingId\(\{[\s\S]*?\}\);/g)) {
      assert.doesNotMatch(m[0], /travelers: adults \+ kids/, "a pen write carries the search default");
    }
    const snapshot = src.slice(src.indexOf("const buildPlanSnapshot"), src.indexOf("const buildPlanSnapshot") + 700);
    assert.doesNotMatch(snapshot, /travelers: adults \+ kids/);
    assert.match(src, /partyStated=\{statedParty !== undefined\}/);
    assert.match(src, /text-party-assumption-/);
  });

  it("S8: the AI builder saves a count only when it was stated", () => {
    const src = read("client/src/components/ai-itinerary-builder.tsx");
    assert.match(src, /\.\.\.\(partyStated \? \{ travelers \} : \{\}\)/);
  });
});
