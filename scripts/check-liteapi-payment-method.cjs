#!/usr/bin/env node
/**
 * check-liteapi-payment-method.cjs — the platform never sends LiteAPI a payment method other than
 * TRANSACTION_ID (decision-maker S1-d-3 ruling, Oct 10, 2026; ledger `2026-10-10-s1-d3a-liteapi-booking`).
 *
 * WHY THIS EXISTS
 * ───────────────
 * Nuitée is merchant of record: their Payment SDK takes the traveler's card on our page and hands us a
 * transaction id. The book call then sends `payment: { method: "TRANSACTION_ID", transactionId }`. Any other
 * method (a card or an account balance) would make the platform the one paying the hotel — a money path no
 * ruling created, with no refund story behind it. This is the thing that fails if one is ever written.
 *
 * THE RULE
 * ────────
 *   1. `shared/liteapi-booking.ts` defines `LITEAPI_PAYMENT_METHOD = "TRANSACTION_ID"` (vacuity: if the
 *      constant goes, or changes value, this fails).
 *   2. `server/services/liteapi-client.ts` builds the ONE book body, and its `payment` object's method is
 *      that constant (vacuity: if the builder stops sending it, this fails).
 *   3. No other non-test `.ts`/`.tsx` under server/, shared/ or client/src names the book path `/rates/book`.
 *   4. In any non-test file that mentions LiteAPI, a `payment` object whose `method` is anything but
 *      `LITEAPI_PAYMENT_METHOD`, or any of the other method literals (`ACC_CREDIT_CARD`, `CREDIT_CARD`,
 *      `WALLET`), fails.
 *
 * NEGATIVE SPACE (§18d — green means green-within-stated-bounds)
 * ──────────────────────────────────────────────────────────────
 *   • A TEXT scan. A method assembled at runtime from data (`{ method: someVar }` outside the builder is
 *     caught; a body built by spreading an object from elsewhere is NOT), a request sent through a generic
 *     HTTP helper that names neither the path nor LiteAPI, or a string concatenated from fragments is
 *     invisible to it.
 *   • It checks what we SEND, not what LiteAPI does with it, and not that a booking is ever made.
 *   • Tests (`__tests__`, `*.test.ts`, `*.spec.ts`), migrations and node_modules are not scanned.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONSTANT_FILE = "shared/liteapi-booking.ts";
const BUILDER_FILE = "server/services/liteapi-client.ts";
const SCAN_DIRS = ["server", "shared", path.join("client", "src")];
const EXCLUDED = new Set(["__tests__", "node_modules", "migrations"]);
const OTHER_METHODS = /\b(ACC_CREDIT_CARD|CREDIT_CARD|WALLET)\b/;

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (EXCLUDED.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) out.push(p);
  }
}

/** Pure: given { relPath: text }, every violation. */
function check(files) {
  const problems = [];
  const constant = files[CONSTANT_FILE];
  if (constant === undefined || !/export const LITEAPI_PAYMENT_METHOD\s*=\s*"TRANSACTION_ID"/.test(constant)) {
    problems.push(`${CONSTANT_FILE}: LITEAPI_PAYMENT_METHOD must be "TRANSACTION_ID"`);
  }
  const builder = files[BUILDER_FILE];
  if (builder === undefined || !/payment:\s*\{\s*method:\s*LITEAPI_PAYMENT_METHOD\b/.test(builder)) {
    problems.push(`${BUILDER_FILE}: the book body's payment.method must be LITEAPI_PAYMENT_METHOD`);
  }
  for (const [rel, text] of Object.entries(files)) {
    const lines = text.split("\n");
    if (rel !== BUILDER_FILE) {
      lines.forEach((l, i) => {
        if (/\/rates\/book\b/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)) problems.push(`${rel}:${i + 1}: the LiteAPI book path outside ${BUILDER_FILE}`);
      });
    }
    if (!/liteapi/i.test(text)) continue;
    lines.forEach((l, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
      if (OTHER_METHODS.test(l)) problems.push(`${rel}:${i + 1}: a LiteAPI payment method other than TRANSACTION_ID`);
      const m = /payment:\s*\{\s*method:\s*([^,}\s]+)/.exec(l);
      if (m && m[1] !== "LITEAPI_PAYMENT_METHOD") problems.push(`${rel}:${i + 1}: payment.method is ${m[1]}, not LITEAPI_PAYMENT_METHOD`);
    });
  }
  return problems;
}

function selfTest() {
  const good = {
    [CONSTANT_FILE]: 'export const LITEAPI_PAYMENT_METHOD = "TRANSACTION_ID" as const;',
    [BUILDER_FILE]: "// liteapi\nconst x = `${u}/rates/book`;\nreturn { payment: { method: LITEAPI_PAYMENT_METHOD, transactionId } };",
    "server/services/other.ts": "// liteapi caller\nawait client.book(q);",
  };
  const cases = [
    ["clean", good, 0],
    ["constant changed", { ...good, [CONSTANT_FILE]: 'export const LITEAPI_PAYMENT_METHOD = "ACC_CREDIT_CARD";' }, 2],
    ["constant missing", { ...good, [CONSTANT_FILE]: "" }, 1],
    ["builder literal", { ...good, [BUILDER_FILE]: '// liteapi\nreturn { payment: { method: "TRANSACTION_ID", transactionId } };' }, 2],
    ["book path elsewhere", { ...good, "server/services/other.ts": "// liteapi\nfetch(`${base}/rates/book`, body);" }, 1],
    ["other method elsewhere", { ...good, "server/services/other.ts": '// liteapi\nconst body = { payment: { method: "WALLET" } };' }, 2],
    ["non-liteapi file ignored", { ...good, "server/services/stripe.ts": 'const p = { payment: { method: "card" } };' }, 0],
    ["comment ignored", { ...good, "server/services/other.ts": "// liteapi\n// never send WALLET to /rates/book" }, 0],
  ];
  let failed = 0;
  for (const [name, files, want] of cases) {
    const got = check(files).length;
    if (got !== want) {
      failed++;
      console.error(`SELF-TEST FAIL ${name}: expected ${want} problem(s), got ${got}`, check(files));
    }
  }
  if (failed) process.exit(1);
  console.log(`check-liteapi-payment-method self-test OK (${cases.length} cases)`);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const paths = [];
  for (const d of SCAN_DIRS) walk(path.join(ROOT, d), paths);
  const files = {};
  for (const p of paths) files[path.relative(ROOT, p).split(path.sep).join("/")] = fs.readFileSync(p, "utf8");
  const problems = check(files);
  if (problems.length) {
    console.error("check-liteapi-payment-method FAILED:");
    for (const p of problems) console.error("  " + p);
    process.exit(1);
  }
  console.log(`check-liteapi-payment-method OK (${paths.length} files; only TRANSACTION_ID is ever sent)`);
}

main();
