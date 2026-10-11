/**
 * TC-4 — the Trip Card's live tier for one leg (LD 69; ledger `2026-10-11-tc4-live-directions`). Pure.
 *
 * LD 69: planning surfaces show close-enough times, stored and tier-labelled; the Trip Card's exact time is a
 * timetable source or a deep link to one, never a stored estimate presented as exact. So each leg the card draws
 * may carry:
 *   · `liveDirections` — the server-built deep link (Google Maps directions today), present when BOTH ends of the
 *     leg are located; `transit: true` when the link asks for train and bus (the routing API has no transit there).
 *   · `lastService` — the earliest last departure, that day, from an official station within walking range of the
 *     stop the leg LEAVES (decision-maker ruling 1: a last train matters when you are leaving somewhere at night).
 *     Absent when no station qualifies, the day has no confirmed date, or no fact is stored (§13 — never guessed).
 */
import { haversineMeters } from "./geo";
import { lastServiceMinutes, parseLastService } from "./feasibility-facts";
import { ROUTED_WALK_MAX_METERS } from "./routing-engine";

export interface LegLiveDirections {
  provider: "google_maps";
  url: string;
  transit: boolean;
}

export interface LegLastService {
  operator: string;
  line: string | null;
  station: string | null;
  /** As the operator states it, "HH:MM" (a departure after midnight stays "00:20"). */
  lastDeparture: string;
}

/**
 * The last service a traveler leaving `from` on `dateIso` can still catch nearby: among stations within walking
 * range (`ROUTED_WALK_MAX_METERS`, the optimizer lead's own radius), the one whose last departure that day is
 * EARLIEST. Null when none applies.
 */
export function leavingLastService(
  services: ReadonlyArray<{ lat: number; lng: number; value: unknown }>,
  from: { lat: number; lng: number },
  dateIso: string,
): LegLastService | null {
  let best: { m: number; s: LegLastService } | null = null;
  for (const row of services) {
    if (haversineMeters(from.lat, from.lng, row.lat, row.lng) > ROUTED_WALK_MAX_METERS) continue;
    const v = parseLastService(row.value);
    if (!v) continue;
    const m = lastServiceMinutes(v, dateIso);
    if (m === null) continue;
    if (!best || m < best.m) best = { m, s: { operator: v.operator, line: v.line, station: v.station, lastDeparture: v.lastDeparture } };
  }
  return best?.s ?? null;
}
