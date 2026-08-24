import * as React from "react";

/**
 * MetricStrip — the shared N-up metric strip used by BOTH the summary header
 * (PlanCardHeader) and the full-stage photo hero (HeroSection). Same component
 * in both places is what carries the summary↔full "grown-up" continuity.
 *
 * Presentation only: white-on-dark (the parent supplies the dark surface — a
 * slate header or a scrimmed photo hero). Generic over its cells so callers can
 * pass template-aware labels rather than a hardcoded product shape.
 */
export interface MetricCell {
  label: React.ReactNode;
  value: React.ReactNode;
}

export function MetricStrip({ cells, className }: { cells: MetricCell[]; className?: string }) {
  return (
    <div className={`grid text-center ${className ?? ""}`} style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
      {cells.map((c, i) => (
        <div key={i} className={i > 0 ? "border-l border-white/10" : ""}>
          <div className="text-[15px] font-semibold leading-none">{c.value}</div>
          <div className="mt-1 text-[9px] uppercase tracking-wide text-white/55">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
