#!/usr/bin/env node
/**
 * Duplicate-migration-prefix guard (ledger `2026-08-16-ledger-ids`; CLAUDE.md
 * "CRITICAL: Migration Directory").
 *
 * Migration numbers have collided three times now — three lanes independently
 * minted the same "next" numeric prefix because nothing checked for it. This
 * guard fails CI the moment a NEW collision lands, so the next one is a red
 * check instead of a manual renumber discovered on merge.
 *
 * WHAT IT CHECKS: every `server/migrations/*.sql` filename, and every entry
 * in the `MIGRATION_FILES` registry (`server/migrations/migration-files.ts`),
 * is reduced to its leading numeric prefix (`262_x.sql` -> `262`,
 * `025b_ai_cost_tracking.sql` -> `025b`). A LETTER-SUFFIXED prefix is a
 * DISTINCT prefix from its bare numeric form — `025` and `025b` never
 * collide with each other, only an EXACT duplicate prefix string fails.
 * Filenames with no leading digit (e.g. a one-off maintenance script sitting
 * in the directory) are ignored — they are not part of the numbered chain.
 *
 * GRANDFATHERING: the current tree already contains three exact-duplicate
 * prefixes that predate this guard and are live in production (see
 * ALLOWLISTED_DUPLICATE_PREFIXES below). They are allowlisted by prefix so
 * this guard is green on the tree as it stands today, and will fail on the
 * NEXT new collision — allowlisting an existing duplicate does not exempt a
 * future one that happens to reuse the same prefix string after the
 * grandfathered files are renamed/removed.
 *
 * NEGATIVE SPACE (§18d — state what this predicate does NOT cover): it
 * checks filename/registry prefix UNIQUENESS only. It does not verify that a
 * migration file is actually REGISTERED in MIGRATION_FILES, that registry
 * order matches numeric order, or that the numeric series is CONTIGUOUS (a
 * documented intentional gap, e.g. 058, is not an error here).
 *
 * Node built-ins only — no npm ci needed. Self-test: --self-test
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "server", "migrations");
const REGISTRY_FILE = path.join(MIGRATIONS_DIR, "migration-files.ts");

// Prefix = leading digits plus an optional trailing run of lowercase letters,
// up to the first underscore. `262_trip_pass.sql` -> "262"; `025b_ai_cost_tracking.sql`
// -> "025b". No leading digit -> no prefix (file is out of scope for this guard).
const PREFIX_RE = /^(\d+[a-z]*)_/;

// Grandfathered EXACT-duplicate prefixes already on the tree at the time this
// guard was added (found by running this guard's own scan against the real
// directory listing before finalizing it — CLAUDE.md ledger 2026-08-16-ledger-ids
// names this exact three-collision history). Each pair is still live/registered
// in migration-files.ts and applied in production; renumbering them is a
// separate, riskier change than adding this guard. Do NOT add a new prefix here
// to silence a NEW collision — allowlisting is for pre-existing debt only.
const ALLOWLISTED_DUPLICATE_PREFIXES = new Set([
  "079", // 079_season_tag_on_offering_types.sql + 079_seed_missing_fee_bands.sql
  "098", // 098_bookings_dispute_columns.sql + 098_restore_event_planner_offering_types.sql
  "099", // 099_bookings_expert_slot_unique.sql + 099_restore_expert_offering_types.sql
]);

/** Extract the leading numeric(+letter) prefix from a migration filename, or null. */
function extractPrefix(filename) {
  const m = PREFIX_RE.exec(filename);
  return m ? m[1] : null;
}

/**
 * Given a list of filenames, return a Map<prefix, filename[]> of prefixes that
 * appear on 2+ filenames. Filenames with no numeric prefix are ignored.
 */
function findDuplicatePrefixes(filenames) {
  const byPrefix = new Map();
  for (const filename of filenames) {
    const prefix = extractPrefix(filename);
    if (prefix === null) continue;
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(filename);
  }
  const dupes = new Map();
  for (const [prefix, files] of byPrefix) {
    if (files.length > 1) dupes.set(prefix, files);
  }
  return dupes;
}

/** Parse the quoted `"NNN_....sql"` entries out of the MIGRATION_FILES array. */
function extractRegistryFilenames(tsSource) {
  const out = [];
  const re = /"(\d[^"]*\.sql)"/g;
  let m;
  while ((m = re.exec(tsSource)) !== null) out.push(m[1]);
  return out;
}

// ─── Self-test (`--self-test`) — COMMITTED fixtures, run in CI BEFORE the guard ───
// A guard whose predicate is wrong passes truthfully forever (§18d). These fixtures
// pin: letter-suffixed prefixes are distinct from their bare form, an exact-duplicate
// prefix IS caught, a non-numeric filename is ignored (not a false positive), and the
// allowlist suppresses only the prefixes named in it — nothing else.
function selfTest() {
  let failures = 0;
  const check = (label, got, expected) => {
    const gotStr = JSON.stringify(got);
    const expectedStr = JSON.stringify(expected);
    if (gotStr !== expectedStr) {
      failures++;
      console.error(`SELF-TEST FAIL: ${label}\n  got:      ${gotStr}\n  expected: ${expectedStr}`);
    }
  };

  // 1. Passing case: all-unique prefixes -> no duplicates.
  check(
    "unique prefixes produce no duplicates",
    [...findDuplicatePrefixes(["001_a.sql", "002_b.sql", "003_c.sql"]).keys()],
    [],
  );

  // 2. Passing case: a letter-suffixed prefix is DISTINCT from its bare numeric form.
  check(
    "025 and 025b are distinct prefixes, not a collision",
    [...findDuplicatePrefixes(["025_a.sql", "025b_b.sql"]).keys()],
    [],
  );

  // 3. Passing case: a non-numeric-prefixed filename is ignored, not flagged.
  check(
    "a filename with no leading digit is out of scope",
    [...findDuplicatePrefixes(["scheduled_drop_deprecated_city_queues.sql", "001_a.sql"]).keys()],
    [],
  );

  // 4. Failing case: an exact-duplicate prefix IS caught.
  const dup = findDuplicatePrefixes(["300_a.sql", "300_b.sql", "301_c.sql"]);
  check("an exact-duplicate prefix is caught", [...dup.keys()], ["300"]);
  check("the duplicate's files are both reported", dup.get("300"), ["300_a.sql", "300_b.sql"]);

  // 5. Failing case: two letter-suffixed files sharing the SAME suffixed prefix collide too.
  check(
    "025b colliding with a second 025b is still a duplicate",
    [...findDuplicatePrefixes(["025b_a.sql", "025b_c.sql"]).keys()],
    ["025b"],
  );

  // 6. Allowlist filtering: only prefixes explicitly named in the allowlist are suppressed;
  // an allowlisted prefix does not suppress a DIFFERENT duplicated prefix beside it.
  const allowlist = new Set(["079"]);
  const mixed = findDuplicatePrefixes(["079_a.sql", "079_b.sql", "500_a.sql", "500_b.sql"]);
  const unallowlisted = [...mixed.keys()].filter((p) => !allowlist.has(p));
  check("allowlist suppresses only its own named prefix, not a sibling collision", unallowlisted, ["500"]);

  // 7. Registry-string extraction pulls only the quoted .sql entries, ignoring comments/prose.
  check(
    "registry filename extraction ignores comment prose",
    extractRegistryFilenames(
      '// 079  duplicate prefix, historical, see AUTHORING.md\nexport const MIGRATION_FILES = [\n  "001_a.sql",\n  "079_b.sql",\n];\n',
    ),
    ["001_a.sql", "079_b.sql"],
  );

  if (failures) process.exit(1);
  console.log(
    `self-test OK (7 predicate fixtures: unique/no-dup, letter-suffix distinctness, ` +
      `non-numeric-filename exclusion, exact-duplicate detection incl. letter-suffixed, ` +
      `allowlist scoping, registry-string extraction)`,
  );
  process.exit(0);
}
if (process.argv.includes("--self-test")) selfTest();

function main() {
  const dirFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const registrySource = fs.readFileSync(REGISTRY_FILE, "utf8");
  const registryFiles = extractRegistryFilenames(registrySource);

  const dirDupes = findDuplicatePrefixes(dirFiles);
  const registryDupes = findDuplicatePrefixes(registryFiles);

  let failed = false;
  const reportDupes = (label, dupes) => {
    for (const [prefix, files] of dupes) {
      if (ALLOWLISTED_DUPLICATE_PREFIXES.has(prefix)) {
        console.log(`[grandfathered] ${label} prefix "${prefix}" is duplicated by design: ${files.join(", ")}`);
        continue;
      }
      failed = true;
      console.error(`DUPLICATE MIGRATION PREFIX in ${label}: "${prefix}" -> ${files.join(", ")}`);
    }
  };

  reportDupes("filesystem (server/migrations/*.sql)", dirDupes);
  reportDupes("registry (migration-files.ts)", registryDupes);

  if (failed) {
    console.error(
      "\nA migration prefix must be unique. Rename the newer file to the next free number " +
        "(see server/migrations/AUTHORING.md and the 051 -> 060 rename precedent) rather than " +
        "adding it to ALLOWLISTED_DUPLICATE_PREFIXES — that allowlist is for pre-existing, " +
        "already-applied-in-production collisions only.",
    );
    process.exit(1);
  }
  console.log(
    `duplicate-migration-prefix guard OK (${dirFiles.length} files on disk, ${registryFiles.length} registry ` +
      `entries; ${ALLOWLISTED_DUPLICATE_PREFIXES.size} grandfathered prefix collision(s))`,
  );
}

if (require.main === module && !process.argv.includes("--self-test")) main();
