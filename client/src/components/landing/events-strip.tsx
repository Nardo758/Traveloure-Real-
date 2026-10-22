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
  venueCityLabel,
} from "@shared/city-events";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { resolveBillboardCredit, type PhotoAttribution } from "@shared/landing-billboard";
import type { PlanDoor } from "@shared/slip-funnel-events";
import type { PlanningSource } from "@/contexts/PlanningContext";
import { EVENT_OCCASION_SLUG } from "@/lib/plan-entry";
import { isShowSeries } from "@shared/event-page";
import { EventRow } from "@/components/events/EventRow";
import LANDING_PHOTO_ATTRIBUTION from "../../../public/images/landing/ATTRIBUTION.json";
import { SectionHeader, OpenSection } from "./section-header";


/** The occasion "Plan around it" pre-sets — seeded by the experience-types seeder (the one slug, `EVENT_OCCASION_SLUG`). */
export const CITY_EVENT_OCCASION_SLUG = EVENT_OCCASION_SLUG;

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
  event: Pick<CityEventCard, "series" | "title" | "city" | "marketKey" | "firstDate" | "lastDate" | "startTime" | "venue"> & { sourceId?: string; seriesKey?: string | null },
  door: CityEventDoor,
  // SH-1 Launch Q14.1: the series' show dates when the door holds them (two or more sibling rows); absent otherwise.
  showDates?: readonly string[],
): PlanningSource {
  const market = OPERATING_MARKETS.find((m) => m.marketKey === event.marketKey);
  return {
    door,
    experienceSlug: CITY_EVENT_OCCASION_SLUG,
    city: event.city,
    ...(market ? { country: market.country } : {}),
    // SH-1 Launch Q14.3: the row the plan is built around, so the mint can refuse it once it has ended.
    ...(event.sourceId ? { eventSourceId: event.sourceId } : {}),
    ...(event.seriesKey ? { seriesKey: event.seriesKey } : {}),
    ...(showDates && isShowSeries(showDates) ? { showDates } : {}),
    anchor: {
      title: event.series ?? event.title,
      firstDate: event.firstDate,
      lastDate: event.lastDate,
      startTime: event.startTime,
      venue: event.venue,
    },
  };
}

/** One strip card — the shared `EventRow` with the strip's words (SH-1 Launch item 13). */
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
  // Q13.3: a card with no photo of its own city draws no image block at all (§13: an empty frame reads as a missing picture).
  const shown = photo && (!photo.fallback || credit) ? { src: photo.src, credit: credit ? `Photo: ${credit.creator} · ${credit.site}` : null } : null;
  // SH-1 item 4: an event outside the market city names its venue city and no neighbourhood.
  const place = venueCityLabel(event) ?? `${event.city}${event.neighbourhood ? ` · ${event.neighbourhood}` : ""}`;
  return (
    <EventRow
      id={event.id}
      testIdPrefix="city-event"
      firstDate={event.firstDate}
      countdown={countdownLabel(event.daysUntil)}
      tag={cityEventTag(event.nights)}
      title={event.series ?? event.title}
      photo={shown}
      lines={[
        { text: place, tone: "muted" },
        { text: `${formatEventDates(event.firstDate, event.lastDate, event.nights)} · ${event.venue}` },
        ...(event.blurb ? [{ text: event.blurb, tone: "muted" as const }] : []),
      ]}
      actions={
        <button
          type="button"
          onClick={() => onPlanAround(planAroundSource(event, door))}
          className="inline-flex min-h-[36px] items-center self-start rounded-[8px] border px-3 text-[13px] font-semibold"
          style={{ borderColor: "var(--earn-coral-ink)", color: "var(--earn-coral-ink)" }}
          data-testid={`city-event-plan-${event.id}`}
        >
          Plan around it
        </button>
      }
    />
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

/**
 * Kyoto pages show dated events in the Kyoto market that are not outside the city.
 * `outsideCity` is the existing distance rule (SH-1 item 4 / `eventPlacement`).
 */
export function kyotoPageEvents(events: readonly CityEventCard[]): CityEventCard[] {
  return events.filter((e) => e.marketKey === "kyoto" && e.outsideCity !== true);
}

/** Pure: whether the strip renders, and which cards — absent below the threshold of Kyoto events. */
export function stripCards(payload: CityEventsPayload | undefined | null): CityEventCard[] | null {
  if (!payload) return null;
  const events = kyotoPageEvents(payload.events);
  if (!showCityEventsStrip(events.length)) return null;
  return events.slice(0, CITY_EVENTS_STRIP_MAX);
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

