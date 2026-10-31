/**
 * Discover tile detail panel (row 303a). Pure rules. No database and no clock of its own.
 *
 * A fact reaches the panel only as { value, source, sourceUrl, checkedOn }. A fact missing a
 * source, a source URL, or a checked-on date is not returned.
 *
 * Research (a place, a provider, an expert) is not returned until a person has reviewed it.
 * A research photo is not returned until the photo-rights tick is set. Partner feeds are Viator
 * and Klook, and only inside the terms recorded here: which sections may be shown, how long a
 * stored read may be shown, and the attribution the fact must carry.
 *
 * Section headings are HELD. The read returns this map; a screen does not restate it.
 */

export const TILE_PANEL_SECTIONS = ["what_it_is", "where", "when", "cost", "expert_tip"] as const;
export type TilePanelSection = (typeof TILE_PANEL_SECTIONS)[number];

/** HELD. Section headings on the tile detail panel. */
export const TILE_PANEL_SECTION_HEADINGS: Record<TilePanelSection, string> = {
  what_it_is: "What it is",
  where: "Where",
  when: "When",
  cost: "Cost",
  expert_tip: "Expert tips",
};

export const RESEARCH_SUBJECT_KINDS = ["place", "provider", "expert"] as const;
export type ResearchSubjectKind = (typeof RESEARCH_SUBJECT_KINDS)[number];

export const PANEL_PARTNER_KEYS = ["viator", "klook"] as const;
export type PanelPartnerKey = (typeof PANEL_PARTNER_KEYS)[number];

export interface PartnerPanelTerms {
  attribution: string;
  /**
   * How long a stored partner read may be shown, in milliseconds.
   * null means no cache length is recorded, so a stored fact is not shown.
   */
  cacheMs: number | null;
  /** Sections the partner's terms allow the panel to show. Review text has no section. */
  allowedSections: readonly TilePanelSection[];
}

/**
 * Viator product content is live (ledger `2026-10-18-viator-direct-live`): the cache length is 0.
 * Klook has no cache length recorded on a terms row. A missing length is not filled with the
 * Travelpayouts feed TTL.
 */
export const PARTNER_PANEL_TERMS: Record<PanelPartnerKey, PartnerPanelTerms> = {
  viator: {
    attribution: "Viator",
    cacheMs: 0,
    allowedSections: ["what_it_is", "where", "when", "cost"],
  },
  klook: {
    attribution: "Klook",
    cacheMs: null,
    allowedSections: ["what_it_is", "where", "when", "cost"],
  },
};

/** Feed ids are `kind-` plus a row id. A random fallback (`event-0.42`) contains a dot. */
const TILE_PANEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

export function isTilePanelId(value: string): boolean {
  return TILE_PANEL_ID.test(value);
}

export interface PanelFact {
  value: string;
  source: string;
  sourceUrl: string;
  checkedOn: string;
}

export interface PanelPhoto {
  imageUrl: string;
  credit: string;
  sourceUrl: string;
  licenseUrl: string | null;
}

export interface TileDetailPanel {
  tileId: string;
  store: "present" | "absent";
  headings: typeof TILE_PANEL_SECTION_HEADINGS;
  photos: PanelPhoto[];
  facts: Partial<Record<TilePanelSection, PanelFact[]>>;
}

export interface PanelFactInput {
  subjectKind: string;
  section: string;
  value: unknown;
  source: unknown;
  sourceUrl: unknown;
  checkedOn: unknown;
  reviewedAt: Date | string | null;
  fetchedAt: Date | null;
  attribution: unknown;
}

export interface PanelPhotoInput {
  subjectKind: string;
  imageUrl: unknown;
  credit: unknown;
  sourceUrl: unknown;
  licenseUrl: unknown;
  photoRightsTicked: boolean | null;
  fetchedAt: Date | null;
  attribution: unknown;
}

export function withinPartnerCacheWindow(fetchedAt: Date, now: Date, cacheMs: number): boolean {
  if (!Number.isFinite(cacheMs) || cacheMs < 0) return false;
  if (Number.isNaN(fetchedAt.getTime()) || Number.isNaN(now.getTime())) return false;
  const age = now.getTime() - fetchedAt.getTime();
  return age >= 0 && age <= cacheMs;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function httpsUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return raw;
  } catch {
    return null;
  }
}

function isoDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [year, month, day] = s.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return s;
}

function isResearch(kind: string): kind is ResearchSubjectKind {
  return (RESEARCH_SUBJECT_KINDS as readonly string[]).includes(kind);
}

function asPartner(kind: string): PanelPartnerKey | null {
  return (PANEL_PARTNER_KEYS as readonly string[]).includes(kind) ? (kind as PanelPartnerKey) : null;
}

function asSection(value: string): TilePanelSection | null {
  return (TILE_PANEL_SECTIONS as readonly string[]).includes(value) ? (value as TilePanelSection) : null;
}

function isReviewed(reviewedAt: Date | string | null | undefined): boolean {
  if (reviewedAt == null) return false;
  if (reviewedAt instanceof Date) return !Number.isNaN(reviewedAt.getTime());
  return reviewedAt.trim() !== "";
}

export function admitPanelFact(raw: {
  value: unknown;
  source: unknown;
  sourceUrl: unknown;
  checkedOn: unknown;
}): PanelFact | null {
  const value = text(raw.value);
  const source = text(raw.source);
  const sourceUrl = httpsUrl(raw.sourceUrl);
  const checkedOn = isoDate(raw.checkedOn);
  if (!value || !source || !sourceUrl || !checkedOn) return null;
  return { value, source, sourceUrl, checkedOn };
}

function partnerCacheAllows(terms: PartnerPanelTerms, fetchedAt: Date | null, now: Date): boolean {
  if (terms.cacheMs == null || fetchedAt == null) return false;
  return withinPartnerCacheWindow(fetchedAt, now, terms.cacheMs);
}

function emptyPanel(tileId: string, store: "present" | "absent"): TileDetailPanel {
  return { tileId, store, headings: TILE_PANEL_SECTION_HEADINGS, photos: [], facts: {} };
}

/**
 * The panel a traveler may see. Facts and photos that fail a rule are omitted.
 * `terms` defaults to the recorded partner terms; a test may pass another table.
 */
export function assembleTileDetailPanel(
  input: {
    tileId: string;
    facts: readonly PanelFactInput[];
    photos: readonly PanelPhotoInput[];
    now: Date;
    store?: "present" | "absent";
  },
  terms: Record<PanelPartnerKey, PartnerPanelTerms> = PARTNER_PANEL_TERMS,
): TileDetailPanel {
  if (input.store === "absent") return emptyPanel(input.tileId, "absent");
  const facts: Partial<Record<TilePanelSection, PanelFact[]>> = {};
  for (const row of input.facts) {
    const kind = row.subjectKind.trim().toLowerCase();
    const section = asSection(row.section.trim().toLowerCase());
    if (!section) continue;
    const fact = admitPanelFact(row);
    if (!fact) continue;
    if (isResearch(kind)) {
      if (!isReviewed(row.reviewedAt)) continue;
    } else {
      const partner = asPartner(kind);
      if (!partner) continue;
      const rule = terms[partner];
      if (!rule.allowedSections.includes(section)) continue;
      if (text(row.attribution) !== rule.attribution || fact.source !== rule.attribution) continue;
      if (!partnerCacheAllows(rule, row.fetchedAt, input.now)) continue;
    }
    const list = facts[section] ?? [];
    list.push(fact);
    facts[section] = list;
  }

  const photos: PanelPhoto[] = [];
  for (const row of input.photos) {
    const kind = row.subjectKind.trim().toLowerCase();
    const imageUrl = httpsUrl(row.imageUrl);
    const credit = text(row.credit);
    const sourceUrl = httpsUrl(row.sourceUrl);
    if (!imageUrl || !credit || !sourceUrl) continue;
    const licenseRaw = row.licenseUrl == null || (typeof row.licenseUrl === "string" && row.licenseUrl.trim() === "")
      ? null
      : httpsUrl(row.licenseUrl);
    if (row.licenseUrl != null && typeof row.licenseUrl === "string" && row.licenseUrl.trim() !== "" && !licenseRaw) continue;
    if (isResearch(kind)) {
      if (row.photoRightsTicked !== true) continue;
    } else {
      const partner = asPartner(kind);
      if (!partner) continue;
      const rule = terms[partner];
      if (credit !== rule.attribution || text(row.attribution) !== rule.attribution) continue;
      if (!partnerCacheAllows(rule, row.fetchedAt, input.now)) continue;
    }
    photos.push({ imageUrl, credit, sourceUrl, licenseUrl: licenseRaw });
  }

  return { tileId: input.tileId, store: "present", headings: TILE_PANEL_SECTION_HEADINGS, photos, facts };
}
