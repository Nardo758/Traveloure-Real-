/**
 * WhatsOn.tsx — "What's on" for the selected month, week or day, and "In season all month"
 * (ledger `2026-10-06-events-calendar`; boards `Main`, `Mobile`). It REPLACES the /events
 * "Coming up" block; the landing strip is untouched.
 *
 * Each row: title, city, venue, local dates, the start time only when the organizer published
 * one, and "Plan around it" — the existing `planAroundSource(event, "events_page")` door — and
 * "Event details", the event's own page (2b, ledger `2026-10-06-event-page`; brief item 25).
 */
import { Link } from "wouter";
import { cityEventPhoto, countdownLabel } from "@shared/city-events";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { resolveBillboardCredit, type PhotoAttribution } from "@shared/landing-billboard";
import {
  eventDetailPath,
  eventPlace,
  eventTag,
  eventWhen,
  type CalendarEvent,
  type PeriodKind,
  type SeasonBand,
  countedCityKey,
} from "@shared/events-calendar";
import { planAroundSource } from "@/components/landing/events-strip";
import type { PlanningSource } from "@/contexts/PlanningContext";
import LANDING_PHOTO_ATTRIBUTION from "../../../public/images/landing/ATTRIBUTION.json";
import { MONO } from "./MonthGrid";
import { EventRow } from "./EventRow";

const FRAUNCES = "'Fraunces', Georgia, serif";
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

function DetailsLink({ event }: { event: CalendarEvent }) {
  return (
    <Link
      href={eventDetailPath(event.sourceId)}
      className="inline-flex min-h-[36px] items-center text-[13px] font-semibold underline-offset-2 hover:underline"
      style={{ color: "var(--earn-coral-ink)" }}
      data-testid={`events-details-${event.id}`}
    >
      Event details
    </Link>
  );
}

/** One "What's on" row — the shared `EventRow` with this surface's words (SH-1 Launch item 13). */
function WhatsOnRow({ event, isNext, onPlanAround }: { event: CalendarEvent; isNext: boolean; onPlanAround: (s: PlanningSource) => void }) {
  const photo = cityEventPhoto(event.imagePath, event.marketKey);
  const credit = photo?.fallback ? resolveBillboardCredit(photo.src, LANDING_PHOTO_ATTRIBUTION as PhotoAttribution[]) : null;
  // Q13.3: a city photo is shown only with its credit, and always says it is the city, not the event; none ⇒ no block.
  const shown = photo && (!photo.fallback || credit) ? { src: photo.src, credit: photo.fallback && credit ? `City photo, not the event · ${credit.creator} · ${credit.site}` : null } : null;
  return (
    <EventRow
      id={event.id}
      testIdPrefix="events-row"
      firstDate={event.firstDate}
      countdown={`${isNext ? "Next up · " : ""}${countdownLabel(event.daysUntil)}`}
      tag={eventTag(event)}
      title={event.title}
      photo={shown}
      lines={[
        { text: eventWhen(event), testId: `events-row-when-${event.id}` },
        { text: eventPlace(event), testId: `events-row-place-${event.id}`, tone: "muted" },
        ...(event.partnerName ? [{ text: event.partnerName, testId: `events-row-partner-${event.id}` }] : []),
      ]}
      actions={
        <>
          <PlanButton event={event} filled={isNext} onPlanAround={onPlanAround} />
          {event.partner ? null : <DetailsLink event={event} />}
        </>
      }
    />
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
  // SH-1 item 4: an event outside its market city counts toward its venue city, never the market city.
  const cities = new Set(rows.map(countedCityKey)).size;
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

      {rows.map((e) => (
        <WhatsOnRow key={e.id} event={e} isNext={e.id === nextId} onPlanAround={onPlanAround} />
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

