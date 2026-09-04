/**
 * role-transition.ts — ONE account, ONE earning role.
 *
 * Ledger `2026-09-04-earn-role-safety` (decision-maker ratified Sep 4, 2026).
 *
 * `users.role` is a SINGLE varchar (`shared/models/auth.ts`), so an account holds exactly one
 * role at a time. Until this landed, `updateUserRole` overwrote it unconditionally and BOTH
 * approval handlers (`PATCH /api/admin/provider-applications/:id/status` and
 * `PATCH /api/admin/expert-applications/:id/status`) called it — so approving a second
 * application on an account that already earned under the other family SILENTLY DESTROYED the
 * first role. The former console's guards then failed closed with no record of what happened and
 * nothing in the product to put it back.
 *
 * The refusal is a REFUSAL, not a merge: this module never invents a combined role and never
 * picks a winner. It names the role the account already holds and stops (§13 — an honest
 * "already has a role" beats a silent overwrite that looks like a successful approval).
 *
 * ONE implementation, THREE callers (§18 rule 1 — a second copy of this decision is
 * derivation drift):
 *   1. `updateUserRole` (`server/services/admin-query.service.ts`) — the enforcement point.
 *      Runs INSIDE the role/audit transaction, so no caller can bypass it.
 *   2/3. the two approval handlers — a PRE-CHECK before the form-status flip, so a refusal never
 *      leaves the form row half-updated (the existing revert-on-failure shape keeps holding as
 *      the backstop for everything else).
 *
 * FAMILIES. Three mutually exclusive earning families, from the canonical vocabulary in
 * `shared/roles.ts` (never a hand-written role list — that module exists because the codebase
 * once carried five divergent copies):
 *   • expert              — EXPERT_ROLES (expert, local_expert, travel_expert, event_planner)
 *   • provider            — PROVIDER_ROLES (service_provider)
 *   • executive_assistant — its own family; the EA console (/ea/*) is a ratified separate
 *                           surface and EA is deliberately NOT expert-family (shared/roles.ts).
 *
 * WHAT IS ALLOWED, deliberately:
 *   • `user` (or null, or `admin`) → anything. A first approval is the normal path, and an admin
 *     demoting/repairing an account must never be blocked by this rule.
 *   • same family → same family (travel_expert → local_expert). That is a re-evaluation of one
 *     application by review, not a second earning role.
 *   • the same role again — an idempotent re-approval must stay a no-op, not a 409.
 *   • → a NON-earning role (`user`, `admin`). Removing the existing role is exactly how an
 *     account is freed up for the other family, so it must never be refused.
 */
import { EXPERT_ROLES, PROVIDER_ROLES } from "../../shared/roles";

/** The three mutually exclusive earning families. `null` = not an earning role. */
export type RoleFamily = "expert" | "provider" | "executive_assistant";

const EA_ROLE = "executive_assistant";

/** Human-readable names used in the refusal message — the admin must see WHICH role blocks them. */
const ROLE_LABELS: Record<string, string> = {
  expert: "Expert",
  travel_expert: "Trip Planner",
  local_expert: "Local Expert",
  event_planner: "Event Planner",
  service_provider: "Service Provider",
  executive_assistant: "Executive Assistant",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "none";
  return ROLE_LABELS[role] ?? role;
}

/**
 * The earning family a stored `users.role` belongs to, or `null` when the role does not earn
 * (`user`, `admin`, anything unrecognised — an unknown legacy string is deliberately treated as
 * NOT an earning role rather than guessed into a family: §13, never invent the answer).
 */
export function roleFamily(role: string | null | undefined): RoleFamily | null {
  if (!role) return null;
  if ((EXPERT_ROLES as readonly string[]).includes(role)) return "expert";
  if ((PROVIDER_ROLES as readonly string[]).includes(role)) return "provider";
  if (role === EA_ROLE) return "executive_assistant";
  return null;
}

/** Thrown by `assertRoleTransitionAllowed`. Carries the HTTP status the callers surface. */
export class RoleTransitionError extends Error {
  readonly statusCode = 409;
  readonly currentRole: string;
  readonly attemptedRole: string;
  constructor(currentRole: string, attemptedRole: string, message: string) {
    super(message);
    this.name = "RoleTransitionError";
    this.currentRole = currentRole;
    this.attemptedRole = attemptedRole;
  }
}

/**
 * True iff `currentRole` → `nextRole` is a legal single-role transition.
 * Pure predicate — the throwing wrapper below is what callers use.
 */
export function isRoleTransitionAllowed(
  currentRole: string | null | undefined,
  nextRole: string,
): boolean {
  if (currentRole === nextRole) return true; // idempotent re-approval
  const from = roleFamily(currentRole);
  const to = roleFamily(nextRole);
  // Not currently earning, or not moving INTO an earning role ⇒ nothing to protect.
  if (from === null || to === null) return true;
  return from === to;
}

/**
 * Refuse (409) when the account already holds an APPROVED earning role of a DIFFERENT family.
 * No-op when the transition is legal.
 */
export function assertRoleTransitionAllowed(
  currentRole: string | null | undefined,
  nextRole: string,
): void {
  if (isRoleTransitionAllowed(currentRole, nextRole)) return;
  const current = currentRole as string;
  throw new RoleTransitionError(
    current,
    nextRole,
    `This account is already an approved ${roleLabel(current)}. ` +
      `One account holds one earning role, so it cannot also become a ${roleLabel(nextRole)}. ` +
      `Remove the existing ${roleLabel(current)} role first, or have the applicant use a separate account.`,
  );
}

/**
 * Decision 3 (same ledger row) — EVERY expert track switch goes through admin review.
 *
 * `PATCH /api/expert/role` writes `users.role`, and each expert type is a SEPARATELY VETTED
 * track (`executive_assistant` additionally grants the /ea/* console). Before this, only
 * `local_expert` was gated and an approved expert could self-promote into any other track,
 * including EA. The gate now covers every `expertTypeEnum` value, using the SAME mechanism the
 * `local_expert` branch already used — a 403 carrying `requiresReview: true` — so there is one
 * review rail, not two.
 *
 * A NULL current type requires review rather than being read as the column default: an unknown
 * current track is not evidence that no switch is happening (§13 — never guess the answer).
 */
export function expertTrackSwitchRequiresReview(
  currentType: string | null | undefined,
  targetType: string,
): boolean {
  return currentType !== targetType;
}
