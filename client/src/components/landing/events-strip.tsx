/**
 * events-strip.tsx — "Coming up in our cities" (landing reorder, ledger `2026-09-28-city-events`).
 *
 * Renders from GET /api/city-events/upcoming and nothing else: every value on a card is the
 * event row's own or derived server-side from it (countdown, local dates, nights). The strip is
 * ABSENT — not an empty state, not a placeholder — below CITY_EVENTS_STRIP_MIN events in the
 * next 180 days. "Plan around it" opens a NEW plan with occasion `show`, the event's market, and
 * the event as the plan's anchor.
 *
 * The /events "Coming up" block that shared these cards is retired (ledger
 * `2026-10-06-events-calendar`): /events lists "What's on" from its own calendar read.
 */
import { useQuery } from "@tanstack/react-query";
import {
  CITY_EVENTS_STRIP_MAX,
  cityEventPhoto,
  cityEventTag,
  countdownLabel,
  showCityEventsStrip,
  type CityEventCard,
  type CityEventsPayload,
} from "@shared/city-events";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { resolveBillboardCredit, type PhotoAttribution } from "@shared/landing-billboard";
import type { PlanDoor } from "@shared/slip-funnel-events";
import type { PlanningSource } from "@/contexts/PlanningContext";
import LANDING_PHOTO_ATTRIBUTION from "../../../public/images/landing/ATTRIBUTION.json";
import { SectionHeader, OpenSection } from "./section-header";

const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/** The occasion "Plan around it" pre-sets — seeded by the experience-types seeder. */
export const CITY_EVENT_OCCASION_SLUG = "show";

function dayParts(date: string): { month: string; day: number; key: string } {
  const [y, m, d] = date.split("-").map(Number);
  const month = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return { month, day: d, key: `${y}-${m}` };
}

/**
 * US dates (H1, ledger `2026-10-08-h1-home-copy`): one day "Oct 16"; a range inside one month
 * "Oct 10–12" (en dash, no spaces); a range across months "Oct 14 – Nov 5" (spaced en dash).
 * The days are the event's own local calendar dates (`firstDate`/`lastDate`), read as written.
 */
export function formatEventDates(firstDate: string, lastDate: string, nights: number): string {
  const a = dayParts(firstDate);
  if (nights <= 1 || lastDate === firstDate) return `${a.month} ${a.day}`;
  const b = dayParts(lastDate);
  return a.key === b.key ? `${a.month} ${a.day}–${b.day}` : `${a.month} ${a.day} – ${b.month} ${b.day}`;
}

/**
 * Which surface a "Plan around it" press came from — the funnel door (slip-funnel-events.md §3.1,
 * amended 2026-09-28): the landing strip is `event_strip`, /events "What's on" is `events_page`.
 */
export type CityEventDoor = Extract<PlanDoor, "event_strip" | "events_page" | "blog_post" | "event_detail">;

/** The PlanningSource "Plan around it" opens — the event row's own facts only, plus the door. */
export function planAroundSource(
  event: Pick<CityEventCard, "series" | "title" | "city" | "marketKey" | "firstDate" | "lastDate" | "startTime" | "venue">,
  door: CityEventDoor,
): PlanningSource {
  const market = OPERATING_MARKETS.find((m) => m.marketKey === event.marketKey);
  return {
    door,
    experienceSlug: CITY_EVENT_OCCASION_SLUG,
    city: event.city,
    ...(market ? { country: market.country } : {}),
    anchor: {
      title: event.series ?? event.title,
      firstDate: event.firstDate,
      lastDate: event.lastDate,
      startTime: event.startTime,
      venue: event.venue,
    },
  };
}

function EventCard({
  event,
  door,
  onPlanAround,
}: {
  event: CityEventCard;
  door: CityEventDoor;
  onPlanAround: (s: PlanningSource) => void;
}) {
  const photo = cityEventPhoto(event.imagePath, event.marketKey);
  const credit = photo?.fallback ? resolveBillboardCredit(photo.src, LANDING_PHOTO_ATTRIBUTION as PhotoAttribution[]) : null;
  const showPhoto = !!photo && (!photo.fallback || !!credit);
  const chips = (
    <>
      <span
        className="rounded-[6px] px-[7px] py-[3px] text-[9.5px] uppercase tracking-[0.1em] text-white"
        style={{ fontFamily: EARN_MONO, background: "var(--earn-navy)" }}
        data-testid={`city-event-tag-${event.id}`}
      >
        {cityEventTag(event.nights)}
      </span>
      <span
        className="rounded-[6px] border bg-white px-[7px] py-[3px] text-[9.5px] uppercase tracking-[0.08em]"
        style={{ fontFamily: EARN_MONO, color: "var(--earn-ink)", borderColor: "var(--earn-border)" }}
        data-testid={`city-event-countdown-${event.id}`}
      >
        {countdownLabel(event.daysUntil)}
      </span>
    </>
  );
  const dates = formatEventDates(event.firstDate, event.lastDate, event.nights);
  return (
    <article
      className="flex flex-col overflow-hidden rounded-[14px] border bg-white"
      style={{ borderColor: "var(--earn-border)" }}
      data-testid={`city-event-${event.id}`}
    >
      {/* A card with no photo of its own city draws no image box at all — the tags sit in the
          body instead (§13: an empty frame reads as a missing picture). */}
      {showPhoto ? (
        <div className="relative h-[130px]">
          <img src={photo!.src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">{chips}</div>
          {credit && (
            <span className="absolute bottom-1.5 right-2 text-[9px] text-white/85" style={{ fontFamily: EARN_MONO }}>
              Photo: {credit.creator} · {credit.site}
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2 px-3.5 pt-3">{chips}</div>
      )}
      <div className="flex flex-1 flex-col gap-[5px] px-3.5 pb-3.5 pt-3">
        <span className="text-[10px] uppercase tracking-[0.1em]" style={{ fontFamily: EARN_MONO, color: "var(--earn-teal-ink)" }}>
          {event.city}
          {event.neighbourhood ? ` · ${event.neighbourhood}` : ""}
        </span>
        <b className="text-[18px] font-semibold leading-tight" style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}>
          {event.series ?? event.title}
        </b>
        <span className="text-[12.5px]" style={{ color: "var(--earn-ink)" }}>
          {dates} · {event.venue}
        </span>
        {event.blurb && (
          <span className="text-[12.5px] leading-snug" style={{ color: "var(--earn-muted)" }}>
            {event.blurb}
          </span>
        )}
        <button
          type="button"
          onClick={() => onPlanAround(planAroundSource(event, door))}
          className="mt-auto inline-flex min-h-[36px] items-center self-start rounded-[8px] border px-3 text-[13px] font-semibold"
          style={{ borderColor: "var(--earn-coral-ink)", color: "var(--earn-coral-ink)" }}
          data-testid={`city-event-plan-${event.id}`}
        >
          Plan around it
        </button>
      </div>
    </article>
  );
}

export function CityEventCards({
  events,
  door,
  onPlanAround,
}: {
  events: readonly CityEventCard[];
  door: CityEventDoor;
  onPlanAround: (s: PlanningSource) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="city-events-cards">
      {events.map((e) => (
        <EventCard key={e.id} event={e} door={door} onPlanAround={onPlanAround} />
      ))}
    </div>
  );
}

/** Pure: whether the strip renders, and which cards — absent below the threshold. */
export function stripCards(payload: CityEventsPayload | undefined | null): CityEventCard[] | null {
  if (!payload || !showCityEventsStrip(payload.total)) return null;
  return payload.events.slice(0, CITY_EVENTS_STRIP_MAX);
}

export function EventsStripContent({
  payload,
  onPlanAround,
}: {
  payload: CityEventsPayload | undefined | null;
  onPlanAround: (s: PlanningSource) => void;
}) {
  const cards = stripCards(payload);
  if (!cards) return null;
  return (
    <OpenSection testId="section-city-events">
      <SectionHeader
        eyebrow={`Next ${payload!.windowDays} days`}
        title="Coming up in our cities"
        link={{ label: "All events →", href: "/events", testId: "link-all-events" }}
      />
      <CityEventCards events={cards} door="event_strip" onPlanAround={onPlanAround} />
    </OpenSection>
  );
}

export function EventsStrip({ onPlanAround }: { onPlanAround: (s: PlanningSource) => void }) {
  const { data } = useQuery<CityEventsPayload>({ queryKey: ["/api/city-events/upcoming"] });
  return <EventsStripContent payload={data} onPlanAround={onPlanAround} />;
}

