/**
 * Unit tests for hydrateTripContextFromServer (client/src/lib/trip-context.ts).
 *
 * Covers the merge path a user hits when they start a trip search as a guest,
 * sign in, and have their context hydrated from the server — where the local
 * (in-tab) fields must win and server fields fill only the gaps.
 *
 * Three edge cases (per task spec):
 *   1. Partial local — some local fields set, server has extra ones → local
 *      fields are preserved, missing fields are filled from server.
 *   2. All local fields present — server adds nothing new → sessionStorage is
 *      left untouched (no spurious write / no-op guard).
 *   3. Empty local — no local fields set → full seed from server.
 *
 * Plus:
 *   4. Hydrated guard — a second call in the same page-load is a silent no-op.
 *   5. Race guard — if a tripId is bound locally while the fetch is in-flight,
 *      the stale legacy-row response is discarded.
 *   6. Non-OK response (401 guest) — nothing is written.
 *
 * Run with: npx tsx --test client/src/lib/__tests__/trip-context.test.ts
 *
 * Implementation note: `hydrated` is a module-level flag that prevents repeated
 * hydration within a single page load. `resetHydrationForTesting()` (a @internal
 * export) resets it between tests so each scenario can exercise the full code path.
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── Browser API stubs (must exist before the module is imported) ──────────────

const store: Record<string, string> = {};

const fakeSessionStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
};

const dispatchedEvents: string[] = [];

const fakeWindow = {
  dispatchEvent: (e: Event) => {
    dispatchedEvents.push(e.type);
    return true;
  },
  addEventListener: (_type: string, _listener: unknown) => {},
  removeEventListener: (_type: string, _listener: unknown) => {},
};

// Install globals before the module is first imported.
(globalThis as any).sessionStorage = fakeSessionStorage;
(globalThis as any).window = fakeWindow;

// fetch is replaced per-test; initialise with a safe sentinel so an accidental
// call before setup fails loudly.
(globalThis as any).fetch = async () => {
  throw new Error("fetch was called without being set up in this test");
};

// ── Module import (after stubs) ───────────────────────────────────────────────

const {
  hydrateTripContextFromServer,
  resetHydrationForTesting,
  getTripContext,
  clearTripContext,
} = await import("../trip-context");

// ── Helpers ───────────────────────────────────────────────────────────────────

function setLocalContext(ctx: Record<string, unknown>) {
  store["experienceContext"] = JSON.stringify(ctx);
}

function serverResponse(ctx: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify({ context: ctx }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset module-level hydration guard so every test exercises the full path.
  resetHydrationForTesting();
  // Clear sessionStorage between tests.
  delete store["experienceContext"];
  // Clear the dispatch log.
  dispatchedEvents.length = 0;
});

// ── 1. Partial local → local fields preserved, server fills gaps ──────────────

test("partial local: local fields are preserved and server fills missing ones", async () => {
  // The user typed in a destination locally before signing in.
  setLocalContext({ destination: "Paris", travelers: 2 });

  // The server has a richer context (dates, title) from a previous session.
  (globalThis as any).fetch = async () =>
    serverResponse({
      destination: "Lyon", // server had a different destination — local wins
      startDate: "2026-10-01",
      endDate: "2026-10-07",
      title: "October getaway",
      travelers: 4, // server had a different count — local wins
    });

  await hydrateTripContextFromServer();

  const ctx = getTripContext();

  // Local fields must not be overwritten.
  assert.equal(ctx.destination, "Paris", "local destination must be preserved");
  assert.equal(ctx.travelers, 2, "local travelers count must be preserved");

  // Server fields absent from local storage must be filled in.
  assert.equal(ctx.startDate, "2026-10-01", "startDate must be filled from server");
  assert.equal(ctx.endDate, "2026-10-07", "endDate must be filled from server");
  assert.equal(ctx.title, "October getaway", "title must be filled from server");

  // sessionStorage should have been written and an event dispatched.
  assert.ok(store["experienceContext"], "sessionStorage must be written");
  assert.ok(dispatchedEvents.includes("trip-context-change"), "change event must be dispatched");
});

// ── 2. All local fields present → no-op (no spurious write) ──────────────────

test("all local fields present: sessionStorage is not rewritten", async () => {
  // Local already has every field the server would provide.
  setLocalContext({
    destination: "Rome",
    startDate: "2026-09-01",
    endDate: "2026-09-08",
    travelers: 3,
    title: "Rome trip",
  });

  (globalThis as any).fetch = async () =>
    serverResponse({
      destination: "Rome",
      startDate: "2026-09-01",
      endDate: "2026-09-08",
      travelers: 3,
      title: "Rome trip",
    });

  const beforeWrite = store["experienceContext"];
  await hydrateTripContextFromServer();
  const afterWrite = store["experienceContext"];

  // The value in storage must be identical — no new write occurred.
  assert.equal(afterWrite, beforeWrite, "sessionStorage must not be rewritten when local is complete");
  assert.equal(dispatchedEvents.length, 0, "no change event must be dispatched on a no-op merge");
});

// ── 3. Empty local → full seed from server ────────────────────────────────────

test("empty local: context is fully seeded from server", async () => {
  // No local context at all (fresh session / cleared storage).
  // store["experienceContext"] is absent (cleared in beforeEach).

  (globalThis as any).fetch = async () =>
    serverResponse({
      destination: "Tokyo",
      startDate: "2026-11-15",
      endDate: "2026-11-22",
      travelers: 2,
      title: "Tokyo adventure",
      experienceType: "city",
    });

  await hydrateTripContextFromServer();

  const ctx = getTripContext();

  assert.equal(ctx.destination, "Tokyo");
  assert.equal(ctx.startDate, "2026-11-15");
  assert.equal(ctx.endDate, "2026-11-22");
  assert.equal(ctx.travelers, 2);
  assert.equal(ctx.title, "Tokyo adventure");
  assert.equal(ctx.experienceType, "city");

  assert.ok(store["experienceContext"], "sessionStorage must be written");
  assert.ok(dispatchedEvents.includes("trip-context-change"), "change event must be dispatched");
});

// ── 4. Hydration guard: second call is a silent no-op ────────────────────────

test("hydrated guard: a second call within the same page-load is a no-op", async () => {
  setLocalContext({ destination: "Berlin" });

  let fetchCallCount = 0;
  (globalThis as any).fetch = async () => {
    fetchCallCount++;
    return serverResponse({ destination: "Berlin", travelers: 1 });
  };

  await hydrateTripContextFromServer(); // first call — hydrates normally
  assert.equal(fetchCallCount, 1, "fetch must be called on the first hydration");

  // Second call (same page load — `hydrated` is still true).
  await hydrateTripContextFromServer();
  assert.equal(fetchCallCount, 1, "fetch must NOT be called on a subsequent hydration");
});

// ── 5. Race guard: tripId bound mid-flight discards stale legacy response ─────

test("race guard: stale legacy-row response is discarded when a tripId was bound mid-flight", async () => {
  // No tripId in local storage at request time (legacy-row path).
  setLocalContext({ destination: "Lisbon" });

  (globalThis as any).fetch = async () => {
    // Simulate a tripId being set locally WHILE the fetch is in flight —
    // i.e. another part of the app bound a real trip before the response lands.
    store["experienceContext"] = JSON.stringify({
      destination: "Lisbon",
      tripId: "trip-abc-123",
    });
    return serverResponse({
      destination: "Porto",
      startDate: "2026-12-01",
    });
  };

  await hydrateTripContextFromServer();

  const ctx = getTripContext();

  // The stale legacy-row data (Porto / startDate) must NOT have been merged.
  assert.equal(ctx.destination, "Lisbon", "destination must not be overwritten by stale response");
  assert.equal(ctx.tripId, "trip-abc-123", "tripId bound mid-flight must be preserved");
  assert.equal(ctx.startDate, undefined, "startDate from stale response must be discarded");
});

// ── 6. Non-OK response (401 guest) → nothing written ─────────────────────────

test("non-ok response: nothing is written for a 401 guest response", async () => {
  setLocalContext({ destination: "Madrid" });

  (globalThis as any).fetch = async () =>
    new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const beforeWrite = store["experienceContext"];
  await hydrateTripContextFromServer();

  assert.equal(
    store["experienceContext"],
    beforeWrite,
    "sessionStorage must not be modified on a 401 response",
  );
  assert.equal(dispatchedEvents.length, 0, "no change event must be dispatched on 401");
});
