/**
 * QA round 4 PR A (Leon, Nov 13, 2026) — the client half of R4-1 and R4-2.
 *
 *   R1 a read that left before the create lands after it: the create's plan stays cached, never the read's `null`
 *   R2 an update cancels an in-flight read the same way (the old plan never overwrites the new one)
 *   R3 R4-2: once a signed-in claim starts, guest reads send nothing and answer null — the leftover
 *      `GET /api/guest-plans/current` that drew 409 `signed_in` is never sent; the claim empties the cached read in place
 *   R4 sign-out reopens guest reads
 *   R5 /plans/new's title read holds while a pending record is about to create the plan (it raced the create)
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/r4-guest-reads.test.ts
 */
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as guest from "../waitlist-guest-plan";
import { queryClient } from "../queryClient";

const KEY = guest.GUEST_PLAN_QUERY_KEY;
const PLAN = { plan: { id: "plan-1", title: "Kyoto trip" }, items: [] } as any;
const NEWER = { plan: { id: "plan-1", title: "Kyoto, Dec 1–4" }, items: [] } as any;

const session = new Map<string, string>();
let cookie = "";
let calls: Array<{ url: string; method: string }> = [];
let route: (url: string, method: string) => Promise<Response> = async () => json(null);
const realFetch = globalThis.fetch;
const hadDocument = "document" in globalThis;
const realDocument = (globalThis as any).document;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const reads = () => calls.filter((c) => c.method === "GET" && c.url.endsWith("/api/guest-plans/current")).length;
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const p = new Promise<T>((r) => (resolve = r));
  return { p, resolve };
};

beforeEach(() => {
  session.clear();
  cookie = "";
  calls = [];
  queryClient.clear();
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => session.get(k) ?? null,
    setItem: (k: string, v: string) => void session.set(k, v),
    removeItem: (k: string) => void session.delete(k),
  };
  (globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  (globalThis as any).document = {
    ...(realDocument ?? {}),
    get cookie() {
      return cookie;
    },
  };
  (globalThis as any).fetch = async (url: any, init: any = {}) => {
    const method = String(init.method ?? "GET").toUpperCase();
    calls.push({ url: String(url), method });
    return route(String(url), method);
  };
  guest._resetGuestClaimMemo();
  guest.setClaimFailureAnnouncerForTests(() => {});
});

afterEach(() => {
  (globalThis as any).fetch = realFetch;
  guest.setClaimFailureAnnouncerForTests(null);
  queryClient.clear();
  if (hadDocument) (globalThis as any).document = realDocument;
  else delete (globalThis as any).document;
});

describe("QA round 4 PR A — guest reads", () => {
  it("R1 a read that left before the create cannot overwrite the created plan with null", async () => {
    const slowRead = deferred<Response>();
    route = async (url, method) => (method === "GET" ? slowRead.p : json(PLAN, 201));
    const reading = queryClient.fetchQuery({ queryKey: KEY, queryFn: guest.fetchGuestPlan }).catch(() => "cancelled");
    await guest.createGuestPlan({ destination: "Kyoto, Japan" } as any);
    slowRead.resolve(json(null)); // the read answers "no plan yet" AFTER the create landed
    await reading;
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(queryClient.getQueryData(KEY), PLAN, "the created plan stays cached");
  });

  it("R2 an update cancels an in-flight read; the updated plan stays cached", async () => {
    queryClient.setQueryData(KEY, PLAN);
    const slowRead = deferred<Response>();
    route = async (url, method) => (method === "GET" ? slowRead.p : json(NEWER));
    const reading = queryClient.fetchQuery({ queryKey: KEY, queryFn: guest.fetchGuestPlan, staleTime: 0 }).catch(() => "cancelled");
    await guest.updateGuestPlan({ startDate: "2026-12-01", endDate: "2026-12-04" });
    slowRead.resolve(json(PLAN));
    await reading;
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(queryClient.getQueryData(KEY), NEWER);
  });

  it("R3 R4-2: after a signed-in claim starts, no guest read is sent; the claim empties the read in place", async () => {
    cookie = "traveloure_guest_present=1";
    queryClient.setQueryData(KEY, PLAN);
    route = async (url) => (url.endsWith("/claim") ? json({ tripIds: ["plan-1"] }) : json(null, 409));
    const claimed = guest.claimGuestPlans("user-1");
    // A reader re-fetching while the claim is in flight, and after it (the auth re-read re-renders every reader).
    assert.equal(await guest.fetchGuestPlan(), null);
    assert.deepEqual(await claimed, ["plan-1"]);
    assert.equal(await queryClient.fetchQuery({ queryKey: KEY, queryFn: guest.fetchGuestPlan, staleTime: 0 }), null);
    assert.equal(reads(), 0, "no GET /api/guest-plans/current after the claim started — no 409");
    assert.equal(calls.filter((c) => c.url.endsWith("/claim")).length, 1);
    assert.ok(queryClient.getQueryState(KEY), "the cached read is emptied in place, never removed");
    assert.equal(queryClient.getQueryData(KEY), null);
    // The claim no longer removes the query (removing it made every mounted reader rebuild and fetch).
    assert.doesNotMatch(fs.readFileSync("client/src/lib/waitlist-guest-plan.ts", "utf8"), /removeQueries\(\{ queryKey: GUEST_PLAN_QUERY_KEY \}\)/);
  });

  it("R4 sign-out reopens guest reads", async () => {
    route = async (url) => (url.endsWith("/claim") ? json({ tripIds: [] }) : json(PLAN));
    await guest.claimGuestPlans("user-1");
    assert.equal(await guest.fetchGuestPlan(), null);
    assert.equal(reads(), 0);
    guest.clearGuestClaimMemo(); // logout() and a 401 after a session
    assert.deepEqual(await guest.fetchGuestPlan(), PLAN);
    assert.equal(reads(), 1);
  });

  it("R5 /plans/new's title read holds while a pending record is about to create the plan", () => {
    const page = fs.readFileSync("client/src/pages/guest-plan-map.tsx", "utf8");
    assert.match(page, /const \[holdForCreate\] = useState\(\(\) => hasPendingPlanRecord\(\)\);/);
    assert.match(page, /useGuestPlan\(\{ authLoading: isLoading, signedIn: !!user \}, mode === "waitlist" && !holdForCreate\)/);
  });
});
