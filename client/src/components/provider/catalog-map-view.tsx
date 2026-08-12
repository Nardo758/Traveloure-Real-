/**
 * CatalogMapView — CLAUDE.md ruling 22(b): the Catalog's map authoring surface
 * (/provider/services list↔map toggle). Three-pane shell mirroring the Workstation anatomy:
 * left = service selector (the same rows the Catalog grid renders, with their pin-health
 * status), center = the shared ServiceLocationMap canvas, right = the two authoring cards.
 *
 * Write paths — deliberately NOT new rails:
 *  - Meeting pin: the SAME confirm-gated LocationPointPicker the edit form mounts, submitting
 *    through the SAME PATCH /api/provider/services/:id (extractServiceLocation stays the one
 *    pin writer — L27-P3). Only an explicit Confirm/Remove in the picker triggers a save.
 *  - Route stops: the ruling-22 replace-list PUT /api/provider/services/:id/route-points.
 *    Stops added without coordinates stay visibly flagged "Not on map" — never guessed (§13).
 *
 * ROUTE-STOP CANVAS INTERACTIONS (ruling 62 / QA_PUNCH_LIST P1, Aug 11 2026) — the reported
 * "adding pins to the map didn't work as intended" gap. Diagnosis (decision-maker verified the
 * Google keys and the meeting-pin picker live): stops were located ONLY by name→geocode
 * (`locateStop`), and their markers were static. A stop the geocoder missed could not be pinned
 * by hand at all. Closed here with the two affordances the meeting pin already had:
 *   • DRAG-TO-ADJUST — a located stop's marker is draggable; drag end moves the DRAFT stop and
 *     sets `dirty`.
 *   • CLICK-TO-PLACE — an explicitly ARMED mode (never a bare map click, which would fight
 *     pan/zoom): "Place a stop here" arms a new stop, "Place on map" arms an existing UNLOCATED
 *     one; the next canvas click sets that stop's coordinates. A newly placed stop is prompted
 *     inline for its name and CANNOT be saved unnamed — an unnamed pin is not a stop.
 * Both are DRAFT-ONLY. Nothing reaches the server until the existing "Save route" button, and
 * that dirty→Save step IS the L27-P3 confirm posture on this surface (no second dialog).
 * Everything already true is unchanged: geocode Locate stays, unlocated stops stay honestly
 * listed off-map, positions are derived server-side from array order, and the replace-list PUT
 * with its 409 concurrency handling is untouched.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Crosshair, Loader2, MapPin, MapPinOff, Plus, Trash2, TrendingUp, AlertTriangle } from "lucide-react";
import { ServiceLocationMap, type ServiceRouteStopView } from "@/components/service-location-map";
import { LocationPointPicker, parseStoredPoint, type LocationPoint } from "@/components/backoffice/location-point-picker";

export interface CatalogMapService {
  id: string;
  serviceName: string;
  meetingPoint?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  locationPrecision?: string | null;
  serviceRadius?: string | number | null;
  location?: string;
  productShape?: string | null;
}

interface RoutePointRow {
  id: string;
  position: number;
  name: string;
  latitude: string | null;
  longitude: string | null;
}

/** Local editable stop — key is client-only (row identity across reorders before save). */
interface DraftStop {
  key: string;
  name: string;
  lat: number | null;
  lng: number | null;
}

function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

let draftKeyCounter = 0;
function nextDraftKey(): string {
  draftKeyCounter += 1;
  return `draft-${draftKeyCounter}`;
}

// ── Market insights overlay (lane B2, ruling 84) ──────────────────────────────────────────────────
// A CLIENT-ONLY sibling toggle: fetches GET /api/provider/market-insights and renders the two REAL
// layers honestly. §13: below-threshold / no rows ⇒ "not enough signal yet"; nothing is invented and
// nothing is dropped on a city centre. Server counts only (no traveler row/coords reaches the client).

interface DemandNeighborhood {
  neighborhoodId: string;
  name: string;
  centroidLat: number;
  centroidLng: number;
  searchCount: number;
}
interface DemandCity {
  city: string;
  searchCount: number;
}
interface GapMarker {
  neighborhoodId: string;
  name: string;
  centroidLat: number;
  centroidLng: number;
  categoryKey: string;
  target: number;
  have: number;
  gap: number;
}
interface MarketInsights {
  asOf: string;
  cities: string[];
  demand: {
    byNeighborhood: DemandNeighborhood[];
    cityLevel: DemandCity[];
    unplaceableCount: number;
    threshold: number;
    hasSignal: boolean;
  };
  gaps: GapMarker[];
  attribution: string;
}

/** Fit the insights map to every real point (demand centroids + gap markers). */
function FitInsights({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  const key = points.map((p) => `${p[0]}:${p[1]}`).join(",");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

function MarketInsightsView() {
  const { data, isLoading, isError } = useQuery<MarketInsights>({
    queryKey: ["/api/provider/market-insights"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground" data-testid="market-insights-loading">
          <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin opacity-50" /> Loading market insights…
        </CardContent>
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground" data-testid="market-insights-error">
          Couldn't load market insights right now.
        </CardContent>
      </Card>
    );
  }

  const { demand, gaps } = data;
  const totalRealSearches =
    demand.byNeighborhood.reduce((s, d) => s + d.searchCount, 0) +
    demand.cityLevel.reduce((s, d) => s + d.searchCount, 0) +
    demand.unplaceableCount;

  // Everything real that can be plotted: demand centroids + gap centroids.
  const maxDemand = Math.max(1, ...demand.byNeighborhood.map((d) => d.searchCount));
  const points: Array<[number, number]> = [
    ...demand.byNeighborhood.map((d) => [d.centroidLat, d.centroidLng] as [number, number]),
    ...gaps.map((g) => [g.centroidLat, g.centroidLng] as [number, number]),
  ];
  const canPlot = points.length > 0;
  const nothingToShow = !demand.hasSignal && gaps.length === 0;

  return (
    <div className="space-y-4" data-testid="market-insights-view">
      {/* Honesty line: real counts only (§13), the C4 "based on N real …" precedent. */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E8E8E2] bg-[#FAFAF8] px-3 py-2"
        data-testid="market-insights-honesty"
      >
        <span className="text-[13px] font-medium" style={{ color: "#1A1A18" }} data-testid="text-real-search-count">
          Based on {totalRealSearches} real search{totalRealSearches === 1 ? "" : "es"} in the last 90 days
          {data.cities.length > 0 ? ` · ${data.cities.join(", ")}` : ""}
        </span>
        <span className="text-[11px]" style={{ color: "#7A7A72" }}>
          Real rows only — thin signal shows "not enough signal yet", never invented heat.
        </span>
      </div>

      {nothingToShow ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground" data-testid="market-insights-empty">
            <TrendingUp className="w-6 h-6 mx-auto mb-2 opacity-40" />
            Not enough signal yet. As real searches and coverage targets accrue in your market, demand
            hotspots and coverage gaps will appear here — nothing is estimated or interpolated.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
          {/* Map: tinted demand centroids (sized by real count) + gap markers. */}
          <div className="min-w-0 space-y-2">
            {canPlot ? (
              <div style={{ position: "relative", width: "100%", height: 480 }} data-testid="market-insights-map">
                <MapContainer center={points[0]} zoom={12} style={{ width: "100%", height: "100%" }} scrollWheelZoom={false}>
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  <FitInsights points={points} />
                  {demand.byNeighborhood.map((d) => (
                    <CircleMarker
                      key={`demand-${d.neighborhoodId}`}
                      center={[d.centroidLat, d.centroidLng]}
                      radius={10 + Math.round((d.searchCount / maxDemand) * 22)}
                      pathOptions={{ color: "#E85D55", weight: 1.5, fillColor: "#E85D55", fillOpacity: 0.28 }}
                    >
                      <Popup>
                        <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", fontSize: 13 }}>
                          <div style={{ fontWeight: 700, color: "#1A1A18" }}>{d.name}</div>
                          <div style={{ color: "#7A7A72", fontSize: 12 }}>{d.searchCount} real searches</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                  {gaps.map((g) => (
                    <Marker
                      key={`gap-${g.neighborhoodId}-${g.categoryKey}`}
                      position={[g.centroidLat, g.centroidLng]}
                      icon={L.divIcon({
                        className: "",
                        html: `<div style="width:22px;height:22px;border-radius:4px;background:#9A6B1F;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;font-family:'Inter',sans-serif;">+${g.gap}</div>`,
                        iconSize: [22, 22],
                        iconAnchor: [11, 11],
                      })}
                    >
                      <Popup>
                        <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", fontSize: 13 }}>
                          <div style={{ fontWeight: 700, color: "#1A1A18" }}>{g.name}</div>
                          <div style={{ color: "#7A7A72", fontSize: 12 }}>
                            {g.categoryKey}: {g.have} of {g.target} — {g.gap} more needed
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            ) : (
              <Card>
                <CardContent className="py-16 text-center text-sm text-muted-foreground" data-testid="market-insights-map-empty">
                  Signal exists at the city level only — nothing to place on a neighborhood centroid yet.
                </CardContent>
              </Card>
            )}
            <p className="text-[11px] text-muted-foreground">
              Larger dots = more real searches. Squares mark neighborhoods with a coverage gap in a
              category. Straight to the real centroid — never an interpolated heat cell.
            </p>
          </div>

          {/* Panel: demand + gaps, real counts. */}
          <div className="space-y-4">
            <Card data-testid="market-insights-demand-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-[14px] flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4" /> Demand
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {demand.hasSignal ? (
                  <>
                    {demand.byNeighborhood.length > 0 && (
                      <ul className="space-y-1" data-testid="demand-neighborhood-list">
                        {demand.byNeighborhood.map((d) => (
                          <li key={d.neighborhoodId} className="flex items-center justify-between text-[13px]">
                            <span style={{ color: "#1A1A18" }}>{d.name}</span>
                            <Badge variant="outline">{d.searchCount}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                    {demand.cityLevel.length > 0 && (
                      <div className="pt-1" data-testid="demand-city-list">
                        <p className="text-[11px] text-muted-foreground mb-1">City-level (not placed on a neighborhood):</p>
                        <ul className="space-y-1">
                          {demand.cityLevel.map((c) => (
                            <li key={c.city} className="flex items-center justify-between text-[13px]">
                              <span style={{ color: "#1A1A18" }}>{c.city}</span>
                              <Badge variant="outline">{c.searchCount}</Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[12px] text-muted-foreground" data-testid="demand-empty">
                    Not enough signal yet (threshold {demand.threshold} searches per place).
                  </p>
                )}
                {demand.unplaceableCount > 0 && (
                  <p className="text-[11px] text-muted-foreground pt-1" data-testid="demand-unplaceable">
                    {demand.unplaceableCount} more search{demand.unplaceableCount === 1 ? "" : "es"} referenced your
                    market but couldn't be placed on a specific neighborhood — shown here honestly, never on the map.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card data-testid="market-insights-gaps-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-[14px] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Coverage gaps
                </CardTitle>
              </CardHeader>
              <CardContent>
                {gaps.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground" data-testid="gaps-empty">
                    No coverage gaps in your market — every neighborhood with a target is covered.
                  </p>
                ) : (
                  <ul className="space-y-1.5" data-testid="gaps-list">
                    {gaps.map((g) => (
                      <li
                        key={`${g.neighborhoodId}-${g.categoryKey}`}
                        className="flex items-center justify-between text-[13px] rounded-md border border-amber-200 bg-amber-50/50 px-2 py-1.5"
                      >
                        <span>
                          <span className="font-medium" style={{ color: "#1A1A18" }}>{g.name}</span>
                          <span className="text-[11px] block text-muted-foreground">{g.categoryKey}</span>
                        </span>
                        <Badge variant="outline" className="border-amber-400 text-amber-700">
                          {g.have}/{g.target} · +{g.gap}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ODbL — required wherever this renders (§20). */}
      <p className="text-[10px] text-muted-foreground" data-testid="market-insights-attribution">
        {data.attribution}
      </p>
    </div>
  );
}

export function CatalogMapView({ services }: { services: CatalogMapService[] }) {
  const { toast } = useToast();
  // Sibling toggle (ruling 84): authoring (per-service pin/route) vs market insights (demand + gaps).
  // A separate axis from List/Map and Manage/Preview — those are untouched.
  const [insightsMode, setInsightsMode] = useState(false);
  const mappable = services.filter((s) => s.productShape !== "bundle");
  const [selectedId, setSelectedId] = useState<string | null>(mappable[0]?.id ?? null);
  const selected = mappable.find((s) => s.id === selectedId) ?? null;

  // C4 (ruling 74): honest provider-wide coverage. A service is "located" iff its OWN row
  // carries confirmed coordinates (the same `parseStoredPoint` the left rail and the single-
  // service canvas use) — never inferred from a delivery method or a city string. The count is
  // this partition's real size; the unpinned rail lists exactly the services with no coordinates,
  // which stay OFF the map (§13 — a remote/PDF listing with no pin belongs in the rail, never
  // dropped on the city centre).
  const locatedServices = mappable.filter((s) => parseStoredPoint(s.latitude, s.longitude) !== null);
  const unpinnedServices = mappable.filter((s) => parseStoredPoint(s.latitude, s.longitude) === null);

  // Owner single-service read (ruling 22: routePoints ride this response)
  const { data: detail } = useQuery<{ routePoints?: RoutePointRow[] } | undefined>({
    queryKey: [`/api/provider/services/${selectedId}`],
    enabled: !!selectedId,
  });

  const [draft, setDraft] = useState<DraftStop[]>([]);
  const [dirty, setDirty] = useState(false);
  const [newStopName, setNewStopName] = useState("");
  const [locatingKey, setLocatingKey] = useState<string | null>(null);
  /** Ruling 62: the ARMED click-to-place mode. `null` = disarmed (a bare canvas click does
   *  nothing). `{kind:"new"}` drops a fresh stop at the clicked point; `{kind:"existing"}`
   *  gives an already-listed unlocated stop its pin. */
  const [placement, setPlacement] = useState<{ kind: "new" } | { kind: "existing"; key: string } | null>(null);
  /** The stop currently being named inline (a just-placed pin). Save is blocked while any
   *  stop is nameless — an unnamed pin is not a stop. */
  const [namingKey, setNamingKey] = useState<string | null>(null);

  // Re-seed the editable list whenever the selected service's saved route arrives/changes.
  useEffect(() => {
    const rows = detail?.routePoints ?? [];
    setDraft(
      rows
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((r) => ({ key: r.id, name: r.name, lat: toNum(r.latitude), lng: toNum(r.longitude) })),
    );
    setDirty(false);
    setPlacement(null);
    setNamingKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, detail?.routePoints]);

  const pin: LocationPoint | null = selected ? parseStoredPoint(selected.latitude, selected.longitude) : null;

  const stopsForMap: ServiceRouteStopView[] = useMemo(
    () => draft.map((s, i) => ({ id: s.key, position: i + 1, name: s.name, lat: s.lat, lng: s.lng })),
    [draft],
  );
  const locatedCount = draft.filter((s) => s.lat !== null && s.lng !== null).length;

  const pinMutation = useMutation({
    mutationFn: async (point: LocationPoint | null) => {
      const res = await apiRequest("PATCH", `/api/provider/services/${selectedId}`, { locationPoint: point });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      queryClient.invalidateQueries({ queryKey: [`/api/provider/services/${selectedId}`] });
      toast({ title: "Meeting pin updated" });
    },
    onError: () => toast({ title: "Could not update the pin", variant: "destructive" }),
  });

  const routeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/provider/services/${selectedId}/route-points`, {
        stops: draft.map((s) => ({
          name: s.name,
          latitude: s.lat === null ? null : s.lat,
          longitude: s.lng === null ? null : s.lng,
        })),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/provider/services/${selectedId}`] });
      setDirty(false);
      toast({ title: "Route saved" });
    },
    onError: () => toast({ title: "Could not save the route", variant: "destructive" }),
  });

  async function locateStop(stop: DraftStop) {
    setLocatingKey(stop.key);
    try {
      const query = selected?.location ? `${stop.name}, ${selected.location}` : stop.name;
      const res = await apiRequest("POST", "/api/geocode", { address: query });
      const data = await res.json();
      if (typeof data?.lat === "number" && typeof data?.lng === "number") {
        setDraft((prev) => prev.map((s) => (s.key === stop.key ? { ...s, lat: data.lat, lng: data.lng } : s)));
        setDirty(true);
      } else {
        toast({ title: "No match found", description: "The stop stays listed without a map location." });
      }
    } catch {
      toast({ title: "No match found", description: "The stop stays listed without a map location." });
    } finally {
      setLocatingKey(null);
    }
  }

  function addStop() {
    const name = newStopName.trim();
    if (!name) return;
    setDraft((prev) => [...prev, { key: nextDraftKey(), name, lat: null, lng: null }]);
    setNewStopName("");
    setDirty(true);
  }

  // ── Ruling 62: canvas interactions (DRAFT ONLY — "Save route" is still the only write) ──────

  /** Drag-to-adjust. Moves the draft stop and marks it dirty; nothing is persisted here. */
  function handleStopDragEnd(stopKey: string, lat: number, lng: number) {
    setDraft((prev) => prev.map((s) => (s.key === stopKey ? { ...s, lat, lng } : s)));
    setDirty(true);
  }

  /** Click-to-place. Only ever called while a placement mode is ARMED (the bridge is not even
   *  mounted otherwise), so a bare pan/zoom click can never drop a pin. */
  function handleCanvasClick(lat: number, lng: number) {
    if (!placement) return;
    if (placement.kind === "existing") {
      setDraft((prev) => prev.map((s) => (s.key === placement.key ? { ...s, lat, lng } : s)));
      setDirty(true);
      setPlacement(null);
      return;
    }
    // A new stop is born WITH coordinates but WITHOUT a name; the inline prompt below is
    // focused immediately and Save stays blocked until it is filled in.
    const key = nextDraftKey();
    setDraft((prev) => [...prev, { key, name: "", lat, lng }]);
    setNamingKey(key);
    setDirty(true);
    setPlacement(null);
  }

  function renameStop(key: string, name: string) {
    setDraft((prev) => prev.map((s) => (s.key === key ? { ...s, name } : s)));
    setDirty(true);
  }

  function moveStop(index: number, delta: -1 | 1) {
    setDraft((prev) => {
      const next = prev.slice();
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  }

  function removeStop(key: string) {
    setDraft((prev) => prev.filter((s) => s.key !== key));
    if (namingKey === key) setNamingKey(null);
    if (placement?.kind === "existing" && placement.key === key) setPlacement(null);
    setDirty(true);
  }

  // A stop must have a name (the replace-list PUT rejects an empty one anyway — min(1)); block
  // the save locally so the provider sees WHY instead of a 400.
  const unnamedCount = draft.filter((s) => !s.name.trim()).length;
  // §13: click-to-place needs a canvas, and this map deliberately renders NOTHING when the
  // service has no confirmed pin and no located stop — there is no city-center fallback to
  // click on. Say so honestly rather than inventing a viewport.
  const canvasExists = !!pin || locatedCount > 0;

  // Sibling toggle bar (ruling 84) — authoring ⇄ market insights. Shown above every branch.
  const toggleBar = (
    <div className="inline-flex rounded-lg border border-[#E8E8E2] p-0.5" data-testid="map-insights-toggle">
      <button
        onClick={() => setInsightsMode(false)}
        className={`px-3 py-1.5 text-[13px] rounded-md transition-colors ${
          !insightsMode ? "bg-[#1A1A18] text-white" : "text-[#7A7A72] hover:bg-[#F3F3EE]"
        }`}
        data-testid="button-map-authoring"
      >
        Place on map
      </button>
      <button
        onClick={() => setInsightsMode(true)}
        className={`px-3 py-1.5 text-[13px] rounded-md transition-colors ${
          insightsMode ? "bg-[#1A1A18] text-white" : "text-[#7A7A72] hover:bg-[#F3F3EE]"
        }`}
        data-testid="button-market-insights"
      >
        Market insights
      </button>
    </div>
  );

  if (insightsMode) {
    return (
      <div className="space-y-4">
        {toggleBar}
        <MarketInsightsView />
      </div>
    );
  }

  if (mappable.length === 0) {
    return (
      <div className="space-y-4">
        {toggleBar}
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No mappable services yet — create a service first, then place it on the map here.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toggleBar}
      {/* C4: provider-wide coverage summary — the REAL count of services with a confirmed
          location, never a guess. This is a coverage indicator across the whole catalog and is
          distinct from the single-service canvas below (which maps only the selected listing). */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E8E8E2] bg-[#FAFAF8] px-3 py-2"
        data-testid="catalog-map-located-summary"
      >
        <span className="text-[13px] font-medium" style={{ color: "#1A1A18" }} data-testid="text-located-count">
          {locatedServices.length} of {mappable.length} service{mappable.length === 1 ? "" : "s"} located on the map
        </span>
        <span className="text-[11px]" style={{ color: "#7A7A72" }}>
          Services without a confirmed location stay off the map — nothing is dropped on the city centre.
        </span>
      </div>

      {/* C4: the unpinned rail — services with NO coordinates, listed off-map (§13). Each is an
          "add a pin" affordance that selects the listing so its Meeting pin card (right) opens;
          the pin itself still writes through the one confirm-gated LocationPointPicker rail. */}
      {unpinnedServices.length > 0 && (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5"
          data-testid="catalog-map-unpinned-rail"
        >
          <p className="text-[12px] font-medium text-amber-800 mb-2 flex items-center gap-1">
            <MapPinOff className="w-3.5 h-3.5" /> Not on the map yet ({unpinnedServices.length}) — pin these to show
            travelers where they happen
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {unpinnedServices.map((s) => (
              <li key={s.id} data-testid={`unpinned-service-${s.id}`}>
                <button
                  onClick={() => setSelectedId(s.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                    s.id === selectedId
                      ? "border-[#E85D55] bg-[rgba(232,85,85,0.06)]"
                      : "border-amber-300 bg-white hover:bg-amber-50"
                  }`}
                  data-testid={`button-add-pin-${s.id}`}
                >
                  <span className="truncate max-w-[180px]" style={{ color: "#1A1A18" }}>
                    {s.serviceName}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-amber-700 font-medium">
                    <Plus className="w-3 h-3" /> Add a pin
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_320px] gap-4 items-start">
      {/* Left rail: service selector with pin health */}
      <div className="space-y-1.5 lg:max-h-[560px] lg:overflow-y-auto pr-1" data-testid="map-view-service-rail">
        {mappable.map((s) => {
          const hasPin = parseStoredPoint(s.latitude, s.longitude) !== null;
          const exact = hasPin && s.locationPrecision === "exact";
          const active = s.id === selectedId;
          return (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              data-testid={`map-view-select-${s.id}`}
              className={`w-full text-left rounded-lg border px-3 py-2 text-[13px] transition-colors ${
                active ? "border-[#E85D55] bg-[rgba(232,85,85,0.06)]" : "border-[#E8E8E2] hover:bg-[#F3F3EE]"
              }`}
            >
              <span className="font-medium block truncate" style={{ color: "#1A1A18" }}>
                {s.serviceName}
              </span>
              <span className="text-[11px]" style={{ color: exact ? "#3D7A46" : hasPin ? "#9A6B1F" : "#A54242" }}>
                {exact ? "Exact pin" : hasPin ? "Approximate area" : "No location yet"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Center: canvas */}
      <div className="space-y-2 min-w-0">
        <ServiceLocationMap
          pin={pin}
          pinLabel={selected?.meetingPoint || selected?.serviceName || null}
          radiusKm={toNum(selected?.serviceRadius)}
          stops={stopsForMap}
          height={480}
          testIdPrefix="catalog-map-canvas"
          onStopDragEnd={handleStopDragEnd}
          onCanvasClick={placement ? handleCanvasClick : undefined}
          placementActive={!!placement}
        />
        {placement && (
          <p
            className="text-[12px] rounded-md border border-[#E85D55] bg-[rgba(232,85,85,0.06)] px-2 py-1.5"
            style={{ color: "#1A1A18" }}
            data-testid="catalog-map-placement-banner"
          >
            {placement.kind === "new"
              ? "Click the map to drop a new stop — you'll name it next."
              : "Click the map to place this stop."}{" "}
            <button className="underline" onClick={() => setPlacement(null)} data-testid="button-cancel-placement">
              Cancel
            </button>
          </p>
        )}
        {!pin && locatedCount === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground" data-testid="catalog-map-empty">
              <MapPin className="w-6 h-6 mx-auto mb-2 opacity-40" />
              This service has no confirmed location yet. Confirm a meeting pin or locate a route
              stop on the right — nothing is guessed onto the map.
            </CardContent>
          </Card>
        )}
        {draft.length > 0 && (
          <p className="text-[12px] text-muted-foreground" data-testid="catalog-map-coverage">
            {locatedCount} of {draft.length} stops located
            {locatedCount < draft.length ? " — unlocated stops stay listed but are never drawn." : "."}
          </p>
        )}
      </div>

      {/* Right rail: authoring */}
      <div className="space-y-4">
        <Card data-testid="map-view-pin-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-[14px]">Meeting pin</CardTitle>
          </CardHeader>
          <CardContent>
            {selected && (
              <LocationPointPicker
                value={pin}
                precision={selected.locationPrecision ?? null}
                addressHint={selected.meetingPoint || selected.location || ""}
                onChange={(point) => pinMutation.mutate(point)}
                label="Where travelers meet you"
                helpText="Saved the moment you confirm — same pin the edit form uses."
                idPrefix={`map-view-${selected.id}`}
              />
            )}
            {pinMutation.isPending && (
              <p className="text-[12px] text-muted-foreground mt-2 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Saving pin…
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="map-view-route-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-[14px]">Route stops</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={newStopName}
                onChange={(e) => setNewStopName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addStop();
                  }
                }}
                placeholder="Add a stop (e.g. Nishiki Market)"
                className="text-[13px]"
                data-testid="input-new-stop"
              />
              <Button variant="outline" size="icon" onClick={addStop} disabled={!newStopName.trim()} data-testid="button-add-stop">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Ruling 62: the ARMED click-to-place toggle. Disabled (with the reason stated)
                when there is no canvas to click — this map never fabricates a city-center
                viewport (§13), so the meeting pin or a geocoded stop has to come first. */}
            <Button
              variant={placement?.kind === "new" ? "default" : "outline"}
              className="w-full text-[13px]"
              onClick={() => setPlacement(placement?.kind === "new" ? null : { kind: "new" })}
              disabled={!canvasExists}
              data-testid="button-place-stop-mode"
            >
              <Crosshair className="w-3.5 h-3.5 mr-1.5" />
              {placement?.kind === "new" ? "Click the map…" : "Place a stop here"}
            </Button>
            {!canvasExists && (
              <p className="text-[11px] text-muted-foreground" data-testid="text-placement-unavailable">
                Confirm the meeting pin (or find one stop by name) first — there's no map to click
                on yet, and nothing is guessed onto one.
              </p>
            )}

            {draft.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                No stops yet. Add the places this service visits, in order.
              </p>
            ) : (
              <ol className="space-y-1.5">
                {draft.map((stop, i) => (
                  <li
                    key={stop.key}
                    className="flex items-center gap-1.5 rounded-md border border-[#E8E8E2] px-2 py-1.5"
                    data-testid={`route-stop-row-${i + 1}`}
                  >
                    <span className="w-5 h-5 rounded-full bg-[#E85D55] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 min-w-0 text-[13px]">
                      {namingKey === stop.key || !stop.name.trim() ? (
                        // Ruling 62: a just-placed pin is prompted for its name inline. It is a
                        // pin, not yet a stop — Save stays blocked until this is filled in.
                        <Input
                          autoFocus
                          value={stop.name}
                          onChange={(e) => renameStop(stop.key, e.target.value)}
                          onBlur={() => stop.name.trim() && setNamingKey(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && stop.name.trim()) {
                              e.preventDefault();
                              setNamingKey(null);
                            }
                          }}
                          placeholder="Name this stop"
                          className="h-7 text-[13px]"
                          data-testid={`input-stop-name-${i + 1}`}
                        />
                      ) : (
                        <span className="block truncate">{stop.name}</span>
                      )}
                      {stop.lat === null && (
                        <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 mt-0.5">
                          Not on map
                        </Badge>
                      )}
                    </span>
                    {stop.lat === null && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Find on map by name"
                          onClick={() => locateStop(stop)}
                          disabled={locatingKey === stop.key}
                          data-testid={`button-locate-stop-${i + 1}`}
                        >
                          {locatingKey === stop.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />}
                        </Button>
                        {/* Ruling 62: give an already-listed unlocated stop its pin by hand. */}
                        <Button
                          variant={placement?.kind === "existing" && placement.key === stop.key ? "default" : "ghost"}
                          size="icon"
                          className="h-7 w-7"
                          title="Place on map"
                          disabled={!canvasExists}
                          onClick={() =>
                            setPlacement(
                              placement?.kind === "existing" && placement.key === stop.key
                                ? null
                                : { kind: "existing", key: stop.key },
                            )
                          }
                          data-testid={`button-place-stop-${i + 1}`}
                        >
                          <MapPin className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveStop(i, -1)} disabled={i === 0} title="Move up">
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => moveStop(i, 1)}
                      disabled={i === draft.length - 1}
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeStop(stop.key)} title="Remove">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </li>
                ))}
              </ol>
            )}

            {unnamedCount > 0 && (
              <p className="text-[11px] text-amber-700" data-testid="text-unnamed-stop-warning">
                Name {unnamedCount === 1 ? "the new stop" : `all ${unnamedCount} new stops`} before
                saving — an unnamed pin isn't a stop.
              </p>
            )}
            <Button
              className="w-full"
              onClick={() => routeMutation.mutate()}
              disabled={!dirty || unnamedCount > 0 || routeMutation.isPending}
              data-testid="button-save-route"
            >
              {routeMutation.isPending ? "Saving…" : dirty ? "Save route" : "Route saved"}
            </Button>
            {/* L27-P3 on this surface: the draft above lives only in the browser until this
                button. Drag-adjusts and click-placements are edits like any other — they mark
                the route dirty and wait for this one explicit confirm (ruling 62). */}
            <p className="text-[11px] text-muted-foreground">
              Drag a numbered pin to adjust it. Nothing is saved until you press Save route.
            </p>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
