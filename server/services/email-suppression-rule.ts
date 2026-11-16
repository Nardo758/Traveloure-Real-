/**
 * The suppression RULE — pure, and free of the database.
 *
 * Split out of `email-suppression.ts` (N3): that module owns the READ (it imports `db`) and is therefore not
 * importable by a unit test that runs without postgres. The decision itself is a pure function over the
 * reason strings the read returns, so it lives here and the gate re-exports it — one home, no copy.
 */
import { emailStreamForType, suppressionTreatsAsSecurity } from "./email-outbox-classes";

export const SUPPRESSED_HARD_BOUNCE = "suppressed:hard_bounce";
export const SUPPRESSED_COMPLAINT = "suppressed:complaint";
/**
 * N3 (Leon, Nov 15): a traveler who asked not to be contacted. It rides the SAME table and the SAME gate —
 * `reason = "do_not_contact"` — so no schema change is needed (`email_suppressions.reason` is a free-form
 * varchar, migration 423).
 */
export const DO_NOT_CONTACT_REASON = "do_not_contact";
export const SUPPRESSED_DO_NOT_CONTACT = "suppressed:do_not_contact";

/**
 * The refusal reason, or null when this send may continue.
 * reasons are the reason column values for the recipients.
 */
export function suppressionRefusalReason(input: {
  emailType: string;
  authCritical: boolean;
  reasons: readonly string[];
}): string | null {
  const reasons = new Set(input.reasons.filter((reason) => reason.length > 0));
  if (reasons.size === 0) return null;
  const bounce = reasons.has("hard_bounce");
  const complaint = reasons.has("complaint");
  if (emailStreamForType(input.emailType) === "marketing") {
    if (bounce) return SUPPRESSED_HARD_BOUNCE;
    if (complaint) return SUPPRESSED_COMPLAINT;
    const other = Array.from(reasons)[0];
    return `suppressed:${other}`;
  }
  if (suppressionTreatsAsSecurity(input.emailType, input.authCritical)) {
    return bounce ? SUPPRESSED_HARD_BOUNCE : null;
  }
  if (bounce) return SUPPRESSED_HARD_BOUNCE;
  if (complaint) return SUPPRESSED_COMPLAINT;
  // N3: a do-not-contact request refuses TRANSACTIONAL mail too (it is the traveler's own ask, not a
  // deliverability signal), and never blocks security mail above - a password reset still has to arrive.
  if (reasons.has(DO_NOT_CONTACT_REASON)) return SUPPRESSED_DO_NOT_CONTACT;
  return null;
}
