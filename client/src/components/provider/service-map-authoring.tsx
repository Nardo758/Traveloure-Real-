/**
 * ServiceMapAuthoring — WAVE 2 / LANE A1 (S3): the map authoring component, mounted as the create
 * flow's STEP 4, "Logistics" (decision-maker ruled Aug 12, 2026; the mock is the spec).
 * Reworked by Lane L (mock-conformance audit round 2, ledger row 119, Aug 15 2026):
 * D-10 Layers card · D-11 pin arm mode · D-12 stops autosave · D-13 located pill · D-15 layout.
 *
 * WHERE IT MOVED FROM, AND WHAT DID NOT MOVE. Until this lane the pin + route-stop authoring lived
 * on Catalog's map view (ruling 22b). That posture is AMENDED: map authoring is a creation job, so
 * it lives in the flow; Catalog's map is a read-only traveler preview from here on. **No write
 * rail changed and none was added:**
 *
 *  - THE MEETING PIN keeps its ONE writer. The confirmed point reaches the row ONLY through the
 *    form save (`extractServiceLocation` on POST/PATCH /api/provider/services — L27-P3 /
 *    CLAUDE.md §22b). D-11's "Place the meeting pin" ARM mode is the single pin-authoring
 *    surface: an armed click proposes a candidate, and an explicit "Confirm this location"
 *    hands it to the form field (`onPinConfirm` → `set("locationPoint", …)`). The form save stays
 *    the one writer, with no second pin control competing with the canvas.
 *  - ROUTE STOPS keep the ruling-22a owner-gated replace-list
 *    `PUT /api/provider/services/:id/route-points` — positions derived server-side from array
 *    order, unlocated stops preserved as rows and flagged, never guessed onto the map (§13).
 *    D-12 (ratified, ledger 119) moves the TRIGGER from a manual "Save route" button to a
 *    debounced autosave on settle — the rail underneath is byte-identical.
 *
 * CREATE MODE IS HONEST ABOUT ITSELF. The replace-list PUT needs a row to hang the stops on, and
 * in create mode there is not one yet. So the stop editor says exactly that — rather than
 * inventing a draft row behind the provider's back or pretending an edit was saved.
 *
 * CANVAS INTERACTIONS are the ones ruling 62 established: drag-to-adjust a located stop, and an
 * explicitly ARMED click-to-place (never a bare map click, which would fight pan/zoom).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Crosshair,
  Layers,
  Loader2,
  MapPin,
  Plus,
  Radius,
  Route,
  Trash2,
} from "lucide-react";
import { Link } from "wouter";
import { ServiceLocationMap, type ServiceRouteStopView } from "@/components/service-location-map";
import type { LocationPoint } from "@/components/backoffice/location-point-picker";

/** A saved `service_route_points` row as the owner read returns it (ruling 22a). */
export interface SavedRoutePoint {
  id: string;
  position: number;
  name: string;
  latitude: string | null;
  longitude: string | null;
}

/** Local editable stop — `key` is client-only (row identity across reorders before save). */
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
  return `svc-map-draft-${draftKeyCounter}`;
}

type PlacementMode = { kind: "new" } | { kind: "existing"; key: string } | { kind: "pin" } | null;

export function ServiceMapAuthoring({
  surchargeZones,
  serviceId,
  pin,
  pinLabel,
  radiusKm,
  addressHint,
  savedStops,
  onPinConfirm,
  pickupAvailable,
  pickupProvisionChosen,
  pickupCoverageMode,
  onPickupCoverageModeChange,
  serviceRadius,
  onServiceRadiusChange,
  savedRouteStopCount,
  savedRadiusKm,
  onDraftStopsChange,
  meetingDetails,
  onMeetingDetailsChange,
  onPinRemove,
  savedPickupStops,
  onDraftPickupStopsChange,
}: {
  /** The saved row's id — `null` in CREATE mode, where the stop rail has nothing to write to. */
  serviceId: string | null;
  /** The CONFIRMED pin owned by the parent form. Read-only here. */
  pin: LocationPoint | null;
  pinLabel?: string | null;
  /** `serviceRadius` in km — a display-only ring around the confirmed pin (§22c). */
  radiusKm?: number | null;
  /** Ruling 112 Q3: travel-surcharge zones (ruling 81 rows) — display-only dashed rings;
   *  amounts are authored in Pricing & fees, never here. */
  surchargeZones?: ReadonlyArray<{ radiusKm: number; fee: string | number }> | null;
  /** Geocode context for "find this stop by name". */
  addressHint?: string;
  savedStops: SavedRoutePoint[];
  /**
   * D-11 (ledger 119): receives a canvas-proposed, EXPLICITLY CONFIRMED meeting-pin candidate.
   * The parent hands it to the form field (`set("locationPoint", …)`) — the form save
   * (`extractServiceLocation`) stays the pin's ONE writer. Omit to hide the pin arm mode entirely
   * (non-form mounts).
   */
  onPinConfirm?: (point: LocationPoint) => void;
  /** Pickup coverage is spatial authoring and lives in this map rail. */
  pickupAvailable?: boolean;
  pickupProvisionChosen?: boolean;
  pickupCoverageMode?: string;
  onPickupCoverageModeChange?: (mode: string) => void;
  serviceRadius?: number;
  onServiceRadiusChange?: (radius: number) => void;
  savedRouteStopCount?: number;
  savedRadiusKm?: number;
  onDraftStopsChange?: (stops: Array<{ name: string; latitude: number | null; longitude: number | null }>) => void;
  /** Human-facing meeting instructions. The map pin remains the sole spatial location. */
  meetingDetails?: string;
  onMeetingDetailsChange?: (details: string) => void;
  onPinRemove?: () => void;
  savedPickupStops?: SavedRoutePoint[];
  onDraftPickupStopsChange?: (stops: Array<{ name: string; latitude: number | null; longitude: number | null }>) => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<DraftStop[]>([]);
  const [pickupDraft, setPickupDraft] = useState<DraftStop[]>([]);
  const [dirty, setDirty] = useState(false);
  const [pickupDirty, setPickupDirty] = useState(false);
  const dirtyRef = useRef(false);
  const setDirtyBoth = (v: boolean) => {
    dirtyRef.current = v;
    setDirty(v);
  };
  const [newStopName, setNewStopName] = useState("");
  const [newPickupStopName, setNewPickupStopName] = useState("");
  const [locatingKey, setLocatingKey] = useState<string | null>(null);
  /** The ARMED click-to-place mode. `null` = disarmed (a bare canvas click does nothing). */
  const [placement, setPlacement] = useState<PlacementMode>(null);
  /** The stop being named inline (a just-placed pin). Autosave holds while any stop is nameless. */
  const [namingKey, setNamingKey] = useState<string | null>(null);
  /** D-11: a canvas-proposed pin candidate awaiting its explicit confirm (L27-P3). */
  const [pendingPin, setPendingPin] = useState<LocationPoint | null>(null);
  /** A verified geocode result that gives first-time pin placement a map canvas without inventing
      a city-centre fallback. It is never saved as the meeting pin until the user clicks the map
      and explicitly confirms the proposed point. */
  const [mapSeed, setMapSeed] = useState<LocationPoint | null>(null);
  const [findingMapSeed, setFindingMapSeed] = useState(false);

  // D-10: the Layers card — display toggles over the canvas's three optional layers. Display
  // state only; toggling draws or hides a layer, it never writes a row.
  // Ratified Lane L default: the three display layers are ON by default so a
  // saved radius / route stops / zones are visible without hunting for a toggle
  // (an unratified refactor flipped these off, which also made the canvas render
  // empty for a pin-less service that has saved stops).
  const [showRadius, setShowRadius] = useState(true);
  const [showStops, setShowStops] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const hasPickupRail = !!pickupAvailable || !!pickupProvisionChosen;

  // Re-seed the editable list whenever the saved route arrives/changes — but NEVER over live,
  // unsaved local edits (the autosave's refetch races a fast next edit otherwise; D-12).
  const savedSignature = savedStops
    .map((r) => `${r.id}:${r.position}:${r.name}:${r.latitude}:${r.longitude}`)
    .join("|");
  useEffect(() => {
    if (dirtyRef.current) return;
    setDraft(
      savedStops
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((r) => ({ key: r.id, name: r.name, lat: toNum(r.latitude), lng: toNum(r.longitude) })),
    );
    setPlacement(null);
    setNamingKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSignature]);

  const savedPickupSignature = (savedPickupStops ?? [])
    .map((r) => `${r.id}:${r.position}:${r.name}:${r.latitude}:${r.longitude}`)
    .join("|");
  useEffect(() => {
    if (pickupDirty) return;
    setPickupDraft(
      (savedPickupStops ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((r) => ({ key: r.id, name: r.name, lat: toNum(r.latitude), lng: toNum(r.longitude) })),
    );
  // Pickup stops have their own write rail and should never reset a service-itinerary edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPickupSignature]);

  const stopsForMap: ServiceRouteStopView[] = useMemo(
    () => draft.map((s, i) => ({ id: s.key, position: i + 1, name: s.name, lat: s.lat, lng: s.lng })),
    [draft],
  );
  const locatedCount = draft.filter((s) => s.lat !== null && s.lng !== null).length;

  useEffect(() => {
    onDraftStopsChange?.(
      draft.map((stop) => ({ name: stop.name, latitude: stop.lat, longitude: stop.lng })),
    );
  }, [draft, onDraftStopsChange]);

  useEffect(() => {
    onDraftPickupStopsChange?.(
      pickupDraft.map((stop) => ({ name: stop.name, latitude: stop.lat, longitude: stop.lng })),
    );
  }, [pickupDraft, onDraftPickupStopsChange]);

  const routeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/provider/services/${serviceId}/route-points`, {
        stops: draft.map((s) => ({
          name: s.name,
          latitude: s.lat === null ? null : s.lat,
          longitude: s.lng === null ? null : s.lng,
        })),
      });
      return res.json();
    },
    onSuccess: () => {
      setDirtyBoth(false);
      queryClient.invalidateQueries({ queryKey: [`/api/provider/services/${serviceId}`] });
      // Quiet by design (D-12): the status line below reports "Route · autosaved" — a toast per
      // debounced settle would be noise.
    },
    onError: () => toast({ title: "Could not save the route", description: "Your edits are still here — it will retry on your next change.", variant: "destructive" }),
  });

  const pickupRouteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/provider/services/${serviceId}/pickup-route-points`, {
        stops: pickupDraft.map((stop) => ({
          name: stop.name,
          latitude: stop.lat === null ? null : stop.lat,
          longitude: stop.lng === null ? null : stop.lng,
        })),
      });
      return res.json();
    },
    onSuccess: () => {
      setPickupDirty(false);
      queryClient.invalidateQueries({ queryKey: [`/api/provider/services/${serviceId}`] });
    },
    onError: () => toast({ title: "Could not save pickup stops", description: "Your edits are still here — try again shortly.", variant: "destructive" }),
  });

  const unnamedCount = draft.filter((s) => !s.name.trim()).length;
  const canWriteStops = !!serviceId;

  useEffect(() => {
    if (!pickupDirty || !canWriteStops || pickupRouteMutation.isPending) return;
    const timer = window.setTimeout(() => pickupRouteMutation.mutate(), 1200);
    return () => window.clearTimeout(timer);
  }, [pickupDirty, canWriteStops, pickupRouteMutation]);

  // ── D-12 (ratified, ledger 119): STOPS AUTOSAVE. The replace-list PUT (rail unchanged) now
  // fires on settle — 1.2s after the last edit — instead of on a button. Holds while a stop is
  // unnamed (an unnamed pin isn't a stop, §13) or a placement mode is armed mid-gesture.
  useEffect(() => {
    if (!dirty || !canWriteStops || unnamedCount > 0 || routeMutation.isPending) return;
    const t = setTimeout(() => routeMutation.mutate(), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty, unnamedCount, routeMutation.isPending]);

  async function locateStop(stop: DraftStop) {
    setLocatingKey(stop.key);
    try {
      const query = addressHint ? `${stop.name}, ${addressHint}` : stop.name;
      const res = await apiRequest("POST", "/api/geocode", { address: query });
      const data = await res.json();
      if (typeof data?.lat === "number" && typeof data?.lng === "number") {
        setDraft((prev) => prev.map((s) => (s.key === stop.key ? { ...s, lat: data.lat, lng: data.lng } : s)));
        setDirtyBoth(true);
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
    setDirtyBoth(true);
  }

  /** Drag-to-adjust. Moves the draft stop and marks it dirty; the autosave settles it. */
  function handleStopDragEnd(stopKey: string, lat: number, lng: number) {
    setDraft((prev) => prev.map((s) => (s.key === stopKey ? { ...s, lat, lng } : s)));
    setDirtyBoth(true);
  }

  /** Click-to-place. Only ever called while a placement mode is ARMED. */
  function handleCanvasClick(lat: number, lng: number) {
    if (!placement) return;
    if (placement.kind === "pin") {
      // D-11: propose only — the point reaches the form ONLY through the explicit confirm below.
      setPendingPin({ lat, lng });
      setPlacement(null);
      return;
    }
    if (placement.kind === "existing") {
      setDraft((prev) => prev.map((s) => (s.key === placement.key ? { ...s, lat, lng } : s)));
      setDirtyBoth(true);
      setPlacement(null);
      return;
    }
    const key = nextDraftKey();
    setDraft((prev) => [...prev, { key, name: "", lat, lng }]);
    setNamingKey(key);
    setDirtyBoth(true);
    setPlacement(null);
  }

  async function togglePinPlacement() {
    if (placement?.kind === "pin") {
      setPlacement(null);
      return;
    }

    setPendingPin(null);
    if (canvasExists) {
      setPlacement({ kind: "pin" });
      return;
    }

    const address = addressHint?.trim();
    if (!address) {
      toast({
        title: "Add meeting details first",
        description: "Enter a recognizable meeting address or landmark so we can open the map without guessing a location.",
      });
      return;
    }

    setFindingMapSeed(true);
    try {
      const response = await apiRequest("POST", "/api/geocode", { address });
      const result = await response.json();
      if (typeof result?.lat !== "number" || typeof result?.lng !== "number") {
        toast({ title: "Could not find that meeting area", description: "Refine the address or landmark, then try again." });
        return;
      }
      setMapSeed({ lat: result.lat, lng: result.lng });
      setPlacement({ kind: "pin" });
      toast({ title: "Map ready", description: "Click the map to propose the exact meeting pin." });
    } catch {
      toast({ title: "Could not find that meeting area", description: "Check the meeting address and try again." });
    } finally {
      setFindingMapSeed(false);
    }
  }

  function renameStop(key: string, name: string) {
    setDraft((prev) => prev.map((s) => (s.key === key ? { ...s, name } : s)));
    setDirtyBoth(true);
  }

  function moveStop(index: number, delta: -1 | 1) {
    setDraft((prev) => {
      const next = prev.slice();
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirtyBoth(true);
  }

  function removeStop(key: string) {
    setDraft((prev) => prev.filter((s) => s.key !== key));
    if (namingKey === key) setNamingKey(null);
    if (placement?.kind === "existing" && placement.key === key) setPlacement(null);
    setDirtyBoth(true);
  }

  function addPickupStop() {
    const name = newPickupStopName.trim();
    if (!name) return;
    setPickupDraft((current) => [...current, { key: nextDraftKey(), name, lat: null, lng: null }]);
    setNewPickupStopName("");
    setPickupDirty(true);
  }

  function removePickupStop(key: string) {
    setPickupDraft((current) => current.filter((stop) => stop.key !== key));
    setPickupDirty(true);
  }

  // §13: click-to-place needs a canvas, and this map renders NOTHING when the listing has no
  // confirmed pin and no located stop — there is no city-center fallback to click on.
  const canvasExists = !!pin || !!mapSeed || locatedCount > 0;

  const routeStatus = !canWriteStops
    ? draft.length > 0
      ? dirty
        ? "Route draft — saves with the listing."
        : "Route draft ready"
      : null
    : routeMutation.isPending
      ? "Saving route…"
      : unnamedCount > 0
        ? "Name the new stop — it autosaves right after."
        : dirty
          ? "Autosaving…"
          : draft.length > 0
            ? "Route · autosaved"
            : null;

  return (
    <Card className="w-full" data-testid="card-service-map-authoring">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route className="w-5 h-5" />
          On the map
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          The pin you confirmed above, the ring your service radius draws around it, your
          travel-surcharge zones (display only — the amounts live in Pricing &amp; fees), and the stops
          this service visits in order. Connectors are drawn as a straight dashed line showing{" "}
          <strong>sequence, not travel routing</strong> — no distance or duration is invented (§13).
        </p>

        {/* ── D-11/D-15: the ARM BAR over a full-width canvas — the mock's shape. A bare map
            click does nothing; placing anything needs an explicitly armed mode. ── */}
        <div
          className={`grid grid-cols-1 md:grid-cols-3 ${hasPickupRail ? "xl:grid-cols-4" : ""} items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2`}
          data-testid="flow-map-arm-bar"
        >
          <p className="text-[12.5px] text-muted-foreground md:col-span-2 xl:col-span-2" data-testid="text-arm-state">
            {placement
              ? placement.kind === "pin"
                ? "Meeting-pin mode armed — click the map."
                : "Stop mode armed — click the map."
              : "Nothing armed. Pick a mode, then click the map."}
          </p>
          <div className="flex flex-wrap justify-start md:col-span-1 xl:col-span-2 xl:justify-end gap-2">
            {onPinConfirm && (
              <Button
                size="sm"
                variant={placement?.kind === "pin" ? "default" : "outline"}
                disabled={findingMapSeed}
                onClick={togglePinPlacement}
                data-testid="button-place-pin-mode"
              >
                <MapPin className="w-3.5 h-3.5 mr-1.5" />
                {findingMapSeed ? "Finding the map…" : placement?.kind === "pin" ? "Click the map…" : "Place the meeting pin"}
              </Button>
            )}
            <Button
              size="sm"
              variant={placement?.kind === "new" ? "default" : "outline"}
                disabled={!canvasExists}
              onClick={() => setPlacement(placement?.kind === "new" ? null : { kind: "new" })}
              data-testid="button-place-stop-mode"
            >
              <Crosshair className="w-3.5 h-3.5 mr-1.5" />
              {placement?.kind === "new" ? "Click the map…" : "Place a stop"}
            </Button>
          </div>
        </div>

        {/* Canvas — full width (D-15: the canvas is the step's primary surface). */}
        <div className="space-y-2 min-w-0 w-full">
          <ServiceLocationMap
            pin={pin}
            pendingPin={pendingPin}
            initialCenter={pin ? null : mapSeed}
            pinLabel={pinLabel}
            radiusKm={showRadius ? (radiusKm ?? null) : null}
            surchargeZones={showZones ? (surchargeZones ?? null) : null}
            stops={showStops ? stopsForMap : []}
            height={540}
            testIdPrefix="flow-map-canvas"
            onStopDragEnd={canWriteStops && showStops ? handleStopDragEnd : undefined}
            onCanvasClick={placement ? handleCanvasClick : undefined}
            placementActive={!!placement}
          />
          {placement && (
            <p
              className="text-[12px] rounded-md border border-primary bg-primary/5 px-2 py-1.5"
              data-testid="flow-map-placement-banner"
            >
              {placement.kind === "pin"
                ? "Click the map where travelers meet you — you'll confirm it next."
                : placement.kind === "new"
                  ? "Click the map to drop a new stop — you'll name it next."
                  : "Click the map to place this stop."}{" "}
              <button className="underline" onClick={() => setPlacement(null)} data-testid="button-cancel-placement">
                Cancel
              </button>
            </p>
          )}
          {/* D-11: the canvas-proposed pin candidate — nothing reaches the form until this
              explicit confirm (the same L27-P3 posture the picker's own Confirm carries). */}
          {pendingPin && onPinConfirm && (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary bg-primary/5 px-3 py-2"
              data-testid="flow-map-pin-confirm"
            >
              <p className="text-[12.5px]">
                Meeting pin at {pendingPin.lat.toFixed(5)}, {pendingPin.lng.toFixed(5)} — confirm to
                use it. It saves with the rest of the form.
              </p>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    onPinConfirm(pendingPin);
                    setPendingPin(null);
                      setMapSeed(null);
                    toast({ title: "Meeting pin set", description: "It saves with the rest of the form." });
                  }}
                  data-testid="button-confirm-canvas-pin"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Confirm this location
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPendingPin(null)} data-testid="button-cancel-canvas-pin">
                  Cancel
                </Button>
              </span>
            </div>
          )}
          {!canvasExists && (
            <p className="text-xs text-muted-foreground rounded-md border border-dashed p-4 text-center" data-testid="flow-map-empty">
              <MapPin className="w-5 h-5 mx-auto mb-1 opacity-40" />
              No confirmed location yet. Confirm the meeting pin above (or find one stop by name)
              and the map appears — nothing is guessed onto it.
            </p>
          )}
          {draft.length > 0 && (
            <p className="text-[12px] text-muted-foreground" data-testid="flow-map-coverage">
              {locatedCount} of {draft.length} stops located
              {locatedCount < draft.length ? " — unlocated stops stay listed but are never drawn." : "."}
            </p>
          )}
        </div>

        {/* The rail gives each spatial concept one home: meeting pin, display layers, itinerary,
            and (when offered) pickup coverage. */}
        <div className="grid grid-cols-1 gap-3 items-start md:grid-cols-2">
          <div className="rounded-lg border p-2.5 md:order-1 md:col-span-full" data-testid="card-meeting-pin">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <MapPin className="w-4 h-4" /> Meeting pin
              </h4>
              <Badge variant="outline" className="text-[10px] font-normal">
                {pin ? "Confirmed" : "Not set"}
              </Badge>
            </div>
            <div className="mt-2.5 grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
              <div className="space-y-1.5">
                {pin ? (
                  <p className="text-[11px] text-emerald-700">
                    Confirmed at {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Place and confirm the map pin so travelers have a precise meeting location.
                  </p>
                )}
                {pin && onPinRemove && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={onPinRemove}>
                    Remove pin
                  </Button>
                )}
              </div>
              {onMeetingDetailsChange && (
                <div>
                  <Label htmlFor="meetingDetails" className="text-[12px] font-normal">
                    Meeting details <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="meetingDetails"
                    value={meetingDetails ?? ""}
                    onChange={(event) => onMeetingDetailsChange(event.target.value)}
                    placeholder="e.g. Meet outside the east entrance, beside the taxi rank"
                    rows={3}
                    className="mt-1 text-[12px]"
                    data-testid="input-meeting-details"
                  />
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    These are instructions for travelers, not a second location. The map pin is saved only after you confirm it.
                  </p>
                </div>
              )}
            </div>
          </div>
          {(pickupAvailable || pickupProvisionChosen) && onPickupCoverageModeChange && (
            <div className="rounded-lg border p-2.5 space-y-2.5 md:order-3" data-testid="card-pickup-coverage">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Radius className="w-4 h-4" /> Pickup coverage
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Choose how your pickup area is defined. Switching modes preserves the other mode&apos;s data.
              </p>
              <ToggleGroup
                type="single"
                value={pickupCoverageMode}
                onValueChange={(value) => onPickupCoverageModeChange(value || "")}
                variant="outline"
                className="w-full justify-start gap-1"
                data-testid="segmented-pickup-coverage-mode"
              >
                <ToggleGroupItem value="radius" className="flex-1 px-2" data-testid="toggle-coverage-radius">
                  <Radius className="w-3.5 h-3.5 mr-1" /> Radius
                </ToggleGroupItem>
                <ToggleGroupItem value="route" className="flex-1 px-2" data-testid="toggle-coverage-route">
                  <Route className="w-3.5 h-3.5 mr-1" /> Route
                </ToggleGroupItem>
              </ToggleGroup>
              {pickupCoverageMode === "radius" && onServiceRadiusChange && (
                <div>
                  <Label htmlFor="serviceRadius" className="text-[12px] font-normal">Service radius (km)</Label>
                  <Input
                    id="serviceRadius"
                    type="number"
                    value={serviceRadius ?? 0}
                    onChange={(event) => onServiceRadiusChange(parseInt(event.target.value) || 0)}
                    className="mt-1 h-8 text-[13px]"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    The ring travelers see around your meeting pin.
                  </p>
                  {(savedRouteStopCount ?? 0) > 0 && (
                    <p className="text-[11px] text-amber-700 mt-2" data-testid="text-coverage-other-preserved">
                      {savedRouteStopCount} saved route {savedRouteStopCount === 1 ? "stop is" : "stops are"} preserved.
                    </p>
                  )}
                </div>
              )}
              {pickupCoverageMode === "route" && (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    Pickup stops are separate from the service itinerary. Add the collection points in order.
                  </p>
                  <div className="flex gap-1.5">
                    <Input
                      value={newPickupStopName}
                      onChange={(event) => setNewPickupStopName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addPickupStop();
                        }
                      }}
                      placeholder="Add pickup stop"
                      className="h-8 text-[12px]"
                      data-testid="input-new-pickup-stop"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={addPickupStop}
                      disabled={!newPickupStopName.trim()}
                      data-testid="button-add-pickup-stop"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {pickupDraft.length > 0 ? (
                    <ol className="space-y-1">
                      {pickupDraft.map((stop, index) => (
                        <li key={stop.key} className="flex items-center gap-1.5 rounded border px-1.5 py-1 text-[12px]">
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px]">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{stop.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => removePickupStop(stop.key)}
                            aria-label={`Remove pickup stop ${stop.name}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">No pickup stops yet.</p>
                  )}
                  {pickupDirty && (
                    <p className="text-[11px] text-muted-foreground">
                      {canWriteStops ? "Saving pickup route…" : "Pickup route saves with the listing."}
                    </p>
                  )}
                  {(savedRadiusKm ?? 0) > 0 && (
                    <p className="text-[11px] text-amber-700" data-testid="text-coverage-other-preserved">Your saved radius is preserved.</p>
                  )}
                </div>
              )}
              {!pickupCoverageMode && (
                <p className="text-[11px] text-muted-foreground">Pick Radius or Route to define the pickup area.</p>
              )}
            </div>
          )}
          {/* D-10: Layers — display toggles only; no layer toggle writes anything. */}
          <div className="rounded-lg border p-2.5 md:order-2 md:col-span-full" data-testid="card-map-layers">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <Layers className="w-4 h-4" /> Layers
            </h4>
            <div className="mt-2.5 grid gap-3 md:grid-cols-3 md:items-start">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="layer-radius" className="text-[12px] font-normal">
                    Service radius
                  </Label>
                  <Switch
                    id="layer-radius"
                    checked={showRadius && !!pin}
                    disabled={!pin}
                    onCheckedChange={setShowRadius}
                    data-testid="switch-layer-radius"
                  />
                </div>
                {!pin && (
                    <p className="text-[10px] text-muted-foreground mt-1" data-testid="text-layer-radius-gate">
                    Needs a confirmed pin — a radius has no centre without one.
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="layer-stops" className="text-[12px] font-normal">
                  Route stops
                </Label>
                <Switch id="layer-stops" checked={showStops} onCheckedChange={setShowStops} data-testid="switch-layer-stops" />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="layer-zones" className="text-[12px] font-normal">
                    Travel-surcharge zones
                  </Label>
                  <Switch
                    id="layer-zones"
                    checked={showZones && !!pin}
                    disabled={!pin}
                    onCheckedChange={setShowZones}
                    data-testid="switch-layer-zones"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1" data-testid="text-layer-zones-note">
                  Zones are <strong>display only</strong> here — the amounts are set in{" "}
                  {serviceId ? (
                    // The listing HOME (where the Pricing & fees drawer mounts) is the edit
                    // route WITHOUT ?step — /provider/services/:id has no route of its own
                    // (caught by the dynamic-links gate on first push).
                    <Link href={`/provider/services/${serviceId}/edit`}>
                      <span className="underline cursor-pointer text-primary" data-testid="link-pricing-fees">
                        Pricing &amp; fees →
                      </span>
                    </Link>
                  ) : (
                    <strong>Pricing &amp; fees</strong>
                  )}
                  {serviceId ? "" : " (on the listing's home page, after the first save)"}.
                </p>
              </div>
            </div>
          </div>

          {/* Service itinerary — ordered places the experience visits, never pickup locations. */}
          <div className={`rounded-lg border p-2.5 space-y-2.5 md:col-span-1 ${hasPickupRail ? "md:order-4" : "md:order-3"}`} data-testid="card-route-stops">
            <h4 className="text-sm font-semibold flex items-center justify-between gap-2">
              <span>Service itinerary</span>
              {draft.length > 0 && (
                <Badge variant="outline" className="text-[10px] font-normal" data-testid="badge-stops-located">
                  {locatedCount} of {draft.length} located
                </Badge>
              )}
            </h4>

            <>
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
                    placeholder="Add a place visited (e.g. Nishiki Market)"
                    className="text-[13px]"
                    data-testid="input-new-stop"
                  />
                  <Button variant="outline" size="icon" onClick={addStop} disabled={!newStopName.trim()} data-testid="button-add-stop">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {!canvasExists && (
                  <p className="text-[11px] text-muted-foreground" data-testid="text-placement-unavailable">
                    Confirm the meeting pin above (or find one stop by name) first — there&apos;s no
                    map to click on yet, and nothing is guessed onto one.
                  </p>
                )}

                {draft.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">
                    No itinerary stops yet. Add the places this service visits, in order.
                  </p>
                ) : (
                  <ol className="space-y-1.5">
                    {draft.map((stop, i) => (
                      <li
                        key={stop.key}
                        className="flex items-center gap-1.5 rounded-md border px-2 py-1.5"
                        data-testid={`route-stop-row-${i + 1}`}
                      >
                        <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                          {i + 1}
                        </span>
                        <span className="flex-1 min-w-0 text-[13px]">
                          {namingKey === stop.key || !stop.name.trim() ? (
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
                    Name {unnamedCount === 1 ? "the new stop" : `all ${unnamedCount} new stops`} —
                    an unnamed pin isn&apos;t a stop, and the route autosaves as soon as it has a name.
                  </p>
                )}
                {/* D-12 (ratified): the route autosaves on settle over the SAME replace-list PUT
                    the "Save route" button used — the status line is the confirmation. */}
                {routeStatus && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1" data-testid="text-route-autosave-status">
                    {routeMutation.isPending || dirty ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3 text-green-700" />
                    )}
                    {routeStatus}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  These are places travelers visit, not pickup locations. Drag a numbered pin to
                  adjust it. Stops autosave after the listing exists; new listing routes are saved with the form.
                </p>
              </>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
