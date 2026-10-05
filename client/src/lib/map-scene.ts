/**
 * THE MAP SCENE (surface step 5; spec v1.2 §2.3; R-d; ledger `2026-10-04-surface-step5-map-versions`).
 * `MapControlCenter` owns the DATA — plan layer, Browse layer, version toggle, anchor, neighbourhood
 * — and resolves it here into ONE scene; each renderer (Google, and Leaflet/OSM as the fallback) only
 * draws the scene. So both renderers draw the same numbered pins, the same gold moved stops, the same
 * ghosts and the same anchor (§18 rule 1). Pure.
 *
 *   · PLAN LAYER: the selected day's stops, numbered in day order. Only LOCATED stops are pinned (a
 *     Google-located point or a trusted coordinate — the plancard has already applied that rule); an
 *     area-only stop is listed under "Not on the map yet", never guessed onto the map (§13).
 *     Straight connectors join the pins in day order — sequence, not a route.
 *   · VERSION: under a version, the day redraws from that version's stops; a stop moved vs the draft
 *     is GOLD, a new stop is marked new, and a draft stop the version dropped is a GHOST. The anchor
 *     moves with the version.
 *   · BROWSE LAYER: listings and partner places with their OWN coordinates, as hollow teal markers.
 *     Hosts have no coordinates and are never pinned.
 */
import type { BoardStop, DayDiff } from "@shared/version-board";

export type PinState = "plan" | "moved" | "added" | "ghost";

export interface MapAnchor {
  kind: "stay" | "reservation" | "venue";
  name: string;
  lat: number | null;
  lng: number | null;
}

export interface MapArea {
  slug: string;
  name: string;
  lat: number;
  lng: number;
}

export interface MapVersion {
  key: string;
  label: string;
  stops: readonly BoardStop[];
  days: readonly DayDiff[];
  anchor?: MapAnchor | null;
}

export interface BrowsePlace {
  id: string;
  kind: "listing" | "partner";
  name: string;
  lat: number | null;
  lng: number | null;
  category?: string | null;
  priceLabel?: string | null;
}

export interface PlanDayStop {
  id: string;
  name: string;
  time?: string | null;
  lat?: number | null;
  lng?: number | null;
  supplySlot?: boolean;
  expertNote?: string | null;
}

export interface ScenePin {
  id: string;
  n: number | null;
  lat: number;
  lng: number;
  name: string;
  time: string | null;
  state: PinState;
}

export interface MapScene {
  pins: ScenePin[];
  connector: Array<{ lat: number; lng: number }>;
  anchor: (MapAnchor & { lat: number; lng: number }) | null;
  areas: MapArea[];
  /** How strongly the areas are drawn: soft whenever the stay is located, stronger while the
   *  AnchorPanel is open (spec §2.3, step 6). */
  areaStyle: { strokeOpacity: number; fillOpacity: number };
  browse: Array<BrowsePlace & { lat: number; lng: number }>;
  /** The day's stops in order, numbered — the bottom sheet's list (located or not). */
  list: Array<{ id: string; n: number; name: string; time: string | null; located: boolean; state: PinState }>;
  /** Stops with no point: listed, never pinned. */
  notOnMap: Array<{ id: string; name: string }>;
}

export const AREA_STYLE_SOFT = { strokeOpacity: 0.2, fillOpacity: 0.04 } as const;
export const AREA_STYLE_EMPHASIS = { strokeOpacity: 0.45, fillOpacity: 0.12 } as const;

/**
 * Pure. When the slip map shades neighbourhoods (spec v1.3.4 §2.3, step 6): whenever the plan's STAY
 * has coordinates, and also while the AnchorPanel is open (deciding where to stay); emphasised while
 * the panel is open. A reservation or venue anchor is not a stay and shades nothing on its own.
 */
export function areaShading(input: { stayLocated: boolean; panelOpen: boolean }): { show: boolean; emphasize: boolean } {
  return { show: input.stayLocated || input.panelOpen, emphasize: input.panelOpen };
}

const located = (lat: unknown, lng: unknown): boolean =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng);

export function buildMapScene(input: {
  dayNumber: number | null;
  planStops: readonly PlanDayStop[];
  version?: MapVersion | null;
  planAnchor?: MapAnchor | null;
  areas?: readonly MapArea[] | null;
  showAreas?: boolean;
  /** The AnchorPanel is open — the shading is emphasised. */
  emphasizeAreas?: boolean;
  browse?: readonly BrowsePlace[] | null;
  layers: { plan: boolean; browse: boolean };
}): MapScene {
  const v = input.version ?? null;
  let ordered: Array<{ id: string; name: string; time: string | null; lat: unknown; lng: unknown; state: PinState }>;
  const ghosts: ScenePin[] = [];
  if (v && input.dayNumber != null) {
    const diff = v.days.find((d) => d.dayNumber === input.dayNumber);
    const moved = new Set(diff?.moved.map((m) => m.versionStopId) ?? []);
    const added = new Set(diff?.added ?? []);
    ordered = v.stops
      .filter((s) => s.dayNumber === input.dayNumber)
      .map((s) => ({
        id: s.id,
        name: s.name,
        time: s.startTime ?? null,
        lat: s.lat,
        lng: s.lng,
        state: moved.has(s.id) ? "moved" : added.has(s.id) ? "added" : "plan",
      }));
    for (const id of diff?.dropped ?? []) {
      const p = input.planStops.find((x) => x.id === id);
      if (p && located(p.lat, p.lng)) ghosts.push({ id: p.id, n: null, lat: p.lat!, lng: p.lng!, name: p.name, time: p.time ?? null, state: "ghost" });
    }
  } else {
    ordered = input.planStops.map((p) => ({ id: p.id, name: p.name, time: p.time ?? null, lat: p.lat, lng: p.lng, state: "plan" as PinState }));
  }
  const list = ordered.map((s, i) => ({ id: s.id, n: i + 1, name: s.name, time: s.time, located: located(s.lat, s.lng), state: s.state }));
  const pins: ScenePin[] = input.layers.plan
    ? [
        ...ordered
          .map((s, i) => ({ s, n: i + 1 }))
          .filter(({ s }) => located(s.lat, s.lng))
          .map(({ s, n }) => ({ id: s.id, n, lat: s.lat as number, lng: s.lng as number, name: s.name, time: s.time, state: s.state })),
        ...ghosts,
      ]
    : [];
  const connector = pins.filter((p) => p.state !== "ghost").map((p) => ({ lat: p.lat, lng: p.lng }));
  const anchorSrc = (v ? v.anchor ?? null : null) ?? input.planAnchor ?? null;
  const anchor = anchorSrc && located(anchorSrc.lat, anchorSrc.lng) ? { ...anchorSrc, lat: anchorSrc.lat as number, lng: anchorSrc.lng as number } : null;
  return {
    pins,
    connector: connector.length > 1 ? connector : [],
    anchor,
    areas: input.showAreas ? [...(input.areas ?? [])] : [],
    areaStyle: input.emphasizeAreas ? AREA_STYLE_EMPHASIS : AREA_STYLE_SOFT,
    browse: input.layers.browse
      ? (input.browse ?? []).filter((b) => located(b.lat, b.lng)).map((b) => ({ ...b, lat: b.lat as number, lng: b.lng as number }))
      : [],
    list,
    notOnMap: ordered.filter((s) => !located(s.lat, s.lng)).map((s) => ({ id: s.id, name: s.name })),
  };
}

/**
 * The renderers' shared marker list — every marker either renderer draws, with its testid and
 * look. Both renderers map over THIS, which is what keeps them in parity.
 */
export type MarkerDescriptor =
  | { kind: "pin"; testId: string; id: string; lat: number; lng: number; label: string; title: string; state: PinState }
  | { kind: "anchor"; testId: string; lat: number; lng: number; title: string; anchorKind: MapAnchor["kind"] }
  | { kind: "browse"; testId: string; id: string; lat: number; lng: number; title: string };

export function sceneMarkers(scene: MapScene): MarkerDescriptor[] {
  return [
    ...scene.pins.map(
      (p): MarkerDescriptor => ({
        kind: "pin",
        testId: p.state === "ghost" ? `map-ghost-${p.id}` : `map-pin-${p.id}`,
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        label: p.n == null ? "" : String(p.n),
        title: p.name,
        state: p.state,
      }),
    ),
    ...(scene.anchor
      ? [{ kind: "anchor" as const, testId: "map-anchor", lat: scene.anchor.lat, lng: scene.anchor.lng, title: scene.anchor.name, anchorKind: scene.anchor.kind }]
      : []),
    ...scene.browse.map(
      (b): MarkerDescriptor => ({ kind: "browse", testId: `map-browse-${b.kind}-${b.id}`, id: b.id, lat: b.lat, lng: b.lng, title: b.name }),
    ),
  ];
}

/** Pin colours by state — ONE palette for both renderers. Gold = moved vs the draft. */
export const PIN_STYLE: Readonly<Record<PinState, { fill: string; ring: string; text: string; opacity: number; dashed: boolean }>> = {
  plan: { fill: "#1F6F78", ring: "#ffffff", text: "#ffffff", opacity: 1, dashed: false },
  moved: { fill: "#C9A227", ring: "#ffffff", text: "#1A1A18", opacity: 1, dashed: false },
  added: { fill: "#1F6F78", ring: "#C9A227", text: "#ffffff", opacity: 1, dashed: false },
  ghost: { fill: "#ffffff", ring: "#94A3B8", text: "#94A3B8", opacity: 0.55, dashed: true },
};
export const BROWSE_TEAL = "#14B8A6";
export const ANCHOR_COLOR = "#7C3AED";

/**
 * THE PLAN'S MAP ANCHOR (R321, S11-6) — ONE derivation for the slip's map and the Trip Card's map
 * (§18 rule 1). The located stay wins; otherwise the item the plan is built around, when located.
 * No located candidate ⇒ null: an anchor is never guessed onto the map (§13).
 */
export interface AnchorCandidate {
  id: string;
  name: string;
  type?: string | null;
  lat?: number | null;
  lng?: number | null;
}

function anchorLocated(a: AnchorCandidate): boolean {
  return typeof a.lat === "number" && typeof a.lng === "number" && Number.isFinite(a.lat) && Number.isFinite(a.lng);
}

export function planMapAnchor(activities: readonly AnchorCandidate[], anchorItemId?: string | null): MapAnchor | null {
  const stay = activities.find((a) => a.type === "accommodation" && anchorLocated(a));
  if (stay) return { kind: "stay", name: stay.name, lat: stay.lat!, lng: stay.lng! };
  const built = anchorItemId ? activities.find((a) => a.id === anchorItemId && anchorLocated(a)) : undefined;
  if (built) return { kind: built.type === "dining" ? "reservation" : "venue", name: built.name, lat: built.lat!, lng: built.lng! };
  return null;
}
