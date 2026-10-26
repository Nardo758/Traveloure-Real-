/**
 * `PlanCostStrip` — the slip's per-person cost strip (fix-queue row 241; inventory row 221; ledger
 * `2026-10-26-per-person-cost-strip`). The BudgetStrip board's three states, one at a time:
 * A priced so far, B budget set, C nothing priced. The math and every string are
 * `planCostStripView` (client/src/lib/plan-cost-strip.ts); this file only draws them.
 *
 * Mounted once in SlipView, on every plan group, so it takes no group input. It draws no button and
 * no budget editor (Architect ruling, Oct 26, 2026: the plan has no budget path to wire them to).
 * Nothing renders on a plan with zero stops, and a viewer who is not the owner never sees state C.
 */
import type { PlanCardActivity } from "@/components/plancard/plancard-types";
import type { PlanEvent } from "@/lib/slip-events";
import { planCostStripView } from "@/lib/plan-cost-strip";

export interface PlanCostStripProps {
  activities: readonly PlanCardActivity[];
  travelers: number | null;
  planEvents: readonly PlanEvent[];
  isOwner: boolean;
}

const LABEL_ID = "plan-cost-strip-label";

export function PlanCostStrip({ activities, travelers, planEvents, isOwner }: PlanCostStripProps) {
  if (activities.length === 0) return null;
  const view = planCostStripView({ activities, travelers, planEvents });
  if (view.state === "none_priced" && !isOwner) return null;
  const t = view.text;

  if (view.state === "none_priced") {
    return (
      <section
        data-testid="plan-cost-strip"
        data-state={view.state}
        aria-labelledby={LABEL_ID}
        className="flex items-center justify-between gap-3 rounded-[16px] border border-dashed border-[color:var(--slip-line-strong)] bg-[color:var(--slip-card)] px-4 py-[14px]"
      >
        <div className="min-w-0">
          <p id={LABEL_ID} data-testid="plan-cost-strip-title" className="text-sm font-semibold text-[color:var(--slip-ink)]">
            {t.title}
          </p>
          <p data-testid="plan-cost-strip-sub" className="text-[13px] text-[color:var(--slip-muted)]">
            {t.sub}
          </p>
        </div>
      </section>
    );
  }

  const fill = view.over ? "bg-[color:var(--coral-fill)]" : "bg-[color:var(--slip-teal)]";
  return (
    <section
      data-testid="plan-cost-strip"
      data-state={view.state}
      aria-labelledby={LABEL_ID}
      className="flex flex-col gap-2.5 rounded-[16px] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)] px-4 py-[14px]"
    >
      <div className="flex items-center justify-between gap-3">
        <p id={LABEL_ID} data-testid="plan-cost-strip-label" className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--slip-muted)]">
          {t.label}
        </p>
      </div>
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span data-testid="plan-cost-strip-amount" className="slip-display text-[28px] font-semibold leading-none text-[color:var(--slip-ink)]">
          {t.amount}
        </span>
        {t.secondary ? (
          <span data-testid="plan-cost-strip-secondary" className="text-sm text-[color:var(--slip-muted)]">
            {t.secondary}
          </span>
        ) : null}
      </div>
      <div data-testid="plan-cost-strip-bar" aria-hidden="true" className="h-2 overflow-hidden rounded-[4px] bg-[color:var(--slip-wash)]">
        <div
          data-testid="plan-cost-strip-bar-fill"
          data-over={view.over ? "true" : undefined}
          className={`h-full ${fill}`}
          style={{ width: `${view.barPercent ?? 0}%` }}
        />
      </div>
      <div className="flex justify-between gap-3 text-xs text-[color:var(--slip-muted)]">
        <span data-testid="plan-cost-strip-coverage">{t.coverageLeft}</span>
        {t.coverageRight ? <span data-testid="plan-cost-strip-unpriced">{t.coverageRight}</span> : null}
      </div>
      {t.footnote ? (
        <p data-testid="plan-cost-strip-footnote" className="text-xs leading-[1.5] text-[color:var(--slip-muted)]">
          {t.footnote}
        </p>
      ) : null}
    </section>
  );
}
