/**
 * R3 U5 - the no-plan landing (board V24 panel 4, V22 panel 5 for the phone).
 *
 * Signed-in travellers with no plans only: the bar without a plan (its plan slot reads "Start a plan" and opens the
 * empty switcher), then "Where are you going?" with the admin market list. Guests and everyone else keep the public home.
 *
 * Strings are DRAFT for Leon. Cities come from the admin market list (falling back to LAUNCH_MARKETS), never a typed list.
 */
import { useMemo, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BOARD_INK, BOARD_LINE, BOARD_TEXT, BOARD_FILL } from "@/components/r3/tokens";
import { R3TopBar } from "@/components/r3/TopBar";
import { LAUNCH_MARKETS } from "@shared/launch-markets";
import { marketStatus, type MarketStatusSettings } from "@shared/ticker";
import { launchCityName } from "@shared/ticker";
import { useMarketStatusSettings } from "@/lib/signup-mode";
import { PLAN_START_HREF } from "@/lib/plan-entry";
import { useAuth } from "@/hooks/use-auth";
import { useR3SurfaceOn } from "@/lib/r3-surface";

/** "Opening March 2027" - the admin value verbatim when it is text, else a plain "Month YYYY" for an ISO date. */
export function openingLine(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v);
  if (!m) return v; // free text: render exactly what the admin wrote
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function R3NoPlanPage() {
  const { settings } = useMarketStatusSettings();
  const cities = useMemo(() => {
    const list = new Set<string>();
    for (const slug of [...settings.live, ...settings.beta, ...Object.keys(settings.dates)]) list.add(slug);
    if (list.size === 0) for (const c of LAUNCH_MARKETS) list.add(c.toLowerCase());
    return Array.from(list).sort();
  }, [settings]);

  const openCities = cities.filter((c) => marketStatus(c, settings) === "live");
  const closed = cities.filter((c) => marketStatus(c, settings) !== "live");

  const openNames = openCities.map((c) => launchCityName(c)).filter(Boolean);
  const openLine = openNames.length ? `Now open in ${openNames.join(", ")}.` : "";

  return (
    <div className="min-h-screen" data-testid="r3-no-plan-page">
      <R3TopBar tripId={null} plan={null} plans={[]} />
      <main className="mx-auto max-w-[760px] px-4 py-8" data-testid="r3-no-plan">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: BOARD_TEXT }} data-testid="r3-no-plan-eyebrow">
          Start a plan
        </p>
        <h1 className="mt-2 text-[28px] font-bold" style={{ color: BOARD_INK }} data-testid="r3-no-plan-title">
          Where are you going?
        </h1>

        <div className="mt-4 flex flex-wrap gap-2" data-testid="r3-no-plan-cities">
          {cities.map((slug) => (
            <button
              key={slug}
              type="button"
              className="min-h-11 rounded-full border px-4 text-[13px] font-medium"
              style={{ borderColor: BOARD_LINE, color: BOARD_INK }}
              data-testid="r3-no-plan-city"
              data-city={slug}
            >
              {launchCityName(slug)}
            </button>
          ))}
        </div>

        {openLine ? (
          <p className="mt-3 text-[13px] text-muted-foreground" data-testid="r3-no-plan-open-line">{openLine}</p>
        ) : null}

        <Link
          href={PLAN_START_HREF}
          className="mt-5 inline-block rounded-lg px-5 py-3 text-[14px] font-semibold text-white"
          style={{ backgroundColor: BOARD_INK }}
          data-testid="r3-no-plan-start"
        >
          Start a plan
        </Link>

        {closed.length ? (
          <div className="mt-6 space-y-3" data-testid="r3-no-plan-waitlist">
            {closed.map((slug) => {
              const opening = openingLine(settings.dates[slug]);
              return (
                <div key={slug} className="rounded-xl border p-4" style={{ borderColor: BOARD_LINE }}>
                  <p className="text-[14px] font-semibold" style={{ color: BOARD_INK }}>{launchCityName(slug)}</p>
                  {opening ? (
                    <p className="mt-1 text-[12px] text-muted-foreground" data-testid="r3-no-plan-opening">{`Opening ${opening}`}</p>
                  ) : null}
                  <button
                    type="button"
                    className="mt-2 min-h-11 rounded-lg px-4 text-[13px] font-medium"
                    style={{ backgroundColor: BOARD_FILL, color: BOARD_TEXT }}
                    data-testid="r3-no-plan-waitlist-cta"
                    data-city={slug}
                  >
                    {`Join the ${launchCityName(slug)} waitlist`}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </main>
    </div>
  );
}


/**
 * U5's gate: only a SIGNED-IN traveller with NO plans, on "/?start=1" with the R3 switch on, sees the landing. Everyone
 * else - guests, travellers with plans, every other route - gets exactly the page they had.
 */
export function R3NoPlanSwitch({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const search = useSearch();
  const r3 = useR3SurfaceOn(search);
  const { user, isLoading: authLoading } = useAuth();
  const startRequested = new URLSearchParams(search).get("start") === "1";
  const onDoor = startRequested && path === "/";
  // R3 U5: GET /api/trips/mine - the caller's own plans (server/routes/trips.routes.ts). Read only when it can matter.
  const { data: plans, isLoading: plansLoading, isError: plansError } = useQuery<Array<{ id: string; title?: string | null; startDate?: string | null; endDate?: string | null }>>({
    queryKey: ["/api/trips/mine"],
    enabled: !!user && r3 && onDoor,
  });

  const resolved = !authLoading && !plansLoading && plans !== undefined;
  const decision = {
    r3,
    start: startRequested,
    user: !!user,
    authLoading,
    plansLoading,
    plansShape: Array.isArray(plans) ? "array" : plans === undefined ? "undefined" : typeof plans,
    plansLen: Array.isArray(plans) ? plans.length : -1,
    path,
    lazyResolved: true,
    resolved,
    error: plansError ? "plans-error" : "none",
  };

  // Only decide once BOTH auth and the plans read have resolved: never fall through to the home early.
  if (!r3 || !onDoor) return <>{children}</>;
  if (!resolved) {
    return (
      <>
        <span hidden data-testid="r3-no-plan-gate" data-decision={JSON.stringify(decision)} />
        <div className="min-h-[40vh]" data-testid="r3-no-plan-skeleton" />
      </>
    );
  }
  const list = Array.isArray(plans) ? plans : [];
  return (
    <>
      <span hidden data-testid="r3-no-plan-gate" data-decision={JSON.stringify(decision)} />
      {list.length === 0 ? <R3NoPlanPage /> : children}
    </>
  );
}
