import { useAuth } from "@/hooks/use-auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Layout } from "@/components/layout";
import { TripStrip } from "@/components/trip/trip-strip";
import { useActivePlan } from "@/hooks/use-active-plan";
import { headerDatesTarget, headerPlanState } from "@/lib/header-plan";

/**
 * QA round 4 R4-4 (a): the Trip Strip on the signed-in browse surfaces. The strip ruling (ledger
 * `2026-11-11-cutlist1-strip-one-plan-surface`) draws it for a signed-in member, but the browse surfaces render a
 * member inside the console shell, which had no strip. Same inputs, same ONE rule as the public layout's signed-in
 * arm — `useActivePlan` and `headerPlanState` / `headerDatesTarget` (`@/lib/header-plan`); no guest read, because a
 * signed-in member has no guest plan.
 */
function SignedInTripStrip() {
  const { trips, bound, loading } = useActivePlan();
  const planState = headerPlanState({
    isSignedIn: true,
    guestStatus: "idle",
    guestPlan: null,
    trips: loading ? undefined : (trips ?? []),
    bound,
  });
  const datesTarget = headerDatesTarget(planState, { guestPlan: null, trips: trips ?? null, bound });
  return <TripStrip planState={planState} datesTarget={datesTarget} signedIn />;
}

/**
 * BrowseShell — L1 of the Console & AI Concierge brief (CLAUDE.md Locked
 * Decision 45 (7), ledger `2026-09-07-console-one-grammar`): the browse
 * surfaces (Discover, Experts, checkout) render INSIDE the console shell for
 * a signed-in traveler, so the sidebar no longer vanishes on three of the ten
 * tabs. A guest keeps the public chrome — `/cart` is the ruled guest fallback
 * (LD 45 (4)) and public browse is a public surface.
 *
 * ONE component makes the choice (§18 rule 1): the three routes never decide
 * their own chrome. While the session is resolving, the public chrome renders
 * — a signed-in traveler sees the sidebar appear one paint later, and a guest
 * never sees a console frame flash and vanish.
 */
export function BrowseShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (!isLoading && user) {
    return <DashboardLayout subheader={<SignedInTripStrip />}>{children}</DashboardLayout>;
  }
  return <Layout>{children}</Layout>;
}
