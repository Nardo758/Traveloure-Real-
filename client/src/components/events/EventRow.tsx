/**
 * EventRow — THE one event row (SH-1 Launch item 13; architect ruling, Oct 22, 2026: one exported EventRow across
 * surfaces, after the Oct 3 ruling "one row component"; ledger `2026-10-22-sh1-launch-pr5`). The /events "What's on"
 * rows, the landing strip's cards, the event page's "More in <city>" rows and the PlanEntry event picker all render it.
 *
 * One layout: the photo block only when the row has a photo (Q13.3: no fallback photo ⇒ no photo block, never an
 * empty frame), then the DateBlock and the countdown chip on every row (Q13.2), the tag, the title, the row's lines and
 * its actions. English only (Q13.1: `venue_local` after launch). Each surface passes its own words and test-id prefix;
 * the row derives nothing.
 */
import type { ReactNode } from "react";
import { Link } from "wouter";
import { DateBlock } from "./DateBlock";

const FRAUNCES = "'Fraunces', Georgia, serif";
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export interface EventRowLine {
  text: string;
  /** Full test id for this line, when a surface pins it. */
  testId?: string;
  tone?: "ink" | "muted";
}

export interface EventRowProps {
  /** The row's id inside its test ids (`${testIdPrefix}-${id}`, `${testIdPrefix}-countdown-${id}`, …). */
  id: string;
  testIdPrefix: string;
  /** Local first date, YYYY-MM-DD — the DateBlock. */
  firstDate: string;
  /** The countdown chip; null/absent ⇒ no chip (a row whose payload carries no countdown says nothing). */
  countdown?: string | null;
  tag?: string | null;
  title: string;
  lines?: readonly EventRowLine[];
  photo?: { src: string; credit?: string | null } | null;
  actions?: ReactNode;
  /** The whole row links here (the event page's "More in <city>"). */
  href?: string;
  /** The whole row is a choice (the PlanEntry picker); `selectTestId` names the button. */
  onSelect?: () => void;
  selectTestId?: string;
}

export function EventRow({ id, testIdPrefix, firstDate, countdown, tag, title, lines = [], photo, actions, href, onSelect, selectTestId }: EventRowProps) {
  const chip = countdown ? (
    <span
      className="self-start rounded-[6px] border px-[7px] py-[3px] text-[9.5px] uppercase tracking-[0.08em]"
      style={{ fontFamily: MONO, color: "var(--earn-ink)", borderColor: "var(--earn-border)", background: "var(--earn-card)" }}
      data-testid={`${testIdPrefix}-countdown-${id}`}
    >
      {countdown}
    </span>
  ) : null;
  const inner = (
    <>
      {photo && (
        <div className="relative h-[130px]">
          <img src={photo.src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          {photo.credit && (
            <span className="absolute bottom-1.5 right-2 text-[9px] text-white/90" style={{ fontFamily: MONO }} data-testid={`${testIdPrefix}-credit-${id}`}>
              {photo.credit}
            </span>
          )}
        </div>
      )}
      <div className="flex gap-3 p-3">
        <DateBlock date={firstDate} testId={`${testIdPrefix}-date-${id}`} />
        <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
          {chip}
          {tag && (
            <span className="text-[10px] uppercase tracking-[0.1em]" style={{ fontFamily: MONO, color: "var(--earn-teal-ink)" }} data-testid={`${testIdPrefix}-tag-${id}`}>
              {tag}
            </span>
          )}
          <span className="text-[16px] font-semibold leading-tight" style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}>
            {title}
          </span>
          {lines.map((l, i) => (
            <span key={i} className="text-[12.5px] break-words" style={{ color: l.tone === "muted" ? "var(--earn-muted)" : "var(--earn-ink)" }} data-testid={l.testId}>
              {l.text}
            </span>
          ))}
          {actions && <div className="mt-1 flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
      </div>
    </>
  );
  const frame = "flex flex-col overflow-hidden rounded-[12px] border text-left";
  const style = { borderColor: "var(--earn-border)", background: "var(--earn-card)" };
  if (href) {
    return (
      <Link href={href} className={`${frame} hover:bg-black/[0.02]`} style={style} data-testid={`${testIdPrefix}-${id}`}>
        {inner}
      </Link>
    );
  }
  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={`${frame} w-full hover:bg-[#FAFAF8]`} style={style} data-testid={selectTestId ?? `${testIdPrefix}-${id}`}>
        {inner}
      </button>
    );
  }
  return (
    <article className={frame} style={style} data-testid={`${testIdPrefix}-${id}`}>
      {inner}
    </article>
  );
}
