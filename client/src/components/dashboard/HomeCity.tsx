import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

/**
 * HomeCity — "<City> · your city" (ledger `2026-09-07-home-time-axis`; Home anatomy, artboard
 * `Home`). Renders ONLY when `users.home_city` is set (read through the EXISTING
 * `GET /api/me/home-city`, the Profile page's own reader — no second home-city reader).
 *
 * Trends come from the REAL trending-cities endpoint, under the SAME query key TravelPulsePanel
 * used (`["/api/travelpulse/cities", { limit: 10 }]`) — one reader, shared cache; this component
 * only filters that response to the home city. §13: when the endpoint carries no row for the city
 * the trends block is OMITTED, never a "no trends" claim and never another city's numbers. The
 * occasions are the ones the member registered (`GET /api/occasions`); with none, that block
 * offers only the door to add one.
 *
 * Grammar (LD 45 (7)): the dark TravelPulse card becomes a white card with a teal eyebrow.
 */
interface HomeCityResponse {
  homeCity: string | null;
  markets: string[];
}

interface TravelPulseCityRow {
  cityName: string;
  currentHighlight?: string | null;
  dealAlert?: string | null;
  priceChange?: string | number | null;
  priceTrend?: string | null;
  crowdLevel?: string | null;
  trendingScore?: number | null;
}

interface TravelPulseCitiesResponse {
  cities: TravelPulseCityRow[];
}

interface OccasionRow {
  id: string;
  label: string | null;
  templateKey: string;
  occasionDate: string;
  recurrence: string;
  active: boolean;
}

const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

function cityMatches(cityName: string | undefined, home: string): boolean {
  const a = (cityName ?? "").split(",")[0]?.trim().toLowerCase();
  const b = home.split(",")[0]?.trim().toLowerCase();
  return !!a && !!b && a === b;
}

function fmtDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function HomeCity({ enabled }: { enabled: boolean }) {
  const { data: home } = useQuery<HomeCityResponse>({
    queryKey: ["/api/me/home-city"],
    queryFn: async () => {
      const res = await fetch("/api/me/home-city", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch home city");
      return res.json();
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
  const homeCity = home?.homeCity?.trim() || null;

  const { data: pulse } = useQuery<TravelPulseCitiesResponse>({
    queryKey: ["/api/travelpulse/cities", { limit: 10 }],
    queryFn: async () => {
      const res = await fetch("/api/travelpulse/cities?limit=10", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch trending cities");
      return res.json();
    },
    enabled: enabled && !!homeCity,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const { data: occasions } = useQuery<OccasionRow[]>({
    queryKey: ["/api/occasions"],
    queryFn: async () => {
      const res = await fetch("/api/occasions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch occasions");
      return res.json();
    },
    enabled: enabled && !!homeCity,
    staleTime: 60_000,
  });

  if (!homeCity) return null; // no home city set ⇒ this block does not exist (§13)

  const cityRow = (pulse?.cities ?? []).find((c) => cityMatches(c.cityName, homeCity));
  const trendLines: Array<{ label: string; value: string }> = [];
  if (cityRow) {
    const text = cityRow.currentHighlight || cityRow.dealAlert;
    if (text) trendLines.push({ label: "Now", value: text });
    const pc = cityRow.priceChange != null ? Number(cityRow.priceChange) : NaN;
    if (Number.isFinite(pc)) trendLines.push({ label: "Prices", value: `${pc > 0 ? "+" : ""}${pc}%` });
    else if (cityRow.priceTrend === "up" || cityRow.priceTrend === "down") trendLines.push({ label: "Prices", value: cityRow.priceTrend });
    if (cityRow.crowdLevel) trendLines.push({ label: "Crowds", value: cityRow.crowdLevel });
  }
  const registered = (occasions ?? []).filter((o) => o.active !== false);

  return (
    <section
      className="rounded-[14px] px-4 py-3.5"
      style={{ background: "var(--earn-card)", border: "1px solid var(--earn-border)" }}
      data-testid="home-city-section"
    >
      <div className="text-[10.5px] uppercase tracking-[0.12em] mb-1" style={{ fontFamily: MONO, color: "var(--earn-teal-ink)" }}>
        your city
      </div>
      <div className="text-[15px] font-medium mb-2.5" style={{ color: "var(--earn-ink)" }}>
        {homeCity.split(",")[0]?.trim() || homeCity}
      </div>

      {trendLines.length > 0 && (
        <ul className="space-y-1.5 mb-3" data-testid="home-city-trends">
          {trendLines.map((t) => (
            <li key={t.label} className="flex items-baseline justify-between gap-3 text-[12px]">
              <span style={{ color: "var(--earn-muted)" }}>{t.label}</span>
              <span className="text-right" style={{ color: "var(--earn-ink)" }}>{t.value}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="pt-2.5" style={{ borderTop: "1px solid var(--earn-border)" }}>
        <div className="text-[10.5px] uppercase tracking-[0.12em] mb-1.5" style={{ fontFamily: MONO, color: "var(--earn-muted)" }}>
          your occasions
        </div>
        {registered.length > 0 ? (
          <ul className="space-y-1 mb-2" data-testid="home-city-occasions">
            {registered.slice(0, 4).map((o) => (
              <li key={o.id} className="text-[12px]" style={{ color: "var(--earn-ink)" }}>
                {(o.label ?? "").trim() || o.templateKey.replace(/[_-]+/g, " ")} · {fmtDay(o.occasionDate)}
                {o.recurrence && o.recurrence !== "none" ? ` · ${o.recurrence}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        <Link href="/plus/occasions" className="text-[12px] font-medium hover:underline" style={{ color: "var(--earn-teal-ink)" }}>
          {registered.length > 0 ? "Manage occasions →" : "Add one →"}
        </Link>
      </div>
      <div className="text-[10px] mt-2.5" style={{ fontFamily: MONO, color: "var(--earn-faint)" }}>
        renders because a home city is set · trends from the live endpoint
      </div>
    </section>
  );
}
