/**
 * shared/roles.ts — the ONE canonical `users.role` vocabulary (role-vocabulary audit, Jul 27 2026;
 * completes the never-executed V.4 normalization).
 *
 * Ground truth (what the DB actually stores — verified against live role distribution):
 *   expert-family: "expert" | "local_expert" | "travel_expert" | "event_planner"
 *   provider:      "service_provider"          (the bare string "provider" is NEVER a stored role —
 *                                               `role === "provider"` comparisons are always false)
 *   other:         "executive_assistant" | "admin" | "user"
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
