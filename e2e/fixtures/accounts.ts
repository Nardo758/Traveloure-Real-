// e2e/fixtures/accounts.ts
// Role → seeded test account. Emails follow {market}-{specialty}@traveloure.test.
// Password is read from env and never committed (TestPass123! is the dev fallback).

export const ROLES = ['traveler', 'expert', 'provider', 'ea', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ACCOUNTS: Record<Role, { email: string }> = {
  traveler: { email: process.env.E2E_TRAVELER_EMAIL ?? 'test-traveler-kyoto@traveloure.test' },
  expert:   { email: process.env.E2E_EXPERT_EMAIL   ?? 'kyoto-food@traveloure.test' },
  provider: { email: process.env.E2E_PROVIDER_EMAIL ?? 'kyoto-photography@traveloure.test' },
  ea:       { email: process.env.E2E_EA_EMAIL        ?? 'test-ea@traveloure.test' },
  admin:    { email: process.env.E2E_ADMIN_EMAIL     ?? 'test-admin@traveloure.test' },
};

export const PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'TestPass123!';
