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
 *  - ApplyButton is the ONLY action. NO routing actions, NO per-item apply,
 *    NO save-for-later (§4 Spec C interaction rules).
 *
 * with_expert items appear in NO column — their exclusion is stated ONCE in the
 * CompareHeader (the page's concern), never as grayed rows here (ruling 8).
 */
import { Anchor, Award, Car, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PlanCardProposalData } from "./plancard-types";
import { ROUTING_TINTS, tintPillStyle } from "./slip-tokens";

interface DayGroup {
  dayNum: number;
  rows: Array<
    | { kind: "anchor"; id: string; time: string; name: string }
    | { kind: "variant"; id: string; time: string; name: string; price: string | null }
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
    });
  }
  const groups = Array.from(byDay.values()).sort((a, b) => a.dayNum - b.dayNum);
  for (const g of groups) g.rows.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  return groups;
}

export function ProposalColumn({ proposal }: { proposal: PlanCardProposalData }) {
  const groups = groupRows(proposal);
  const purchasedTint = ROUTING_TINTS.purchased;

  return (
    <Card
      className={cn(
        "relative flex flex-col",
        proposal.recommended && "border-2",
        proposal.isBaseline && "border-dashed bg-muted/30",
      )}
      style={proposal.recommended ? { borderColor: purchasedTint.fg } : undefined}
      data-testid={`proposal-column-${proposal.testId ?? proposal.variantId}`}
    >
      <CardHeader className="pt-6 pb-3">
        {(proposal.eyebrow || proposal.recommended) && (
          <Badge
            variant="outline"
            className={cn(
              "mb-1 w-fit text-[10px] uppercase tracking-wide",
              proposal.recommended && "border-emerald-300 text-emerald-700 dark:text-emerald-300",
            )}
            data-testid={proposal.recommended ? `proposal-recommended-${proposal.testId ?? proposal.variantId}` : undefined}
          >
            {proposal.recommended ? <><Award className="h-3 w-3 mr-1" />Recommended</> : proposal.eyebrow}
          </Badge>
        )}
        <p className="font-semibold text-base">{proposal.displayName ?? proposal.name}</p>
        {proposal.tagline && <p className="text-xs text-muted-foreground">{proposal.tagline}</p>}
      </CardHeader>
      {proposal.totalCostUsd != null && (
        <div className="px-4 pb-2 flex items-baseline gap-2">
          <span className="font-mono font-semibold text-lg" data-testid={`proposal-total-${proposal.testId ?? proposal.variantId}`}>
            ${proposal.totalCostUsd.toLocaleString()}
          </span>
          {proposal.perPersonTotal && <span className="text-xs text-muted-foreground">· {proposal.perPersonTotal}/person</span>}
        </div>
      )}
      <CardContent className="flex-1 space-y-3">
        {groups.map((g) => (
          <div key={g.dayNum}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Day {g.dayNum}
            </p>
            <div className="space-y-1">
              {g.rows.map((row) => (
                <div key={`${row.kind}-${row.id}`} className="flex items-center justify-between gap-2 text-sm" data-testid={`proposal-row-${row.kind}-${row.id}`}>
                  <span className="min-w-0 flex-1 truncate flex items-center gap-1.5">
                    {row.kind === "anchor" && (
                      <Anchor className="w-3 h-3 flex-shrink-0" style={{ color: purchasedTint.fg }} />
                    )}
                    {row.time && <span className="text-xs text-muted-foreground font-mono">{row.time}</span>}
                    <span className="truncate">{row.name}</span>
                  </span>
                  {row.kind === "anchor" ? (
                    // The SAME purchased pill every surface renders (ruling 8) — read-only.
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide flex-shrink-0"
                      style={tintPillStyle(purchasedTint)}
                    >
                      {purchasedTint.label}
                    </span>
                  ) : (
                    row.price != null &&
                    parseFloat(row.price) > 0 && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        ${parseFloat(row.price).toLocaleString()}
                      </span>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {/* Muted transport summary — server-computed leg count + cost only. Nothing renders
            while unknown/absent (§13 — never a guessed figure). */}
        {proposal.legsSummary && proposal.legsSummary.count > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-border" data-testid={`proposal-legs-${proposal.variantId}`}>
            <Car className="w-3.5 h-3.5" />
            {proposal.legsSummary.count} transport leg{proposal.legsSummary.count > 1 ? "s" : ""}
            {proposal.legsSummary.totalCostUsd != null
              ? ` · ~$${Math.round(proposal.legsSummary.totalCostUsd).toLocaleString()} est.`
              : ""}
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
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
