/**
 * The PURE core of the flight lookup (ledger `2026-10-03-surface-step2-tools-tray`) — no database,
 * no network: every effect is an injected dependency, so the rules (flag, cache, cap, cost row)
 * are proven with a fake adapter. The wiring is `flight-lookup.service.ts`.
 */
import { normalizeFlightNumber, isIsoDate, type FlightInfo } from "@shared/getting-there";
import type { FlightLookupAdapter } from "./adapter";

export type FlightLookupResult =
  | { kind: "off" }
  | { kind: "invalid"; reason: "flight_number" | "date" }
  | { kind: "found"; flight: FlightInfo; cached: boolean }
  | { kind: "not_found"; cached: boolean }
  | { kind: "cap_reached"; cap: number }
  | { kind: "error" };

export interface FlightLookupDeps {
  adapter: FlightLookupAdapter;
  enabled: () => boolean;
  cap: () => number;
  costCents: () => number;
  cacheGet: (key: string) => Promise<{ flight: FlightInfo | null } | null>;
  cacheSet: (key: string, value: { flight: FlightInfo | null }) => Promise<void>;
  /** Billed lookups recorded today (UTC) for this provider. */
  countToday: (provider: string) => Promise<number>;
  logUsage: (row: { provider: string; userId: string | null; costCents: number; success: boolean; found: boolean; error?: string; ms: number }) => Promise<void>;
}

export async function lookupFlight(
  input: { flightNumber: string; date: string; userId: string | null },
  deps: FlightLookupDeps,
): Promise<FlightLookupResult> {
  if (!deps.enabled()) return { kind: "off" };
  const flightNo = normalizeFlightNumber(input.flightNumber);
  if (!flightNo) return { kind: "invalid", reason: "flight_number" };
  if (!isIsoDate(input.date)) return { kind: "invalid", reason: "date" };
  const key = `${flightNo}:${input.date}`;

  const hit = await deps.cacheGet(key);
  if (hit) return hit.flight ? { kind: "found", flight: hit.flight, cached: true } : { kind: "not_found", cached: true };

  const cap = deps.cap();
  if ((await deps.countToday(deps.adapter.provider)) >= cap) return { kind: "cap_reached", cap };

  const started = Date.now();
  try {
    const flight = await deps.adapter.lookup(flightNo, input.date);
    await deps.logUsage({ provider: deps.adapter.provider, userId: input.userId, costCents: deps.costCents(), success: true, found: !!flight, ms: Date.now() - started });
    await deps.cacheSet(key, { flight });
    return flight ? { kind: "found", flight, cached: false } : { kind: "not_found", cached: false };
  } catch (err: any) {
    await deps.logUsage({ provider: deps.adapter.provider, userId: input.userId, costCents: deps.costCents(), success: false, found: false, error: String(err?.message ?? err).slice(0, 300), ms: Date.now() - started });
    console.warn(`[flight-lookup] ${flightNo} ${input.date} failed: ${err?.message ?? err}`);
    return { kind: "error" };
  }
}
