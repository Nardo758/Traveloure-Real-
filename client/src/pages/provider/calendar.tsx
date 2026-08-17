/**
 * Provider Channel Calendar — Console IA C9.
 * Read-only month view: every chip opens the listing's own availability
 * editor on Catalog. The editor lives on Catalog (G1 recommendation).
 *
 * Route: /provider/calendar
 * Data:  GET /api/me/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight } from "lucide-react";

// ── design tokens (matching _consoleShared) ───────────────────────────────────
const INK   = "#1A1A18";
const MUT   = "#7A7A72";
const HAIR  = "#E8E8E2";
const GRD   = "#FAFAF8";
const ACC   = "#35605A";
const ACCS  = "#EDF2F1";
// blackout — warm amber
const WARN_BG   = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK  = "#6B551F";

// ── types ─────────────────────────────────────────────────────────────────────
type Lane = "inbound" | "outbound" | "availability" | "store";

interface CalendarEvent {
  id: string;
  lane: Lane;
  kind: string;   // "open_slot" | "full_slot" | "blackout" | "booking" | …
  date: string;   // YYYY-MM-DD
  title: string;
  href: string;
  status?: string;
}

// ── chip style — driven by kind, not lane, so blackouts and full slots differ
function chipStyle(e: CalendarEvent): React.CSSProperties {
  if (e.kind === "blackout") {
    return { background: WARN_BG, color: WARN_INK, border: `1px solid ${WARN_LINE}` };
  }
  if (e.kind === "full_slot") {
    return { background: "#E0EDEB", color: ACC };
  }
  if (e.lane === "inbound" || e.kind === "booking") {
    return { background: ACCS, color: ACC, border: `1px solid #BFD5D0` };
  }
  // open_slot + everything else → teal
  return { background: ACCS, color: ACC };
}

// ── month helpers ─────────────────────────────────────────────────────────────
function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }
function ymd(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}
function monthLabel(year: number, month0: number): string {
  return new Date(year, month0, 1).toLocaleDateString("en-US", {
    month: "long", year: "numeric",
  });
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function ProviderCalendar() {
  const today  = new Date();
  const [year,   setYear]   = useState(today.getFullYear());
  const [month0, setMonth0] = useState(today.getMonth());

  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const from     = ymd(year, month0, 1);
  const to       = ymd(year, month0, daysInMonth);
  const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate());

  const { data, isLoading } = useQuery<{ events: CalendarEvent[] }>({
    queryKey: ["/api/me/calendar", { from, to }],
  });

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of data?.events ?? []) {
      const list = map.get(e.date);
      if (list) list.push(e);
      else map.set(e.date, [e]);
    }
    return map;
  }, [data]);

  const prevMonth = () => {
    if (month0 === 0) { setYear(y => y - 1); setMonth0(11); }
    else setMonth0(m => m - 1);
  };
  const nextMonth = () => {
    if (month0 === 11) { setYear(y => y + 1); setMonth0(0); }
    else setMonth0(m => m + 1);
  };

  // Sunday-first grid (getDay(): 0=Sun, 1=Mon … 6=Sat → leadingBlanks = getDay())
  const firstWeekday  = new Date(year, month0, 1).getDay();
  const leadingBlanks = firstWeekday; // 0 = Sunday, no blanks needed
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const DAY_HEADS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <ProviderLayout title="Calendar">
      <div style={{ padding: "0 0 32px" }}>

        {/* page header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: INK, margin: "0 0 6px" }}>
            Calendar
          </h1>
          <p style={{ fontSize: 13, color: MUT, margin: 0, lineHeight: 1.55 }}>
            Everything published or booked across your listings, in one month.
            This surface <strong style={{ color: INK }}>reads</strong> — every chip opens
            the listing's own availability editor on Catalog.
          </p>
        </div>

        {/* month grid card */}
        <div
          style={{
            background: "#fff", borderRadius: 8, border: `1px solid ${HAIR}`, overflow: "hidden",
          }}
          data-testid="grid-calendar"
        >
          {/* month header */}
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 18px", borderBottom: `1px solid ${HAIR}`,
            }}
          >
            <span
              style={{ fontSize: 15, fontWeight: 700, color: INK, flex: 1 }}
              data-testid="text-calendar-month"
            >
              {monthLabel(year, month0)}
            </span>

            {/* Read-only label */}
            <span style={{ fontSize: 12, color: MUT, marginRight: 6 }}>Read-only</span>

            {/* prev / next */}
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Previous month"
              data-testid="button-calendar-prev"
              style={{
                background: "none", border: `1px solid ${HAIR}`, borderRadius: 5,
                width: 28, height: 28, display: "flex", alignItems: "center",
                justifyContent: "center", cursor: "pointer", color: MUT,
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Next month"
              data-testid="button-calendar-next"
              style={{
                background: "none", border: `1px solid ${HAIR}`, borderRadius: 5,
                width: 28, height: 28, display: "flex", alignItems: "center",
                justifyContent: "center", cursor: "pointer", color: MUT,
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* skeleton */}
          {isLoading ? (
            <Skeleton className="h-96 m-4" data-testid="skeleton-calendar" />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <div
                style={{
                  display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))",
                  minWidth: 560,
                }}
              >
                {/* day-of-week headers */}
                {DAY_HEADS.map(d => (
                  <div
                    key={d}
                    style={{
                      padding: "6px 8px",
                      fontSize: 10.5, fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: "0.07em", color: MUT,
                      background: GRD, borderBottom: `1px solid ${HAIR}`,
                      borderRight: `1px solid ${HAIR}`,
                    }}
                  >
                    {d}
                  </div>
                ))}

                {/* day cells */}
                {cells.map((day, i) => {
                  const dateStr   = day == null ? null : ymd(year, month0, day);
                  const dayEvents = dateStr ? eventsByDate.get(dateStr) ?? [] : [];
                  const isToday   = dateStr === todayStr;
                  const isLastCol = (i + 1) % 7 === 0;

                  return (
                    <div
                      key={i}
                      data-testid={dateStr ? `cell-calendar-${dateStr}` : undefined}
                      style={{
                        minHeight: 90, padding: "6px 6px 8px",
                        borderBottom: `1px solid ${HAIR}`,
                        borderRight: isLastCol ? "none" : `1px solid ${HAIR}`,
                        // Today gets a bold inked border on all 4 sides
                        outline: isToday ? `2px solid ${INK}` : "none",
                        outlineOffset: -2,
                        background: "#fff",
                        position: "relative",
                      }}
                    >
                      {day != null && (
                        <div
                          style={{
                            fontSize: 12, marginBottom: 4,
                            color: isToday ? INK : MUT,
                            fontWeight: isToday ? 700 : 400,
                          }}
                        >
                          {day}
                        </div>
                      )}

                      {dayEvents.map(e => (
                        <Link key={e.id} href={e.href}>
                          <a
                            data-testid={`event-calendar-${e.id}`}
                            title={e.title}
                            style={{
                              display: "block", borderRadius: 4,
                              padding: "3px 6px", marginBottom: 3,
                              fontSize: 11, fontWeight: 500,
                              lineHeight: 1.4, cursor: "pointer",
                              wordBreak: "break-word",
                              textDecoration: "none",
                              ...chipStyle(e),
                            }}
                          >
                            {e.title}
                          </a>
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* legend */}
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 14, fontSize: 11.5, color: MUT }}
          data-testid="legend-calendar"
        >
          {[
            { label: "Open slot", bg: ACCS, border: "#BFD5D0" },
            { label: "Full slot",  bg: "#E0EDEB", border: "#BFD5D0" },
            { label: "Blackout",   bg: WARN_BG,   border: WARN_LINE },
            { label: "Booking",    bg: ACCS,       border: "#BFD5D0" },
          ].map(({ label, bg, border }) => (
            <span key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  display: "inline-block", width: 10, height: 10, borderRadius: 3,
                  background: bg, border: `1px solid ${border}`,
                }}
              />
              {label}
            </span>
          ))}
          <span style={{ marginLeft: "auto" }}>
            <Link href="/provider/services">
              <a style={{ color: ACC, textDecoration: "underline", textUnderlineOffset: 2, fontSize: 12 }}>
                Edit availability on Catalog →
              </a>
            </Link>
          </span>
        </div>
      </div>
    </ProviderLayout>
  );
}
