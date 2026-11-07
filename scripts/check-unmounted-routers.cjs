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

function stripComments(raw) {
  // Line comments only, avoiding `://` (so `http://` survives); block comments removed wholesale.
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\/\/.*$/, "").replace(/([^:])\/\/.*$/, "$1"))
    .join("\n");
}

function resolveTs(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Route files this file mounts via app.use/router.use. A sibling import that is
 * not passed to .use() does not count — that is the guest-invites lesson.
 */
function directMountedRouteFiles(file) {
  const body = stripComments(fs.readFileSync(file, "utf8"));
  const imports = new Map();
  const importRe = /import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s+from\s+["'](\.[^"']+)["']/g;
  let match;
  while ((match = importRe.exec(body)) !== null) {
    const resolved = resolveTs(file, match[2]);
    if (resolved && (resolved === ROUTES_DIR || resolved.startsWith(ROUTES_DIR + path.sep))) imports.set(match[1], resolved);
  }
  const found = new Set();
  const useRe = /\b(?:app|router)\.use\(([^)]*)\)/g;
  while ((match = useRe.exec(body)) !== null) {
    for (const [id, child] of imports) {
      if (new RegExp("\\b" + id + "\\b").test(match[1])) found.add(child);
    }
  }
  return found;
}

/** entry files plus every route file they mount, walked until the chain stops. */
function liveViaMountedParents(entryFiles) {
  const live = new Set(entryFiles);
  const queue = [...entryFiles];
  while (queue.length) {
    const file = queue.shift();
    for (const child of directMountedRouteFiles(file)) {
      if (!live.has(child)) {
        live.add(child);
        queue.push(child);
      }
    }
  }
  return live;
}

const src = stripComments(fs.readFileSync(ROUTES_FILE, "utf8"));

// 1. Default imports of route modules: `import Foo from "./routes/bar"` (optionally with named: `import Foo, { x } from ...`).
const importRe = /import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s+from\s+["'](\.\/routes\/[^"']+)["']/g;
const imported = [];
const importSpec = new Map();
let m;
while ((m = importRe.exec(src)) !== null) {
  imported.push(m[1]);
  importSpec.set(m[1], m[2]);
}

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

// Comment-stripped concatenation of every server .ts file EXCEPT the routes dir itself.
// A sibling import counts only when a router that server/routes.ts mounts passes that
// binding to router.use/app.use (walked). An import with no .use() stays dark.
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

const entryFiles = [];
for (const id of mounted) {
  const spec = importSpec.get(id);
  if (!spec) continue;
  const resolved = resolveTs(ROUTES_FILE, spec);
  if (resolved) entryFiles.push(resolved);
}
const liveRoutes = liveViaMountedParents(entryFiles);

function importedOutsideRoutes(base) {
  const specRe = new RegExp(
    "from\\s+[\"'][^\"']*routes/" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\.[tj]s)?[\"']",
  );
  return specRe.test(serverSources);
}

const neverImported = routeFiles.filter((base) => {
  if (base in ALLOWED_UNIMPORTED) return false;
  if (liveRoutes.has(path.join(ROUTES_DIR, `${base}.ts`))) return false;
  return !importedOutsideRoutes(base);
});

const staleUnimportedAllow = Object.keys(ALLOWED_UNIMPORTED).filter((base) => {
  if (liveRoutes.has(path.join(ROUTES_DIR, `${base}.ts`))) return true;
  return importedOutsideRoutes(base);
});

if (staleUnimportedAllow.length > 0) {
  fail(
    "these route files are in ALLOWED_UNIMPORTED but ARE imported — remove them from the list:\n" +
      staleUnimportedAllow.map((b) => `  • ${b}.ts`).join("\n"),
  );
}

if (neverImported.length > 0) {
  fail(
    "these server/routes/*.ts files are not imported outside server/routes/ and are not mounted by a live router — every endpoint in them is DEAD (200-HTML):\n" +
      neverImported.map((b) => `  • server/routes/${b}.ts`).join("\n") +
      "\n\nFix: import + mount the router in server/routes.ts (or, if genuinely deferred, add it to ALLOWED_UNIMPORTED in this script WITH a reason). See CLAUDE.md §9.",
  );
}

const allowN = Object.keys(ALLOWED_UNMOUNTED).length;
console.log(
  `✅ Unmounted-router guard: ${imported.length} imported route module(s), ${mounted.size} mounted, ` +
    `${allowN} allow-listed dark; ${routeFiles.length} route file(s) on disk, none never-imported.`,
);
