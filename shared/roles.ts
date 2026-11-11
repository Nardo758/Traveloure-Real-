/**
 * shared/roles.ts — the ONE canonical `users.role` vocabulary (role-vocabulary audit, Jul 27 2026;
 * completes the never-executed V.4 normalization).
 *
 * Ground truth (what the DB actually stores — verified against live role distribution):
 *   expert-family: "expert" | "local_expert" | "travel_expert" | "event_planner"
 *   provider:      "service_provider"          (the bare string "provider" is NEVER a stored role —
 *                                               `role === "provider"` comparisons are always false)
 *   other:         "executive_assistant" | "admin" | "support" | "moderator" | "user"
 *   staff:         "admin" | "support" | "moderator"  (admin is unchanged; support and moderator
 *                  are additive — they are not earners and they are not a replacement for admin)
 *
 * Console-family decisions this module encodes (do not fork per-file lists again):
 *   • executive_assistant is NOT expert-family. The EA console (/ea/*, isEA guard) is its own
 *     ratified surface (§9 EA activation); the client has always excluded EA from EXPERT_ROLES.
 *     Server lists that included EA in the expert family (role-rbac.ts, expert-workspace
 *     requireExpert) diverged from that — they now import from here.
 *   • "provider" (bare) is a CLIENT-SIDE routing token only (ProtectedRoute requiredRole="provider",
 *     ServiceForm role prop). It must never be compared against users.role.
 *
 * Before this module, the codebase carried at least five divergent expert-family lists and seven
 * always-false `role === "provider"` comparisons — including commission routing that silently sent
 * every provider-owned booking through the expert split. Every role-membership check must import
 * from here; a new hand-written role list is a defect.
 */

export const EXPERT_ROLES = ["expert", "local_expert", "travel_expert", "event_planner"] as const;
export const PROVIDER_ROLES = ["service_provider"] as const;
export const EARNER_ROLES = [...EXPERT_ROLES, ...PROVIDER_ROLES] as const;

export type ExpertRole = (typeof EXPERT_ROLES)[number];
export type ProviderRole = (typeof PROVIDER_ROLES)[number];
export type EarnerRole = (typeof EARNER_ROLES)[number];

/** True iff `role` is one of the expert-family stored roles (NOT executive_assistant). */
export function isExpertRole(role: string | null | undefined): boolean {
  return role != null && (EXPERT_ROLES as readonly string[]).includes(role);
}

/** True iff `role` is a provider stored role ("service_provider" — never bare "provider"). */
export function isProviderRole(role: string | null | undefined): boolean {
  return role != null && (PROVIDER_ROLES as readonly string[]).includes(role);
}

/** True iff `role` can earn on the platform (expert-family or provider). */
export function isEarnerRole(role: string | null | undefined): boolean {
  return isExpertRole(role) || isProviderRole(role);
}

/**
 * Staff roles (slice 0, Addendum A v2). `owner` holds every power; `platform_admin` every power
 * except the owner-only routes; `admin` is an alias of `platform_admin` for one release (migration
 * 444 rewrites the stored value). `regional_manager`, `moderator` and `support` pass only what the
 * permission map in `shared/staff-permissions.ts` gives them. None of these earn. A hand-written
 * copy of this list is a defect — email-merge refusal and the staff gate both import it.
 */
export const STAFF_ROLES = ["owner", "platform_admin", "admin", "regional_manager", "support", "moderator"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** True iff `role` is a stored staff role. */
export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return role != null && (STAFF_ROLES as readonly string[]).includes(role);
}

/**
 * The roles that pass an admin-only check: owner, platform_admin, and the `admin` alias. This is
 * the ONE answer to "is this an admin?" — every former `role === "admin"` comparison reads it. What
 * the owner alone may do is decided by the blanket guard (`staffMayPassBlanketGuard`), not here.
 */
export const ADMIN_ROLES = ["owner", "platform_admin", "admin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** A type predicate, so a check like `if (!user || !isAdminRole(user.role)) return` narrows `user.role` as `=== "admin"` did. */
export function isAdminRole(role: string | null | undefined): role is AdminRole {
  return role != null && (ADMIN_ROLES as readonly string[]).includes(role);
}

/** True only for the owner. Money rails, fee bands, settings, bot keys and grants read this. */
export function isOwnerRole(role: string | null | undefined): boolean {
  return role === "owner";
}

/** The `admin` alias reads as `platform_admin` (one release). Any other value is returned as is. */
export function canonicalStaffRole(role: string | null | undefined): string | null {
  if (role == null) return null;
  return role === "admin" ? "platform_admin" : role;
}

/** The roles an owner may grant through POST /api/admin/staff/:userId/role. Never owner, never an earner role. */
export const GRANTABLE_STAFF_ROLES = ["platform_admin", "regional_manager", "moderator", "support"] as const;
export type GrantableStaffRole = (typeof GRANTABLE_STAFF_ROLES)[number];

/** Staff roles whose powers are limited to assigned markets (staff_market_assignments). */
export const MARKET_SCOPED_ROLES = ["regional_manager", "moderator"] as const;
export function isMarketScopedRole(role: string | null | undefined): boolean {
  return role != null && (MARKET_SCOPED_ROLES as readonly string[]).includes(role);
}
