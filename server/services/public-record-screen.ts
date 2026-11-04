/**
 * CMS-1 (ledger `2026-11-04-cms1-launch-screens`; Leon, Nov 3: "Traveler-facing text and photos must come only from
 * admin-reviewed records … so the banned-word screen, photo rights and the 'May appear on public pages' setting apply").
 * The ONE server module that decides whether a record's text or photo may reach a public page. Server screens, never the
 * client. The phrase list is `PUBLIC_PROFILE_NEVER_SAY` (shared/banned-copy.ts) — no second list.
 *
 * Messages here are console copy (admin and earner screens), proposed in the CMS-1 PR and held for Leon with the
 * /places heading.
 */
import { publicRecordNeverSayHits } from "@shared/banned-copy";

export const PUBLIC_RECORD_SCREEN_COPY = {
  bannedCopy: (hits: readonly string[]) => `Remove these words before this can go public: ${hits.join(", ")}.`,
  photoRights: "Confirm the photo rights before approving.",
  photoCredit: "This cover photo has no photographer credit.",
  coverPhotoRights: "Confirm you have the rights to this cover photo.",
} as const;

export type ScreenRefusal =
  | { code: "banned_copy"; message: string; hits: string[] }
  | { code: "photo_rights"; message: string };

export type ScreenResult = { ok: true } | { ok: false; refusal: ScreenRefusal };

function banned(hits: string[]): ScreenResult {
  return { ok: false, refusal: { code: "banned_copy", message: PUBLIC_RECORD_SCREEN_COPY.bannedCopy(hits), hits } };
}

/** The approve body's explicit tick — `true` only, never a truthy string. */
export function photoRightsTicked(body: unknown): boolean {
  return !!body && typeof body === "object" && (body as Record<string, unknown>).photoRightsTicked === true;
}

/** A hero meta that names who took the photo (the Unsplash picker stores `photographer`). */
export function heroMetaHasCredit(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false;
  const m = meta as Record<string, unknown>;
  const name = typeof m.photographer === "string" ? m.photographer : typeof m.credit === "string" ? m.credit : "";
  return name.trim().length > 0;
}

/**
 * A ready-made listing at approval: its title, custom plan type and season, and every day's item title, description
 * and expert note, screened; then the admin's photo-rights tick and a credited hero. Banned words are reported first.
 */
export function readyMadeApprovalScreen(input: {
  listing: { title?: string | null; planTypeCustom?: string | null; bestSeason?: string | null; heroImageMeta?: unknown };
  dayText: ReadonlyArray<{ title?: string | null; description?: string | null; expertNote?: string | null }>;
  body: unknown;
}): ScreenResult {
  const hits = publicRecordNeverSayHits(
    input.listing.title,
    input.listing.planTypeCustom,
    input.listing.bestSeason,
    ...input.dayText.flatMap((d) => [d.title, d.description, d.expertNote]),
  );
  if (hits.length > 0) return banned(hits);
  if (!photoRightsTicked(input.body)) {
    return { ok: false, refusal: { code: "photo_rights", message: PUBLIC_RECORD_SCREEN_COPY.photoRights } };
  }
  if (!heroMetaHasCredit(input.listing.heroImageMeta)) {
    return { ok: false, refusal: { code: "photo_rights", message: PUBLIC_RECORD_SCREEN_COPY.photoCredit } };
  }
  return { ok: true };
}

/** An earner's profile text on save (bio, headline, business name): refused with the hits, never trimmed. */
export function profileTextScreen(fields: Record<string, string | null | undefined>): ScreenResult {
  const hits = publicRecordNeverSayHits(...Object.values(fields));
  return hits.length > 0 ? banned(hits) : { ok: true };
}

/** A partner item's editorial description on review. */
export function editorialTextScreen(text: string | null | undefined): ScreenResult {
  const hits = publicRecordNeverSayHits(text);
  return hits.length > 0 ? banned(hits) : { ok: true };
}

/**
 * The public read of a piece of profile text: shown only when it passes the screen today. A row saved before the
 * screen existed, or before a word was added to the list, is omitted until its owner saves it clean — the same
 * predicate the save applies, so a stored "screened" flag can never disagree with the list (no migration, no backfill).
 */
export function publicProfileText(text: string | null | undefined): string | null {
  if (typeof text !== "string" || !text.trim()) return null;
  return publicRecordNeverSayHits(text).length > 0 ? null : text;
}

/**
 * The storefront cover on a public read: only once its owner has confirmed the rights
 * (`users.preferences.storefront.coverPhotoRightsAt`, written by PATCH /api/me/storefront with the cover).
 */
export function publicCoverImageUrl(storefrontPrefs: unknown): string | null {
  if (!storefrontPrefs || typeof storefrontPrefs !== "object") return null;
  const p = storefrontPrefs as Record<string, unknown>;
  const url = typeof p.coverImageUrl === "string" && p.coverImageUrl.trim() ? p.coverImageUrl : null;
  const at = typeof p.coverPhotoRightsAt === "string" && !Number.isNaN(Date.parse(p.coverPhotoRightsAt));
  return url && at ? url : null;
}
