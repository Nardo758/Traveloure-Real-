/**
 * The flight schedule ADAPTER (surface spec §5, R-j; ledger `2026-10-03-surface-step2-tools-tray`).
 * One interface, one implementation (AeroDataBox), and the service takes it injected — tests pass a
 * fake, so no test calls the network.
 */
import type { FlightInfo } from "@shared/getting-there";
import { flightLookupApiKey, flightLookupHost } from "../../config/flight-lookup.config";

export interface FlightLookupAdapter {
  /** The provider's name, as recorded in `api_usage_logs.provider`. */
  readonly provider: string;
  /** `flightNo` normalized ("JL61"), `date` "YYYY-MM-DD" local. Null = no such flight that day. */
  lookup(flightNo: string, date: string): Promise<FlightInfo | null>;
}

/** "2026-11-11 10:05+09:00" / "2026-11-11T10:05" → "2026-11-11T10:05". */
function localStamp(v: unknown): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(String(v ?? ""));
  return m ? `${m[1]}T${m[2]}` : null;
}

function movementLocal(mv: any): string | null {
  return localStamp(mv?.scheduledTime?.local ?? mv?.scheduledTimeLocal ?? mv?.revisedTime?.local ?? null);
}

function airportCode(mv: any): string | null {
  const a = mv?.airport;
  return (a?.iata || a?.icao || a?.name || null) as string | null;
}

/** PURE: one AeroDataBox `FlightContract[]` → our `FlightInfo`, or null when it names no usable flight. */
export function parseAeroDataBox(body: unknown): FlightInfo | null {
  const list = Array.isArray(body) ? body : [];
  for (const f of list as any[]) {
    const depAt = movementLocal(f?.departure);
    const arrAt = movementLocal(f?.arrival);
    const depAirport = airportCode(f?.departure);
    const arrAirport = airportCode(f?.arrival);
    if (!depAt || !arrAt || !depAirport || !arrAirport) continue;
    return {
      carrier: (f?.airline?.name as string) ?? null,
      number: String(f?.number ?? "").trim() || "",
      depAirport,
      arrAirport,
      depAt,
      arrAt,
      terminal: (f?.arrival?.terminal ?? f?.departure?.terminal ?? null) as string | null,
    };
  }
  return null;
}

export const aeroDataBoxAdapter: FlightLookupAdapter = {
  provider: "aerodatabox",
  async lookup(flightNo, date) {
    const key = flightLookupApiKey();
    if (!key) throw new Error("FLIGHT_LOOKUP_API_KEY is not set");
    const host = flightLookupHost();
    const url = `https://${host}/flights/number/${encodeURIComponent(flightNo)}/${encodeURIComponent(date)}?withAircraftImage=false&withLocation=false`;
    const resp = await fetch(url, { headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": host } });
    if (resp.status === 204 || resp.status === 404) return null;
    if (!resp.ok) throw new Error(`flight lookup failed: HTTP ${resp.status}`);
    const parsed = parseAeroDataBox(await resp.json());
    return parsed ? { ...parsed, number: parsed.number || flightNo } : null;
  },
};
