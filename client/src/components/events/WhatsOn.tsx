/**
 * WhatsOn.tsx — "What's on" for the selected month, week or day, and "In season all month"
 * (ledger `2026-10-06-events-calendar`; boards `Main`, `Mobile`). It REPLACES the /events
 * "Coming up" block; the landing strip is untouched.
 *
 * Each row: title, city, venue, local dates, the start time only when the organizer published
 * one, and "Plan around it" — the existing `planAroundSource(event, "events_page")` door. There is
 * no "Event details" link until the event page exists (brief item 13: no dead link).
 */
import { Link } from "wouter";
import { cityEventPhoto, countdownLabel } from "@shared/city-events";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { resolveBillboardCredit, type PhotoAttribution } from "@shared/landing-billboard";
import {
  eventPlace,
  eventTag,
  eventWhen,
  type CalendarEvent,
  type PeriodKind,
  type SeasonBand,
} from "@shared/events-calendar";
import { planAroundSource } from "@/components/landing/events-strip";
import type { PlanningSource } from "@/contexts/PlanningContext";
import LANDING_PHOTO_ATTRIBUTION from "../../../public/images/landing/ATTRIBUTION.json";
import { MONO } from "./MonthGrid";

const FRAUNCES = "'Fraunces', Georgia, serif";
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function DateBlock({ date, light }: { date: string; light?: boolean }) {
  return (
    <div className="flex w-[44px] shrink-0 flex-col items-center leading-none" style={{ color: light ? "white" : "var(--earn-navy)" }}>
      <span className="text-[10px] tracking-[0.1em]" style={{ fontFamily: MONO }}>
        {MON[Number(date.slice(5, 7)) - 1]}
      </span>
      <span className="text-[22px] font-semibold" style={{ fontFamily: FRAUNCES }}>
        {Number(date.slice(8))}
      </span>
    </div>
  );
}

function PlanButton({ event, filled, onPlanAround }: { event: CalendarEvent; filled: boolean; onPlanAround: (s: PlanningSource) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPlanAround(planAroundSource(event, "events_page"))}
      className={
        filled
          ? "inline-flex min-h-[36px] items-center self-start rounded-[8px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground"
          : "inline-flex min-h-[36px] items-center self-start rounded-[8px] border px-3 text-[13px] font-semibold"
      }
      style={filled ? undefined : { borderColor: "var(--earn-coral-ink)", color: "var(--earn-coral-ink)" }}
      data-testid={`events-plan-${event.id}`}
    >
      Plan around it
    </button>
  );
}

function EventRow({
  event,
  primary,
  isNext,
  onPlanAround,
}: {
  event: CalendarEvent;
  primary: boolean;
  isNext: boolean;
  onPlanAround: (s: PlanningSource) => void;
}) {
  const countdown = countdownLabel(event.daysUntil);
  const chip = `${isNext ? "Next up · " : ""}${countdown}`;
  const photo = primary ? cityEventPhoto(event.imagePath, event.marketKey) : null;
  const credit = photo?.fallback ? resolveBillboardCredit(photo.src, LANDING_PHOTO_ATTRIBUTION as PhotoAttribution[]) : null;
  // A city photo is shown only with its credit, and always says it is the city, not the event.
  const showPhoto = !!photo && (!photo.fallback || !!credit);
  const body = (
    <>
      <span className="text-[10px] uppercase tracking-[0.1em]" style={{ fontFamily: MONO, color: "var(--earn-teal-ink)" }} data-testid={`events-row-tag-${event.id}`}>
        {eventTag(event)}
      </span>
      <h3 className="text-[17px] font-semibold leading-tight" style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}>
        {event.title}
      </h3>
      <span className="text-[12.5px]" style={{ color: "var(--earn-ink)" }} data-testid={`events-row-when-${event.id}`}>
        {eventWhen(event)}
      </span>
      <span className="text-[12.5px]" style={{ color: "var(--earn-muted)" }} data-testid={`events-row-place-${event.id}`}>
        {eventPlace(event)}
      </span>
    </>
  );
  const chipEl = (
    <span
      className="rounded-[6px] border px-[7px] py-[3px] text-[9.5px] uppercase tracking-[0.08em]"
      style={{ fontFamily: MONO, color: "var(--earn-ink)", borderColor: "var(--earn-border)", background: "var(--earn-card)" }}
      data-testid={`events-row-countdown-${event.id}`}
    >
      {chip}
    </span>
  );
  if (primary) {
    return (
      <article className="overflow-hidden rounded-[14px] border" style={{ borderColor: "var(--earn-border)", background: "var(--earn-card)" }} data-testid={`events-row-${event.id}`} data-primary="true">
        {showPhoto ? (
          <div className="relative h-[150px]">
            <img src={photo!.src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.05) 60%)" }} aria-hidden="true" />
            <div className="absolute left-3 top-3">
              <DateBlock date={event.firstDate} light />
            </div>
            <div className="absolute right-3 top-3">{chipEl}</div>
            {photo!.fallback && credit && (
              <span className="absolute bottom-1.5 right-2 text-[9px] text-white/90" style={{ fontFamily: MONO }} data-testid={`events-row-credit-${event.id}`}>
                City photo, not the event · {credit.creator} · {credit.site}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2 px-4 pt-3.5">
            <DateBlock date={event.firstDate} />
            {chipEl}
          </div>
        )}
        <div className="flex flex-col gap-[5px] px-4 pb-4 pt-3">
          {body}
          <div className="mt-1">
            <PlanButton event={event} filled onPlanAround={onPlanAround} />
          </div>
        </div>
      </article>
    );
  }
  return (
    <article className="flex gap-3 rounded-[12px] border p-3" style={{ borderColor: "var(--earn-border)", background: "var(--earn-card)" }} data-testid={`events-row-${event.id}`}>
      <DateBlock date={event.firstDate} />
      <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
        <div className="flex flex-wrap items-center justify-between gap-2">{chipEl}</div>
        {body}
        <div className="mt-1">
          <PlanButton event={event} filled={false} onPlanAround={onPlanAround} />
        </div>
      </div>
    </article>
  );
}

const cityNamesOf = (b: SeasonBand) =>
  b.marketKeys.map((k) => OPERATING_MARKETS.find((m) => m.marketKey === k)?.cityName).filter(Boolean).join(" and ");

export function WhatsOn({
  kind,
  title,
  rows,
  nextId,
  bands,
  monthName,
  cityLabel,
  showBack,
  onBack,
  jump,
  onPlanAround,
}: {
  kind: PeriodKind;
  title: string;
  rows: readonly CalendarEvent[];
  nextId: string | null;
  bands: readonly SeasonBand[];
  monthName: string;
  cityLabel: string;
  showBack: boolean;
  onBack: () => void;
  jump: { label: string; go: () => void } | null;
  onPlanAround: (s: PlanningSource) => void;
}) {
  const cities = new Set(rows.map((r) => r.marketKey ?? r.city)).size;
  const sub = rows.length === 0 ? "No dated events" : `${rows.length} ${rows.length === 1 ? "event" : "events"} · ${cities} ${cities === 1 ? "city" : "cities"}`;
  const empty = rows.length === 0 && bands.length === 0;
  return (
    <aside aria-label="What's on in the selected period" className="flex flex-col gap-3" data-testid="events-whats-on">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10.5px] uppercase tracking-[0.12em]" style={{ fontFamily: MONO, color: "var(--earn-teal-ink)" }}>
            What's on · {kind}
          </span>
          <h2 className="text-[22px] font-semibold leading-tight" style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }} data-testid="events-whats-on-title">
            {title}
          </h2>
          <span className="text-[12px]" style={{ color: "var(--earn-muted)" }} data-testid="events-whats-on-count">
            {sub}
          </span>
        </div>
        {showBack && (
          <button type="button" onClick={onBack} className="rounded-[8px] border px-2.5 py-1 text-[12px]" style={{ borderColor: "var(--earn-border)", color: "var(--earn-ink)" }} data-testid="events-whole-month">
            All of {monthName}
          </button>
        )}
      </div>

      {rows.map((e, i) => (
        <EventRow key={e.id} event={e} primary={i === 0} isNext={e.id === nextId} onPlanAround={onPlanAround} />
      ))}

      {bands.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[12px] border p-3" style={{ borderColor: "var(--earn-border)", background: "var(--earn-teal-wash)" }} data-testid="events-in-season">
          <span className="text-[10.5px] uppercase tracking-[0.12em]" style={{ fontFamily: MONO, color: "var(--earn-teal-ink)" }}>
            In season all month
          </span>
          {bands.map((b) => (
            <div key={b.id} className="flex flex-col gap-0.5" data-testid={`events-band-${b.id}`}>
              <span className="text-[14px] font-semibold" style={{ color: "var(--earn-navy)" }}>
                {b.title}
              </span>
              <span className="text-[12px]" style={{ color: "var(--earn-muted)" }}>
                {b.place} · {b.span} · no fixed dates published
              </span>
              {/* Ruling E9: the band's link goes to the destinations browse. */}
              <Link href="/destinations" className="text-[12.5px] font-semibold underline-offset-2 hover:underline" style={{ color: "var(--earn-teal-ink)" }}>
                {`See ${cityNamesOf(b) || b.place} in ${monthName}`}
              </Link>
            </div>
          ))}
        </div>
      )}

      {empty && (
        <div className="flex flex-col gap-2 rounded-[12px] border border-dashed p-4" style={{ borderColor: "var(--earn-border-dash)" }} data-testid="events-empty">
          <b className="text-[15px]" style={{ color: "var(--earn-navy)" }}>
            {kind === "day" ? "Nothing on this date yet" : kind === "week" ? "Nothing dated this week yet" : `Nothing dated in ${monthName} yet`}
          </b>
          <span className="text-[12.5px]" style={{ color: "var(--earn-muted)" }}>
            No organizer in {cityLabel} has published dates for this period.
          </span>
          <div className="flex flex-wrap gap-2">
            {jump && (
              <button type="button" onClick={jump.go} className="rounded-[8px] bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground" data-testid="events-jump">
                {jump.label}
              </button>
            )}
            <Link href="/destinations" className="rounded-[8px] border px-3 py-1.5 text-[13px] font-semibold" style={{ borderColor: "var(--earn-border)", color: "var(--earn-ink)" }}>
              Browse destinations
            </Link>
          </div>
        </div>
      )}
    </aside>
  );
}

