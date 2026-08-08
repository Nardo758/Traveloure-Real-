/**
 * EX-1 regression pin (docs/testing/EXPERT_UX_WALKTHROUGH.md).
 *
 * The bug: every console's Logout navigated to GET /api/logout — a route that only exists when
 * REPL_ID is set (setupAuth early-returns at replitAuth.ts:130 before registering it), so
 * off-Replit the click 404'd with a raw JSON dump and THE SESSION SURVIVED. Three call sites
 * carried it independently (use-auth.ts, admin-sidebar.tsx, ea-sidebar.tsx).
 *
 * The pin, two halves:
 *   1. NO client file may reference the string literal "/api/logout" — the Replit-only GET route.
 *      (The fix reworded its own comments to keep this a zero-tolerance scan.)
 *   2. use-auth.ts — the ONE shared logout implementation — must POST to /api/auth/logout, the
 *      endpoint setupEmailAuth registers in EVERY environment.
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
      `click): ${offenders.join(", ")}. Use the useAuth().logout mutation — it POSTs to ` +
      `/api/auth/logout, which is registered in every environment.`,
  );
});

test("EX-1 pin: the shared logout implementation POSTs to /api/auth/logout", () => {
  const src = readFileSync(join(CLIENT_SRC, "hooks", "use-auth.ts"), "utf8");
  assert.match(src, /\/api\/auth\/logout/, "use-auth.ts must call /api/auth/logout");
  assert.match(src, /method:\s*["']POST["']/, "logout must be a POST (GET /api/auth/logout is a 405 by design)");
});
