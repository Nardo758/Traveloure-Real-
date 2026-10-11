/**
 * THE MOMENT'S ANCHOR CARD — the reservation everything is built around, above the optimizer card
 * (slip conformance, Moment board, boards rev 15; ledger `2026-10-08-slip-moment-board`).
 *
 * It reads the plan's PRIMARY anchor item, the same `primaryAnchorItemId` the day rows already mark
 * "Build my days around this". It is a read-out of that item and holds no state of its own.
 *
 * §13 — every line is a fact the row carries, or it is not drawn:
 *   · "19:30" is the item's own start time; no time means no time is printed.
 *   · "fixed" appears only when the traveler locked the item (R-ah, `locked_at`). An unlocked anchor
 *     can still be moved by Optimize, so "fixed" would be false.
 *   · The facts line is the item's own place fact with its provenance, through `itemFactsLine`, the
 *     ONE reading the rows use. No fact means no line.
 *   · The board's "reservation in your name" is NOT drawn. Nothing on the item records whose name a
 *     reservation is in.
 */
import type { PlanCardActivity } from "@/components/plancard/plancard-types";
import { itemFactsLine } from "@/lib/place-facts";
import type { FactView } from "@shared/content-facts";

export const MOMENT_ANCHOR_EYEBROW = "The anchor";

/** "19:30 · fixed" / "19:30" / "fixed" / null — only what the row says. */
export function momentAnchorTimeLine(item: Pick<PlanCardActivity, "time" | "locked">): string | null {
  const time = typeof item.time === "string" && /^\d{1,2}:\d{2}/.test(item.time.trim()) ? item.time.trim().slice(0, 5) : null;
  const parts = [time, item.locked === true ? "fixed" : null].filter((p): p is string => !!p);
  return parts.length ? parts.join(" · ") : null;
}

export function MomentAnchorCard({
  item,
  facts,
  dateIso,
  timeZone,
}: {
  item: PlanCardActivity;
  facts?: readonly FactView[] | null;
  dateIso: string | null;
  timeZone: string | null;
}) {
  const timeLine = momentAnchorTimeLine(item);
  const factsLine = itemFactsLine(facts as any, dateIso, timeZone);
  return (
    <section
      className="space-y-2 rounded-[var(--slip-radius-card)] border-2 border-[color:var(--slip-teal)] bg-[color:var(--slip-card)] p-4"
      data-testid="slip-moment-anchor"
      data-anchor-item={item.id}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--slip-teal-ink)]">{MOMENT_ANCHOR_EYEBROW}</p>
        {timeLine ? (
          <p className="text-xs text-[color:var(--slip-muted)]" data-testid="slip-moment-anchor-time">
            {timeLine}
          </p>
        ) : null}
      </div>
      <h2 className="slip-display text-[21px] font-semibold leading-[1.15] text-[color:var(--slip-ink)]" data-testid="slip-moment-anchor-name">
        {item.name}
      </h2>
      {item.location?.trim() ? <p className="text-[13px] text-[color:var(--slip-muted)]">{item.location.trim()}</p> : null}
      {factsLine ? (
        <p className="text-xs font-medium text-[color:var(--slip-teal-ink)]" data-testid="slip-moment-anchor-facts">
          {factsLine.sourceUrl ? (
            <a href={factsLine.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {factsLine.text}
            </a>
          ) : (
            factsLine.text
          )}
        </p>
      ) : null}
    </section>
  );
}
