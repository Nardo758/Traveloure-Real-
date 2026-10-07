/**
 * THE MAPS BILLING GATE — the pure half (R299, ledger `2026-10-04-maps-billing-audit`).
 *
 * One rule for every Google Maps Platform caller in `@shared/maps-billing`: a call happens only when
 * the caller's own switch is on, the key is set and today's count is under the caller's daily cap;
 * every call that happens is recorded, success or failure, so the cap and the spend read ONE source.
 * Step 9a ruling 7 (ledger `2026-10-07-step9a-routing-engine`): a FAILED call is recorded at cost 0 but
 * still counts toward the daily cap (the cap bounds retries); a refused call is not a call and records
 * nothing.
 * DB-free: the counter and the recorder arrive injected, so the rule is proven with no database.
 */
import { MAPS_CALLERS, type MapsCallerKey } from "@shared/maps-billing";

/**
 * Step 9a ruling 8 (ledger `2026-10-07-step9a-routing-engine`): the daily cap answers `paused` — its
 * own outcome, so a caller can tell "travel times paused today" from "no route". It was `cap_reached`.
 */
export type MapsGateRefusal = "disabled" | "no_api_key" | "paused";

export interface MapsGateDeps {
  enabled: (key: MapsCallerKey) => boolean;
  apiKey: () => string | null;
  dailyCap: (key: MapsCallerKey) => number;
  /** Billable calls of this caller since the start of the UTC day. null = unreadable. */
  countToday: (key: MapsCallerKey) => Promise<number | null>;
  record: (row: MapsCallRecord) => Promise<void>;
}

export interface MapsCallRecord {
  key: MapsCallerKey;
  sku: string;
  success: boolean;
  ms: number;
  /** Billable units in this call (1 for a request; the element count for a matrix batch). */
  units: number;
  error?: string;
  userId?: string | null;
}

/**
 * May this caller make a call now? An unreadable counter refuses (the cap's safe failure mode —
 * the same posture fresh-fetch takes: unreadable spend ⇒ spent).
 */
export async function mapsGate(
  key: MapsCallerKey,
  deps: MapsGateDeps,
): Promise<{ ok: true; apiKey: string } | { ok: false; reason: MapsGateRefusal }> {
  if (!deps.enabled(key)) return { ok: false, reason: "disabled" };
  const apiKey = deps.apiKey();
  if (!apiKey) return { ok: false, reason: "no_api_key" };
  const cap = deps.dailyCap(key);
  if (cap <= 0) return { ok: false, reason: "paused" };
  const used = await deps.countToday(key);
  if (used === null || used >= cap) return { ok: false, reason: "paused" };
  return { ok: true, apiKey };
}

/**
 * Run one gated call. `call` receives the key and answers `{ value, units }`; a thrown call is
 * recorded as a failure and rethrown. A refused call makes no request, records nothing and answers
 * `{ refused }` — the caller treats that exactly like "no answer" (never a guessed one, §13).
 */
export async function withMapsGate<T>(
  key: MapsCallerKey,
  deps: MapsGateDeps,
  call: (apiKey: string) => Promise<{ value: T; units?: number; success?: boolean }>,
  opts: { userId?: string | null; sku?: string } = {},
): Promise<{ value: T } | { refused: MapsGateRefusal }> {
  const gate = await mapsGate(key, deps);
  if (!gate.ok) return { refused: gate.reason };
  const sku = opts.sku ?? MAPS_CALLERS[key].sku;
  const started = Date.now();
  try {
    const out = await call(gate.apiKey);
    await deps.record({ key, sku, success: out.success ?? true, ms: Date.now() - started, units: out.units ?? 1, userId: opts.userId ?? null });
    return { value: out.value };
  } catch (err: any) {
    await deps.record({ key, sku, success: false, ms: Date.now() - started, units: 1, error: String(err?.message ?? err).slice(0, 300), userId: opts.userId ?? null });
    throw err;
  }
}
