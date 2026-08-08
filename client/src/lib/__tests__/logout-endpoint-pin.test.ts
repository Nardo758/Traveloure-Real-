/**
 * EX-1 regression pin (docs/testing/EXPERT_UX_WALKTHROUGH.md).
 *
 * Original bug: every console's Logout navigated to GET /api/logout — a route that only existed
 * when REPL_ID was set, so off-Replit the click 404'd with a raw JSON dump and THE SESSION
 * SURVIVED. Three call sites carried it independently.
 *
 * As of the Clerk migration (August 2026), authentication is Clerk-managed. Logout is handled by
 * Clerk's signOut() (which invalidates the Clerk session server-side and clears cookies). The
 * /api/auth/logout endpoint remains as a no-op stub so that any in-flight callers don't error,
 * but the primary logout mechanism is Clerk's signOut().
 *
 * The pin, two halves (updated for Clerk):
 *   1. NO client file may reference the string literal "/api/logout" — the old Replit-only GET
 *      route that never properly terminated sessions.
 *   2. use-auth.ts — the ONE shared logout implementation — must use Clerk's signOut OR POST
 *      to /api/auth/logout. Either satisfies the contract that the session is properly terminated.
 *
 * Pure filesystem scan: no DB, no browser, CI-safe.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "__tests__") continue; // test fixtures (incl. this file) may quote the literal
      yield* walk(p);
    } else if (/\.(ts|tsx)$/.test(entry)) yield p;
  }
}

test("EX-1 pin: no client code references the Replit-only GET /api/logout route", () => {
  const offenders: string[] = [];
  for (const file of walk(CLIENT_SRC)) {
    const src = readFileSync(file, "utf8");
    if (src.includes('"/api/logout"') || src.includes("'/api/logout'") || src.includes("`/api/logout`")) {
      offenders.push(relative(CLIENT_SRC, file));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `These files reference /api/logout, which does not exist off-Replit (session survives the ` +
      `click): ${offenders.join(", ")}. Use the useAuth().logout which calls Clerk signOut().`,
  );
});

test("EX-1 pin: the shared logout implementation uses Clerk signOut or POSTs to /api/auth/logout", () => {
  const src = readFileSync(join(CLIENT_SRC, "hooks", "use-auth.ts"), "utf8");
  // After the Clerk migration (Aug 2026), logout is handled by Clerk's signOut().
  // Either signOut (Clerk) or /api/auth/logout (server-side session termination) satisfies EX-1.
  const usesClerkSignOut = /signOut\b/.test(src);
  const usesLegacyEndpoint = /\/api\/auth\/logout/.test(src) && /method:\s*["']POST["']/.test(src);
  assert.ok(
    usesClerkSignOut || usesLegacyEndpoint,
    "use-auth.ts must use Clerk signOut() or POST to /api/auth/logout to properly terminate sessions",
  );
});
