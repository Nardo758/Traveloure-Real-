/**
 * A-22 (ledger `2026-11-05-lane7-guest-slip`): a guest's plan drawn as the Trip Slip draws a plan — the ONE day
 * renderer (`DayBlock`) and the ONE row (`ItemRow`, read mode). A guest gets no ⋯ menu, no booking line or action,
 * no cost and no fee line: nothing here can be bought, and every control a row would carry is absent, never greyed.
 * The first day opens.
 */
import { DayBlock } from "./DayBlock";
import { ItemRow } from "./ItemRow";
import { dayBlockHeading, dayBlockStats } from "@/lib/plan-day";
import { guestSlipDays, type GuestPlanView } from "@/lib/waitlist-guest-plan";

export function GuestPlanSlip({ view }: { view: GuestPlanView }) {
  const days = guestSlipDays(view);
  return (
    <div className="rounded-lg border border-border bg-card p-2 space-y-1" data-testid="guest-plan-items">
      {days.map((d, i) => (
        <DayBlock
          key={d.dayNum}
          dayKey={String(d.dayNum)}
          heading={dayBlockHeading({ dayNum: d.dayNum, dateIso: d.dateIso })}
          stats={dayBlockStats({ stops: d.activities.length, hoursOn: 0 })}
          defaultOpen={i === 0}
        >
          {d.activities.map((a) => (
            <div key={a.id} data-testid={`guest-plan-item-${a.id}`}>
              <ItemRow item={a} mode="read" role="traveler" dateIso={d.dateIso} />
            </div>
          ))}
        </DayBlock>
      ))}
    </div>
  );
}
