#!/usr/bin/env node
/**
 * check-preferences-writer.cjs — `users.preferences` has exactly ONE writer.
 *
 * Ledger `2026-09-23-preferences-one-writer`; CLAUDE.md §18 rule 1 ("one implementation, N
 * callers"). Node built-ins only — no npm ci, no DB.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `users.preferences` is a namespaced jsonb shared by SEVEN writers (account settings, research
 * layers, storefront cover, travel preferences, EA preferences, the explicit traveler profile and
 * the dislike-feedback counters). Each one read the whole column, merged its own key in JS and
 * wrote the whole column back, so two saves racing on one account silently erased each other —
 * even when they owned different keys. The fix is ONE writer that merges under a row lock
 * (`server/services/user-preferences-writer.ts`, `updateUserPreferences`). An eighth writer added
 * the old way would reopen the race without failing anything, which is what this guard is for.
 *
 * THE RULE
 * ────────
 *   No non-test file under `server/` other than the writer may UPDATE `users` setting
 *   `preferences`. Two spellings are caught: the drizzle builder (`.update(users)` whose `.set(...)`
 *   names a `preferences` key before the statement's `.where(`) and raw SQL
 *   (`UPDATE users SET … preferences`). The writer file is checked for VACUITY too: it must still
 *   take the row lock (`FOR UPDATE`) and still write `users`, or this guard would be green over a
 *   writer that no longer prevents anything.
 *
 * NEGATIVE SPACE — what this guard does NOT cover (§18d: green means green-within-stated-bounds)
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *   • INSERTS are outside it. A row being born has no concurrent writer to lose, so seeds and
 *     account creation may set `preferences` freely.
 *   • It is a TEXT scan. A `.set()` object built in a variable and passed in, a generic helper
 *     that takes an arbitrary column map (e.g. a `storage.updateUser(id, patch)` whose patch
 *     happens to contain `preferences`), or SQL composed from string fragments is invisible.
 *   • Other tables' `preferences` columns (`trips.preferences`, the spontaneity table) are not
 *     this column and are not checked; the drizzle arm keys on `.update(users)` exactly.
 *   • TEST files (`server/__tests__/**`, `*.test.ts`, `*.spec.ts`) are exempt by design.
 *   • It says nothing about whether a caller's MERGE is correct — only that it runs under the lock.
 *     The race itself is proven by `server/__tests__/user-preferences-writer.db.test.ts`.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SERVER_DIR = path.join(ROOT, "server");

/** The ONE writer. Relative to the repo root, POSIX separators. */
const WRITER_FILE = "server/services/user-preferences-writer.ts";

const EXCLUDED_DIR_NAMES = new Set(["__tests__", "node_modules", "migrations"]);

/** How far past `.update(users)` to look for the statement's `.set(...)` before giving up. */
const STATEMENT_WINDOW = 1500;

function isTestPath(relPath) {
  return relPath.includes("/__tests__/") || /\.(test|spec)\.tsx?$/.test(relPath);
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

/** Every write of `users.preferences` in one file's text. Returns [{ line, kind }]. */
function findWrites(text) {
  const hits = [];
  const drizzle = /\.update\(\s*users\s*\)/g;
  let m;
  while ((m = drizzle.exec(text)) !== null) {
    const rest = text.slice(m.index, m.index + STATEMENT_WINDOW);
    const end = rest.search(/\.where\(|;\s*$/m);
    const statement = end === -1 ? rest : rest.slice(0, end);
    if (/\.set\(/.test(statement) && /\bpreferences\s*[:,}]/.test(statement)) {
      hits.push({ line: lineOf(text, m.index), kind: "drizzle update of users.preferences" });
    }
  }
  const raw = /UPDATE\s+users\s+SET\b[^;`]*?\bpreferences\b/gi;
  while ((m = raw.exec(text)) !== null) {
    hits.push({ line: lineOf(text, m.index), kind: "raw SQL update of users.preferences" });
  }
  return hits;
}

/** The predicate, over a map of { relPath: fileText }. Pure, so the self-test can drive it. */
function check(files) {
  const errors = [];
  let writerText = null;

  for (const [relPath, text] of Object.entries(files)) {
    if (isTestPath(relPath)) continue;
    if (relPath === WRITER_FILE) {
      writerText = text;
      continue;
    }
    for (const hit of findWrites(text)) {
      errors.push(
        `${relPath}:${hit.line} — ${hit.kind}. \`users.preferences\` has ONE writer ` +
          `(${WRITER_FILE}::updateUserPreferences); pass your merge to it instead of writing the column directly.`,
      );
    }
  }

  if (writerText === null) {
    errors.push(`The writer file ${WRITER_FILE} is missing — refusing to pass over a column with no locked writer.`);
  } else {
    if (!/FOR UPDATE/.test(writerText)) {
      errors.push(`${WRITER_FILE} no longer takes the row lock (no \`FOR UPDATE\`) — the race is open again.`);
    }
    if (!/\.update\(\s*users\s*\)/.test(writerText)) {
      errors.push(`${WRITER_FILE} no longer writes \`users\` — either the writer moved (update WRITER_FILE) or nothing writes the column.`);
    }
  }
  return errors;
}

function collectServerFiles() {
  const out = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        out[path.relative(ROOT, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
      }
    }
  };
  walk(SERVER_DIR);
  return out;
}

// ── committed self-test fixtures (§18d: a predicate change ships with fixtures) ─────────────────
const WRITER_OK = [
  "export async function updateUserPreferences(userId, merge) {",
  "  return db.transaction(async (tx) => {",
  "    const locked = await tx.execute(sql`SELECT preferences FROM users WHERE id = ${userId} FOR UPDATE`);",
  "    await tx.update(users).set({ preferences: next.preferences }).where(eq(users.id, userId));",
  "  });",
  "}",
].join("\n");

const CALLER_OK = [
  "const merged = await updateUserPreferences(userId, (current) => ({",
  "  preferences: { ...current, storefront: next },",
  "  result: next,",
  "}));",
  "await db.update(users).set({ bio: 'x' }).where(eq(users.id, userId));",
  "await db.update(trips).set({ preferences: {} }).where(eq(trips.id, tripId));",
  "const [me] = await db.select({ preferences: users.preferences }).from(users);",
].join("\n");

const DRIZZLE_WRITE = [
  "await db",
  "  .update(users)",
  "  .set({ preferences: { ...current, ea: nextEa } })",
  "  .where(eq(users.id, userId));",
].join("\n");

const DRIZZLE_SHORTHAND = "await db.update(users).set({ bio, preferences }).where(eq(users.id, id));";

const RAW_WRITE = "await db.execute(sql`UPDATE users SET preferences = ${json} WHERE id = ${id}`);";

function selfTest() {
  const base = { [WRITER_FILE]: WRITER_OK, "server/routes/a.routes.ts": CALLER_OK };
  const cases = [
    ["clean tree passes (callers pass merges; other columns and tables untouched)", () => check(base).length === 0],
    [
      "a multi-line drizzle write is caught",
      () => check({ ...base, "server/routes/b.routes.ts": DRIZZLE_WRITE }).some((e) => e.includes("b.routes.ts:2 ")),
    ],
    [
      "a shorthand `preferences` key is caught",
      () => check({ ...base, "server/services/c.ts": DRIZZLE_SHORTHAND }).length === 1,
    ],
    [
      "a raw SQL write is caught",
      () => check({ ...base, "server/services/d.ts": RAW_WRITE }).some((e) => e.includes("raw SQL")),
    ],
    [
      "an update of another table's preferences is not caught (stated negative space)",
      () => check({ ...base, "server/services/e.ts": "await db.update(trips).set({ preferences: p }).where(x);" }).length === 0,
    ],
    [
      "a test file may write freely",
      () => check({ ...base, "server/__tests__/x.db.test.ts": DRIZZLE_WRITE }).length === 0,
    ],
    [
      "the writer losing its lock fails loudly",
      () =>
        check({ ...base, [WRITER_FILE]: WRITER_OK.replace("FOR UPDATE", "") }).some((e) => e.includes("row lock")),
    ],
    [
      "a missing writer file fails rather than passing vacuously",
      () => check({ "server/routes/a.routes.ts": CALLER_OK }).some((e) => e.includes("missing")),
    ],
  ];

  let failed = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try {
      ok = fn();
    } catch {
      ok = false;
    }
    console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}`);
    if (!ok) failed++;
  }
  if (failed > 0) {
    console.error(`\npreferences-writer guard SELF-TEST FAILED — ${failed} fixture case(s). Fix the predicate first.`);
    process.exit(1);
  }
  console.log(`\npreferences-writer guard self-test: ${cases.length}/${cases.length} fixture cases pass.`);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  if (!fs.existsSync(SERVER_DIR)) {
    console.error("preferences-writer guard: server/ not found — refusing to pass vacuously.");
    process.exit(1);
  }
  const files = collectServerFiles();
  if (Object.keys(files).length === 0) {
    console.error("preferences-writer guard: scanned ZERO files — the walker is broken, not the tree.");
    process.exit(1);
  }
  const errors = check(files);
  if (errors.length > 0) {
    console.error("preferences-writer guard FAILED:\n");
    for (const e of errors) console.error(`  • ${e}`);
    console.error(
      "\nAn unlocked read-modify-write of users.preferences lets two saves on one account erase each other." +
        "\nSee ledger 2026-09-23-preferences-one-writer.",
    );
    process.exit(1);
  }
  console.log(
    `preferences-writer guard: OK — ${WRITER_FILE} is the only non-test server file that writes users.preferences ` +
      `(${Object.keys(files).length} files scanned).`,
  );
}

main();
