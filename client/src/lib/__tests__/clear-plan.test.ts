/**
 * CLEAR PLAN — the plan goes away everywhere it is held (post-publish QA check 4).
 *
 * WHY THIS EXISTS. "Clear plan" is a control whose failure mode is INVISIBLE at the moment it is
 * pressed: the Trip Strip disappears, the modal closes, and everything looks correct — and then
 * the plan comes back, from one of the four other places that were still holding it. Production
 * QA hit exactly that: a cleared Kyoto date-night plan re-rendered with its destination, dates
 * and title, and the home-city default never fired because a stale destination looked like an
 * answer. So the clear is pinned here rather than being read off a screen that lies about it.
 *
 * What these hold:
 *   C1  the context blob's own sessionStorage key is gone.
 *   C2  every per-slug `searchSettings_<slug>` mirror is gone — that store holds the same
 *       destination/dates and reverse-syncs them back into the blob, so a clear that leaves it
 *       behind is a clear the next render undoes. Keys that are NOT that store are untouched.
 *   C3  a debounced push already armed by the write that preceded the clear NEVER fires with the
 *       pre-clear blob — it is the one writer that is already scheduled, and it would otherwise
 *       re-save the plan to the server a second later.
 *   C4  the SERVER's copy is cleared through the EXISTING `PUT /api/trip-context` rail with an
 *       empty context (there is no DELETE route and this lane adds none), and BOTH rows are
 *       cleared when a trip was bound — the trip-scoped one and the legacy per-user one, because
 *       the next hydrate reads whichever the local `tripId` (now gone) points at.
 *   C5  the clear announces itself with its own event, separately from the ordinary change event:
 *       a surface holding its own copy of the basics cannot tell a clear from an un-hydrated
 *       read, and must not have to guess.
 *
 * No DOM, no DB, no React render: sessionStorage / window / fetch are in-memory shims installed
 * before the module under test is imported, in the DB-free posture of trip-strip-lead.test.tsx.
 *
 * Run: npx tsx --test client/src/lib/__tests__/clear-plan.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── The shims. Installed before the import below, because the module reads none of them at
// import time but every function under test reads all three. ───────────────────────────────────
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
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  calls.push({ url, method: init?.method, body: init?.body });
  return { ok: false, json: async () => null } as unknown as Response;
};

import {
  SEARCH_SETTINGS_PREFIX,
  TRIP_CONTEXT_CLEARED_EVENT,
  clearTripContext,
  getTripContext,
  updateTripContext,
} from "../trip-context";

/** The armed debounce `updateTripContext` schedules, in ms — the module's own constant. */
const PUSH_DEBOUNCE_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  store.clear();
  events.length = 0;
  calls.length = 0;
});

describe("C1/C2 — every client store that can re-seed a plan is emptied", () => {
  it("drops the context blob and every searchSettings_ mirror, and nothing else", () => {
    store.set("experienceContext", JSON.stringify({ destination: "Kyoto, Japan" }));
    store.set(`${SEARCH_SETTINGS_PREFIX}date-night`, JSON.stringify({ destination: "Kyoto, Japan" }));
    store.set(`${SEARCH_SETTINGS_PREFIX}wedding`, JSON.stringify({ destination: "Kyoto, Japan" }));
    // Not this store: an unrelated key must survive a plan clear.
    store.set("traveloure_guest_session", "abc");

    clearTripContext();

    assert.equal(store.has("experienceContext"), false);
    assert.equal(store.has(`${SEARCH_SETTINGS_PREFIX}date-night`), false);
    assert.equal(store.has(`${SEARCH_SETTINGS_PREFIX}wedding`), false);
    assert.equal(store.get("traveloure_guest_session"), "abc");
    // And the module's own reader agrees: nothing is held.
    assert.deepEqual(getTripContext(), {});
  });

  it("removing many mirrors does not skip any (the re-index trap)", () => {
    for (let i = 0; i < 8; i += 1) store.set(`${SEARCH_SETTINGS_PREFIX}slug-${i}`, "{}");
    clearTripContext();
    assert.equal(
      Array.from(store.keys()).filter((k) => k.startsWith(SEARCH_SETTINGS_PREFIX)).length,
      0,
    );
  });
});

describe("C3 — an armed push never lands after the clear", () => {
  it("the pre-clear blob is not pushed to the server by the debounce", async () => {
    updateTripContext({ destination: "Kyoto, Japan", startDate: "2026-11-14" });
    clearTripContext();
    calls.length = 0; // the clear's own PUTs are C4's subject, not this one's
    await sleep(PUSH_DEBOUNCE_MS + 250);
    assert.deepEqual(
      calls.filter((c) => (c.body ?? "").includes("Kyoto")),
      [],
      "a push carrying the cleared plan fired after the clear",
    );
  });
});

describe("C4 — the server's copy is cleared through the existing PUT rail", () => {
  it("with no trip bound, the legacy per-user row is cleared with an empty context", () => {
    store.set("experienceContext", JSON.stringify({ destination: "Kyoto, Japan" }));
    clearTripContext();
    const puts = calls.filter((c) => c.method === "PUT");
    assert.equal(puts.length, 1);
    assert.equal(puts[0].url, "/api/trip-context");
    assert.deepEqual(JSON.parse(puts[0].body!), { context: {} });
  });

  it("with a trip bound, BOTH the trip-scoped row and the legacy row are cleared", () => {
    store.set(
      "experienceContext",
      JSON.stringify({ destination: "Kyoto, Japan", tripId: "trip-9" }),
    );
    clearTripContext();
    const urls = calls.filter((c) => c.method === "PUT").map((c) => c.url);
    assert.deepEqual(urls.sort(), ["/api/trip-context", "/api/trip-context?tripId=trip-9"]);
    for (const c of calls.filter((c) => c.method === "PUT")) {
      assert.deepEqual(JSON.parse(c.body!), { context: {} });
    }
  });

  it("no new route is invented — every clear call is a PUT to /api/trip-context", () => {
    store.set("experienceContext", JSON.stringify({ tripId: "t1" }));
    clearTripContext();
    for (const c of calls) {
      assert.equal(c.method, "PUT");
      assert.ok(c.url.startsWith("/api/trip-context"), `unexpected clear call to ${c.url}`);
    }
  });
});

describe("C5 — a clear says so, separately from an ordinary change", () => {
  it("fires both the change event and its own cleared event", () => {
    clearTripContext();
    assert.ok(events.includes("trip-context-change"));
    assert.ok(events.includes(TRIP_CONTEXT_CLEARED_EVENT));
  });

  it("an ordinary merge fires ONLY the change event — it is not a clear", () => {
    updateTripContext({ destination: "Kyoto, Japan" });
    assert.ok(events.includes("trip-context-change"));
    assert.equal(events.includes(TRIP_CONTEXT_CLEARED_EVENT), false);
  });
});
