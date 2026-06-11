import * as React from "react";

/**
 * PlanCardHeader — the shared "grown-up" header used by BOTH the summary card
 * and the full control center, so tapping in reads as the card expanding (same
 * header, same metric strip) rather than a jump to a different screen.
 *
 * Built on platform tokens (Tailwind/shadcn) — a neutral dark surface with the
 * theme `primary` accent. No mockup-specific palette/fonts.
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
  const cells: Array<{ label: string; value: React.ReactNode }> = [
    { label: "Days", value: metrics.days },
    { label: "Activities", value: metrics.activities },
    { label: "Transit legs", value: metrics.legs },
    { label: "Transit time", value: metrics.transitTime },
  ];

  return (
    <div className="relative bg-slate-900 text-white px-4 pt-4 pb-3" data-testid={testId}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/20 text-primary-foreground border border-primary/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            ⚡ {statusLabel}
          </span>
          {badges}
        </div>
        {topRight && <div className="flex-shrink-0 text-right">{topRight}</div>}
      </div>

      <h2 className="mt-2 text-[19px] font-semibold leading-tight pr-2" data-testid={testId ? `${testId}-title` : undefined}>
        {title}
      </h2>
      <div className="mt-0.5 text-[12px] text-white/70">
        📍 {destination} · {dateRange}
        {expertName ? ` · Expert: ${expertName}` : ""}
      </div>

      {/* 4-up metric strip — identical in both stages */}
      <div className="mt-3 grid grid-cols-4 text-center">
        {cells.map((c, i) => (
          <div key={c.label} className={i > 0 ? "border-l border-white/10" : ""}>
            <div className="text-[15px] font-semibold leading-none">{c.value}</div>
            <div className="mt-1 text-[9px] uppercase tracking-wide text-white/55">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
