#!/usr/bin/env node
/**
 * check-tripless-cart-writers.cjs — step 8c (brief rev 3.1, items 22–23; ledger
 * `2026-10-07-step8c-retirements`): the trip-less cart writers are a FROZEN list that can only
 * shrink, and the retired experience-template page and its map stay gone.
 *
 * LD 39: the cart is the `ready_for_checkout` projection of `itinerary_items`, and the trip-less
 * guest cart is a sanctioned FALLBACK until G2. Step 8c deleted the template page (and with it its
 * two cart writers). The writers that remain are recorded below exactly as they stand; a NEW one
 * fails CI, and one that disappears fails too until the allowlist is shrunk to match — so the list
 * is always the truth and never only grows.
 *
 *   node scripts/check-tripless-cart-writers.cjs             — the SOURCE (client/src, tests excluded)
 *   node scripts/check-tripless-cart-writers.cjs --bundle    — the BUILT bundle (dist/public): none of
 *                                                              the testids only the retired page drew
 *   node scripts/check-tripless-cart-writers.cjs --self-test — committed fixtures (§18d)
 *
 * WHAT COUNTS AS A TRIP-LESS CART WRITER: a `"POST"` call whose URL literal is exactly `/api/cart`
 * or `/api/cart/items`, or ends in `/apply-to-cart` (the comparison rail that replaces a cart),
 * and whose call text up to its closing `);` names no `tripId`. Keyed by FILE + the nearest
 * enclosing `name:`/`mutationFn`/function — never by line number — and counted per key.
 *
 * STATED NEGATIVE SPACE (§18d): it reads TEXT. It cannot see a URL built in a variable, a new
 * helper that wraps `apiRequest`, or `fetch(url, { method: "POST" })` where the method is not the
 * literal "POST" within the call — the companion check (every code literal `"/api/cart"` /
 * `"/api/cart/items"` outside a `queryKey` lives in an allowlisted file) narrows the first. It
 * ignores GETs, query keys, PATCH, DELETE, `/migrate`, `/resolve-trip`, `/convert-to-itinerary`,
 * `/fee-preview`, comments and `artifacts/**`. A call that names `tripId` is treated as
 * trip-scoped and is NOT counted; the guard does not prove the value is a real trip. Server
 * routes are not read. The bundle half reads testids, because a minifier renames components; a
 * retired control re-added under a new testid is invisible to it.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");

/**
 * THE FROZEN LIST. Each key's count may only FALL; any change means editing this list in the same
 * PR, and the PR names why. Recorded against G2 in docs/FOLLOWUPS.md (FU-8C-1).
 */
const ALLOWLIST = {
  "client/src/pages/cart.tsx::CartPage": 1, // Discover guest-pending migration, in the page's mount effect (:733)
  "client/src/pages/cart.tsx::addUpsellMutation": 1, // the cart's own upsell add (:1059)
  "client/src/pages/visa-help.tsx::bookingMutation": 1, // visa help (:144)
  "client/src/pages/itinerary-comparison.tsx::applyToCartMutation": 1, // flag-off apply-to-cart (:1084)
  "client/src/pages/itinerary-comparison.tsx::addUpsellToCartMutation": 1, // comparison upsell, /api/cart/items (:1112)
  "client/src/pages/service-detail.tsx::addToCartMutation": 1, // service add with no target plan (:687)
  "client/src/pages/service-detail.tsx::addRoomToCartMutation": 1, // room add with no target plan (:877)
};

/** The retired files: they stay deleted, and nothing imports them by name. */
const RETIRED_FILES = [
  "client/src/pages/experience-template.tsx",
  "client/src/components/experience-map.tsx",
];
const RETIRED_IMPORT = /(?:from\s+|import\s*\(\s*)["'][^"']*\/(experience-template|experience-map)["']/;

/** Testids only the retired page or its map drew (none appears anywhere else in client/src). */
const RETIRED_TESTIDS = [
  "button-view-trip-planner",
  "button-expert-help-ribbon",
  "button-wedding-mode-planning",
  "cart-summary-persistent",
  "dialog-choose-destination",
  "experience-map-no-location",
  "tab-right-map",
];

/** Pure. Strip line and block comments, keeping string literals intact. */
function stripComments(src) {
  let out = "";
  let i = 0;
  let q = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (q) {
      out += c;
      if (c === "\\") {
        out += n ?? "";
        i += 2;
        continue;
      }
      if (c === q) q = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      q = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const chunk = src.slice(i, end < 0 ? src.length : end + 2);
      out += chunk.replace(/[^\n]/g, " ");
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const WRITER_CALL =
  /["']POST["']\s*,\s*(?:"(\/api\/cart(?:\/items)?)"|'(\/api\/cart(?:\/items)?)'|`(\/api\/cart(?:\/items)?)`|`([^`]*\/apply-to-cart)`|"([^"]*\/apply-to-cart)")/g;

/** Pure. The nearest enclosing name above `index` (a `const X = use…(`, `function X(`, or `X:`). */
function enclosingName(src, index) {
  const before = src.slice(0, index);
  const re = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:useMutation|async|\(|function)|function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let name = "<module>";
  let m;
  while ((m = re.exec(before))) name = m[1] || m[2];
  return name;
}

/** Pure. Trip-less cart writers in one file's source, as `{ key, line }`. */
function writersIn(file, raw) {
  const src = stripComments(raw);
  const found = [];
  let m;
  WRITER_CALL.lastIndex = 0;
  while ((m = WRITER_CALL.exec(src))) {
    const end = src.indexOf(");", m.index);
    const call = src.slice(m.index, end < 0 ? m.index + 400 : end);
    if (/\btripId\b/.test(call)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    found.push({ key: `${file}::${enclosingName(src, m.index)}`, line });
  }
  return found;
}

/** Pure. Code literals of the cart URL outside a `queryKey`. */
function bareCartLiterals(raw) {
  const src = stripComments(raw);
  const hits = [];
  const re = /["'`]\/api\/cart(?:\/items)?["'`]/g;
  let m;
  while ((m = re.exec(src))) {
    const lead = src.slice(Math.max(0, m.index - 20), m.index);
    if (/queryKey:\s*\[\s*$/.test(lead)) continue;
    hits.push(src.slice(0, m.index).split("\n").length);
  }
  return hits;
}

/** Pure. Compare counted writers against the allowlist; returns error strings. */
function compare(counts, allow = ALLOWLIST) {
  const errors = [];
  for (const [key, n] of Object.entries(counts)) {
    const max = allow[key] ?? 0;
    if (n > max) {
      errors.push(
        max === 0
          ? `${key}: a NEW trip-less cart writer (${n}). The cart is a projection of the plan (LD 39); write to the plan's itinerary-items rail instead, or get a ruling.`
          : `${key}: ${n} trip-less cart writes, the frozen list allows ${max}.`,
      );
    }
  }
  for (const [key, max] of Object.entries(allow)) {
    const n = counts[key] ?? 0;
    if (n < max) errors.push(`${key}: ${n} found, the list records ${max} — the list only shrinks; lower it to ${n} in this PR.`);
  }
  return errors;
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function runSource() {
  const errors = [];
  for (const f of RETIRED_FILES) {
    if (fs.existsSync(path.join(REPO, f))) errors.push(`${f}: retired in step 8c and must stay deleted.`);
  }
  const counts = {};
  const allowedFiles = new Set(Object.keys(ALLOWLIST).map((k) => k.split("::")[0]));
  for (const abs of walk(path.join(REPO, "client/src"), [])) {
    const rel = path.relative(REPO, abs).split(path.sep).join("/");
    const raw = fs.readFileSync(abs, "utf8");
    if (RETIRED_IMPORT.test(stripComments(raw))) errors.push(`${rel}: imports a retired module (experience-template / experience-map).`);
    for (const w of writersIn(rel, raw)) counts[w.key] = (counts[w.key] ?? 0) + 1;
    if (!allowedFiles.has(rel)) {
      for (const line of bareCartLiterals(raw)) {
        errors.push(`${rel}:${line}: a cart URL literal outside a queryKey in a file the frozen list does not name.`);
      }
    }
  }
  errors.push(...compare(counts));
  if (errors.length) {
    console.error("tripless-cart-writers: FAIL");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(
    `tripless-cart-writers: OK — ${total} trip-less cart writer(s), exactly the frozen list of ${Object.keys(ALLOWLIST).length}; the retired page and map stay deleted and unimported.`,
  );
}

function runBundle() {
  const dist = path.join(REPO, "dist/public");
  if (!fs.existsSync(dist)) {
    console.error("tripless-cart-writers --bundle: dist/public not found — run `npm run build` first.");
    process.exit(1);
  }
  const files = [];
  (function w(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) w(p);
      else if (p.endsWith(".js")) files.push(p);
    }
  })(dist);
  const hits = [];
  for (const f of files) {
    const t = fs.readFileSync(f, "utf8");
    for (const id of RETIRED_TESTIDS) if (t.includes(id)) hits.push(`${path.relative(REPO, f)}: ${id}`);
  }
  if (hits.length) {
    console.error("tripless-cart-writers --bundle: FAIL — the retired template page's testids are in the bundle:");
    for (const h of hits) console.error("  " + h);
    process.exit(1);
  }
  console.log(`tripless-cart-writers --bundle: OK — none of ${RETIRED_TESTIDS.length} retired testids in ${files.length} chunk(s).`);
}

function selfTest() {
  const F = "client/src/pages/x.tsx";
  const cases = [
    ["a POST to /api/cart is a writer", () => writersIn(F, 'const addMut = useMutation({ mutationFn: () => apiRequest("POST", "/api/cart", { serviceId }) });').length === 1],
    ["a POST to /api/cart/items is a writer", () => writersIn(F, 'const m = useMutation({ mutationFn: () => apiRequest("POST", "/api/cart/items", { serviceId }) });').length === 1],
    ["a template-literal apply-to-cart is a writer", () => writersIn(F, "const a = useMutation({ mutationFn: () => apiRequest(\"POST\", `/api/itinerary-comparisons/${id}/apply-to-cart`) });").length === 1],
    ["a writer is keyed by its enclosing name", () => writersIn(F, 'const addMut = useMutation({ mutationFn: () => apiRequest("POST", "/api/cart", {}) });')[0].key === `${F}::addMut`],
    ["a call naming tripId is trip-scoped, not counted", () => writersIn(F, 'const m = useMutation({ mutationFn: () => apiRequest("POST", "/api/cart", { serviceId, tripId }) });').length === 0],
    ["a GET fetch of /api/cart is not a writer", () => writersIn(F, 'const q = useQuery({ queryFn: () => fetch("/api/cart", { credentials: "include" }) });').length === 0],
    ["a PATCH of a cart line is not a writer", () => writersIn(F, 'const p = useMutation({ mutationFn: () => apiRequest("PATCH", `/api/cart/${id}`, {}) });').length === 0],
    ["/api/cart/migrate and /resolve-trip are not writers", () => writersIn(F, 'apiRequest("POST", "/api/cart/migrate", {}); apiRequest("POST", "/api/cart/resolve-trip", {});').length === 0],
    ["a writer in a comment is not counted", () => writersIn(F, '// apiRequest("POST", "/api/cart", {})\n/* apiRequest("POST", "/api/cart", {}) */').length === 0],
    ["a queryKey literal is not a bare cart literal", () => bareCartLiterals('useQuery({ queryKey: ["/api/cart"] })').length === 0],
    ["a URL held in a variable is caught as a bare literal", () => bareCartLiterals('const url = "/api/cart"; apiRequest(method, url, body);').length === 1],
    ["a NEW writer fails", () => compare({ [`${F}::addMut`]: 1 }, {}).some((e) => e.includes("NEW trip-less cart writer"))],
    ["a second write under an allowlisted key fails", () => compare({ k: 2 }, { k: 1 }).some((e) => e.includes("allows 1"))],
    ["a writer that disappeared fails until the list shrinks", () => compare({}, { k: 1 }).some((e) => e.includes("only shrinks"))],
    ["the exact list passes", () => compare({ k: 1 }, { k: 1 }).length === 0],
    ["an import of experience-map is caught", () => RETIRED_IMPORT.test('import { ExperienceMap } from "@/components/experience-map";')],
    ["a lazy import of the template page is caught", () => RETIRED_IMPORT.test('const P = lazy(() => import("./pages/experience-template"));')],
    ["experience-map-utils is not experience-map", () => !RETIRED_IMPORT.test('import { x } from "@/lib/experience-map-utils";')],
  ];
  let failed = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try {
      ok = fn();
    } catch {
      ok = false;
    }
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`);
    if (!ok) failed++;
  }
  if (failed) {
    console.error(`tripless-cart-writers self-test: ${failed}/${cases.length} fixture case(s) FAILED.`);
    process.exit(1);
  }
  console.log(`\ntripless-cart-writers self-test: ${cases.length}/${cases.length} fixture cases pass.`);
}

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === "--self-test") selfTest();
  else if (arg === "--bundle") runBundle();
  else runSource();
}

module.exports = { writersIn, bareCartLiterals, compare, stripComments, ALLOWLIST, RETIRED_FILES, RETIRED_TESTIDS };
