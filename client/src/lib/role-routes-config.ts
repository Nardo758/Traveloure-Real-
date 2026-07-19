/**
 * role-routes-config.ts — single source of truth for every role-gated route.
 *
 * Single source of truth for every static (non-parameterised) path that
 * requires a logged-in user with a specific role. Imported by:
 *   - playwright/tests/auth-routes.spec.ts  (smoke-tests every route)
 *
 * Adding a new <Route path="/expert/new-thing"> in App.tsx should be
 * accompanied by adding "/expert/new-thing" to the matching group below.
 * That single edit automatically registers the route in the auth smoke test
 * on the next PR, so crashes that only surface for authenticated users are
 * caught in CI before they reach production.
 *
 * Rules for inclusion:
 *   - Only static paths (no :param segments).
 *   - The route must be protected by <ProtectedRoute requiredRole="…">.
 *   - Redirect-only routes are excluded (they have no meaningful page to smoke-test).
 */

export interface RoleRouteConfig {
  href: string;
  description?: string;
}

// ── Expert routes (requiredRole="expert") ───────────────────────────────────

export const expertRoutesConfig: RoleRouteConfig[] = [
  { href: '/expert/dashboard',          description: 'Expert home dashboard' },
  { href: '/expert/clients',            description: 'Client list' },
  { href: '/expert/assigned-trips',     description: 'Trips assigned to this expert' },
  { href: '/expert/bookings',           description: 'Booking requests' },
  { href: '/expert/services',           description: 'Published services' },
  { href: '/expert/earnings',           description: 'Earnings & payout history' },
  { href: '/expert/analytics',          description: 'Performance analytics' },
  { href: '/expert/ai-assistant',       description: 'Expert AI task delegation' },
  { href: '/expert/content-studio',     description: 'Content creation studio' },
  { href: '/expert/profile',            description: 'Public expert profile' },
  { href: '/expert/settings',           description: 'Account settings' },
  { href: '/expert/verification',       description: 'Expert verification status' },
  { href: '/expert/contract-categories', description: 'Contract category management' },
  { href: '/expert/booking-partners',   description: 'Booking partner configuration' },
  { href: '/expert/workspace',          description: 'Trip planning workspace' },
  { href: '/expert/dmo-library',        description: 'DMO destination library' },
];

// ── Provider routes (requiredRole="provider") ────────────────────────────────

export const providerRoutesConfig: RoleRouteConfig[] = [
  { href: '/provider/dashboard',    description: 'Provider home dashboard' },
  { href: '/provider/bookings',     description: 'Booking requests' },
  { href: '/provider/services',     description: 'Published services' },
  { href: '/provider/earnings',     description: 'Earnings & payout history' },
  { href: '/provider/performance',  description: 'Performance metrics' },
  { href: '/provider/analytics',    description: 'Analytics overview' },
  { href: '/provider/calendar',     description: 'Availability calendar' },
  { href: '/provider/profile',      description: 'Public provider profile' },
  { href: '/provider/settings',     description: 'Account settings' },
  { href: '/provider/resources',    description: 'Provider resources & guides' },
];

// ── Executive Assistant routes (requiredRole="executive_assistant") ──────────

export const eaRoutesConfig: RoleRouteConfig[] = [
  { href: '/ea/dashboard',      description: 'EA home dashboard' },
  { href: '/ea/clients',        description: 'Client list' },
  { href: '/ea/executives',     description: 'Executive contacts' },
  { href: '/ea/calendar',       description: 'Calendar' },
  { href: '/ea/events',         description: 'Events' },
  { href: '/ea/communications', description: 'Communications hub' },
  { href: '/ea/ai-assistant',   description: 'EA AI task management' },
  { href: '/ea/travel',         description: 'Travel planning' },
  { href: '/ea/trips',          description: 'Trip management' },
  { href: '/ea/venues',         description: 'Venue search' },
  { href: '/ea/gifts',          description: 'Gift management' },
  { href: '/ea/reports',        description: 'Reports' },
  { href: '/ea/profile',        description: 'EA profile' },
  { href: '/ea/settings',       description: 'Account settings' },
];

// ── Admin routes (requiredRole="admin") ──────────────────────────────────────

export const adminRoutesConfig: RoleRouteConfig[] = [
  { href: '/admin/dashboard',           description: 'Admin home dashboard' },
  { href: '/admin/users',               description: 'User management' },
  { href: '/admin/experts',             description: 'Expert management' },
  { href: '/admin/providers',           description: 'Provider management' },
  { href: '/admin/plans',               description: 'Subscription plans' },
  { href: '/admin/revenue',             description: 'Revenue overview' },
  { href: '/admin/analytics',           description: 'Platform analytics' },
  { href: '/admin/categories',          description: 'Service categories' },
  { href: '/admin/expert-templates',    description: 'Expert template library' },
  { href: '/admin/template-approvals',  description: 'Template approval queue' },
  { href: '/admin/search',              description: 'Global search' },
  { href: '/admin/notifications',       description: 'Notification management' },
  { href: '/admin/system',              description: 'System health & config' },
  { href: '/admin/data',                description: 'Data management' },
  { href: '/admin/ai-costs',            description: 'AI cost tracking' },
  { href: '/admin/payouts',             description: 'Payout management' },
  { href: '/admin/reconciliation',      description: 'Revenue reconciliation' },
  { href: '/admin/fee-config',          description: 'Fee configuration' },
  { href: '/admin/fee-bands',           description: 'Concierge fee bands' },
  { href: '/admin/offering-types',      description: 'Offering type seed' },
  { href: '/admin/category-fees',       description: 'Category fee percentages' },
  { href: '/admin/neighborhoods',       description: 'Neighborhood management' },
  { href: '/admin/event-packages',      description: 'Event package management' },
  { href: '/admin/platform-providers',  description: 'Platform provider registry' },
  { href: '/admin/routing-queue',       description: 'Lead routing queue' },
  { href: '/admin/content-tracking',    description: 'Content tracking & moderation' },
  { href: '/admin/content-mapping',     description: 'Content mapping' },
  { href: '/admin/services',            description: 'Service management' },
  { href: '/admin/affiliate-partners',  description: 'Affiliate partner management' },
  { href: '/admin/tourism-analytics',   description: 'Tourism analytics' },
  { href: '/admin/neighborhood-backfill', description: 'Neighborhood backfill tool' },
  { href: '/admin/gem-photo-backfill',  description: 'Gem photo backfill tool' },
  { href: '/admin/review-moderation',   description: 'Review moderation queue' },
  { href: '/admin/destination-events',  description: 'Destination events management' },
  { href: '/admin/analytics/cross-sell', description: 'Cross-sell analytics' },
  { href: '/admin/qa-checklist',        description: 'QA checklist' },
];

// ── Convenience accessors ─────────────────────────────────────────────────────

/** All static hrefs that require the "expert" role. */
export function getExpertRouteHrefs(): string[] {
  return expertRoutesConfig.map((r) => r.href);
}

/** All static hrefs that require the "provider" role. */
export function getProviderRouteHrefs(): string[] {
  return providerRoutesConfig.map((r) => r.href);
}

/** All static hrefs that require the "executive_assistant" role. */
export function getEARouteHrefs(): string[] {
  return eaRoutesConfig.map((r) => r.href);
}

/** All static hrefs that require the "admin" role. */
export function getAdminRouteHrefs(): string[] {
  return adminRoutesConfig.map((r) => r.href);
}
