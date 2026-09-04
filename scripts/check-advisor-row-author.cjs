#!/usr/bin/env node
/**
 * check-advisor-row-author.cjs — `trip_expert_advisors` has exactly ONE author.
 *
 * Ledger `2026-09-04-advisor-row-one-author`; CLAUDE.md Locked Decision 32 (CORRECTION paragraph)
 * and §18 rule 1 ("one implementation, N callers"). Node built-ins only — no npm ci, no DB, so it
 * runs as a fast standalone CI job.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The row was inserted from SIX production sites, each with its own idea of what a conflict means:
 * a `WHERE NOT EXISTS` over two statuses, a bare INSERT that threw 23505, two copies of a
 * check-then-`ON CONFLICT DO NOTHING`-then-refetch dance (the TOCTOU shape §15 names), and an
 * `ON CONFLICT DO UPDATE` that overwrote `status` unconditionally — which could demote an
 * admin-confirmed `assigned` advisor to `accepted`. The UNIQUE (trip_id, local_expert_id) index
 * was the only thing keeping the six consistent, and it did so by THROWING: the hire-from-slip
 * route carried a `23505 → 409` translation precisely because of it.
 *
 * Consolidation is worth nothing if a seventh insert can be added tomorrow. Six sites drifted
 * apart because nothing failed when they did; this is the thing that fails.
 *
 * THE RULE
 * ────────
 *   Exactly ONE non-test file under `server/` may INSERT into `trip_expert_advisors` —
 *   `server/services/booking-actions.service.ts` (the `upsertTripAdvisorRow` author). Every other
 *   file must CALL it. Both spellings are caught: the drizzle builder
 *   (`.insert(tripExpertAdvisors)`) and raw SQL (`INSERT INTO trip_expert_advisors`).
 *
 *   The author file is also checked for VACUITY: if it stops containing an insert, this guard
 *   would pass while nothing writes the row at all, so that is a failure too.
 *
 * NEGATIVE SPACE — what this guard does NOT cover (§18d: green means green-within-stated-bounds)
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *   • It catches INSERTS ONLY. `UPDATE trip_expert_advisors` / `.update(tripExpertAdvisors)` is
 *     entirely outside it — the accept, decline and plan-approval paths update the row from
 *     several places by design, and consolidating THOSE is a different question this guard takes
 *     no position on.
 *   • It is a TEXT scan. Raw SQL assembled from fragments (`"INSERT INTO " + table`), a statement
 *     built by a query builder held in a variable, a `db.execute()` of a string composed at
 *     runtime, or an insert reached through a generic helper that names no table is invisible.
 *   • TEST files (`server/__tests__/**`, `*.test.ts`, `*.spec.ts`) are EXEMPT by design — a
 *     fixture seeding an advisor row directly is exercising the read side, not authoring
 *     production state — and so are SQL migrations and seeds, which are not `server/**` `.ts`.
 *   • It says nothing about whether the one author's CONFLICT RULE is correct, whether callers
 *     pass the right status, or whether the row is ever read. The precedence rule itself is
 *     proven by `server/__tests__/trip-advisor-row.test.ts`, not here.
 *   • Client code is out of scope entirely; the client cannot write this table.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SERVER_DIR = path.join(ROOT, "server");

/** The ONE author. Relative to the repo root, POSIX separators. */
const AUTHOR_FILE = "server/services/booking-actions.service.ts";

/** Directories never scanned (tests seed rows deliberately; node_modules is not ours). */
const EXCLUDED_DIR_NAMES = new Set(["__tests__", "node_modules", "migrations"]);

/** Both spellings of "this line inserts an advisor row". */
const INSERT_PATTERNS = [
  { name: "drizzle insert", re: /\.insert\(\s*tripExpertAdvisors\s*\)/ },
  { name: "raw SQL insert", re: /INSERT\s+INTO\s+trip_expert_advisors\b/i },
];

function isTestPath(relPath) {
  return (
    relPath.includes("/__tests__/") ||
    /\.(test|spec)\.tsx?$/.test(relPath)
  );
}

/** Every offending line in one file's text. Returns [{ line, kind, text }]. */
function findInserts(text) {
  const hits = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const { name, re } of INSERT_PATTERNS) {
      if (re.test(lines[i])) {
        hits.push({ line: i + 1, kind: name, text: lines[i].trim() });
        break;
      }
    }
  }
  return hits;
}

/**
 * The predicate, over a map of { relPath: fileText }. Pure, so the self-test can drive it with
 * fixtures instead of the tree.
 */
function check(files) {
  const errors = [];
  let authorSeen = false;
  let authorInsertCount = 0;

  for (const [relPath, text] of Object.entries(files)) {
    if (isTestPath(relPath)) continue;
    const hits = findInserts(text);
    if (relPath === AUTHOR_FILE) {
      authorSeen = true;
      authorInsertCount = hits.length;
      continue;
    }
    for (const hit of hits) {
      errors.push(
        `${relPath}:${hit.line} — ${hit.kind} into trip_expert_advisors. ` +
          `The row has ONE author (${AUTHOR_FILE}::upsertTripAdvisorRow); call it instead of writing a second insert.`,
      );
    }
  }

  if (!authorSeen) {
    errors.push(
      `The one author file was not scanned at all — ${AUTHOR_FILE} is missing. ` +
        `Refusing to pass: this guard would then be green over a tree with no writer.`,
    );
  } else if (authorInsertCount === 0) {
    errors.push(
      `${AUTHOR_FILE} contains NO insert into trip_expert_advisors. Either the author moved ` +
        `(update AUTHOR_FILE here in the same change) or nothing writes the row — both are failures, ` +
        `not a vacuous pass.`,
    );
  }

  return errors;
}

/** Every `.ts`/`.tsx` under server/, relative to the repo root, excluding the dirs above. */
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
const AUTHOR_OK = [
  "export async function upsertTripAdvisorRow(input) {",
  "  const [result] = await exec",
  "    .insert(tripExpertAdvisors)",
  "    .values({ tripId: input.tripId })",
  "    .onConflictDoUpdate({ target: [a, b], set: {} })",
  "    .returning();",
  "}",
].join("\n");

const CALLER_OK = [
  'import { upsertTripAdvisorRow } from "../services/booking-actions.service";',
  "await upsertTripAdvisorRow({ tripId, localExpertId, status: 'assigned' });",
  "const rows = await db.select().from(tripExpertAdvisors);",
  "await db.update(tripExpertAdvisors).set({ status: 'rejected' });",
].join("\n");

const CALLER_DRIZZLE_INSERT = [
  "await db.insert(tripExpertAdvisors).values({ tripId, localExpertId, status: 'accepted' });",
].join("\n");

const CALLER_RAW_INSERT = [
  "await db.execute(sql`",
  "  INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status)",
  "  VALUES (gen_random_uuid(), ${tripId}, ${expertId}, 'pending')",
  "`);",
].join("\n");

function selfTest() {
  const base = { [AUTHOR_FILE]: AUTHOR_OK, "server/routes/some.routes.ts": CALLER_OK };

  const cases = [
    [
      "clean tree passes (author inserts, callers only call/read/update)",
      () => check(base).length === 0,
    ],
    [
      "a second drizzle insert is caught",
      () =>
        check({ ...base, "server/routes/other.routes.ts": CALLER_DRIZZLE_INSERT }).some((e) =>
          e.includes("server/routes/other.routes.ts:1"),
        ),
    ],
    [
      "a raw SQL insert is caught",
      () =>
        check({ ...base, "server/services/other.service.ts": CALLER_RAW_INSERT }).some((e) =>
          e.includes("raw SQL insert"),
        ),
    ],
    [
      "an UPDATE is deliberately NOT caught (stated negative space)",
      () =>
        check({
          ...base,
          "server/routes/upd.ts": "await db.update(tripExpertAdvisors).set({ status: 'accepted' });",
        }).length === 0,
    ],
    [
      "a test file may insert freely",
      () =>
        check({ ...base, "server/__tests__/seed.db.test.ts": CALLER_DRIZZLE_INSERT }).length === 0,
    ],
    [
      "a *.test.ts outside __tests__ is exempt too",
      () => check({ ...base, "server/routes/x.test.ts": CALLER_RAW_INSERT }).length === 0,
    ],
    [
      "the author losing its insert fails loudly, not vacuously",
      () =>
        check({ [AUTHOR_FILE]: "export async function upsertTripAdvisorRow() {}" }).some((e) =>
          e.includes("NO insert"),
        ),
    ],
    [
      "a missing author file fails rather than passing over an unwritable table",
      () => check({ "server/routes/some.routes.ts": CALLER_OK }).some((e) => e.includes("missing")),
    ],
    [
      "the author file itself may insert without being flagged",
      () => !check(base).some((e) => e.includes(AUTHOR_FILE + ":")),
    ],
  ];

  let failed = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try {
      ok = fn();
    } catch (e) {
      ok = false;
    }
    console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}`);
    if (!ok) failed++;
  }
  if (failed > 0) {
    console.error(
      `\nadvisor-row-author guard SELF-TEST FAILED — ${failed} fixture case(s). The predicate is wrong; fix it before trusting a green run.`,
    );
    process.exit(1);
  }
  console.log(`\nadvisor-row-author guard self-test: ${cases.length}/${cases.length} fixture cases pass.`);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  if (!fs.existsSync(SERVER_DIR)) {
    console.error("advisor-row-author guard: server/ not found — refusing to pass vacuously.");
    process.exit(1);
  }

  const files = collectServerFiles();
  if (Object.keys(files).length === 0) {
    console.error("advisor-row-author guard: scanned ZERO files — the walker is broken, not the tree.");
    process.exit(1);
  }

  const errors = check(files);
  if (errors.length > 0) {
    console.error("advisor-row-author guard FAILED:\n");
    for (const e of errors) console.error(`  • ${e}`);
    console.error(
      "\n`trip_expert_advisors` has ONE author. Six insert sites drifted apart once already;" +
        "\nthe UNIQUE index was the only thing holding them together, and it did it by throwing." +
        "\nSee CLAUDE.md Locked Decision 32 (CORRECTION) / ledger 2026-09-04-advisor-row-one-author.",
    );
    process.exit(1);
  }
  console.log(
    `advisor-row-author guard: OK — ${AUTHOR_FILE} is the only non-test server file that inserts trip_expert_advisors ` +
      `(${Object.keys(files).length} files scanned).`,
  );
}

main();
