/**
 * "CHANGE THIS PLAN'S CITY" — the plan modal's answer when a selected plan meets a new city and the
 * traveler says it is the SAME plan (ledger `2026-09-25-rc6-bound-plan-city`, audit RC-6).
 *
 * It writes through the rails that already own a plan's city, never a new one (§18 rule 1):
 *   • a plan WITH stop rows keeps `trips.destination` as the position-0 MIRROR of its list (Locked
 *     Decision 34), so the city is changed by renaming stop 0 through the ONE client stops writer,
 *     `savePlanStops` — the server then re-mirrors the destination and re-derives market and zone.
 *     The list is READ first, because that route is a replace-list (the caller-reads rule stated in
 *     `plan-stops-writer.ts`). Stop 0's old coordinates are dropped: they placed the OLD city, and a
 *     pin is only ever a traveler's own placement, never carried to a different place (§13).
 *   • a plan with NO stop rows has only `trips.destination`, changed on the owner-gated
 *     `PATCH /api/trips/:id` (its `.pick()` allowlist admits `destination`; `storage.updateTrip`
 *     re-derives `market_slug` and `timezone` from it, Locked Decision 30).
 *
 * Returns ok/failed; it never throws into the save that called it, and a failure is the caller's to
 * show — the modal stays open and says the city was not changed rather than closing as if it were.
 */
import { apiRequest, queryClient } from "@/lib/queryClient";
import { renameStopAt, seedStops } from "@/lib/plan-stops";
import { savePlanStops } from "@/lib/plan-stops-writer";

export type ChangePlanCityResult = { ok: true } | { ok: false; message?: string };

export async function changeBoundPlanCity(tripId: string, city: string): Promise<ChangePlanCityResult> {
  const next = city.trim();
  if (!tripId || next === "") return { ok: false };
  try {
    const res = await apiRequest("GET", `/api/trips/${tripId}`);
    const trip = (await res.json()) as {
      destination?: string | null;
      destinations?: Parameters<typeof seedStops>[1];
    };
    const rows = Array.isArray(trip?.destinations) ? trip.destinations : [];
    if (rows.length > 0) {
      const renamed = renameStopAt(seedStops(trip.destination, rows), 0, next);
      renamed[0] = { name: renamed[0].name };
      const written = await savePlanStops(tripId, renamed);
      if (!written.ok) {
        return { ok: false, message: written.reason === "request_failed" ? written.message : undefined };
      }
    } else {
      await apiRequest("PATCH", `/api/trips/${tripId}`, { destination: next });
    }
    void queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId] });
    void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, message: err?.message };
  }
}
