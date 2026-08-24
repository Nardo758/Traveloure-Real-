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
 * The honesty rules C4 shipped are kept, sharpened by Lane M (mock conformance, Aug 15): the
 * located summary is a real partition of the owner's own rows and counts PLACE-ANCHORED listings
 * only (a remote/artifact listing happens nowhere — a real answer, not a missing pin, D-3/D-4);
 * an unlocated listing is named in the "Not located" list with its true reason and stays OFF the
 * map (never dropped on a city centre); unlocated stops are counted but never drawn; and ODbL
 * attribution rides the shared `ServiceLocationMap` wherever it renders (§20/§22c). D-5: the
 * canvas draws the whole located footprint (sibling pins, labeled); D-1/D-6: every fix/open
 * affordance is a REAL link into the listing's own Logistics step.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Pencil, TrendingUp, AlertTriangle } from "lucide-react";
import { ServiceLocationMap, type ServiceRouteStopView } from "@/components/service-location-map";
import { parseStoredPoint, type LocationPoint } from "@/components/backoffice/location-point-picker";
import { isClassifiable, isPlaceAnchored } from "@shared/service-fundamentals";
import { CANCELLATION_POLICY_TYPE_LABELS } from "@shared/schema";
// Lane M3: the traveler page's OWN formatters. Importing them is the point — see travelerFacts.
import {
  formatHours,
  formatMinutes,
  formatPartySize,
  formatStartWindow,
  formatTransportProvision,
  formatResponseWindow,
  formatWeeklyPattern,
  resolveDepositPreview,
  hasDepositTerms,
  type WeeklyPatternLike,
} from "@/lib/service-good-to-know";
import { isPropertyEditorShape, propertyEditorHref } from "@/lib/property-editor-link";

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
  // FP-3 fix-door routing: a property_room row's editor needs its parent property's id.
  parentServiceId?: string | null;
  // Lane console-preview-state (ledger 2026-08-23-console-preview-state): the lifecycle the
  // "What the traveler sees" card must state, so a just-published (submitted) listing is never
  // shown as if a traveler can already read it. All three already ride the unfiltered owner read.
  approvalStatus?: string | null;
  status?: string | null;
  editReviewStatus?: string | null;
  // Lane M (D-3/D-4): classifies rows that HAPPEN NOWHERE (remote/artifact) so they are never
  // counted as "missing" a pin — shared predicate, same vocabulary as the wizard and storefront.
  deliveryMethod?: string | null;

  // Lane M2 (gap #13, "Render it, or stop collecting it") — the flow's own answers, read back as
  // the traveler reads them. EVERY field here is optional and NULL means "the provider never told
  // us": an absent answer is omitted from the read-out with a count, never defaulted into a claim
  // the provider did not make (§13). Nothing on this surface writes any of them.
  price?: string | number | null;
  whatToBring?: string | null;
  accessNotes?: string | null;
  partySizeMin?: number | null;
  partySizeMax?: number | null;
  leadTimeHours?: number | null;
  changeCutoffHours?: number | null;
  bufferMinutes?: number | null;
  cancellationPolicyType?: string | null;
  earliestStartTime?: string | null;
  latestStartTime?: string | null;
  serviceTimezone?: string | null;
  durationMinutes?: number | null;
  deliveryLanguages?: string[] | null;
  transportProvision?: string | null;
  responseWindowHours?: number | null;
  scopeStatement?: string | null;
  depositEnabled?: boolean | null;
  depositType?: string | null;
  depositPercentage?: number | null;
  depositFlatAmount?: string | number | null;
  pickupAvailable?: boolean | null;
  pickupAddress?: string | null;
  dropOffPoint?: string | null;
  surchargeMode?: string | null;
  surchargeFlatAmount?: string | number | null;
  surchargePerKm?: string | number | null;
  surchargeMaxKm?: number | null;
}

// Lane M (D-4): the honest per-row reason for a listing that happens nowhere — same wording
// family as the mock ("PDF guide — it happens nowhere"). Keyed by the canonical 7 minus the
// two place-anchored methods.
const HAPPENS_NOWHERE_LABEL: Record<string, string> = {
  pdf: "PDF guide",
  video: "Video call",
  call: "Phone call",
  voice_notes: "Voice notes",
  async_messaging: "Messaging",
};

// D-7: a row with a blank name still needs a readable identity on every list and label.
function displayName(s: { serviceName?: string | null }): string {
  return s.serviceName?.trim() ? s.serviceName : "Untitled service";
}

// D-8: humanize a raw category key (tour_guide → "Tour guide") — presentation only.
function humanizeKey(key: string): string {
  const words = key.split(/[_-]+/).filter(Boolean);
  if (words.length === 0) return key;
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

interface RoutePointRow {
  id: string;
  position: number;
  name: string;
  latitude: string | null;
  longitude: string | null;
}

// ── The ratified mock's own tokens (docs/design/provider-console-mockup/mockup.html :root) ────────
// Lane M2 exists because the shipped surface used the console's neutral greys where the mock uses
// its amber "read this" family — the read-only posture did not READ as a callout. Kept as literals
// beside the console palette already used throughout this file.
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";
const INK = "#1A1A18";
const MUTED = "#7A7A72";
const HAIR = "#E8E8E2";
const ACCENT = "#35605A";

/** The mock's `.notice` — the amber callout, not a grey strip. */
function Notice({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      className="rounded-md border px-3.5 py-2.5 text-[12.5px] leading-[1.5]"
      style={{ background: WARN_BG, borderColor: WARN_LINE, color: WARN_INK }}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/** The mock's `.capline` — the small grey line that sits UNDER the thing it describes. */
function CapLine({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="text-[11.5px] leading-[1.55] mt-2" style={{ color: MUTED }} data-testid={testId}>
      {children}
    </p>
  );
}

/** The mock's `h5.grouplabel`. */
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <h5 className="text-[11px] tracking-[0.07em] uppercase font-semibold mb-2.5" style={{ color: MUTED }}>
      {children}
    </h5>
  );
}

/** The mock's `.stop` row: position chip · name · flag · action. Used by both off-map lists. */
function StopRow({
  pos,
  name,
  flag,
  reason,
  action,
  testId,
}: {
  pos?: ReactNode;
  name: string;
  flag?: string;
  reason?: string;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="flex items-center gap-[11px] flex-wrap px-3 py-2.5 text-[13px] border-b last:border-b-0"
      style={{ borderColor: HAIR }}
      data-testid={testId}
    >
      <span
        className="w-5 h-5 flex-none rounded-full border flex items-center justify-center text-[11px]"
        style={{ background: WARN_BG, borderColor: WARN_LINE, color: WARN_INK }}
      >
        {pos ?? "–"}
      </span>
      <span className="flex-1 min-w-[150px] truncate" style={{ color: INK }}>
        {name}
      </span>
      {flag && (
        <span
          className="text-[11.5px] rounded-full border px-2 py-px"
          style={{ background: WARN_BG, borderColor: WARN_LINE, color: "#8A6A22" }}
        >
          {flag}
        </span>
      )}
      {reason && (
        <span className="text-[11.5px]" style={{ color: MUTED }}>
          {reason}
        </span>
      )}
      {action}
    </div>
  );
}

/** The mock's `.stops` container. */
function StopList({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="rounded-md border overflow-hidden" style={{ borderColor: HAIR }} data-testid={testId}>
      {children}
    </div>
  );
}

/** The mock's `.tcard` — head / body / foot, used by the "What the traveler sees" strip. */
function TCard({
  title,
  children,
  footer,
  testId,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="bg-white border rounded-[7px] overflow-hidden flex flex-col"
      style={{ borderColor: HAIR }}
      data-testid={testId}
    >
      <div className="px-3.5 py-2.5 border-b text-[12.5px] font-semibold" style={{ borderColor: HAIR, color: INK }}>
        {title}
      </div>
      <div className="p-3.5 flex-1">{children}</div>
      <div className="px-3.5 pb-3.5 text-[11.5px] leading-[1.55]" style={{ color: MUTED }}>
        {footer}
      </div>
    </div>
  );
}

/** The mock's `.sumrow` — the traveler-facing key/value read-out (gap #13). */
function SumRow({ k, v, testId }: { k: string; v: ReactNode; testId?: string }) {
  return (
    <div
      className="flex gap-3.5 flex-wrap py-2.5 border-b last:border-b-0 text-[13px]"
      style={{ borderColor: HAIR }}
      data-testid={testId}
    >
      <div className="w-[180px] flex-none" style={{ color: MUTED }}>
        {k}
      </div>
      <div className="flex-1 min-w-[200px]" style={{ color: INK }}>
        {v}
      </div>
    </div>
  );
}

/** The mock's `.pill`. */
function Pill({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-block text-[11.5px] px-2.5 py-0.5 rounded-full border"
      style={{ borderColor: HAIR, background: "#FAFAF8", color: MUTED }}
    >
      {children}
    </span>
  );
}

/** The mock's `.propchip` — "this is proposed, ratify or amend", not a shipped claim. */
function PropChip({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11.5px] font-medium rounded-full border px-2.5 py-0.5 whitespace-nowrap"
      style={{ background: WARN_BG, borderColor: WARN_LINE, color: WARN_INK }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: "#C79A3C" }} />
      {children}
    </span>
  );
}

/** The mock's `RatChip` — teal/ratified treatment for decisions that have been approved. */
function RatChip({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11.5px] font-medium rounded-full border px-2.5 py-0.5 whitespace-nowrap"
      style={{ background: "#EDF2F1", borderColor: "#CBDAD7", color: ACCENT }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: ACCENT }} />
      {children}
    </span>
  );
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

// Exported for reuse on the Market Research page (Partner Demand 3.1c.4) — the ruling-84 search-intent
// map layer, mounted there as a labeled registry layer (extend, never fork). Its OSM tiles, ODbL
// attribution, and neighborhood-centroid honesty ride the component unchanged.
export function MarketInsightsView() {
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
        {/* STEP 3.7 Part B (B2, §13): the map plots TWO substrates — search circles AND coverage-gap
            squares — so the honesty line names BOTH; a viewer never reads a gap square as a search.
            The window qualifier is dropped: the per-event searches are recent but the demand_signals
            rollup is an all-time aggregate, so "last 90 days" would over-claim for the mixed count. */}
        <span className="text-[13px] font-medium" style={{ color: "#1A1A18" }} data-testid="text-real-search-count">
          Based on {totalRealSearches} real search{totalRealSearches === 1 ? "" : "es"}
          {gaps.length > 0 ? ` · ${gaps.length} coverage gap${gaps.length === 1 ? "" : "s"}` : ""}
          {data.cities.length > 0 ? ` · ${data.cities.join(", ")}` : ""}
        </span>
        <span className="text-[11px]" style={{ color: "#7A7A72" }}>
          Real rows only — search circles + coverage-gap squares are different signals, never blended;
          thin signal shows "not enough signal yet", never invented heat.
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
                            {humanizeKey(g.categoryKey)}: {g.have} of {g.target} — {g.gap} more needed
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
                          {/* D-8: human words, not raw keys — presentation only, the key stays the id. */}
                          <span className="text-[11px] block text-muted-foreground">{humanizeKey(g.categoryKey)}</span>
                        </span>
                        <Badge variant="outline" className="border-amber-400 text-amber-700">
                          {g.have} of {g.target} · needs {g.gap} more
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

// ── gap #13, "Render it, or stop collecting it" ───────────────────────────────────────────────────
// THE RULE (mock legend ⑬): every answer the create flow collects either has a TRAVELER-SIDE
// representation, or an explicit decision that it is provider-only. Anything that is neither —
// collected, stored, shown to nobody — stops being asked for.
//
// NOT A PROPOSAL. The mock's "Proposed — ratify or amend" chip predates its own ratification:
// gap #13 was ratified by ledger row 92 (the mock in full, incl. "G5's #13 panel") and EXECUTED by
// lane T-REP, ledger row 101 — "RENDER chosen throughout, zero fields removed" — which built the
// traveler detail page's "Good to know" card and the pure module below.
//
// WHY THIS DELEGATES (lane M3). The first cut of this block re-implemented the same derivations
// with different wording, so a card captioned "What the traveler sees" showed words the traveler
// does NOT see ("1–8 people · you can book for up to 8" here vs "1–8 people" there; "24 hours
// before the start" vs formatHours' "1 day"). That is the class CLAUDE.md §18 rule 1 names —
// *derivation delegates, never re-implements* — and it is worse here than usual, because the whole
// claim of this card is that it is the traveler's view. Every value below now comes from
// `@/lib/service-good-to-know`, the SAME module `client/src/pages/service-detail.tsx` renders, in
// the same order and behind the same gates. If the traveler's wording changes, this changes with it.
//
// §13 THROUGHOUT: a field the provider never answered is OMITTED and counted, never defaulted into
// a claim ("no travel fee", "English", "up to 8 people" are all things a provider must have said).
//
// ALL NINE MOCK ROWS ARE NOW BACKED. Lane M2 named "Bring" and "Access" as the open half of the
// gap because neither had a column anywhere; migration 228 gave them one, the flow asks for them
// on Logistics, and they render here and on the traveler page like every other answer — omitted
// when unanswered (§13), never defaulted into "nothing needed".

interface TravelerFact {
  key: string;
  label: string;
  value: string;
}

/**
 * Lane console-preview-state (ledger 2026-08-23-console-preview-state): the card is captioned
 * "What the traveler sees" — so it must say WHETHER a traveler can see this listing at all right
 * now, and WHICH version. Public reads gate on approval_status='approved' AND status='active'
 * (F2 read gate), and the §23 edit-split keeps the approved version live while an identity edit
 * awaits review — so a card that renders the live row without this line would tell a
 * just-published (born-'submitted', migration 111) provider that travelers already read facts
 * nobody can see. `live` also drives whether the omitted-count copy frames itself as current.
 */
function travelerVisibility(s: {
  approvalStatus?: string | null;
  status?: string | null;
  editReviewStatus?: string | null;
}): { label: string; tone: "live" | "pending" | "hidden"; live: boolean } {
  if (s.approvalStatus !== "approved") {
    if (s.approvalStatus === "draft") {
      return { label: "Draft — not submitted yet, so travelers can't see this listing.", tone: "hidden", live: false };
    }
    if (s.approvalStatus === "rejected") {
      return { label: "Not approved — travelers can't see this listing.", tone: "hidden", live: false };
    }
    // submitted (born state, migration 111) or anything else non-approved.
    return { label: "In review — travelers can't see this listing until it's approved.", tone: "pending", live: false };
  }
  if (s.status !== "active") {
    return { label: "Paused — hidden from travelers right now.", tone: "hidden", live: false };
  }
  if (s.editReviewStatus === "pending") {
    return {
      label: "Live as approved — this is the version travelers see now; your pending edit is awaiting review and isn't shown here.",
      tone: "pending",
      live: true,
    };
  }
  return { label: "Live — this is the traveler's current view.", tone: "live", live: true };
}

/** The ordered fact list, resolved with the traveler page's own formatters. Mirrors the "Good to
 *  know" card's row set and gating; the labels are the mock's left column. */
function travelerFacts(
  s: CatalogMapService,
  patterns: WeeklyPatternLike[] | undefined,
): { facts: TravelerFact[]; omitted: string[] } {
  const facts: TravelerFact[] = [];
  const omitted: string[] = [];
  const add = (key: string, label: string, value: string | null) => {
    if (value) facts.push({ key, label, value });
    else omitted.push(label);
  };
  const positiveHours = (v: number | null | undefined) =>
    typeof v === "number" && v > 0 ? formatHours(v) : null;

  add("party", "Party size", formatPartySize(s.partySizeMin, s.partySizeMax));

  // The row that finishes the mock's "Starts" (lane M3). The weekly repeat rule lives in
  // `service_availability_patterns`, NOT on the listing row, so it arrives from its own owner read
  // — the same rhythm the traveler now sees on the public detail page.
  add("weekly", "Runs on", formatWeeklyPattern(patterns, s.serviceTimezone));
  add("startwindow", "Start window", formatStartWindow(s.earliestStartTime, s.latestStartTime, s.serviceTimezone));

  const lead = positiveHours(s.leadTimeHours);
  add("leadtime", "Book by", lead ? `Book at least ${lead} ahead` : null);
  const cutoff = positiveHours(s.changeCutoffHours);
  add("changecutoff", "Changes until", cutoff ? `Changes accepted up to ${cutoff} before the start` : null);

  const duration = typeof s.durationMinutes === "number" && s.durationMinutes > 0 ? formatMinutes(s.durationMinutes) : null;
  add("duration", "Duration", duration);
  const buffer = typeof s.bufferMinutes === "number" && s.bufferMinutes > 0 ? formatMinutes(s.bufferMinutes) : null;
  add("buffer", "Buffer", buffer ? `${buffer} kept free around each booking` : null);

  add(
    "cancellation",
    "Free cancellation until",
    s.cancellationPolicyType && s.cancellationPolicyType in CANCELLATION_POLICY_TYPE_LABELS
      ? CANCELLATION_POLICY_TYPE_LABELS[s.cancellationPolicyType as keyof typeof CANCELLATION_POLICY_TYPE_LABELS]
      : null,
  );

  const langs = Array.isArray(s.deliveryLanguages) ? s.deliveryLanguages.filter(Boolean) : [];
  add("languages", "Languages", langs.length > 0 ? langs.join(" · ") : null);

  add(
    "gettingthere",
    "Getting there",
    s.pickupAvailable && s.pickupAddress
      ? `Your host collects you — ${s.pickupAddress}`
      : s.pickupAvailable
        ? "Your host collects you and drops you back"
        : s.meetingPoint
          ? `Make your own way to ${s.meetingPoint}`
          : null,
  );
  add("dropoff", "Getting back", s.dropOffPoint ? s.dropOffPoint : null);
  add("transport", "Transport", formatTransportProvision(s.transportProvision));
  // Gap #13's last two rows — backed by columns as of migration 228, so they are ordinary facts
  // here now, not the named-and-unfaked hole they were in lane M2.
  add("bring", "Bring", (s.whatToBring ?? "").trim() || null);
  add("access", "Access", (s.accessNotes ?? "").trim() || null);

  // Deposit: the SAME display-only preview the traveler reads, with the page's own fallback for a
  // percentage deposit on a listing with no price yet. Never a second source of truth — checkout
  // re-derives the real charge server-side (§14).
  const priceNum = Number(s.price ?? 0);
  const deposit = hasDepositTerms(s)
    ? resolveDepositPreview(s, (n) => `$${n.toFixed(2)}`, Number.isFinite(priceNum) ? priceNum : 0) ??
      "Deposit required — details at checkout"
    : null;
  add("deposit", "Deposit", deposit);

  // Async lane (S9): both are ordinary public pre-purchase facts on the traveler page.
  add("responsewindow", "Response time", formatResponseWindow(s.responseWindowHours));
  add("scope", "What's covered", (s.scopeStatement ?? "").trim() || null);

  // Travel fee. `surchargeMode` DEFAULTs 'none' at the column, and 'none' is server-enforced as
  // "no surcharge, ever" (ruling 81) — so it is a real answer, not an absent one.
  const radius = toNum(s.serviceRadius);
  const maxKm = s.surchargeMaxKm;
  const ceiling = maxKm != null && maxKm > 0 ? ` The host does not travel beyond ${maxKm} km.` : "";
  const mode = s.surchargeMode ?? "none";
  let fee: string | null = null;
  if (mode === "none") {
    fee = `No travel fee — the host does not add one.${ceiling}`;
  } else if (mode === "flat" && toNum(s.surchargeFlatAmount) != null) {
    fee = radius
      ? `None within ${radius} km of the meeting point. Beyond that, $${toNum(s.surchargeFlatAmount)} may apply.${ceiling}`
      : `A flat $${toNum(s.surchargeFlatAmount)} travel fee may apply — the host will confirm.${ceiling}`;
  } else if (mode === "per_km" && toNum(s.surchargePerKm) != null) {
    fee = `$${toNum(s.surchargePerKm)} per km beyond${radius ? ` ${radius} km of` : ""} the meeting point, measured straight-line.${ceiling}`;
  } else if (mode === "zones") {
    fee = `Zone-based beyond${radius ? ` ${radius} km of` : ""} the meeting point — the host's own zones apply.${ceiling}`;
  }
  add("travelfee", "Travel fee", fee);

  return { facts, omitted };
}

export function CatalogMapView({
  services,
  filterLabel = null,
}: {
  services: CatalogMapService[];
  /** M-13: names the Catalog toolbar's active search/status filter, so a filtered coverage count
   *  is never rendered as if it described the whole catalog. NULL = no filter (the normal case). */
  filterLabel?: string | null;
}) {
  // Sibling toggle (ruling 84): the per-service map preview vs market insights (demand + gaps).
  // A separate axis from List/Map and Manage/Preview — those are untouched.
  const [insightsMode, setInsightsMode] = useState(false);
  const mappable = services.filter((s) => s.productShape !== "bundle");
  const [selectedId, setSelectedId] = useState<string | null>(mappable[0]?.id ?? null);
  const selected = mappable.find((s) => s.id === selectedId) ?? null;

  // M-13: the toolbar filter can remove the selected listing from the set under us. Fall back to
  // the first row that IS in the set rather than leaving the per-listing sections reading a
  // listing that is no longer on the canvas.
  const firstMappableId = mappable[0]?.id ?? null;
  useEffect(() => {
    if (selectedId !== null && mappable.some((s) => s.id === selectedId)) return;
    setSelectedId(firstMappableId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, firstMappableId, mappable.length]);

  // Ruling 112 Q3: the selected listing's surcharge zones (ruling 81 rows) render as
  // display-only rings on the read-only canvas — same layer the Logistics step draws.
  const { data: zoneTierState } = useQuery<{ surchargeTiers: Array<{ radiusKm: string; fee: string }> }>({
    queryKey: [`/api/provider/services/${selectedId}/surcharge-tiers`],
    enabled: !!selectedId,
  });

  // C4 (ruling 74): honest provider-wide coverage. A service is "located" iff its OWN row
  // carries confirmed coordinates (the same `parseStoredPoint` the left rail and the single-
  // service canvas use) — never inferred from a delivery method or a city string.
  // Lane M (D-3, mock conformance Aug 15): the count is over PLACE-ANCHORED listings only. A
  // remote/artifact listing happens nowhere — that is a real answer, not a missing pin — so it
  // is neither counted as missing nor asked to "add a pin" (§13 vocabulary fix). A row that
  // can't be classified (no deliveryMethod, no property shape) stays in the place-anchored
  // bucket rather than being silently excused (the fundamentals module's own posture).
  const locatedServices = mappable.filter((s) => parseStoredPoint(s.latitude, s.longitude) !== null);
  const placeAnchored = mappable.filter(
    (s) =>
      !isClassifiable({ deliveryMethod: s.deliveryMethod, productShape: s.productShape }) ||
      isPlaceAnchored({ deliveryMethod: s.deliveryMethod, productShape: s.productShape }),
  );
  const placeAnchoredLocated = placeAnchored.filter((s) => parseStoredPoint(s.latitude, s.longitude) !== null);
  // D-4: two DIFFERENT kinds of "not on the map", each named with its true reason.
  const pinMissing = placeAnchored.filter((s) => parseStoredPoint(s.latitude, s.longitude) === null);
  const happensNowhere = mappable.filter(
    (s) =>
      isClassifiable({ deliveryMethod: s.deliveryMethod, productShape: s.productShape }) &&
      !isPlaceAnchored({ deliveryMethod: s.deliveryMethod, productShape: s.productShape }) &&
      parseStoredPoint(s.latitude, s.longitude) === null,
  );

  // Owner single-service read (ruling 22: routePoints ride this response). READ ONLY — the stops
  // below are rendered from this response and edited nowhere on this surface.
  const { data: detail } = useQuery<{ routePoints?: RoutePointRow[] } | undefined>({
    queryKey: [`/api/provider/services/${selectedId}`],
    enabled: !!selectedId,
  });

  // Lane M3 — the weekly repeat rule, for gap #13's "Starts" row. It lives in
  // `service_availability_patterns`, a CHILD table, so it is not on the listing row this view is
  // handed; this is the owner read of the same rows the traveler now sees on the public detail
  // page. Absent/empty ⇒ the listing declares no weekly rhythm and the row is omitted (§13).
  const { data: patternRows } = useQuery<WeeklyPatternLike[]>({
    queryKey: [`/api/provider/services/${selectedId}/availability-patterns`],
    enabled: !!selectedId,
  });

  const pin: LocationPoint | null = selected ? parseStoredPoint(selected.latitude, selected.longitude) : null;

  // Lane M (D-5): the footprint — every OTHER located listing rides the same canvas as a
  // labeled sibling pin, so the preview shows where the whole catalog happens, not one listing
  // at a time. Clicking a sibling selects it (same as the left rail).
  const siblingPinData = locatedServices
    .filter((s) => s.id !== selectedId)
    .map((s) => {
      const p = parseStoredPoint(s.latitude, s.longitude)!;
      return { id: s.id, lat: p.lat, lng: p.lng, label: displayName(s) };
    });

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

  /** The one door to authoring THIS row's location — SHAPE-AWARE (FP-3). A service row's door
   *  is the flow's step 4 (same door the draft checklist uses). A property/room row's door is
   *  the Workstation property editor: its `/edit` route renders only the "Properties are edited
   *  in the Workstation" guard, so sending it to `?step=logistics` was a dead end (the bug the
   *  decision-maker hit clicking a property's "Fix it in step 4 →" after Lane M shipped). One
   *  shared resolver (`propertyEditorHref`) so this view and Catalog's cards can never disagree. */
  const authoringDoor = (s: CatalogMapService) => {
    const propHref = propertyEditorHref(s);
    if (propHref) {
      return { href: propHref, fixLabel: "Fix it in the Workstation →", isProperty: true };
    }
    return { href: `/provider/services/${s.id}/edit?step=logistics`, fixLabel: "Fix it in step 4 →", isProperty: false };
  };


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
            {filterLabel ? (
              <>No listing matches {filterLabel} — clear the filter to see the whole map.</>
            ) : (
              <>
                No mappable services yet — create a service first. You place it on the map inside
                the create flow, on its Logistics step.
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }


  // ── Lane M2 derived state (mock conformance round 2) ───────────────────────────────────────────
  const door = selected ? authoringDoor(selected) : null;
  const radiusKm = toNum(selected?.serviceRadius);
  const unlocatedStops = stops.filter((s) => s.lat === null || s.lng === null);
  const { facts, omitted } = selected
    ? travelerFacts(selected, patternRows)
    : { facts: [], omitted: [] as string[] };

  return (
    <div className="space-y-5" data-testid="catalog-map-preview">
      {toggleBar}

      {/* ── The read-only posture, in the mock's OWN callout treatment (M-2/M-3) ─────────────────
          Lane M stated the posture but rendered it as a neutral grey strip and dropped the mock's
          second sentence. Both are back: the amber `.notice`, and the sentence that records this
          placement as an AMENDMENT of ruling 22(b) rather than a silent contradiction of it. */}
      <Notice testId="catalog-map-readonly-notice">
        <b className="font-semibold">Traveler preview — read-only.</b> This is what a traveler sees.{" "}
        {selected && isPropertyEditorShape(selected.productShape)
          ? "This property's location is authored in the Workstation property editor"
          : 'Pins, radius, zones and route stops are authored in the create flow\'s step 4, "Logistics"'}
        {selected && door ? (
          <>
            {" — "}
            <a
              href={door.href}
              className="underline underline-offset-2 font-medium"
              style={{ color: ACCENT }}
              data-testid="link-open-logistics"
            >
              open it →
            </a>
          </>
        ) : (
          "."
        )}
        <span className="block mt-1.5">
          This placement <b className="font-semibold">amends</b> the earlier “Catalog is the map's
          authoring home” posture: Catalog keeps the preview, the flow owns the authoring.
        </span>
      </Notice>

      {/* ── ONE full-width canvas (M-1) ────────────────────────────────────────────────────────
          The mock's map mode is a single card: the canvas, the coverage caption UNDER it, and the
          "Not located" group inside the same card. The shipped 240px/canvas/320px grid was the
          divergence the decision-maker saw first — the rails are gone; everything they carried is
          below, where the mock puts it. */}
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <ServiceLocationMap
            pin={pin}
            pinLabel={selected ? displayName(selected) : null}
            radiusKm={radiusKm}
            surchargeZones={(zoneTierState?.surchargeTiers ?? []).map((t) => ({ radiusKm: Number(t.radiusKm), fee: t.fee }))}
            stops={stops}
            height={300}
            testIdPrefix="catalog-map-canvas"
            siblingPins={siblingPinData}
            onSiblingPinClick={setSelectedId}
            labelPins
          />
          {!pin && locatedCount === 0 && siblingPinData.length === 0 && (
            <div
              className="mt-3 rounded-md border border-dashed py-12 text-center"
              style={{ borderColor: HAIR, background: "#FAFAF8" }}
              data-testid="catalog-map-empty"
            >
              <MapPin className="w-6 h-6 mx-auto mb-2 opacity-40" />
              <p className="text-[13px] font-semibold" style={{ color: INK }}>
                Nothing to draw yet
              </p>
              <p className="text-[11.5px] mt-1 px-6" style={{ color: MUTED }}>
                No listing of yours has a confirmed location — nothing is guessed onto the map. Pins
                are placed in the create flow, on the Logistics step.
              </p>
            </div>
          )}

          {/* M-4: the mock's caption sits UNDER the canvas and carries all three sentences —
              the count, the remote/artifact rule, and the read-only rule — as one line. */}
          <CapLine testId="catalog-map-located-summary">
            <b style={{ color: INK }} data-testid="text-located-count">
              {placeAnchoredLocated.length} of {placeAnchored.length} place-anchored listing
              {placeAnchored.length === 1 ? "" : "s"} located
              {filterLabel ? ` — showing ${filterLabel} only` : ""}.
            </b>{" "}
            Remote and artifact listings are not counted as missing — they happen nowhere, and that
            is a real answer. Nothing here can be dragged, armed or placed: to change a location you
            go back to the flow's Logistics step.
          </CapLine>
          {stops.length > 0 && (
            <CapLine testId="catalog-map-coverage">
              {selected ? `${displayName(selected)}: ` : ""}
              {locatedCount} of {stops.length} stops located
              {locatedCount < stops.length ? " — unlocated stops stay listed but are never drawn." : "."}
            </CapLine>
          )}
        </CardContent>

        {/* M-5/M-6: the "Not located" group, inside the SAME card, as the mock's `.stop` rows —
            and present even when empty, because "every place-anchored listing has a confirmed
            pin" is an answer worth reading, not an absence worth hiding. */}
        <CardContent className="px-5 pb-5 pt-0">
          <GroupLabel>Not located</GroupLabel>
          <StopList testId="catalog-map-not-located">
            {pinMissing.length === 0 && happensNowhere.length === 0 && (
              <div className="px-3 py-2.5 text-[12.5px]" style={{ color: MUTED }} data-testid="catalog-map-all-located">
                Every place-anchored listing has a confirmed pin.
              </div>
            )}
            {pinMissing.map((s) => (
              <StopRow
                key={s.id}
                name={displayName(s)}
                flag="no confirmed pin — not drawn"
                testId={`not-located-${s.id}`}
                action={
                  <a
                    href={authoringDoor(s).href}
                    className="text-[12px] font-medium underline underline-offset-2"
                    style={{ color: ACCENT }}
                    data-testid={`link-fix-step4-${s.id}`}
                  >
                    {authoringDoor(s).fixLabel}
                  </a>
                }
              />
            ))}
            {happensNowhere.map((s) => (
              <StopRow
                key={s.id}
                name={displayName(s)}
                reason={`${(s.deliveryMethod && HAPPENS_NOWHERE_LABEL[s.deliveryMethod]) || "Remote"} — it happens nowhere`}
                testId={`not-located-${s.id}`}
              />
            ))}
          </StopList>
          <CapLine>
            A listing with no coordinates is named here and left off the canvas. Never a city-center
            fallback, never another listing's shapes standing in for this one.
          </CapLine>
        </CardContent>
      </Card>

      {/* ── Which listing the sections below are reading ──────────────────────────────────────
          The mock has no rail because its canvas is a static drawing; a real catalog still needs
          to say WHICH listing the per-listing read-outs describe. A compact wrapping chip row
          replaces the old 240px column — same `map-view-select-*` doors, a fraction of the height,
          and the canvas keeps the full width the mock gives it. */}
      <div data-testid="map-view-service-rail">
        <GroupLabel>Previewing</GroupLabel>
        <div className="flex flex-wrap gap-1.5">
          {mappable.map((s) => {
            const hasPin = parseStoredPoint(s.latitude, s.longitude) !== null;
            const exact = hasPin && s.locationPrecision === "exact";
            const active = s.id === selectedId;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                data-testid={`map-view-select-${s.id}`}
                className={`rounded-full border px-3 py-1.5 text-[12.5px] transition-colors max-w-full ${
                  active ? "border-[#CBDAD7] bg-[#EDF2F1]" : "border-[#E8E8E2] hover:bg-[#F3F3EE]"
                }`}
              >
                <span className="font-medium" style={{ color: INK }}>
                  {displayName(s)}
                </span>
                <span className="ml-1.5" style={{ color: exact ? "#3D7A46" : hasPin ? "#9A6B1F" : "#A54242" }}>
                  {exact ? "· exact pin" : hasPin ? "· approximate" : "· no location"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── ⑪ What the traveler sees (M-7) ────────────────────────────────────────────────────
          The mock's three-card strip, teaching the three rendering rules. The mock draws them as
          illustrations; here each card renders the SELECTED listing's real state, so the rule is
          demonstrated on the provider's own data and can never drift from it. Where the listing
          is not in that state, the card says so (§13) instead of drawing a specimen. */}
      <div>
        <h3 className="text-[18px] font-semibold tracking-[-0.01em]" style={{ color: INK }}>
          What the traveler sees
        </h3>
        <p className="text-[13px] mt-1 mb-3.5 max-w-[74ch]" style={{ color: MUTED }}>
          The traveler map renders what is actually known and nothing else. Never a city-center
          fallback.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1 — confirmed pin + radius */}
          <TCard
            title="Confirmed pin + radius"
            testId="tcard-pin-radius"
            footer={
              <>
                {pin ? (
                  <>
                    {selected?.meetingPoint
                      ? `Meeting point: ${selected.meetingPoint}.`
                      : selected?.location && selected.location !== "Unknown"
                        ? `Meeting point in ${selected.location}.`
                        : "Meeting point confirmed."}
                    {radiusKm ? ` Host travels free up to ${radiusKm} km.` : " No service radius set."}
                  </>
                ) : (
                  <>{displayName(selected ?? { serviceName: "" })} has no confirmed pin, so this state is not drawn for it.</>
                )}
                <span className="block mt-1.5" style={{ color: WARN_INK }}>
                  Whether the traveler sees the exact pin or a fuzzed neighbourhood point is a{" "}
                  <b>spec decision, not a shipped behaviour</b> (spec gap #13). This canvas draws the
                  authored point as-is — no precision rule is implied.
                </span>
              </>
            }
          >
            {pin ? (
              <ServiceLocationMap
                pin={pin}
                pinLabel={selected ? displayName(selected) : null}
                radiusKm={radiusKm}
                height={132}
                testIdPrefix="tcard-pin-canvas"
              />
            ) : (
              <div
                className="rounded-md border border-dashed h-[132px] flex flex-col items-center justify-center text-center gap-1 px-4"
                style={{ borderColor: HAIR, background: "#FAFAF8" }}
                data-testid="tcard-pin-empty"
              >
                <b className="text-[13px]" style={{ color: INK }}>
                  Not in this state
                </b>
                <span className="text-[11.5px]" style={{ color: MUTED }}>
                  Pick a listing with a confirmed pin to see it drawn.
                </span>
              </div>
            )}
          </TCard>

          {/* 2 — route service, partly located */}
          <TCard
            title="Route service — partly located"
            testId="tcard-route"
            footer={
              stops.length > 0 ? (
                <>
                  <b style={{ color: INK }}>
                    {locatedCount} of {stops.length} stops located.
                  </b>{" "}
                  Only the stops with coordinates are drawn. The others are named above — not
                  dropped, and not guessed onto the map.
                </>
              ) : (
                <>
                  {displayName(selected ?? { serviceName: "" })} has no route stops. The places a
                  service visits are added on its Logistics step; an unlocated stop would be named
                  here and left off the canvas.
                </>
              )
            }
          >
            {stops.length > 0 ? (
              <>
                {locatedCount > 0 ? (
                  <ServiceLocationMap pin={pin} radiusKm={null} stops={stops} height={132} testIdPrefix="tcard-route-canvas" />
                ) : (
                  <div
                    className="rounded-md border border-dashed h-[132px] flex items-center justify-center text-center px-4 text-[11.5px]"
                    style={{ borderColor: HAIR, background: "#FAFAF8", color: MUTED }}
                    data-testid="tcard-route-nodraw"
                  >
                    No stop has coordinates yet — nothing is drawn, and nothing is guessed.
                  </div>
                )}
                {unlocatedStops.length > 0 && (
                  <div className="mt-2.5">
                    <StopList testId="tcard-route-unlocated">
                      {unlocatedStops.map((s) => (
                        <StopRow key={s.id} name={s.name} flag="not located" testId={`tcard-route-stop-${s.position}`} />
                      ))}
                    </StopList>
                  </div>
                )}
              </>
            ) : (
              <div
                className="rounded-md border border-dashed h-[132px] flex flex-col items-center justify-center text-center gap-1 px-4"
                style={{ borderColor: HAIR, background: "#FAFAF8" }}
                data-testid="tcard-route-empty"
              >
                <b className="text-[13px]" style={{ color: INK }}>
                  No stops saved
                </b>
                <span className="text-[11.5px]" style={{ color: MUTED }}>
                  A route is authored on the listing's Logistics step.
                </span>
              </div>
            )}
          </TCard>

          {/* 3 — no coordinates, no map */}
          <TCard
            title="No coordinates — no map"
            testId="tcard-nomap"
            footer={
              <>
                No map renders at all. Never a city-center fallback, never another listing's shapes
                standing in for this one.
                <span className="block mt-1.5" style={{ color: INK }}>
                  {pinMissing.length === 0
                    ? "None of your place-anchored listings is in this state right now."
                    : `${pinMissing.length} of your place-anchored listing${pinMissing.length === 1 ? "" : "s"} render${pinMissing.length === 1 ? "s" : ""} this way today.`}
                </span>
              </>
            }
          >
            <div
              className="rounded-md border border-dashed h-[132px] flex flex-col items-center justify-center text-center gap-1 px-4"
              style={{ borderColor: HAIR, background: "#FAFAF8" }}
              data-testid="tcard-nomap-panel"
            >
              <b className="text-[13px]" style={{ color: INK }}>
                Location shared after booking
              </b>
              <span className="text-[11.5px] leading-[1.5]" style={{ color: MUTED }}>
                This host has not pinned a location yet.
                <br />
                We would rather show nothing than guess one.
              </span>
            </div>
          </TCard>
        </div>
      </div>

      {/* ── ⑫ the market-insight overlays are a SEPARATE, UNDECIDED question (M-8) ───────────────
          Ruling 84 shipped the Map preview ⇄ Market insights toggle at the top of this surface;
          the mock flags that placement as analytics-not-authoring and proposes moving it to
          Performance. Neither this lane nor Lane M decided that — and an undecided question that
          nobody can see is the way it gets decided by accident. So it is stated, here, beside the
          toggle it is about. Nothing is moved. */}
      <div className="rounded-[7px] border border-dashed bg-white p-5" style={{ borderColor: HAIR }} data-testid="map-insights-placement-note">
        <div className="flex gap-3 items-start">
          <span
            className="mt-0.5 w-[17px] h-[17px] flex-none rounded-full border text-[11px] flex items-center justify-center font-semibold"
            style={{ background: "#EDF2F1", borderColor: "#CBDAD7", color: ACCENT }}
          >
            ⑫
          </span>
          <div>
            <div className="text-[14px] font-semibold mb-1.5" style={{ color: INK }}>
              Separate decision — the market-insight overlays
            </div>
            <div className="text-[12.5px] leading-[1.6]" style={{ color: MUTED }}>
              Demand heat and coverage-gap overlays are <b style={{ color: INK }}>analytics, not authoring</b> —
              they tell you where to sell, not where your listing is. They are proposed to move to
              Performance, where the rest of the measurement lives.{" "}
              <b style={{ color: INK }}>That move is not part of this approval</b> — flagged here so
              it is not decided by accident.
            </div>
          </div>
        </div>
      </div>

      {/* ── ⑬ Render it, or stop collecting it (M-9) ──────────────────────────────────────────
          The mock's proposed rule, rendered against the SELECTED listing's real answers. Two
          honesty rules hold: an answer the provider never gave is omitted and counted (never
          defaulted into a claim), and the two mock rows with no column behind them are named as
          the open half of the gap rather than invented. */}
      {selected && (
        <section data-testid="render-it-section">
          <h3 className="text-[18px] font-semibold tracking-[-0.01em] flex items-center gap-2.5 flex-wrap" style={{ color: INK }}>
            Render it, or stop collecting it
            <RatChip>Ratified — gap #13 · rendered, T-REP (ledger 101)</RatChip>
          </h3>
          <p className="text-[13px] mt-1 mb-3.5 max-w-[74ch]" style={{ color: MUTED }}>
            The rule: every answer the create flow collects either has a traveler-side
            representation, or an explicit decision that it is provider-only. These are this
            listing's real answers, resolved with the same formatters the traveler's own page
            uses — not a paraphrase of them.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <Card>
              <CardHeader className="py-3.5 px-5 border-b" style={{ borderColor: HAIR }}>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <CardTitle className="text-[15px] font-semibold">What the traveler sees</CardTitle>
                  <span className="ml-auto text-[12px]" style={{ color: MUTED }}>
                    {displayName(selected)}
                  </span>
                </div>
                {(() => {
                  const vis = travelerVisibility(selected);
                  const dot = vis.tone === "live" ? "#15803D" : vis.tone === "pending" ? "#B45309" : MUTED;
                  return (
                    <div className="flex items-start gap-2 mt-2" data-testid="traveler-visibility">
                      <span className="mt-[5px] h-2 w-2 rounded-full flex-none" style={{ background: dot }} aria-hidden="true" />
                      <span className="text-[12px] leading-[1.5]" style={{ color: vis.tone === "live" ? INK : MUTED }}>
                        {vis.label}
                      </span>
                    </div>
                  );
                })()}
              </CardHeader>
              <CardContent className="px-5 py-1.5">
                {facts.length === 0 ? (
                  <p className="text-[12.5px] py-4" style={{ color: MUTED }} data-testid="traveler-facts-empty">
                    This listing has none of these answers stored yet — so a traveler reads none of
                    them. Nothing is filled in on the provider's behalf.
                  </p>
                ) : (
                  facts.map((f) => <SumRow key={f.key} k={f.label} v={f.value} testId={`traveler-fact-${f.key}`} />)
                )}
              </CardContent>
              {omitted.length > 0 && (
                <CardContent className="px-5 pb-4 pt-0">
                  <p className="text-[11.5px] leading-[1.55]" style={{ color: MUTED }} data-testid="traveler-facts-omitted">
                    <b style={{ color: INK }}>
                      {omitted.length} question{omitted.length === 1 ? "" : "s"} unanswered
                    </b>{" "}
                    — {omitted.join(", ")}. Omitted rather than defaulted: a traveler is never shown
                    a claim the host did not make.
                  </p>
                </CardContent>
              )}
            </Card>

            <div className="flex flex-col gap-5">
              <Card>
                <CardContent className="p-5">
                  <div className="text-[14px] font-semibold mb-1.5" style={{ color: INK }}>
                    The rule this demonstrates
                  </div>
                  <div className="text-[12.5px] leading-[1.6]" style={{ color: MUTED }}>
                    Every question the flow asks is something a traveler can read before paying.
                    Where a field has no traveler-side home, the rule is to{" "}
                    <b style={{ color: INK }}>stop asking for it</b> rather than store an answer
                    nobody will ever see. T-REP chose <b style={{ color: INK }}>render</b> for
                    every field it audited — nothing was dropped.
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="text-[14px] font-semibold mb-1.5" style={{ color: INK }}>
                    Deliberately provider-only
                  </div>
                  <div className="text-[12.5px] leading-[1.6] mb-2.5" style={{ color: MUTED }}>
                    Not everything should surface. These stay{" "}
                    <b style={{ color: INK }}>private by decision</b>, not by accident:
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <Pill>Build notes</Pill>
                    <Pill>Exact street address until booked</Pill>
                    <Pill>Blackout reasons</Pill>
                    <Pill>Cost / margin working</Pill>
                  </div>
                </CardContent>
              </Card>

              {/* The two doors the retired right rail carried, kept where they belong: on the
                  listing whose answers are being read. Both are LINKS into the flow — this
                  surface still writes nothing. */}
              {door && (
                <Card data-testid="map-view-pin-card">
                  <CardContent className="p-5">
                    <div className="text-[14px] font-semibold mb-1.5" style={{ color: INK }}>
                      Meeting pin
                    </div>
                    <p className="text-[13px] mb-2.5" style={{ color: INK }} data-testid="text-pin-state">
                      {pin
                        ? selected.locationPrecision === "exact"
                          ? "Exact pin confirmed."
                          : "Approximate area — no exact pin confirmed yet."
                        : "No location yet."}
                    </p>
                    <Button asChild variant="outline" size="sm" className="w-full" data-testid="button-edit-location">
                      <a href={door.href}>
                        <Pencil className="w-3.5 h-3.5 mr-1.5" />
                        {pin ? "Edit location & route" : "Add a location"}
                      </a>
                    </Button>
                    <p className="text-[11.5px] mt-2" style={{ color: MUTED }}>
                      {door.isProperty ? (
                        <>
                          Opens the <b style={{ color: INK }}>Workstation property editor</b> — where
                          this property's details and location are authored.
                        </>
                      ) : (
                        <>
                          Opens this listing's <b style={{ color: INK }}>Logistics</b> step — the one
                          place the pin, the radius and the stops are authored.
                        </>
                      )}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
