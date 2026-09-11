/**
 * READ-ONLY classification audit for the Offering Commerce contract's Phase 0a
 * (`docs/superpowers/specs/2026-09-08-offering-commerce-trip-slip-contract-design.md`).
 *
 * WHY THIS EXISTS. The design document's §4.3 snapshot was taken against a DEVELOPMENT database, and
 * the judgement it feeds — "immediately enforcing the proposed contract would deactivate or
 * misclassify most current listings" — is only as good as the distribution it was measured on. This
 * script re-runs that measurement against whatever `DATABASE_URL` points at, so the production
 * re-run is one command rather than a session.
 *
 * IT RESOLVES BEFORE IT CLASSIFIES (the §4.3 amendment, 2026-09-11). `provider_services.booking_mode`
 * is NULLABLE BY DESIGN: NULL means "unset", and the authority is `resolveBookingMode`, which reads
 * the account's `service_provider_forms.instant_booking` flag. A count of the raw column reports
 * ~every row as unset and is the wrong number to plan from. This script therefore IMPORTS the real
 * resolver from `shared/schema.ts` rather than restating the rule (§18 rule 1 — a second copy of a
 * derivation is how the audit and the product start disagreeing), and reports BOTH figures: what the
 * column stores, and what a reader actually sees.
 *
 * NEGATIVE SPACE, stated because a green run means green-within-stated-bounds (§18d):
 *   · It reads `provider_services` ONLY. Expert listings, ready-made plans, affiliate rows and the
 *     legacy `bookings` rail are out of scope and are NOT counted here.
 *   · It measures the CURRENT columns. It does not resolve the proposed commerce archetype, which
 *     does not exist yet — that is Phase 1's resolver, and this script is what tells you whether
 *     Phase 1 can classify the real catalog before you write it.
 *   · "Outside the declared set" is a vocabulary observation, not a defect: `service_type` and
 *     `delivery_method` are app-enforced with no DB CHECK (the publish-trap posture), so a value
 *     outside the enum is structurally possible by design and is exactly what needs deciding.
 *   · It writes NOTHING. No UPDATE, no INSERT, no DDL.
 *
 * Run:  DATABASE_URL=<url> npx tsx scripts/audit-offering-classification.ts
 *       add --json for a machine-readable dump.
 */
import { Pool } from "pg";
import {
  resolveBookingMode,
  bookingModeEnum,
  serviceTypeEnum,
  deliveryMethodEnum,
} from "../shared/schema";

const JSON_OUT = process.argv.includes("--json");

type Row = {
  service_type: string | null;
  delivery_method: string | null;
  price_type: string | null;
  booking_mode: string | null;
  account_instant_booking: boolean | null;
};

function tally<T extends string | number | symbol>(rows: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r)] = (out[String(r)] ?? 0) + 1;
  return out;
}

function sortedEntries(rec: Record<string, number>): [string, number][] {
  return Object.entries(rec).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required. This script only reads; it never writes.");
    process.exit(2);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // The population the contract governs: a seller-specific listing a traveler can actually reach.
  // Catalog vocabulary rows are NOT listings (§22.1) and are not in this table.
  const { rows } = await pool.query<Row>(`
    SELECT ps.service_type,
           ps.delivery_method,
           ps.price_type,
           ps.booking_mode,
           spf.instant_booking AS account_instant_booking
      FROM provider_services ps
      LEFT JOIN service_provider_forms spf ON spf.user_id = ps.user_id
     WHERE ps.status = 'active'
       AND ps.approval_status = 'approved'
  `);
  await pool.end();

  const total = rows.length;

  // ── Booking mode: the column, then the answer a reader actually gets ───────────────────────────
  const storedSet = rows.filter((r) => r.booking_mode != null).length;
  const resolved = rows.map((r) => resolveBookingMode(r.booking_mode, r.account_instant_booking));
  const resolvedCounts = tally(resolved);
  // A row whose account row is missing entirely resolves to "request" (the resolver's honest default),
  // which is a different fact from a provider who chose "request". Counted so it cannot hide.
  const noAccountRow = rows.filter((r) => r.account_instant_booking == null && r.booking_mode == null).length;

  // ── Vocabulary conformance: app-enforced sets, no DB CHECK ────────────────────────────────────
  const declaredServiceTypes = new Set<string>(serviceTypeEnum as readonly string[]);
  const declaredDelivery = new Set<string>(deliveryMethodEnum as readonly string[]);
  const offVocabType = rows.filter((r) => r.service_type != null && !declaredServiceTypes.has(r.service_type));
  const offVocabDelivery = rows.filter((r) => r.delivery_method != null && !declaredDelivery.has(r.delivery_method));
  const missingType = rows.filter((r) => r.service_type == null).length;
  const missingDelivery = rows.filter((r) => r.delivery_method == null).length;
  const missingPrice = rows.filter((r) => r.price_type == null).length;

  const combos = tally(
    rows.map((r) => `${r.service_type ?? "∅"} + ${r.delivery_method ?? "∅"} + ${r.price_type ?? "∅"}`),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    population: "provider_services, status=active AND approval_status=approved",
    total,
    bookingMode: {
      storedOnTheRow: storedSet,
      unsetOnTheRow: total - storedSet,
      resolvedByResolveBookingMode: resolvedCounts,
      unsetAndNoAccountRow: noAccountRow,
    },
    vocabulary: {
      declaredServiceTypes: [...declaredServiceTypes],
      offVocabularyServiceTypeRows: offVocabType.length,
      offVocabularyServiceTypeValues: sortedEntries(tally(offVocabType.map((r) => r.service_type!))),
      offVocabularyDeliveryRows: offVocabDelivery.length,
      offVocabularyDeliveryValues: sortedEntries(tally(offVocabDelivery.map((r) => r.delivery_method!))),
      rowsMissingServiceType: missingType,
      rowsMissingDeliveryMethod: missingDelivery,
      rowsMissingPriceType: missingPrice,
    },
    largestCombinations: sortedEntries(combos).slice(0, 12),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\nOffering classification audit — ${report.generatedAt}`);
  console.log(`Population: ${report.population}`);
  console.log(`Active, approved provider listings: ${total}\n`);

  console.log("BOOKING MODE");
  console.log(`  stored on the row .......... ${storedSet}`);
  console.log(`  unset on the row ........... ${total - storedSet}   (NULL is the designed default)`);
  console.log("  resolved, i.e. what a reader actually sees:");
  for (const m of bookingModeEnum) console.log(`    ${m.padEnd(8)} ${resolvedCounts[m] ?? 0}`);
  if (noAccountRow) {
    console.log(`  of the unset rows, ${noAccountRow} have NO provider form row at all —`);
    console.log(`    they resolve to "request" as the honest default, which is not a provider's choice.`);
  }

  console.log("\nVOCABULARY (app-enforced, no DB CHECK — an off-set value is possible by design)");
  console.log(`  service_type outside the declared ${declaredServiceTypes.size}: ${offVocabType.length} row(s)`);
  for (const [v, n] of report.vocabulary.offVocabularyServiceTypeValues) console.log(`    ${String(n).padStart(4)}  ${v}`);
  console.log(`  delivery_method outside the declared ${declaredDelivery.size}: ${offVocabDelivery.length} row(s)`);
  for (const [v, n] of report.vocabulary.offVocabularyDeliveryValues) console.log(`    ${String(n).padStart(4)}  ${v}`);
  console.log(`  missing service_type ${missingType} · delivery_method ${missingDelivery} · price_type ${missingPrice}`);

  console.log("\nLARGEST COMBINATIONS (service_type + delivery_method + price_type)");
  for (const [combo, n] of report.largestCombinations) console.log(`  ${String(n).padStart(4)}  ${combo}`);
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
