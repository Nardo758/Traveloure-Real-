#!/usr/bin/env node
/**
 * check-earn-planner-keys.cjs — the Event Planner track's expert half is partitioned by an
 * explicit KEY LIST, and a key in that list must actually be a row someone seeded.
 *
 * Ledger `2026-09-04-earn-planner-roles`, CLAUDE.md Locked Decision 36. Node built-ins only —
 * no npm ci, no DB, so it runs as a fast standalone CI job.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `expert_offering_types.service_tier` carries a DB CHECK over five values, so the six planner
 * rows had to land in the EXISTING `coordination` tier — which means no tier can separate a
 * wedding planner from a Reservation Lifeline, and the split is instead an explicit list,
 * `EVENT_PLANNER_OFFERING_KEYS` in `client/src/lib/earn-roles.ts`.
 *
 * A list like that can drift in BOTH directions, and each direction is its own bug:
 *
 *   • a key in the list that NO migration seeds  → the Event Planner card partitions on a key
 *     that never arrives. The row simply never renders, and — worse — the same key can still be
 *     carried into `/become-expert?type=event_planner` by a stale link, where
 *     `storage.createLocalExpertForm` clamps it to NULL against the migration-107 FK. That is
 *     precisely the silent-clamp bug this whole lane exists to fix, re-created from the list side.
 *
 *   • a seeded key MISSING from the list → the row is a `coordination` row like any other, so
 *     `roleForExpertOffering` files it under **Trip Planner**. A wedding planner would be listed
 *     on the itinerary-designer card and sent to the trip-planner application. Nothing errors; it
 *     is just wrong, on the live page, silently.
 *
 * This is the same shape as `check-roles-needed-reachability.cjs` (ledger
 * `2026-09-04-roles-needed`) one table over: a key with no row behind it is a dead path that
 * LOOKS live. There it was `service_categories.category_key`; here it is
 * `expert_offering_types.offering_type_key`.
 *
 * THE RULES
 * ─────────
 *   1. Every key in `EVENT_PLANNER_OFFERING_KEYS` is INSERTed into `expert_offering_types` by
 *      some migration in `server/migrations/`.
 *   2. Every key migration 283 inserts is in `EVENT_PLANNER_OFFERING_KEYS` — so seeding a
 *      seventh planner row without listing it cannot quietly file it under Trip Planner.
 *   3. Every key in the list is seeded with `service_tier = 'coordination'` — the tier the
 *      CHECK already allows. A planner row seeded into some other tier would still render on the
 *      Event Planner card (the key wins), but would misfile in every tier-only reader.
 *
 * NEGATIVE SPACE — what this guard does NOT check (§18d: green means green-within-stated-bounds)
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *   • It checks REACHABILITY of the key in the SEED — never that any expert has actually applied
 *     for that role, nor that the row is `is_active` in a given database, nor that the migration
 *     has been APPLIED anywhere. An empty Event Planner card in a database that never ran 283 is
 *     an ops fact, not a taxonomy error, and this guard is deliberately silent about it.
 *   • It does not look at `service_offering_types` at all. The provider half of the same card is
 *     partitioned by `EVENT_CATEGORY_KEYS` and guarded (for category reachability) by
 *     `check-category-reachability.cjs`. The two catalogs are never merged (§4) and neither
 *     guard is the other's business.
 *   • It says nothing about whether these six are the RIGHT six. That is editorial content,
 *     ratified with the ledger row, not something a grep can hold.
 *   • It reads the migrations as TEXT, and does not consult `migration-files.ts` — a file present
 *     but unregistered would satisfy rule 1 here while never running. The chain-integrity test
 *     (`server/migrations/__tests__/chain-integrity.test.ts`) is what holds registration.
 *   • A row inserted by application code, a seeder script or a hand-run SQL statement is
 *     invisible to it — by design: the deploy-push durability rules make a committed migration
 *     the only durable author.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ROLES = path.join(ROOT, "client/src/lib/earn-roles.ts");
const MIGRATIONS_DIR = path.join(ROOT, "server/migrations");
const OWN_MIGRATION = "283_expert_planner_offering_types.sql";

/** The EVENT_PLANNER_OFFERING_KEYS array literal in earn-roles.ts. */
function listedKeys(ts) {
  const m = ts.match(/export const EVENT_PLANNER_OFFERING_KEYS = \[([\s\S]*?)\] as const;/);
  if (!m) return null;
  return new Set([...m[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]));
}

/**
 * Every (offering_type_key → service_tier) pair a migration INSERTs into
 * `expert_offering_types`. Reads only VALUES tuples that follow an
 * `INSERT INTO expert_offering_types` in the same file, so a migration touching a different
 * table cannot contribute keys.
 */
function seededPairs(sql) {
  const pairs = new Map();
  // Split on the insert target so one file may carry several inserts, and so an insert into
  // some OTHER table in the same file contributes nothing.
  const chunks = sql.split(/INSERT\s+INTO\s+/i).slice(1);
  for (const chunk of chunks) {
    if (!/^expert_offering_types\b/i.test(chunk.trim())) continue;
    for (const m of chunk.matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z_]+)'\s*,/g)) {
      pairs.set(m[1], m[2]);
    }
  }
  return pairs;
}

/** Union of every migration's expert_offering_types inserts. `files` is [name, sql] pairs. */
function seededAcross(files) {
  const all = new Map();
  for (const [, sql] of files) {
    for (const [k, tier] of seededPairs(sql)) if (!all.has(k)) all.set(k, tier);
  }
  return all;
}

function check(rolesTs, files) {
  const errors = [];

  const listed = listedKeys(rolesTs);
  if (listed === null) {
    errors.push("Could not find `export const EVENT_PLANNER_OFFERING_KEYS = [...] as const;` in client/src/lib/earn-roles.ts.");
    return errors;
  }
  if (listed.size === 0) {
    errors.push("EVENT_PLANNER_OFFERING_KEYS is empty — refusing to pass vacuously.");
    return errors;
  }

  const seeded = seededAcross(files);
  if (seeded.size === 0) {
    errors.push("Parsed ZERO expert_offering_types keys from the migrations — the parser is broken, not the data. Refusing to pass vacuously.");
    return errors;
  }

  // Rule 1 + 3: every listed key is seeded, in the coordination tier.
  for (const k of listed) {
    if (!seeded.has(k)) {
      errors.push(
        `EVENT_PLANNER_OFFERING_KEYS names "${k}", which no migration inserts into expert_offering_types. The Event Planner card would partition on a key that never arrives, and a link carrying it clamps to NULL at the migration-107 FK.`
      );
      continue;
    }
    if (seeded.get(k) !== "coordination") {
      errors.push(
        `"${k}" is seeded into the "${seeded.get(k)}" tier, not "coordination". Every planner row lives in the existing coordination tier — no new service_tier, because that column carries a DB CHECK.`
      );
    }
  }

  // Rule 2: every key THIS lane's migration seeds is listed.
  const own = files.find(([name]) => name === OWN_MIGRATION);
  if (!own) {
    errors.push(`Required migration missing: server/migrations/${OWN_MIGRATION}.`);
    return errors;
  }
  const ownKeys = seededPairs(own[1]);
  if (ownKeys.size === 0) {
    errors.push(
      `${OWN_MIGRATION} inserts ZERO expert_offering_types rows — the parser is broken, or the seed was gutted. Refusing to pass vacuously.`
    );
    return errors;
  }
  for (const k of ownKeys.keys()) {
    if (!listed.has(k)) {
      errors.push(
        `${OWN_MIGRATION} seeds "${k}", which is not in EVENT_PLANNER_OFFERING_KEYS. A coordination row outside that list is filed under Trip Planner — silently, on the live page.`
      );
    }
  }

  return errors;
}

// ── committed self-test fixtures (§18d: a predicate change ships with fixtures) ─────────────────
const FIX_MIGRATION = [
  "INSERT INTO expert_offering_types",
  "  (offering_type_key, service_tier, display_name, tagline, delivery_formats, is_surprising, sort_order)",
  "VALUES",
  "  ('wedding_planner',  'coordination', 'Wedding planner',  'Run the whole wedding.', ARRAY['in_person','hybrid'], false, 50),",
  "  ('proposal_planner', 'coordination', 'Proposal planner', 'Design the moment.',     ARRAY['in_person','hybrid'], false, 52)",
  "ON CONFLICT (offering_type_key) DO NOTHING;",
].join("\n");

// A migration that inserts into a DIFFERENT table must contribute nothing.
const FIX_OTHER_TABLE = [
  "INSERT INTO service_offering_types",
  "  (offering_type_key, category_key, display_name)",
  "VALUES",
  "  ('wedding_coordinator', 'event_coordinator', 'Wedding Planner / Coordinator');",
].join("\n");

const OK_ROLES = 'export const EVENT_PLANNER_OFFERING_KEYS = [\n  "wedding_planner",\n  "proposal_planner",\n] as const;';

function selfTest() {
  const files = (extra = []) => [
    [OWN_MIGRATION, FIX_MIGRATION],
    ["001_other.sql", FIX_OTHER_TABLE],
    ...extra,
  ];

  const cases = [
    ["clean case passes", () => check(OK_ROLES, files()).length === 0],
    [
      "a listed key no migration seeds is caught (rule 1)",
      () =>
        check(
          'export const EVENT_PLANNER_OFFERING_KEYS = [\n  "wedding_planner",\n  "proposal_planner",\n  "yacht_planner",\n] as const;',
          files()
        ).some((e) => e.includes("yacht_planner") && e.includes("never arrives")),
    ],
    [
      "a seeded key missing from the list is caught (rule 2)",
      () =>
        check('export const EVENT_PLANNER_OFFERING_KEYS = [\n  "wedding_planner",\n] as const;', files()).some(
          (e) => e.includes("proposal_planner") && e.includes("Trip Planner")
        ),
    ],
    [
      "a planner row seeded into the wrong tier is caught (rule 3)",
      () =>
        check(OK_ROLES, [
          [
            OWN_MIGRATION,
            FIX_MIGRATION.replace("'proposal_planner', 'coordination'", "'proposal_planner', 'specialized'"),
          ],
        ]).some((e) => e.includes("proposal_planner") && e.includes("specialized")),
    ],
    [
      "a key satisfied by ANOTHER migration passes rule 1",
      () =>
        check(
          'export const EVENT_PLANNER_OFFERING_KEYS = [\n  "wedding_planner",\n  "proposal_planner",\n  "party_planner",\n] as const;',
          files([
            [
              "099_restore.sql",
              "INSERT INTO expert_offering_types\n  (offering_type_key, service_tier, display_name)\nVALUES\n  ('party_planner', 'coordination', 'Birthday and party planner');",
            ],
          ])
        ).length === 0,
    ],
    ["an insert into a DIFFERENT table contributes no keys", () => seededPairs(FIX_OTHER_TABLE).size === 0],
    [
      "broken migration parse fails loudly, not vacuously",
      () => check(OK_ROLES, [[OWN_MIGRATION, "-- no tuples here"]]).some((e) => e.includes("ZERO")),
    ],
    ["missing list declaration is caught", () => check("// no list", files()).some((e) => e.includes("EVENT_PLANNER_OFFERING_KEYS"))],
    [
      "empty list fails vacuity check",
      () => check("export const EVENT_PLANNER_OFFERING_KEYS = [\n] as const;", files()).some((e) => e.includes("empty")),
    ],
    [
      "a missing 283 is caught",
      () =>
        check(OK_ROLES, [
          ["001_other.sql", FIX_OTHER_TABLE],
          ["099_x.sql", FIX_MIGRATION],
        ]).some((e) => e.includes("Required migration missing")),
    ],
    [
      "parser reads both fixture pairs with their tiers",
      () => {
        const p = seededPairs(FIX_MIGRATION);
        return p.get("wedding_planner") === "coordination" && p.get("proposal_planner") === "coordination" && p.size === 2;
      },
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
      `\nearn-planner-keys guard SELF-TEST FAILED — ${failed} fixture case(s). The predicate is wrong; fix it before trusting a green run.`
    );
    process.exit(1);
  }
  console.log(`\nearn-planner-keys guard self-test: ${cases.length}/${cases.length} fixture cases pass.`);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  if (!fs.existsSync(ROLES)) {
    console.error(`earn-planner-keys guard: required file missing — ${path.relative(ROOT, ROLES)}`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => [f, fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8")]);

  const errors = check(fs.readFileSync(ROLES, "utf8"), files);
  if (errors.length > 0) {
    console.error("earn-planner-keys guard FAILED:\n");
    for (const e of errors) console.error(`  • ${e}`);
    console.error("\nEVENT_PLANNER_OFFERING_KEYS and the expert_offering_types seed must name the same six coordination rows.");
    console.error("See CLAUDE.md Locked Decision 36 / ledger 2026-09-04-earn-planner-roles.");
    process.exit(1);
  }
  console.log("earn-planner-keys guard: OK — every Event Planner key is a seeded coordination row, and every seeded planner row is listed.");
}

main();
