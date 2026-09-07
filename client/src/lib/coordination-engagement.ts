/**
 * ONE derivation of how a done-for-you coordination engagement (`coordination_states`) READS.
 *
 * Ledger `2026-09-07-my-events-fold` (CLAUDE.md Locked Decision 45 (5); Console & AI Concierge
 * brief §10 row L8). The engagement used to be readable in exactly one place — `/my-events` — so
 * its title, status word and fee word were spelled inside that page. Ruling 5 puts the engagement
 * on ITS PLAN'S slip as well, and two surfaces spelling one fact two ways is the derivation-drift
 * class §18 rule 1 names. So the words live here and BOTH surfaces read them.
 *
 * NOTHING HERE TOUCHES MONEY. There is no amount, no rate, no fee literal and no charge decision
 * in this file: the fee is quoted and charged server-side (§14) by the rail `/my-events` already
 * owns, which this lane leaves exactly as it was. `engagementFee` names the STATE of that rail's
 * outcome — a word, never a number.
 */

/** The fields both surfaces read off a `/api/coordination-states` row. */
export interface CoordinationEngagementRow {
  id: string;
  /** Nullable in the schema — an engagement can exist with no plan behind it. */
  tripId?: string | null;
  experienceType?: string | null;
  status?: string | null;
  feePaymentStatus?: string | null;
}

export type EngagementFeeTone = "paid" | "refunded" | "pending" | "due";

/** `milestone_birthday` → `Milestone Birthday`. The spelling `/my-events` has always used. */
export function engagementTitleCase(raw: string): string {
  return raw.replace(/(^|[_\s-])(\w)/g, (_m, _sep, c: string) => " " + c.toUpperCase()).trim();
}

/**
 * The card's heading.
 *
 * §13: a row that names no experience type is titled "Coordination" — what we KNOW it is — rather
 * than a guessed occasion. It is never rendered as an empty leading space before the noun.
 */
export function engagementTitle(engagement: CoordinationEngagementRow): string {
  const raw = (engagement.experienceType ?? "").trim();
  if (!raw) return "Coordination";
  return `${engagementTitleCase(raw)} coordination`;
}

/**
 * The status word, or `null`.
 *
 * §13: the column is nullable, so a row that states no status draws NO badge. Rendering the DB's
 * own `intake` default for a NULL would put a stage on screen that the coordinator never recorded.
 */
export function engagementStatusLabel(status: string | null | undefined): string | null {
  const raw = (status ?? "").trim();
  if (!raw) return null;
  return engagementTitleCase(raw);
}

/**
 * The fee word and its tone. The four states are the ones the column's own CHECK plus the refund
 * path can hold (`unpaid | pending | paid`, and `refunded`).
 *
 * §13: an UNRECOGNISED value is reported as `due` with the neutral "Fee due" wording — the state
 * in which a traveler still has something to do — and never silently as "Fee paid". `unpaid` and
 * an absent value read the same because they are the same fact: nothing has been charged.
 */
export function engagementFee(feePaymentStatus: string | null | undefined): {
  label: string;
  tone: EngagementFeeTone;
} {
  switch ((feePaymentStatus ?? "").trim()) {
    case "paid":
      return { label: "Fee paid", tone: "paid" };
    case "refunded":
      return { label: "Fee refunded", tone: "refunded" };
    case "pending":
      return { label: "Payment in progress", tone: "pending" };
    default:
      return { label: "Fee due", tone: "due" };
  }
}

/**
 * The engagements that belong to ONE plan.
 *
 * §13, and it is the point of the fold: `coordination_states.trip_id` is NULLABLE, so an
 * engagement with no plan has NO slip to render on. It is not attached to the nearest-looking
 * plan and it is not dropped from the product — it keeps rendering where it renders today, on
 * `/my-events`, which stays routed for exactly that reason.
 *
 * The caller supplies rows from `GET /api/coordination-states`, which is scoped to the SESSION
 * user server-side (§14) — this filter narrows an already-owned list and grants nothing.
 */
export function engagementsForPlan(
  rows: readonly CoordinationEngagementRow[] | null | undefined,
  tripId: string | null | undefined,
): CoordinationEngagementRow[] {
  const plan = (tripId ?? "").trim();
  if (!plan) return [];
  return (rows ?? []).filter((r) => (r?.tripId ?? "") === plan);
}
