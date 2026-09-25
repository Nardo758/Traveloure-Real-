/**
 * RC-3 / RC-4 / RC-5 — THE ACTIVE PLAN IS BOUND, RECOVERED AND RE-TARGETED (ledger
 * `2026-09-25-rc345-active-plan`; audit `docs/audits/GAP_REGISTER.md` §A rows 24–26 and
 * `docs/audits/H8_ACTIVE_TRIP_RESOLUTION.md` D1/D2/D6).
 *
 * The audit proved three ways the client lost "the plan being built" and sent an add to the cart
 * or to the WRONG plan: (RC-3) the ONE pen binder was mounted in the public `Layout` only, so a
 * signed-in cold load of a console-shelled page never bound; (RC-4) a new session hydrated the
 * legacy `trip_contexts` row, which a mint never writes a `tripId` into; (RC-5) creating or
 * opening a plan never wrote the pen, so viewing plan B added to plan A.
 *
 * What these hold:
 *   B1–B3  RC-3: `PenBinder` is the ONE mount of `useTripContextSync`, in `App.tsx` above every
 *          shell; `layout.tsx` no longer calls it; the bind announces itself SYNCHRONOUSLY
 *          (`PEN_BOUND_EVENT`) before the hand-off and the hydrate it awaits.
 *   A1–A5  RC-5: `activateOpenedPlan` writes for the OWNER only, only once the pen is bound to the
 *          viewer, never for a pen already naming the plan, and REPLACES a previous plan's
 *          identity; the slip, the Trip Card and `useCreateTrip` are its callers.
 *   H1     the guest hand-off keeps a plan the viewer opened while it was in flight.
 *   R1     RC-4 (source pin; the behaviour is proven against Postgres by
 *          `server/__tests__/trip-context-recovery.db.test.ts`): the bare read answers the newest
 *          row and no longer selects the legacy row by predicate.
 *
 * No DOM, no DB, no React render — the shims of `client-pen-scope.test.ts` beside it.
 *
 * Run: npx tsx --test client/src/lib/__tests__/rc345-active-plan.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── The shims, installed before the import below ──────────────────────────────────────────────
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
const events: string[] = [];
(globalThis as any).CustomEvent = class {
  type: string;
  constructor(type: string) {
    this.type = type;
  }
};
(globalThis as any).window = {
  dispatchEvent: (e: { type: string }) => void events.push(e.type),
  addEventListener: () => {},
  removeEventListener: () => {},
};
/** What `GET /api/trip-context` answers; the PUT resolves only when `releasePut` is called. */
let serverPen: { ok: boolean; context: unknown } = { ok: true, context: {} };
let releasePut: (() => void) | null = null;
let holdPut = false;
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  if (!init?.method || init.method === "GET") {
    return { ok: serverPen.ok, json: async () => ({ context: serverPen.context }) } as unknown as Response;
  }
  if (holdPut) await new Promise<void>((r) => (releasePut = r));
  return { ok: true, json: async () => ({}) } as unknown as Response;
};

import {
  GUEST_PEN_KEY,
  PEN_BOUND_EVENT,
  bindPenPrincipal,
  getPenPrincipal,
  getTripContext,
  penKeyFor,
  switchTripContext,
} from "../trip-context";
import { activateOpenedPlan } from "../trip-selection";

const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const kyoto = { id: "trip-kyoto", destination: "Kyoto", startDate: "2027-04-10", endDate: "2027-04-14", title: "Kyoto" };
const osaka = { id: "trip-osaka", destination: "Osaka", startDate: "2027-05-01", endDate: "2027-05-03", title: "Osaka" };

beforeEach(async () => {
  serverPen = { ok: true, context: {} };
  holdPut = false;
  releasePut = null;
  await bindPenPrincipal(null);
  store.clear();
  events.length = 0;
});

// ── RC-3 ──────────────────────────────────────────────────────────────────────────────────────

describe("RC-3 — the ONE binder mounts above every shell", () => {
  it("B1: PenBinder is the one caller of useTripContextSync, and App.tsx mounts it once", () => {
    const binder = read("client/src/components/pen-binder.tsx");
    assert.match(binder, /useTripContextSync\(isLoading \? undefined : /);
    const app = read("client/src/App.tsx");
    assert.equal(app.split("<PenBinder />").length - 1, 1, "App.tsx mounts <PenBinder /> exactly once");
    assert.ok(app.indexOf("<PenBinder />") < app.indexOf("<Router />"), "the binder sits above the router");
  });

  it("B2: the public Layout no longer binds — a second binder is the drift §18 rule 1 names", () => {
    const layout = read("client/src/components/layout.tsx");
    assert.equal(layout.includes("useTripContextSync("), false);
    assert.equal(layout.includes('from "@/lib/trip-context"'), false);
    // BrowseShell still renders DashboardLayout for a signed-in traveler — the case RC-3 is about.
    assert.match(read("client/src/components/browse-shell.tsx"), /<DashboardLayout>\{children\}<\/DashboardLayout>/);
  });

  it("B3: the bind announces itself synchronously, before the hand-off and hydrate it awaits", async () => {
    holdPut = true;
    store.set(GUEST_PEN_KEY, JSON.stringify({ destination: "Lisbon" })); // a guest pen forces the hand-off PUT
    const pending = bindPenPrincipal("user-a");
    assert.equal(getPenPrincipal(), "user-a");
    assert.ok(events.includes(PEN_BOUND_EVENT), "PEN_BOUND_EVENT fired before the first await");
    await sleep(0);
    releasePut?.();
    await pending;
  });
});

// ── RC-5 ──────────────────────────────────────────────────────────────────────────────────────

describe("RC-5 — opening or creating a plan makes it the active plan", () => {
  it("A1: a non-owner's view never becomes their pen — advisor, delegate, viewer, unknown", async () => {
    await bindPenPrincipal("user-a");
    for (const role of ["expert", "delegate", "viewer", "author", null, undefined]) {
      assert.equal(activateOpenedPlan(kyoto, role, "user-a"), false, `role ${String(role)}`);
    }
    assert.equal(getTripContext().tripId, undefined);
  });

  it("A2: the owner's open waits for the bind — an unbound pen is not written (it would be the guest key)", async () => {
    assert.equal(activateOpenedPlan(kyoto, "owner", null), false);
    assert.equal(store.has(GUEST_PEN_KEY), false, "nothing landed in the guest key");
    await bindPenPrincipal("user-a");
    assert.equal(activateOpenedPlan(kyoto, "owner", getPenPrincipal()), true);
    const pen = JSON.parse(store.get(penKeyFor("user-a"))!);
    assert.equal(pen.tripId, "trip-kyoto");
    assert.equal(pen.destination, "Kyoto");
  });

  it("A3: idempotent — a pen already naming the plan is left exactly as it is", async () => {
    await bindPenPrincipal("user-a");
    activateOpenedPlan(kyoto, "owner", "user-a");
    switchTripContext({ tripId: "trip-kyoto", destination: "Kyoto", title: "Kyoto, renamed since" });
    const before = store.get(penKeyFor("user-a"));
    assert.equal(activateOpenedPlan(kyoto, "owner", "user-a"), false);
    assert.equal(store.get(penKeyFor("user-a")), before);
  });

  it("A4: opening plan B REPLACES plan A's identity — viewing B never adds to A (J2 R4b)", async () => {
    await bindPenPrincipal("user-a");
    activateOpenedPlan(kyoto, "owner", "user-a");
    assert.equal(activateOpenedPlan(osaka, "owner", "user-a"), true);
    const pen = getTripContext();
    assert.equal(pen.tripId, "trip-osaka");
    assert.equal(pen.destination, "Osaka");
    assert.equal(pen.startDate, "2027-05-01");
    assert.equal(pen.title, "Osaka");
  });

  it("A5: the slip, the Trip Card and useCreateTrip are the callers, and each names the ONE rule", () => {
    const slip = read("client/src/components/plancard/SlipView.tsx");
    assert.match(slip, /const penPrincipal = usePenPrincipal\(\);/);
    assert.match(slip, /activateOpenedPlan\(\n\s+openedTrip/);
    assert.match(slip, /data\.tripRole,\n\s+penPrincipal,\n\s+\);/);
    const card = read("client/src/pages/trip-details.tsx");
    assert.match(card, /activateOpenedPlan\(trip, openedRole, penPrincipal\);/);
    const hook = read("client/src/hooks/use-trips.ts");
    assert.match(hook, /if \(user\) syncActiveTripToContext\(trip\);/);
    // The rule lives once: nothing else in client/ re-derives "opening makes it active".
    const selection = read("client/src/lib/trip-selection.ts");
    assert.match(selection, /tripRole !== "owner" \|\| penPrincipal === null\) return false;/);
    assert.match(selection, /getTripContext\(\)\.tripId === trip\.id\) return false;/);
  });
});

// ── the hand-off ──────────────────────────────────────────────────────────────────────────────

describe("H — the guest hand-off keeps a plan opened while it was in flight", () => {
  it("H1: answers fill in AROUND the opened plan; they never replace it", async () => {
    holdPut = true;
    store.set(GUEST_PEN_KEY, JSON.stringify({ destination: "Lisbon", travelers: 3 }));
    const pending = bindPenPrincipal("user-a");
    await sleep(0); // the GET answered; the PUT is held
    assert.equal(activateOpenedPlan(kyoto, "owner", getPenPrincipal()), true);
    releasePut?.();
    await pending;
    const pen = JSON.parse(store.get(penKeyFor("user-a"))!);
    assert.equal(pen.tripId, "trip-kyoto");
    assert.equal(pen.destination, "Kyoto", "the opened plan's own destination wins");
    assert.equal(pen.travelers, 3, "a guest answer the plan did not state fills in");
  });
});

// ── RC-4 ──────────────────────────────────────────────────────────────────────────────────────

describe("RC-4 — the bare read answers the newest pen row (source pin; db proof beside it)", () => {
  it("R1: ORDER BY updated_at DESC, and no `trip_id IS NULL` selection in the GET", () => {
    const route = read("server/routes/trip-context.routes.ts");
    const get = route.slice(route.indexOf('router.get("/api/trip-context"'), route.indexOf('router.put("/api/trip-context"'));
    assert.match(get, /ORDER BY updated_at DESC NULLS LAST LIMIT 1/);
    assert.equal(get.includes("AND trip_id IS NULL"), false, "the bare read no longer selects the legacy row by predicate");
    assert.match(get, /if \(row\?\.trip_id && !context\.tripId\) context\.tripId = row\.trip_id;/);
    // The PUT's two ON CONFLICT branches are untouched: a bare write still lands on the legacy row.
    assert.match(route, /ON CONFLICT \(user_id\) WHERE trip_id IS NULL/);
  });
});
