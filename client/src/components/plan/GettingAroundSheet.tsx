/**
 * "Getting around" — the plan's days and every gap between consecutive stops (step 9c D7, ledger
 * `2026-10-07-step9c-leg-options`; production smoke F1, ledger `2026-10-08-getting-around-every-gap`).
 * It reads the slip's own cached plancard read and makes ZERO Maps calls. A routed gap reads the slip's
 * line; a shown leg without routed facts reads its minutes; anything else says "not worked out yet".
 * Days never vanish. A plan that doesn't earn routed legs gets one header line saying where times come from.
 */
import { useQuery } from "@tanstack/react-query";
import { GETTING_AROUND_EMPTY, gettingAroundDays, gettingAroundHeader } from "@/lib/getting-around";

type PlanData = { days?: any[]; trip?: { timezone?: string | null } | null; routedLegs?: boolean };

export function GettingAroundSheet({ tripId }: { tripId: string }) {
  const { data } = useQuery<PlanData>({
    queryKey: [`/api/trips/${tripId}/plancard`],
    staleTime: 30000,
  });
  return <GettingAroundBody data={data} />;
}

/** The sheet's content — separate so it renders without a query (tests). */
export function GettingAroundBody({ data }: { data: PlanData | null | undefined }) {
  const days = gettingAroundDays(data?.days, data?.trip?.timezone ?? null);
  const header = gettingAroundHeader(data);
  return (
    <div className="space-y-4" data-testid="getting-around">
      {header ? (
        <p className="text-sm text-muted-foreground" data-testid="getting-around-header">
          {header}
        </p>
      ) : null}
      {!days.length ? (
        <p className="text-sm text-muted-foreground" data-testid="getting-around-empty">
          {GETTING_AROUND_EMPTY}
        </p>
      ) : null}
      {days.map((d) => (
        <section key={d.dayNumber} data-testid={`getting-around-day-${d.dayNumber}`}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Day {d.dayNumber}</h3>
          <ul className="mt-1 space-y-1.5">
            {d.gaps.map((g) => (
              <li key={g.key} className="text-sm" data-testid={`getting-around-gap-${g.key}`} data-gap-kind={g.kind}>
                <span className="font-medium">{g.title}</span>
                <span className="block text-xs text-muted-foreground">{g.line}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
