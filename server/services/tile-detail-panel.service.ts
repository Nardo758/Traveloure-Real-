/**
 * Discover tile detail panel read (row 303a).
 *
 * The tables are the held DDL in tile-detail-panel.held-sql.ts. Until that DDL
 * is registered, a missing relation is store "absent": no fact and no photo.
 */
import { pool } from "../db";
import {
  assembleTileDetailPanel,
  type PanelFactInput,
  type PanelPhotoInput,
  type TileDetailPanel,
} from "@shared/tile-detail-panel";

interface FactRow {
  subject_kind: string;
  section: string;
  value: string;
  source: string | null;
  source_url: string | null;
  checked_on: string | null;
  reviewed_at: Date | null;
  attribution: string | null;
  fetched_ms: string | number | null;
}

interface PhotoRow {
  subject_kind: string;
  image_url: string;
  credit: string | null;
  source_url: string | null;
  license_url: string | null;
  photo_rights_ticked: boolean | null;
  attribution: string | null;
  fetched_ms: string | number | null;
}

function isUndefinedTable(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && (err as { code?: unknown }).code === "42P01";
}

function fetchedAt(ms: string | number | null): Date | null {
  if (ms == null) return null;
  const n = typeof ms === "number" ? ms : Number(ms);
  if (!Number.isFinite(n)) return null;
  return new Date(n);
}

function toFact(row: FactRow): PanelFactInput {
  return {
    subjectKind: row.subject_kind,
    section: row.section,
    value: row.value,
    source: row.source,
    sourceUrl: row.source_url,
    checkedOn: row.checked_on,
    reviewedAt: row.reviewed_at,
    fetchedAt: fetchedAt(row.fetched_ms),
    attribution: row.attribution,
  };
}

function toPhoto(row: PhotoRow): PanelPhotoInput {
  return {
    subjectKind: row.subject_kind,
    imageUrl: row.image_url,
    credit: row.credit,
    sourceUrl: row.source_url,
    licenseUrl: row.license_url,
    photoRightsTicked: row.photo_rights_ticked,
    fetchedAt: fetchedAt(row.fetched_ms),
    attribution: row.attribution,
  };
}

const FACT_SQL = `SELECT subject_kind, section, value, source, source_url, checked_on::text AS checked_on,
            reviewed_at, attribution,
            (EXTRACT(EPOCH FROM fetched_at) * 1000)::bigint AS fetched_ms
     FROM discover_tile_panel_facts
     WHERE tile_id = $1
     ORDER BY id ASC`;

const PHOTO_SQL = `SELECT subject_kind, image_url, credit, source_url, license_url, photo_rights_ticked,
            attribution,
            (EXTRACT(EPOCH FROM fetched_at) * 1000)::bigint AS fetched_ms
     FROM discover_tile_panel_photos
     WHERE tile_id = $1
     ORDER BY position ASC, id ASC`;

export async function readTileDetailPanel(tileId: string, now: Date): Promise<TileDetailPanel> {
  let factRows: FactRow[];
  try {
    const result = await pool.query<FactRow>(FACT_SQL, [tileId]);
    factRows = result.rows;
  } catch (err) {
    if (isUndefinedTable(err)) {
      return assembleTileDetailPanel({ tileId, facts: [], photos: [], now, store: "absent" });
    }
    throw err;
  }
  let photoRows: PhotoRow[];
  try {
    const result = await pool.query<PhotoRow>(PHOTO_SQL, [tileId]);
    photoRows = result.rows;
  } catch (err) {
    if (isUndefinedTable(err)) {
      return assembleTileDetailPanel({ tileId, facts: [], photos: [], now, store: "absent" });
    }
    throw err;
  }
  return assembleTileDetailPanel({
    tileId,
    facts: factRows.map(toFact),
    photos: photoRows.map(toPhoto),
    now,
    store: "present",
  });
}
