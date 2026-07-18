/**
 * seed-ci-test-users.ts
 *
 * Creates (or upserts) three CI-only test accounts with hashed email/password
 * credentials and the correct platform roles so that the authenticated
 * Playwright gate can log in as expert, provider, and admin without needing
 * Replit OAuth or any other external auth provider.
 *
 * Run ONCE in CI, before Playwright, after migrations:
 *   npx tsx scripts/seed-ci-test-users.ts
 *
 * The script is fully idempotent (ON CONFLICT DO UPDATE) — safe to re-run.
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
];

async function main() {
  const now = new Date().toISOString();

  for (const user of CI_USERS) {
    const hashed = await hashPassword(user.password);

    await pool.query(
      `INSERT INTO users (
         id, email, password, role, first_name, last_name,
         auth_provider, terms_accepted_at, privacy_accepted_at
       )
       VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5,
         'email', $6, $6
       )
       ON CONFLICT (email) DO UPDATE
         SET password          = EXCLUDED.password,
             role              = EXCLUDED.role,
             terms_accepted_at = COALESCE(users.terms_accepted_at, EXCLUDED.terms_accepted_at),
             privacy_accepted_at = COALESCE(users.privacy_accepted_at, EXCLUDED.privacy_accepted_at)`,
      [user.email, hashed, user.role, user.firstName, user.lastName, now],
    );

    console.log(`[seed-ci-test-users] Upserted ${user.email} (role: ${user.role})`);
  }

  await pool.end();
  console.log('[seed-ci-test-users] Done.');
}

main().catch((err) => {
  console.error('[seed-ci-test-users] Error:', err);
  process.exit(1);
});
