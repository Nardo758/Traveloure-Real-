/**
 * LG-2 Ask 7 (decision-maker, Oct 18, 2026 — Leon's rulings 3–5): hand-picked OpenStreetMap points, entered by a person
 * and attached to plan items by EXACT normalised title. Pure; the ONE reading of the reviewed points sheet (§18 rule 1):
 *
 *   · `parsePointsSheet` — the CSV: first line is the OSM credit and must be kept; then the header; then one row per
 *     point. `lat`/`lon` is the point or a path's START; `end_lat`/`end_lng` a path's end.
 *   · `admitPointRow` — a row is entered only when `reviewed_by` AND `approved` are filled (ruling 5), never Hanamikoji
 *     (held until Leon approves), with an OSM type/id and a coordinate. A path row (`point_basis` "path …") is entered as
 *     its START point only until paths ship (Ask 7b's interim rule); its end is kept out.
 *   · `normaliseTitle` / `pointNames` / `planNameAttach` — the name attach: an item takes a point only when its title,
 *     normalised, equals one of the point's names exactly — the whole name, the part before a bracket, the part inside
 *     it, or the Japanese name. The title is also tried with its activity words stripped (Ask 4), and the plan says which
 *     basis matched. An item two points match is ambiguous and takes neither.
 *
 * NEGATIVE SPACE (§18d): exact match only (ruling 4). An item named any other way ("Higashiyama area" for the Yasaka
 * Shrine meeting point, "Arrive in Kyoto" for Kyoto Station) is not matched and is reported, never guessed.
 */

export interface PointsSheetRow {
  place: string;
  osmType: string;
  osmId: string;
  lat: string;
  lon: string;
  endLat: string;
  endLng: string;
  nameJa: string;
  pointBasis: string;
  note: string;
  reviewedBy: string;
  approved: string;
}

/** Pure. One CSV line set → rows of fields (RFC 4180: quoted fields, doubled quotes, commas inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim().length > 0));
}

export const POINTS_SHEET_CREDIT = "© OpenStreetMap contributors";
const REQUIRED_COLUMNS = ["place", "osm_type", "osm_id", "lat", "lon", "end_lat", "end_lng", "name_ja", "point_basis", "note", "reviewed_by", "approved"] as const;

/**
 * Pure. The sheet → rows. Refused (with the reason) when the first line does not carry the OSM credit — the credit is
 * kept, never dropped — or a required column is missing.
 */
export function parsePointsSheet(text: string): { ok: true; credit: string; rows: PointsSheetRow[] } | { ok: false; reason: "no_credit_line" | "missing_columns"; missing?: string[] } {
  const lines = parseCsv(text);
  const credit = (lines[0] ?? []).join(" ").trim();
  if (!credit.includes(POINTS_SHEET_CREDIT)) return { ok: false, reason: "no_credit_line" };
  const header = (lines[1] ?? []).map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return { ok: false, reason: "missing_columns", missing };
  const col = (r: string[], name: (typeof REQUIRED_COLUMNS)[number]) => (r[header.indexOf(name)] ?? "").trim();
  const rows = lines.slice(2).map((r) => ({
    place: col(r, "place"),
    osmType: col(r, "osm_type"),
    osmId: col(r, "osm_id"),
    lat: col(r, "lat"),
    lon: col(r, "lon"),
    endLat: col(r, "end_lat"),
    endLng: col(r, "end_lng"),
    nameJa: col(r, "name_ja"),
    pointBasis: col(r, "point_basis"),
    note: col(r, "note"),
    reviewedBy: col(r, "reviewed_by"),
    approved: col(r, "approved"),
  }));
  return { ok: true, credit, rows };
}

/** Points held by name until a person approves them — never entered from a sheet, whatever its columns say. */
export const HELD_POINT_NAMES: readonly string[] = ["hanamikoji"];

export type AdmittedPoint = {
  place: string;
  osmType: "node" | "way" | "relation";
  osmId: number;
  lat: number;
  lng: number;
  /** "path_start" when the row is a path entered at its start only (Ask 7b's interim rule), else the sheet's basis. */
  pointBasis: string;
  nameJa: string | null;
  note: string | null;
  reviewedBy: string;
  approved: string;
};
export type PointRefusal = "not_reviewed" | "not_approved" | "held" | "bad_osm_ref" | "bad_coordinate";

const num = (s: string): number | null => {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Pure. Whether a sheet row may be entered, and as what. */
export function admitPointRow(row: PointsSheetRow): { ok: true; point: AdmittedPoint } | { ok: false; reason: PointRefusal } {
  if (!row.reviewedBy) return { ok: false, reason: "not_reviewed" };
  if (!row.approved) return { ok: false, reason: "not_approved" };
  if (HELD_POINT_NAMES.some((h) => foldName(row.place).includes(h))) return { ok: false, reason: "held" };
  const type = row.osmType.toLowerCase();
  const id = Number(row.osmId);
  if (!/^(node|way|relation)$/.test(type) || !Number.isInteger(id) || id <= 0) return { ok: false, reason: "bad_osm_ref" };
  const lat = num(row.lat);
  const lng = num(row.lon);
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return { ok: false, reason: "bad_coordinate" };
  const isPath = /^path\b/i.test(row.pointBasis);
  return {
    ok: true,
    point: {
      place: row.place,
      osmType: type as AdmittedPoint["osmType"],
      osmId: id,
      lat,
      lng,
      pointBasis: isPath ? "path_start" : row.pointBasis.toLowerCase().slice(0, 32) || "point",
      nameJa: row.nameJa || null,
      note: row.note || null,
      reviewedBy: row.reviewedBy,
      approved: row.approved,
    },
  };
}

/** The open place id an admin point is written under — never the batch's own 'osm:<type>/<id>' row, which is not moved. */
export function adminPointId(p: Pick<AdmittedPoint, "osmType" | "osmId">): string {
  return `admin:${p.osmType}/${p.osmId}`;
}

function foldName(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Built with the constructor: the tsconfig target rejects the `u` flag on a literal (the place-name gate's note).
const NON_WORD = new RegExp("[^\\p{L}\\p{N}]+", "gu");

/** Pure. A title or name, normalised for the exact match: folded, lower-case, punctuation to spaces, spaces collapsed. */
export function normaliseTitle(s: string | null | undefined): string {
  return foldName(s ?? "")
    .replace(NON_WORD, " ")
    .trim();
}

/** Pure. Every name a point answers to: the whole name, the part before a bracket, the part inside it, the Japanese name. */
export function pointNames(p: Pick<AdmittedPoint, "place" | "nameJa">): string[] {
  const out = new Set<string>();
  const add = (s: string | null | undefined) => {
    const n = normaliseTitle(s);
    if (n) out.add(n);
  };
  add(p.place);
  const m = /^(.*?)\s*[（(]([^）)]*)[）)]\s*$/.exec(p.place);
  if (m) {
    add(m[1]);
    add(m[2]);
  }
  // A Japanese name of two characters or fewer names a city or ward as often as the place ("京都" is Kyoto Station's
  // and the city's), so it is not an alias.
  if (p.nameJa && Array.from(normaliseTitle(p.nameJa)).length > 2) add(p.nameJa);
  if (p.nameJa) {
    const j = /^(.*?)\s*[（(]([^）)]*)[）)]\s*$/.exec(p.nameJa);
    if (j) {
      add(j[1]);
      add(j[2]);
    }
  }
  return Array.from(out);
}

export interface AttachItem {
  id: string;
  title: string;
  /** The title with its activity words stripped (Ask 4's `strippedPlaceTitle`, first place), when it differs. */
  strippedTitle: string | null;
  /** The source of the item's current link, if it has one ('osm' | 'admin' | …). */
  linkSource: string | null;
}

export type AttachDecision =
  | { itemId: string; kind: "attach"; pointId: string; place: string; basis: "title" | "stripped_title"; replaces: string | null }
  | { itemId: string; kind: "already_admin" | "ambiguous" | "unmatched"; places?: string[] };

/** Pure. The name-attach plan: which item would take which point, and why the others take none. */
export function planNameAttach(items: readonly AttachItem[], points: readonly AdmittedPoint[]): AttachDecision[] {
  const byName = new Map<string, AdmittedPoint[]>();
  for (const p of points) for (const n of pointNames(p)) byName.set(n, [...(byName.get(n) ?? []), p]);
  return items.map((it) => {
    const tryKey = (s: string | null) => {
      const key = normaliseTitle(s);
      const hits = key ? Array.from(new Set(byName.get(key) ?? [])) : [];
      return hits;
    };
    let basis: "title" | "stripped_title" = "title";
    let hits = tryKey(it.title);
    if (hits.length === 0 && it.strippedTitle) {
      basis = "stripped_title";
      hits = tryKey(it.strippedTitle);
    }
    const distinct = Array.from(new Map(hits.map((h) => [adminPointId(h), h])).values());
    if (distinct.length === 0) return { itemId: it.id, kind: "unmatched" };
    if (distinct.length > 1) return { itemId: it.id, kind: "ambiguous", places: distinct.map((d) => d.place) };
    if (it.linkSource === "admin") return { itemId: it.id, kind: "already_admin", places: [distinct[0].place] };
    return { itemId: it.id, kind: "attach", pointId: adminPointId(distinct[0]), place: distinct[0].place, basis, replaces: it.linkSource };
  });
}

/**
 * Pure. The one sheet point a person names for a hand attach (`--attach-one`, LG-2 Ask 7 follow-up): the admitted row
 * whose `place` is exactly that name. No row, or two rows of that name, is a refusal — never a guess.
 */
export function pointByPlace(
  points: readonly AdmittedPoint[],
  place: string,
): { ok: true; point: AdmittedPoint } | { ok: false; reason: "no_row" | "two_rows" } {
  const hits = points.filter((p) => p.place.trim() === place.trim());
  if (hits.length === 0) return { ok: false, reason: "no_row" };
  if (hits.length > 1) return { ok: false, reason: "two_rows" };
  return { ok: true, point: hits[0] };
}
