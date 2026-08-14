/**
 * ServiceMapAuthoring — WAVE 2 / LANE A1 (S3): the map authoring component, mounted as the create
 * flow's STEP 4, "Logistics" (decision-maker ruled Aug 12, 2026; the mock is the spec).
 *
 * WHERE IT MOVED FROM, AND WHAT DID NOT MOVE. Until this lane the pin + route-stop authoring lived
 * on Catalog's map view (ruling 22b). That posture is AMENDED: map authoring is a creation job, so
 * it lives in the flow; Catalog's map is a read-only traveler preview from here on. **No write
 * rail changed and none was added:**
 *
 *  - THE MEETING PIN keeps its ONE writer. It is authored by the SAME confirm-gated
 *    `LocationPointPicker` on the Meeting Location card immediately above this component, which
 *    goes out with the form save (`extractServiceLocation` on POST/PATCH /api/provider/services —
 *    L27-P3 / CLAUDE.md §22b). This component only DRAWS the pin; it never writes one, and it
 *    deliberately mounts no second picker.
 *  - ROUTE STOPS keep the ruling-22a owner-gated replace-list
 *    `PUT /api/provider/services/:id/route-points` — positions derived server-side from array
 *    order, unlocated stops preserved as rows and flagged, never guessed onto the map (§13).
 *
 * CREATE MODE IS HONEST ABOUT ITSELF. The replace-list PUT needs a row to hang the stops on, and
 * in create mode there is not one yet. So the stop editor says exactly that and points at Save
 * Draft — the same shape the protected-deliverable upload uses (FP-1 / B7) — rather than
 * inventing a draft row behind the provider's back or pretending an edit was saved.
 *
 * CANVAS INTERACTIONS are the ones ruling 62 established and are carried over verbatim:
 * drag-to-adjust a located stop, and an explicitly ARMED click-to-place (never a bare map click,
 * which would fight pan/zoom). Both are DRAFT-ONLY: nothing reaches the server until "Save
 * route", and that dirty→Save step IS the L27-P3 confirm posture on this surface.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Crosshair, Loader2, MapPin, Plus, Route, Trash2 } from "lucide-react";
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

export function ServiceMapAuthoring({
  surchargeZones,
  serviceId,
  pin,
  pinLabel,
  radiusKm,
  addressHint,
  savedStops,
}: {
  /** The saved row's id — `null` in CREATE mode, where the stop rail has nothing to write to. */
  serviceId: string | null;
  /** The CONFIRMED pin, owned by the form's LocationPointPicker. Read-only here. */
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
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<DraftStop[]>([]);
  const [dirty, setDirty] = useState(false);
  const [newStopName, setNewStopName] = useState("");
  const [locatingKey, setLocatingKey] = useState<string | null>(null);
  /** The ARMED click-to-place mode. `null` = disarmed (a bare canvas click does nothing). */
  const [placement, setPlacement] = useState<{ kind: "new" } | { kind: "existing"; key: string } | null>(null);
  /** The stop being named inline (a just-placed pin). Save is blocked while any stop is nameless. */
  const [namingKey, setNamingKey] = useState<string | null>(null);

  // Re-seed the editable list whenever the saved route arrives/changes. Keyed on the SAVED rows
  // only, so a local edit is never overwritten by a re-render.
  const savedSignature = savedStops
    .map((r) => `${r.id}:${r.position}:${r.name}:${r.latitude}:${r.longitude}`)
    .join("|");
  useEffect(() => {
    setDraft(
      savedStops
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((r) => ({ key: r.id, name: r.name, lat: toNum(r.latitude), lng: toNum(r.longitude) })),
    );
    setDirty(false);
    setPlacement(null);
    setNamingKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSignature]);

  const stopsForMap: ServiceRouteStopView[] = useMemo(
    () => draft.map((s, i) => ({ id: s.key, position: i + 1, name: s.name, lat: s.lat, lng: s.lng })),
    [draft],
  );
  const locatedCount = draft.filter((s) => s.lat !== null && s.lng !== null).length;

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
      queryClient.invalidateQueries({ queryKey: [`/api/provider/services/${serviceId}`] });
      setDirty(false);
      toast({ title: "Route saved" });
    },
    onError: () => toast({ title: "Could not save the route", variant: "destructive" }),
  });

  async function locateStop(stop: DraftStop) {
    setLocatingKey(stop.key);
    try {
      const query = addressHint ? `${stop.name}, ${addressHint}` : stop.name;
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

  /** Drag-to-adjust. Moves the draft stop and marks it dirty; nothing is persisted here. */
  function handleStopDragEnd(stopKey: string, lat: number, lng: number) {
    setDraft((prev) => prev.map((s) => (s.key === stopKey ? { ...s, lat, lng } : s)));
    setDirty(true);
  }

  /** Click-to-place. Only ever called while a placement mode is ARMED. */
  function handleCanvasClick(lat: number, lng: number) {
    if (!placement) return;
    if (placement.kind === "existing") {
      setDraft((prev) => prev.map((s) => (s.key === placement.key ? { ...s, lat, lng } : s)));
      setDirty(true);
      setPlacement(null);
      return;
    }
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

  const unnamedCount = draft.filter((s) => !s.name.trim()).length;
  // §13: click-to-place needs a canvas, and this map renders NOTHING when the listing has no
  // confirmed pin and no located stop — there is no city-center fallback to click on.
  const canvasExists = !!pin || locatedCount > 0;
  const canWriteStops = !!serviceId;

  return (
    <Card data-testid="card-service-map-authoring">
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

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
          {/* Canvas */}
          <div className="space-y-2 min-w-0">
            <ServiceLocationMap
              pin={pin}
              pinLabel={pinLabel}
              radiusKm={radiusKm ?? null}
              surchargeZones={surchargeZones ?? null}
              stops={stopsForMap}
              height={400}
              testIdPrefix="flow-map-canvas"
              onStopDragEnd={canWriteStops ? handleStopDragEnd : undefined}
              onCanvasClick={placement ? handleCanvasClick : undefined}
              placementActive={!!placement}
            />
            {placement && (
              <p
                className="text-[12px] rounded-md border border-primary bg-primary/5 px-2 py-1.5"
                data-testid="flow-map-placement-banner"
              >
                {placement.kind === "new"
                  ? "Click the map to drop a new stop — you'll name it next."
                  : "Click the map to place this stop."}{" "}
                <button className="underline" onClick={() => setPlacement(null)} data-testid="button-cancel-placement">
                  Cancel
                </button>
              </p>
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

          {/* Route stops */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Route stops</h4>

            {!canWriteStops ? (
              <p className="text-xs text-muted-foreground" data-testid="text-route-stops-after-save">
                Route stops attach to a saved listing. <strong>Save Draft</strong> first, then
                reopen this listing to add the places it visits — we won&apos;t create a row behind
                your back just to hold them.
              </p>
            ) : (
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
                    placeholder="Add a stop (e.g. Nishiki Market)"
                    className="text-[13px]"
                    data-testid="input-new-stop"
                  />
                  <Button variant="outline" size="icon" onClick={addStop} disabled={!newStopName.trim()} data-testid="button-add-stop">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

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
                    Confirm the meeting pin above (or find one stop by name) first — there&apos;s no
                    map to click on yet, and nothing is guessed onto one.
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
                    Name {unnamedCount === 1 ? "the new stop" : `all ${unnamedCount} new stops`} before
                    saving — an unnamed pin isn&apos;t a stop.
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
                    the route dirty and wait for this one explicit confirm (ruling 62). The stops
                    save on their own rail; the pin saves with the form. */}
                <p className="text-[11px] text-muted-foreground">
                  Drag a numbered pin to adjust it. Stops are saved by this button, separately from
                  the rest of the form.
                </p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
