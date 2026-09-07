/**
 * THE CLIENT PEN IS KEYED BY PRINCIPAL — lane **L18**, ledger `2026-09-07-client-pen-scope`.
 * (Console & AI Concierge brief §11.2 finding **F4**, §11.3 lane L18.)
 *
 * WHY THIS EXISTS. The pre-mint planning context — destination, dates, party, pending events,
 * stops, `tripId` — lived in `sessionStorage` under ONE key, never namespaced by user and never
 * cleared when the account changed, while the SERVER pen (`PUT /api/trip-context`) has always been
 * per user. So the pen followed the BROWSER TAB and not the account, and the Chrome walkthrough of
 * 2026-09-07 (rows 1, 4, 8, 14) watched a guest's "New York City Date Night" survive into two
 * different signed-in accounts, one of which held nineteen real plans — carrying with it the "Your
 * Trip" banner, the cart's trip and the `/services` location filter.
 *
 * A failure here is INVISIBLE on screen: every surface renders a perfectly ordinary plan. It is
 * only wrong about WHOSE. So it is pinned against the module rather than read off a page.
 *
 * WHAT THESE HOLD:
 *   P1  two principals in one storage never read each other's pen, in either direction, and the
 *       guest key is the legacy key (an in-flight guest session is not lost by this lane).
 *   P2  SIGN-OUT clears every client pen in the tab — guest key included — and says so with
 *       `TRIP_CONTEXT_CLEARED_EVENT`; it does NOT clear the SERVER pen (signing out is not
 *       clearing your plan), and it disarms a push already carrying the outgoing principal's blob.
 *   P3  SIGN-IN hands the guest's ANSWERS to the server pen exactly once and only when the server
 *       pen is EMPTY; a non-empty server pen wins and the guest blob is dropped; a server read
 *       that FAILS hands nothing over (§13 — "no answer" is not "no plan"); a plan IDENTITY
 *       (`tripId`) is never handed over; and a principal → principal switch hands nothing at all.
 *   P4  the "Browse services for this trip" door builds its `location` from the PLAN, and passes
 *       NO `location` at all when the plan has no usable destination (§13).
 *
 * No DOM, no DB, no React render: sessionStorage / window / fetch are in-memory shims installed
 * before the module under test is imported — the posture of `clear-plan.test.ts` beside it.
 *
 * Run: npx tsx --test client/src/lib/__tests__/client-pen-scope.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

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

interface Call {
  url: string;
  method?: string;
  body?: string;
}
const calls: Call[] = [];
/** What the next `GET /api/trip-context` answers. Set per test. */
let serverPen: { ok: boolean; context: unknown } = { ok: true, context: {} };
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  calls.push({ url, method: init?.method, body: init?.body });
  if (!init?.method || init.method === "GET") {
    return {
      ok: serverPen.ok,
      json: async () => ({ context: serverPen.context }),
    } as unknown as Response;
  }
  return { ok: true, json: async () => ({}) } as unknown as Response;
};

import {
  GUEST_PEN_KEY,
  TRIP_CONTEXT_CLEARED_EVENT,
  USER_PEN_PREFIX,
  bindPenPrincipal,
  getPenPrincipal,
  getTripContext,
  penKeyFor,
  updateTripContext,
} from "../trip-context";
import { slipBrowseServicesHref } from "../slip-rail";

/** The armed debounce `updateTripContext` schedules, in ms — the module's own constant. */
const PUSH_DEBOUNCE_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Put the module back at its import-time default (the guest pen) without reaching into it. */
async function resetPrincipal(): Promise<void> {
  await bindPenPrincipal(null);
  store.clear();
  events.length = 0;
  calls.length = 0;
}

beforeEach(async () => {
  serverPen = { ok: true, context: {} };
  await resetPrincipal();
});

// ── P1 ────────────────────────────────────────────────────────────────────────────────────────

describe("P1 — two principals in one storage never read each other's pen", () => {
  it("the guest pen is the LEGACY key, and a user's pen is its own", async () => {
    assert.equal(penKeyFor(null), GUEST_PEN_KEY);
    assert.equal(penKeyFor("u-1"), `${USER_PEN_PREFIX}u-1`);
    assert.equal(getPenPrincipal(), null);

    updateTripContext({ destination: "New York City" });
    assert.equal(store.has(GUEST_PEN_KEY), true);
  });

  it("user A's answers are invisible to user B, and to a later guest", async () => {
    await bindPenPrincipal("user-a");
    updateTripContext({ destination: "Kyoto, Japan" });
    assert.equal(getTripContext().destination, "Kyoto, Japan");

    // A DIFFERENT account in the same tab.
    await bindPenPrincipal("user-b");
    assert.deepEqual(getTripContext(), {});
    updateTripContext({ destination: "Lisbon, Portugal" });
    assert.equal(getTripContext().destination, "Lisbon, Portugal");

    // Back to A: its own answers, untouched by B.
    await bindPenPrincipal("user-a");
    assert.equal(getTripContext().destination, "Kyoto, Japan");

    // And the two live under different keys, never one.
    assert.equal(
      JSON.parse(store.get(penKeyFor("user-b"))!).destination,
      "Lisbon, Portugal",
    );
  });

  it("binding the principal already bound is a no-op (idempotent per render)", async () => {
    await bindPenPrincipal("user-a");
    updateTripContext({ destination: "Kyoto, Japan" });
    const before = calls.length;
    await bindPenPrincipal("user-a");
    assert.equal(getTripContext().destination, "Kyoto, Japan");
    assert.equal(calls.length, before, "a repeat bind must not re-read or re-write anything");
  });
});

// ── P2 ────────────────────────────────────────────────────────────────────────────────────────

describe("P2 — sign-out clears the CLIENT pen, and only the client pen", () => {
  it("drops every pen key in the tab, guest key included, and announces the clear", async () => {
    store.set(GUEST_PEN_KEY, JSON.stringify({ destination: "New York City" }));
    await bindPenPrincipal("user-a");
    updateTripContext({ destination: "Kyoto, Japan" });
    store.set(penKeyFor("user-b"), JSON.stringify({ destination: "Lisbon, Portugal" }));
    // An unrelated key must survive: this is a pen clear, not a storage wipe.
    store.set("traveloure_guest_session", "abc");
    events.length = 0;

    await bindPenPrincipal(null);

    assert.equal(store.has(penKeyFor("user-a")), false);
    assert.equal(store.has(penKeyFor("user-b")), false);
    assert.equal(store.has(GUEST_PEN_KEY), false);
    assert.equal(store.get("traveloure_guest_session"), "abc");
    assert.deepEqual(getTripContext(), {});
    assert.ok(
      events.includes(TRIP_CONTEXT_CLEARED_EVENT),
      "a surface holding its own copy of the basics must be able to tell this from an un-hydrated read",
    );
  });

  it("never clears the SERVER pen — signing out is not clearing your plan", async () => {
    await bindPenPrincipal("user-a");
    updateTripContext({ destination: "Kyoto, Japan" });
    calls.length = 0;

    await bindPenPrincipal(null);

    const writes = calls.filter((c) => c.method === "PUT");
    assert.deepEqual(writes, [], `sign-out must issue no PUT; saw ${JSON.stringify(writes)}`);
  });

  it("disarms a push already carrying the outgoing principal's blob", async () => {
    await bindPenPrincipal("user-a");
    updateTripContext({ destination: "Kyoto, Japan" }); // arms the 1.5s debounce
    await bindPenPrincipal(null);
    calls.length = 0;
    await sleep(PUSH_DEBOUNCE_MS + 250);
    assert.deepEqual(
      calls.filter((c) => c.method === "PUT"),
      [],
      "the outgoing principal's blob must never land after the pen changed hands",
    );
  });
});

// ── P3 ────────────────────────────────────────────────────────────────────────────────────────

describe("P3 — the guest handoff", () => {
  it("hands the guest's ANSWERS to an EMPTY server pen, once, and drops the guest key", async () => {
    store.set(
      GUEST_PEN_KEY,
      JSON.stringify({ destination: "New York City", startDate: "2026-10-02" }),
    );
    serverPen = { ok: true, context: {} };

    await bindPenPrincipal("user-a");

    const put = calls.find((c) => c.method === "PUT");
    assert.ok(put, "an empty server pen accepts the guest's answers");
    assert.deepEqual(JSON.parse(put!.body!).context, {
      destination: "New York City",
      startDate: "2026-10-02",
    });
    // The account now reads them under ITS OWN key, and the guest key is gone.
    assert.equal(getTripContext().destination, "New York City");
    assert.equal(store.has(GUEST_PEN_KEY), false);
  });

  it("a NON-EMPTY server pen wins and the guest blob is dropped (the nineteen-plan account)", async () => {
    store.set(GUEST_PEN_KEY, JSON.stringify({ destination: "New York City" }));
    serverPen = { ok: true, context: { destination: "Kyoto, Japan" } };

    await bindPenPrincipal("user-a");

    assert.deepEqual(
      calls.filter((c) => c.method === "PUT"),
      [],
      "the account's own planning is never overwritten by a guest session's",
    );
    assert.equal(store.has(GUEST_PEN_KEY), false);
    assert.notEqual(getTripContext().destination, "New York City");
  });

  it("a server read that FAILS hands nothing over — no answer is not no plan (§13)", async () => {
    store.set(GUEST_PEN_KEY, JSON.stringify({ destination: "New York City" }));
    serverPen = { ok: false, context: null };

    await bindPenPrincipal("user-a");

    assert.deepEqual(calls.filter((c) => c.method === "PUT"), []);
    assert.equal(store.has(GUEST_PEN_KEY), false, "the guest key is dropped either way");
    assert.deepEqual(getTripContext(), {});
  });

  it("a PLAN IDENTITY is never handed over — a guest owns no trips row", async () => {
    store.set(
      GUEST_PEN_KEY,
      JSON.stringify({
        destination: "New York City",
        tripId: "trip-999",
        userExperienceId: "ux-999",
        id: "ux-999",
      }),
    );
    serverPen = { ok: true, context: {} };

    await bindPenPrincipal("user-a");

    const put = calls.find((c) => c.method === "PUT");
    const handed = JSON.parse(put!.body!).context;
    assert.equal(handed.destination, "New York City");
    assert.equal("tripId" in handed, false);
    assert.equal("userExperienceId" in handed, false);
    assert.equal("id" in handed, false);
    assert.equal(getTripContext().tripId, undefined);
  });

  it("an EMPTY guest pen hands nothing over and reads nothing back", async () => {
    serverPen = { ok: true, context: {} };
    await bindPenPrincipal("user-a");
    assert.deepEqual(calls.filter((c) => c.method === "PUT"), []);
  });

  it("a principal → principal switch hands NOTHING over", async () => {
    await bindPenPrincipal("user-a");
    updateTripContext({ destination: "Kyoto, Japan" });
    calls.length = 0;
    serverPen = { ok: true, context: {} };

    await bindPenPrincipal("user-b");

    assert.deepEqual(
      calls.filter((c) => c.method === "PUT"),
      [],
      "user A's answers are not user B's, and there is no honest way to attribute them",
    );
    assert.deepEqual(getTripContext(), {});
  });
});

// ── P4 ────────────────────────────────────────────────────────────────────────────────────────

describe("P4 — the browse door reads the PLAN, never the pen", () => {
  it("carries the plan's own destination beside its id", () => {
    assert.equal(
      slipBrowseServicesHref("trip-1", "Kyoto, Japan"),
      "/services?tripId=trip-1&location=Kyoto%2C%20Japan",
    );
  });

  it("passes NO location when the plan has no usable destination (§13)", () => {
    for (const empty of [undefined, null, "", "   "]) {
      assert.equal(
        slipBrowseServicesHref("trip-1", empty as string | null | undefined),
        "/services?tripId=trip-1",
        `a plan with ${JSON.stringify(empty)} for a destination passes nothing, never a placeholder`,
      );
    }
  });

  it("the href is built from the plan alone — a pen in the same tab cannot reach it", async () => {
    await bindPenPrincipal("user-a");
    updateTripContext({ destination: "Lisbon, Portugal" });
    assert.equal(
      slipBrowseServicesHref("trip-1", "Kyoto, Japan"),
      "/services?tripId=trip-1&location=Kyoto%2C%20Japan",
    );
  });
});
