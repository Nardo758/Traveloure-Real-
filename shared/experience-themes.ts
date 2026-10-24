/**
 * Experience themes — the admin-edited catalog a listing picks from.
 *
 * Ledger `2026-10-23-experience-themes` (pending). The free-text listing title
 * (`provider_services.service_name`, the creator's "Name it") stays as it is.
 * A theme is a separate single pick. `ready_made_trips.plan_type` is a closed
 * hardcoded vocabulary whose `custom` value publishes free text, so it is not
 * this catalog.
 *
 * Seed labels are the ready-made plan types except `custom` ("Create your own…").
 * They are a proposed starting set for wording approval, not a final list.
 * Field-guide mockup moods are not seeded.
 */
import { READY_MADE_PLAN_TYPES } from "./ready-made-plan-types";

/** Discover and the services browse share this query parameter name. */
export const DISCOVER_THEME_PARAM = "theme" as const;

export const PROPOSED_EXPERIENCE_THEME_SEEDS: readonly { slug: string; label: string }[] =
  READY_MADE_PLAN_TYPES.filter((row) => row.key !== "custom").map((row) => ({
    slug: row.key,
    label: row.label,
  }));

export const THEME_SUGGESTION_MIN = 3;
export const THEME_SUGGESTION_MAX = 80;

export const PICK_THEME_MESSAGE = "Pick a theme from the list, or suggest one.";
export const THEME_NOT_ON_LIST_MESSAGE = "That theme is not on the list.";
export const SUGGEST_THEME_LENGTH_MESSAGE = "Name the theme you want to suggest (3-80 characters).";
export const UNKNOWN_THEME_MESSAGE = "Unknown theme.";
export const THEME_NAME_CANNOT_BE_SAVED_MESSAGE = "That theme name cannot be saved.";
export const THEME_ALREADY_LISTED_MESSAGE = "That theme is already on the list.";
export const SUGGESTION_NOT_ON_LIST_MESSAGE = "That suggestion is not on the list.";

export const THEME_PICKER_LABEL = "Theme *";
export const THEME_OTHER_LABEL = "Other / suggest a theme";
export const THEME_SUGGESTED_NOTE = "Suggested from the name. Change it if that's wrong.";
export const THEME_SUGGESTION_PROMPT = "Tell us the theme you have in mind";
export const THEME_REQUIRED_MESSAGE = "Pick a theme before submitting. Save as draft to finish later.";
export const THEME_SUGGESTION_SAVED_NOTE = "This suggestion is saved for an admin. It does not add a theme to Discover.";
export const THEME_FILTER_HEADING = "Theme";
export const THEME_FILTER_IDLE = "Services with no theme stay in this list.";
export const THEME_FILTER_CLEAR = "Clear";
export const UNTAGGED_ADMIN_LABEL = "Untagged";

const SKIP_WORDS = new Set([
  "plan", "trip", "tour", "with", "and", "the", "your", "own", "itinerary", "experience",
  "from", "this", "that", "for",
]);

const THEME_SLUG_RE = /^[a-z0-9_]{1,80}$/;

/** Lowercase slug from an admin or suggestion label. Empty when nothing remains. */
export function themeSlugFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function themeWords(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !SKIP_WORDS.has(word));
}

/**
 * One unambiguous whole-word match, or null.
 * Zero matches and several matches are both "no suggestion".
 * The caller confirms by saving. This function does not write.
 */
export function suggestThemeSlug(
  name: string,
  themes: readonly { slug: string; label: string }[],
): string | null {
  const nameWords = new Set(themeWords(name));
  if (nameWords.size === 0) return null;
  const hits: string[] = [];
  for (const theme of themes) {
    const tokens = themeWords(theme.label);
    if (tokens.some((token) => nameWords.has(token))) hits.push(theme.slug);
  }
  return hits.length === 1 ? hits[0] : null;
}

export function themeSuggestionLabel(raw: unknown): { ok: true; label: string } | { ok: false } {
  if (typeof raw !== "string") return { ok: false };
  const label = raw.trim();
  if (label.length < THEME_SUGGESTION_MIN || label.length > THEME_SUGGESTION_MAX) return { ok: false };
  return { ok: true, label };
}

/**
 * `theme` query values: one comma-separated string, or repeated keys.
 * An empty value is no filter. A bad token is refused (the caller answers 400).
 */
export function parseDiscoverThemeParam(
  raw: unknown,
): { ok: true; slugs: string[] } | { ok: false; message: string } {
  if (raw == null) return { ok: true, slugs: [] };
  const values = Array.isArray(raw) ? raw : [raw];
  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") return { ok: false, message: UNKNOWN_THEME_MESSAGE };
    if (value.trim() === "") continue;
    for (const piece of value.split(",")) {
      const slug = piece.trim();
      if (!slug) continue;
      if (!THEME_SLUG_RE.test(slug)) return { ok: false, message: UNKNOWN_THEME_MESSAGE };
      if (seen.has(slug)) continue;
      seen.add(slug);
      slugs.push(slug);
    }
  }
  return { ok: true, slugs };
}
