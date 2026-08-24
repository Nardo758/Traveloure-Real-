/**
 * ONE definition of "may publish" (ruling 53 / amending ruling — QA_PUNCH_LIST.md P0,
 * found Aug 11, 2026). Every enforcement point — the two original gate call sites
 * (POST/PATCH /api/provider/services, via checkPublishVerificationGate in routes.ts),
 * admin approval, the owner's Activate toggle, and the auto-activation sweep — resolves
 * through resolvePublishVerification below. Duplicated branches are exactly what caused
 * this class of bug (be78a9c, then the P0 this file closes) — do not re-implement the
 * role/verification branching anywhere else.
 */
import { db } from "../db";
import { users, serviceProviderForms, localExpertForms, providerServices } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { isExpertRole, isProviderRole } from "@shared/roles";

export interface PublishVerificationResult {
  ok: boolean;
  role: string | null;
  identityVerified: boolean;
  businessVerified: boolean | null;
}

/**
 * Resolves whether `userId` currently satisfies the publish-verification predicate.
 * Takes an ARBITRARY userId — a caller acting on behalf of someone else (admin
 * approving a listing) must pass the LISTING OWNER's id, never the actor's.
 *
 *   - role === "admin"      -> bypass, always ok.
 *   - isProviderRole(role)  -> service_provider_forms row, BOTH identity AND business
 *                              "verified".
 *   - isExpertRole(role)    -> local_expert_forms row, identity "verified" ONLY.
 *                              businessVerified is reported `null` (not applicable —
 *                              no business_verification_status column exists on that
 *                              table; an individual expert is not a business).
 *   - anything else / no form row / role lookup miss -> default-deny (§13: a predicate
 *     that can't be evaluated fails CLOSED, never fabricated as passing).
 */
export async function resolvePublishVerification(userId: string): Promise<PublishVerificationResult> {
  const [userRow] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  const role = userRow?.role ?? null;

  if (role === "admin") {
    return { ok: true, role, identityVerified: true, businessVerified: true };
  }

  if (isProviderRole(role)) {
    const [provForm] = await db
      .select({
        identityVerificationStatus: serviceProviderForms.identityVerificationStatus,
        businessVerificationStatus: serviceProviderForms.businessVerificationStatus,
      })
      .from(serviceProviderForms)
      .where(eq(serviceProviderForms.userId, userId))
      .limit(1);

    const identityVerified = provForm?.identityVerificationStatus === "verified";
    const businessVerified = provForm?.businessVerificationStatus === "verified";
    return { ok: identityVerified && businessVerified, role, identityVerified, businessVerified };
  }

  if (isExpertRole(role)) {
    const [expForm] = await db
      .select({ identityVerificationStatus: localExpertForms.identityVerificationStatus })
      .from(localExpertForms)
      .where(eq(localExpertForms.userId, userId))
      .limit(1);

    const identityVerified = expForm?.identityVerificationStatus === "verified";
    return { ok: identityVerified, role, identityVerified, businessVerified: null };
  }

  // Role in neither family (executive_assistant, plain user, unknown role, or the
  // userId did not resolve to a row at all) -> default-deny.
  return { ok: false, role, identityVerified: false, businessVerified: null };
}

/**
 * Auto-activation sweep (QA_PUNCH_LIST.md P0). When a write newly satisfies
 * resolvePublishVerification for `userId`, promotes that user's HELD listings —
 * approvalStatus='approved' AND status='draft', the by-construction held state that
 * admin approval of an unverified owner's listing now produces — to status='active'.
 *
 * Deliberately does NOT touch approvalStatus='approved' AND status='paused' rows:
 * that combination is owner intent (the owner's own Pause toggle), never the gate's
 * held state, and must never be overridden by a verification event.
 *
 * Idempotent: a listing already 'active' does not match the WHERE clause, so running
 * this twice in a row (or being called from two verification write paths in quick
 * succession) changes nothing on the second call. Safe no-op when the predicate still
 * fails or the user has no held rows.
 */
export async function activateVerificationHeldListings(userId: string): Promise<number> {
  const verification = await resolvePublishVerification(userId);
  if (!verification.ok) return 0;

  const activated = await db
    .update(providerServices)
    .set({ status: "active", updatedAt: new Date() })
    .where(
      and(
        eq(providerServices.userId, userId),
        eq(providerServices.approvalStatus, "approved"),
        eq(providerServices.status, "draft"),
      ),
    )
    .returning({ id: providerServices.id });

  return activated.length;
}
