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
 *   · The single-owner discount (below) separates the LARGEST owner cluster from the rest. It does
 *     NOT decide that the cluster is fixture data — that is a human judgement, made once and
 *     recorded in the ledger; the script only makes the concentration impossible to miss.
 *
 * THE SINGLE-OWNER DISCOUNT (lane OC-A0b, plan §0 constraint 2). Production carries 67 active
 * listings of which 61 belong to ONE demo account, so any unqualified percentage "about the
 * catalog" is a statement about fixtures. Every count below is therefore reported TWICE — over the
 * whole population, and over the population MINUS its largest single-owner cluster — so nobody has
 * to remember to discount it. The owner is identified by a stable hash, never by `users.id`
 * (Locked Decision 40: a user id is internal and is not published, not even to a console).
 *
 * Run:  DATABASE_URL=<url> npx tsx scripts/audit-offering-classification.ts
 *       add --json for a machine-readable dump.
 */
import { Pool } from "pg";
import {
  resolveBookingModeWithProvenance,
  bookingModeEnum,
  bookingModeProvenanceEnum,
  serviceTypeEnum,
  deliveryMethodEnum,
} from "../shared/schema";

const JSON_OUT = process.argv.includes("--json");

type Row = {
  owner_key: string;
  service_type: string | null;
  delivery_method: string | null;
  price_type: string | null;
  booking_mode: string | null;
  account_instant_booking: boolean | null;
  has_provider_form: boolean;
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
    SELECT md5(ps.user_id) AS owner_key,
           ps.service_type,
           ps.delivery_method,
           ps.price_type,
           ps.booking_mode,
           spf.instant_booking AS account_instant_booking,
           (spf.user_id IS NOT NULL) AS has_provider_form
      FROM provider_services ps
      LEFT JOIN service_provider_forms spf ON spf.user_id = ps.user_id
     WHERE ps.status = 'active'
       AND ps.approval_status = 'approved'
  `);
  await pool.end();

  const total = rows.length;

  // ── The single-owner discount (plan §0 constraint 2) ──────────────────────────────────────────
  // Which owner is largest is a MEASUREMENT; whether that owner is fixture data is a human
  // judgement this script does not make (§13). Ties are broken by the hash so the split is
  // deterministic across runs.
  const byOwner = tally(rows.map((r) => r.owner_key));
  const ownerRanking = sortedEntries(byOwner);
  const largestOwner = ownerRanking[0] ?? null;
  const remainder = largestOwner ? rows.filter((r) => r.owner_key !== largestOwner[0]) : rows;

  const declaredServiceTypes = new Set<string>(serviceTypeEnum as readonly string[]);
  const declaredDelivery = new Set<string>(deliveryMethodEnum as readonly string[]);

  /** Every figure this audit reports, over whatever population it is handed. */
  function summarise(population: Row[]) {
    const n = population.length;
    const storedSet = population.filter((r) => r.booking_mode != null).length;
    // ONE derivation, imported (§18 rule 1): the mode AND where it came from both come from
    // `resolveBookingModeWithProvenance`. The old hand-rolled "no account row" count was a second
    // copy of the provenance rule and is retired in favour of the shared one (lane OC-A0b).
    const resolutions = population.map((r) =>
      resolveBookingModeWithProvenance(r.booking_mode, r.account_instant_booking),
    );
    const offVocabType = population.filter(
      (r) => r.service_type != null && !declaredServiceTypes.has(r.service_type),
    );
    const offVocabDelivery = population.filter(
      (r) => r.delivery_method != null && !declaredDelivery.has(r.delivery_method),
    );
    return {
      rows: n,
      bookingMode: {
        storedOnTheRow: storedSet,
        unsetOnTheRow: n - storedSet,
        resolved: tally(resolutions.map((x) => x.mode)),
        provenance: tally(resolutions.map((x) => x.provenance)),
        // A row with NO provider form at all is the sharpest case: nobody has ever answered the
        // instant-booking question for this seller, at any level.
        noProviderFormRow: population.filter((r) => !r.has_provider_form).length,
      },
      vocabulary: {
        offVocabularyServiceTypeRows: offVocabType.length,
        offVocabularyServiceTypeValues: sortedEntries(tally(offVocabType.map((r) => r.service_type!))),
        offVocabularyDeliveryRows: offVocabDelivery.length,
        offVocabularyDeliveryValues: sortedEntries(tally(offVocabDelivery.map((r) => r.delivery_method!))),
        rowsMissingServiceType: population.filter((r) => r.service_type == null).length,
        rowsMissingDeliveryMethod: population.filter((r) => r.delivery_method == null).length,
        rowsMissingPriceType: population.filter((r) => r.price_type == null).length,
      },
      largestCombinations: sortedEntries(
        tally(
          population.map(
            (r) => `${r.service_type ?? "∅"} + ${r.delivery_method ?? "∅"} + ${r.price_type ?? "∅"}`,
          ),
        ),
      ).slice(0, 12),
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    population: "provider_services, status=active AND approval_status=approved",
    total,
    declaredServiceTypes: [...declaredServiceTypes],
    declaredDeliveryMethods: [...declaredDelivery],
    ownership: {
      distinctOwners: ownerRanking.length,
      largestOwnerRows: largestOwner ? largestOwner[1] : 0,
      largestOwnerKey: largestOwner ? largestOwner[0].slice(0, 8) : null,
      remainderRows: remainder.length,
    },
    wholeCatalog: summarise(rows),
    excludingLargestOwner: summarise(remainder),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  function print(label: string, sum: ReturnType<typeof summarise>) {
    console.log(`\n── ${label} — ${sum.rows} listing(s) ──`);
    console.log("BOOKING MODE");
    console.log(`  stored on the row .......... ${sum.bookingMode.storedOnTheRow}`);
    console.log(`  unset on the row ........... ${sum.bookingMode.unsetOnTheRow}   (NULL is the designed default)`);
    console.log("  resolved, i.e. what a reader actually sees:");
    for (const m of bookingModeEnum) console.log(`    ${m.padEnd(8)} ${sum.bookingMode.resolved[m] ?? 0}`);
    console.log("  and WHO said so (listing / account / nobody):");
    for (const pr of bookingModeProvenanceEnum) {
      console.log(`    ${pr.padEnd(17)} ${sum.bookingMode.provenance[pr] ?? 0}`);
    }
    console.log(`  listings whose owner has NO provider form row at all: ${sum.bookingMode.noProviderFormRow}`);
    console.log("VOCABULARY (app-enforced, no DB CHECK — an off-set value is possible by design)");
    console.log(
      `  service_type outside the declared ${declaredServiceTypes.size}: ${sum.vocabulary.offVocabularyServiceTypeRows} row(s)`,
    );
    for (const [v, n] of sum.vocabulary.offVocabularyServiceTypeValues) console.log(`    ${String(n).padStart(4)}  ${v}`);
    console.log(
      `  delivery_method outside the declared ${declaredDelivery.size}: ${sum.vocabulary.offVocabularyDeliveryRows} row(s)`,
    );
    for (const [v, n] of sum.vocabulary.offVocabularyDeliveryValues) console.log(`    ${String(n).padStart(4)}  ${v}`);
    console.log(
      `  missing service_type ${sum.vocabulary.rowsMissingServiceType} · delivery_method ${sum.vocabulary.rowsMissingDeliveryMethod} · price_type ${sum.vocabulary.rowsMissingPriceType}`,
    );
    console.log("LARGEST COMBINATIONS (service_type + delivery_method + price_type)");
    for (const [combo, n] of sum.largestCombinations) console.log(`  ${String(n).padStart(4)}  ${combo}`);
  }

  console.log(`\nOffering classification audit — ${report.generatedAt}`);
  console.log(`Population: ${report.population}`);
  console.log(`Active, approved provider listings: ${total}`);
  console.log(
    `Owners: ${report.ownership.distinctOwners} · largest single-owner cluster: ${report.ownership.largestOwnerRows} listing(s)` +
      `${report.ownership.largestOwnerKey ? ` (owner ${report.ownership.largestOwnerKey}…)` : ""} · remainder: ${report.ownership.remainderRows}`,
  );
  console.log(
    "A percentage over the whole catalog is a statement about the largest cluster unless it is discounted;",
  );
  console.log("both populations are therefore printed below. Which cluster is fixture data is a human call.");

  print("WHOLE CATALOG", report.wholeCatalog);
  print("EXCLUDING THE LARGEST SINGLE OWNER", report.excludingLargestOwner);
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
