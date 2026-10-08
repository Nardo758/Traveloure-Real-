/**
 * The operator switches `/api/health` reports, as the client reads them (ledger
 * `2026-10-08-tools-tray-live-only`). Booleans only — the server never sends a value
 * (`server/services/runtime-flags.ts`). While the answer is loading, failed, or the block is absent,
 * this returns `null`, and every reader treats a switch it cannot see as OFF (§13).
 */
import { useQuery } from "@tanstack/react-query";

export type HealthFlagsBlock = Record<string, boolean>;

export function healthFlagsFrom(body: unknown): HealthFlagsBlock | null {
  const flags = (body as { flags?: unknown } | null | undefined)?.flags;
  if (!flags || typeof flags !== "object") return null;
  const out: HealthFlagsBlock = {};
  for (const [k, v] of Object.entries(flags as Record<string, unknown>)) if (typeof v === "boolean") out[k] = v;
  return out;
}

export function useHealthFlags(): HealthFlagsBlock | null {
  const { data } = useQuery<unknown>({ queryKey: ["/api/health"], retry: false });
  return healthFlagsFrom(data);
}
