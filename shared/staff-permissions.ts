/**
 * shared/staff-permissions.ts — the ONE staff permission map (ops gap 11; slice 0, Addendum A v2).
 *
 * `users.role` stays a single varchar. The staff roles and what each passes on `/api/admin`:
 *
 *   owner:             every route.
 *   platform_admin:    every route EXCEPT the owner-only rules below (money, fee bands, settings and
 *                      flags, bot keys, role/market grants). `admin` is its alias for one release.
 *   regional_manager:  approvals, the bot-proposal queue and the issue queue — and only inside its
 *                      assigned markets, which the handler checks (`staffMayActOn`, one 404).
 *   moderator:         message reports, report context, listing status, and the bot proposals
 *                      assigned to it (read only; never a decision).
 *   support:           contact submissions, read-only booking detail, the bot audit log (read only).
 *
 * A route not mapped here is admin-only (owner + platform_admin), as before. A second copy of the
 * map is a defect: the blanket `/api/admin` guard and `requireStaff` both read it.
 */
import { isAdminRole, isOwnerRole } from "./roles";

export const STAFF_PERMISSIONS = [
  "contact_submissions",
  "booking_detail_read",
  "message_reports",
  "report_context",
  "listing_status",
  "approvals",
  "bot_proposals_read",
  "bot_proposals_decide",
  "bot_proposals_assign",
  "issue_queue",
  "bot_audit_read",
  "staff_self",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

const SUPPORT_PERMISSIONS: readonly StaffPermission[] = [
  "contact_submissions",
  "booking_detail_read",
  "bot_audit_read",
  "staff_self",
];

const MODERATOR_PERMISSIONS: readonly StaffPermission[] = [
  "message_reports",
  "report_context",
  "listing_status",
  "bot_proposals_read",
  "staff_self",
];

const REGIONAL_MANAGER_PERMISSIONS: readonly StaffPermission[] = [
  "listing_status",
  "approvals",
  "bot_proposals_read",
  "bot_proposals_decide",
  "bot_proposals_assign",
  "issue_queue",
  "staff_self",
];

/** Permissions a role holds. `"all"` is owner, platform_admin and the `admin` alias. Unknown ⇒ nothing. */
export function permissionsForRole(
  role: string | null | undefined,
): readonly StaffPermission[] | "all" {
  if (isAdminRole(role)) return "all";
  if (role === "regional_manager") return REGIONAL_MANAGER_PERMISSIONS;
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
  // Slice 0 — approvals (market-scoped in the handler).
  { method: "GET", pattern: /^\/api\/admin\/provider-applications$/, permission: "approvals" },
  { method: "PATCH", pattern: /^\/api\/admin\/provider-applications\/[^/]+\/status$/, permission: "approvals" },
  { method: "GET", pattern: /^\/api\/admin\/provider-services\/pending$/, permission: "approvals" },
  { method: "POST", pattern: /^\/api\/admin\/provider-services\/[^/]+\/(?:approve|reject)$/, permission: "approvals" },
  // Slice 0 — the bot-proposal queue (market-scoped; a moderator reads its assigned rows only).
  { method: "GET", pattern: /^\/api\/admin\/bot-proposals$/, permission: "bot_proposals_read" },
  { method: "POST", pattern: /^\/api\/admin\/bot-proposals\/[^/]+\/(?:approve|reject)$/, permission: "bot_proposals_decide" },
  { method: "POST", pattern: /^\/api\/admin\/bot-proposals\/[^/]+\/assign$/, permission: "bot_proposals_assign" },
  // Slice 0 — the per-market issue queue, the bot audit log, a staff member's own role and markets.
  { method: "GET", pattern: /^\/api\/admin\/issue-queue$/, permission: "issue_queue" },
  { method: "GET", pattern: /^\/api\/admin\/bot-audit$/, permission: "bot_audit_read" },
  { method: "GET", pattern: /^\/api\/admin\/staff\/me$/, permission: "staff_self" },
];

/**
 * OWNER-ONLY writes (Addendum A v2): money rails (refunds, disputes, payouts, invoices, reconciliation
 * writes, webhook replay, paid entitlements), fee bands and fees, platform settings (the feature flags
 * live there), bot keys, and role/market grants. platform_admin is refused these at the blanket guard; a
 * read (GET) of the same area stays with platform_admin. A route added under one of these paths is
 * owner-only by pattern, never by remembering to add it.
 */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export const OWNER_ONLY_ROUTE_PATTERNS: readonly RegExp[] = [
  /^\/api\/admin\/bookings\/[^/]+\/(?:exception-refund|out-of-band-refund\/clear|lost-chargeback\/reconcile)$/,
  /^\/api\/admin\/bookings\/(?:service|legacy|liteapi)\/[^/]+\/resolve$/,
  /^\/api\/admin\/disputes\/[^/]+\/(?:refund-rejected-artifact|reject|uphold)$/,
  /^\/api\/admin\/ready-made\/disputes\/[^/]+\/(?:refund|dismiss)$/,
  /^\/api\/admin\/payouts(?:\/.*)?$/,
  /^\/api\/admin\/invoices(?:\/.*)?$/,
  /^\/api\/admin\/fee-bands(?:\/.*)?$/,
  /^\/api\/admin\/fee-config(?:\/.*)?$/,
  /^\/api\/admin\/optimization-fees(?:\/.*)?$/,
  /^\/api\/admin\/users\/[^/]+\/commission-override$/,
  /^\/api\/admin\/trip-pass\/issue$/,
  /^\/api\/admin\/affiliate\/reconciliation(?:\/.*)?$/,
  /^\/api\/admin\/webhook-events\/[^/]+\/replay$/,
  /^\/api\/admin\/platform-settings(?:\/.*)?$/,
  /^\/api\/admin\/bot-accounts(?:\/.*)?$/,
  /^\/api\/admin\/staff\/[^/]+\/(?:role|markets)$/,
];

/** True when this request is an owner-only write. */
export function isOwnerOnlyRoute(method: string, url: string): boolean {
  if (!MUTATING.has(method.toUpperCase())) return false;
  const path = adminRequestPath(url);
  return OWNER_ONLY_ROUTE_PATTERNS.some((p) => p.test(path));
}

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
 * Blanket-guard decision. The owner passes every path. platform_admin (and `admin`) pass every path
 * but the owner-only writes. Every other staff role passes only a mapped route whose permission it
 * holds — never an owner-only write. Everyone else fails closed.
 */
export function staffMayPassBlanketGuard(
  role: string | null | undefined,
  method: string,
  url: string,
): boolean {
  if (isOwnerRole(role)) return true;
  if (isOwnerOnlyRoute(method, url)) return false;
  if (isAdminRole(role)) return true;
  const permission = permissionForStaffRoute(method, url);
  if (!permission) return false;
  return staffHasPermission(role, permission);
}
