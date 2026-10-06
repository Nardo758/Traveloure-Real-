/**
 * `MapControlCenter` — THE map (surface step 5; spec v1.2 §2.3; rulings R-b, R-d; ledger
 * `2026-10-04-surface-step5-map-versions`). One component, two LAYERS, versions as a toggle, two
 * RENDERERS:
 *
 *   · PLAN LAYER: the selected day's stops numbered in day order (located stops only — an area stop
 *     is listed under "Not on the map yet", never guessed onto the map), straight connectors in day
 *     order (routed legs with their minutes only when the travel-time service is on), the anchor
 *     marker always visible, neighbourhood shading while the AnchorPanel is open. Day chips above; a
 *     bottom sheet of the day's stops below, selection synced both ways.
 *   · BROWSE LAYER (toggle): listings and partner places around the plan with their own coordinates,
 *     as hollow teal markers; a card with "Add" writes `itinerary_items` (LD 39). Hosts have no
 *     coordinates, so they are a list in the sheet, never pins. "Find a host" opens this layer
 *     filtered to the item's category.
 *   · VERSIONS: with a run, a Draft / A / B / C toggle redraws the day — moved stops gold, dropped
 *     ones ghosted, the anchor moving with the version. A day matched by name says so.
 *   · RENDERERS (ruling 9): Google when a key is present and the script loads; Leaflet/OSM otherwise
 *     — automatic, once per page load, with "Map by OpenStreetMap". Both draw the SAME scene
 *     (`buildMapScene` → `sceneMarkers`), so they never disagree.
 *
 * This component owns the data; the renderers only draw. It fabricates no coordinate (§13).
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Layers, MapPin, MessageSquare, Plus } from "lucide-react";
import { SiApple, SiGoogle } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type PlanCardActivity, type PlanCardDay } from "./plancard-types";
import { getModeColor } from "@/lib/transport-modes";
import { openDayInMaps, addDayToCalendar } from "./day-map-actions";
import {
  buildMapScene,
  type BrowsePlace,
  type MapAnchor,
  type MapArea,
  type MapVersion,
} from "@/lib/map-scene";
import { MAP_FALLBACK_NOTICE, useMapRenderer } from "@/lib/map-renderer";
import {
  BROWSE_TABS,
  addedItemFor,
  applyBudget,
  browseAddBody,
  browseTabForCategory,
  hostRows,
  listingPlaces,
  partnerPlaces,
  placesInTab,
  searchPlaces,
  type BrowseTabKey,
} from "@/lib/browse-supply";
import { SceneMapGoogle } from "./map/SceneMapGoogle";
import { SceneMapLeaflet } from "./map/SceneMapLeaflet";
import type { SceneLeg } from "./map/scene-legs";
import { MAPS_BROWSER_KEY } from "@/lib/maps-browser-key";

const MAPS_API_KEY = MAPS_BROWSER_KEY;

/**
 * ONE located-pin predicate (§18 rule 1) — the pin layer, the view bar's count and the slip's
 * located/unlocated split all read it. A stop with no coordinates is simply not mapped (§13).
 */
export function isLocated(a: Pick<PlanCardActivity, "lat" | "lng">): boolean {
  return typeof a.lat === "number" && typeof a.lng === "number" && Number.isFinite(a.lat) && Number.isFinite(a.lng);
}

/** "X of Y located" for a day — reads the SAME predicate the pin layer reads. Null for no stops. */
export function locatedCountLabel(activities: readonly PlanCardActivity[] | undefined): string | null {
  const total = activities?.length ?? 0;
  if (total === 0) return null;
  const located = activities!.filter(isLocated).length;
  return `${located} of ${total} located`;
}

export interface MapControlCenterProps {
  tripId: string;
  tripDestination: string;
  days: PlanCardDay[];
  selectedDay: number;
  onSelectDay: (i: number) => void;
  /** §21: the TRAVELER-FACING trip-level note (`trips.expert_traveler_note`). */
  expertTravelerNote?: string | null;
  compact?: boolean;
  /** No Browse layer and no Add — a surface that shows a plan without changing it. */
  readOnly?: boolean;
  /** The plan's anchor (stay / reservation / venue) — always drawn when located. */
  anchor?: MapAnchor | null;
  /** Neighbourhood centroids; shaded while `showAreas` (the stay is located, or the AnchorPanel is
   *  open), emphasised while `emphasizeAreas` (the AnchorPanel is open). */
  areas?: MapArea[] | null;
  showAreas?: boolean;
  emphasizeAreas?: boolean;
  /** A run's versions: the Draft / A / B / C toggle. */
  versions?: MapVersion[] | null;
  /** Controlled Browse layer (e.g. "Find a host" opens it filtered to a category). */
  browse?: { open: boolean; categoryKey: string | null } | null;
  onBrowseChange?: (next: { open: boolean; categoryKey: string | null }) => void;
  /** Routed legs and their minutes — only when the travel-time service is on (R-h). */
  showTravelMinutes?: boolean;
  /** Controlled version toggle ("draft" or a version key) — the board keeps the map on its column. */
  versionKey?: string;
  onVersionChange?: (key: string) => void;
  /**
   * R322 (step 7a, R-bh): the Workstation's open Add-panel drawer — its own already-filtered,
   * already-located results (`useMapCandidates`). Drawn as hollow browse markers and rows, with the
   * SAME "Add to Day N" card the Browse layer uses; the add itself is the drawer's own handler
   * (`onAddCandidate`), which posts the existing item route for the selected day. No second add rail.
   */
  candidates?: { sourceLabel: string | null; items: ReadonlyArray<{ id: string; title: string; lat: number; lng: number; price?: string | null }> } | null;
  onAddCandidate?: (id: string, dayNumber: number) => void;
  /**
   * Step 8b-2 (ledger `2026-10-06-step8b2-map-layout`): the slip's map layout. `split` puts the map on
   * the left and a rail on the right that FOLLOWS THE SHOWN LAYER — Browse while Browse is on, the
   * shown day's "Your plan" stops otherwise (item 13). Every other mount keeps `stacked`, unchanged.
   */
  layout?: "stacked" | "split";
  /** The empty "Your plan" line (ruling 2): the slip's own reason text, shown while nothing is located. */
  planEmptyNote?: string | null;
}

export function MapControlCenter({
  tripId,
  tripDestination,
  days,
  selectedDay,
  onSelectDay,
  expertTravelerNote,
  compact = false,
  readOnly = false,
  anchor = null,
  areas = null,
  showAreas = false,
  emphasizeAreas = false,
  versions = null,
  browse: browseControlled = null,
  onBrowseChange,
  showTravelMinutes = false,
  versionKey: versionKeyControlled,
  onVersionChange,
  candidates = null,
  onAddCandidate,
  layout = "stacked",
  planEmptyNote = null,
}: MapControlCenterProps) {
  const { toast } = useToast();
  const [planLayer, setPlanLayer] = useState(true);
  const [browseLocal, setBrowseLocal] = useState<{ open: boolean; categoryKey: string | null }>({ open: false, categoryKey: null });
  const browseState = browseControlled ?? browseLocal;
  const setBrowse = (next: { open: boolean; categoryKey: string | null }) => {
    setBrowseLocal(next);
    onBrowseChange?.(next);
  };
  const browseOn = !readOnly && browseState.open;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedBrowseId, setSelectedBrowseId] = useState<string | null>(null);
  const [versionKeyLocal, setVersionKeyLocal] = useState<string>("draft");
  const versionKey = versionKeyControlled ?? versionKeyLocal;
  const setVersionKey = (k: string) => {
    setVersionKeyLocal(k);
    onVersionChange?.(k);
  };
  const { renderer, onGoogleLoad, onGoogleError } = useMapRenderer(MAPS_API_KEY.length > 0);

  const day = days[selectedDay];
  const dayNumber = day?.dayNum ?? null;
  const version = versions?.find((v) => v.key === versionKey) ?? null;
  const city = (tripDestination ?? "").split(",")[0].trim();

  // ── Browse supply (the EXISTING public reads; only while the layer is on) ───────────────────
  const { data: categories } = useQuery<Array<{ id: string; categoryKey?: string | null }>>({
    queryKey: ["/api/service-categories"],
    enabled: browseOn,
    staleTime: 5 * 60_000,
  });
  // Step 8b-2: the tabs filter listings by their resolved category KEY, so the city's listings are read
  // once and every tab (and "Find a host"'s one key) narrows them here — never a guessed category.
  const categoryKeyById = useMemo(
    () => new Map((categories ?? []).filter((c) => !!c.categoryKey).map((c) => [String(c.id), String(c.categoryKey)])),
    [categories],
  );
  const listingsUrl = `/api/services?location=${encodeURIComponent(city)}`;
  const { data: listings } = useQuery<any[]>({ queryKey: [listingsUrl], enabled: browseOn && !!city });
  const partnerUrl = `/api/affiliate/products?city=${encodeURIComponent(city)}&limit=100`;
  const { data: partner } = useQuery<{ products?: any[] }>({ queryKey: [partnerUrl], enabled: browseOn && !!city });
  const { data: experts } = useQuery<any[]>({
    queryKey: ["/api/experts", { location: city }],
    enabled: browseOn && !!city,
    queryFn: async () => {
      const res = await fetch(`/api/experts?location=${encodeURIComponent(city)}`);
      if (!res.ok) throw new Error("Failed to fetch experts");
      return res.json();
    },
  });
  const candidatePlaces: BrowsePlace[] = useMemo(
    () =>
      !readOnly && onAddCandidate && candidates
        ? candidates.items.map((c) => ({ id: c.id, kind: "candidate" as const, name: c.title, lat: c.lat, lng: c.lng, category: candidates.sourceLabel, priceLabel: c.price ?? null }))
        : [],
    [readOnly, onAddCandidate, candidates],
  );
  const candidatesOn = candidatePlaces.length > 0;
  // Step 8b-2: tabs (ruling 8), search and Budget (ruling 10) over the SAME three reads.
  const [tab, setTab] = useState<BrowseTabKey>(() => browseTabForCategory(browseState.categoryKey));
  useEffect(() => {
    if (browseState.categoryKey) setTab(browseTabForCategory(browseState.categoryKey));
  }, [browseState.categoryKey]);
  const [search, setSearch] = useState("");
  const [budgetText, setBudgetText] = useState("");
  const budgetMax = budgetText.trim() === "" ? null : Number(budgetText);
  const supply = useMemo(() => {
    if (!browseOn) return { shown: [] as BrowsePlace[], byQuote: 0, noUsdPrice: 0 };
    const all = [...listingPlaces(listings, categoryKeyById), ...partnerPlaces(partner?.products)];
    return applyBudget(searchPlaces(placesInTab(all, tab, browseState.categoryKey), search), budgetMax);
  }, [browseOn, listings, categoryKeyById, partner, tab, browseState.categoryKey, search, budgetMax]);
  const browsePlaces: BrowsePlace[] = useMemo(() => [...candidatePlaces, ...supply.shown], [candidatePlaces, supply.shown]);
  // What this plan already holds, by the listing / partner id each item names ("On day N · Remove").
  const planItems = useMemo(
    () =>
      days.flatMap((d) =>
        (d.activities ?? []).map((a) => ({
          id: a.id,
          providerServiceId: a.providerServiceId ?? null,
          affiliateProductId: a.affiliateProductId ?? null,
          dayNum: d.dayNum,
        })),
      ),
    [days],
  );
  const hosts = browseOn ? hostRows(experts).slice(0, 8) : [];
  const selectedBrowse = browsePlaces.find((b) => `${b.kind}:${b.id}` === selectedBrowseId) ?? null;

  const add = useMutation({
    mutationFn: async (place: BrowsePlace) =>
      (await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, browseAddBody(place, dayNumber ?? 1))).json(),
    onSuccess: (_out, place) => {
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      // R322: the Workstation reads the trip's item list directly; keep it in step with the add.
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      toast({ title: `Added ${place.name} to day ${dayNumber ?? 1}` });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Couldn't add that", description: e?.message }),
  });
  // "On day N · Remove": the EXISTING item DELETE route — the one remove rail (LD 39).
  const remove = useMutation({
    mutationFn: async (itemId: string) => (await apiRequest("DELETE", `/api/trips/${tripId}/itinerary-items/${itemId}`)).json(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Couldn't remove that", description: e?.message }),
  });

  // ── The scene ────────────────────────────────────────────────────────────────────────────────
  const planStops = (day?.activities ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    time: a.time ?? null,
    lat: a.lat ?? null,
    lng: a.lng ?? null,
    expertNote: a.expertNote ?? null,
    supplySlot: !!(a as any).supplySlot,
  }));
  const scene = buildMapScene({
    dayNumber,
    planStops,
    version,
    planAnchor: anchor,
    areas,
    showAreas,
    emphasizeAreas,
    browse: browsePlaces,
    layers: { plan: planLayer, browse: browseOn || candidatesOn },
  });
  const dayDiff = version && dayNumber != null ? version.days.find((d) => d.dayNumber === dayNumber) ?? null : null;

  // Routed legs (and their minutes) only when the travel-time service is on; otherwise the scene's
  // straight connector is the only line, and no minute is drawn (R-h).
  const legs: SceneLeg[] = useMemo(() => {
    if (!showTravelMinutes || version || !day?.transports?.length) return [];
    const located = (day.activities ?? []).filter(isLocated);
    return day.transports
      .map((tr, i) => {
        const from = located.find((a) => a.location === tr.from || a.name === tr.fromName) ?? located[i];
        const to = located.find((a) => a.location === tr.to || a.name === tr.toName) ?? located[i + 1];
        if (!from || !to) return null;
        const mode = tr.userSelectedMode ?? tr.recommendedMode ?? tr.mode;
        return {
          id: tr.id,
          from: { lat: from.lat!, lng: from.lng! },
          to: { lat: to.lat!, lng: to.lng! },
          color: getModeColor(mode),
          durationLabel: tr.duration ? `${tr.duration}m` : null,
        };
      })
      .filter((l): l is SceneLeg => !!l);
  }, [showTravelMinutes, version, day]);

  // The initial center: the first pin, else the anchor, else the server-geocoded destination. No
  // honest center ⇒ no canvas (never Null Island, §13).
  const firstPoint = scene.pins[0] ?? (scene.anchor ? { lat: scene.anchor.lat, lng: scene.anchor.lng } : null);
  const { data: geocoded, isLoading: geocoding } = useQuery<{ lat?: number; lng?: number }>({
    queryKey: ["/api/geocode", tripDestination],
    queryFn: () => fetch(`/api/geocode?address=${encodeURIComponent(tripDestination)}`).then((r) => r.json()),
    enabled: !!tripDestination && !firstPoint,
    staleTime: Infinity,
  });
  const center = firstPoint
    ? { lat: firstPoint.lat, lng: firstPoint.lng }
    : geocoded?.lat != null && geocoded?.lng != null
      ? { lat: geocoded.lat, lng: geocoded.lng }
      : null;

  useEffect(() => {
    setSelectedId(null);
  }, [selectedDay, versionKey]);

  if (!day) return null;

  const canvasHeight = compact ? "h-[360px]" : "h-[420px]";
  const split = layout === "split";
  // Item 13: in the split layout the rail FOLLOWS THE SHOWN LAYER — Browse while it is on, the day's
  // "Your plan" stops otherwise. The stacked layout keeps both, exactly as before.
  const showPlanRail = !split || !browseOn;
  return (
    <div
      data-testid={`map-control-center-${tripId}`}
      data-map-renderer={renderer}
      data-map-layout={layout}
      className={split ? "lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start" : undefined}
    >
      <div className="min-w-0" data-testid={`map-main-${tripId}`}>
      {/* ── Day chips · version toggle · layers ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border" data-testid={`map-toolbar-${tripId}`}>
        <div className="flex flex-wrap gap-1" data-testid={`map-day-selector-${tripId}`}>
          {days.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDay(i)}
              aria-pressed={selectedDay === i}
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${selectedDay === i ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              data-testid={`map-day-btn-${d.dayNum}-${tripId}`}
            >
              Day {d.dayNum}
            </button>
          ))}
        </div>
        {versions?.length ? (
          <div className="flex gap-1 rounded-full border border-border p-0.5" role="group" aria-label="Version" data-testid={`map-version-toggle-${tripId}`}>
            {[{ key: "draft", label: "Draft" }, ...versions.map((v) => ({ key: v.key, label: v.label }))].map((v) => (
              <button
                key={v.key}
                type="button"
                aria-pressed={versionKey === v.key}
                onClick={() => setVersionKey(v.key)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${versionKey === v.key ? "bg-foreground text-background" : "text-muted-foreground"}`}
                data-testid={`map-version-${v.key === "draft" ? "draft" : v.label}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-1" data-testid={`layer-controls-${tripId}`}>
          <Layers className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          <button
            type="button"
            aria-pressed={planLayer}
            onClick={() => setPlanLayer((v) => !v)}
            className={`px-2.5 py-0.5 rounded-full text-xs border ${planLayer ? "border-foreground text-foreground" : "border-border text-muted-foreground"}`}
            data-testid={`map-layer-plan-${tripId}`}
          >
            Your plan
          </button>
          {!readOnly ? (
            <button
              type="button"
              aria-pressed={browseOn}
              onClick={() => setBrowse({ open: !browseOn, categoryKey: browseOn ? null : browseState.categoryKey })}
              className={`px-2.5 py-0.5 rounded-full text-xs border ${browseOn ? "border-teal-600 text-teal-700" : "border-border text-muted-foreground"}`}
              data-testid={`map-layer-browse-${tripId}`}
            >
              Browse
            </button>
          ) : null}
        </div>
      </div>
      {dayDiff?.matchedByName ? (
        <p className="px-3 py-1 text-[11px] text-muted-foreground" data-testid="map-version-matched-by-name">
          Matched by name — this day's stops are paired by their names, not their ids.
        </p>
      ) : null}

      {/* ── The canvas ──────────────────────────────────────────────────────────────────────── */}
      <div className={`relative overflow-hidden ${canvasHeight}`} data-testid={`map-area-${tripId}`}>
        {center ? (
          renderer === "google" ? (
            <SceneMapGoogle
              apiKey={MAPS_API_KEY}
              onLoad={onGoogleLoad}
              onError={onGoogleError}
              scene={scene}
              center={center}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSelectBrowse={(id) => setSelectedBrowseId(browsePlaces.find((b) => b.id === id) ? `${browsePlaces.find((b) => b.id === id)!.kind}:${id}` : null)}
              legs={legs}
            />
          ) : (
            <SceneMapLeaflet
              scene={scene}
              center={center}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSelectBrowse={(id) => setSelectedBrowseId(browsePlaces.find((b) => b.id === id) ? `${browsePlaces.find((b) => b.id === id)!.kind}:${id}` : null)}
              legs={legs}
            />
          )
        ) : (
          <div className="h-full bg-muted flex items-center justify-center px-4 text-center">
            <p className="text-muted-foreground text-sm" data-testid={`map-no-center-${tripId}`}>
              {geocoding ? `Locating ${tripDestination}…` : "No mapped stops for this day yet"}
            </p>
          </div>
        )}
        {renderer === "leaflet" && center ? (
          <p className="absolute bottom-1 left-1 z-[500] rounded bg-card/90 px-1.5 py-0.5 text-[10px] text-muted-foreground" data-testid="map-fallback-notice">
            {MAP_FALLBACK_NOTICE}
          </p>
        ) : null}
      </div>

      </div>

      {/* ── The bottom sheet: the day's stops, selection synced both ways ─────────────────────── */}
      <div
        className={`border-t border-border px-3 py-2 space-y-2${split ? " lg:border-t-0 lg:border-l" : ""}`}
        data-testid={`map-sheet-${tripId}`}
        data-rail-layer={split ? (browseOn ? "browse" : "plan") : undefined}
      >
        {showPlanRail ? (
        <>
        {split ? (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" data-testid="map-your-plan-title">
            Your plan · Day {dayNumber}
          </p>
        ) : null}
        {split && planEmptyNote ? (
          <p className="text-xs text-muted-foreground" data-testid="map-your-plan-empty">
            {planEmptyNote}
          </p>
        ) : null}
        <ol className="space-y-1">
          {scene.list.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelectedId(s.located ? s.id : null)}
                aria-selected={selectedId === s.id}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm ${selectedId === s.id ? "bg-muted" : "hover:bg-muted/50"}`}
                data-testid={`map-sheet-stop-${s.id}`}
                data-pin-state={s.state}
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">{s.n}</span>
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {s.state === "moved" ? <span className="text-[10px] font-semibold text-amber-700">moved</span> : null}
                {s.state === "added" ? <span className="text-[10px] font-semibold text-teal-700">new</span> : null}
                {s.time ? <span className="text-xs text-muted-foreground tabular-nums">{s.time}</span> : null}
              </button>
            </li>
          ))}
        </ol>
        {dayDiff?.dropped.length ? (
          <p className="text-xs text-muted-foreground" data-testid="map-sheet-dropped">
            Dropped in this version: {dayDiff.dropped.map((id) => planStops.find((p) => p.id === id)?.name).filter(Boolean).join(", ")}
          </p>
        ) : null}
        {scene.notOnMap.length ? (
          <div data-testid="map-not-on-map">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Not on the map yet</p>
            <ul className="text-xs text-muted-foreground">
              {scene.notOnMap.map((s) => (
                <li key={s.id} data-testid={`map-not-on-map-${s.id}`}>
                  {s.name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        </>
        ) : null}

        {/* ── Browse: the selected place's card, the places, and hosts (never pins) ─────────── */}
        {browseOn || candidatesOn ? (
          <div className="space-y-2 border-t border-border pt-2" data-testid="map-browse-panel">
            {browseOn ? (
              <div className="space-y-2" data-testid="map-browse-controls">
                <div className="flex flex-wrap gap-1" role="tablist" aria-label="Browse" data-testid="map-browse-tabs">
                  {BROWSE_TABS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.key}
                      onClick={() => {
                        setTab(t.key);
                        if (browseState.categoryKey) setBrowse({ open: true, categoryKey: null });
                      }}
                      className={`px-2.5 py-0.5 rounded-full text-xs border ${tab === t.key ? "border-teal-600 text-teal-700" : "border-border text-muted-foreground"}`}
                      data-testid={`map-browse-tab-${t.key}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search"
                    aria-label="Search places"
                    className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-xs"
                    data-testid="map-browse-search"
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Budget up to $
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={budgetText}
                      onChange={(e) => setBudgetText(e.target.value)}
                      aria-label="Budget, US dollars"
                      className="w-20 rounded-md border border-border bg-card px-2 py-1 text-xs"
                      data-testid="map-browse-budget"
                    />
                  </label>
                </div>
                {budgetMax != null && (supply.byQuote > 0 || supply.noUsdPrice > 0) ? (
                  <p className="text-[11px] text-muted-foreground" data-testid="map-browse-budget-left-out">
                    {[
                      supply.byQuote > 0 ? `+ ${supply.byQuote} by quote` : null,
                      supply.noUsdPrice > 0 ? `+ ${supply.noUsdPrice} without a shown US-dollar price` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            ) : null}
            {browseState.categoryKey ? (
              <p className="text-xs text-muted-foreground" data-testid="map-browse-filter">
                Showing {browseState.categoryKey.replace(/_/g, " ")} ·{" "}
                <button type="button" className="underline" onClick={() => setBrowse({ open: true, categoryKey: null })} data-testid="map-browse-clear-filter">
                  show everything
                </button>
              </p>
            ) : null}
            {selectedBrowse ? (
              <div className="rounded-md border border-teal-600/40 p-2 space-y-1" data-testid="map-browse-card">
                <p className="text-sm font-semibold">{selectedBrowse.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    selectedBrowse.kind === "listing" ? "Traveloure listing" : selectedBrowse.kind === "candidate" ? null : "Partner place",
                    selectedBrowse.category,
                    selectedBrowse.priceLabel,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {(() => {
                  const added = addedItemFor(selectedBrowse, planItems);
                  if (added) {
                    return (
                      <p className="flex items-center gap-2 text-xs" data-testid="map-browse-added">
                        <span>On day {added.dayNum}</span>·
                        <button
                          type="button"
                          className="underline"
                          onClick={() => remove.mutate(added.itemId)}
                          disabled={remove.isPending}
                          data-testid="map-browse-remove"
                        >
                          Remove
                        </button>
                      </p>
                    );
                  }
                  return (
                    <Button
                      size="sm"
                      onClick={() => {
                        if (selectedBrowse.kind === "candidate") {
                          onAddCandidate?.(selectedBrowse.id, dayNumber ?? 1);
                          setSelectedBrowseId(null);
                        } else add.mutate(selectedBrowse);
                      }}
                      disabled={add.isPending}
                      data-testid="map-browse-add"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add to day {dayNumber ?? 1}
                    </Button>
                  );
                })()}
              </div>
            ) : null}
            <ul className="max-h-48 space-y-0.5 overflow-y-auto">
              {browsePlaces.map((b) => (
                <li key={`${b.kind}:${b.id}`}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-0.5 text-left text-xs hover:bg-muted/50"
                    onClick={() => setSelectedBrowseId(`${b.kind}:${b.id}`)}
                    data-testid={`map-browse-row-${b.kind}-${b.id}`}
                  >
                    <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-teal-500" aria-hidden="true" />
                    <span className="flex-1 truncate">{b.name}</span>
                    {b.lat == null ? <span className="text-[10px] text-muted-foreground">not on the map</span> : null}
                  </button>
                </li>
              ))}
            </ul>
            {browseOn && hosts.length ? (
              <div data-testid="map-browse-hosts">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Local hosts</p>
                <ul className="text-xs">
                  {hosts.map((h) => (
                    <li key={h.id} data-testid={`map-browse-host-${h.id}`}>
                      <a className="underline" href={h.handle ? `/s/${h.handle}` : `/experts/${h.id}`}>
                        {h.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {!compact ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={() => openDayInMaps(day, tripDestination, "google")} data-testid={`map-btn-google-${tripId}`}>
              <SiGoogle className="w-3 h-3" /> Google Maps
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={() => openDayInMaps(day, tripDestination, "apple")} data-testid={`map-btn-apple-${tripId}`}>
              <SiApple className="w-3 h-3" /> Apple Maps
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={() => addDayToCalendar(day, tripDestination)} data-testid={`map-btn-calendar-${tripId}`}>
              Add to Calendar
            </Button>
          </div>
        ) : null}
        {expertTravelerNote?.trim() ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3" data-testid={`expert-notes-panel-${tripId}`}>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              <MessageSquare className="w-3.5 h-3.5" /> Expert Notes
            </div>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/80" data-testid={`expert-notes-panel-body-${tripId}`}>
              {expertTravelerNote}
            </p>
          </div>
        ) : null}
        {!center && !geocoding ? <MapPin className="hidden" aria-hidden="true" /> : null}
      </div>
    </div>
  );
}
