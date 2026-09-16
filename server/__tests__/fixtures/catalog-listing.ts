/**
 * ONE catalog-listing fixture for the suites that need a real, bookable listing to exist
 * (CLAUDE.md §18 rule 1 — one implementation, callers).
 *
 * WHY THIS EXISTS. Several suites open with a read of the shape
 *   `SELECT … FROM provider_services WHERE approval_status='approved' AND status='active'
 *    AND price IS NOT NULL … ORDER BY random() LIMIT 1`
 * and then assert that a row came back. That is not a fixture — it is a BET that some OTHER
 * suite's leftovers are still on the table. A database built from empty carries **zero**
 * `provider_services` rows (migrations seed none, and neither the CI user seed nor the app's own
 * boot seeding creates a listing), so on a fresh CI database the bet loses and the suite dies in
 * its own precondition before reaching the behaviour it exists to prove. It only ever passed
 * because a run happened to be preceded by a suite that had not yet cleaned up — and in the
 * whole-directory run that closed this class it lost outright, because
 * `e2e-purge-fk-naming.db.test.ts` neutralises the whole `@traveloure.test` namespace and the
 * listings owned by those accounts cascade away with them.
 *
 * WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT DO. It creates a listing the caller OWNS and
 * hands back the id plus a `cleanup()` that removes exactly what it wrote. It does NOT "find or
 * create", because a found row belongs to somebody else's suite and may be deleted mid-test by
 * that suite's `after()` — the same bet, one layer down. It writes the row directly rather than
 * through `POST /api/provider/services` because the approval lifecycle (born `submitted`,
 * migration 111) is not this helper's subject: a suite that wants to PROVE the lifecycle must
 * drive the real rail, and a suite that merely needs something bookable should not be made to
 * re-enact it.
 *
 * §13 — THE FAILURE MODES ARE DIFFERENT FACTS. "the owner could not be registered", "the listing
 * INSERT was refused" and "the row is not readable back" each throw with their own sentence, so a
 * caller never sees a later, unrelated foreign key blamed for this one.
 *
 * STATED NEGATIVE SPACE: this proves a listing EXISTS, is approved, is active and carries a
 * positive price. It says nothing about availability slots, a category, a market, a neighbourhood,
 * a route, an offering key or anything else a particular suite may additionally require — a caller
 * that needs one of those seeds it itself, beside this.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db as defaultDb } from "../../db";
import { registerActorWithReadBack, type RegisteredActor } from "./registered-actor";

export interface SeededCatalogListing {
  serviceId: string;
  owner: RegisteredActor;
  price: string;
  serviceName: string;
  /** Removes the listing and its owner. Safe to call twice. */
  cleanup: () => Promise<void>;
}

/**
 * Register a provider actor and give them ONE approved, active, priced listing.
 *
 * `label` only has to be unique within the calling suite; the email and the listing name both
 * carry a fresh random tag, so two callers never collide even inside one run.
 */
export async function seedCatalogListing(options: {
  baseUrl: string;
  label: string;
  /** Default "120.00". Must be a positive decimal string — the readers filter on `> 0`. */
  price?: string;
  db?: typeof defaultDb;
}): Promise<SeededCatalogListing> {
  const { baseUrl, label } = options;
  const db = options.db ?? defaultDb;
  const price = options.price ?? "120.00";
  const tag = crypto.randomUUID().slice(0, 8);

  const owner = await registerActorWithReadBack({
    baseUrl,
    email: `catalog-${tag}-${label}@t.test`,
    password: "TestPass123!",
    firstName: "Catalog",
    lastName: label,
    role: "service_provider",
    db,
  });

  const serviceId = `catalog-${tag}-${label}`;
  const serviceName = `Catalog fixture ${label} ${tag}`;
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, description, price, status, approval_status, delivery_method)
    VALUES
      (${serviceId}, ${owner.id}, ${serviceName}, 'Seeded by seedCatalogListing (test fixture).',
       ${price}, 'active', 'approved', 'in_person')
  `);

  const readBack = await db.execute(sql`
    SELECT id FROM provider_services
     WHERE id = ${serviceId} AND approval_status = 'approved' AND status = 'active'
       AND price IS NOT NULL AND CAST(price AS FLOAT) > 0
  `);
  assert.equal(
    readBack.rows.length,
    1,
    `seedCatalogListing(${label}) wrote ${serviceId} but it does not read back as an approved, ` +
      `active, priced listing — the suites that select one would not find it either`,
  );

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await db.execute(sql`DELETE FROM cart_items WHERE service_id = ${serviceId}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE service_id = ${serviceId}`).catch(() => {});
    await db.execute(sql`DELETE FROM vendor_availability_slots WHERE service_id = ${serviceId}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${serviceId}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${serviceId}`).catch(() => {});
    await db.execute(sql`DELETE FROM users WHERE id = ${owner.id}`).catch(() => {});
  };

  return { serviceId, owner, price, serviceName, cleanup };
}
