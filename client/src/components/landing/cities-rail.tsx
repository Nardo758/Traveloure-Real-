/**
 * cities-rail.tsx — "Cities with momentum this month" (landing-build Phase 2.6).
 * Visual of record: docs/design/landing-earn-mock.html "TRENDING: photo tiles".
 *
 * Ranked by the live trend resolver (GET /api/travelpulse/cities — already sorted, the 8
 * operating markets). Five tiles show at a time via `CityCard density="compact"` (the
 * shared card — Lane-3's filed compact gap, landed additively); the SHARED useRotation
 * hook advances the window every 8s (pause on hover/focus, frozen under
 * prefers-reduced-motion) so the hottest-first ordering rotates through all eight. The
 * mono ticker above reads the SAME rows — trend rendered only when above the confidence
 * floor (§13: a 0 score shows no number, never a fake one).
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CityCard } from "@/components/travelpulse/CityCard";
import { useRotation } from "@/hooks/use-rotation";
import { getCityDiscoverHref } from "@/lib/city-discover-route";
import { SectionHeader, OpenSection } from "./section-header";

const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface PulseCity {
  cityName: string;
  country: string;
  trendingScore?: number | null;
  crowdLevel?: string | null;
  imageUrl?: string | null;
}

const VISIBLE = 5;

export function CitiesRail() {
  const [, navigate] = useLocation();
  const [hovered, setHovered] = useState(false);
  const { data } = useQuery<{ cities: PulseCity[] }>({
    queryKey: ["/api/travelpulse/cities"],
  });
  const cities = data?.cities ?? [];
  const offset = useRotation(cities.length, { paused: hovered });

  if (cities.length === 0) return null;
  const windowed = Array.from(
    { length: Math.min(VISIBLE, cities.length) },
    (_, i) => cities[(offset + i) % cities.length],
  );

  return (
    <OpenSection testId="section-cities-rail">
      <SectionHeader
        eyebrow="TravelPulse · updated daily"
        title="Cities with momentum this month"
        link={{ label: "All destinations →", href: "/destinations", testId: "link-all-destinations" }}
      />
      <div
        className="mb-3 flex items-center gap-7 overflow-hidden whitespace-nowrap text-[10.5px] font-medium uppercase tracking-[0.14em]"
        style={{ fontFamily: EARN_MONO, color: "var(--earn-teal-ink)" }}
        data-testid="cities-ticker"
      >
        <i
          className="h-[7px] w-[7px] shrink-0 rounded-full"
          style={{ background: "var(--earn-green, #5DCAA5)", boxShadow: "0 0 0 4px rgba(93,202,165,.18)" }}
        />
        {cities.map((c) => (
          <span key={c.cityName}>
            {[
              c.cityName,
              c.trendingScore && c.trendingScore > 0 ? `trend ${c.trendingScore}` : null,
              c.crowdLevel ?? null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ))}
      </div>
      <div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        data-testid="cities-rail"
      >
        {windowed.map((c, i) => (
          <div key={c.cityName} style={i === VISIBLE - 1 ? { opacity: 0.55 } : undefined}>
            <CityCard
              variant="pulse"
              density="compact"
              cityName={c.cityName}
              country={c.country}
              imageUrl={c.imageUrl ?? null}
              score={c.trendingScore ?? null}
              crowdLevel={c.crowdLevel ?? null}
              primaryLabel="View"
              onCardClick={() => navigate(getCityDiscoverHref(c.cityName))}
              testId={`city-compact-${c.cityName.toLowerCase()}`}
            />
          </div>
        ))}
      </div>
    </OpenSection>
  );
}
