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
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Crosshair, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
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

export function CatalogMapView({ services }: { services: CatalogMapService[] }) {
  const { toast } = useToast();
  const mappable = services.filter((s) => s.productShape !== "bundle");
  const [selectedId, setSelectedId] = useState<string | null>(mappable[0]?.id ?? null);
  const selected = mappable.find((s) => s.id === selectedId) ?? null;

  // Owner single-service read (ruling 22: routePoints ride this response)
  const { data: detail } = useQuery<{ routePoints?: RoutePointRow[] } | undefined>({
    queryKey: [`/api/provider/services/${selectedId}`],
    enabled: !!selectedId,
  });

  const [draft, setDraft] = useState<DraftStop[]>([]);
  const [dirty, setDirty] = useState(false);
  const [newStopName, setNewStopName] = useState("");
  const [locatingKey, setLocatingKey] = useState<string | null>(null);

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
    setDirty(true);
  }

  if (mappable.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No mappable services yet — create a service first, then place it on the map here.
        </CardContent>
      </Card>
    );
  }

  return (
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
        />
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
                      <span className="block truncate">{stop.name}</span>
                      {stop.lat === null && (
                        <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 mt-0.5">
                          Not on map
                        </Badge>
                      )}
                    </span>
                    {stop.lat === null && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Find on map"
                        onClick={() => locateStop(stop)}
                        disabled={locatingKey === stop.key}
                        data-testid={`button-locate-stop-${i + 1}`}
                      >
                        {locatingKey === stop.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />}
                      </Button>
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

            <Button
              className="w-full"
              onClick={() => routeMutation.mutate()}
              disabled={!dirty || routeMutation.isPending}
              data-testid="button-save-route"
            >
              {routeMutation.isPending ? "Saving…" : dirty ? "Save route" : "Route saved"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
