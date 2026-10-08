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
import { OPTIMIZE_RERUN_RULE, TRIP_PASS_COVERED_LABEL, formatMoneyCents, tripPassRunsLine, type OptimizationFeeQuote } from "@/lib/optimization-preview";

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
  /**
   * `"board"` — the boards' navy card (slip conformance; ledger `2026-10-08-slip-moment-board`):
   * gold eyebrow, a count badge per finding, the coral CTA (ruling 2). It is opted into by the slip
   * only. The versions page keeps the plain card: it carries no `.slip-surface` root, so the slip
   * tokens do not exist there.
   */
  tone?: "plain" | "board";
  /** A Moment's own title ("Make the evening flow"), drawn in place of the eyebrow. Board tone only. */
  title?: string | null;
  /** One sentence under the title, true of THIS plan (e.g. its anchor time). Board tone only. */
  intro?: string | null;
  /**
   * The plan is not built around a place to stay (a Moment). "Where you stay" wording is then
   * dropped from the zero and versions lines, because it would describe a different plan.
   */
  noStay?: boolean;
  /** The board's secondary "Local expert" button (the ONE handoff chooser). Board tone only; absent ⇒ none. */
  onLocalExpert?: (() => void) | null;
  /** The "Local expert" button's testid. The slip passes `slip-action-hire-expert`: the board puts the
   *  slip's one handoff door here once the rail is gone (ledger `2026-10-08-slip-main-rail`). */
  localExpertTestId?: string;
}

/** A Moment's zero line: LEAD_ZERO without "around where you stay" (§13). */
export const LEAD_ZERO_NO_STAY = "This plan already works · Optimize builds three versions of it";

/**
 * The board's badge and text for one finding: the count leads the line, so it moves into the badge
 * and the text keeps the rest ("2" · "stops are reached when they're closed"). A line that does not
 * start with its count (walking saved: "about 6 km less walking") gets the board's "↓" badge and
 * keeps its whole text.
 */
export function findingBadge(f: Finding): { badge: string; rest: string } {
  const line = findingLine(f);
  const lead = `${f.count} `;
  return line.startsWith(lead) ? { badge: String(f.count), rest: line.slice(lead.length) } : { badge: "↓", rest: line };
}

/** Badge fill by finding: problems coral (ruling 2's one primary colour), crossings gold, gains green. */
function badgeClass(kind: Finding["kind"]): string {
  if (kind === "city_crossing" || kind === "pace_over") return "bg-[color:var(--slip-gold)] text-[color:var(--slip-ink)]";
  if (kind === "walking_saved_km") return "bg-[color:var(--slip-green)] text-[color:var(--slip-ink)]";
  return "bg-[color:var(--slip-primary)] text-[color:var(--slip-primary-ink)]";
}

/** "Optimize · <the server's fee>" / "Optimize · Included in your Trip Pass" / "Optimize" — never a literal. */
export function optimizeCtaLabel(fee: OptimizationFeeQuote | null | undefined): string {
  if (!fee || fee.aiDisabled) return "Optimize";
  if (fee.coveredByTripPass) return `Optimize · ${TRIP_PASS_COVERED_LABEL}`;
  if (!Number.isFinite(fee.feeCents) || fee.feeCents <= 0) return "Optimize";
  return `Optimize · ${formatMoneyCents(fee.feeCents, fee.currency)}`;
}

/**
 * The board card's CTA (ruling 3, ledger `2026-10-08-slip-main-rail`): the Trip Pass covered label
 * is a BUTTON STATE — "Optimize · included · 4 runs left", the count the server sent with the fee
 * (`tripPassRuns`). Without a count it says "Optimize · included" and no number (§13). Every other
 * state is `optimizeCtaLabel`'s, which the plain card (the versions page) keeps unchanged.
 */
export function optimizeBoardCtaLabel(fee: OptimizationFeeQuote | null | undefined): string {
  if (!fee || fee.aiDisabled || !fee.coveredByTripPass) return optimizeCtaLabel(fee);
  const left = fee.tripPassRuns?.left;
  if (typeof left === "number" && Number.isFinite(left) && left > 0) {
    return `Optimize · included · ${left} ${left === 1 ? "run" : "runs"} left`;
  }
  return "Optimize · included";
}

export function OptimizerLead(props: OptimizerLeadProps) {
  if (props.tone === "board") return <BoardOptimizerLead {...props} />;
  return <PlainOptimizerLead {...props} />;
}

function PlainOptimizerLead({ findings, hasPricedItems, fee, realised, onClick, testId = "slip-action-optimize", busy = false, disabledReason, ctaLabelOverride, drafted = true }: OptimizerLeadProps) {
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
      {tripPassRunsLine(fee) ? (
        <p className="text-[11px] text-muted-foreground" data-testid="optimizer-lead-pass-runs">
          {tripPassRunsLine(fee)}
        </p>
      ) : null}
      <p className="text-[11px] text-muted-foreground" data-testid="optimizer-lead-rerun">
        {OPTIMIZE_RERUN_RULE}
      </p>
    </section>
  );
}

/**
 * The boards' card. Same data, same testids, same CTA and the same lines as the plain card: only the
 * dress and the Moment's title/intro differ.
 */
function BoardOptimizerLead({
  findings,
  hasPricedItems,
  fee,
  realised,
  onClick,
  testId = "slip-action-optimize",
  busy = false,
  disabledReason,
  ctaLabelOverride,
  drafted = true,
  title = null,
  intro = null,
  noStay = false,
  onLocalExpert = null,
  localExpertTestId = "optimizer-lead-local-expert",
}: OptimizerLeadProps) {
  const cta = "flex h-12 flex-1 items-center justify-center gap-1.5 rounded-[var(--slip-radius-button)] bg-[color:var(--slip-primary)] px-4 text-[15px] font-semibold text-[color:var(--slip-primary-ink)] hover:brightness-95 disabled:opacity-60";
  const quiet = "text-xs leading-normal text-[color:var(--slip-on-navy-muted)]";
  const secondary = onLocalExpert ? (
    <button
      type="button"
      onClick={onLocalExpert}
      className="h-12 flex-shrink-0 rounded-[var(--slip-radius-button)] border border-[color:var(--slip-on-navy-line)] bg-transparent px-4 text-sm font-medium text-white hover:bg-white/10"
      data-testid={localExpertTestId}
    >
      Local expert
    </button>
  ) : null;
  const shell = "space-y-3 rounded-[var(--slip-radius-card)] bg-[color:var(--slip-navy)] p-[18px] text-white";

  if (!drafted) {
    return (
      <section className={shell} data-testid="optimizer-lead" data-lead-state="draft-first" data-lead-tone="board">
        {title ? <h2 className="slip-display text-[21px] font-semibold leading-[1.15] text-white" data-testid="optimizer-lead-title">{title}</h2> : null}
        <p className="text-sm text-white" data-testid="optimizer-lead-draft-first">
          {LEAD_DRAFT_FIRST}
        </p>
        <div className="flex gap-2.5">
          <span title={LEAD_DRAFT_FIRST} className="flex flex-1">
            <button type="button" className={cta} disabled data-testid={testId}>
              <Sparkles className="h-4 w-4" />
              {optimizeBoardCtaLabel(fee)}
            </button>
          </span>
          {secondary}
        </div>
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
    <section className={shell} data-testid="optimizer-lead" data-lead-tone="board">
      {title ? (
        <h2 className="slip-display text-[21px] font-semibold leading-[1.15] text-white" data-testid="optimizer-lead-title">
          {title}
        </h2>
      ) : (
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--slip-gold)]" data-testid="optimizer-lead-eyebrow">
          {LEAD_EYEBROW}
        </p>
      )}
      {intro ? (
        <p className="text-sm leading-[1.45] text-[color:var(--slip-on-navy-muted)]" data-testid="optimizer-lead-intro">
          {intro}
        </p>
      ) : null}
      {none ? (
        <p className="text-sm text-white" data-testid="optimizer-lead-zero">
          {noStay ? LEAD_ZERO_NO_STAY : LEAD_ZERO}
        </p>
      ) : known ? (
        <ul className="space-y-2">
          {findings!.map((f) => {
            const { badge, rest } = findingBadge(f);
            return (
              <li key={f.kind} className="flex items-start gap-2.5 text-sm leading-[1.4] text-white" data-testid={`optimizer-finding-${f.kind}`} data-count={f.count}>
                <span className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${badgeClass(f.kind)}`} aria-hidden="true">
                  {badge}
                </span>
                <span>
                  {badge === "↓" ? null : <span className="sr-only">{badge} </span>}
                  {rest}
                  {f.caveat ? (
                    <span className={`block ${quiet}`} data-testid={`optimizer-finding-caveat-${f.kind}`}>
                      {f.caveat}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {delta ? (
        <p className="text-sm font-medium text-white" data-testid="optimizer-lead-delta">
          {delta}
        </p>
      ) : null}
      <div className="flex gap-2.5">
        <span title={disabledReason ?? undefined} className="flex flex-1">
          <button type="button" className={cta} onClick={onClick} disabled={!!disabledReason || busy} data-testid={testId}>
            <Sparkles className="h-4 w-4" />
            {ctaLabelOverride ?? optimizeBoardCtaLabel(fee)}
          </button>
        </span>
        {secondary}
      </div>
      {none || noStay ? null : (
        <p className={quiet} data-testid="optimizer-lead-versions">
          {LEAD_VERSIONS}
        </p>
      )}
      {tripPassRunsLine(fee) ? (
        <p className={quiet} data-testid="optimizer-lead-pass-runs">
          {tripPassRunsLine(fee)}
        </p>
      ) : null}
      <p className={quiet} data-testid="optimizer-lead-rerun">
        {OPTIMIZE_RERUN_RULE}
      </p>
    </section>
  );
}
