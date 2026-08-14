/**
 * CatalogMapView — the Catalog's map view. **TRAVELER PREVIEW ONLY** since Wave 2 / lane A1
 * (decision-maker ruled Aug 12, 2026; execution map S3).
 *
 * WHAT CHANGED AND WHY. Ruling 22(b) made Catalog the map's AUTHORING home, on the C9 precedent
 * that per-listing curation belongs to the "what I sell" module. The Aug 12 ruling AMENDS that:
 * map authoring is a CREATION job, so the pin, the radius, the route stops and the zone rings
 * moved into the create/edit flow as its 4th step, named "Logistics"
 * (`client/src/components/provider/service-map-authoring.tsx`). Catalog keeps the READ half —
 * see what a traveler will see, and find the listings that have no location yet — so that
 * post-creation work on Catalog is exactly two verbs: publish availability, or develop the
 * offering. Availability stays here, untouched.
 *
 * NOTHING HERE WRITES. There is no pin picker, no stop editor and no save button on this surface
 * any more; the two write rails are unchanged and live in the flow —
 * `extractServiceLocation` on POST/PATCH /api/provider/services (the ONE pin writer, L27-P3) and
 * the owner-gated replace-list PUT /api/provider/services/:id/route-points (ruling 22a). Every
 * "fix this" affordance below is a LINK into the flow's Logistics step, which is the same door
 * the draft checklist uses.
 *
 * The honesty rules C4 shipped are kept verbatim: the "X of Y services located" summary is a real
 * partition of the owner's own rows, an unlocated listing is listed in the unpinned rail and stays
 * OFF the map (never dropped on a city centre), unlocated stops are counted but never drawn, and
 * ODbL attribution rides the shared `ServiceLocationMap` wherever it renders (§20/§22c).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, MapPinOff, Pencil, Plus, TrendingUp, AlertTriangle } from "lucide-react";
import { ServiceLocationMap, type ServiceRouteStopView } from "@/components/service-location-map";
import { parseStoredPoint, type LocationPoint } from "@/components/backoffice/location-point-picker";

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

function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
  // Sibling toggle (ruling 84): the per-service map preview vs market insights (demand + gaps).
  // A separate axis from List/Map and Manage/Preview — those are untouched.
  const [insightsMode, setInsightsMode] = useState(false);
  const mappable = services.filter((s) => s.productShape !== "bundle");
  const [selectedId, setSelectedId] = useState<string | null>(mappable[0]?.id ?? null);
  const selected = mappable.find((s) => s.id === selectedId) ?? null;

  // Ruling 112 Q3: the selected listing's surcharge zones (ruling 81 rows) render as
  // display-only rings on the read-only canvas — same layer the Logistics step draws.
  const { data: zoneTierState } = useQuery<{ surchargeTiers: Array<{ radiusKm: string; fee: string }> }>({
    queryKey: [`/api/provider/services/${selectedId}/surcharge-tiers`],
    enabled: !!selectedId,
  });

  // C4 (ruling 74): honest provider-wide coverage. A service is "located" iff its OWN row
  // carries confirmed coordinates (the same `parseStoredPoint` the left rail and the single-
  // service canvas use) — never inferred from a delivery method or a city string. The count is
  // this partition's real size; the unpinned rail lists exactly the services with no coordinates,
  // which stay OFF the map (§13 — a remote/PDF listing with no pin belongs in the rail, never
  // dropped on the city centre).
  const locatedServices = mappable.filter((s) => parseStoredPoint(s.latitude, s.longitude) !== null);
  const unpinnedServices = mappable.filter((s) => parseStoredPoint(s.latitude, s.longitude) === null);

  // Owner single-service read (ruling 22: routePoints ride this response). READ ONLY — the stops
  // below are rendered from this response and edited nowhere on this surface.
  const { data: detail } = useQuery<{ routePoints?: RoutePointRow[] } | undefined>({
    queryKey: [`/api/provider/services/${selectedId}`],
    enabled: !!selectedId,
  });

  const pin: LocationPoint | null = selected ? parseStoredPoint(selected.latitude, selected.longitude) : null;

  const stops: ServiceRouteStopView[] = useMemo(
    () =>
      (detail?.routePoints ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((r, i) => ({
          id: r.id,
          position: i + 1,
          name: r.name,
          lat: toNum(r.latitude),
          lng: toNum(r.longitude),
        })),
    [detail?.routePoints],
  );
  const locatedCount = stops.filter((s) => s.lat !== null && s.lng !== null).length;

  /** The one door to authoring: the flow's step 4. Same door the draft checklist uses. */
  const logisticsHref = (id: string) => `/provider/services/${id}/edit?step=logistics`;


  // Sibling toggle bar (ruling 84) — map preview ⇄ market insights. Shown above every branch.
  const toggleBar = (
    <div className="inline-flex rounded-lg border border-[#E8E8E2] p-0.5" data-testid="map-insights-toggle">
      <button
        onClick={() => setInsightsMode(false)}
        className={`px-3 py-1.5 text-[13px] rounded-md transition-colors ${
          !insightsMode ? "bg-[#1A1A18] text-white" : "text-[#7A7A72] hover:bg-[#F3F3EE]"
        }`}
        data-testid="button-map-authoring"
      >
        Map preview
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
            No mappable services yet — create a service first. You place it on the map inside the
            create flow, on its Logistics step.
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
      {/* Center: the traveler's-eye canvas. NO authoring props are passed — markers are static and
          a map click does nothing (`ServiceLocationMap`'s authoring affordances are opt-in). */}
      <div className="space-y-2 min-w-0">
        <ServiceLocationMap
          pin={pin}
          pinLabel={selected?.meetingPoint || selected?.serviceName || null}
          radiusKm={toNum(selected?.serviceRadius)}
          surchargeZones={(zoneTierState?.surchargeTiers ?? []).map((t) => ({ radiusKm: Number(t.radiusKm), fee: t.fee }))}
          stops={stops}
          height={480}
          testIdPrefix="catalog-map-canvas"
        />
        {!pin && locatedCount === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground" data-testid="catalog-map-empty">
              <MapPin className="w-6 h-6 mx-auto mb-2 opacity-40" />
              This service has no confirmed location yet — nothing is guessed onto the map. Its pin
              is placed in the create flow, on the Logistics step.
            </CardContent>
          </Card>
        )}
        {stops.length > 0 && (
          <p className="text-[12px] text-muted-foreground" data-testid="catalog-map-coverage">
            {locatedCount} of {stops.length} stops located
            {locatedCount < stops.length ? " — unlocated stops stay listed but are never drawn." : "."}
          </p>
        )}
      </div>

      {/* Right rail: READ-ONLY. Nothing here can be dragged, armed or placed — to change a
          location you go back into the flow's Logistics step, which is the only place either
          write rail is reachable from. */}
      <div className="space-y-4">
        <Card data-testid="map-view-pin-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-[14px]">Meeting pin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-[13px]" style={{ color: "#1A1A18" }} data-testid="text-pin-state">
              {pin
                ? selected?.locationPrecision === "exact"
                  ? "Exact pin confirmed."
                  : "Approximate area — no exact pin confirmed yet."
                : "No location yet."}
            </p>
            {selected?.meetingPoint && (
              <p className="text-[12px] text-muted-foreground">{selected.meetingPoint}</p>
            )}
            {selected && (
              <Button asChild variant="outline" size="sm" className="w-full" data-testid="button-edit-location">
                <a href={logisticsHref(selected.id)}>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  {pin ? "Edit location & route" : "Add a location"}
                </a>
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground">
              Opens this listing&apos;s <strong>Logistics</strong> step — the one place the pin, the
              radius and the stops are authored.
            </p>
          </CardContent>
        </Card>

        <Card data-testid="map-view-route-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-[14px]">Route stops</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stops.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                No stops saved. The places this service visits are added on its Logistics step.
              </p>
            ) : (
              <ol className="space-y-1.5">
                {stops.map((stop) => (
                  <li
                    key={stop.id}
                    className="flex items-center gap-1.5 rounded-md border border-[#E8E8E2] px-2 py-1.5"
                    data-testid={`route-stop-row-${stop.position}`}
                  >
                    <span className="w-5 h-5 rounded-full bg-[#E85D55] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                      {stop.position}
                    </span>
                    <span className="flex-1 min-w-0 text-[13px]">
                      <span className="block truncate">{stop.name}</span>
                      {stop.lat === null && (
                        <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 mt-0.5">
                          Not on map
                        </Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      </div>
    </div>
  );
}
