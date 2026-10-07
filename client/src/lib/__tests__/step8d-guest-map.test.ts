/**
 * STEP 8d — THE GUEST MAP (ledger `2026-10-07-step8d-guest-map`; step 8 brief rev 3.1 items 24–26,
 * decision D3's second half; the decision-maker's 8d go of Oct 7, 2026).
 *
 *   G1  the sign-in record v2 carries AT MOST ONE pending add — by id, Day 1; a second add replaces
 *       the first; a v1 record still reads (no add); a malformed add is dropped, never guessed.
 *   G2  after sign-in the record is taken (cleared) BEFORE the replay, and the replay carries the add.
 *   G3  the add runs once: the plan is read first (already there ⇒ nothing posted); the listing is
 *       RE-READ from its public endpoint and a withdrawn one (404) is reported, not added; the post is
 *       the ONE add body on the EXISTING item route, built from the fresh read, Day 1.
 *   G4  a failure keeps the retry entry (the add is retried, never the mint); a final outcome clears it.
 *   G5  the guest map's words are the board's, and only what the guest answered is repeated.
 *   G6  the centre is one of the eight cities, exactly — a centre, never a pin; none outside the eight.
 *   G7  the landing rule: only `myself` from the Experiences door goes to the guest map.
 *   G8  source pins: `/plans/new` is unprotected and registered before the protected `/plans/:tripId`;
 *       the guest map never calls `/api/geocode` and never writes `/api/cart`; the provider's replay
 *       carries the add; the retry entry is written BEFORE the add runs.
 *
 * Pure — sessionStorage and fetch are in-memory shims. Run:
 *   npx tsx --test client/src/lib/__tests__/step8d-guest-map.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const store = new Map<string, string>();
(globalThis as any).window = {
  sessionStorage: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
};

const {
  PENDING_PLAN_RECORD_KEY,
  __resetPendingPlanRecordForTests,
  consumePendingPlanRecord,
  peekPendingPlanRecord,
  setPendingMapAdd,
  takePendingPlanRecord,
  writePendingPlanRecord,
} = await import("../pending-plan-record");
const { PENDING_MAP_ADD_RETRY_KEY, attachPendingMapAdd, planAlreadyHolds, readPendingMapAddRetry, writePendingMapAddRetry } =
  await import("../pending-map-add");
const guest = await import("../guest-map");
const { GUEST_MAP_PATH, opensGuestMap } = await import("../plan-landing");

const answers = {
  title: "", stops: ["Kyoto"], startDate: "2026-11-12", endDate: "2026-11-16", adults: "2", kids: "",
  budgetApproverName: "", budgetApproverEmail: "", accessibilityNote: "", mainMomentTime: "", mainMomentDate: "",
  events: [], occasionSlug: "travel",
};

test("G1: the record carries one pending add by id, Day 1; a second replaces it; v1 still reads", () => {
  store.clear();
  assert.equal(setPendingMapAdd({ kind: "listing", id: "s1", title: "Tea", dayNumber: 1 }), false, "no record ⇒ nothing kept");
  writePendingPlanRecord({ branch: "myself", door: "experiences", answers, source: { experienceSlug: "travel" } });
  assert.equal(JSON.parse(store.get(PENDING_PLAN_RECORD_KEY)!).v, 2);
  assert.equal(peekPendingPlanRecord()?.pendingAdd ?? null, null, "no add until the guest presses Add");
  assert.equal(setPendingMapAdd({ kind: "listing", id: "s1", title: "Tea", dayNumber: 1 }), true);
  assert.equal(setPendingMapAdd({ kind: "partner", id: "p9", title: "Boat", dayNumber: 1 }), true);
  const rec = peekPendingPlanRecord()!;
  assert.deepEqual(rec.pendingAdd, { kind: "partner", id: "p9", title: "Boat", dayNumber: 1 }, "one action: the second replaces the first");
  assert.equal(rec.answers.startDate, "2026-11-12", "the answers ride along untouched");
  // The add holds no coordinate, price or body.
  assert.deepEqual(Object.keys(JSON.parse(store.get(PENDING_PLAN_RECORD_KEY)!).pendingAdd).sort(), ["dayNumber", "id", "kind", "title"]);
  // A v1 record (written before 8d) still reads, with no add.
  const v1 = { ...JSON.parse(store.get(PENDING_PLAN_RECORD_KEY)!), v: 1 };
  store.set(PENDING_PLAN_RECORD_KEY, JSON.stringify(v1));
  assert.equal(peekPendingPlanRecord()?.pendingAdd, null);
  // A malformed add is dropped, never guessed.
  store.set(PENDING_PLAN_RECORD_KEY, JSON.stringify({ ...v1, v: 2, pendingAdd: { kind: "hotel", id: "x", title: "X" } }));
  assert.equal(peekPendingPlanRecord()?.pendingAdd, null);
  assert.ok(peekPendingPlanRecord(), "peek never consumes");
});

test("G2: taken (cleared) before the replay; the replay carries the add; a reload replays nothing", () => {
  store.clear();
  __resetPendingPlanRecordForTests();
  writePendingPlanRecord({ branch: "myself", door: "experiences", answers, source: {} });
  setPendingMapAdd({ kind: "listing", id: "s1", title: "Tea", dayNumber: 1 });
  const seen: unknown[] = [];
  const first = consumePendingPlanRecord({
    take: () => takePendingPlanRecord(),
    replay: (r) => {
      assert.equal(store.has(PENDING_PLAN_RECORD_KEY), false, "cleared before the plan is created");
      seen.push(r.pendingAdd);
    },
  });
  assert.equal(first, "replayed");
  assert.deepEqual(seen, [{ kind: "listing", id: "s1", title: "Tea", dayNumber: 1 }]);
  assert.equal(consumePendingPlanRecord({ take: () => takePendingPlanRecord(), replay: () => seen.push("again") }), "none");
  assert.equal(seen.length, 1, "one plan, one add");
});

type Call = { url: string; method: string; body?: any };
function fakeFetch(routes: Record<string, { status: number; json?: unknown }>, calls: Call[]) {
  return async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const r = routes[`${method} ${url}`];
    if (!r) throw new Error(`unexpected ${method} ${url}`);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json } as Response;
  };
}
const ITEMS = "/api/trips/t1/itinerary-items";
const listingAdd = { kind: "listing" as const, id: "s1", title: "Tea (as the guest saw it)", dayNumber: 1 as const };

test("G3: the add runs once — plan read first, listing re-read, ONE body on the existing route, Day 1", async () => {
  store.clear();
  const calls: Call[] = [];
  const out = await attachPendingMapAdd(
    "t1",
    listingAdd,
    fakeFetch(
      {
        [`GET ${ITEMS}`]: { status: 200, json: { days: [], total: 0 } },
        "GET /api/services/s1": { status: 200, json: { id: "s1", serviceName: "Tea ceremony", latitude: "35.01", longitude: "135.77" } },
        [`POST ${ITEMS}`]: { status: 201, json: { id: "i1" } },
      },
      calls,
    ),
  );
  assert.equal(out.status, "added");
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [`GET ${ITEMS}`, "GET /api/services/s1", `POST ${ITEMS}`]);
  const body = calls[2].body;
  assert.equal(body.providerServiceId, "s1");
  assert.equal(body.dayNumber, 1);
  assert.equal(body.title, "Tea ceremony", "built from the FRESH read, not what the guest's browser held");
  assert.equal(body.latitude, "35.01");

  // Already on the plan (a retry after a lost answer): nothing is posted.
  const calls2: Call[] = [];
  const again = await attachPendingMapAdd(
    "t1",
    listingAdd,
    fakeFetch({ [`GET ${ITEMS}`]: { status: 200, json: { days: [{ dayNumber: 1, items: [{ providerServiceId: "s1" }] }] } } }, calls2),
  );
  assert.equal(again.status, "already");
  assert.equal(calls2.filter((c) => c.method === "POST").length, 0);

  // Withdrawn during the round trip: reported, never added.
  const calls3: Call[] = [];
  const gone = await attachPendingMapAdd(
    "t1",
    listingAdd,
    fakeFetch({ [`GET ${ITEMS}`]: { status: 200, json: { days: [] } }, "GET /api/services/s1": { status: 404 } }, calls3),
  );
  assert.equal(gone.status, "withdrawn");
  assert.equal(calls3.filter((c) => c.method === "POST").length, 0);

  // A partner place re-reads its own public endpoint; an approximate listing adds unlocated.
  const calls4: Call[] = [];
  await attachPendingMapAdd(
    "t1",
    { kind: "partner", id: "p9", title: "Boat", dayNumber: 1 },
    fakeFetch(
      {
        [`GET ${ITEMS}`]: { status: 200, json: { days: [] } },
        "GET /api/affiliate/products/p9": { status: 200, json: { product: { id: "p9", name: "River boat", coordinates: { lat: 35, lng: 135.7 } } } },
        [`POST ${ITEMS}`]: { status: 201, json: {} },
      },
      calls4,
    ),
  );
  assert.equal(calls4[2].body.affiliateProductId, "p9");
  const calls5: Call[] = [];
  await attachPendingMapAdd(
    "t1",
    listingAdd,
    fakeFetch(
      {
        [`GET ${ITEMS}`]: { status: 200, json: { days: [] } },
        "GET /api/services/s1": { status: 200, json: { id: "s1", serviceName: "Ryokan", latitude: "35", longitude: "135", locationApproximate: true } },
        [`POST ${ITEMS}`]: { status: 201, json: {} },
      },
      calls5,
    ),
  );
  assert.equal("latitude" in calls5[2].body, false, "a blurred point is not posted as a location");
  assert.equal(planAlreadyHolds({ nope: true }, listingAdd), null, "an unreadable plan is not read as empty");
});

test("G4: a failure keeps the retry (the add, never the mint); a final outcome clears it", async () => {
  store.clear();
  writePendingMapAddRetry("t1", listingAdd);
  const failed = await attachPendingMapAdd(
    "t1",
    listingAdd,
    fakeFetch(
      {
        [`GET ${ITEMS}`]: { status: 200, json: { days: [] } },
        "GET /api/services/s1": { status: 200, json: { id: "s1", serviceName: "Tea" } },
        [`POST ${ITEMS}`]: { status: 500, json: { message: "boom" } },
      },
      [],
    ),
  );
  assert.equal(failed.status, "failed");
  assert.equal(readPendingMapAddRetry()?.tripId, "t1", "kept for the next load");
  const ok = await attachPendingMapAdd(
    "t1",
    listingAdd,
    fakeFetch({ [`GET ${ITEMS}`]: { status: 200, json: { days: [{ dayNumber: 1, items: [{ providerServiceId: "s1" }] }] } } }, []),
  );
  assert.equal(ok.status, "already");
  assert.equal(store.has(PENDING_MAP_ADD_RETRY_KEY), false, "cleared once the plan holds it");
});

test("G5: the board's words; only what the guest answered", () => {
  assert.equal(guest.guestAnswersLine(answers, "Kyoto"), "Kyoto, Thu 12 – Mon 16 Nov and 2 travelers");
  assert.equal(guest.guestAnswersLine({ ...answers, adults: "", kids: "" }, "Kyoto"), "Kyoto, Thu 12 – Mon 16 Nov", "no party ⇒ none shown");
  assert.equal(guest.guestAnswersLine({ ...answers, adults: "1" }, "Kyoto"), "Kyoto, Thu 12 – Mon 16 Nov and 1 traveler");
  assert.equal(guest.guestDateRange("2026-10-30", "2026-11-02"), "Fri 30 Oct – Mon 2 Nov");
  assert.equal(
    guest.guestGateDescription("Kyoto, Thu 12 – Mon 16 Nov and 2 travelers", { kind: "add", name: "Tea ceremony" }),
    "Kyoto, Thu 12 – Mon 16 Nov and 2 travelers are kept from your answers. Tea ceremony is added as soon as you are in.",
  );
  assert.equal(guest.guestGateNext({ kind: "start" }), "Your empty plan opens here, on the map.");
  assert.equal(guest.GUEST_GATE_TITLE, "Your plan is created when you sign in");
  assert.equal(guest.GUEST_GATE_DISMISS, "Keep browsing");
  assert.equal(guest.GUEST_MAP_BANNER, "Browse freely. Your plan is created when you sign in, and these answers come with you.");
});

test("G6: the centre is one of the eight cities exactly — none outside them", () => {
  assert.deepEqual(guest.guestMapCenter("Kyoto"), { lat: 35.0116, lng: 135.7681 });
  assert.deepEqual(guest.guestMapCenter("Kyoto, Japan"), { lat: 35.0116, lng: 135.7681 });
  assert.equal(guest.guestMapCenter("Osaka"), null);
  assert.equal(guest.guestMapCenter(""), null);
  assert.equal(guest.guestDestination({ stops: [] }, { destination: null, city: "Porto" }), "Porto");
});

test("G7: only `myself` from the Experiences door lands a guest on the guest map", () => {
  assert.equal(GUEST_MAP_PATH, "/plans/new?view=map");
  assert.equal(opensGuestMap("myself", "experiences"), true);
  assert.equal(opensGuestMap("myself", "hero"), false);
  assert.equal(opensGuestMap("ai", "experiences"), false);
  assert.equal(opensGuestMap("local", "experiences"), false);
});

test("G8: source pins — route, no geocode, no cart, the replay carries the add, retry before the add", () => {
  const app = read("client/src/App.tsx");
  const guestAt = app.indexOf('<Route path="/plans/new">');
  const protectedAt = app.indexOf('<Route path="/plans/:tripId">');
  assert.ok(guestAt > 0 && guestAt < protectedAt, "/plans/new is registered before /plans/:tripId");
  assert.match(app, /<Route path="\/plans\/new">\s*<Layout><GuestPlanMapPage \/><\/Layout>/, "unprotected");
  assert.match(app, /PlanPageShell><ProtectedRoute component=\{SlipViewPage\}/, "/plans/:tripId stays protected");
  const mcc = read("client/src/components/plancard/MapControlCenter.tsx");
  assert.match(mcc, /enabled: !guest && !!tripDestination && !firstPoint,/, "the guest map never calls /api/geocode");
  const page = read("client/src/pages/guest-plan-map.tsx");
  assert.ok(!page.includes("/api/cart"), "the guest map writes no cart");
  assert.ok(!/apiRequest\(/.test(page), "the guest map writes nothing to the server");
  const ctx = read("client/src/contexts/PlanningContext.tsx");
  assert.match(ctx, /\.\.\.\(record\.pendingAdd \? \{ pendingMapAdd: record\.pendingAdd \} : \{\}\)/);
  const writeAt = ctx.indexOf("writePendingMapAddRetry(outcome.tripId, add);");
  const attachAt = ctx.indexOf("await attachPendingMapAdd(outcome.tripId, add);");
  assert.ok(writeAt > 0 && writeAt < attachAt, "the retry entry is written before the add runs");
});
