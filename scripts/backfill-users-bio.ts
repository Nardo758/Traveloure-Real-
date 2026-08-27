/**
 * One-time backfill: copy the role-form bio into users.bio where users.bio is empty
 * (intake-fixes C6, decision-maker ratified Aug 27 2026).
 *
 * Why: the public storefront (/s/:handle) and the /api/experts browse listing read
 * users.bio, but onboarding only ever wrote the role form (local_expert_forms.bio /
 * service_provider_forms.description) until intake-fixes C1/C2 added the mirror. Every
 * earner who onboarded before that renders a blank bio until they happen to open the
 * profile editor. This script fixes the existing rows; C1/C2 keep new ones correct.
 *
 * Sources, keyed on the role-matching form (audit Part 3):
 *   • expert roles (any user with a local_expert_forms row, except service providers)
 *       ← local_expert_forms.bio
 *   • service providers (users.role = 'service_provider' with a service_provider_forms row)
 *       ← service_provider_forms.description
 *
 * Safety / correctness design (ratified constraints):
 *   • REPORT-ONLY BY DEFAULT — prints would-write counts + sample rows. Nothing is
 *     written without --apply.
 *   • PROD-REFUSING BY DEFAULT — if DATABASE_URL does not point at localhost, --apply
 *     refuses unless --allow-prod is ALSO passed. Report-only mode is always allowed.
 *   • Idempotent by construction: only fills users.bio that is NULL/blank, and the
 *     UPDATE re-checks that predicate (concurrency-safe — a user who saves a bio in the
 *     editor mid-run is never overwritten; the sibling-backfill posture).
 *   • Never writes an empty string (§13 — a blank form bio is skipped, not copied).
 *   • Operator-run only — never wired into startup.
 *
 * Usage:
 *   npx tsx scripts/backfill-users-bio.ts             # report only
 *   npx tsx scripts/backfill-users-bio.ts --apply     # write (dev/local)
 *   npx tsx scripts/backfill-users-bio.ts --apply --allow-prod   # write against prod
 */

import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const ALLOW_PROD = process.argv.includes("--allow-prod");

function looksLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (APPLY && !looksLocal(dbUrl) && !ALLOW_PROD) {
    console.error(
      "[backfill-users-bio] REFUSED: --apply against a non-local DATABASE_URL requires --allow-prod.\n" +
        "  Run without --apply first and review the report.",
    );
    process.exit(2);
  }

  // Pass 1 — expert roles: local_expert_forms.bio → users.bio.
  // Keyed on the form's existence (all expert roles share it); service providers are
  // excluded here so a dual-form account takes its role-matching source in pass 2.
  const expertCandidates = await db.execute(sql`
    SELECT u.id, u.first_name, u.last_name, u.role, btrim(f.bio) AS source_bio
    FROM users u
    JOIN local_expert_forms f ON f.user_id = u.id
    WHERE (u.bio IS NULL OR btrim(u.bio) = '')
      AND f.bio IS NOT NULL AND btrim(f.bio) <> ''
      AND u.role IS DISTINCT FROM 'service_provider'
    ORDER BY u.created_at
  `);

  // Pass 2 — providers: service_provider_forms.description → users.bio.
  const providerCandidates = await db.execute(sql`
    SELECT u.id, u.first_name, u.last_name, u.role, btrim(p.description) AS source_bio
    FROM users u
    JOIN service_provider_forms p ON p.user_id = u.id
    WHERE (u.bio IS NULL OR btrim(u.bio) = '')
      AND p.description IS NOT NULL AND btrim(p.description) <> ''
      AND u.role = 'service_provider'
    ORDER BY u.created_at
  `);

  const passes = [
    { name: "expert (local_expert_forms.bio)", rows: expertCandidates.rows },
    { name: "provider (service_provider_forms.description)", rows: providerCandidates.rows },
  ] as const;

  let totalWritten = 0;
  for (const pass of passes) {
    console.log(`\n=== ${pass.name}: ${pass.rows.length} candidate(s) ===`);
    for (const row of pass.rows.slice(0, 10)) {
      const r = row as Record<string, unknown>;
      console.log(
        `  ${r.id}  ${r.first_name ?? ""} ${r.last_name ?? ""}  role=${r.role}  bio(${String(r.source_bio).length} chars): ${String(r.source_bio).slice(0, 60)}…`,
      );
    }
    if (pass.rows.length > 10) console.log(`  … and ${pass.rows.length - 10} more`);

    if (!APPLY) continue;
    for (const row of pass.rows) {
      const r = row as Record<string, unknown>;
      // Re-check the empty predicate in the UPDATE itself: a bio saved between the
      // report SELECT and this write wins, and the row is skipped (re-run to re-report).
      const res = await db.execute(sql`
        UPDATE users SET bio = ${String(r.source_bio)}
        WHERE id = ${String(r.id)} AND (bio IS NULL OR btrim(bio) = '')
      `);
      totalWritten += res.rowCount ?? 0;
    }
  }

  if (APPLY) {
    console.log(`\n[backfill-users-bio] wrote ${totalWritten} row(s).`);
  } else {
    console.log(
      `\n[backfill-users-bio] REPORT ONLY — ${passes[0].rows.length + passes[1].rows.length} row(s) would be written. Re-run with --apply to write.`,
    );
  }
  await pool.end();
}

main().catch((e) => {
  console.error("[backfill-users-bio] failed:", e);
  process.exit(1);
});
