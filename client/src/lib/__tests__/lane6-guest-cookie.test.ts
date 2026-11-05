/**
 * Lane 6 — the guest cookie, client half (ledger `2026-11-05-lane6-guest-cookie`; brief A-10).
 *
 *   K1  Requests say "cookies off" only when the browser's cookies are off; otherwise nothing extra is sent.
 *   K2  The claim is sent even when localStorage throws or holds no id — the cookie names the guest.
 *
 * Run: npx tsx --test client/src/lib/__tests__/lane6-guest-cookie.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { guestCookieHeaders } from "../queryClient";

describe("Lane 6 guest cookie (client)", () => {
  it("K1 says cookies off only when they are off", () => {
    assert.deepEqual(guestCookieHeaders(false), { "X-Guest-Cookies": "off" });
    assert.deepEqual(guestCookieHeaders(true), {});
    assert.deepEqual(guestCookieHeaders(undefined), {});
  });

  it("K2 the claim does not need a localStorage id", async () => {
    const src = readFileSync(resolve(process.cwd(), "client/src/lib/waitlist-guest-plan.ts"), "utf8");
    const body = src.slice(src.indexOf("async function claimGuestPlansOnce"), src.indexOf("const CLAIMED_PLAN_STORAGE_KEY"));
    assert.doesNotMatch(body, /if \(!guestSessionId\) return \[\];/);
    assert.match(body, /apiRequest\("POST", "\/api\/guest-plans\/claim", guestSessionId \? \{ guestSessionId \} : \{\}\)/);
  });
});
