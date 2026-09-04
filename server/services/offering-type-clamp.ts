/**
 * The offering-type clamp, said out loud.
 *
 * Ledger `2026-09-04-earn-planner-roles`, CLAUDE.md Locked Decision 36.
 *
 * `local_expert_forms.offering_type_key` FKs into `expert_offering_types` and
 * `service_provider_forms.offering_type_key` FKs into `service_offering_types` (migration 107,
 * two separate FKs — §4, the catalogs are never merged). The key rides in from the /earn card's
 * URL param, so a stale or cross-catalog link can carry a value the FK target does not hold.
 * The storage writers CLAMP such a key to NULL rather than failing the whole application, and
 * that is the right call: an applicant must never lose a signup because a shared link went stale.
 *
 * What was wrong is that the clamp was SILENT. Nothing logged it and nothing told the applicant,
 * so the platform recorded "this person picked no offering" and looked, from every later surface,
 * exactly like a person who genuinely picked none. §13: an absent answer and a refused answer are
 * different facts and must not render the same.
 *
 * This module holds the one derivation the ROUTE needs — and deliberately nothing else. The
 * clamp RULE itself stays in the storage writer (layer 2, where every caller is covered); the
 * route does not re-decide it, it READS the row the writer returned and compares. A second copy
 * of the rule in the route is the derivation-drift class §18 rule 1 names, and it would drift the
 * moment the clamp learned a new case.
 */

/**
 * The key the request asked for, when the stored row did NOT keep it — otherwise `null`.
 *
 * Purely a comparison of what was sent against what the server actually stored: no catalog is
 * consulted and no rule is restated here.
 *
 * `null` covers all three honest "nothing to say" cases: the request named no offering; the
 * offering was stored as asked; or the row somehow came back carrying a DIFFERENT key, which is
 * not a clamp and must not be reported as one.
 */
export function offeringKeyUnrecorded(
  requestedKey: string | null | undefined,
  storedKey: string | null | undefined,
): string | null {
  if (!requestedKey) return null;
  if (storedKey) return null;
  return requestedKey;
}
