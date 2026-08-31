/**
 * ProposalColumn — the `<PlanCard stage="proposal" />` renderer (Spec C,
 * SLIP_EXPERIENCE_DISPATCH §4). ONE optimizer variant as a compact, day-ordered,
 * READ-ONLY column:
 *
 *  - anchored (purchased) items come from the CANONICAL trip rows passed in
 *    (`proposal.anchoredItems`) — identical across all columns by construction,
 *    rendered with the anchor glyph + the same purchased tint pill every surface uses;
 *  - optimizable items come from the VARIANT's own rows, day/time as proposed;
 *  - transport legs are a muted count + cost line (server-computed values only);
 *  - "Recommended" chip only when the comparison marked exactly one column;
 *  - the whole-variant Apply button is the primary action; a per-stop "+" tick
 *    (ratified mock "Adopt the Optimization") pulls ONE variant stop into the plan
 *    when `proposal.onAdoptStop` is provided — appends via /adopt-stop, never routes
 *    or purchases. No routing actions, no save-for-later (§4 Spec C interaction rules).
 *
 * with_expert items appear in NO column — their exclusion is stated ONCE in the
 * CompareHeader (the page's concern), never as grayed rows here (ruling 8).
 */
import { Anchor, Award, Car, Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PlanCardProposalData } from "./plancard-types";
import { ROUTING_TINTS } from "./slip-tokens";

interface DayGroup {
  dayNum: number;
  rows: Array<
    | { kind: "anchor"; id: string; time: string; name: string }
    | { kind: "variant"; id: string; time: string; name: string; price: string | null; isNew: boolean }
  >;
}

function groupRows(proposal: PlanCardProposalData): DayGroup[] {
  const byDay = new Map<number, DayGroup>();
  const ensure = (dayNum: number): DayGroup => {
    let g = byDay.get(dayNum);
    if (!g) {
      g = { dayNum, rows: [] };
      byDay.set(dayNum, g);
    }
    return g;
  };
  for (const a of proposal.anchoredItems) {
    ensure(a.dayNum).rows.push({ kind: "anchor", id: a.id, time: a.time, name: a.name });
  }
  for (const it of proposal.items) {
    ensure(it.dayNumber).rows.push({
      kind: "variant",
      id: it.id,
      time: it.startTime || "",
      name: it.name,
      price: it.price ?? null,
      isNew: !!it.isNew,
    });
  }
  const groups = Array.from(byDay.values()).sort((a, b) => a.dayNum - b.dayNum);
  for (const g of groups) g.rows.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  return groups;
}

function anchorTone(anchorLine: string | null | undefined): "hotel" | "neighborhood" | "activity" | null {
  const kind = anchorLine?.split(" · ")[0]?.trim().toLowerCase();
  return kind === "hotel" || kind === "neighborhood" || kind === "activity" ? kind : null;
}

export function ProposalColumn({ proposal }: { proposal: PlanCardProposalData }) {
  const groups = groupRows(proposal);
  const purchasedTint = ROUTING_TINTS.purchased;
  const tone = anchorTone(proposal.anchorLine);

  return (
    <Card
      className={cn(
        "review-card relative flex flex-col",
        proposal.recommended && "review-card--recommended border-2",
        proposal.isBaseline && "review-card--baseline",
      )}
      data-testid={`proposal-column-${proposal.testId ?? proposal.variantId}`}
    >
      <CardHeader className="pt-6 pb-3">
        {(proposal.eyebrow || proposal.recommended) && (
          <Badge
            variant="outline"
            className={cn(
              "mb-1 w-fit text-[10px] uppercase tracking-wide",
              proposal.recommended && "review-recommended",
            )}
            data-testid={proposal.recommended ? `proposal-recommended-${proposal.testId ?? proposal.variantId}` : undefined}
          >
            {proposal.recommended ? <><Award className="h-3 w-3 mr-1" />Recommended</> : proposal.eyebrow}
          </Badge>
        )}
        <p className="font-semibold text-base">{proposal.displayName ?? proposal.name}</p>
        {proposal.tagline && <p className="text-xs text-muted-foreground">{proposal.tagline}</p>}
        {proposal.anchorLine && (
          <div
            className={cn(
              "mt-3 flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] leading-4",
              "review-mono",
              tone && `review-anchor--${tone}`,
            )}
            data-testid={`proposal-anchor-${proposal.testId ?? proposal.variantId}`}
          >
            <Anchor className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span
              title="Anchor distance is straight-line geometry, not a routed travel time."
            >
              {proposal.anchorLine}
            </span>
          </div>
        )}
      </CardHeader>
      {proposal.totalCostUsd != null && (
        <div className="px-4 pb-2 flex items-baseline gap-2">
          <span className="review-mono font-semibold text-lg" data-testid={`proposal-total-${proposal.testId ?? proposal.variantId}`}>
            ${proposal.totalCostUsd.toLocaleString()}
          </span>
          {proposal.perPersonTotal && <span className="review-mono text-xs text-muted-foreground">· {proposal.perPersonTotal}/person</span>}
        </div>
      )}
      <CardContent className="flex-1 space-y-3">
        {groups.map((g) => (
          <div key={g.dayNum}>
            <p className="review-mono mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Day {g.dayNum}{proposal.anchorLine ? " · from the base" : ""}
            </p>
            <div className="space-y-1">
              {g.rows.map((row) => (
                <div
                  key={`${row.kind}-${row.id}`}
                  className="grid grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-2 text-sm"
                  data-testid={`proposal-row-${row.kind}-${row.id}`}
                >
                  <span className="review-mono flex items-center gap-1 text-xs text-muted-foreground">
                    {row.kind === "anchor" && (
                      <Anchor className="h-3 w-3 shrink-0" style={{ color: purchasedTint.fg }} aria-hidden="true" />
                    )}
                    <span className="truncate">{row.time || "—"}</span>
                  </span>
                  <span
                    className={cn(
                      "min-w-0 truncate",
                      row.kind === "anchor" && "font-medium",
                      row.kind === "variant" && row.isNew && "font-medium text-[var(--earn-teal-ink)]",
                    )}
                  >
                    {row.name}
                  </span>
                  {row.kind === "anchor" ? (
                    <span className="review-mono shrink-0 text-xs text-muted-foreground" aria-label="Already purchased">
                      —
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1.5">
                      {row.price != null && Number.isFinite(parseFloat(row.price)) && (
                        <span className="review-mono text-xs text-muted-foreground">
                          ${parseFloat(row.price).toLocaleString()}
                        </span>
                      )}
                      {/* Per-stop "+" tick — pull JUST this stop into your plan (mock). */}
                      {proposal.onAdoptStop && (
                        <button
                          type="button"
                          title="Pull just this stop into your plan"
                          aria-label="Pull just this stop into your plan"
                          disabled={proposal.adoptingStopId === row.id}
                          onClick={() => proposal.onAdoptStop!(row.id)}
                          data-testid={`button-adopt-stop-${row.id}`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--earn-border)] text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                        >
                          {proposal.adoptingStopId === row.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {/* Muted transport summary — server-computed leg count + cost only. Nothing renders
            while unknown/absent (§13 — never a guessed figure). */}
        {proposal.locationCoverage && proposal.locationCoverage.totalStops > 0 && (
          <p
            className="border-t border-[var(--earn-border)] pt-1 text-xs text-muted-foreground"
            data-testid={`proposal-location-coverage-${proposal.variantId}`}
          >
            {proposal.locationCoverage.locatedStops} of {proposal.locationCoverage.totalStops} stops located
            {proposal.locationCoverage.locatedStops < proposal.locationCoverage.totalStops
              ? " · travel estimate based on located stops only"
              : ""}
          </p>
        )}
        {proposal.legsSummary && proposal.legsSummary.count > 0 && (
          <p className="flex items-center gap-1.5 border-t border-[var(--earn-border)] pt-1 text-xs text-muted-foreground" data-testid={`proposal-legs-${proposal.variantId}`}>
            <Car className="w-3.5 h-3.5" />
            {proposal.legsSummary.count} transport leg{proposal.legsSummary.count > 1 ? "s" : ""}
            {proposal.legsSummary.totalCostUsd != null
              ? <> · <span className="review-mono">~${Math.round(proposal.legsSummary.totalCostUsd).toLocaleString()} est.</span></>
              : ""}
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button
          variant={proposal.isBaseline ? "outline" : "default"}
          className={cn("w-full", !proposal.isBaseline && "review-apply")}
          onClick={proposal.onApply}
          disabled={!!proposal.applying}
          data-testid={`button-apply-variant-${proposal.testId ?? proposal.variantId}`}
        >
          {proposal.applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {proposal.applyLabel}
        </Button>
      </CardFooter>
    </Card>
  );
}
