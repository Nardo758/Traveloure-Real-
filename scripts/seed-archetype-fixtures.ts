/**
 * SEED ONE LIVE LISTING PER AUTHORABLE ARCHETYPE, for click-through testing.
 *
 * Ledger `2026-09-12-archetype-fixtures`. Fixtures: `server/fixtures/offering-archetypes.ts` — the
 * SAME thirteen the DB suite drives, so a click-through and a CI run are looking at the same rows
 * (§18 rule 1; a second set of seed listings is how a manual test and a green suite start
 * disagreeing about what a P6 is).
 *
 * IT WRITES, SO IT REFUSES BY DEFAULT. Three independent conditions, all required:
 *   1. `--confirm-write` on the command line. Without it the script PRINTS the plan and exits 0.
 *   2. `DATABASE_URL` pointing at a recognised disposable host (localhost / 127.0.0.1 / ::1). Any
 *      other host is REFUSED outright unless `ARCHETYPE_SEED_ALLOW_NONLOCAL=1` is ALSO set — there
 *      is no default that reaches a remote database, and production is never a fallback.
 *   3. The target host and database name are PRINTED before the first write, every time, so the
 *      operator sees where the rows are about to land rather than trusting an environment variable
 *      they set in another terminal.
 *
 * TAGGING — ONE OWNER, WHICH IS ALL THE DISCOUNT NEEDS. Every row is owned by
 * `ARCHETYPE_FIXTURE_OWNER_ID`, so the rows form a SINGLE-OWNER CLUSTER, and
 * `scripts/audit-offering-classification.ts` already reports the largest single-owner cluster
 * separately from the remainder (plan §0 constraint 2, `2026-09-11-oc-a1-ratified`'s "every future
 * coverage number excludes that account explicitly"). Nothing new has to be taught to that script.
 * The `[archetype-fixture]` name prefix is for a HUMAN reading the catalog; no machine keys on it.
 *
 * IDEMPOTENT. Ids are deterministic (`archetype-fixture-p1`, …) and every write is
 * `ON CONFLICT DO NOTHING`, so a second run creates nothing and reports so. `--remove` deletes
 * exactly the rows this script created, by those same ids, and nothing else.
 *
 * §13 — IT INVENTS NO TAXONOMY. A fixture needing a `service_categories.category_key` the database
 * does not carry is SKIPPED and named, never seeded against a nearest-looking category and never
 * given a category row of its own: the taxonomy authority is the registry
 * (`scripts/lib/taxonomy-registry.cjs`) plus its migrations, and a seed script is not a
 * twenty-eighth writer of it (Locked Decision 31).
 *
 * §14/§18/§19 — no amount, identity, rate or grant is decided here. `price` is ordinary
 * owner-authored listing content; `revenue_share_rate` is never written (it is derived at charge
 * time from `fee_bands`); no booking, payment, entitlement or advisor row is created.
 *
 * NEGATIVE SPACE (§18d). It seeds LISTINGS. It does not seed availability slots, photos, a provider
 * form, bundle components, property rooms or route points — so a seeded P7 has no components and a
 * seeded P1 has no bookable slot. What it proves by clicking is what a listing's COMMERCE CONTRACT
 * looks like on a real surface, not that the surface can complete a purchase.
 *
 * Run:
 *   DATABASE_URL=<url> npx tsx scripts/seed-archetype-fixtures.ts                  # dry run
 *   DATABASE_URL=<url> npx tsx scripts/seed-archetype-fixtures.ts --confirm-write
 *   DATABASE_URL=<url> npx tsx scripts/seed-archetype-fixtures.ts --confirm-write --remove
 */
import { Pool } from "pg";
import {
  ARCHETYPE_FIXTURES,
  ARCHETYPE_FIXTURE_NAME_PREFIX,
  ARCHETYPE_FIXTURE_OWNER_ID,
  archetypeFixtureServiceId,
} from "../server/fixtures/offering-archetypes";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const argv = new Set(process.argv.slice(2));
const CONFIRMED = argv.has("--confirm-write");
const REMOVE = argv.has("--remove");

function fail(message: string): never {
  console.error(`\n[archetype-seed] ${message}\n`);
  process.exit(2);
}

function describeTarget(url: string): { host: string; database: string; nonLocal: boolean } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail("DATABASE_URL is not a parseable connection string.");
  }
  const host = parsed.hostname.toLowerCase();
  return {
    host: host || "<socket>",
    database: parsed.pathname.replace(/^\//, "") || "<default>",
    nonLocal: !DISPOSABLE_HOSTS.has(host) && host !== "",
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is required. This script never guesses a target.");

  const target = describeTarget(url!);

  // PRINTED BEFORE ANY WRITE, always — including on a dry run, so the operator can compare it with
  // the database they meant.
  console.log("\n── Archetype fixture seed ────────────────────────────────────────────────────");
  console.log(`  target host     : ${target.host}`);
  console.log(`  target database : ${target.database}`);
  console.log(`  owner           : ${ARCHETYPE_FIXTURE_OWNER_ID} (one owner ⇒ one discountable cluster)`);
  console.log(`  listings        : ${ARCHETYPE_FIXTURES.length} (${ARCHETYPE_FIXTURES.map((f) => f.archetype).join(", ")})`);
  console.log(`  mode            : ${REMOVE ? "REMOVE" : "SEED"}${CONFIRMED ? "" : " (dry run — nothing will be written)"}`);
  console.log("──────────────────────────────────────────────────────────────────────────────\n");

  if (target.nonLocal && process.env.ARCHETYPE_SEED_ALLOW_NONLOCAL !== "1") {
    fail(
      `REFUSING to write to a non-local host ('${target.host}'). There is no default that reaches a ` +
        "remote database. If this really is a disposable staging database, set " +
        "ARCHETYPE_SEED_ALLOW_NONLOCAL=1 and re-run. Never set it for production.",
    );
  }
  if (!CONFIRMED) {
    console.log("Dry run. Re-run with --confirm-write to apply.\n");
    return;
  }
  if (target.nonLocal) {
    console.log(`!! Writing to NON-LOCAL host '${target.host}' because ARCHETYPE_SEED_ALLOW_NONLOCAL=1.\n`);
  }

  const pool = new Pool({ connectionString: url });
  try {
    if (REMOVE) {
      const ids = ARCHETYPE_FIXTURES.map((f) => archetypeFixtureServiceId(f.archetype));
      // content_registry first: it references the listing by id and is written by the same create.
      await pool.query(`DELETE FROM content_registry WHERE content_id = ANY($1::text[])`, [ids]);
      const del = await pool.query(`DELETE FROM provider_services WHERE id = ANY($1::text[])`, [ids]);
      const delUser = await pool.query(`DELETE FROM users WHERE id = $1`, [ARCHETYPE_FIXTURE_OWNER_ID]);
      console.log(`Removed ${del.rowCount} listing(s) and ${delUser.rowCount} owner row(s).\n`);
      return;
    }

    // The owner. Role `service_provider`, deliberately: `loadOfferingListingInput` reads the OWNER's
    // role for `sellerClass`, and every archetype an expert-owned listing could reach is unreachable
    // from a listing row anyway (see the fixtures' `listingRow`) — a fake `expert` account would
    // change nothing about how these rows classify and would put a fixture into the expert
    // directory. One owner, one cluster, one honest role.
    await pool.query(
      `INSERT INTO users (id, email, first_name, last_name, role)
       VALUES ($1, $2, 'Archetype', 'Fixtures', 'service_provider')
       ON CONFLICT (id) DO NOTHING`,
      [ARCHETYPE_FIXTURE_OWNER_ID, "archetype-fixtures@traveloure.test"],
    );

    const { rows: catRows } = await pool.query<{ id: string; category_key: string }>(
      `SELECT id, category_key FROM service_categories WHERE category_key IS NOT NULL`,
    );
    const categoryIdFor = new Map(catRows.map((r) => [r.category_key, r.id]));

    let created = 0;
    const skipped: string[] = [];
    for (const fx of ARCHETYPE_FIXTURES) {
      const id = archetypeFixtureServiceId(fx.archetype);
      let categoryId: string | null = null;
      if (fx.row.categoryKey) {
        categoryId = categoryIdFor.get(fx.row.categoryKey) ?? null;
        if (!categoryId) {
          // §13: named, never substituted. A missing key is a taxonomy fact about this database.
          skipped.push(`${fx.archetype} (no service_categories row carries '${fx.row.categoryKey}')`);
          continue;
        }
      }
      const res = await pool.query(
        `INSERT INTO provider_services
           (id, user_id, service_name, description, status, approval_status,
            service_type, delivery_method, product_shape, price_type, booking_mode,
            deposit_enabled, meeting_point, price, category_id)
         VALUES ($1,$2,$3,$4,'active','approved',$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO NOTHING`,
        [
          id,
          ARCHETYPE_FIXTURE_OWNER_ID,
          `${ARCHETYPE_FIXTURE_NAME_PREFIX} ${fx.archetype} — ${fx.sells}`,
          fx.sells,
          fx.row.serviceType,
          fx.row.deliveryMethod,
          fx.row.productShape ?? null,
          fx.row.priceType,
          fx.row.bookingMode,
          fx.row.depositEnabled ?? false,
          fx.row.meetingPoint ?? null,
          fx.row.price,
          categoryId,
        ],
      );
      if (res.rowCount === 1) created += 1;
    }

    console.log(`Created ${created} listing(s); ${ARCHETYPE_FIXTURES.length - created - skipped.length} already present.`);
    if (skipped.length > 0) {
      console.log("\nSKIPPED — the category key is not in this database's taxonomy:");
      for (const s of skipped) console.log(`  · ${s}`);
      console.log(
        "\nNothing was substituted. Apply the taxonomy migrations (034 / 289, and the boot seeder\n" +
          "for the 'Custom / Other' catch-all) and re-run; a second run creates only what is missing.",
      );
    }
    console.log("");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[archetype-seed] failed:", err);
  process.exit(1);
});
