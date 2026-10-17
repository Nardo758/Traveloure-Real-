/**
 * Self-hosted OSRM — the planning-tier routing source for drive and walk (9b spec v1.0 T2, ledger
 * `2026-10-16-9b-a-osrm-adapter`). OFF unless an operator sets BOTH `OSRM_ENABLED=1` and `OSRM_BASE_URL`
 * (the Reserved VM's address, from the 9a-ii operator steps). With it off the routing engine keeps its
 * current adapter exactly as today.
 *
 * Profiles: OSRM serves one profile per data build. The request path names it
 * (`/route/v1/<profile>/…`), so a server fronting a car build and a foot build routes by that name. The
 * names default to OSRM's own (`driving`, `foot`) and are env-overridable to match the VM's layout.
 */
export function osrmBaseUrl(): string | null {
  const raw = (process.env.OSRM_BASE_URL ?? "").trim().replace(/\/+$/, "");
  return raw ? raw : null;
}

export function osrmEnabled(): boolean {
  return process.env.OSRM_ENABLED === "1" && osrmBaseUrl() !== null;
}

export function osrmCarProfile(): string {
  return (process.env.OSRM_CAR_PROFILE ?? "").trim() || "driving";
}

export function osrmFootProfile(): string {
  return (process.env.OSRM_FOOT_PROFILE ?? "").trim() || "foot";
}

/** How long one route request may take before it is treated as a failed call (a thin connector). */
export function osrmTimeoutMs(): number {
  const n = Number(process.env.OSRM_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5000;
}
