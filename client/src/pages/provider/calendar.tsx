/**
 * Provider Channel Calendar — Console IA C9 (§17 17→9 collapse, the provider nine-module
 * stamp; transplants the expert calendar.tsx C3 pattern onto ProviderLayout).
 *
 * This route previously carried the "Availability Calendar" page. Its function accounting
 * (the absorb-first/collapse-last discipline):
 *   - booking month grid (bookingDetails.scheduledDate) → covered by this calendar's inbound
 *     lane, which reads the REAL schedule (claimed slot date COALESCE scheduledDate) from the
 *     same GET /api/me/calendar aggregate the expert console uses — a superset of the old read.
 *   - day-detail booking cards + "Upcoming Bookings" list → those re-rendered another module's
 *     surface; per the one-home rule events here REFERENCE /provider/inbox instead (C9 Inbox
 *     absorption retired /provider/bookings — see calendar.routes.ts hrefs.inbox).
 *   - "Edit Schedule" / "Block Dates" sheets → were explicitly non-persisting local previews
 *     ("Preview only — availability scheduling is coming soon", Save disabled), so no real
 *     function is lost. REAL slot editing (vendor_availability_slots, the canonical model)
 *     lives on Catalog (/provider/services availability section, the /api/me/services/:id/slots
 *     CRUD) — the ratified "availability editing belongs to Catalog" placement.
 *
 * ONE channel-filtered calendar (never per-channel calendars). Every event is backed by a real
 * row; an empty month renders an honest empty grid (§13). Chips are the PROVIDER-real subset:
 * the aggregate can only emit booking + availability events for a provider role (agent
 * requests are expert-family-only server-side; store lifecycle / purchases / client
 * deliveries hang off expert-authored listings and assignments), so the expert console's
 * Client/Store/Direct chips are deliberately NOT rendered here — a filter chip over a lane
 * that can never populate would be a dead control, not honesty.
 *
 * Styling: console tokens ONLY (var(--console-*) / tailwind console-*) — zero raw hex (§17).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { PageHeader } from "@/components/backoffice/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

// ─── Types (the calendar.routes.ts event shape) ─────────────────────────────

type Lane = "inbound" | "outbound" | "availability" | "store";

interface CalendarEvent {
  id: string;
  lane: Lane;
  kind: string;
  date: string; // YYYY-MM-DD
  title: string;
  href: string;
  status?: string;
}

// ─── Chips (provider-real subset — see header) ──────────────────────────────

type ChipKey = "all" | "bookings" | "availability";

const CHIPS: { key: ChipKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "bookings", label: "Bookings" },
  { key: "availability", label: "Availability" },
];

function matchesChip(e: CalendarEvent, chip: ChipKey): boolean {
  switch (chip) {
    case "all":
      return true;
    case "bookings":
      return e.kind === "booking";
    case "availability":
      return e.lane === "availability";
  }
}

// ─── Lane colors (console tokens only — §17) ────────────────────────────────

const LANE_STYLE: Record<Lane, { background: string; color: string }> = {
  inbound: { background: "var(--console-brand-soft)", color: "var(--console-brand)" },
  outbound: { background: "var(--console-warn-soft)", color: "var(--console-warn)" },
  availability: { background: "var(--console-ok-soft)", color: "var(--console-ok)" },
  store: { background: "var(--console-info-soft)", color: "var(--console-info)" },
};

const LEGEND: { lane: Lane; label: string }[] = [
  { lane: "inbound", label: "Inbound — bookings on your services" },
  { lane: "availability", label: "Availability you've opened" },
];

// ─── Month helpers (local, no TZ drift — the grid is a pure YYYY-MM-DD lattice) ──

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function ymd(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

function monthLabel(year: number, month0: number): string {
  return new Date(year, month0, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ProviderCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month0, setMonth0] = useState(today.getMonth());
  const [chip, setChip] = useState<ChipKey>("all");

  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const from = ymd(year, month0, 1);
  const to = ymd(year, month0, daysInMonth);
  const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate());

  // Month switch changes from/to → the query key → a refetch of the new window.
  const { data, isLoading } = useQuery<{ events: CalendarEvent[] }>({
    queryKey: ["/api/me/calendar", { from, to }],
  });

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of data?.events ?? []) {
      if (!matchesChip(e, chip)) continue;
      const list = map.get(e.date);
      if (list) list.push(e);
      else map.set(e.date, [e]);
    }
    return map;
  }, [data, chip]);

  const prevMonth = () => {
    if (month0 === 0) {
      setYear((y) => y - 1);
      setMonth0(11);
    } else {
      setMonth0((m) => m - 1);
    }
  };
  const nextMonth = () => {
    if (month0 === 11) {
      setYear((y) => y + 1);
      setMonth0(0);
    } else {
      setMonth0((m) => m + 1);
    }
  };

  // Monday-start grid (mockup §1): JS getDay() is 0=Sun..6=Sat → leading blanks = (day+6)%7.
  const firstWeekday = new Date(year, month0, 1).getDay();
  const leadingBlanks = (firstWeekday + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <ProviderLayout title="Calendar">
      {/* FP-4: the width cap lives on ProviderLayout now (one container for the whole
          console) — this page's own `max-w-6xl mx-auto` was the same value and is dropped
          rather than stacked. The month grid keeps its own `overflow-x-auto` + min-width
          and scrolls INSIDE the cap; it is not a full-bleed exception. */}
      <div className="p-6 space-y-4">
        <PageHeader
          title="Calendar"
          subtitle="Every channel, one timeline — each event links to its owning module."
          icon={CalendarDays}
          testId="text-calendar-title"
        />

        {/* Toolbar: month nav + channel filter chips */}
        <div className="flex flex-wrap items-center gap-2" data-testid="toolbar-calendar">
          <span className="text-[15px] font-bold text-console-darkest" data-testid="text-calendar-month">
            {monthLabel(year, month0)}
          </span>
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Previous month"
            className="p-1 rounded-md text-console-mid hover:text-console-darkest hover:bg-console-hover"
            data-testid="button-calendar-prev"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            aria-label="Next month"
            className="p-1 rounded-md text-console-mid hover:text-console-darkest hover:bg-console-hover"
            data-testid="button-calendar-next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="flex-1" />
          {/* Ruling 112 Q5: the standing access point into the availability editor. Calendar
              stays read-only (G1); this is the affordance the mock is amended to gain too
              (mockup README note) — chips deep-link per event, this works with zero events. */}
          <Link
            href="/provider/services?availability=1"
            className="text-[12px] font-semibold underline underline-offset-2 text-console-brand hover:opacity-80"
            data-testid="link-calendar-edit-availability"
          >
            Edit availability →
          </Link>
          {CHIPS.map((c) => {
            const on = chip === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setChip(c.key)}
                className="rounded-full px-3 py-0.5 text-[11.5px] font-semibold border"
                style={
                  on
                    ? {
                        borderColor: "var(--console-brand)",
                        color: "var(--console-brand)",
                        background: "var(--console-brand-soft)",
                      }
                    : { borderColor: "var(--console-line)", color: "var(--console-mid)" }
                }
                data-testid={`chip-calendar-${c.key}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Month grid — honest empty when nothing is scheduled (§13). */}
        {isLoading ? (
          <Skeleton className="h-96 rounded-xl" data-testid="skeleton-calendar" />
        ) : (
          <div className="overflow-x-auto">
            <div
              className="grid grid-cols-7 rounded-xl border border-console-light overflow-hidden min-w-[660px] bg-white dark:bg-transparent"
              data-testid="grid-calendar"
            >
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div
                  key={d}
                  className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-console-mid border-b border-console-light bg-console-bg"
                >
                  {d}
                </div>
              ))}
              {cells.map((day, i) => {
                const dateStr = day == null ? null : ymd(year, month0, day);
                const dayEvents = dateStr ? eventsByDate.get(dateStr) ?? [] : [];
                const isToday = dateStr === todayStr;
                return (
                  <div
                    key={i}
                    className="min-h-[86px] border-b border-r border-console-light/60 p-1.5 [&:nth-child(7n)]:border-r-0"
                    data-testid={dateStr ? `cell-calendar-${dateStr}` : undefined}
                  >
                    {day != null && (
                      <div
                        className="text-[10px] mb-1 tabular-nums"
                        style={{
                          color: isToday ? "var(--console-brand)" : "var(--console-mid)",
                          fontWeight: isToday ? 700 : 400,
                        }}
                      >
                        {day}
                      </div>
                    )}
                    {dayEvents.map((e) => (
                      <Link key={e.id} href={e.href}>
                        <span
                          className="block rounded-[5px] px-1.5 py-0.5 mb-1 text-[10.5px] font-semibold leading-tight truncate cursor-pointer hover:opacity-80"
                          style={LANE_STYLE[e.lane]}
                          title={e.title}
                          data-testid={`event-calendar-${e.id}`}
                        >
                          {e.title}
                        </span>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-[11.5px] text-console-mid" data-testid="legend-calendar">
          {LEGEND.map((l) => (
            <span key={l.lane} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-[3px] border"
                style={{
                  background: LANE_STYLE[l.lane].background,
                  borderColor: LANE_STYLE[l.lane].color,
                }}
              />
              {l.label}
            </span>
          ))}
        </div>
      </div>
    </ProviderLayout>
  );
}
