/**
 * R3 U5 - the no-plan landing (board V24 panel 4; V22's phone bar for the 390 shape).
 *
 * Signed-in travellers with NO plans, on `/?start=1` WITHOUT `&step=` (the pop-up's own URL carries `step` while it is
 * open), and only with the R3 switch on. Guests and travellers with plans keep today's home.
 *
 * Cities come from the admin market list (falling back to LAUNCH_MARKETS); a closed market appears only when that answer
 * names it. Strings are DRAFT for Leon.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BOARD_INK, BOARD_LINE, BOARD_TEXT, BOARD_FILL } from "@/components/r3/tokens";
import { R3TopBar } from "@/components/r3/TopBar";
import { LAUNCH_MARKETS } from "@shared/launch-markets";
import { launchCityName, marketStatus } from "@shared/ticker";
import { useAuth } from "@/hooks/use-auth";
import { useMarketStatusSettings } from "@/lib/signup-mode";
import { readR3SurfaceFlag } from "@/lib/r3-surface";
import { planEntryHref } from "@/lib/plan-entry";
import { waitlistMarketPath } from "@/lib/waitlist-markets";

/** "Opening March 2027": the admin value verbatim when it is text, else a plain "Month YYYY" for an ISO date. */
export function openingLine(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v);
  if (!m) return v;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function R3NoPlanPage() {
  const { settings } = useMarketStatusSettings();
  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const slug of [...settings.live, ...settings.beta, ...Object.keys(settings.dates)]) set.add(slug);
    if (set.size === 0) for (const c of LAUNCH_MARKETS) set.add(String(c).toLowerCase());
    return Array.from(set).sort();
  }, [settings]);

  const openCities = cities.filter((c) => marketStatus(c, settings) === "live");
  const closed = cities.filter((c) => marketStatus(c, settings) !== "live");
  const openNames = openCities.map((c) => launchCityName(c)).filter(Boolean);
  const openLine = openNames.length ? `Now open in ${openNames.join(", ")}.` : "";
  const firstStep = planEntryHref("around");

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
            <Link
              key={slug}
              href={firstStep}
              className="flex min-h-11 items-center rounded-full border px-4 text-[13px] font-medium"
              style={{ borderColor: BOARD_LINE, color: BOARD_INK }}
              data-testid="r3-no-plan-city"
              data-city={slug}
            >
              {launchCityName(slug)}
            </Link>
          ))}
        </div>

        {openLine ? (
          <p className="mt-3 text-[13px] text-muted-foreground" data-testid="r3-no-plan-open-line">{openLine}</p>
        ) : null}

        <Link
          href={firstStep}
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
                <div key={slug} className="rounded-xl border p-4" style={{ borderColor: BOARD_LINE }} data-testid="r3-no-plan-waitlist-row" data-city={slug}>
                  <p className="text-[14px] font-semibold" style={{ color: BOARD_INK }}>{launchCityName(slug)}</p>
                  {opening ? (
                    <p className="mt-1 text-[12px] text-muted-foreground" data-testid="r3-no-plan-opening">{`Opening ${opening}`}</p>
                  ) : null}
                  <Link
                    href={waitlistMarketPath(slug)}
                    className="mt-2 inline-flex min-h-11 items-center rounded-lg px-4 text-[13px] font-medium"
                    style={{ backgroundColor: BOARD_FILL, color: BOARD_TEXT }}
                    data-testid="r3-no-plan-waitlist-cta"
                    data-city={slug}
                  >
                    {`Join the ${launchCityName(slug)} waitlist`}
                  </Link>
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
 * U5's gate. Decides only once auth AND the plans read have resolved; a read ERROR falls through to the home (never a
 * skeleton forever). With `&step=` present the pop-up is open, so this falls through too.
 */
export function R3NoPlanSwitch({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const search = useSearch();
  const { user, isLoading: authLoading } = useAuth();
  const params = new URLSearchParams(search);
  const asked = params.get("surface") === "r3";
  const startRequested = params.get("start") === "1";
  // `step` is read ONCE, at mount: the pop-up adds it after opening, and that must not change this decision.
  const stepAtMount = useRef(params.has("step")).current;
  const onDoor = startRequested && !stepAtMount && path === "/";

  // The R3 flag: one read per page load, and the gate does not decide until it has answered.
  const [flag, setFlag] = useState<boolean | null>(null);
  const flagAt = useRef<number | null>(null);
  useEffect(() => {
    if (!asked) {
      setFlag(false);
      return;
    }
    let alive = true;
    readR3SurfaceFlag().then((on) => {
      if (!alive) return;
      flagAt.current = Date.now();
      setFlag(on);
    });
    return () => {
      alive = false;
    };
  }, [asked]);
  const flagSettled = flag !== null;
  const r3 = flag === true && asked;

  const { data: plans, isLoading: plansLoading, isError: plansError } = useQuery<Array<{ id: string }>>({
    queryKey: ["/api/trips"],
    enabled: asked && r3 && onDoor && !authLoading && !!user,
  });

  const authResolved = !authLoading;
  const plansResolved = plans !== undefined || plansError || !user;
  const decision = {
    r3,
    flagResolved: flagSettled,
    flagAt: flagAt.current,
    start: startRequested,
    stepAtMount,
    user: !!user,
    authLoading,
    plansLoading,
    plansShape: Array.isArray(plans) ? "array" : plans === undefined ? "undefined" : typeof plans,
    plansLen: Array.isArray(plans) ? plans.length : -1,
    path,
    resolved: flagSettled && authResolved && plansResolved,
    error: plansError ? "plans-error" : "none",
  };

  // Not this door, not this surface request: today's page, untouched.
  if (!asked || !onDoor) return <>{children}</>;

  // ON THE DOOR: nothing but the skeleton until flag, auth and plans have all resolved. Children never mount early,
  // so the pop-up cannot push `&step=` into a cold load.
  if (!flagSettled || !authResolved || !plansResolved) {
    return (
      <>
        <span hidden data-testid="r3-no-plan-gate" data-decision={JSON.stringify(decision)} />
        <div className="min-h-[40vh]" data-testid="r3-no-plan-skeleton" />
      </>
    );
  }
  const gate = <span hidden data-testid="r3-no-plan-gate" data-decision={JSON.stringify(decision)} />;
  if (!r3) return <>{gate}{children}</>;
  if (plansError) return <>{gate}{children}</>;
  const list = Array.isArray(plans) ? plans : [];
  return (
    <>
      {gate}
      {list.length === 0 ? <R3NoPlanPage /> : children}
    </>
  );
}
