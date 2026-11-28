/**
 * V31 - one Details view for every content type. These are the rules the board draws; the component reads only from here
 * so the surfaces cannot drift.
 *
 * Photos: D1's rule holds for every row - our own or the host's, an official source WITH its credit, or Wikimedia under
 * CC/public domain. No stock, no Google Place photos, and an uncredited photo is not shown at all.
 * Text: D1's character bands - >=240 full, >=120 short, <120 reads as none. There is no "No description available".
 */
export type DetailsPhoto = {
  url: string;
  source?: string | null;
  licence?: string | null;
  attribution?: string | null;
  checkedAt?: string | Date | null;
  creditRequired?: boolean;
};

export type DetailsFact = { label: string; value: string; source: string };

export type DetailsActionKey =
  | "add"
  | "ask"
  | "book"
  | "save"
  | "share"
  | "officialSite";

/** The board's order, once. A surface passes only the actions it can honestly offer. */
export const DETAILS_ACTION_ORDER: DetailsActionKey[] = ["add", "ask", "book", "save", "share", "officialSite"];

export const DETAILS_MAX_PHOTOS = 8;

/** An uncredited third-party photo is not shown; ours and the host's need no credit. */
export function isPhotoUsable(photo: DetailsPhoto | null | undefined): boolean {
  if (!photo?.url) return false;
  if (photo.creditRequired === false) return true;
  return Boolean((photo.attribution ?? "").trim());
}

/** The gallery the view may draw: usable rows only, cover first, capped at eight. */
export function usablePhotos(photos: readonly DetailsPhoto[] | null | undefined): DetailsPhoto[] {
  return (photos ?? []).filter(isPhotoUsable).slice(0, DETAILS_MAX_PHOTOS);
}

export type DescriptionState = "full" | "short" | "none";

export function descriptionState(text: string | null | undefined): DescriptionState {
  const body = (text ?? "").trim();
  if (body.length >= 240) return "full";
  if (body.length >= 120) return "short";
  return "none";
}

/** "1 of 5" - the counter under the gallery. */
export function photoCounter(index: number, total: number): string {
  return `${index + 1} of ${total}`;
}

/** "Photo: {source} · {licence} · checked {date}" - only the parts the record actually carries. */
export function photoCreditLine(photo: DetailsPhoto | null | undefined): string {
  if (!photo) return "";
  const source = (photo.source ?? "").trim() || (photo.attribution ?? "").trim();
  const licence = (photo.licence ?? "").trim();
  const checked = photo.checkedAt ? formatChecked(photo.checkedAt) : "";
  const parts = [source, licence, checked ? `checked ${checked}` : ""].filter(Boolean);
  return parts.length ? `Photo: ${parts.join(" \u00b7 ")}` : "";
}

function formatChecked(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  // UTC so a date checked at 00:00Z reads the same date on every server and in every test.
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** The one byline an expert-authored item may carry; nothing is invented when the server sends none. */
export function authoredByLine(author: { name?: string | null; city?: string | null } | null | undefined, reviewedAt?: string | Date | null): string {
  const name = (author?.name ?? "").trim();
  if (!name) return "";
  const city = (author?.city ?? "").trim();
  const reviewed = reviewedAt ? formatChecked(reviewedAt) : "";
  const who = city ? `Written by ${name}, ${city} local expert` : `Written by ${name}`;
  return reviewed ? `${who} \u00b7 reviewed ${reviewed}` : who;
}

/** The actions in the board's order, filtered to the ones this item can offer. */
export function orderedActions(available: readonly DetailsActionKey[]): DetailsActionKey[] {
  return DETAILS_ACTION_ORDER.filter((key) => available.includes(key));
}

/** At 390 the first two actions stay pinned and the rest live under "...". */
export function splitPinnedActions(actions: readonly DetailsActionKey[]): { pinned: DetailsActionKey[]; more: DetailsActionKey[] } {
  return { pinned: actions.slice(0, 2), more: actions.slice(2) };
}
