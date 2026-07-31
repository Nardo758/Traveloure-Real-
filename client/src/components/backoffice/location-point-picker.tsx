/**
 * L27-P3 — the provider/expert single-point location picker (console surface).
 *
 * WHY THIS EXISTS: every earner-side location field is free text (ServiceForm's
 * `meetingPoint` Textarea, `serviceArea`, `pickupAddress`, the property dialog's
 * `location`), so `provider_services.latitude/longitude/location_precision`
 * (migration 129) were written ONLY by that migration's neighborhood-centroid
 * backfill. This component is the one surface that lets an earner place and
 * CONFIRM a precise point, which is what the write path turns into
 * `location_precision='exact'`.
 *
 * §13 TRUTHFULNESS (the whole point — read before changing anything here):
 *   - A point is only ever reported to the parent via onChange AFTER the user
 *     presses Confirm. Typing an address, or a geocode candidate merely being
 *     displayed, is NEVER a confirmed point — an unconfirmed address is not
 *     `'exact'`.
 *   - This component never claims a precision itself. It reports coordinates;
 *     the SERVER derives `location_precision` (see server/utils/service-location.ts).
 *   - An existing `'neighborhood_centroid'` point (the 129 backfill) is labelled
 *     as approximate and is never silently relabelled — it is only replaced when
 *     the user confirms a new pin.
 *   - No client-side geocoding: resolving typed text goes through the ONE server
 *     geocode path (`GET /api/geocode`). If that path is unavailable (no server
 *     key → 503), we say so and change nothing.
 *
 * DEGRADATION: with no `VITE_GOOGLE_MAPS_API_KEY` the component renders NOTHING
 * (the host form behaves exactly as it did before this lane), and any point the
 * row already carries is left untouched because the parent simply never receives
 * an onChange. A Maps render failure is contained by MapErrorBoundary — the
 * §17 P1 precedent from the Workstation browse map — so a billing/key failure
 * degrades to the free-text fields instead of blanking the form.
 *
 * §17 palette: console tokens only (var(--console-*) / shadcn semantics that
 * resolve inside `.console-scope`) — never a raw hex, never the traveler
 * `--primary`. Controls are 44px targets.
 */
import { Component, useCallback, useMemo, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin, Crosshair, X, Check, AlertTriangle } from "lucide-react";

const MAPS_KEY: string = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || "";

export interface LocationPoint {
  lat: number;
  lng: number;
}

/** Row values as they come back from the API (drizzle `decimal` → string). */
export function parseStoredPoint(
  latitude: unknown,
  longitude: unknown,
): LocationPoint | null {
  const lat = typeof latitude === "number" ? latitude : parseFloat(String(latitude ?? ""));
  const lng = typeof longitude === "number" ? longitude : parseFloat(String(longitude ?? ""));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export const formatPoint = (p: LocationPoint): string =>
  `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

/** Contained Maps failure — a billing/key error must not blank the host form. */
class MapErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[LocationPointPicker] map failed to render:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: 220,
            background: "var(--console-ground)",
            border: "1px solid var(--console-line)",
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
          data-testid="location-picker-map-unavailable"
        >
          <MapPin style={{ width: 22, height: 22, color: "var(--console-faint)" }} />
          <span style={{ fontSize: 12, color: "var(--console-mid)" }}>
            Map unavailable — your typed location is still saved
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}

interface LocationPointPickerProps {
  /** The confirmed point currently held by the host form (null = none). */
  value: LocationPoint | null;
  /**
   * `location_precision` on the row being edited: 'exact' | 'neighborhood_centroid' | null.
   * Used for HONEST labelling only — this component never writes it.
   */
  precision?: string | null;
  /** What the earner typed (meeting point / service area / property location) — the geocode seed. */
  addressHint?: string;
  /**
   * Confirmed point, or null when the earner explicitly removes their pin.
   * Called ONLY on an explicit Confirm / Remove — never while typing or panning.
   */
  onChange: (point: LocationPoint | null) => void;
  label?: string;
  helpText?: string;
  idPrefix?: string;
}

export function LocationPointPicker({
  value,
  precision,
  addressHint = "",
  onChange,
  label = "Precise location (optional)",
  helpText = "Place a pin so travelers see exactly where this is, and so it shows on planning maps.",
  idPrefix = "location-point",
}: LocationPointPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [candidate, setCandidate] = useState<LocationPoint | null>(null);
  const [candidateLabel, setCandidateLabel] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A stored point that came from the migration-129 neighborhood centroid is
  // APPROXIMATE. Never relabel it as exact — say what it is.
  const isApproximate = !!value && precision === "neighborhood_centroid";
  const isExact = !!value && precision === "exact";
  // A freshly confirmed pin (parent holds a value the row didn't) is exact-to-be.
  const isPendingExact = !!value && !isExact && !isApproximate;

  const openPlacer = useCallback(() => {
    setError(null);
    setCandidate(value ?? null);
    setCandidateLabel(null);
    setQuery(addressHint.trim().split("\n")[0] ?? "");
    setOpen(true);
  }, [addressHint, value]);

  const runGeocode = useCallback(async () => {
    const address = query.trim();
    if (!address) {
      setError("Type an address or landmark to look up.");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      // The ONE server geocode path. The client must not geocode independently.
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
      if (res.status === 503) {
        setError("Address lookup is unavailable right now — drag the pin instead, or save the typed location as-is.");
        return;
      }
      if (res.status === 404) {
        setError("Couldn't find that. Try a fuller address, or drag the pin.");
        return;
      }
      if (!res.ok) {
        setError("Address lookup failed. Try again, or drag the pin.");
        return;
      }
      const data = await res.json();
      const point = parseStoredPoint(data?.lat, data?.lng);
      if (!point) {
        setError("Couldn't find that. Try a fuller address, or drag the pin.");
        return;
      }
      setCandidate(point);
      setCandidateLabel(typeof data?.formattedAddress === "string" ? data.formattedAddress : null);
    } catch {
      setError("Address lookup failed. Try again, or drag the pin.");
    } finally {
      setSearching(false);
    }
  }, [query]);

  const confirm = () => {
    if (!candidate) return;
    onChange(candidate);
    setOpen(false);
  };

  const mapCenter = useMemo(
    () => candidate ?? value ?? null,
    [candidate, value],
  );

  // Console dark-mode note: `.dark .console-scope` (index.css) overrides only the raw
  // --console-* tokens, NOT the shadcn semantic ones (--foreground/--background), so a
  // component that leans on `text-foreground` renders dark-on-dark inside the console.
  // Every piece of text/chrome here therefore carries its console token explicitly —
  // tokens only, never a raw hex (§17).
  const inkStyle = { color: "var(--console-ink)" };
  const midStyle = { color: "var(--console-mid)" };
  const outlineStyle = {
    color: "var(--console-ink)",
    background: "var(--console-card)",
    borderColor: "var(--console-line)",
  };

  // No Maps key ⇒ render nothing at all: the host form behaves exactly as it did before
  // this lane, and the row's existing coordinates are left untouched (the parent never
  // receives an onChange). Placed after every hook so the hook order is unconditional.
  if (!MAPS_KEY) return null;

  return (
    <div data-testid={`${idPrefix}-picker`}>
      <Label className="flex items-center gap-2" style={inkStyle}>
        <Crosshair className="w-4 h-4" />
        {label}
      </Label>
      <p className="text-xs mt-1 mb-2" style={midStyle}>{helpText}</p>

      {/* ── Summary row: what is (or is not) on the row right now ── */}
      {/* Stacks on narrow viewports so the status text never has to share a line with
          the buttons (44px targets stay full-width-tappable on mobile). */}
      <div
        className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-md p-3"
        style={{ border: "1px solid var(--console-line)", background: "var(--console-ground)" }}
      >
        <div className="flex items-start gap-2 min-w-0 flex-1">
        <MapPin
          className="w-4 h-4 shrink-0 mt-0.5"
          style={{ color: value ? "var(--console-brand)" : "var(--console-faint)" }}
        />
        <div className="min-w-0 flex-1">
          {!value ? (
            <span className="text-sm" style={{ color: "var(--console-mid)" }} data-testid={`${idPrefix}-status-none`}>
              No pin placed — only your typed location is shown.
            </span>
          ) : isApproximate ? (
            <span className="text-sm" style={{ color: "var(--console-ink)" }} data-testid={`${idPrefix}-status-approximate`}>
              Approximate location from your neighborhood
              <span className="block text-xs" style={{ color: "var(--console-mid)" }}>
                {formatPoint(value)} · place a pin to make it exact
              </span>
            </span>
          ) : (
            <span className="text-sm" style={{ color: "var(--console-ink)" }} data-testid={`${idPrefix}-status-exact`}>
              {isPendingExact ? "Pin placed — saves with this listing" : "Exact location confirmed"}
              <span className="block text-xs" style={{ color: "var(--console-mid)" }}>
                {formatPoint(value)}
              </span>
            </span>
          )}
        </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            style={outlineStyle}
            onClick={openPlacer}
            data-testid={`${idPrefix}-open`}
          >
            <Crosshair className="w-4 h-4 mr-1.5" />
            {value ? "Adjust pin" : "Place on map"}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-[44px]"
              style={midStyle}
              onClick={() => {
                onChange(null);
                setCandidate(null);
                setOpen(false);
              }}
              data-testid={`${idPrefix}-remove`}
            >
              <X className="w-4 h-4 mr-1.5" />
              Remove
            </Button>
          )}
        </div>
      </div>

      {/* ── Placer: look up what they typed, then confirm or drag ── */}
      {open && (
        <div
          className="mt-3 rounded-md p-3 space-y-3"
          style={{ border: "1px solid var(--console-line)", background: "var(--console-card)" }}
          data-testid={`${idPrefix}-placer`}
        >
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id={`${idPrefix}-query`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runGeocode();
                }
              }}
              placeholder="Address or landmark, e.g. Kiyomizu-dera, Kyoto"
              className="min-h-[44px]"
              style={outlineStyle}
              data-testid={`${idPrefix}-query`}
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] shrink-0"
              style={outlineStyle}
              onClick={() => void runGeocode()}
              disabled={searching}
              data-testid={`${idPrefix}-search`}
            >
              {searching ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <MapPin className="w-4 h-4 mr-1.5" />}
              Find
            </Button>
          </div>

          {error && (
            <p
              className="text-xs flex items-start gap-1.5"
              style={{ color: "var(--console-warn)" }}
              data-testid={`${idPrefix}-error`}
            >
              <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
              {error}
            </p>
          )}

          <MapErrorBoundary>
            <div
              style={{
                height: 220,
                borderRadius: 8,
                overflow: "hidden",
                border: "1px solid var(--console-line)",
                background: "var(--console-ground)",
              }}
              data-testid={`${idPrefix}-map`}
            >
              <APIProvider apiKey={MAPS_KEY}>
                <Map
                  mapId={`${idPrefix}-map`}
                  defaultCenter={mapCenter ?? { lat: 35.0116, lng: 135.7681 }}
                  center={mapCenter ?? undefined}
                  defaultZoom={mapCenter ? 16 : 11}
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                  style={{ width: "100%", height: "100%" }}
                  onClick={(e) => {
                    const ll = e.detail?.latLng;
                    if (ll) {
                      setCandidate({ lat: ll.lat, lng: ll.lng });
                      setCandidateLabel(null);
                    }
                  }}
                >
                  {candidate && (
                    <AdvancedMarker
                      position={candidate}
                      draggable
                      onDragEnd={(e) => {
                        const ll = (e as any)?.latLng;
                        const lat = typeof ll?.lat === "function" ? ll.lat() : ll?.lat;
                        const lng = typeof ll?.lng === "function" ? ll.lng() : ll?.lng;
                        const next = parseStoredPoint(lat, lng);
                        if (next) {
                          setCandidate(next);
                          setCandidateLabel(null);
                        }
                      }}
                    >
                      <div
                        style={{
                          background: "var(--console-brand)",
                          color: "#FFFFFF",
                          borderRadius: 20,
                          padding: "4px 9px",
                          fontSize: 11,
                          fontWeight: 700,
                          boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Drag me
                      </div>
                    </AdvancedMarker>
                  )}
                </Map>
              </APIProvider>
            </div>
          </MapErrorBoundary>

          <p className="text-xs" style={midStyle} data-testid={`${idPrefix}-candidate`}>
            {candidate
              ? `${candidateLabel ? `${candidateLabel} · ` : ""}${formatPoint(candidate)} — drag the pin or tap the map to adjust, then confirm.`
              : "Find your address above, or tap the map to drop a pin."}
          </p>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="min-h-[44px]"
              disabled={!candidate}
              onClick={confirm}
              data-testid={`${idPrefix}-confirm`}
            >
              <Check className="w-4 h-4 mr-1.5" />
              Confirm this location
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-[44px]"
              style={midStyle}
              onClick={() => {
                setOpen(false);
                setCandidate(null);
                setError(null);
              }}
              data-testid={`${idPrefix}-cancel`}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
