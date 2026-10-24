/**
 * Listing theme admission and the admin catalog.
 *
 * `insertProviderServiceSchema` omits `themeId` (§19). This module is the only
 * way a request body names a theme. A body that never mentions a theme leaves
 * the column alone, so existing create callers stay untagged.
 *
 * "Other" stores a suggestion. It does not insert an `experience_themes` row
 * and it does not change `provider_services.theme_id`.
 */
import { asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  PICK_THEME_MESSAGE,
  SUGGEST_THEME_LENGTH_MESSAGE,
  SUGGESTION_NOT_ON_LIST_MESSAGE,
  THEME_ALREADY_LISTED_MESSAGE,
  THEME_NAME_CANNOT_BE_SAVED_MESSAGE,
  THEME_NOT_ON_LIST_MESSAGE,
  themeSlugFromLabel,
  themeSuggestionLabel,
} from "@shared/experience-themes";
import { experienceThemeSuggestions, experienceThemes, providerServices, users } from "@shared/schema";
import { db } from "../db";

const THEME_BODY_KEYS = ["themeChoice", "themeId", "themeSuggestion"] as const;

export type ListingThemeAdmission =
  | { ok: true; themePatch: { themeId: string } | Record<string, never>; suggestion: string | null }
  | { ok: false; status: number; body: { message: string } };

function asRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

export async function admitListingTheme(body: unknown): Promise<ListingThemeAdmission> {
  const record = asRecord(body);
  if (!record) return { ok: true, themePatch: {}, suggestion: null };
  const mentioned = THEME_BODY_KEYS.some((key) => Object.prototype.hasOwnProperty.call(record, key));
  if (!mentioned) return { ok: true, themePatch: {}, suggestion: null };

  const choice = record.themeChoice;
  if (choice === "catalog") {
    const themeId = record.themeId;
    if (typeof themeId !== "string" || themeId.trim() === "") {
      return { ok: false, status: 400, body: { message: PICK_THEME_MESSAGE } };
    }
    const [row] = await db
      .select({ id: experienceThemes.id, active: experienceThemes.active })
      .from(experienceThemes)
      .where(eq(experienceThemes.id, themeId));
    if (!row || row.active === false) {
      return { ok: false, status: 400, body: { message: THEME_NOT_ON_LIST_MESSAGE } };
    }
    return { ok: true, themePatch: { themeId: row.id }, suggestion: null };
  }

  if (choice === "other") {
    const parsed = themeSuggestionLabel(record.themeSuggestion);
    if (!parsed.ok) {
      return { ok: false, status: 400, body: { message: SUGGEST_THEME_LENGTH_MESSAGE } };
    }
    return { ok: true, themePatch: {}, suggestion: parsed.label };
  }

  return { ok: false, status: 400, body: { message: PICK_THEME_MESSAGE } };
}

/** A failed suggestion insert does not fail the listing write that authorized it. */
export async function recordThemeSuggestion(input: {
  label: string;
  serviceId: string;
  suggestedBy: string;
}): Promise<void> {
  try {
    await db.insert(experienceThemeSuggestions).values({
      id: crypto.randomUUID(),
      label: input.label,
      serviceId: input.serviceId,
      suggestedBy: input.suggestedBy,
      status: "pending",
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("experience theme suggestion was not stored", err);
  }
}

export async function listPublicExperienceThemes(): Promise<
  { id: string; slug: string; label: string; sortOrder: number | null }[]
> {
  const rows = await db
    .select({
      id: experienceThemes.id,
      slug: experienceThemes.slug,
      label: experienceThemes.label,
      sortOrder: experienceThemes.sortOrder,
    })
    .from(experienceThemes)
    .where(sql`${experienceThemes.active} IS NOT FALSE`)
    .orderBy(sql`${experienceThemes.sortOrder} ASC NULLS LAST`, asc(experienceThemes.label));
  return rows;
}

/** Empty slugs means no filter. A slug that is not a catalog row is unknown. Inactive slugs still resolve. */
export async function resolveThemeIdsBySlug(
  slugs: readonly string[],
): Promise<{ ok: true; ids: string[] } | { ok: false }> {
  if (slugs.length === 0) return { ok: true, ids: [] };
  const rows = await db
    .select({ id: experienceThemes.id, slug: experienceThemes.slug })
    .from(experienceThemes)
    .where(inArray(experienceThemes.slug, [...slugs]));
  const bySlug = new Map(rows.map((row) => [row.slug, row.id]));
  const ids: string[] = [];
  for (const slug of slugs) {
    const id = bySlug.get(slug);
    if (!id) return { ok: false };
    ids.push(id);
  }
  return { ok: true, ids };
}

export async function loadAdminExperienceThemes() {
  const themes = await db
    .select()
    .from(experienceThemes)
    .orderBy(sql`${experienceThemes.sortOrder} ASC NULLS LAST`, asc(experienceThemes.label));

  const suggestions = await db
    .select({
      id: experienceThemeSuggestions.id,
      label: experienceThemeSuggestions.label,
      status: experienceThemeSuggestions.status,
      createdAt: experienceThemeSuggestions.createdAt,
      serviceName: providerServices.serviceName,
      suggestedByEmail: users.email,
      suggestedByHandle: users.handle,
    })
    .from(experienceThemeSuggestions)
    .leftJoin(providerServices, eq(providerServices.id, experienceThemeSuggestions.serviceId))
    .leftJoin(users, eq(users.id, experienceThemeSuggestions.suggestedBy))
    .where(sql`${experienceThemeSuggestions.status} IS NULL OR ${experienceThemeSuggestions.status} = 'pending'`)
    .orderBy(desc(experienceThemeSuggestions.createdAt));

  const [untaggedCount] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(providerServices)
    .where(isNull(providerServices.themeId));

  const untaggedNames = await db
    .select({ serviceName: providerServices.serviceName })
    .from(providerServices)
    .where(isNull(providerServices.themeId))
    .orderBy(desc(providerServices.updatedAt))
    .limit(20);

  return {
    themes: themes.map((row) => ({
      id: row.id,
      slug: row.slug,
      label: row.label,
      sortOrder: row.sortOrder,
      active: row.active,
    })),
    suggestions: suggestions.map((row) => ({
      id: row.id,
      label: row.label,
      status: row.status ?? "pending",
      createdAt: row.createdAt,
      serviceName: row.serviceName,
      suggestedByEmail: row.suggestedByEmail,
      suggestedByHandle: row.suggestedByHandle,
    })),
    untagged: {
      count: untaggedCount?.value ?? 0,
      names: untaggedNames.map((row) => row.serviceName),
    },
  };
}

export async function createExperienceTheme(input: {
  label: string;
  active: boolean | null;
}): Promise<{ ok: true; id: string } | { ok: false; status: number; message: string }> {
  const slug = themeSlugFromLabel(input.label);
  if (!slug) return { ok: false, status: 400, message: THEME_NAME_CANNOT_BE_SAVED_MESSAGE };
  const [existing] = await db
    .select({ id: experienceThemes.id })
    .from(experienceThemes)
    .where(eq(experienceThemes.slug, slug));
  if (existing) return { ok: false, status: 409, message: THEME_ALREADY_LISTED_MESSAGE };
  await db.insert(experienceThemes).values({
    id: slug,
    slug,
    label: input.label.trim(),
    active: input.active,
    sortOrder: null,
  });
  return { ok: true, id: slug };
}

export async function updateExperienceTheme(
  id: string,
  patch: { label?: string; active?: boolean | null; sortOrder?: number | null },
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const [existing] = await db
    .select({ id: experienceThemes.id })
    .from(experienceThemes)
    .where(eq(experienceThemes.id, id));
  if (!existing) return { ok: false, status: 404, message: THEME_NOT_ON_LIST_MESSAGE };
  const next: { label?: string; active?: boolean | null; sortOrder?: number | null } = {};
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (!label) return { ok: false, status: 400, message: THEME_NAME_CANNOT_BE_SAVED_MESSAGE };
    next.label = label;
  }
  if (patch.active !== undefined) next.active = patch.active;
  if (patch.sortOrder !== undefined) next.sortOrder = patch.sortOrder;
  if (Object.keys(next).length === 0) {
    return { ok: false, status: 400, message: PICK_THEME_MESSAGE };
  }
  await db.update(experienceThemes).set(next).where(eq(experienceThemes.id, id));
  return { ok: true };
}

/**
 * Accept adds a catalog row when the slug is free. It never assigns the theme
 * onto the listing that suggested it.
 */
export async function acceptThemeSuggestion(
  id: string,
  reviewerId: string,
): Promise<{ ok: true; themeId: string; created: boolean } | { ok: false; status: number; message: string }> {
  const [suggestion] = await db
    .select()
    .from(experienceThemeSuggestions)
    .where(eq(experienceThemeSuggestions.id, id));
  if (!suggestion) return { ok: false, status: 404, message: SUGGESTION_NOT_ON_LIST_MESSAGE };

  const slug = themeSlugFromLabel(suggestion.label);
  if (!slug) return { ok: false, status: 400, message: THEME_NAME_CANNOT_BE_SAVED_MESSAGE };

  const [existing] = await db
    .select({ id: experienceThemes.id })
    .from(experienceThemes)
    .where(eq(experienceThemes.slug, slug));

  let themeId = existing?.id ?? null;
  let created = false;
  if (!themeId) {
    await db.insert(experienceThemes).values({
      id: slug,
      slug,
      label: suggestion.label,
      active: true,
      sortOrder: null,
    });
    themeId = slug;
    created = true;
  }

  await db
    .update(experienceThemeSuggestions)
    .set({ status: "accepted", reviewedAt: new Date(), reviewedBy: reviewerId })
    .where(eq(experienceThemeSuggestions.id, id));

  return { ok: true, themeId, created };
}

export async function dismissThemeSuggestion(
  id: string,
  reviewerId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const [suggestion] = await db
    .select({ id: experienceThemeSuggestions.id })
    .from(experienceThemeSuggestions)
    .where(eq(experienceThemeSuggestions.id, id));
  if (!suggestion) return { ok: false, status: 404, message: SUGGESTION_NOT_ON_LIST_MESSAGE };
  await db
    .update(experienceThemeSuggestions)
    .set({ status: "dismissed", reviewedAt: new Date(), reviewedBy: reviewerId })
    .where(eq(experienceThemeSuggestions.id, id));
  return { ok: true };
}
