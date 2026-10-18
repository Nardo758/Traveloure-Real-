/**
 * VD-1 — the direct Viator Partner API (Basic Access), live only (ledger `2026-10-18-viator-direct-live`;
 * decision-maker, Oct 18, 2026). Pure.
 *
 *   • `VIATOR_DIRECT_ENABLED=1` turns the live search on; anything else (unset included) keeps it off.
 *     Reported by `/api/health` (`HEALTH_FLAG_NAMES`).
 *   • Production calls `api.viator.com/partner` with `VIATOR_API_KEY`; everywhere else (CI, dev) calls the
 *     sandbox with `VIATOR_SANDBOX_API_KEY`. `VIATOR_ENV=sandbox` forces the sandbox in production.
 *     The key is sent in the `exp-api-key` header only — never in a URL.
 *   • The only stored-ish values are Viator's PUBLIC destination ids: Kyoto is `332` (viator.com/Kyoto/d332).
 *     A city not listed here gets no Viator results and says so (`unsupported_city`), never a guess.
 */
export const VIATOR_DIRECT_ENABLED_ENV = "VIATOR_DIRECT_ENABLED";

export const VIATOR_PRODUCTION_BASE_URL = "https://api.viator.com/partner";
export const VIATOR_SANDBOX_BASE_URL = "https://api.sandbox.viator.com/partner";

type Env = Record<string, string | undefined>;

export function viatorDirectEnabled(env: Env = process.env): boolean {
  return env[VIATOR_DIRECT_ENABLED_ENV] === "1";
}

export type ViatorEnvironment = "production" | "sandbox";

export function viatorEnvironment(env: Env = process.env): ViatorEnvironment {
  if (env.VIATOR_ENV === "sandbox") return "sandbox";
  return env.NODE_ENV === "production" ? "production" : "sandbox";
}

/** The base URL and the NAME of the key env var for this environment. Never the key value. */
export function viatorEndpoint(env: Env = process.env): { environment: ViatorEnvironment; baseUrl: string; keyEnvName: string } {
  const environment = viatorEnvironment(env);
  return environment === "production"
    ? { environment, baseUrl: VIATOR_PRODUCTION_BASE_URL, keyEnvName: "VIATOR_API_KEY" }
    : { environment, baseUrl: VIATOR_SANDBOX_BASE_URL, keyEnvName: "VIATOR_SANDBOX_API_KEY" };
}

/** Viator's public destination ids, by lower-case city. Kyoto only (ruling 1). */
export const VIATOR_DESTINATION_IDS: Readonly<Record<string, string>> = { kyoto: "332" };

export function viatorDestinationId(city: string | null | undefined): string | null {
  const key = (city ?? "").split(",")[0].trim().toLowerCase();
  return VIATOR_DESTINATION_IDS[key] ?? null;
}

/** The `campaign` value appended to a product link, by the surface that shows it. */
export const VIATOR_CAMPAIGNS = { browse: "traveloure_browse", expert_picker: "traveloure_expert_picker" } as const;
export type ViatorSurface = keyof typeof VIATOR_CAMPAIGNS;

/** Results per live search (Basic Access, one page). */
export const VIATOR_LIVE_MAX_COUNT = 20;
