/**
 * QA FREE OPTIMIZE RUNS = AN ADMIN-ISSUED, ZERO-CHARGE TRIP PASS (ledger `2026-10-08-qa-trip-pass-issue`;
 * decision-maker, Oct 8, 2026 — the replan: no new run basis, no new table).
 *
 * `POST /api/admin/trip-pass/issue {userId, tripId, reason}` (admin only, §2's blanket guard) grants an
 * ordinary Trip Pass with `source: 'qa'` — so the EXISTING `trip_pass` run authorization, the EXISTING
 * 5-run cap and the EXISTING per-run fee + `fee_waiver` pair do all the work, and nothing in the run path
 * changes. Issued ONLY to an account whose email domain EQUALS `QA_ACCOUNT_EMAIL_DOMAIN` (operator
 * secret, read by name — no domain literal in code), on a plan that account OWNS. Unset ⇒ every issue
 * is refused. No ledger row, no Stripe object, no payment id at issue (option a): the pass row records
 * why it exists (`source: 'qa'`, the admin's reason and id in its frozen snapshot).
 *
 * The one-active-pass-per-plan index is untouched: a plan whose pass is spent is not re-issued — QA uses
 * a new plan (the grant is then a clean no-op and says so: `created: false`).
 */
export type QaIssueRefusal =
  | "qa_domain_unset"
  | "user_not_found"
  | "not_qa_domain"
  | "trip_not_found"
  | "not_trip_owner";

export type QaIssueOutcome =
  | { ok: true; created: boolean; tripId: string; source: "qa" }
  | { ok: false; refusal: QaIssueRefusal };

/** Pure. The domain of an email address, lower-cased; null for anything that is not one. */
export function emailDomain(email: string | null | undefined): string | null {
  const s = (email ?? "").trim().toLowerCase();
  const at = s.lastIndexOf("@");
  if (at <= 0 || at === s.length - 1) return null;
  return s.slice(at + 1);
}

/** Pure. Is this account on the QA domain? Exact match only — never a suffix, never a guess. */
export function isQaDomainAccount(email: string | null | undefined, qaDomain: string | null | undefined): boolean {
  const want = (qaDomain ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!want) return false;
  return emailDomain(email) === want;
}

export interface QaIssueDeps {
  qaDomain: () => string | null | undefined;
  getUser: (userId: string) => Promise<{ id: string; email: string | null } | null>;
  getTrip: (tripId: string) => Promise<{ id: string; userId: string | null } | null>;
  /** The plan row's allowances, frozen into the snapshot like a sold pass's. */
  passAllowances: () => Promise<{ allowances: Record<string, unknown>; name: string }>;
  grant: (input: { tripId: string; source: "qa"; allowancesSnapshot: Record<string, unknown> }) => Promise<{ created: boolean }>;
  now?: () => Date;
}

export async function issueQaTripPass(
  input: { userId: string; tripId: string; reason: string; issuedBy: string },
  deps: QaIssueDeps,
): Promise<QaIssueOutcome> {
  const qaDomain = deps.qaDomain();
  if (!(qaDomain ?? "").trim()) return { ok: false, refusal: "qa_domain_unset" };
  const user = await deps.getUser(input.userId);
  if (!user) return { ok: false, refusal: "user_not_found" };
  if (!isQaDomainAccount(user.email, qaDomain)) return { ok: false, refusal: "not_qa_domain" };
  const trip = await deps.getTrip(input.tripId);
  if (!trip) return { ok: false, refusal: "trip_not_found" };
  if (trip.userId !== user.id) return { ok: false, refusal: "not_trip_owner" };
  const plan = await deps.passAllowances();
  const { created } = await deps.grant({
    tripId: trip.id,
    source: "qa",
    allowancesSnapshot: {
      ...plan.allowances,
      planName: plan.name,
      // Zero-charge: nothing was paid, and no PaymentIntent exists (§19a).
      priceCentsPaid: 0,
      issuedReason: input.reason,
      issuedBy: input.issuedBy,
      issuedAt: (deps.now?.() ?? new Date()).toISOString(),
    },
  });
  return { ok: true, created, tripId: trip.id, source: "qa" };
}

/** HTTP status for each refusal: an unknown account or plan is 404; every other refusal is 403. */
export function qaIssueRefusalStatus(r: QaIssueRefusal): 403 | 404 {
  return r === "user_not_found" || r === "trip_not_found" ? 404 : 403;
}
