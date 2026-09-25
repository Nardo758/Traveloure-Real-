import { useAuth } from "@/hooks/use-auth";
import { useTripContextSync } from "@/lib/trip-context";

/**
 * THE ONE PEN BINDER — RC-3 (ledger `2026-09-25-rc345-active-plan`; audit J2 R4 step 5, J5 R1
 * step 8). `useTripContextSync` binds the planning pen to whoever is signed in. It used to be
 * called from the public `Layout` alone, and `BrowseShell` renders `DashboardLayout` for a
 * signed-in traveler, so a cold load of any console-shelled page (`/services`, `/plans/:id`,
 * `/my-trips`, …) never bound: the pen READER stayed on the empty guest key while the account's own
 * key held the plan, and every add went to the cart. Mounted ONCE in `App.tsx`, above the router
 * and above every shell, so the bind does not depend on which chrome a route happens to draw
 * (§18 rule 1 — a binder per layout is two binders). Renders nothing.
 *
 * The three-state principal is unchanged (lane L18): `undefined` while auth is unresolved — bind
 * NOTHING, an unresolved answer is not a guest (§13) — `null` for a guest, the id when signed in.
 */
export function PenBinder() {
  const { user, isLoading } = useAuth();
  useTripContextSync(isLoading ? undefined : ((user as { id?: string } | null | undefined)?.id ?? null));
  return null;
}
