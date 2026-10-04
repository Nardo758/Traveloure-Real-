/**
 * `OptimizerLead` — what the free preview found in this draft, and the one way to act on it (surface
 * step 4, spec v1.2 §8; rulings R-f, R-l, R-v; ledger `2026-10-03-surface-step4-optimizer-lead`).
 * Replaces the BuildCard's "Free estimate … scores N/100" blurb.
 *
 *   eyebrow   "What Optimize found in this draft"
 *   findings  up to three, problems first, each with its count (R-v caveat on stale hours, "est." on
 *             straight-line figures) — or, with none, "This draft already works · …" (never a fake one)
 *   delta     ONE line, the cost delta — realised after a paid run, and only when the plan holds a
 *             priced item; otherwise omitted (no ranges, ever)
 *   CTA       "Optimize · <fee>" — the fee is the SERVER's (`GET /api/optimization-fee`), never a literal
 *   then      "three versions built around where you stay" · the free re-run rule
 *
 * R-f: the card never shows the re-sequenced plan, only counts. Everything it says is authored once in
 * `shared/optimizer-lead.ts` / `lib/optimization-preview.ts` (§18 rule 1).
 */
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LEAD_DRAFT_FIRST, LEAD_EYEBROW, LEAD_VERSIONS, LEAD_ZERO, findingLine, leadDeltaLine, type Finding } from "@shared/optimizer-lead";
import { OPTIMIZE_RERUN_RULE, TRIP_PASS_COVERED_LABEL, formatMoneyCents, type OptimizationFeeQuote } from "@/lib/optimization-preview";

export interface OptimizerLeadProps {
  /** The preview's findings; `undefined` while it is being read (the card then shows no finding lines). */
  findings: readonly Finding[] | undefined;
  hasPricedItems: boolean;
  fee: OptimizationFeeQuote | null | undefined;
  /** After a paid run: the run record's realised delta. */
  realised?: { savings?: number | null; savingsPercent?: number | null } | null;
  /** The CTA's handler (named `onClick` so the slip's control inventory reads it on the mount). */
  onClick: () => void;
  /** The CTA's testid — the slip passes its own `slip-action-optimize`. */
  testId?: string;
  busy?: boolean;
  disabledReason?: string | null;
  ctaLabelOverride?: string | null;
  /** Smoke 9 S9-4: false ⇒ the plan has no draft yet — "Draft first", CTA disabled. Default true. */
  drafted?: boolean;
}

/** "Optimize · <the server's fee>" / "Optimize · Included in your Trip Pass" / "Optimize" — never a literal. */
export function optimizeCtaLabel(fee: OptimizationFeeQuote | null | undefined): string {
  if (!fee || fee.aiDisabled) return "Optimize";
  if (fee.coveredByTripPass) return `Optimize · ${TRIP_PASS_COVERED_LABEL}`;
  if (!Number.isFinite(fee.feeCents) || fee.feeCents <= 0) return "Optimize";
  return `Optimize · ${formatMoneyCents(fee.feeCents, fee.currency)}`;
}

export function OptimizerLead({ findings, hasPricedItems, fee, realised, onClick, testId = "slip-action-optimize", busy = false, disabledReason, ctaLabelOverride, drafted = true }: OptimizerLeadProps) {
  // Smoke 9 S9-4: a plan with no draft yet has nothing to optimize — say so, disable the CTA, and
  // claim no findings and no "already works".
  if (!drafted) {
    return (
      <section className="rounded-md border border-border p-3 space-y-2" data-testid="optimizer-lead" data-lead-state="draft-first">
        <p className="text-sm text-foreground" data-testid="optimizer-lead-draft-first">
          {LEAD_DRAFT_FIRST}
        </p>
        <span title={LEAD_DRAFT_FIRST} className="block">
          <Button size="sm" className="w-full justify-center gap-1.5" disabled data-testid={testId}>
            <Sparkles className="w-3.5 h-3.5" />
            {optimizeCtaLabel(fee)}
          </Button>
        </span>
      </section>
    );
  }
  const currency = fee?.currency || "USD";
  const delta = leadDeltaLine({
    hasPricedItems,
    realised: realised ?? null,
    formatMoney: (amount) => formatMoneyCents(Math.round(amount * 100), currency),
  });
  const known = findings !== undefined;
  const none = known && findings!.length === 0;
  return (
    <section className="rounded-md border border-border p-3 space-y-2" data-testid="optimizer-lead">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground" data-testid="optimizer-lead-eyebrow">
        {LEAD_EYEBROW}
      </p>
      {none ? (
        <p className="text-sm text-foreground" data-testid="optimizer-lead-zero">
          {LEAD_ZERO}
        </p>
      ) : known ? (
        <ul className="space-y-1">
          {findings!.map((f) => (
            <li key={f.kind} className="text-sm text-foreground" data-testid={`optimizer-finding-${f.kind}`} data-count={f.count}>
              {findingLine(f)}
              {f.caveat ? (
                <span className="block text-[11px] text-muted-foreground" data-testid={`optimizer-finding-caveat-${f.kind}`}>
                  {f.caveat}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {delta ? (
        <p className="text-sm font-medium text-foreground" data-testid="optimizer-lead-delta">
          {delta}
        </p>
      ) : null}
      <span title={disabledReason ?? undefined} className="block">
        <Button
          size="sm"
          className="w-full justify-center gap-1.5"
          onClick={onClick}
          disabled={!!disabledReason || busy}
          data-testid={testId}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {ctaLabelOverride ?? optimizeCtaLabel(fee)}
        </Button>
      </span>
      {none ? null : (
        <p className="text-[11px] text-muted-foreground" data-testid="optimizer-lead-versions">
          {LEAD_VERSIONS}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground" data-testid="optimizer-lead-rerun">
        {OPTIMIZE_RERUN_RULE}
      </p>
    </section>
  );
}
