import * as React from "react";
import { MetricStrip } from "./MetricStrip";
import { getDestinationPhoto } from "./plancard-types";

/**
 * PlanCardHeader — shared header used by the summary card. Shows a destination
 * photo behind a dark-to-transparent scrim (same pattern as HeroSection so the
 * two stages feel continuous). Falls back to a gradient when no photo is found.
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
  statusLabel: string;
  metrics: PlanCardHeaderMetrics;
  /** optional "Expert: Sofia C." line appended to the location row */
  expertName?: string | null;
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
  badges,
  topRight,
  testId,
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
      className="relative overflow-hidden text-white px-4 pt-4 pb-3 bg-gradient-to-br from-slate-900 via-slate-800 to-primary/40"
      data-testid={testId}
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

      {/* Dark scrim — heavier at bottom so text stays readable */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />

      {/* Content sits above the scrim */}
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/20 text-primary-foreground border border-primary/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              ⚡ {statusLabel}
            </span>
            {badges}
          </div>
          {topRight && <div className="flex-shrink-0 text-right">{topRight}</div>}
        </div>

        <h2
          className="mt-2 text-[19px] font-semibold leading-tight pr-2"
          data-testid={testId ? `${testId}-title` : undefined}
        >
          {title}
        </h2>
        <div className="mt-0.5 text-[12px] text-white/80">
          📍 {destination} · {dateRange}
          {expertName ? ` · Expert: ${expertName}` : ""}
        </div>

        {/* 4-up metric strip */}
        <MetricStrip cells={cells} className="mt-3" />
      </div>
    </div>
  );
}
