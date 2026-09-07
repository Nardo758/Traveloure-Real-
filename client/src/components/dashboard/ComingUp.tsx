import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { relativeDayLabel, shortDate, type UpcomingRow } from "@/lib/home-time-axis";

/**
 * ComingUp — Home's time axis (ledger `2026-09-07-home-time-axis`; CLAUDE.md Locked Decision
 * 45 (8), ruling row `2026-09-07-home-owns-time-axis`). The dated rows across EVERY plan, nearest
 * first, from the ONE reader `GET /api/me/upcoming` (server/services/upcoming.service.ts). Each
 * row: Fraunces date + mono relative day · one sentence · plan chip · mono source note · one
 * action that deep-links to where the row is acted on.
 *
 * §13: the server already omitted every undated row and every "0 invites"; this component adds
 * nothing to a row it did not receive. The count line states the window. With no rows it says so
 * — "Nothing dated in the next N days" is a true sentence about the window, not a claim that the
 * traveler has nothing to do.
 */
interface UpcomingPayload {
  rows: UpcomingRow[];
  windowDays: number;
  asOf: string;
}

const FRAUNCES = "'Fraunces', Georgia, serif";
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const KIND_TONE: Record<UpcomingRow["kind"], { color: string; bg: string }> = {
  booking_unpaid: { color: "var(--earn-coral-ink)", bg: "var(--earn-coral-bg)" },
  balance_due: { color: "var(--earn-gold-ink)", bg: "var(--earn-gold-wash)" },
  handover: { color: "var(--earn-navy)", bg: "var(--earn-chip)" },
  trip_start: { color: "var(--earn-green-ink)", bg: "rgba(93,202,165,0.12)" },
  event: { color: "var(--earn-teal-ink)", bg: "var(--earn-teal-wash)" },
  occasion_draft: { color: "var(--earn-teal-ink)", bg: "var(--earn-teal-wash)" },
};

export function useUpcoming(enabled: boolean) {
  return useQuery<UpcomingPayload>({
    queryKey: ["/api/me/upcoming"],
    queryFn: async () => {
      const res = await fetch("/api/me/upcoming", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch what is coming up");
      return res.json();
    },
    enabled,
    staleTime: 60_000,
  });
}

export function ComingUp({ data, isLoading, now }: { data: UpcomingPayload | undefined; isLoading: boolean; now: Date }) {
  const rows = data?.rows ?? [];
  const windowDays = data?.windowDays;

  return (
    <section className="mb-7" data-testid="coming-up-section">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[20px] leading-tight" style={{ fontFamily: FRAUNCES, color: "var(--earn-ink)" }}>
            Coming up
          </h2>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--earn-muted)" }}>
            What is dated, across every plan, nearest first
          </div>
        </div>
        <div
          className="text-[10.5px] uppercase tracking-[0.12em] text-right"
          style={{ fontFamily: MONO, color: "var(--earn-muted)" }}
          data-testid="coming-up-count"
        >
          {isLoading || !data
            ? "loading…"
            : rows.length === 0
              ? `nothing dated in the next ${windowDays} days`
              : `${rows.length} dated row${rows.length === 1 ? "" : "s"} in the next ${windowDays} days · nothing undated is shown`}
        </div>
      </div>

      <div
        className="rounded-[14px] overflow-hidden"
        style={{ background: "var(--earn-card)", border: "1px solid var(--earn-border)" }}
      >
        {!isLoading && data && rows.length === 0 && (
          <div className="px-4 py-6 text-[13px]" style={{ color: "var(--earn-muted)" }} data-testid="coming-up-empty">
            Nothing on your plans is dated in the next {windowDays} days. A row appears here the moment
            something has a date — a plan start, an event, a payment cutoff.
          </div>
        )}
        {rows.map((row, i) => {
          const tone = KIND_TONE[row.kind];
          return (
            <div
              key={`${row.kind}-${row.tripId ?? "none"}-${row.date}-${i}`}
              className="grid gap-x-4 gap-y-1 px-4 py-3 items-start"
              style={{
                gridTemplateColumns: "72px minmax(0, 1fr) auto",
                borderTop: i > 0 ? "1px solid var(--earn-border)" : "none",
              }}
              data-testid={`coming-up-row-${row.kind}`}
            >
              <div>
                <div className="text-[17px] leading-none" style={{ fontFamily: FRAUNCES, color: "var(--earn-ink)" }}>
                  {shortDate(row)}
                </div>
                <div className="text-[10px] mt-1 lowercase" style={{ fontFamily: MONO, color: "var(--earn-muted)" }}>
                  {relativeDayLabel(row, now)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] leading-snug" style={{ color: "var(--earn-ink)" }}>
                  {row.sentence}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span
                    className="text-[10.5px] px-1.5 py-0.5 rounded-md"
                    style={{ background: tone.bg, color: tone.color }}
                    data-testid="coming-up-plan-chip"
                  >
                    {row.planName}
                  </span>
                  <span className="text-[10px] truncate" style={{ fontFamily: MONO, color: "var(--earn-faint)" }} title={row.source}>
                    {row.source}
                  </span>
                </div>
              </div>
              <Link
                href={row.action.href}
                className="text-[12px] font-medium whitespace-nowrap hover:underline"
                style={{ color: "var(--earn-coral-ink)" }}
                data-testid="coming-up-action"
              >
                {row.action.label} →
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
