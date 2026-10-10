/**
 * LITEAPI (Nuitée) — the shared vocabulary (S1-d-1; ledger `2026-10-10-s1-d1-liteapi`).
 *
 * A LiteAPI hotel lives in `hotel_cache` with `provider = 'liteapi'`. Its stay KIND is derived from that
 * provider — there is no `kind` column — through the ONE rule below, read by the pool join, the bind and
 * the expiry sweep alike (§18 rule 1).
 */
export const LITEAPI_PROVIDER = "liteapi" as const;

/** The stay kind a `hotel_cache` row carries: `liteapi` for a LiteAPI row, otherwise `hotel_cache`. */
export function stayKindForCacheProvider(provider: string | null | undefined): "liteapi" | "hotel_cache" {
  return provider === LITEAPI_PROVIDER ? "liteapi" : "hotel_cache";
}

/** The two environments a LiteAPI key belongs to; recorded on every stored row's provenance. */
export const LITEAPI_ENVS = ["sandbox", "production"] as const;
export type LiteapiEnv = (typeof LITEAPI_ENVS)[number];
