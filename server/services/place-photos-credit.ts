/**
 * The credit rule on its own, with no database import: a third-party photo row needs an AUTHOR **and** a LICENCE
 * (Leon, Nov 27 2026), and our own rows need neither. `placePhotosFor` filters with this.
 */
export function photoRowCredited(row: {
  source?: string | null;
  attribution?: string | null;
  licence?: string | null;
}): boolean {
  if (row.source === "ours") return true;
  const author = (row.attribution ?? "").trim();
  const licence = (row.licence ?? "").trim();
  return Boolean(author) && Boolean(licence);
}
