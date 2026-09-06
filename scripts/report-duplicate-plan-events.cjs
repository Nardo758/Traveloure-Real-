#!/usr/bin/env node
/**
 * report-duplicate-plan-events.cjs — a READ-ONLY census of plans holding the same event twice.
 * Ledger `2026-09-06-event-mint-dedupe`; CLAUDE.md Locked Decisions 29 / 30 (b) / 33.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until this lane, two writers created a plan's events in the same click and neither could see
 * the other: the server-side pre-trip pen drain inside `storage.createTrip`, and the plan modal's
 * own post-mint commit — whose on-screen rows were seeded from that very pen. A traveler who
 * ticked "Ceremony" and "Reception" got four rows. The code fix stops NEW duplicates. It says
 * nothing about the rows already on disk.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * IT NEVER WRITES. No DELETE, no UPDATE, no migration. Which of a traveler's rows — if any —
 * should go is a DATA decision that belongs to the decision-maker, and a row this bug created is
 * indistinguishable in the schema from a second event a traveler deliberately named the same
 * thing (there is no UNIQUE index on `user_experiences` and this lane adds none: a constraint here
 * is the publish-time drizzle-push failure the Coordination Prevention rules warn about). So this
 * script COUNTS and LISTS, and stops.
 *
 * WHAT IT LOOKS FOR
 * -----------------
 * Two or more `user_experiences` rows on the SAME trip whose titles match case-insensitively —
 * the identity the platform already uses for an event inside a plan (`eventsNotYetOnPlan`,
 * shared/plan-events.ts) — where at least two of them were created WITHIN THE SAME MINUTE. The
 * minute window is what distinguishes this defect's signature (drain-then-commit, milliseconds
 * apart, in one click) from a traveler adding a second "Dinner" a day later, which is theirs to
 * have. Widen it with --window-minutes if you want the broader picture; the narrow default is the
 * honest one.
 *
 * USAGE
 * -----
 *   node scripts/report-duplicate-plan-events.cjs "<DATABASE_URL>"
 *   # or: DATABASE_URL=... node scripts/report-duplicate-plan-events.cjs
 *   #     --window-minutes N   (default 1)
 *   #     --trip <tripId>      (report one plan only)
 *   #     --json               (machine-readable; the same rows)
 *
 * Exit 0 always when the query ran — a duplicate is a finding to report, not a build failure.
 * Exit 2 if it could not connect or query.
 */

const { Client } = require("pg");

function parseArgs(argv) {
  const args = { url: null, windowMinutes: 1, trip: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--window-minutes") args.windowMinutes = Number(argv[++i]);
    else if (a === "--trip") args.trip = argv[++i];
    else if (!a.startsWith("--") && !args.url) args.url = a;
  }
  if (!Number.isFinite(args.windowMinutes) || args.windowMinutes < 0) {
    throw new Error("--window-minutes must be a non-negative number");
  }
  return args;
}

/**
 * The census. One self-join over `user_experiences`, keyed on (trip_id, lower(trim(title))), with
 * the pair's creation times inside the window. `trip_id IS NULL` rows are excluded: an experience
 * with no plan is not an event inside a plan (Locked Decision 29) and has no trip to duplicate on.
 */
const SQL = `
  WITH pairs AS (
    SELECT
      a.trip_id,
      lower(btrim(a.title))                        AS title_key,
      count(*)                                     AS row_count,
      min(a.created_at)                            AS first_created_at,
      max(a.created_at)                            AS last_created_at,
      array_agg(a.id ORDER BY a.created_at)        AS ids,
      max(a.title)                                 AS sample_title
    FROM user_experiences a
    WHERE a.trip_id IS NOT NULL
      AND a.title IS NOT NULL
      AND btrim(a.title) <> ''
      AND ($2::text IS NULL OR a.trip_id = $2::text)
    GROUP BY a.trip_id, lower(btrim(a.title))
    HAVING count(*) > 1
  )
  SELECT
    p.*,
    (p.row_count - 1)                              AS extra_rows,
    t.title                                        AS trip_title,
    t.destination                                  AS trip_destination,
    t.user_id                                      AS trip_user_id
  FROM pairs p
  LEFT JOIN trips t ON t.id = p.trip_id
  WHERE p.last_created_at - p.first_created_at <= ($1::int * interval '1 minute')
  ORDER BY p.last_created_at DESC
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = args.url || process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "No database URL. Usage: node scripts/report-duplicate-plan-events.cjs \"<DATABASE_URL>\"",
    );
    process.exit(2);
  }

  const client = new Client({ connectionString: url });
  let rows;
  try {
    await client.connect();
    // Belt and braces: this session may not write, whatever a future edit to the SQL above says.
    await client.query("SET TRANSACTION READ ONLY");
    const res = await client.query(SQL, [args.windowMinutes, args.trip]);
    rows = res.rows;
  } catch (err) {
    console.error(`[duplicate-plan-events] query failed: ${err.message}`);
    process.exit(2);
  } finally {
    await client.end().catch(() => {});
  }

  const extra = rows.reduce((n, r) => n + Number(r.extra_rows), 0);
  const trips = new Set(rows.map((r) => r.trip_id));

  if (args.json) {
    console.log(JSON.stringify({ windowMinutes: args.windowMinutes, groups: rows, extra }, null, 2));
    return;
  }

  console.log(
    `[duplicate-plan-events] ${rows.length} duplicated (trip, title) group(s) across ${trips.size} plan(s); ` +
      `${extra} row(s) beyond one per title, created within ${args.windowMinutes} minute(s) of each other.`,
  );
  if (rows.length === 0) {
    console.log("Nothing to report. NOTE: this window is deliberately narrow — see the header.");
    return;
  }
  for (const r of rows) {
    console.log(
      `  trip ${r.trip_id} (${r.trip_title ?? "untitled"} · ${r.trip_destination ?? "no destination"}) ` +
        `"${r.sample_title}" ×${r.row_count} → ids ${r.ids.join(", ")} ` +
        `[${new Date(r.first_created_at).toISOString()} … ${new Date(r.last_created_at).toISOString()}]`,
    );
  }
  console.log(
    "\nNo rows were changed. Cleanup is a DATA decision for the decision-maker: a duplicate this " +
      "defect created and a second event a traveler named the same thing look identical here.",
  );
}

main().catch((err) => {
  console.error(`[duplicate-plan-events] ${err.message}`);
  process.exit(2);
});
