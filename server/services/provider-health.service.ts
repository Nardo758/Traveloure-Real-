/**
 * provider-health.service.ts — in-memory catalog-provider health registry.
 *
 * Every /api/catalog/* source (a Travelpayouts network, a direct partner API, or a media API) reports
 * its outcome here so a broken/misconfigured/quota-exhausted provider is DISTINGUISHABLE from "genuinely
 * no results for this query" — the silent-empty theme documented across the Aug 2 2026 live probe (Kiwi
 * 401, Tiqets 404, Amadeus/GetTransfer DNS failures, SerpAPI 429, Google Places REQUEST_DENIED, all of
 * which degrade to an indistinguishable `{items: [], total: 0}` today).
 *
 * Deliberately NO DB, NO migration: state lives for the process lifetime only (every provider starts
 * `not_called` at boot and the whole registry resets on restart/redeploy). That is a scope choice, not an
 * oversight — this is an ops/debugging surface an admin reads, not a source of truth any booking, pricing,
 * or recommendation decision reads. Label it `not_called` (never fabricate an `ok`) so "nobody has hit
 * this endpoint since boot" is never confused with "this endpoint works."
 *
 * Usage: each provider service calls reportProviderResult(provider, outcome, detail?) from its own
 * catch/success paths, fire-and-forget. This module NEVER throws — reportProviderResult swallows its own
 * errors so a health-reporting bug can never break the actual catalog request it's instrumenting.
 */

export type ProviderOutcome = "ok" | "empty" | "error" | "quota" | "auth";
export type ProviderStatus = ProviderOutcome | "retired" | "not_called";

export interface ProviderHealthEntry {
  provider: string;
  label: string;
  status: ProviderStatus;
  /** Derived from the SAME env var(s) the service itself reads for its live/skip gate. */
  configured: boolean;
  retired: boolean;
  retiredReason?: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastDetail: string | null;
}

interface RuntimeRecord {
  status: ProviderOutcome;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastDetail: string | null;
}

interface StaticEntry {
  /** Human-facing label for the admin panel — cosmetic only. */
  label: string;
  /** Present only for a provider whose live source is confirmed dead — the code never attempts it. */
  retired?: { reason: string };
  /**
   * Reuses the EXACT env-var check each service performs for its own live/skip gate (copied verbatim
   * from the service, not guessed) — see the per-provider comment for the source line.
   */
  isConfigured: () => boolean;
}

// Provider key → the exact env-presence check the service itself performs. Sourced from a Aug 2026
// repo read of each file (cited inline); this is a snapshot, not a live import, so it can't accidentally
// change service behavior — if a service's gate changes, update this map alongside it.
const STATIC_PROVIDERS: Record<string, StaticEntry> = {
  // server/services/viator.service.ts: `!!VIATOR_API_KEY`
  viator: { label: "Viator", isConfigured: () => !!process.env.VIATOR_API_KEY },
  // server/services/travelpayouts/wegotrip.service.ts: public API, no token gate (only the account
  // marker is used for attribution, and getTravelpayoutsMarker() always has a default value).
  wegotrip: { label: "WeGoTrip", isConfigured: () => true },
  // server/services/fever.service.ts: `!!(accountSid && authToken)`
  fever: {
    label: "Fever (via Impact.com)",
    isConfigured: () => !!(process.env.IMPACT_ACCOUNT_SID && process.env.IMPACT_AUTH_TOKEN),
  },
  // server/services/travelpayouts/aviasales.service.ts: getTravelpayoutsToken() — the live flight
  // price source behind /api/catalog/flights (the route previously mis-reported health under the
  // retired "kiwi" label; fixed in the flight-repoint change, Aug 2026).
  aviasales: { label: "Aviasales (Travelpayouts flights)", isConfigured: () => !!process.env.TRAVELPAYOUTS_TOKEN },
  // server/services/travelpayouts/getyourguide.service.ts: getTravelpayoutsToken()
  getyourguide: { label: "GetYourGuide (Travelpayouts feed)", isConfigured: () => !!process.env.TRAVELPAYOUTS_TOKEN },
  // server/services/travelpayouts/stasher.service.ts: getTravelpayoutsToken()
  stasher: { label: "Stasher", isConfigured: () => !!process.env.TRAVELPAYOUTS_TOKEN },
  // server/services/travelpayouts/discovercars.service.ts: getTravelpayoutsToken()
  discovercars: { label: "DiscoverCars", isConfigured: () => !!process.env.TRAVELPAYOUTS_TOKEN },
  // server/services/travelpayouts/kiwitaxi.service.ts: getTravelpayoutsToken()
  kiwitaxi: { label: "Kiwitaxi", isConfigured: () => !!process.env.TRAVELPAYOUTS_TOKEN },
  // server/services/travelpayouts/gettransfer.service.ts: getTravelpayoutsToken()
  gettransfer: { label: "GetTransfer", isConfigured: () => !!process.env.TRAVELPAYOUTS_TOKEN },
  // server/services/travelpayouts/tiqets.service.ts: getTravelpayoutsToken()
  tiqets: { label: "Tiqets", isConfigured: () => !!process.env.TRAVELPAYOUTS_TOKEN },
  // server/services/pexels.service.ts: `process.env.PEXELS_API_KEY`
  pexels: { label: "Pexels", isConfigured: () => !!process.env.PEXELS_API_KEY },
  // Amadeus: entry removed entirely — the integration was dropped (DECISIONS.md ruling 34,
  // 2026-08-05) and the service code deleted, so nothing can report against it anymore.
  // server/services/serp.service.ts: `process.env.SERP_API_KEY`
  serpapi: { label: "SerpAPI", isConfigured: () => !!process.env.SERP_API_KEY },
  // server/services/google-places-photos.service.ts: `process.env.GOOGLE_MAPS_API_KEY`
  google_places: { label: "Google Places", isConfigured: () => !!process.env.GOOGLE_MAPS_API_KEY },
  // server/services/booking-com.service.ts: `isConfigured()` = `!!AFFILIATE_ID`
  booking_com: { label: "Booking.com", isConfigured: () => !!process.env.BOOKING_COM_AFFILIATE_ID },
  // server/services/opentable.service.ts: `isConfigured()` = `!!(API_KEY || CLIENT_ID)`
  opentable: {
    label: "OpenTable",
    isConfigured: () => !!(process.env.OPENTABLE_API_KEY || process.env.OPENTABLE_CLIENT_ID),
  },
  // RETIRED — server/services/travelpayouts/kiwi.service.ts. See that file's header for the evidence.
  kiwi: {
    label: "Kiwi.com / Tequila (flights + nomad)",
    retired: {
      reason:
        "Tequila API returns 401 against TRAVELPAYOUTS_TOKEN (verified 2026-08-02) — Kiwi closed Tequila " +
        "to new partners in 2023, so no obtainable key fixes this. See kiwi.service.ts.",
    },
    isConfigured: () => !!process.env.KIWI_TEQUILA_API_KEY,
  },
  // RETIRED — server/services/travelpayouts/hotellook.service.ts (precedent this registry follows).
  hotellook: {
    label: "Hotellook",
    retired: {
      reason:
        "Travelpayouts shut down the public Hotellook data API — every endpoint 404s (verified 2026-08-01). " +
        "See hotellook.service.ts.",
    },
    isConfigured: () => false,
  },
};

const runtime = new Map<string, RuntimeRecord>();

/**
 * Record a provider's outcome for this process's lifetime. Fire-and-forget — never call `await` on this,
 * and never let it throw into the request path (it catches its own errors internally).
 */
export function reportProviderResult(provider: string, outcome: ProviderOutcome, detail?: string): void {
  try {
    const now = new Date().toISOString();
    const prev = runtime.get(provider);
    const isSuccess = outcome === "ok" || outcome === "empty";
    runtime.set(provider, {
      status: outcome,
      lastSuccessAt: isSuccess ? now : prev?.lastSuccessAt ?? null,
      lastErrorAt: !isSuccess ? now : prev?.lastErrorAt ?? null,
      lastDetail: detail ?? prev?.lastDetail ?? null,
    });
  } catch {
    // Health reporting must never break the request it's instrumenting.
  }
}

/** Map a fetch Response status to a ProviderOutcome, for a uniform classification across call sites. */
export function outcomeFromHttpStatus(status: number): ProviderOutcome {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "quota";
  return "error";
}

/** Full registry snapshot — known (static) providers first, plus anything that has reported but isn't in
 * the static map (defensive; should not happen in practice). Sorted by provider key for a stable panel. */
export function getProviderHealth(): ProviderHealthEntry[] {
  const knownProviders = new Set<string>(Object.keys(STATIC_PROVIDERS).concat(Array.from(runtime.keys())));
  const entries: ProviderHealthEntry[] = [];
  for (const provider of Array.from(knownProviders)) {
    const meta = STATIC_PROVIDERS[provider];
    const rec = runtime.get(provider);
    const retired = !!meta?.retired;
    const status: ProviderStatus = retired ? "retired" : rec?.status ?? "not_called";

    entries.push({
      provider,
      label: meta?.label ?? provider,
      status,
      configured: meta ? meta.isConfigured() : true,
      retired,
      retiredReason: meta?.retired?.reason,
      lastSuccessAt: rec?.lastSuccessAt ?? null,
      lastErrorAt: rec?.lastErrorAt ?? null,
      lastDetail: rec?.lastDetail ?? null,
    });
  }
  return entries.sort((a, b) => a.provider.localeCompare(b.provider));
}

/** Test-only: clear runtime state between test cases. Never call this from production code paths. */
export function __resetProviderHealthForTests(): void {
  runtime.clear();
}
