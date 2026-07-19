/**
 * DMO discover reader — D4, the traveler-facing surface for PUBLISHED DMO content.
 *
 * Closes the "backend without a surface" gap: an expert can scrape (D3) → review/enrich (D2) →
 * publish, but published `dmo_raw_content` (status='published', discover_page_visible=true) had no
 * traveler-facing reader — publish was a dead end. This reads the published rows for a city so the
 * Discover city page can show "Local guides", curated by a Kyoto expert.
 *
 * D1a: this reads ONLY published + discover-visible rows. Nothing born-hidden or pending leaks here —
 * the same read-gate pattern as provider_services/expert-templates, but on the DMO visibility flags.
 *
 * Curation merge (important): expert enrichment is stored in `expert_dmo_edits` (editedName/
 * editedDescription/editedImages/editedTags…), NOT copied onto the base row at publish. The publish
 * endpoint only flips status/visibility. So a naive read of `dmo_raw_content` would show the RAW
 * machine-scraped text, not the expert's curation. We therefore merge the latest submitted/approved
 * edit's overrides onto each row — travelers see what the expert wrote, with the base row as fallback.
 */
import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import { db } from "../db";
import { dmoRawContent, expertDmoEdits, users } from "@shared/schema";

export interface PublishedGuideItem {
  id: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  contentType: string;
  neighborhood: string | null;
  city: string;
  country: string;
  images: string[];
  primaryImageUrl: string | null;
  tags: string[];
  sourceUrl: string | null;
  publishedAt: Date | null;
  expertId: string | null;
  expertName: string | null;
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];

const firstString = (...vals: unknown[]): string | null => {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return null;
};

/**
 * Published, discover-visible DMO content for a city, with the latest expert edit merged on top.
 * Ordered by content type then publish recency. Returns [] for an unknown/empty city (never throws
 * on no-content — the caller renders nothing).
 */
export async function getPublishedGuidesForCity(city: string): Promise<PublishedGuideItem[]> {
  if (!city || !city.trim()) return [];

  // 1. Published + discover-visible rows for the city, with the publishing expert's name.
  const rows = await db
    .select({
      content: dmoRawContent,
      expertName: users.firstName,
      expertLastName: users.lastName,
    })
    .from(dmoRawContent)
    .leftJoin(users, eq(dmoRawContent.publishedBy, users.id))
    .where(
      and(
        ilike(dmoRawContent.city, city.trim()),
        eq(dmoRawContent.status, "published"),
        eq(dmoRawContent.discoverPageVisible, true),
      ),
    )
    .orderBy(dmoRawContent.contentType, desc(dmoRawContent.publishedAt));

  if (rows.length === 0) return [];

  // 2. Latest submitted/approved expert edit per row (the curation to overlay).
  const ids = rows.map((r) => r.content.id);
  const edits = await db
    .select()
    .from(expertDmoEdits)
    .where(
      and(
        inArray(expertDmoEdits.rawContentId, ids),
        inArray(expertDmoEdits.editStatus, ["submitted", "approved"]),
      ),
    )
    .orderBy(desc(expertDmoEdits.updatedAt));

  // Keep only the newest edit per rawContentId (rows are already newest-first).
  const latestEditByContent = new Map<string, typeof edits[number]>();
  for (const e of edits) {
    if (!latestEditByContent.has(e.rawContentId)) latestEditByContent.set(e.rawContentId, e);
  }

  // 3. Merge edit overrides onto the base row (edit wins; base row is fallback).
  return rows.map(({ content: c, expertName, expertLastName }) => {
    const edit = latestEditByContent.get(c.id);
    const editImages = asStringArray(edit?.editedImages).concat(asStringArray(edit?.addedImages));
    const baseImages = asStringArray(c.images);
    const mergedImages = (editImages.length ? editImages : baseImages);
    const expertFull = firstString([expertName, expertLastName].filter(Boolean).join(" ").trim());

    return {
      id: c.id,
      name: firstString(edit?.editedName, c.name) ?? c.name,
      description: firstString(edit?.editedDescription, c.description),
      shortDescription: firstString(edit?.editedShortDescription, c.shortDescription, edit?.editedDescription, c.description),
      contentType: c.contentType,
      neighborhood: firstString(edit?.editedAddress, c.neighborhood),
      city: c.city,
      country: c.country,
      images: mergedImages,
      primaryImageUrl: firstString(c.primaryImageUrl, mergedImages[0]),
      tags: (asStringArray(edit?.editedTags).length ? asStringArray(edit?.editedTags) : asStringArray(c.tags)),
      sourceUrl: c.sourceUrl,
      publishedAt: c.publishedAt,
      expertId: c.publishedBy,
      expertName: expertFull,
    };
  });
}
