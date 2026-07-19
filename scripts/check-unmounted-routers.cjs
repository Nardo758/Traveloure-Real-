#!/usr/bin/env node
/**
 * Unmounted-router guard (CLAUDE.md §9 — the durable fix for the recurring dark-router class).
 *
 * A `server/routes/*.ts` router that is imported into `server/routes.ts` but never `app.use()`d is
 * DEAD: every path it declares falls through to the Vite catch-all (200-HTML, NOT 404), so any client
 * that calls it silently fails. This class has eaten real features repeatedly — the expert workspace
 * (trips.routes.ts), provider booking accept/decline + blackout dates (experts.routes.ts), cross-sell
 * stats (cross-sell.routes.ts), the dashboard Wishlist (saved-items.routes.ts).
 *
 * This guard fails CI when a default-imported route module in routes.ts is never mounted, UNLESS it is
 * in the explicit allow-list below (known-intentionally-dark, pending its own triage — documented in
 * CLAUDE.md §9). New offenders must be mounted (or, if genuinely deferred, added here WITH a reason) —
 * so the next dead router can't land silently. Node built-ins only; no npm ci needed.
 */
const fs = require("fs");
const path = require("path");

const ROUTES_FILE = path.join(__dirname, "..", "server", "routes.ts");

// Known-intentionally-dark routers: imported but deliberately not mounted, pending their own triage.
// Each entry MUST carry a reason. Removing a router from this list without mounting it fails the guard.
const ALLOWED_UNMOUNTED = {
  expertsRoutes: "Dark experts.routes.ts — remaining families (workspace/vendors, knowledge-nuggets, visa, role) pending triage (§9).",
  crossSellRoutes: "Dark cross-sell.routes.ts — cross-sell stats family pending triage (§9).",
  tripsRoutes: "Dark trips.routes.ts — remaining logistics/anchor families pending triage; workspace handlers already ported out (§9).",
};

function fail(msg) {
  console.error("❌ Unmounted-router guard: " + msg);
  process.exit(1);
}

const raw = fs.readFileSync(ROUTES_FILE, "utf8");

// Strip comments so a commented-out `app.use(x)` (or import) does NOT count as mounted.
// Line comments only, avoiding `://` (so `http://` survives); block comments removed wholesale.
const src = raw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((line) => line.replace(/^\s*\/\/.*$/, "").replace(/([^:])\/\/.*$/, "$1"))
  .join("\n");

// 1. Default imports of route modules: `import Foo from "./routes/bar"` (optionally with named: `import Foo, { x } from ...`).
const importRe = /import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s+from\s+["']\.\/routes\/[^"']+["']/g;
const imported = [];
let m;
while ((m = importRe.exec(src)) !== null) imported.push(m[1]);

if (imported.length === 0) fail("found no `import X from \"./routes/…\"` default imports — parser or file path is wrong.");

// 2. Identifiers referenced in an app.use(...) call (with or without a path prefix).
const mounted = new Set();
const useRe = /app\.use\(([^)]*)\)/g;
while ((m = useRe.exec(src)) !== null) {
  for (const id of imported) {
    if (new RegExp("\\b" + id + "\\b").test(m[1])) mounted.add(id);
  }
}

// 3. Any imported router that is neither mounted nor explicitly allow-listed is a failure.
const offenders = imported.filter((id) => !mounted.has(id) && !(id in ALLOWED_UNMOUNTED));

// 4. Hygiene: an allow-listed router that is ACTUALLY mounted should be removed from the allow-list.
const staleAllow = Object.keys(ALLOWED_UNMOUNTED).filter((id) => mounted.has(id));

if (staleAllow.length > 0) {
  fail(
    "these routers are in the allow-list but ARE mounted — remove them from ALLOWED_UNMOUNTED:\n" +
      staleAllow.map((id) => `  • ${id}`).join("\n"),
  );
}

if (offenders.length > 0) {
  fail(
    "these route modules are imported into server/routes.ts but never app.use()d — they are DEAD (200-HTML):\n" +
      offenders.map((id) => `  • ${id}`).join("\n") +
      "\n\nFix: mount it with app.use(...) (or, if genuinely deferred, add it to ALLOWED_UNMOUNTED in this script WITH a reason). See CLAUDE.md §9.",
  );
}

const allowN = Object.keys(ALLOWED_UNMOUNTED).length;
console.log(
  `✅ Unmounted-router guard: ${imported.length} imported route module(s), ${mounted.size} mounted, ` +
    `${allowN} allow-listed dark. No new unmounted routers.`,
);
