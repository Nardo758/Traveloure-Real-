/**
 * "Getting around" — the plan's legs, day by day (step 9c D7, ledger `2026-10-07-step9c-leg-options`).
 * It reads the legs the plancard already carries (`days[].transports` — exactly the legs this plan may
 * show, `selectPlanLegs`) from the slip's own cached read, and makes ZERO Maps calls. A routed leg reads
 * the same line as the slip and the Trip Card (`routedLegLine`); an expert's own leg reads its minutes
 * only (D5). A plan with no shown legs says so — never an invented route (§13).
 */
import { useQuery } from "@tanstack/react-query";
import { gettingAroundDays, GETTING_AROUND_EMPTY } from "@/lib/getting-around";

export function GettingAroundSheet({ tripId }: { tripId: string }) {
  const { data } = useQuery<{ days?: any[]; trip?: { timezone?: string | null } | null }>({
    queryKey: [`/api/trips/${tripId}/plancard`],
    staleTime: 30000,
  });
  const days = gettingAroundDays(data?.days, data?.trip?.timezone ?? null);
  if (!days.length) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="getting-around-empty">
        {GETTING_AROUND_EMPTY}
      </p>
    );
  }
  return (
    <div className="space-y-4" data-testid="getting-around">
      {days.map((d) => (
        <section key={d.dayNumber} data-testid={`getting-around-day-${d.dayNumber}`}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Day {d.dayNumber}</h3>
          <ul className="mt-1 space-y-1.5">
            {d.legs.map((l) => (
              <li key={l.legId} className="text-sm" data-testid={`getting-around-leg-${l.legId}`}>
                <span className="font-medium">{l.title}</span>
                <span className="block text-xs text-muted-foreground">{l.line}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
