#!/usr/bin/env node
/**
 * preview-offering-key-id-drop.cjs — the READ-ONLY production go/no-go for migration 295.
 * Ledger `2026-09-15-offering-key-id-drop` (lane 2 of `2026-09-12-offering-key-is-canonical`);
 * CLAUDE.md ruling 31's amendment, §13, `docs/RELEASE.md` step 3.
 *
 * WHY THIS EXISTS
 * ---------------
 * Migration 295 DROPS `provider_services.expert_offering_type_id`. A drop is unrecoverable, and a
 * stamped migration never re-runs — so a row that still answers ONLY through the uuid loses its
 * offering permanently the moment the column goes, and on the money path that silently stops a
 * Booking Concierge line being charged its facilitation fee (nothing throws; the quote and the
 * charge simply agree that the listing sells nothing in particular).
 *
 * Migration 293 copied the uuid's answer onto `expert_offering_type_key` for every row that
 * carried one. Whether it has actually REACHED a given database, and whether it found a catalog row
 * to join for every listing, are facts about that database — not about these files. The author of
 * 295 cannot see production. So this script is run against the real database BEFORE 295 is
 * published, and its output is read by a human.
 *
 * IT NEVER WRITES. `SET TRANSACTION READ ONLY` is issued before any query, and there is no INSERT,
 * UPDATE, DELETE or ALTER in the file. Node built-ins plus `pg`, nothing else.
 *
 * WHAT IT REPORTS
 * ---------------
 *   (1) THE BLOCKING COUNT — rows the drop would silence:
 *         SELECT count(*) FROM provider_services
 *          WHERE expert_offering_type_id IS NOT NULL AND expert_offering_type_key IS NULL;
 *       ZERO is the only publishable answer. A non-zero count usually means migration 293 has not
 *       applied on this database yet; it can also mean a listing's legacy uuid points at an
 *       `expert_offering_types` row that has since been deleted, in which case 293 joined nothing
 *       and there is no answer to save (§13 — that row is honestly unclassified, and this script
 *       says which case it is rather than guessing).
 *
 *   (2) THE DISAGREEMENTS — rows where the stored key and the legacy uuid name DIFFERENT
 *       offerings. NOT BLOCKING, and deliberately so: the ruling makes the key canonical, so the
 *       platform already answers by the key and the drop changes nothing about these rows. They
 *       are printed because a human should see what is about to become unreadable, before it is.
 *
 * EXIT CODES. 0 = the blocking count is zero (publishable as far as this database can tell).
 *             1 = the blocking count is NON-ZERO — do not publish 295.
 *             2 = could not connect or query, or the column is missing in a way that means this
 *                 preview answered nothing. Never treat 2 as a pass.
 * A non-empty DISAGREEMENTS list is NOT an error exit — it is a read.
 *
 * NEGATIVE SPACE (§18d) — what this preview does NOT tell you
 * -----------------------------------------------------------
 *   • It checks ONE column pair on ONE table. It says nothing about anything else migration 295's
 *     release carries, and nothing about whether 295 is registered or the declaration was removed
 *     (the chain-integrity test and the offering-activation-gate pins are those instruments).
 *   • It cannot tell you whether a listing's offering is CORRECT — only whether the key can answer
 *     wherever the uuid could. A row with NEITHER identifier is untouched by all of this and is
 *     not counted: it never named an offering, which stays true after the drop.
 *   • It resolves no disagreement and suggests no winner. Which of the two a disagreeing row
 *     SHOULD have said is a human's call, and the ruling has already made it (the key wins); a
 *     suggestion here would be a second authority.
 *   • Run on a database where the column is ALREADY dropped it reports exactly that and exits 0 —
 *     lane 2 has landed there and there is nothing left to lose.
 *
 * USAGE
 * -----
 *   node scripts/preview-offering-key-id-drop.cjs "<DATABASE_URL>"
 *   # or: DATABASE_URL=... node scripts/preview-offering-key-id-drop.cjs
 *   #     --json    (machine-readable; the same findings)
 */

const { Client } = require("pg");

const LEGACY_COLUMN = "expert_offering_type_id";
const CANONICAL_COLUMN = "expert_offering_type_key";

/** Which of the two columns this database actually carries. */
const COLUMNS_SQL = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'provider_services'
    AND column_name IN ('${LEGACY_COLUMN}', '${CANONICAL_COLUMN}')
`;

/** (1) THE BLOCKING QUERY, verbatim from the punchlist entry and migration 295's header. */
const BLOCKING_SQL = `
  SELECT count(*)::int AS count
  FROM provider_services
  WHERE expert_offering_type_id IS NOT NULL
    AND expert_offering_type_key IS NULL
`;

/**
 * The same blocking set, split by WHY the key is empty — a legacy uuid whose catalog row still
 * exists (293 had an answer to copy and has not run here) versus one that is orphaned (293 would
 * copy nothing; there is no answer to save). Different facts, said separately (§13).
 */
const BLOCKING_DETAIL_SQL = `
  SELECT ps.id,
         ps.expert_offering_type_id AS legacy_id,
         eot.offering_type_key      AS resolvable_key
  FROM provider_services ps
  LEFT JOIN expert_offering_types eot ON eot.id = ps.expert_offering_type_id
  WHERE ps.expert_offering_type_id IS NOT NULL
    AND ps.expert_offering_type_key IS NULL
  ORDER BY ps.id
  LIMIT 200
`;

/** (2) THE NON-BLOCKING READ, verbatim from the punchlist entry. */
const DISAGREEMENT_SQL = `
  SELECT ps.id,
         ps.expert_offering_type_key,
         eot.offering_type_key AS legacy_key
  FROM provider_services ps
  JOIN expert_offering_types eot ON eot.id = ps.expert_offering_type_id
  WHERE ps.expert_offering_type_key IS NOT NULL
    AND ps.expert_offering_type_key <> eot.offering_type_key
  ORDER BY ps.id
`;

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const url = argv.find((a) => !a.startsWith("--")) || process.env.DATABASE_URL;
  if (!url) {
    console.error(
      'No database URL. Usage: node scripts/preview-offering-key-id-drop.cjs "<DATABASE_URL>"',
    );
    process.exit(2);
  }

  const client = new Client({ connectionString: url });
  let columns;
  let blocking = null;
  let blockingRows = [];
  let disagreements = [];
  try {
    await client.connect();
    // Belt and braces: this session may not write, whatever a future edit above says.
    await client.query("SET TRANSACTION READ ONLY");
    columns = new Set((await client.query(COLUMNS_SQL)).rows.map((r) => r.column_name));

    if (!columns.has(CANONICAL_COLUMN)) {
      console.error(
        `[offering-key-id-drop] provider_services.${CANONICAL_COLUMN} is ABSENT — migration 292 has ` +
          "not applied on this database. Migration 295 must not be published here: there is no " +
          "canonical column for the drop to leave behind.",
      );
      process.exit(2);
    }
    if (!columns.has(LEGACY_COLUMN)) {
      const msg =
        `[offering-key-id-drop] provider_services.${LEGACY_COLUMN} is ALREADY GONE on this ` +
        "database — migration 295 has applied here. Nothing to check, nothing to lose.";
      if (json) console.log(JSON.stringify({ legacyColumnPresent: false, blocking: 0, disagreements: [] }, null, 2));
      else console.log(msg);
      process.exit(0);
    }

    blocking = (await client.query(BLOCKING_SQL)).rows[0].count;
    if (blocking > 0) blockingRows = (await client.query(BLOCKING_DETAIL_SQL)).rows;
    disagreements = (await client.query(DISAGREEMENT_SQL)).rows;
  } catch (err) {
    console.error(`[offering-key-id-drop] query failed: ${err.message}`);
    process.exit(2);
  } finally {
    await client.end().catch(() => {});
  }

  if (json) {
    console.log(JSON.stringify({ legacyColumnPresent: true, blocking, blockingRows, disagreements }, null, 2));
    process.exit(blocking > 0 ? 1 : 0);
  }

  console.log(
    "[offering-key-id-drop] READ-ONLY preview of migration 295 " +
      "(DROP provider_services.expert_offering_type_id). Nothing was written.\n",
  );
  console.log("(1) BLOCKING — rows carrying the legacy uuid with NO canonical key:");
  console.log(
    "    SELECT count(*) FROM provider_services\n" +
      "     WHERE expert_offering_type_id IS NOT NULL AND expert_offering_type_key IS NULL;",
  );
  console.log(`    => ${blocking}\n`);
  if (blocking > 0) {
    const copyable = blockingRows.filter((r) => r.resolvable_key);
    const orphaned = blockingRows.filter((r) => !r.resolvable_key);
    console.log(
      `    Of the first ${blockingRows.length} listed: ${copyable.length} have a catalog row to copy ` +
        `from (migration 293 has NOT run here — run it first), ${orphaned.length} point at no catalog ` +
        "row at all (293 can copy nothing; there is no offering to save — and migration 057's FK " +
        "should make that impossible, so escalate rather than publish).",
    );
    for (const r of blockingRows) {
      console.log(
        `      ${String(r.id).padEnd(38)} legacy_id=${String(r.legacy_id)} ` +
          `${r.resolvable_key ? `=> would become "${r.resolvable_key}"` : "=> ORPHANED (no catalog row)"}`,
      );
    }
    console.log("");
  }

  console.log("(2) NOT BLOCKING — rows where the stored key and the legacy uuid name DIFFERENT offerings:");
  if (disagreements.length === 0) {
    console.log("    none.\n");
  } else {
    console.log(
      `    ${disagreements.length} row(s). The key is canonical by ruling, so the platform already ` +
        "answers by it and the drop changes none of these answers — read them before the uuid is gone.",
    );
    for (const r of disagreements) {
      console.log(
        `      ${String(r.id).padEnd(38)} key="${r.expert_offering_type_key}"  legacy_key="${r.legacy_key}"`,
      );
    }
    console.log("");
  }

  if (blocking > 0) {
    console.error(
      `STOP: ${blocking} row(s) would lose their offering. Migration 295 must NOT be published ` +
        "against this database. Apply migration 293 first (it is idempotent), re-run this preview, " +
        "and escalate any row that stays blocked because its catalog row was deleted.",
    );
    process.exit(1);
  }
  console.log(
    "OK: every row that names an offering names it by the canonical key. Migration 295 loses " +
      "nothing on this database.",
  );
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[offering-key-id-drop] ${err.message}`);
    process.exit(2);
  });
}
