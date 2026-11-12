/**
 * PLAN-2 Lane C4 (ledger `2026-11-06-plan2-c4-cleanup`).
 *   K1  the sign-in claim is sent only when this browser has a guest (presence cookie, or cookies off + the page's id)
 *   K2  the server sets the presence cookie beside the httpOnly guest cookie: readable, site-wide, no id
 *   K3  a guest's planning pen writes nothing to /api/trip-context (sign-in only); a signed-in pen still pushes
 *   K4  ONE guest-session module (guestSession.ts merged into guest-session.ts)
 *   K5  CI: a required job may not skip on a needed job's result; the four that did now fail in a first step
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/plan2-c4-cleanup.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GUEST_PRESENT_COOKIE, hasGuestPresenceCookie, shouldClaimGuestPlans } from "@shared/guest-presence";

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
const calls: Array<{ url: string; method?: string }> = [];
(globalThis as any).fetch = async (url: string, init?: { method?: string }) => {
  calls.push({ url, method: init?.method });
  return { ok: true, json: async () => ({ context: {} }) } as unknown as Response;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const read = (p: string) => fs.readFileSync(p, "utf8");

describe("PLAN-2 C4 cleanup", () => {
  it("K1 the claim waits for a guest", () => {
    assert.equal(GUEST_PRESENT_COOKIE, "traveloure_guest_present");
    assert.equal(hasGuestPresenceCookie("a=1; traveloure_guest_present=1; b=2"), true);
    assert.equal(hasGuestPresenceCookie("traveloure_guest_present_x=1"), false);
    assert.equal(hasGuestPresenceCookie(""), false);
    assert.equal(shouldClaimGuestPlans({ cookieString: "connect.sid=x", cookiesEnabled: true, localGuestId: "id" }), false, "an id in storage alone, cookies on: no guest the server would read");
    assert.equal(shouldClaimGuestPlans({ cookieString: "traveloure_guest_present=1", cookiesEnabled: true, localGuestId: null }), true);
    assert.equal(shouldClaimGuestPlans({ cookieString: "", cookiesEnabled: false, localGuestId: "id" }), true, "cookies off: the page's id names the guest");
    assert.equal(shouldClaimGuestPlans({ cookieString: "", cookiesEnabled: false, localGuestId: null }), false);
    const src = read("client/src/lib/waitlist-guest-plan.ts");
    // QA round 3 PR 3 (test edit): the claim answers one outcome shape; no guest is a successful empty claim.
    assert.match(src, /if \(!shouldClaimGuestPlans\(\{ cookieString, cookiesEnabled, localGuestId: guestSessionId \}\)\) return \{ ok: true, ids: \[\] \};\s*try \{\s*const res = await apiRequest\("POST", "\/api\/guest-plans\/claim"/);
  });

  it("K2 the server sets the presence cookie with the guest cookie", () => {
    const route = read("server/routes/guest-plans.routes.ts");
    const fn = route.slice(route.indexOf("function setGuestCookie"), route.indexOf("const rateLimited"));
    assert.match(fn, /res\.cookie\(GUEST_SESSION_COOKIE, id, \{\s*httpOnly: true,/);
    assert.match(fn, /res\.cookie\(GUEST_PRESENT_COOKIE, "1", \{ httpOnly: false, sameSite: "lax", secure, path: "\/", maxAge: guestSessionCookieMaxAgeMs\(\) \}\);/);
  });

  it("K3 a guest's pen writes nothing to the server; a signed-in pen still does", async () => {
    const tc = await import("../trip-context");
    calls.length = 0;
    tc.updateTripContext({ destination: "Kyoto, Japan" });
    await sleep(1800);
    assert.equal(await tc.releasePendingEventsPen(), false, "a guest has no server pen to release");
    assert.deepEqual(calls.filter((c) => c.url.startsWith("/api/trip-context")), [], "no request from a guest");
    await tc.bindPenPrincipal("u1");
    calls.length = 0;
    tc.updateTripContext({ destination: "Osaka, Japan" });
    await sleep(1800);
    assert.equal(calls.filter((c) => c.method === "PUT" && c.url.startsWith("/api/trip-context")).length, 1, "a signed-in pen pushes");
  });

  it("K4 one guest-session module", () => {
    assert.equal(fs.existsSync("client/src/lib/guestSession.ts"), false);
    for (const f of ["client/src/pages/cart.tsx", "client/src/components/city-feed-card.tsx", "client/src/hooks/use-impression-tracker.ts"]) {
      assert.doesNotMatch(read(f), /@\/lib\/guestSession"/, f);
    }
  });

  it("K5 a required job fails, never skips, when its setup did not succeed", () => {
    for (const f of ["app-routes-gate", "auth-routes-gate", "navbar-links-gate"]) {
      const y = read(`.github/workflows/${f}.yml`);
      assert.doesNotMatch(y, /needs\.setup\.result == 'success'/, f);
      assert.match(y, /- name: Fail when setup did not succeed\s*\n\s*if: \$\{\{ needs\.setup\.result != 'success' \}\}/, f);
    }
    const rules = read("scripts/ci/ci-skip-rules.cjs");
    assert.match(rules, /\.\.\.checkReadyForReviewEvaluated\(f, text\), \.\.\.checkRequiredDependencySkip\(f, text, required\)/);
  });
});
