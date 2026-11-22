/**
 * A7 part 1 - the map beside the days (board R3_DaysBoard; Leon's go, Nov 21, 2026).
 *
 * A pins-only map of the plan's own stops, mounted by the slip beside its days at desktop width. It draws the
 * SAME scene the map view draws (`buildMapScene`, then the map view's canvases in `DaysMapCanvas`), so a pin, the
 * anchor and the numbering cannot disagree with the map view, and it keeps the map view's rules:
 *
 *   - GC-1: the OpenStreetMap canvas mounts only when every located point shown is a non-Google point
 *     (`leafletMountPoints`); otherwise the stops are listed.
 *   - A stop with no coordinates is never guessed onto the map; the count line says how many are drawn.
 *   - No line between stops, no travel time.
 *
 * It reads what the slip already holds and asks the server for nothing: a plan with no located stop and no
 * centre from its caller draws the slip's own line, never a geocoded city. This panel is on every desktop plan
 * view, so it must not cost a request.
 *
 * It changes nothing: no add, no remove, no Browse layer. "Browse nearby" hands off to the map view, which owns
 * Browse. The legend's "where you stay" is the map view's own wording for the anchor mark.
 */
import { lazy, Suspense, useMemo, useState } from "react";
import type { PlanCardDay } from "@/components/plancard/plancard-types";
import { DAYS_MAP_COPY, daysMapActivities, daysMapChips, daysMapCountLine, daysMapKey, daysMapStops, type DaysMapKey } from "@/lib/days-map";
import { MAP_FALLBACK_NOTICE, useMapRenderer } from "@/lib/map-renderer";
import { ANCHOR_COLOR, anchorIsGoogleDerived, buildMapScene, leafletMountPoints, sceneFirstPoint, type MapAnchor } from "@/lib/map-scene";
import { MAPS_BROWSER_KEY } from "@/lib/maps-browser-key";
import { everyLocatedPointNonGoogle } from "@shared/item-coord-source";

// The canvases (and the map libraries behind them) load only once there is something to draw.
const DaysMapCanvas = lazy(() => import("./DaysMapCanvas"));

export interface DaysMapPanelProps {
  tripId: string;
  /** The plan's days, in order (the map view's own `mapDays`). */
  days: readonly PlanCardDay[];
  /** The plan's anchor (stay, reservation or venue); drawn when located. */
  anchor: MapAnchor | null;
  /** A centre the caller already has (the guest page's), used while nothing on the plan is located. */
  fallbackCenter?: { lat: number; lng: number } | null;
  /** The slip's own line for a plan with nothing located. */
  emptyNote: string | null;
  /** Opens the map view's Browse layer. Absent: no button (a viewer who cannot add). */
  onBrowse?: (() => void) | null;
}

export function DaysMapPanel({ tripId, days, anchor, fallbackCenter = null, emptyNote, onBrowse = null }: DaysMapPanelProps) {
  const [chosen, setChosen] = useState<DaysMapKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const key = daysMapKey(days, chosen);
  const chips = daysMapChips(days, key);
  const { renderer, onGoogleLoad, onGoogleError } = useMapRenderer(MAPS_BROWSER_KEY.length > 0);

  const activities = useMemo(() => daysMapActivities(days, key), [days, key]);
  const scene = useMemo(
    () => buildMapScene({ dayNumber: null, planStops: daysMapStops(days, key), planAnchor: anchor, layers: { plan: true, browse: false } }),
    [days, key, anchor],
  );
  // A day with nothing located keeps the map on the plan: the first point of every day stands in for the centre.
  const planScene = useMemo(
    () => buildMapScene({ dayNumber: null, planStops: daysMapStops(days, "all"), planAnchor: anchor, layers: { plan: true, browse: false } }),
    [days, anchor],
  );
  // Located is the scene's own answer (one predicate): a stop the scene lists as located is a point on the canvas.
  const locatedIds = useMemo(() => new Set(scene.list.filter((s) => s.located).map((s) => s.id)), [scene]);
  const leafletMapAllowed = everyLocatedPointNonGoogle(
    leafletMountPoints(
      activities.map((a) => ({ located: locatedIds.has(a.id), coordSource: a.coordSource })),
      scene.anchor,
    ),
  );
  const firstPoint = sceneFirstPoint(scene, renderer) ?? sceneFirstPoint(planScene, renderer);
  const center = firstPoint ? { lat: firstPoint.lat, lng: firstPoint.lng } : fallbackCenter;
  // GC-1: when the stops are listed and not drawn, nothing is "on the map" and no anchor mark exists to explain.
  const listed = !!center && renderer === "leaflet" && !leafletMapAllowed;
  const countLine = listed ? null : daysMapCountLine(scene.pins.length, scene.list.length);
  const legendAnchor = listed ? null : scene.anchor;
  const anchorNamedOnly = !!legendAnchor && renderer === "leaflet" && anchorIsGoogleDerived(legendAnchor);

  return (
    <aside
      className="isolate overflow-hidden rounded-[var(--slip-radius-card)] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)] lg:sticky lg:top-4"
      data-testid="slip-days-map"
      data-map-renderer={renderer}
      data-days-map-key={String(key)}
    >
      {chips.length > 0 || onBrowse ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[color:var(--slip-line)] px-3 py-2">
          {chips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={DAYS_MAP_COPY.view} data-testid="slip-days-map-chips">
              {chips.map((c) => (
                <button
                  key={String(c.key)}
                  type="button"
                  aria-pressed={c.key === key}
                  onClick={() => {
                    setChosen(c.key);
                    setSelectedId(null);
                  }}
                  className={`h-8 rounded-full border px-3 text-[13px] font-semibold ${c.key === key ? "border-[color:var(--slip-navy)] bg-[color:var(--slip-navy)] text-white" : "border-[color:var(--slip-line)] bg-[color:var(--slip-card)] text-[color:var(--slip-navy)]"}`}
                  data-testid={`slip-days-map-chip-${c.key}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : null}
          {onBrowse ? (
            <button
              type="button"
              className="ml-auto h-8 rounded-full border border-[color:var(--slip-line)] bg-[color:var(--slip-card)] px-3 text-[13px] font-semibold text-[color:var(--slip-navy)]"
              onClick={onBrowse}
              data-testid="slip-days-map-browse"
            >
              {DAYS_MAP_COPY.browse}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="relative h-[420px] overflow-hidden" data-testid="slip-days-map-canvas">
        {center ? (
          <Suspense fallback={<div className="h-full bg-[color:var(--slip-wash)]" aria-hidden="true" />}>
            <DaysMapCanvas
              tripId={tripId}
              scene={scene}
              center={center}
              renderer={renderer}
              leafletMapAllowed={leafletMapAllowed}
              activities={activities}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onGoogleLoad={onGoogleLoad}
              onGoogleError={onGoogleError}
            />
          </Suspense>
        ) : emptyNote ? (
          <div className="flex h-full items-center justify-center bg-[color:var(--slip-wash)] px-4 text-center">
            <p className="text-sm text-[color:var(--slip-muted)]" data-testid="slip-days-map-empty">
              {emptyNote}
            </p>
          </div>
        ) : (
          <div className="h-full bg-[color:var(--slip-wash)]" aria-hidden="true" />
        )}
        {renderer === "leaflet" && center && leafletMapAllowed ? (
          // Top right: at this width the canvas's own attribution fills the bottom edge.
          <p className="absolute right-1 top-1 z-[500] rounded bg-card/90 px-1.5 py-0.5 text-[10px] text-muted-foreground" data-testid="slip-days-map-osm">
            {MAP_FALLBACK_NOTICE}
          </p>
        ) : null}
      </div>
      {countLine || legendAnchor ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs text-[color:var(--slip-muted)]">
          {countLine ? <span data-testid="slip-days-map-count">{countLine}</span> : null}
          {anchorNamedOnly ? (
            // GC-1: the OpenStreetMap canvas draws no Google-derived anchor; it is named here, with no mark.
            <span data-testid="slip-days-map-anchor-name">{legendAnchor!.name}</span>
          ) : legendAnchor ? (
            <span className="inline-flex items-center gap-1.5" data-testid="slip-days-map-anchor">
              {/* The mark is the anchor pin's own colour, so the legend matches what is drawn. */}
              <span className="h-3 w-3 rounded-sm" style={{ background: ANCHOR_COLOR }} />
              where you stay
            </span>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
