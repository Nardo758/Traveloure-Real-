#!/usr/bin/env node
/**
 * preview-fictional-vendors.cjs — READ-ONLY pre-launch check for the
 * `2026-09-19-demo-seeders-gated` defect. CLAUDE.md §13, §20, Locked Decision 2.
 *
 * WHY THIS EXISTS
 * ---------------
 * `server/seeds/phase-d-kyoto-vendors.seed.ts` inserted nine FICTIONAL businesses
 * — contact fields on the reserved `*.traveloure.test` domain, fabricated phone
 * numbers — as `provider_services` rows born `approvalStatus: "approved"` /
 * `status: "active"` (publicly bookable), and `server/index.ts` called it
 * unconditionally at boot in EVERY environment, production included. The same
 * class was found ungated in `server/seed-expert-services.ts`
 * (`seedMockExperts`, `seedProviderServices` — `@example.com` "experts" and
 * fabricated generic listings). The gate (`server/seeds/lib/demo-seed-gate.ts`,
 * ledger `2026-09-19-demo-seeders-gated`) stops NEW fictional rows from being
 * written to a production database. It does nothing about rows a PAST,
 * ungated boot may already have written there.
 *
 * Whether any exist on a given database, and what to do about them, is a DATA
 * decision — CLAUDE.md's decision-maker rule, not something this lane writes a
 * migration to delete on its own initiative. This script is the READ-ONLY
 * instrument an operator runs to find out, on the `preview-category-key-
 * repair.cjs` / `preview-ai-cost-tracking-shape.cjs` precedent: it reports,
 * a human reads the output, and ANY deletion is a separate, explicitly
 * ratified action.
 *
 * IT NEVER WRITES. `SET TRANSACTION READ ONLY` is issued before any query, and
 * there is no INSERT, UPDATE or DELETE anywhere in this file.
 *
 * WHAT IT REPORTS
 * ----------------
 * Every `provider_services` row whose owning `users.email`, or whose
 * `service_provider_forms.email` / `.website`, resolves to the reserved
 * `*.traveloure.test` domain — the exact marker phase-d-kyoto-vendors.seed.ts
 * (and the other traveloure.test-domain demo seeders) write. Reported
 * separately, as a SECOND, WIDER signal: every `provider_services` row whose
 * `created_via = 'seed'` — broader than the domain check (a seed-created row
 * need not use that domain, e.g. `server/seeds/phase-4-kyoto-fill.seed.ts`
 * attaches to a real-looking neighborhood without inventing a business at
 * all), so this second list is informational, not itself a finding of
 * fictional content.
 *
 * A THIRD signal (ledger `2026-09-20-dummy-seeder-gated-preview-widened`,
 * widened by `2026-09-20-california-demo-seed-gated`):
 * `provider_services` rows owned by the LEGACY `seedDatabase()` dummy
 * account (`users.email = 'admin@traveloure.com'`,
 * `server/routes/content.routes.ts` — now gated behind `demoSeedsAllowed()`,
 * but a row it wrote on a PAST, ungated boot is unaffected by that gate
 * going in), OR whose `provider_services.id` is not UUID-shaped (a
 * hand-entered `ps-*` batch this sweep also found — a row an operator typed
 * in rather than one any seeder minted), OR owned by the `scripts/seed-
 * california-full.ts` fictional provider — user id
 * `43352454-f6c0-46ff-a97a-2c027b67671f` ("Maria Santos"/"California Coastal
 * Experiences") OR any owner whose `service_provider_forms.email` resolves
 * to `@californiacoastal.com`, the marker that hand-run seeder writes and
 * which is now gated (see `server/seeds/lib/demo-seed-gate.ts`) but, exactly
 * like the other two markers in this section, unaffected for rows a PAST,
 * ungated run already wrote. THESE ARE HAND-ENTERED-OR-HAND-RUN-CONTENT
 * SIGNALS, NOT THE FICTIONAL-SEEDER MARKER the first section reports: a row
 * owned by any of these, or carrying a non-UUID id, is not necessarily
 * fictional, so it is reported informationally — like the
 * `created_via='seed'` counts above — and does not affect this script's
 * exit code.
 *
 * EXIT CODES. 0 = no `*.traveloure.test`-domain provider_services row found —
 *                 clean as far as this check can tell.
 *             1 = at least one found. Read the output before launch; this is
 *                 not itself a "fail the build" condition (this script is not
 *                 wired into CI) — it is the pre-launch human check.
 *             2 = could not connect or could not query.
 *
 * NEGATIVE SPACE (§18d) — what this preview does NOT tell you
 * -------------------------------------------------------------
 *   - It matches on the reserved `*.traveloure.test` domain and on
 *     `created_via = 'seed'` ONLY. A fictional row inserted by hand, by a
 *     script that used a different fake domain, or before `created_via`
 *     existed (migration 254) and never backfilled, is invisible to it.
 *   - It reads `provider_services` joined to `users` and
 *     `service_provider_forms` only. It does not check `local_expert_forms`
 *     (the `seedMockExperts` fictional-expert rows) — that is a DIFFERENT
 *     table and a separate check would be needed for it; recorded here as a
 *     gap, not fixed by this script.
 *   - It does not check whether a matched row has ever been booked, reviewed,
 *     or paid — only that it exists and is (or was) publicly approved.
 *   - It says nothing about how a matched row got there (this ungated boot
 *     path vs. a manual `tsx server/seeds/phase-d-kyoto-vendors.seed.ts` run
 *     vs. something else) — only that it exists now.
 *   - THE THIRD SECTION (`admin@traveloure.com` / non-UUID `id` / the
 *     `seed-california-full.ts` owner id or `@californiacoastal.com` form
 *     email) matches on exactly those named conditions. A hand-entered or
 *     hand-run-fictional row under a DIFFERENT owner account or contact
 *     domain, or one whose id happens to be UUID-shaped by coincidence, is
 *     invisible to it — same stated limit as the first section's domain
 *     match, one signal over.
 *
 * USAGE
 * -----
 *   node scripts/preview-fictional-vendors.cjs "<DATABASE_URL>"
 *   # or: DATABASE_URL=... node scripts/preview-fictional-vendors.cjs
 *   #     --json    (machine-readable; the same findings)
 */

const TRAVELOURE_TEST_DOMAIN_SQL = `
  SELECT
    ps.id                AS service_id,
    ps.service_name       AS service_name,
    ps.approval_status    AS approval_status,
    ps.status             AS status,
    ps.created_via        AS created_via,
    ps.created_at         AS created_at,
    u.id                  AS user_id,
    u.email               AS user_email,
    spf.business_name     AS business_name,
    spf.email             AS form_email,
    spf.website           AS form_website
  FROM provider_services ps
  JOIN users u ON u.id = ps.user_id
  LEFT JOIN service_provider_forms spf ON spf.user_id = ps.user_id
  WHERE u.email ILIKE '%.traveloure.test'
     OR u.email ILIKE '%@traveloure.test'
     OR spf.email ILIKE '%.traveloure.test'
     OR spf.email ILIKE '%@traveloure.test'
     OR spf.website ILIKE '%traveloure.test%'
  ORDER BY ps.created_at ASC;
`;

const CREATED_VIA_SEED_COUNT_SQL = `
  SELECT approval_status, status, count(*)::int AS n
  FROM provider_services
  WHERE created_via = 'seed'
  GROUP BY approval_status, status
  ORDER BY approval_status, status;
`;

// THIRD signal (ledger 2026-09-20-dummy-seeder-gated-preview-widened, widened by
// 2026-09-20-california-demo-seed-gated): hand-entered / hand-run-fictional rows, not
// the fictional-seeder marker — see the module header's WHAT IT REPORTS / NEGATIVE SPACE.
const CALIFORNIA_DEMO_OWNER_ID = "43352454-f6c0-46ff-a97a-2c027b67671f"; // "Maria Santos"
const HAND_ENTERED_DEMO_ROWS_SQL = `
  SELECT
    ps.id                AS service_id,
    ps.service_name       AS service_name,
    ps.status             AS status,
    ps.approval_status    AS approval_status,
    u.email               AS user_email
  FROM provider_services ps
  JOIN users u ON u.id = ps.user_id
  LEFT JOIN service_provider_forms spf ON spf.user_id = ps.user_id
  WHERE u.email = 'admin@traveloure.com'
     OR ps.id !~ '^[0-9a-f-]{36}$'
     OR ps.user_id = '${CALIFORNIA_DEMO_OWNER_ID}'
     OR spf.email ILIKE '%@californiacoastal.com'
  ORDER BY ps.created_at ASC;
`;

function formatRow(r) {
  const contact = [r.user_email, r.form_email, r.form_website].filter(Boolean).join(" / ");
  return (
    `  [${r.approval_status}/${r.status}] "${r.service_name}"` +
    ` (service ${r.service_id}, user ${r.user_id})\n` +
    `      business: ${r.business_name ?? "<none>"}  contact: ${contact || "<none>"}\n` +
    `      created_via=${r.created_via ?? "<null>"}  created_at=${r.created_at ?? "<null>"}`
  );
}

function formatHandEnteredRow(r) {
  return `  ${r.service_id} · "${r.service_name}" · status=${r.status} · approval_status=${r.approval_status} · owner=${r.user_email}`;
}

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const url = argv.find((a) => !a.startsWith("--")) || process.env.DATABASE_URL;
  if (!url) {
    console.error('No database URL. Usage: node scripts/preview-fictional-vendors.cjs "<DATABASE_URL>"');
    process.exit(2);
  }

  const { Client } = require("pg");
  const client = new Client({ connectionString: url });
  let vendorRows;
  let seedCounts;
  let handEnteredRows;
  try {
    await client.connect();
    // Belt and braces: this session may not write, whatever a future edit above says.
    await client.query("SET TRANSACTION READ ONLY");
    vendorRows = (await client.query(TRAVELOURE_TEST_DOMAIN_SQL)).rows;
    seedCounts = (await client.query(CREATED_VIA_SEED_COUNT_SQL)).rows;
    handEnteredRows = (await client.query(HAND_ENTERED_DEMO_ROWS_SQL)).rows;
  } catch (err) {
    console.error(`[fictional-vendors] query failed: ${err.message}`);
    process.exit(2);
  } finally {
    await client.end().catch(() => {});
  }

  const ok = vendorRows.length === 0;

  if (json) {
    console.log(
      JSON.stringify(
        { travelourreTestDomainRows: vendorRows, createdViaSeedCounts: seedCounts, handEnteredDemoRows: handEnteredRows, ok },
        null,
        2,
      ),
    );
    process.exit(ok ? 0 : 1);
  }

  console.log(
    "[fictional-vendors] READ-ONLY scan of provider_services for the *.traveloure.test contact-domain " +
      "marker (ledger 2026-09-19-demo-seeders-gated). Nothing was written.\n",
  );

  if (ok) {
    console.log(
      "NONE FOUND. No provider_services row on this database resolves to the reserved " +
        "*.traveloure.test contact domain — clean as far as this check can tell.",
    );
  } else {
    console.error(
      `FOUND ${vendorRows.length} provider_services row(s) whose owner or provider-form contact ` +
        "resolves to *.traveloure.test — fictional demo content, some of it publicly \"approved\"/\"active\":\n",
    );
    for (const r of vendorRows) console.error(formatRow(r));
    console.error(
      "\nThis is a DATA question for the decision-maker (CLAUDE.md's decision-maker rule), not something " +
        "this script or the gate it checks for acts on. Do not delete these rows without explicit " +
        "ratification — record the decision the same way this ledger row does.",
    );
  }

  console.log(
    `\nInformational — provider_services rows with created_via='seed' (a WIDER, non-fictional-implying ` +
      `signal; see this file's NEGATIVE SPACE section): ${seedCounts.length === 0 ? "none" : ""}`,
  );
  for (const r of seedCounts) {
    console.log(`  [${r.approval_status}/${r.status}] ${r.n}`);
  }

  console.log(
    `\nInformational — hand-entered/hand-run demo signal (ledger 2026-09-20-dummy-seeder-gated-preview-widened, ` +
      `widened by 2026-09-20-california-demo-seed-gated): provider_services rows owned by the legacy ` +
      `'admin@traveloure.com' dummy account, whose id is not UUID-shaped, owned by the seed-california-full.ts ` +
      `fictional provider (user ${CALIFORNIA_DEMO_OWNER_ID}), or whose provider-form contact resolves to ` +
      `@californiacoastal.com. NOT the fictional-seeder marker above — see this file's NEGATIVE SPACE section. ` +
      `${handEnteredRows.length === 0 ? "none found." : `${handEnteredRows.length} found:`}`,
  );
  for (const r of handEnteredRows) {
    console.log(formatHandEnteredRow(r));
  }

  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`[fictional-vendors] ${err.message}`);
  process.exit(2);
});
