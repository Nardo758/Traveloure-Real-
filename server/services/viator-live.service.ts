/**
 * VD-1 — live Viator product search through the Partner API, Basic Access (ledger
 * `2026-10-18-viator-direct-live`; decision-maker, Oct 18, 2026).
 *
 * The rules this module keeps, from the rulings and the technical terms read for Basic Access:
 *   • Product content and pricing are LIVE: one `POST /products/search` per request, and NOTHING is
 *     stored — no table, no cache, no vault. This module imports no database client on purpose.
 *   • The API key travels in the `exp-api-key` header only; no URL this module builds carries it.
 *   • A product's link is the API's own `productUrl`, unchanged except for an appended `campaign` value.
 *   • Every result says it is from Viator (`attribution`) and when its price was read (`asOf`).
 *   • No review TEXT is read or returned — only the rating and the count Viator states.
 *   • Off unless `VIATOR_DIRECT_ENABLED=1`; Kyoto only. Each "no results" answer names why.
 */
import {
  VIATOR_CAMPAIGNS,
  VIATOR_LIVE_MAX_COUNT,
  viatorDestinationId,
  viatorDirectEnabled,
  viatorEndpoint,
  type ViatorSurface,
} from "../config/viator.config";
import { stripPartnerCardPhrase } from "@shared/banned-copy";

export const VIATOR_ATTRIBUTION = "Viator";

export interface ViatorLiveItem {
  id: string;
  productCode: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  rating: number | null;
  reviewCount: number | null;
  durationMinutes: number | null;
  productUrl: string | null;
  provider: "viator";
  attribution: typeof VIATOR_ATTRIBUTION;
}

export type ViatorLiveStatus = "ok" | "disabled" | "unconfigured" | "unsupported_city" | "error";

export interface ViatorLiveResult {
  status: ViatorLiveStatus;
  /** Set only with `status: "error"`: what failed — never a key, never Viator's body. */
  failure?: { kind: "http" | "network" | "parse"; httpStatus?: number };
  items: ViatorLiveItem[];
  /** When the prices were read (ISO). Set only when Viator answered. */
  asOf: string | null;
  attribution: typeof VIATOR_ATTRIBUTION;
}

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** `productUrl` as returned, with only `campaign` appended (kept as is when it already carries one). */
export function withCampaign(productUrl: unknown, surface: ViatorSurface): string | null {
  if (typeof productUrl !== "string" || !productUrl) return null;
  let url: URL;
  try {
    url = new URL(productUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.searchParams.has("campaign")) return productUrl;
  return `${productUrl}${productUrl.includes("?") ? "&" : "?"}campaign=${encodeURIComponent(VIATOR_CAMPAIGNS[surface])}`;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** The largest image variant up to 720 px wide — hot-linked, never copied. */
function pickImage(images: unknown): string | null {
  const first = Array.isArray(images) ? (images.find((i: any) => i?.isCover) ?? images[0]) : null;
  const variants: any[] = Array.isArray((first as any)?.variants) ? (first as any).variants : [];
  const usable = variants.filter((v) => typeof v?.url === "string" && v.url.startsWith("https://"));
  if (!usable.length) return null;
  const sized = usable.filter((v) => num(v.width) != null && (v.width as number) <= 720).sort((a, b) => b.width - a.width);
  return (sized[0] ?? usable[0]).url;
}

/** One product summary → the card fields. Pure. Review text is never read. */
export function toViatorLiveItem(p: any, surface: ViatorSurface): ViatorLiveItem | null {
  const productCode = typeof p?.productCode === "string" ? p.productCode : null;
  if (!productCode) return null;
  const d = p.duration ?? {};
  const rawTitle = typeof p.title === "string" ? p.title.trim() : "";
  const title = rawTitle ? stripPartnerCardPhrase(rawTitle) : "Activity";
  if (!title) return null;
  const rawDescription = typeof p.description === "string" ? p.description : null;
  return {
    id: `viator-${productCode}`,
    productCode,
    title,
    description: rawDescription == null ? null : stripPartnerCardPhrase(rawDescription) || null,
    imageUrl: pickImage(p.images),
    price: num(p.pricing?.summary?.fromPrice),
    currency: typeof p.pricing?.currency === "string" ? p.pricing.currency : null,
    rating: num(p.reviews?.combinedAverageRating),
    reviewCount: num(p.reviews?.totalReviews),
    durationMinutes: num(d.fixedDurationInMinutes) ?? num(d.variableDurationFromMinutes),
    productUrl: withCampaign(p.productUrl, surface),
    provider: "viator",
    attribution: VIATOR_ATTRIBUTION,
  };
}

const empty = (status: ViatorLiveStatus): ViatorLiveResult => ({ status, items: [], asOf: null, attribution: VIATOR_ATTRIBUTION });

/** Live product search for one city. Never throws; never stores. */
export async function searchViatorLive(
  params: { city: string | null | undefined; surface: ViatorSurface; count?: number; currency?: string },
  deps: { env?: Env; fetch?: FetchLike; now?: () => Date } = {},
): Promise<ViatorLiveResult> {
  const env = deps.env ?? process.env;
  if (!viatorDirectEnabled(env)) return empty("disabled");
  const destination = viatorDestinationId(params.city);
  if (!destination) return empty("unsupported_city");
  const { baseUrl, keyEnvName } = viatorEndpoint(env);
  const key = env[keyEnvName];
  if (!key) return empty("unconfigured");
  const count = Math.max(1, Math.min(VIATOR_LIVE_MAX_COUNT, Math.floor(params.count ?? VIATOR_LIVE_MAX_COUNT)));
  const doFetch: FetchLike = deps.fetch ?? ((u, i) => fetch(u, i));
  try {
    const res = await doFetch(`${baseUrl}/products/search`, {
      method: "POST",
      headers: {
        "exp-api-key": key,
        Accept: "application/json;version=2.0",
        "Accept-Language": "en-US",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filtering: { destination },
        sorting: { sort: "DEFAULT" },
        pagination: { start: 1, count },
        currency: params.currency || "USD",
      }),
    });
    if (!res.ok) {
      console.warn(`[viator-live] search answered ${res.status}`);
      return { ...empty("error"), failure: { kind: "http", httpStatus: res.status } };
    }
    let data: any;
    try {
      data = await res.json();
    } catch {
      console.warn("[viator-live] search answer was not JSON");
      return { ...empty("error"), failure: { kind: "parse", httpStatus: res.status } };
    }
    const products: any[] = Array.isArray(data?.products) ? data.products : [];
    const items = products.map((p) => toViatorLiveItem(p, params.surface)).filter((i): i is ViatorLiveItem => i != null);
    return { status: "ok", items, asOf: (deps.now ?? (() => new Date()))().toISOString(), attribution: VIATOR_ATTRIBUTION };
  } catch (err) {
    console.warn(`[viator-live] search failed: ${(err as any)?.name ?? "error"}`);
    return { ...empty("error"), failure: { kind: "network" } };
  }
}
