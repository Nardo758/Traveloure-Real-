/**
 * numbers-strip.tsx — "Useful numbers, honestly shown" (landing-build Phase 2.7).
 * Visual of record: docs/design/landing-earn-mock.html "NUMBERS: inline".
 *
 * Reads GET /api/platform/stats and renders an em-dash for any zero/absent figure —
 * the ruled replacement for the old hero-stat "0+" fallbacks (§13: an empty platform
 * shows "—", never a padded count). Inline type, no card chrome.
 */
import { useQuery } from "@tanstack/react-query";
import { SectionHeader, OpenSection } from "./section-header";

const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface PlatformStats {
  totalTrips?: number;
  totalReviews?: number;
  totalExperts?: number;
  totalCountries?: number;
}

function honest(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

export function NumbersStrip() {
  const { data: stats } = useQuery<PlatformStats>({ queryKey: ["/api/platform/stats"] });
  const rows = [
    { value: honest(stats?.totalTrips), label: "Trips planned", note: "Itineraries on Traveloure" },
    { value: honest(stats?.totalReviews), label: "Reviews", note: "From completed bookings" },
    { value: honest(stats?.totalExperts), label: "Local experts", note: "Reviewed and approved" },
    { value: honest(stats?.totalCountries), label: "Countries", note: "Experts and providers active" },
  ];
  return (
    <OpenSection testId="section-numbers">
      <SectionHeader eyebrow="Platform · live" title="Useful numbers, honestly shown" />
      <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-4" data-testid="numbers-strip">
        {rows.map((r) => (
          <div key={r.label}>
            <b
              className="block text-[30px] font-semibold leading-none"
              style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}
              data-testid={`number-${r.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {r.value}
            </b>
            <span className="mt-1.5 block text-[13px] font-semibold" style={{ color: "var(--earn-ink)" }}>
              {r.label}
            </span>
            <small className="text-[11px]" style={{ fontFamily: EARN_MONO, color: "var(--earn-muted)" }}>
              {r.note}
            </small>
          </div>
        ))}
      </div>
    </OpenSection>
  );
}
