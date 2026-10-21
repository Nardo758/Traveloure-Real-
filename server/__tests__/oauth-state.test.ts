/**
 * OAuth `state` helpers (board task #1545, ledger `2026-09-23-phase1-security`). Pure — no server,
 * no database.
 *
 *   O1  A matching, in-date state passes; a mismatched, missing, empty or never-issued one fails.
 *   O2  An expired state fails, and so does one "issued" in the future (a clock that ran backwards).
 *   O3  The return path accepts only a plain absolute path — never a host, a scheme, `//` or `\`.
 *   O4  The guest map is a safe return; an open redirect falls through to /dashboard.
 *   O5  The Replit callback honours that path only through safeReturnPath.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  OAUTH_STATE_TTL_MS,
  isValidOAuthState,
  newOAuthState,
  safeReturnPath,
} from "../utils/oauth-state";

test("O1: only the state this session was issued passes", () => {
  const state = newOAuthState();
  const issued = { state, returnTo: "/expert/content-studio", issuedAt: 1_000 };
  assert.equal(isValidOAuthState(issued, state, 2_000), true);
  assert.equal(isValidOAuthState(issued, newOAuthState(), 2_000), false, "a different state");
  assert.equal(isValidOAuthState(issued, undefined, 2_000), false, "no state on the callback");
  assert.equal(isValidOAuthState(issued, "", 2_000), false, "an empty state");
  assert.equal(isValidOAuthState(issued, [state], 2_000), false, "a repeated query parameter");
  assert.equal(isValidOAuthState(undefined, state, 2_000), false, "nothing was issued to this session");
  assert.notEqual(newOAuthState(), newOAuthState(), "states are random");
});

test("O2: the state expires, and a future issue time is refused", () => {
  const state = newOAuthState();
  const issued = { state, returnTo: "/", issuedAt: 10_000 };
  assert.equal(isValidOAuthState(issued, state, 10_000 + OAUTH_STATE_TTL_MS), true, "at the edge of the window");
  assert.equal(isValidOAuthState(issued, state, 10_000 + OAUTH_STATE_TTL_MS + 1), false, "one millisecond late");
  assert.equal(isValidOAuthState(issued, state, 9_999), false, "issued after 'now'");
});

test("O3: the return path can never become an open redirect", () => {
  const fallback = "/expert/content-studio";
  assert.equal(safeReturnPath("/provider/distribute?tab=share", fallback), "/provider/distribute?tab=share");
  for (const bad of ["//evil.example", "https://evil.example/x", "/\\evil.example", "evil", "", "/x\u0000y", 42, null, undefined]) {
    assert.equal(safeReturnPath(bad, fallback), fallback, `refused: ${JSON.stringify(bad)}`);
  }
  assert.equal(safeReturnPath(`/${"a".repeat(600)}`, fallback), fallback, "an over-long path");
});

test("O4: the guest map is kept; an open redirect is the dashboard default", () => {
  assert.equal(safeReturnPath("/plans/new?view=map", "/dashboard"), "/plans/new?view=map");
  assert.equal(safeReturnPath("/become-expert?type=local_expert", "/dashboard"), "/become-expert?type=local_expert");
  for (const bad of [
    "//evil.example",
    "https://evil.example/phish",
    "http://evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "evil.com",
    "/plans/new?view=map\r\nLocation: https://evil.example",
    null,
    undefined,
  ]) {
    assert.equal(safeReturnPath(bad, "/dashboard"), "/dashboard", `refused: ${JSON.stringify(bad)}`);
  }
});

test("O5: the Replit callback redirects only through safeReturnPath", () => {
  const src = readFileSync(new URL("../replit_integrations/auth/replitAuth.ts", import.meta.url), "utf8");
  assert.match(src, /safeReturnPath\(takeStashedReturnTo\(req\), "\/dashboard"\)/);
  assert.doesNotMatch(src, /res\.redirect\(returnTo \?\? "\/dashboard"\)/);
});
