/**
 * Row 303b: pure rules for the Discover tile detail panel screen. No DOM globals, no network.
 *
 * The panel read (row 303a, `GET /api/discover/tiles/:tileId/panel`) already omits every fact
 * without a source, a source URL and a checked-on date, and every photo without a credit. The
 * screen re-applies the SAME admission (`admitPanelFact`, imported, never restated) so a fact that
 * reaches it some other way still cannot render without its source and date.
 *
 * Two rules belong to the screen:
 *  - A section with no sourced fact is not drawn.
 *  - A partner item shows no price: a fact in the cost section whose source is a partner's
 *    attribution (Viator, Klook) is not drawn, although the partner's terms would allow it.
 */
import {
  admitPanelFact,
  PARTNER_PANEL_TERMS,
  TILE_PANEL_SECTIONS,
  TILE_PANEL_SECTION_HEADINGS,
  type PanelFact,
  type PanelPhoto,
  type TileDetailPanel,
  type TilePanelSection,
} from "@shared/tile-detail-panel";

export interface DisplaySection {
  section: TilePanelSection;
  heading: string;
  facts: PanelFact[];
}

const PARTNER_ATTRIBUTIONS: ReadonlySet<string> = new Set(
  Object.values(PARTNER_PANEL_TERMS).map((t) => t.attribution),
);

function isPartnerFact(fact: PanelFact): boolean {
  return PARTNER_ATTRIBUTIONS.has(fact.source);
}

/** Sections in the ruled order, each with only its admissible facts; empty sections are absent. */
export function panelSectionsForDisplay(panel: TileDetailPanel | null | undefined): DisplaySection[] {
  if (!panel || panel.store !== "present") return [];
  const out: DisplaySection[] = [];
  for (const section of TILE_PANEL_SECTIONS) {
    const raw = panel.facts?.[section] ?? [];
    const facts: PanelFact[] = [];
    for (const f of raw) {
      const admitted = admitPanelFact(f);
      if (!admitted) continue;
      if (section === "cost" && isPartnerFact(admitted)) continue;
      facts.push(admitted);
    }
    if (facts.length === 0) continue;
    const heading = panel.headings?.[section] ?? TILE_PANEL_SECTION_HEADINGS[section];
    out.push({ section, heading, facts });
  }
  return out;
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value.trim()).protocol === "https:" ? value.trim() : null;
  } catch {
    return null;
  }
}

/** Photos that carry a credit and a source link. A photo without credit is not drawn. */
export function panelPhotosForDisplay(panel: TileDetailPanel | null | undefined): PanelPhoto[] {
  if (!panel || panel.store !== "present") return [];
  const out: PanelPhoto[] = [];
  for (const p of panel.photos ?? []) {
    const imageUrl = httpsUrl(p.imageUrl);
    const sourceUrl = httpsUrl(p.sourceUrl);
    const credit = typeof p.credit === "string" ? p.credit.trim() : "";
    if (!imageUrl || !sourceUrl || !credit) continue;
    out.push({ imageUrl, credit, sourceUrl, licenseUrl: httpsUrl(p.licenseUrl) });
  }
  return out;
}

/** "Oct 1, 2026" from a checked-on `YYYY-MM-DD`. The date is read as a calendar day, not an instant. */
export function formatCheckedOn(checkedOn: string): string {
  const [y, m, d] = checkedOn.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return checkedOn;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The tile's own display name, as its card already shows it. Null when it carries none. */
export function tileDisplayName(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const candidate = d.candidate && typeof d.candidate === "object" ? (d.candidate as Record<string, unknown>) : {};
  for (const v of [
    d.placeName,
    d.title,
    d.serviceName,
    d.name,
    d.displayName,
    candidate.title,
    candidate.name,
  ]) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** The marker every card puts on its one primary control (row 302a). */
export const TILE_PRIMARY_ACTION_SELECTOR = "[data-bento-primary-action]";

/** The smallest element surface the panel needs from a tile's primary control. */
export interface PrimaryActionElement {
  textContent: string | null;
  click(): void;
}

export interface TilePanelAction {
  label: string;
  run(): void;
}

/**
 * The panel's action is the tile's own primary control: same label, and pressing it runs the
 * tile's own handler. Nothing is recomputed, so the panel cannot disagree with the tile. A tile
 * that draws two (the Arashiyama wanted tile) gives two; a tile that draws none gives none.
 */
export function collectTileActions(root: {
  querySelectorAll(selector: string): ArrayLike<PrimaryActionElement>;
} | null): TilePanelAction[] {
  if (!root) return [];
  const els = Array.from(root.querySelectorAll(TILE_PRIMARY_ACTION_SELECTOR));
  const out: TilePanelAction[] = [];
  for (const el of els) {
    const label = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!label) continue;
    out.push({ label, run: () => el.click() });
  }
  return out;
}

/** Controls inside a tile that keep their own click: the panel does not open from them. */
export const TILE_OWN_CONTROL_SELECTOR =
  'a[href],button,input,select,textarea,label,summary,[role="button"],[role="checkbox"],[role="switch"],[role="menuitem"],[data-bento-primary-action]';

/**
 * Whether a click or key press at `target` opens the panel. The tile body opens it; a control of
 * the tile's own (its action button, a save toggle, a credit link) keeps its click.
 */
export function opensTileDetail(
  target: { closest(selector: string): unknown } | null,
  tile: unknown,
): boolean {
  if (!target) return false;
  const control = target.closest(TILE_OWN_CONTROL_SELECTOR);
  if (!control) return true;
  // The tile wrapper itself is never one of its own controls.
  return control === tile;
}
