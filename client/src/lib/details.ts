/**
 * V31 - one Details view for every content type. These are the rules the board draws; the component reads only from here
 * so the surfaces cannot drift.
 *
 * Photos: D1's rule holds for every row - our own or the host's, an official source WITH its credit, or Wikimedia under
 * CC/public domain. No stock, no Google Place photos. A credit needs BOTH an author and a licence (Leon, Nov 27 2026):
 * "Photo: Wikimedia Commons" alone is uncredited, and an uncredited photo is not shown at all.
 * Text: a description is drawn paragraph by paragraph; there is no "No description available" anywhere.
 */
import { storedImageCredit } from "./cover-photo";

export type DetailsPhoto = {
  url: string;
  author?: string | null;
  source?: string | null;
  licence?: string | null;
  checkedAt?: string | Date | null;
  creditRequired?: boolean;
};

export type DetailsFact = { label: string; value: string; source: string };

export type DetailsActionKey = "add" | "ask" | "book" | "save" | "share" | "officialSite";

/** V27's action order, once. A surface passes only the actions its type actually has. */
export const DETAILS_ACTION_ORDER: DetailsActionKey[] = ["add", "ask", "book", "save", "share", "officialSite"];

export const DETAILS_MAX_PHOTOS = 8;

const looksLikeUrl = (value: string) => /^https?:\/\//i.test(value.trim()) || /https?:\/\//i.test(value);

/** A credit is an author AND a licence; ours needs neither. A raw URL is never a credit. */
export function isPhotoUsable(photo: DetailsPhoto | null | undefined): boolean {
  if (!photo?.url) return false;
  if (photo.creditRequired === false) return true;
  const author = (photo.author ?? "").trim();
  const licence = (photo.licence ?? "").trim();
  if (!author || !licence) return false;
  if (looksLikeUrl(author) || looksLikeUrl(licence)) return false;
  return true;
}

/** The gallery the view may draw: usable rows only, cover first, capped at eight. */
export function usablePhotos(photos: readonly DetailsPhoto[] | null | undefined): DetailsPhoto[] {
  return (photos ?? []).filter(isPhotoUsable).slice(0, DETAILS_MAX_PHOTOS);
}

export type DescriptionState = "full" | "short" | "none";

/** D1's bands, still the rule for a PLACE description (a gem's teaser is shown as written). */
export function descriptionState(text: string | null | undefined): DescriptionState {
  const body = (text ?? "").trim();
  if (body.length >= 240) return "full";
  if (body.length >= 120) return "short";
  return "none";
}

/** One <p> per paragraph, never a single blob. Blank runs collapse; nothing is invented. */
export function paragraphs(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** "1 of 5" - the counter under the phone gallery. */
export function photoCounter(index: number, total: number): string {
  return `${index + 1} of ${total}`;
}

/** "Photo: {author} / {source} · {licence} · checked {date}" - only the parts the row carries, never a URL. */
export function photoCreditLine(photo: DetailsPhoto | null | undefined): string {
  if (!photo) return "";
  const author = cleanCreditPart(photo.author);
  const source = cleanCreditPart(photo.source);
  const licence = cleanCreditPart(photo.licence);
  const byline = [author, source].filter(Boolean).join(" / ");
  const parts = [byline, licence].filter(Boolean);
  const checked = photo.checkedAt ? formatChecked(photo.checkedAt) : "";
  if (checked) parts.push(`checked ${checked}`);
  return parts.length ? `Photo: ${parts.join(" \u00b7 ")}` : "";
}

function cleanCreditPart(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text || looksLikeUrl(text)) return "";
  return text;
}

function formatChecked(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  // UTC so a date checked at 00:00Z reads the same date on every server and in every test.
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "TYPE · NEIGHBOURHOOD, CITY" - missing parts drop, separators never dangle. */
export function detailsPlaceLine(
  type?: string | null,
  neighbourhood?: string | null,
  city?: string | null,
): string {
  const kind = (type ?? "").trim();
  const area = [(neighbourhood ?? "").trim(), (city ?? "").trim()].filter(Boolean).join(", ");
  return [kind, area].filter(Boolean).join(" \u00b7 ");
}

/** The one byline an expert-authored item may carry; nothing is invented when the server sends none. */
export function authoredByLine(
  author: { name?: string | null; city?: string | null } | null | undefined,
  reviewedAt?: string | Date | null,
): string {
  const name = (author?.name ?? "").trim();
  if (!name) return "";
  const city = (author?.city ?? "").trim();
  const reviewed = reviewedAt ? formatChecked(reviewedAt) : "";
  const who = city ? `Written by ${name}, ${city} local expert` : `Written by ${name}`;
  return reviewed ? `${who} \u00b7 reviewed ${reviewed}` : who;
}

/** The actions in V27's order, filtered to the ones this item has a control for. */
export function orderedActions(available: readonly DetailsActionKey[]): DetailsActionKey[] {
  return DETAILS_ACTION_ORDER.filter((key) => available.includes(key));
}

/** At 390 the first two actions stay pinned and the rest live under the "..." menu. */
export function splitPinnedActions(actions: readonly DetailsActionKey[]): {
  pinned: DetailsActionKey[];
  more: DetailsActionKey[];
} {
  return { pinned: actions.slice(0, 2), more: actions.slice(2) };
}

/** The 1280 gallery: one large photo, two thumbnails, then a "+N" tile for the rest. */
export function galleryTiles(photos: readonly DetailsPhoto[]): {
  hero: DetailsPhoto | null;
  thumbs: DetailsPhoto[];
  more: number;
} {
  const list = photos.slice(0, DETAILS_MAX_PHOTOS);
  return { hero: list[0] ?? null, thumbs: list.slice(1, 3), more: Math.max(0, list.length - 3) };
}

/** A stored credit string's stamped shape, with human labels instead of the URLs it carries. */
export type ParsedCredit = { author: string; source: string; licence: string };

const SOURCE_LABELS: Array<[RegExp, string]> = [
  [/commons\.wikimedia\.org|wikimedia\.org/i, "Wikimedia Commons"],
  [/unsplash\.com/i, "Unsplash"],
  [/pexels\.com/i, "Pexels"],
];

const LICENCE_LABELS: Array<[RegExp, string]> = [
  [/\/licenses\/by-sa\/4\.0/i, "CC BY-SA 4.0"],
  [/\/licenses\/by-sa\/3\.0/i, "CC BY-SA 3.0"],
  [/\/licenses\/by\/4\.0/i, "CC BY 4.0"],
  [/\/licenses\/by\/3\.0/i, "CC BY 3.0"],
  [/publicdomain\/zero|\/licenses\/publicdomain/i, "CC0"],
];

function sourceLabel(url: string | null | undefined): string {
  const value = url ?? "";
  for (const [pattern, label] of SOURCE_LABELS) if (pattern.test(value)) return label;
  return "";
}

function licenceLabel(url: string | null | undefined): string {
  const value = url ?? "";
  for (const [pattern, label] of LICENCE_LABELS) if (pattern.test(value)) return label;
  return "";
}

/**
 * The stamped credit, parsed: `{author, source, licence}` from a stored string, or null when the string is not the
 * stamped shape (no author, no known licence, no source). Raw URLs are never returned.
 */
export function parseStoredCredit(raw: string | null | undefined): ParsedCredit | null {
  const stamped = storedImageCredit(raw ?? null);
  if (!stamped) return null;
  const author = stamped.name.trim();
  const source = sourceLabel(stamped.url);
  const licence = licenceLabel((stamped as { licenseUrl?: string }).licenseUrl);
  if (!author || !source || !licence || looksLikeUrl(author)) return null;
  return { author, source, licence };
}
