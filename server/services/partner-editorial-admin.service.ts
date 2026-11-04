/**
 * CMS-1 (ledger `2026-11-04-cms1-launch-screens`): the ONE writer of PARTNER-1's editorial columns (migration 432).
 * An admin lists cached partner items by partner/provider and city, writes our own short description, and marks it
 * Reviewed: `editorial_reviewed_at = NOW()` is stamped in the same UPDATE, and only after the text passes the
 * public-record screen. The supplier's own text is shown to the admin for context and never copied.
 */
import { and, desc, eq, ilike, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { activityCache, affiliateProducts, feverEventCache, hotelCache } from "@shared/schema";
import { editorialTextScreen, type ScreenRefusal } from "./public-record-screen";

export const PARTNER_ITEM_TABLES = ["fever_event_cache", "activity_cache", "hotel_cache", "affiliate_products"] as const;
export type PartnerItemTable = (typeof PARTNER_ITEM_TABLES)[number];

export function isPartnerItemTable(v: unknown): v is PartnerItemTable {
  return typeof v === "string" && (PARTNER_ITEM_TABLES as readonly string[]).includes(v);
}

/** Editorial descriptions are short — the length a card's About block holds. */
export const EDITORIAL_DESCRIPTION_MAX = 600;

const TABLES = {
  fever_event_cache: { t: feverEventCache, name: feverEventCache.title, source: feverEventCache.provider, city: feverEventCache.city },
  activity_cache: { t: activityCache, name: activityCache.title, source: activityCache.provider, city: activityCache.city },
  hotel_cache: { t: hotelCache, name: hotelCache.name, source: hotelCache.provider, city: hotelCache.city },
  affiliate_products: { t: affiliateProducts, name: affiliateProducts.name, source: affiliateProducts.partnerId, city: affiliateProducts.city },
} as const;

export interface PartnerItemRow {
  id: string;
  name: string | null;
  source: string | null;
  city: string | null;
  editorialDescription: string | null;
  editorialReviewedAt: string | null;
}

export async function listPartnerItems(input: {
  table: PartnerItemTable;
  city?: string | null;
  source?: string | null;
  reviewed?: "yes" | "no" | null;
  limit?: number;
}): Promise<PartnerItemRow[]> {
  const cfg = TABLES[input.table];
  const t = cfg.t as any;
  const where = and(
    input.city ? ilike(cfg.city, `%${input.city}%`) : undefined,
    input.source ? eq(cfg.source, input.source) : undefined,
    input.reviewed === "yes" ? isNotNull(t.editorialReviewedAt) : input.reviewed === "no" ? sql`${t.editorialReviewedAt} IS NULL` : undefined,
  );
  const rows = await db
    .select({
      id: t.id,
      name: cfg.name,
      source: cfg.source,
      city: cfg.city,
      editorialDescription: t.editorialDescription,
      editorialReviewedAt: t.editorialReviewedAt,
    })
    .from(cfg.t)
    .where(where)
    .orderBy(desc(t.editorialReviewedAt))
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 200));
  return rows.map((r: any) => ({
    id: String(r.id),
    name: r.name ?? null,
    source: r.source ?? null,
    city: r.city ?? null,
    editorialDescription: r.editorialDescription ?? null,
    editorialReviewedAt: r.editorialReviewedAt ? new Date(r.editorialReviewedAt).toISOString() : null,
  }));
}

export type ReviewResult =
  | { ok: true; editorialDescription: string; editorialReviewedAt: string }
  | { ok: false; status: 400 | 404; message: string }
  | { ok: false; status: 422; refusal: ScreenRefusal };

/** Screen, then write the text and stamp it reviewed in one UPDATE. A missing row is a 404. */
export async function reviewPartnerItem(table: PartnerItemTable, id: string, rawText: unknown): Promise<ReviewResult> {
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (!text) return { ok: false, status: 400, message: "Write a description before marking it reviewed." };
  if (text.length > EDITORIAL_DESCRIPTION_MAX) {
    return { ok: false, status: 400, message: `Keep it under ${EDITORIAL_DESCRIPTION_MAX} characters.` };
  }
  const screen = editorialTextScreen(text);
  if (!screen.ok) return { ok: false, status: 422, refusal: screen.refusal };
  const t = TABLES[table].t as any;
  const [row] = await db
    .update(TABLES[table].t)
    .set({ editorialDescription: text, editorialReviewedAt: new Date() } as any)
    .where(eq(t.id, id))
    .returning({ editorialDescription: t.editorialDescription, editorialReviewedAt: t.editorialReviewedAt });
  if (!row) return { ok: false, status: 404, message: "Item not found" };
  return {
    ok: true,
    editorialDescription: String((row as any).editorialDescription),
    editorialReviewedAt: new Date((row as any).editorialReviewedAt).toISOString(),
  };
}
