/**
 * DateBlock — the month and day an event row leads with (SH-1 Launch item 13, Q13.2; ledger
 * `2026-10-22-sh1-launch-pr5`). ONE component on every event row: the /events "What's on" rows, the landing strip's
 * cards and the event page's "More in <city>" rows. The date is the event's own local first date, read as written.
 */
const FRAUNCES = "'Fraunces', Georgia, serif";
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function DateBlock({ date, light, testId }: { date: string; light?: boolean; testId?: string }) {
  return (
    <div className="flex w-[44px] shrink-0 flex-col items-center leading-none" style={{ color: light ? "white" : "var(--earn-navy)" }} data-testid={testId}>
      <span className="text-[10px] tracking-[0.1em]" style={{ fontFamily: MONO }}>
        {MON[Number(date.slice(5, 7)) - 1]}
      </span>
      <span className="text-[22px] font-semibold" style={{ fontFamily: FRAUNCES }}>
        {Number(date.slice(8))}
      </span>
    </div>
  );
}
