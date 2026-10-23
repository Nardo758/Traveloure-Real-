/**
 * shared/staff-permissions.ts — the ONE staff permission map (ops gap 11).
 *
 * `users.role` stays a single varchar. `support` and `moderator` are additive staff roles.
 * `admin` still passes every `/api/admin` route. The other two pass only the routes listed
 * here, and only for the permission named on that route.
 *
 *   support:    contact submissions, read-only booking detail
 *   moderator:  message reports, report context, listing status
 *   admin:      everything (including payouts, refunds, and fees)
 *
 * Payouts, refunds, fees, and deletes are admin-only because they are absent from this map.
 * A second copy of the map is a defect: the blanket `/api/admin` guard and `requireStaff`
 * both read it.
 */

export const STAFF_PERMISSIONS = [
  "contact_submissions",
  "booking_detail_read",
  "message_reports",
  "report_context",
  "listing_status",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

const SUPPORT_PERMISSIONS: readonly StaffPermission[] = [
  "contact_submissions",
  "booking_detail_read",
];

const MODERATOR_PERMISSIONS: readonly StaffPermission[] = [
  "message_reports",
  "report_context",
  "listing_status",
];

/** Permissions a role holds. `"all"` is admin. An unknown role holds nothing. */
export function permissionsForRole(
  role: string | null | undefined,
): readonly StaffPermission[] | "all" {
  if (role === "admin") return "all";
  if (role === "support") return SUPPORT_PERMISSIONS;
  if (role === "moderator") return MODERATOR_PERMISSIONS;
  return [];
}

export function staffHasPermission(
  role: string | null | undefined,
  permission: StaffPermission,
): boolean {
  const held = permissionsForRole(role);
  if (held === "all") return true;
  return held.includes(permission);
}

export interface StaffRouteRule {
  method: "GET" | "PATCH" | "POST" | "PUT" | "DELETE";
  pattern: RegExp;
  permission: StaffPermission;
}

/**
 * Routes a non-admin staff role may reach. Patterns are anchored. A near-miss
 * (the booking list, a refund, a fee band, a service delete) matches nothing.
 */
export const STAFF_ROUTE_RULES: readonly StaffRouteRule[] = [
  { method: "GET", pattern: /^\/api\/admin\/contact-submissions$/, permission: "contact_submissions" },
  { method: "PATCH", pattern: /^\/api\/admin\/contact-submissions\/[^/]+$/, permission: "contact_submissions" },
  { method: "GET", pattern: /^\/api\/admin\/bookings\/(?:service|legacy|liteapi)\/[^/]+$/, permission: "booking_detail_read" },
  { method: "GET", pattern: /^\/api\/admin\/message-reports$/, permission: "message_reports" },
  { method: "PATCH", pattern: /^\/api\/admin\/message-reports\/[^/]+$/, permission: "message_reports" },
  { method: "GET", pattern: /^\/api\/admin\/conversations$/, permission: "report_context" },
  { method: "GET", pattern: /^\/api\/admin\/message-reports\/[^/]+\/context$/, permission: "report_context" },
  { method: "PATCH", pattern: /^\/api\/admin\/services\/[^/]+\/status$/, permission: "listing_status" },
];

/** Pathname of a request URL, with the `/api/admin` prefix restored when Express stripped it. */
export function adminRequestPath(url: string): string {
  let path = url.split("?")[0] ?? url;
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path.includes("..")) return path;
  if (path === "/api/admin" || path.startsWith("/api/admin/")) return path;
  return path === "/" ? "/api/admin" : `/api/admin${path}`;
}

export function permissionForStaffRoute(method: string, url: string): StaffPermission | null {
  const path = adminRequestPath(url);
  const verb = method.toUpperCase();
  const rule = STAFF_ROUTE_RULES.find((r) => r.method === verb && r.pattern.test(path));
  return rule?.permission ?? null;
}

/**
 * Blanket-guard decision. Admin passes every path. Support and moderator pass
 * only a mapped route whose permission they hold. Everyone else fails closed.
 */
export function staffMayPassBlanketGuard(
  role: string | null | undefined,
  method: string,
  url: string,
): boolean {
  if (role === "admin") return true;
  const permission = permissionForStaffRoute(method, url);
  if (!permission) return false;
  return staffHasPermission(role, permission);
}
