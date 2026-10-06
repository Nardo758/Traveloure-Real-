/**
 * event-detail.tsx — an event's own page, `/events/<source_id>` (ledger `2026-10-06-event-page`;
 * events-page brief 2b; boards `EventDetail`, `EventDetailMobile`; rulings E2 address, E3 door).
 *
 * Everything shown is the server's (`GET /api/city-events/:sourceId`, shaped by `event-page.service`):
 *   · title, vertical (omitted when not stated), length, local dates, venue, market city and the
 *     "outside the city" line only where a locality is stored;
 *   · "Dates and venue from <host>" — the organizer's page, only where the link passed the refusal
 *     check; no "checked" date on that line, because the row stores none (E4);
 *   · "Good to know" — attributed official facts only, each with "from <source> · checked <date>";
 *     absent when there is none;
 *   · the countdown, "N verified in <city>" (absent at zero), "Plan around it" (the `event_detail`
 *     door, the same anchor the list sends) and "More in <city>".
 * Locals' notes and traveler comments are 2c: no section for them exists here, not even an empty one.
 * An unknown, withdrawn or ambiguous address is a "not on our calendar" page, never an empty shell.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { eventDetailPath, eventPlace, eventTag, eventWhen, VERTICAL_LABELS } from "@shared/events-calendar";
import { verifiedLocalsLine, type EventPagePayload } from "@shared/event-page";
import { planAroundSource } from "@/components/landing/events-strip";
import { usePlanning, type PlanningSource } from "@/contexts/PlanningContext";

const FRAUNCES = "'Fraunces', Georgia, serif";
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

type Loaded = { kind: "page"; page: EventPagePayload } | { kind: "missing" };

async function fetchEventPage(sourceId: string): Promise<Loaded> {
  const res = await fetch(`/api/city-events/${encodeURIComponent(sourceId)}`, { credentials: "include" });
  if (res.status === 404) return { kind: "missing" };
  if (!res.ok) throw new Error(`${res.status}`);
  return { kind: "page", page: (await res.json()) as EventPagePayload };
}

function formatShort(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function BackLink() {
  return (
    <Link href="/events" className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--earn-ink)" }} data-testid="event-detail-back">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      All events
    </Link>
  );
}

export function Missing() {
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-10" data-testid="event-detail-missing">
      <BackLink />
      <h1 className="text-[28px] font-semibold" style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}>
        This event is not on our calendar
      </h1>
      <p className="text-[15px]" style={{ color: "var(--earn-muted)" }}>
        It may have been withdrawn, or the link is wrong. The calendar lists every event we know about.
      </p>
    </div>
  );
}

export default function EventDetailPage() {
  const params = useParams<{ sourceId: string }>();
  const sourceId = params.sourceId ?? "";
  const { open } = usePlanning();
  const { data, isLoading, isError } = useQuery<Loaded>({
    queryKey: ["event-page", sourceId],
    queryFn: () => fetchEventPage(sourceId),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[960px] px-4 py-10 text-[14px]" style={{ color: "var(--earn-muted)" }} data-testid="event-detail-loading">
        Loading the event…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-10" data-testid="event-detail-error">
        <BackLink />
        <p className="text-[15px]" style={{ color: "var(--earn-ink)" }}>This event could not be read right now. Try again in a moment.</p>
      </div>
    );
  }
  if (data.kind === "missing") return <Missing />;
  return <EventDetailBody page={data.page} onPlanAround={open} />;
}

/** The page body, from the payload alone — rendered by the route and by the render test. */
export function EventDetailBody({ page, onPlanAround }: { page: EventPagePayload; onPlanAround: (s: PlanningSource) => void }) {
  const { event, countdown, organizer, goodToKnow, moreInCity, verifiedLocals } = page;
  const verifiedLine = verifiedLocalsLine(verifiedLocals, event.city);
  const verticalLabel = event.vertical ? VERTICAL_LABELS[event.vertical] : null;

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6 px-4 py-6 md:py-10" data-testid="event-detail">
      <BackLink />

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[10.5px] uppercase tracking-[0.12em]" style={{ fontFamily: MONO, color: "var(--earn-teal-ink)" }}>
          {verticalLabel && <span data-testid="event-detail-vertical">{verticalLabel}</span>}
          {verticalLabel && <span aria-hidden="true">·</span>}
          <span data-testid="event-detail-tag">{eventTag(event)}</span>
        </div>
        <h1 className="text-[30px] font-semibold leading-tight md:text-[40px]" style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }} data-testid="event-detail-title">
          {event.title}
        </h1>
        <p className="text-[15px]" style={{ color: "var(--earn-ink)" }} data-testid="event-detail-when">
          {eventWhen(event)}
        </p>
        <p className="text-[14px]" style={{ color: "var(--earn-muted)" }} data-testid="event-detail-place">
          {eventPlace(event)}
        </p>
        <span
          className="self-start rounded-[6px] border px-2 py-[3px] text-[10.5px] uppercase tracking-[0.08em]"
          style={{ fontFamily: MONO, color: "var(--earn-ink)", borderColor: "var(--earn-border)", background: "var(--earn-card)" }}
          data-testid="event-detail-countdown"
        >
          {countdown}
        </span>
      </header>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-6">
          {organizer && (
            <p className="text-[13.5px]" style={{ color: "var(--earn-muted)" }} data-testid="event-detail-organizer">
              Dates and venue from{" "}
              <a href={organizer.url} target="_blank" rel="nofollow noopener noreferrer" className="font-semibold underline underline-offset-2" style={{ color: "var(--earn-ink)" }}>
                {organizer.host}
              </a>
            </p>
          )}

          {goodToKnow.length > 0 && (
            <section aria-labelledby="event-good-to-know" className="flex flex-col gap-3" data-testid="event-detail-good-to-know">
              <h2 id="event-good-to-know" className="text-[20px] font-semibold" style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}>
                Good to know
              </h2>
              <ul className="flex flex-col gap-3">
                {goodToKnow.map((f, i) => (
                  <li key={`${f.factType}-${i}`} className="rounded-[12px] border p-3" style={{ borderColor: "var(--earn-border)", background: "var(--earn-card)" }} data-testid="event-detail-fact">
                    <p className="text-[14px]" style={{ color: "var(--earn-ink)" }}>{f.text}</p>
                    <p className="mt-1 text-[11.5px]" style={{ fontFamily: MONO, color: "var(--earn-muted)" }}>
                      <a href={f.sourceUrl} target="_blank" rel="nofollow noopener noreferrer" className="underline underline-offset-2">
                        {f.label}
                      </a>{" "}
                      · {f.checked}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {moreInCity.length > 0 && (
            <section aria-labelledby="event-more-in-city" className="flex flex-col gap-3" data-testid="event-detail-more">
              <h2 id="event-more-in-city" className="text-[20px] font-semibold" style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}>
                More in {event.city}
              </h2>
              <ul className="flex flex-col gap-2">
                {moreInCity.map((m) => (
                  <li key={m.sourceId}>
                    <Link
                      href={eventDetailPath(m.sourceId)}
                      className="flex flex-col rounded-[12px] border p-3 hover:bg-black/[0.02]"
                      style={{ borderColor: "var(--earn-border)", background: "var(--earn-card)" }}
                      data-testid={`event-detail-more-${m.sourceId}`}
                    >
                      <span className="text-[15px] font-semibold" style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}>{m.title}</span>
                      <span className="text-[12.5px]" style={{ color: "var(--earn-muted)" }}>
                        {m.firstDate === m.lastDate ? formatShort(m.firstDate) : `${formatShort(m.firstDate)} – ${formatShort(m.lastDate)}`} · {m.venue}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-3 self-start rounded-[14px] border p-4" style={{ borderColor: "var(--earn-border)", background: "var(--earn-card)" }}>
          <button
            type="button"
            onClick={() => onPlanAround(planAroundSource(event, "event_detail"))}
            className="inline-flex min-h-[44px] items-center justify-center rounded-[10px] bg-primary px-4 text-[14px] font-semibold text-primary-foreground"
            data-testid="event-detail-plan"
          >
            Plan around it
          </button>
          <p className="text-[12.5px]" style={{ color: "var(--earn-muted)" }}>
            Starts a plan in {event.city} with this event's dates and venue filled in.
          </p>
          {verifiedLine && (
            <p className="text-[13px] font-semibold" style={{ color: "var(--earn-ink)" }} data-testid="event-detail-verified">
              {verifiedLine}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
