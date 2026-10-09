/**
 * `/itinerary-comparison/:id` — THE VERSIONS BOARD PAGE (smoke 10 S10-2; ledger
 * `2026-10-04-smoke10-fixes`). The legacy comparison screen is retired for every PLAN: the id may be a
 * plan id or a comparison id, and either way the route renders that plan's versions board
 * (`VersionsBoard`, surface step 5). With no run it is a Draft-only board whose CTA is the Optimize card
 * (no A/B/C toggle); while a run is being paid for or built it says so and re-reads; a failed run says
 * so. Nothing here writes — the board's own rails do.
 *
 * Stated limit: a comparison with NO plan behind it (the trip-less guest cart, LD 39's sanctioned
 * fallback until G2) has no board to draw — versions are per plan — so that one case still opens the
 * legacy screen. It is the only caller left.
 */
import { lazy, Suspense } from "react";
import "@/styles/slip-tokens.css";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { Loader2 } from "lucide-react";
import { VersionsBoard } from "@/components/plancard/VersionsBoard";
import { OptimizerLead } from "@/components/plan/OptimizerLead";
import type { SlipData } from "@/components/plancard/SlipView";
import { useOptimizerLeadData } from "@/components/plan/use-optimizer-lead-data";
import { planVersionsTarget, versionsRunState } from "@/lib/plan-versions";

const LegacyComparison = lazy(() => import("@/pages/itinerary-comparison"));

export default function PlanVersionsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const [, setLocation] = useLocation();

  // The id as a comparison first (the slip, the cart and the run all link by comparison id).
  const cmp = useQuery<{ comparison?: { id: string; tripId?: string | null; status?: string | null } }>({
    queryKey: [`/api/itinerary-comparisons/${id}`],
    retry: false,
    enabled: !!id,
  });
  const target = planVersionsTarget({ id, comparisonLoaded: cmp.isSuccess, comparisonFailed: cmp.isError, comparison: cmp.data?.comparison ?? null });
  const tripId = target.kind === "plan" ? target.tripId : null;

  const plan = useQuery<SlipData>({ queryKey: [`/api/trips/${tripId}/plancard`], enabled: !!tripId, retry: false });
  // The plan's latest run, when we came in by plan id: its state is read off the comparison row.
  const latestId = target.kind === "plan" && target.comparisonStatus == null ? plan.data?.lastComparisonId ?? null : null;
  const latest = useQuery<{ comparison?: { status?: string | null } }>({
    queryKey: [`/api/itinerary-comparisons/${latestId}`],
    enabled: !!latestId,
    retry: false,
  });
  const runState = versionsRunState(target.kind === "plan" ? target.comparisonStatus ?? latest.data?.comparison?.status ?? null : null);
  // A run in flight re-reads its comparison until it lands.
  useQuery({
    queryKey: ["plan-versions-poll", id, runState],
    enabled: runState === "building" || runState === "awaiting_payment",
    refetchInterval: 4000,
    queryFn: async () => {
      await cmp.refetch();
      if (latestId) await latest.refetch();
      return Date.now();
    },
  });

  // R321 S11-8: the SAME data the slip's OptimizerLead reads (§18 rule 1) — findings included.
  const leadData = useOptimizerLeadData(tripId ?? "", !!tripId);

  if (target.kind === "loading" || (tripId && plan.isLoading)) {
    return (
      <div className="flex justify-center py-16" data-testid="plan-versions-loading">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (target.kind === "tripless") {
    return (
      <Suspense fallback={null}>
        <LegacyComparison />
      </Suspense>
    );
  }
  if (!tripId || plan.isError || !plan.data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center" data-testid="plan-versions-not-found">
        <p className="text-sm text-muted-foreground">We couldn't find that plan.</p>
        <Link href="/my-trips" className="mt-3 inline-block text-sm underline">
          Back to my plans
        </Link>
      </div>
    );
  }

  const slipHref = `/plans/${tripId}`;
  const optimizeHref = `${slipHref}?optimize=1`;
  return (
    // The Optimized board (ledger `2026-10-08-slip-optimized-board`): the slip's tokens and ground.
    <div className="slip-surface mx-auto max-w-6xl space-y-4 bg-[color:var(--slip-ground)] px-4 py-6" data-testid="plan-versions-page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={slipHref} className="text-sm font-semibold text-[color:var(--slip-navy)] underline-offset-2 hover:underline" data-testid="plan-versions-back">
          ← Back to your plan
        </Link>
        <p className="text-sm text-[color:var(--slip-muted)]">{plan.data.trip?.title || plan.data.trip?.destination}</p>
      </div>
      {runState === "building" ? (
        <p className="rounded-md border border-dashed p-3 text-sm" data-testid="plan-versions-building">
          Your versions are being built. Your plan is untouched; this page updates when they land.
        </p>
      ) : runState === "awaiting_payment" ? (
        <p className="rounded-md border border-dashed p-3 text-sm" data-testid="plan-versions-awaiting-payment">
          This run is waiting for payment. <Link href={optimizeHref} className="underline">Finish it on your plan</Link>.
        </p>
      ) : runState === "failed" ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/20" data-testid="plan-versions-failed">
          This run didn't finish, and nothing on your plan changed. <Link href={optimizeHref} className="underline">Try Optimize again</Link>.
        </p>
      ) : null}
      <VersionsBoard
        tripId={tripId}
        destination={plan.data.trip?.destination ?? ""}
        days={plan.data.days ?? []}
        onPaidRun={() => setLocation(optimizeHref)}
        noRunCta={
          <OptimizerLead
            drafted={(plan.data.days ?? []).some((d) => (d.activities ?? []).length > 0)}
            findings={leadData.findings}
            hasPricedItems={leadData.hasPricedItems}
            fee={leadData.fee}
            realised={leadData.realised as any}
            testId="plan-versions-optimize"
            onClick={() => setLocation(optimizeHref)}
          />
        }
      />
    </div>
  );
}
