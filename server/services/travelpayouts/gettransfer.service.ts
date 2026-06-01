import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";

const GT_BASE = "https://api.gettransfer.com/api";

async function gtFetch(path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
  const token = getTravelpayoutsToken();
  if (!token) throw new Error("TRAVELPAYOUTS_TOKEN not configured");

  const url = new URL(path, GT_BASE);
  url.searchParams.set("marker", token);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`GetTransfer API error ${res.status}`);
  return res.json();
}

export interface GetTransferSearchParams {
  from: string;
  to: string;
  date?: string;
  passengers?: number;
  currency?: string;
}

export async function searchGetTransferOptions(params: GetTransferSearchParams): Promise<CatalogItem[]> {
  if (!getTravelpayoutsToken()) return [];

  try {
    const token = getTravelpayoutsToken();
    const data = await gtFetch("/transfers/search", {
      from_address: params.from,
      to_address: params.to,
      date: params.date || new Date().toISOString().split("T")[0],
      pax: params.passengers || 2,
      currency: params.currency || "USD",
    });

    const offers = data?.offers || data?.transfers || data?.data || [];

    return (Array.isArray(offers) ? offers : []).map((o: any): CatalogItem => ({
      id: `gettransfer-${o.id || Math.random().toString(36).slice(2)}`,
      type: "transfer",
      provider: "gettransfer",
      externalId: String(o.id || ""),
      title: `Transfer: ${params.from} → ${params.to}`,
      description: `${o.vehicle?.name || o.vehicle_class || "Private transfer"} · up to ${o.vehicle?.pax || params.passengers || 2} passengers`,
      imageUrl: o.vehicle?.photo_url || null,
      price: o.price?.amount ? parseFloat(o.price.amount) : o.price ? parseFloat(o.price) : null,
      currency: o.price?.currency || params.currency || "USD",
      rating: o.carrier?.rating ? parseFloat(o.carrier.rating) : null,
      reviewCount: o.carrier?.reviews_count || null,
      destination: params.to,
      location: null,
      duration: o.duration ? `${Math.round(o.duration / 60)} min` : null,
      categories: ["transfer", "airport-transfer"],
      tags: [o.vehicle?.class || "private", "door-to-door"],
      bookingUrl: `https://www.gettransfer.com/en/transfers/new?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}&marker=${token}`,
      affiliateUrl: `https://www.gettransfer.com/en/transfers/new?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}&marker=${token}`,
      source: "travelpayouts/gettransfer",
      lastUpdated: new Date(),
    } as CatalogItem));
  } catch (err) {
    console.warn("[GetTransfer] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
