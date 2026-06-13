/**
 * SWAP #2 — role → seeded account mapping.
 *
 * Emails are the real seeded test accounts from
 * `playwright/fixtures/test-accounts.ts` (password `TestPass123!` for all).
 * Every field is overridable from the environment so the lane can point the
 * harness at a different seed set without touching code.
 *
 * Seeded role labels in the registry map to the app's stored `role` column
 * (see server/.../emailAuth.ts + client getRoleHomePath):
 *   traveler -> "user"               -> home /dashboard
 *   expert   -> "*_expert"/"expert"  -> home /expert/dashboard
 *   provider -> "service_provider"   -> home /provider/dashboard
 *   ea       -> "executive_assistant"-> home /ea/dashboard
 *   admin    -> "admin"              -> home /admin/dashboard
 */

export type Role = 'traveler' | 'expert' | 'provider' | 'ea' | 'admin';

export interface Account {
  role: Role;
  email: string;
  password: string;
  /** Authed landing route the app redirects this role to after login. */
  home: string;
}

const PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPass123!';

export const accounts: Record<Role, Account> = {
  traveler: {
    role: 'traveler',
    email: process.env.E2E_TRAVELER_EMAIL || 'test-traveler-nyc@traveloure.test',
    password: PASSWORD,
    home: '/dashboard',
  },
  expert: {
    role: 'expert',
    email: process.env.E2E_EXPERT_EMAIL || 'test-travel-expert@traveloure.test',
    password: PASSWORD,
    home: '/expert/dashboard',
  },
  provider: {
    role: 'provider',
    email: process.env.E2E_PROVIDER_EMAIL || 'test-provider@traveloure.test',
    password: PASSWORD,
    home: '/provider/dashboard',
  },
  ea: {
    role: 'ea',
    email: process.env.E2E_EA_EMAIL || 'test-ea@traveloure.test',
    password: PASSWORD,
    home: '/ea/dashboard',
  },
  admin: {
    role: 'admin',
    email: process.env.E2E_ADMIN_EMAIL || 'test-admin@traveloure.test',
    password: PASSWORD,
    home: '/admin/dashboard',
  },
};

export const allRoles = Object.keys(accounts) as Role[];
