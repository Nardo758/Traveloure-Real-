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
  // /expert/dashboard is kept deliberately: it redirects to /expert/today (B5 retirement),
  // so the gate exercises the redirect AND the Today page it lands on.
  { href: '/expert/dashboard',          description: 'Retired dashboard -> redirects to Today' },
  { href: '/expert/today',              description: 'Today ops home (B5)' },
  { href: '/expert/calendar',           description: 'Channel Calendar — 9th module (C3)' },
  { href: '/expert/inbox',              description: 'Inbox — one actionable queue (B2)' },
  { href: '/expert/catalog',            description: 'Catalog — offerings + availability slots (B3)' },
  // /expert/ready-made is kept deliberately (B5 dashboard pattern): it redirects to
  // /expert/catalog (C1 Store Listings retirement), so the gate exercises the redirect
  // AND the Catalog page it lands on.
  { href: '/expert/ready-made',         description: 'Retired Store Listings -> redirects to Catalog (C1)' },
  { href: '/expert/performance',        description: 'Performance — channel attribution (B4)' },
  { href: '/expert/customers',          description: 'Customers — honest self-scoped aggregation (C4)' },
  // /expert/clients is kept deliberately (B5/C1 redirect pattern): it redirects to
  // /expert/customers (C5) — the by-client view's home — so the gate exercises the
  // redirect AND the Customers page it lands on.
  { href: '/expert/clients',            description: 'Retired client list -> redirects to Customers (C5)' },
  // /expert/assigned-trips redirects to /expert/inbox?tab=assignments (C5 Assigned Trips
  // retirement) — the list + accept action live on Inbox's Assigned Trips tab; the Suggest
  // flow moved to the Workstation Distribute→Client card; by-client lives on Customers.
  { href: '/expert/assigned-trips',     description: 'Retired Assigned Trips -> redirects to Inbox assignments tab (C5)' },
  // /expert/bookings redirects to /expert/inbox?tab=history (C5 Bookings retirement) —
  // history/stats, visa-status management, and the trip-plan snapshot live on Inbox History.
  { href: '/expert/bookings',           description: 'Retired Bookings -> redirects to Inbox history tab (C5)' },
  // /expert/services is kept deliberately (B5/C1 redirect pattern): it redirects to
  // /expert/catalog (C2 My Offerings retirement), so the gate exercises the redirect
  // AND the Catalog page it lands on. The ServiceForm routes (/new, /:id/edit) are
  // parameterised/creation surfaces and stay live.
  { href: '/expert/services',           description: 'Retired My Offerings -> redirects to Catalog (C2)' },
  // /expert/share-promote redirects to /expert/catalog (C2 Share & Promote retirement) —
  // listed so the redirect is smoke-tested; C9 retired the provider twin the same way.
  { href: '/expert/share-promote',      description: 'Retired Share & Promote -> redirects to Catalog (C2)' },
  { href: '/expert/money',              description: 'Money — earnings + payouts (C8)' },
  // /expert/earnings is kept deliberately (B5/C1 redirect pattern): it redirects to
  // /expert/money (C8 Earnings → Money module rename), so the gate exercises the
  // redirect AND the Money page it lands on.
  { href: '/expert/earnings',           description: 'Retired Earnings -> redirects to Money (C8)' },
  // /expert/analytics redirects to /expert/performance?tab=analytics (C6 Analytics
  // retirement) — the analytics page is hosted as Performance's Analytics tab (its
  // internal 9-tab picker rides ?sub= there); listed so the gate exercises the
  // redirect AND the Performance page it lands on. /expert/revenue-optimization and
  // /expert/leaderboard redirect the same way with &sub=.
  { href: '/expert/analytics',          description: 'Retired Analytics -> redirects to Performance analytics tab (C6)' },
  { href: '/expert/ai-assistant',       description: 'Expert AI task delegation' },
  { href: '/expert/content-studio',     description: 'Content creation studio' },
  // /expert/profile is kept deliberately (B5/C1 redirect pattern): it redirects to
  // /expert/settings?tab=profile (C8 Profile → Settings first-tab merge), so the gate
  // exercises the redirect AND the Settings page it lands on.
  { href: '/expert/profile',            description: 'Retired Profile -> redirects to Settings profile tab (C8)' },
  { href: '/expert/settings',           description: 'Account settings' },
  { href: '/expert/verification',       description: 'Expert verification status' },
  // '/expert/contract-categories' removed: page deleted by the expert-console
  // consolidation (9959ca80) with no redirect — it now hits the 404 catch-all.
  { href: '/expert/booking-partners',   description: 'Booking partner configuration' },
  { href: '/expert/workspace',          description: 'Trip planning workspace' },
  // /expert/dmo-library is kept deliberately (B5/C1 redirect pattern): it redirects to
  // /expert/workspace (C7 DMO Library retirement) — the Add panel's DMO drawer now carries
  // browse/add AND review-and-refine — so the gate exercises the redirect AND the
  // Workstation it lands on.
  { href: '/expert/dmo-library',        description: 'Retired DMO Library -> redirects to Workstation (C7)' },
];

// ── Provider routes (requiredRole="provider") ────────────────────────────────

// Console IA C9 (§17 17→9 collapse): the provider console runs the expert console's
// nine-module IA. PB completed the NINE: the Workstation/Product Builder landed once its
// two §17 gates were ratified (bundle join-table schema + bundle money path). Retired routes
// are kept deliberately (the B5/C1 redirect pattern) so the gate exercises the redirect AND
// the module page it lands on.
export const providerRoutesConfig: RoleRouteConfig[] = [
  { href: '/provider/dashboard',    description: 'Today — ops home (C9 label-only rename)' },
  { href: '/provider/calendar',     description: 'Channel Calendar — 9th module (C9)' },
  { href: '/provider/workstation',  description: 'Workstation — Product Builder: single service → bundle → property ladder (PB)' },
  { href: '/provider/bookings',     description: 'Bookings — the Inbox-module seat (C9 keep)' },
  { href: '/provider/services',     description: 'Catalog — offerings + availability + share tools (C9)' },
  { href: '/provider/customers',    description: 'Customers — honest self-scoped aggregation (C9)' },
  { href: '/provider/performance',  description: 'Performance — hosts Analytics as a tab (C9)' },
  // /provider/analytics redirects to /provider/performance?tab=analytics (C9 Analytics
  // retirement — the page is hosted as Performance's Analytics tab).
  { href: '/provider/analytics',    description: 'Retired Analytics -> redirects to Performance analytics tab (C9)' },
  { href: '/provider/money',        description: 'Money — earnings + payout requests (C9 rename)' },
  // /provider/earnings redirects to /provider/money (C9 Earnings → Money module rename).
  { href: '/provider/earnings',     description: 'Retired Earnings -> redirects to Money (C9)' },
  // /provider/profile redirects to /provider/settings?tab=profile (C9 Profile → Settings
  // first-tab merge).
  { href: '/provider/profile',      description: 'Retired Profile -> redirects to Settings profile tab (C9)' },
  { href: '/provider/settings',     description: 'Account settings (hosts Profile as first tab, C9)' },
  // /provider/share-promote redirects to /provider/services (C9 Share & Promote retirement —
  // share kits/posting opportunities/storefront tools live on Catalog).
  { href: '/provider/share-promote', description: 'Retired Share & Promote -> redirects to Catalog (C9)' },
  // Not one of the NINE: routed but deliberately unlisted in the sidebar (static guides,
  // no backing content system) — see the provider-sidebar C9 note.
  { href: '/provider/resources',    description: 'Provider resources & guides (quiet extra)' },
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
  { href: '/admin/fee-bands',           description: 'Concierge fee bands' },
  { href: '/admin/offering-types',      description: 'Offering type seed' },
  { href: '/admin/category-fees',       description: 'Category fee percentages' },
  { href: '/admin/neighborhoods',       description: 'Neighborhood management' },
  { href: '/admin/event-packages',      description: 'Event package management' },
  { href: '/admin/platform-providers',  description: 'Platform provider registry' },
  { href: '/admin/routing-queue',       description: 'Lead routing queue' },
  { href: '/admin/concierge-requests',  description: 'Concierge request queue' },
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
