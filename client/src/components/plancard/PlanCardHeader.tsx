import * as React from "react";
import { MetricStrip } from "./MetricStrip";
import { getDestinationPhoto } from "./plancard-types";

/**
 * PlanCardHeader — shared header used by the summary card and the full Trip Card. Held-batch-1
 * item 28 (boards rev 15, TripCard): a NAVY cover (#0D2137) with a navy scrim over the photo,
 * the Fraunces title and, on a final plan, the gold "Trip Card · final vN" eyebrow.
 *
 * L4 trip-card honesty (ledger `2026-09-07-trip-card-honesty`): `getDestinationPhoto` now
 * returns NULL for a destination with no curated photo (the generic `travel` fallback was a
 * photo of nowhere — the §13 lie). With no photo the header draws its TYPOGRAPHIC block — the
 * navy gradient, the serif title, the 📍 line — as the intended rendering, not a broken image.
 */
export interface PlanCardHeaderMetrics {
  days: React.ReactNode;
  activities: React.ReactNode;
  legs: React.ReactNode;
  transitTime: React.ReactNode;
}

interface PlanCardHeaderProps {
  title: string;
  destination: string;
  /** preformatted, e.g. "12 Jun – 19 Jun" */
  dateRange: string;
  /** null ⇒ no status pill (R321 S11-7: a finalized plan's card shows its "Final · vN" chip, not "Planning"). */
  statusLabel: string | null;
  metrics: PlanCardHeaderMetrics;
  /** optional "Expert: Sofia C." line appended to the location row */
  expertName?: string | null;
  /**
   * Ledger `2026-09-07-trip-card-one-page` (brief §7 anatomy: "dates · market · timezone · party ·
   * advisor"). Both are OPTIONAL and OMITTED when absent (§13): the zone line is
   * `slipZoneLine(trips.timezone)` — NULL when the plan's zone was never captured (Locked
   * Decision 30: never UTC, never a guess) — and the party label is `partyCountLabel(...)`, ""
   * when the party was never stated. Neither is derived here; the caller passes the ONE
   * derivation's answer (§18 rule 1).
   */
  zoneLine?: string | null;
  partyLabel?: string | null;
  /**
   * Held-batch-1 item 28: the gold eyebrow over the title ("Trip Card · final v1"), from
   * `tripCardEyebrow`. NULL ⇒ no eyebrow.
   */
  eyebrow?: string | null;
  /** extra pills next to the status (e.g. "Expert review pending") */
  badges?: React.ReactNode;
  /** top-right region (countdown, delete, share…) */
  topRight?: React.ReactNode;
  testId?: string;
}

export function PlanCardHeader({
  title,
  destination,
  dateRange,
  statusLabel,
  metrics,
  expertName,
  zoneLine,
  partyLabel,
  badges,
  topRight,
  testId,
  eyebrow,
}: PlanCardHeaderProps) {
  const photoUrl = getDestinationPhoto(destination);

  const cells = [
    { label: "Days", value: metrics.days },
    { label: "Activities", value: metrics.activities },
    { label: "Transit legs", value: metrics.legs },
    { label: "Transit time", value: metrics.transitTime },
  ];

  return (
    <div
      className="relative overflow-hidden text-white px-4 pt-4 pb-3 bg-[#0D2137]"
      data-testid={testId}
      data-hero={photoUrl ? "photo" : "typographic"}
    >
      {/* Destination photo */}
      {photoUrl && (
        <img
          src={photoUrl}
          alt={destination}
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          data-testid={testId ? `${testId}-photo` : undefined}
        />
      )}

      {/* Dark scrim — the mockup's `.phead` is solid dark, so the photo reads as a subtle
          texture, never a bright field the white title can wash out against (Phase 2b: the title
          now sits at the TOP of the header, over what used to be the lightest part of the scrim). */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0D2137]/95 via-[#0D2137]/80 to-[#0D2137]/60" />

      {/* Content sits above the scrim */}
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {statusLabel && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white/15 text-white border border-white/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                ⚡ {statusLabel}
              </span>
            )}
            {badges}
          </div>
          {topRight && <div className="flex-shrink-0 text-right">{topRight}</div>}
        </div>

        {eyebrow ? (
          <div
            className="mt-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#E8B339]"
            data-testid={testId ? `${testId}-eyebrow` : undefined}
          >
            {eyebrow}
          </div>
        ) : null}
        <h2
          className={`${eyebrow ? "mt-1" : "mt-2"} font-['Fraunces',Georgia,serif] text-[24px] font-semibold leading-[1.1] pr-2 text-white`}
          data-testid={testId ? `${testId}-title` : undefined}
        >
          {title}
        </h2>
        <div
          className="mt-1 text-[13px] text-[#D7E0E8]"
          data-testid={testId ? `${testId}-meta` : undefined}
        >
          {/* QA F13: the range is its own node so a walkthrough can read the days the card
              claims without also matching the destination or the expert's name. */}
          📍 {destination} ·{" "}
          <span data-testid={testId ? `${testId}-dates` : undefined}>{dateRange}</span>
          {zoneLine ? (
            <>
              {" · "}
              <span className="font-mono" data-testid={testId ? `${testId}-zone` : undefined}>
                {zoneLine}
              </span>
            </>
          ) : null}
          {partyLabel ? (
            <>
              {" · "}
              <span data-testid={testId ? `${testId}-party` : undefined}>{partyLabel}</span>
            </>
          ) : null}
          {expertName ? (
            <>
              {" · "}
              <span data-testid={testId ? `${testId}-advisor` : undefined}>Expert: {expertName}</span>
            </>
          ) : null}
        </div>

        {/* 4-up metric strip */}
        <MetricStrip cells={cells} className="mt-3" />
      </div>
    </div>
  );
}
