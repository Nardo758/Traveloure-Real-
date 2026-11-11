/**
 * QA round 3 PR 3 (Leon, Nov 11, 2026) — the sign-in claim.
 *
 *   C1 the memo is forgotten on sign-out (logout clears it before its reload) and on a 401 from /api/auth/user after a
 *      session had existed; a 401 on a page that never had a session leaves nothing behind either way
 *   C2 a cookie-only guest (no localStorage id) is claimed: the claim starts from the presence cookie, and the app
 *      watcher's claim runs in its own effect, outside the cart migration's localStorage guard
 *   C3 a failed claim (non-2xx, or a rejected request) toasts once with the existing sentence, stamps NO memo, and
 *      the next sign-in claims again
 *   C4 an ordinary sign-in with nothing to claim sends nothing, toasts nothing, and lands nowhere new
 *   C5 TB2's path at the claim layer: sign in (claims) → sign out → a new guest plan → sign in as the same account
 *      claims the new plan and lands on /plans/{id}; and the modal goes to the claimed plan before its own destination
 *   C6 one cart migration: the modal's duplicate is gone
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/qa3-claim-signin.test.ts
 */
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as claim from "../waitlist-guest-plan";
import { claimLandingPath } from "../plan-landing";
import { GUEST_PLAN_COPY } from "@shared/guest-plan-copy";

const read = (p: string) => fs.readFileSync(p, "utf8");
const MEMO = "traveloure_guest_claimed_for";
const HANDOFF = "traveloure_claimed_guest_plan";

const session = new Map<string, string>();
let local: Map<string, string> | "blocked" = new Map();
let cookie = "";
let calls: Array<{ url: string; method: string }> = [];
let answer: () => Response = () => json({ tripIds: [] });
let toasts = 0;
const realFetch = globalThis.fetch;
const hadDocument = "document" in globalThis;
const realDocument = (globalThis as any).document;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  session.clear();
  local = new Map();
  cookie = "";
  calls = [];
  toasts = 0;
  answer = () => json({ tripIds: [] });
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => session.get(k) ?? null,
    setItem: (k: string, v: string) => void session.set(k, v),
    removeItem: (k: string) => void session.delete(k),
  };
  (globalThis as any).localStorage = {
    getItem: (k: string) => {
      if (local === "blocked") throw new Error("blocked");
      return local.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (local === "blocked") throw new Error("blocked");
      local.set(k, v);
    },
    removeItem: () => {},
  };
  (globalThis as any).document = {
    ...(realDocument ?? {}),
    get cookie() {
      return cookie;
    },
  };
  (globalThis as any).fetch = async (url: any, init: any = {}) => {
    calls.push({ url: String(url), method: String(init.method ?? "GET").toUpperCase() });
    return answer();
  };
  claim._resetGuestClaimMemo();
  claim.setClaimFailureAnnouncerForTests(() => {
    toasts += 1;
  });
});

afterEach(() => {
  (globalThis as any).fetch = realFetch;
  claim.setClaimFailureAnnouncerForTests(null);
  if (hadDocument) (globalThis as any).document = realDocument;
  else delete (globalThis as any).document;
});

const claimPosts = () => calls.filter((c) => c.method === "POST" && c.url.endsWith("/api/guest-plans/claim")).length;

describe("QA round 3 PR 3 — the sign-in claim", () => {
  it("C1 the memo is forgotten on sign-out and on a 401 after a session", async () => {
    // logout(): clears before its reload.
    const auth = read("client/src/hooks/use-auth.ts");
    const logoutBody = auth.slice(auth.indexOf("async function logout"), auth.indexOf("async function updateUserCurrency"));
    assert.ok(logoutBody.indexOf("clearGuestClaimMemo();") > 0 && logoutBody.indexOf("clearGuestClaimMemo();") < logoutBody.indexOf('window.location.href = "/"'));
    claim.clearGuestClaimMemo();

    // The function itself forgets both keys.
    session.set(MEMO, "u1");
    session.set(HANDOFF, "t1");
    claim.clearGuestClaimMemo();
    assert.equal(session.get(MEMO), undefined);
    assert.equal(session.get(HANDOFF), undefined);

    // A 401 after a session: fetchUser answered a user, then a 401.
    const { fetchUser } = await import("../../hooks/use-auth");
    answer = () => json({ id: "u1", email: "a@b.c" });
    assert.equal((await fetchUser())?.id, "u1");
    session.set(MEMO, "u1");
    session.set(HANDOFF, "t1");
    answer = () => json({ message: "no" }, 401);
    assert.equal(await fetchUser(), null);
    assert.equal(session.get(MEMO), undefined, "the memo is gone after the session's 401");
    assert.equal(session.get(HANDOFF), undefined);

    // A 401 on a page that never had a session in it (no user seen, no memo) is just a signed-out read.
    assert.equal(await fetchUser(), null);
    assert.equal(session.size, 0);
  });

  it("C2 a cookie-only guest (no localStorage id) is claimed", async () => {
    local = "blocked";
    cookie = "traveloure_guest_present=1";
    answer = () => json({ tripIds: ["t-cookie"] });
    assert.deepEqual(await claim.claimGuestPlans("u1"), ["t-cookie"]);
    assert.equal(claimPosts(), 1);
    // The app watcher's claim is its own effect, not inside the cart migration's `if (guestSessionId)` guard.
    const app = read("client/src/App.tsx");
    const watcher = app.slice(app.indexOf("function GuestCartMigrator"), app.indexOf("function LocaleSync"));
    const cartEffect = watcher.slice(0, watcher.indexOf("cartWasAuthenticated.current = isNowAuth;"));
    const claimEffect = watcher.slice(watcher.indexOf("cartWasAuthenticated.current = isNowAuth;"));
    assert.match(cartEffect, /if \(guestSessionId\) \{/);
    assert.doesNotMatch(cartEffect, /claimGuestPlans\(/, "the claim is not under the cart's guard");
    assert.match(claimEffect, /void claimGuestPlans\(\(user as any\)\?\.id \?\? null\)/);
    assert.doesNotMatch(claimEffect, /guestSessionId/);
  });

  it("C3 a failed claim toasts once, stamps no memo, and the next sign-in claims", async () => {
    cookie = "traveloure_guest_present=1";
    answer = () => json({ message: "boom" }, 500);
    const [a, b] = await Promise.all([claim.claimGuestPlans("u1"), claim.claimGuestPlans("u1")]);
    assert.deepEqual([a, b], [[], []]);
    assert.equal(toasts, 1, "one toast for the one failed request");
    assert.equal(session.get(MEMO), undefined, "no memo after a failure");
    // A rejected request is a failure too.
    (globalThis as any).fetch = async () => {
      throw new TypeError("network");
    };
    assert.deepEqual(await claim.claimGuestPlans("u1"), []);
    assert.equal(toasts, 2);
    // The next sign-in asks again and succeeds.
    (globalThis as any).fetch = async (url: any, init: any = {}) => {
      calls.push({ url: String(url), method: String(init.method ?? "GET").toUpperCase() });
      return json({ tripIds: ["t2"] });
    };
    assert.deepEqual(await claim.claimGuestPlans("u1"), ["t2"]);
    assert.equal(session.get(MEMO), "u1");
    assert.equal(toasts, 2);
    // The toast is the existing sentence.
    assert.equal(claim.guestSaveErrorMessage(null), GUEST_PLAN_COPY.saveFailed);
    assert.equal(GUEST_PLAN_COPY.saveFailed, "Couldn't save that. Try again.");
  });

  it("C4 an ordinary sign-in with nothing to claim: no request, no toast, no landing", async () => {
    // No guest in this browser (no presence cookie, cookies on).
    assert.deepEqual(await claim.claimGuestPlans("u1"), []);
    assert.equal(claimPosts(), 0);
    assert.equal(toasts, 0);
    assert.equal(claimLandingPath([]), null);
    // A guest that existed but whose plans were already claimed: the server answers [] — still not a failure.
    claim._resetGuestClaimMemo();
    session.clear();
    cookie = "traveloure_guest_present=1";
    assert.deepEqual(await claim.claimGuestPlans("u2"), []);
    assert.equal(claimPosts(), 1);
    assert.equal(toasts, 0, "an empty claim is never toasted");
  });

  it("C5 TB2: sign in → sign out → a new guest plan → sign in again lands on the new plan", async () => {
    cookie = "traveloure_guest_present=1";
    answer = () => json({ tripIds: ["t-first"] });
    assert.deepEqual(await claim.claimGuestPlans("u1"), ["t-first"]);
    // Sign out: logout clears the memo; the reload resets the module.
    claim.clearGuestClaimMemo();
    claim._resetGuestClaimMemo();
    // A new guest plan, then the same account signs in again in the same tab.
    answer = () => json({ tripIds: ["t-second"] });
    const ids = await claim.claimGuestPlans("u1");
    assert.deepEqual(ids, ["t-second"], "the server is asked again, not answered from a stale memo");
    assert.equal(claimLandingPath(ids), "/plans/t-second");
    // The modal runs the claim before its full page load and goes to the claimed plan first.
    const modal = read("client/src/components/SignInModal.tsx");
    assert.match(modal, /const claimedIds = await claimGuestPlans\(/);
    assert.match(modal, /window\.location\.href = claimLandingPath\(claimedIds\) \?\? safeDest \?\? getRoleHomePath\(role\);/);
    assert.ok(modal.indexOf("const claimedIds = await claimGuestPlans(") < modal.indexOf("window.location.href = claimLandingPath(claimedIds)"));
  });

  it("C6 one cart migration: the modal's duplicate is gone", () => {
    const modal = read("client/src/components/SignInModal.tsx");
    assert.doesNotMatch(modal, /migrateGuestCart/);
    assert.doesNotMatch(modal, /\/api\/cart\/migrate/);
    const app = read("client/src/App.tsx");
    assert.equal((app.match(/fetch\("\/api\/cart\/migrate"/g) ?? []).length, 1);
  });
});
