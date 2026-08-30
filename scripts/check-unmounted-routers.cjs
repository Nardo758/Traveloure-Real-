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
  // All three formerly-dark routers are now MOUNTED (experts/cross-sell mounted for their
  // consumer-backed families with zero path collisions; trips mounted LAST so its 32 unique
  // consumer-backed endpoints are live while its 57 duplicate paths defer to the canonical
  // inline copies). No routers are intentionally dark at present.
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

// ────────────────────────────────────────────────────────────────────────────
// Second check: server/routes/*.ts files that are NEVER IMPORTED anywhere.
// The imported-but-unmounted check above can't see these — a route file with no
// import statement referencing it is even darker (guest-invites.ts sat this way
// for months: ~9 endpoints + a routed schema, zero imports, all 200-HTML).
// ────────────────────────────────────────────────────────────────────────────

// Route files that are deliberately never imported, each WITH a reason.
const ALLOWED_UNIMPORTED = {
  // (none at present — guest-invites.ts, the file that exposed this class, is now
  //  imported + mounted. Add entries here ONLY with a documented reason.)
};

const SERVER_DIR = path.join(__dirname, "..", "server");
const ROUTES_DIR = path.join(SERVER_DIR, "routes");

/** Recursively collect .ts files under a directory (skips node_modules just in case). */
function collectTsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const routeFiles = fs
  .readdirSync(ROUTES_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => f.replace(/\.ts$/, ""));

// Comment-stripped concatenation of every server .ts file EXCEPT the routes dir itself
// (a routes file importing a sibling doesn't make either of them live — liveness comes
// from being imported by routes.ts / index.ts / services / other server code).
const serverSources = collectTsFiles(SERVER_DIR)
  .filter((f) => !f.startsWith(ROUTES_DIR + path.sep))
  .map((f) =>
    fs
      .readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/^\s*\/\/.*$/, "").replace(/([^:])\/\/.*$/, "$1"))
      .join("\n"),
  )
  .join("\n");

const neverImported = routeFiles.filter((base) => {
  if (base in ALLOWED_UNIMPORTED) return false;
  // Match any import/require specifier ending in routes/<base> (with or without .ts/.js).
  const specRe = new RegExp(
    "from\\s+[\"'][^\"']*routes/" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\.[tj]s)?[\"']",
  );
  return !specRe.test(serverSources);
});

const staleUnimportedAllow = Object.keys(ALLOWED_UNIMPORTED).filter((base) => {
  const specRe = new RegExp(
    "from\\s+[\"'][^\"']*routes/" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\.[tj]s)?[\"']",
  );
  return specRe.test(serverSources);
});

if (staleUnimportedAllow.length > 0) {
  fail(
    "these route files are in ALLOWED_UNIMPORTED but ARE imported — remove them from the list:\n" +
      staleUnimportedAllow.map((b) => `  • ${b}.ts`).join("\n"),
  );
}

if (neverImported.length > 0) {
  fail(
    "these server/routes/*.ts files are NEVER IMPORTED by any server code outside server/routes/ — every endpoint in them is DEAD (200-HTML):\n" +
      neverImported.map((b) => `  • server/routes/${b}.ts`).join("\n") +
      "\n\nFix: import + mount the router in server/routes.ts (or, if genuinely deferred, add it to ALLOWED_UNIMPORTED in this script WITH a reason). See CLAUDE.md §9.",
  );
}

const allowN = Object.keys(ALLOWED_UNMOUNTED).length;
console.log(
  `✅ Unmounted-router guard: ${imported.length} imported route module(s), ${mounted.size} mounted, ` +
    `${allowN} allow-listed dark; ${routeFiles.length} route file(s) on disk, none never-imported.`,
);
