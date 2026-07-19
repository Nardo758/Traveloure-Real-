/**
 * seed-ci-test-users.ts
 *
 * Creates (or upserts) four CI-only test accounts with hashed email/password
 * credentials and the correct platform roles so that the authenticated
 * Playwright gate can log in as expert, provider, admin, and executive_assistant
 * without needing Replit OAuth or any other external auth provider.
 *
 * Also seeds EA-specific data for the CI EA user so that EA pages render
 * meaningful content (not just empty shells) during the smoke test:
 *   - 1 ea_client_relationships record
 *   - 1 ea_executives record
 *   - 1 trip row with managed_by_ea_id pointing to the CI EA user
 *
 * Run ONCE in CI, before Playwright, after migrations:
 *   npx tsx scripts/seed-ci-test-users.ts
 *
 * The script is fully idempotent (ON CONFLICT DO UPDATE / WHERE NOT EXISTS)
 * — safe to re-run.
 */

import { Pool } from 'pg';
import crypto from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

const CI_USERS = [
  {
    email: 'ci-expert@traveloure.test',
    password: 'CITestExpert!99',
    role: 'travel_expert',
    firstName: 'CI',
    lastName: 'Expert',
  },
  {
    email: 'ci-provider@traveloure.test',
    password: 'CITestProvider!99',
    role: 'service_provider',
    firstName: 'CI',
    lastName: 'Provider',
  },
  {
    email: 'ci-admin@traveloure.test',
    password: 'CITestAdmin!99',
    role: 'admin',
    firstName: 'CI',
    lastName: 'Admin',
  },
  {
    email: 'ci-ea@traveloure.test',
    password: 'CITestEA!99',
    role: 'executive_assistant',
    firstName: 'CI',
    lastName: 'EA',
  },
];

async function seedEaData(eaUserId: string): Promise<void> {
  // ── 1. EA client relationship ──────────────────────────────────────────────
  // Insert only if no record already exists for this EA user + email pair.
  const clientResult = await pool.query<{ id: string }>(
    // $1/$2 are cast to varchar explicitly: a bare parameter reused in both the
    // INSERT ... SELECT list and the WHERE NOT EXISTS subquery leaves Postgres
    // unable to deduce a single type ("text versus character varying", 42P08).
    `INSERT INTO ea_client_relationships
       (id, ea_user_id, client_email, display_name, notes, preferred_currency)
     SELECT
       gen_random_uuid(), $1::varchar, $2::varchar, $3, $4, 'USD'
     WHERE NOT EXISTS (
       SELECT 1 FROM ea_client_relationships
       WHERE ea_user_id = $1::varchar AND client_email = $2::varchar
     )
     RETURNING id`,
    [
      eaUserId,
      'ci-client@traveloure.test',
      'CI Test Client',
      'Seeded by CI — used by EA smoke test',
    ],
  );

  // Fetch the id whether we just inserted it or it already existed.
  const clientIdRow = clientResult.rows[0]
    ?? (
        await pool.query<{ id: string }>(
          `SELECT id FROM ea_client_relationships
           WHERE ea_user_id = $1 AND client_email = $2`,
          [eaUserId, 'ci-client@traveloure.test'],
        )
      ).rows[0];

  const clientRelationshipId: string = clientIdRow.id;

  console.log(
    `[seed-ci-test-users] EA client relationship id: ${clientRelationshipId}`,
  );

  // ── 2. EA executive ────────────────────────────────────────────────────────
  const executiveResult = await pool.query<{ id: string }>(
    // $1/$2 cast to varchar — see the ea_client_relationships note above (42P08).
    `INSERT INTO ea_executives
       (id, ea_user_id, name, title, email, status, preferences)
     SELECT
       gen_random_uuid(), $1::varchar, $2::varchar, $3, $4, 'active',
       '{"travelClass":"Business","hotelBrands":"Marriott","dietary":"None","seating":"Aisle"}'::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM ea_executives
       WHERE ea_user_id = $1::varchar AND name = $2::varchar
     )
     RETURNING id`,
    [
      eaUserId,
      'CI Test Executive',
      'Chief Executive Officer',
      'ci-executive@traveloure.test',
    ],
  );

  const executiveIdRow = executiveResult.rows[0]
    ?? (
        await pool.query<{ id: string }>(
          `SELECT id FROM ea_executives
           WHERE ea_user_id = $1 AND name = $2`,
          [eaUserId, 'CI Test Executive'],
        )
      ).rows[0];

  console.log(
    `[seed-ci-test-users] EA executive id: ${executiveIdRow.id}`,
  );

  // ── 3. Managed trip ────────────────────────────────────────────────────────
  // A trip where managed_by_ea_id = eaUserId so /api/ea/trips returns it.
  const tripResult = await pool.query<{ id: string }>(
    `INSERT INTO trips
       (id, managed_by_ea_id, ea_client_relationship_id,
        destination, title, start_date, end_date,
        status, number_of_travelers)
     SELECT
       gen_random_uuid(), $1::varchar, $2::varchar,
       'CI Test Destination', 'CI Managed Trip',
       CURRENT_DATE + INTERVAL '30 days',
       CURRENT_DATE + INTERVAL '37 days',
       'planning', 2
     WHERE NOT EXISTS (
       SELECT 1 FROM trips
       WHERE managed_by_ea_id = $1::varchar
         AND ea_client_relationship_id = $2::varchar
     )
     RETURNING id`,
    [eaUserId, clientRelationshipId],
  );

  const tripId = tripResult.rows[0]?.id ?? '(already existed)';
  console.log(`[seed-ci-test-users] EA managed trip id: ${tripId}`);
}

async function main() {
  const now = new Date().toISOString();

  let eaUserId: string | null = null;

  for (const user of CI_USERS) {
    const hashed = await hashPassword(user.password);

    const result = await pool.query<{ id: string }>(
      `INSERT INTO users (
         id, email, password, role, first_name, last_name,
         auth_provider, terms_accepted_at, privacy_accepted_at
       )
       VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5,
         'email', $6, $6
       )
       ON CONFLICT (email) DO UPDATE
         SET password            = EXCLUDED.password,
             role                = EXCLUDED.role,
             terms_accepted_at   = COALESCE(users.terms_accepted_at, EXCLUDED.terms_accepted_at),
             privacy_accepted_at = COALESCE(users.privacy_accepted_at, EXCLUDED.privacy_accepted_at)
       RETURNING id`,
      [user.email, hashed, user.role, user.firstName, user.lastName, now],
    );

    const userId: string = result.rows[0].id;
    console.log(
      `[seed-ci-test-users] Upserted ${user.email} (role: ${user.role}, id: ${userId})`,
    );

    if (user.role === 'executive_assistant') {
      eaUserId = userId;
    }
  }

  // Seed EA-specific relational data so pages render real content, not empty
  // shells, during the authenticated smoke test.
  if (eaUserId) {
    await seedEaData(eaUserId);
  }

  await pool.end();
  console.log('[seed-ci-test-users] Done.');
}

main().catch((err) => {
  console.error('[seed-ci-test-users] Error:', err);
  process.exit(1);
});
