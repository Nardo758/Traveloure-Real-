/**
 * SetPlanDates — THE MOMENT A TRAVELER PICKS REAL DATES.
 *
 * Punchlist **R-4**, migration 302, ledger `2026-09-15-d22-dates-confirmed`; CLAUDE.md §13, §19,
 * Locked Decisions 30, 34, 42 D16.
 *
 * WHAT WAS MISSING, and it is the whole of R-4's blocker. Dates reached a `trips` row at MINT and
 * never again. The one plan modal's step 3 writes its dates into the `trip_contexts` jsonb for a
 * plan that already exists; `PATCH /api/trips/:tripId/occasion` carries no dates at all; and the
 * owner-gated `PATCH /api/trips/:id` — which always could have taken them — had NO client caller:
 * `useUpdateTrip` had zero call sites anywhere in `client/`, `e2e/` or `playwright/`. So a plan
 * born on a placeholder window (a ready-made clone's `new Date()` + `duration_days - 1`, an
 * authoring build's synthetic anchor, a cart mint's today-fallback) could never stop being one.
 * This is that caller.
 *
 * ONE WRITER, NOT A SECOND RAIL (§18 rule 1). It calls `useUpdateTrip`, which posts to the ONE
 * re-date rail, which writes through `storage.updateTrip` — so Locked Decision 30's `timezone`
 * derivation and Locked Decision 42 D12's `market_slug` one still hang off the same write, and the
 * `dates_confirmed_at` stamp is applied SERVER-SIDE by that one writer. This component sends
 * `startDate` and `endDate` and NOTHING ELSE: a client may change its dates and may never certify
 * them (§19 — `insertTripSchema` omits the column and no pick re-admits it).
 *
 * OWNER ONLY (Locked Decision 42 D16). The slip's edit controls are the owner's; an advisor reads,
 * notes, suggests and messages. The render rule is not the thing that keeps a write out — the
 * route's own gate is — but an advisor pressing "Set your dates" would be choosing the traveler's
 * dates for them, which is not a thing this product does.
 *
 * §13 — WHAT IT SAYS AND WHAT IT REFUSES TO SAY.
 *   * The CHIP, the NOTE and the CTA come from `planDatesLabel` (`shared/plan-dates.ts`) — the ONE
 *     derivation, so the slip, the Trip Card and any later surface word this the same way.
 *   * A CONFIRMED plan renders NOTHING here. "Confirmed dates" is a label nobody needs and the
 *     unmarked case must stay the quiet one.
 *   * The inputs are PRE-FILLED from the plan's current window, and that is honest precisely
 *     because the window is visible beside them: it is a SHOWN DEFAULT the traveler can overwrite,
 *     and nothing is written until they press Save (the one confirmation point Locked Decision 38
 *     draws for the home-city default).
 *   * An inverted range is REFUSED in the panel rather than repaired. The server refuses it too;
 *     saying so here means the traveler learns which end was wrong instead of watching a request
 *     fail.
 *
 * LANE E1 (ledger `2026-10-08-e1-zero-questions`, ruling 6; decision-maker, Oct 8, 2026 — option 1):
 * the chip keeps the Empty board's subline placement and opens the slip's INLINE dates panel
 * (`InlineDatesPanel`, `@/components/plan/SlipAnchorPanels`) through `onSetDates` — nothing leaves the
 * slip. The dates dialog this file used to hold is DELETED (§18c): the chip and the free draft were
 * its only callers, and both now ask through the one inline panel, which writes the same single
 * re-date rail (`PATCH /api/trips/:id`, `startDate` + `endDate` and nothing else).
 */
import { planDatesLabel, type PlanDatesConfirmedAt } from "@shared/plan-dates";

export interface SetPlanDatesProps {
  tripId: string;
  /** `trips.start_date` as the DTO carries it. NOT NULL on the row, so this is always a real day. */
  startDate: string | Date | null | undefined;
  endDate: string | Date | null | undefined;
  /** The plancard DTO's `trip.datesConfirmed` (a boolean), or the raw stamp on a server-ish caller. */
  datesConfirmedAt: PlanDatesConfirmedAt;
  /** Locked Decision 42 D16 — the CTA is the owner's and nobody else's. */
  isOwner: boolean;
  /** Lane E1 (ruling 6): opens the slip's INLINE dates panel (the slip header passes it). */
  onSetDates?: () => void;
}

/**
 * THE OWNER'S "Set your dates" CHIP — the Empty board's header chip (slip conformance, ledger
 * `2026-10-08-conformance-slip-phase0`). It sits under the subline that already says "Dates not set
 * yet", so it draws ONLY the coral-outline pill. A confirmed plan, or a viewer who is not the owner,
 * gets nothing (D16).
 */
export function SetPlanDates({ datesConfirmedAt, isOwner, onSetDates }: SetPlanDatesProps) {
  const label = planDatesLabel(datesConfirmedAt, isOwner);

  if (label.confirmed || !label.cta) return null;

  return (
    <button
      type="button"
      onClick={() => onSetDates?.()}
      className="inline-flex h-[34px] items-center rounded-[var(--slip-radius-chip)] border border-[color:var(--slip-primary)] bg-[color:var(--slip-card)] px-3 text-[13px] font-semibold text-[color:var(--slip-primary)] hover:bg-[color:var(--slip-ground)]"
      data-testid="slip-dates-set-cta"
    >
      {label.cta}
    </button>
  );
}
