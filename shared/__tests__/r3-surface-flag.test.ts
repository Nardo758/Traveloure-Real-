/**
 * The R3 switch, server half (ledger `2026-11-27-s5-r3-surface-flag`).
 *
 * The rule is one value: `R3_SURFACE=1`. Anything else — unset, blank, "true", "yes", " 1" — is off.
 * The client half (`client/src/lib/r3-surface.ts:16-20`, pinned in
 * `client/src/lib/__tests__/r3-surface.test.ts:10-26`) already proves that `?surface=r3` with the
 * flag off changes nothing, and that the parameter is required even when the flag is on. These cases
 * are the server's half: the switch cannot be talked on by a near-miss environment value.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { r3SurfaceFromEnv } from "../r3-surface-flag";

const env = (value: string | undefined) => ({ R3_SURFACE: value }) as NodeJS.ProcessEnv;

test("R3_SURFACE=1 is the only value that switches the surface on", () => {
  assert.equal(r3SurfaceFromEnv(env("1")), true);
});

test("an unset variable means off", () => {
  assert.equal(r3SurfaceFromEnv(env(undefined)), false);
  assert.equal(r3SurfaceFromEnv({} as NodeJS.ProcessEnv), false, "a production boot carries no R3_SURFACE");
});

test("any other value means off - a near-miss never turns a surface on", () => {
  for (const value of ["", "0", "true", "TRUE", "yes", "on", "2", "01", " 1", "1 ", "r3"]) {
    assert.equal(r3SurfaceFromEnv(env(value)), false, `${JSON.stringify(value)} is off`);
  }
});

test("the switch reads the environment it is given, never a module global", () => {
  assert.equal(r3SurfaceFromEnv({ R3_SURFACE: "1" } as NodeJS.ProcessEnv), true);
  assert.equal(r3SurfaceFromEnv({ R3_SURFACE: "0" } as NodeJS.ProcessEnv), false);
});
