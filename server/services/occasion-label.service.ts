import { inArray } from "drizzle-orm";
import { db } from "../db";
import { experienceTypes } from "@shared/schema";
import { occasionLabelFromSlug } from "@shared/occasion-label";

/**
 * R3-23 — the catalog names for a set of occasion slugs, in ONE read. The derivation itself is
 * `occasionLabelFromSlug` (@shared/occasion-label); this only fetches its map.
 */
export async function occasionNamesBySlug(
  slugs: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string>> {
  const wanted = Array.from(
    new Set(slugs.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim())),
  );
  if (wanted.length === 0) return new Map();
  const rows = await db
    .select({ slug: experienceTypes.slug, name: experienceTypes.name })
    .from(experienceTypes)
    .where(inArray(experienceTypes.slug, wanted));
  return new Map(rows.map((r) => [r.slug, r.name]));
}

/** `/api/trips` rows with `occasionLabel` added — `null` where the plan has no occasion (A-8). */
export async function withOccasionLabels<T extends { occasionSlug?: string | null }>(
  rows: T[],
): Promise<Array<T & { occasionLabel: string | null }>> {
  const names = await occasionNamesBySlug(rows.map((r) => r.occasionSlug));
  return rows.map((r) => ({ ...r, occasionLabel: occasionLabelFromSlug(r.occasionSlug, names) }));
}

/** The one plan's label. */
export async function occasionLabelForPlan(slug: string | null | undefined): Promise<string | null> {
  if (!slug) return null;
  return occasionLabelFromSlug(slug, await occasionNamesBySlug([slug]));
}
