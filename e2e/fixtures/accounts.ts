// e2e/fixtures/accounts.ts
// Role → seeded test account. Emails follow {market}-{specialty}@traveloure.test.
// Password is read from env and never committed (TestPass123! is the dev fallback).

export const ROLES = ['traveler', 'expert', 'provider', 'ea', 'admin'] as const;
export type Role = (typeof ROLES)[number];

// ── SWAP #2: real seeded accounts per role (verified against playwright/fixtures/test-accounts.ts) ──
// Kyoto-market smoke set where a real seeded row exists; the platform-wide
// test-ea / test-admin accounts cover ea/admin (no kyoto-scoped seeds for those).
// If "Trip Planner" is a distinct login from "Local Expert" in your seeds, add a
// 'tripPlanner' role above and a row here — don't reuse the expert account for it.
export const ACCOUNTS: Record<Role, { email: string }> = {
  traveler: { email: process.env.E2E_TRAVELER_EMAIL ?? 'test-traveler-kyoto@traveloure.test' },
  expert: { email: process.env.E2E_EXPERT_EMAIL ?? 'kyoto-food@traveloure.test' },
  provider: { email: process.env.E2E_PROVIDER_EMAIL ?? 'kyoto-photography@traveloure.test' },
  ea: { email: process.env.E2E_EA_EMAIL ?? 'test-ea@traveloure.test' },
  admin: { email: process.env.E2E_ADMIN_EMAIL ?? 'test-admin@traveloure.test' },
};
// ────────────────────────────────────────────────────────────────────────────────

export const PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'TestPass123!';
