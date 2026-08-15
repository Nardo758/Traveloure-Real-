/**
 * ServiceLocationMap — CLAUDE.md ruling 22(c): the ONE single-service map renderer, shared by
 * the traveler service-detail page and the provider Catalog map view.
 *
 * Honesty rules it enforces itself (so no caller can get them wrong):
 *  - Renders NOTHING when the service has no confirmed pin AND no located stops — never a
 *    city-center fallback (§13).
 *  - Only LOCATED stops get markers; the connector is a straight DASHED line drawn in stop
 *    order and labeled as sequence, not travel routing. No distances are computed or shown.
 *  - Leaflet + OSM tiles (keyless, works for travelers regardless of Google key state);
 *    ODbL attribution required and included.
 *
 * Styling: console tokens with raw-hex fallbacks so the component reads correctly on both the
 * console (tokens defined) and traveler surfaces (tokens absent).
 *
 * AUTHORING AFFORDANCES (ruling 62 / QA_PUNCH_LIST P1, Aug 11 2026) are OPT-IN via the
 * `onStopDragEnd` / `onCanvasClick` props. A traveler surface passes neither, so its markers stay
 * static and its map clicks do nothing — exactly as before. The provider Catalog map view passes
 * both, which is what closes the reported "adding pins didn't work" gap: before this, a route
 * stop could ONLY be located by name→geocode, so a stop the geocoder missed could not be pinned
 * by hand at all.
 */
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Circle, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const BRAND = "var(--console-brand, #E85D55)";
const CARD = "var(--console-card, #FFFFFF)";
const INK = "var(--console-ink, #1A1A18)";
const MID = "var(--console-mid, #7A7A72)";

export interface ServiceRouteStopView {
  id: string;
  position: number;
  name: string;
  lat: number | null;
  lng: number | null;
}

export interface ServicePinView {
  lat: number;
  lng: number;
}

/** Tolerant decimal-column parser (rows store lat/lng as strings). Range-checked; null on
 *  anything unreal — mirrors location-point-picker's parseStoredPoint without dragging the
 *  Google-Maps picker module into traveler bundles. */
export function parseLatLng(
  lat: string | number | null | undefined,
  lng: string | number | null | undefined,
): ServicePinView | null {
  if (lat === null || lat === undefined || lat === "" || lng === null || lng === undefined || lng === "") return null;
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;
  if (Math.abs(nLat) > 90 || Math.abs(nLng) > 180) return null;
  return { lat: nLat, lng: nLng };
}

function pinDivIcon(testId: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div data-testid="${testId}" style="width:26px;height:26px;border-radius:50%;background:${BRAND};border:3px solid ${CARD};box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/** D-5 sibling listing marker — smaller and neutral so the selected listing's pin stays primary. */
function siblingDivIcon(testId: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div data-testid="${testId}" style="width:18px;height:18px;border-radius:50%;background:${CARD};border:2.5px solid ${MID};box-shadow:0 2px 6px rgba(0,0,0,0.25);cursor:pointer;"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function stopDivIcon(position: number, testId: string, draggable: boolean): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div data-testid="${testId}" style="width:22px;height:22px;border-radius:50%;background:${CARD};color:${BRAND};border:2.5px solid ${BRAND};box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;font-family:'Inter',-apple-system,sans-serif;${
      draggable ? "cursor:grab;" : ""
    }">${position}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/**
 * Authoring-only canvas click bridge (ruling 62 / QA_PUNCH_LIST P1). Mounted ONLY when the
 * owner surface has explicitly armed "place a stop here" — a BARE map click never places
 * anything, because that would fight pan/zoom and drop pins the provider never meant.
 */
function CanvasClickBridge({ onCanvasClick }: { onCanvasClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onCanvasClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Fits the viewport to everything real: pin (plus its radius ring extent) + located stops. */
function FitToContent({
  pin,
  radiusKm,
  located,
  authoring = false,
}: {
  pin: ServicePinView | null;
  radiusKm: number | null;
  located: Array<{ lat: number; lng: number }>;
  /** On the authoring canvas the viewport must NOT jump on every drag-adjust — refit only
   *  when the SET of located things changes (a stop appears/disappears), not their values. */
  authoring?: boolean;
}) {
  const map = useMap();
  const fitKey = authoring
    ? `${pin ? `${pin.lat}:${pin.lng}:${radiusKm ?? 0}` : ""}|n=${located.length}`
    : `${pin ? `${pin.lat}:${pin.lng}:${radiusKm ?? 0}` : ""}|${located
        .map((s) => `${s.lat}:${s.lng}`)
        .join(",")}`;
  useEffect(() => {
    const points: [number, number][] = located.map((s) => [s.lat, s.lng]);
    if (pin) points.push([pin.lat, pin.lng]);
    if (points.length === 0) return;
    let bounds = L.latLngBounds(points);
    if (pin && radiusKm && radiusKm > 0) {
      bounds = bounds.extend(L.latLng(pin.lat, pin.lng).toBounds(radiusKm * 2000));
    }
    if (points.length === 1 && !(pin && radiusKm && radiusKm > 0)) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(bounds, { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  return null;
}

export function ServiceLocationMap({
  pin,
  pinLabel,
  radiusKm,
  surchargeZones,
  stops = [],
  height = 320,
  testIdPrefix = "service-location-map",
  onStopDragEnd,
  onCanvasClick,
  placementActive = false,
  siblingPins,
  onSiblingPinClick,
  labelPins = false,
}: {
  /** The service's CONFIRMED meeting pin (migration-129 latitude/longitude), or null. */
  pin: ServicePinView | null;
  /** Popup label for the pin (e.g. the meeting point text or service name). */
  pinLabel?: string | null;
  /** serviceRadius in km — rendered as a display-only ring around the pin. */
  radiusKm?: number | null;
  /**
   * Ruling 112 Q3 (mock's Layers card): travel-surcharge ZONES as display-only dashed rings
   * around the confirmed pin — the amounts are authored in Pricing & fees and CHARGED
   * server-side (ruling 81's resolver); this layer never computes or shows a distance (§13).
   * Rendered only when a pin exists — a ring has no centre without one.
   */
  surchargeZones?: ReadonlyArray<{ radiusKm: number; fee: string | number }> | null;
  /** Full ordered stop list; unlocated stops are counted but never drawn. */
  stops?: ServiceRouteStopView[];
  height?: number | string;
  testIdPrefix?: string;
  /**
   * AUTHORING ONLY (ruling 62 / QA_PUNCH_LIST P1). When supplied, located stop markers become
   * DRAGGABLE and report their new coordinates on drag end. The caller owns what that means —
   * on the Catalog map view it updates the DRAFT stop and sets the existing `dirty` flag;
   * nothing persists until the provider's explicit "Save route" (that dirty→save step IS the
   * L27-P3 confirm posture on this surface — there is no second dialog). Omitted on every
   * traveler surface, where markers stay static.
   */
  onStopDragEnd?: (stopId: string, lat: number, lng: number) => void;
  /**
   * AUTHORING ONLY. Mounted only while the caller has explicitly armed a placement mode — a
   * bare map click must never drop a pin (it would fight pan/zoom). Pass `undefined` to detach.
   */
  onCanvasClick?: (lat: number, lng: number) => void;
  /** Purely cosmetic: crosshair cursor + a visible "armed" ring while placement is on. */
  placementActive?: boolean;
  /**
   * Lane M (mock conformance D-5, Aug 15): the OTHER located listings of the same owner, drawn
   * as smaller neutral markers so the Catalog preview shows the whole footprint on ONE canvas —
   * the mock's "every located listing with name labels" rule. Display-only siblings: clicking
   * one only calls `onSiblingPinClick` (the Catalog selects that listing); they are never
   * draggable and carry no radius/zone/stop layers of their own. Traveler surfaces omit this.
   */
  siblingPins?: ReadonlyArray<{ id: string; lat: number; lng: number; label: string }> | null;
  onSiblingPinClick?: (id: string) => void;
  /** Permanent name labels on pins (the footprint view); popups-only when false (default). */
  labelPins?: boolean;
}) {
  const authoring = !!onStopDragEnd || !!onCanvasClick;
  const located = stops
    .filter((s): s is ServiceRouteStopView & { lat: number; lng: number } => s.lat !== null && s.lng !== null)
    .sort((a, b) => a.position - b.position);
  const siblings = siblingPins ?? [];

  // §13: nothing real to draw ⇒ no map at all (the caller shows its own "no location yet" state).
  if (!pin && located.length === 0 && siblings.length === 0) return null;

  const center: [number, number] = pin
    ? [pin.lat, pin.lng]
    : located.length > 0
      ? [located[0].lat, located[0].lng]
      : [siblings[0].lat, siblings[0].lng];
  const showConnector = located.length >= 2;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height,
        cursor: placementActive ? "crosshair" : undefined,
        outline: placementActive ? `2px solid ${BRAND}` : undefined,
        outlineOffset: placementActive ? -2 : undefined,
      }}
      data-testid={testIdPrefix}
      data-placement-active={placementActive ? "true" : "false"}
    >
      <MapContainer center={center} zoom={13} style={{ width: "100%", height: "100%" }} scrollWheelZoom={false}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <FitToContent
          pin={pin}
          radiusKm={radiusKm ?? null}
          located={[...located.map((s) => ({ lat: s.lat, lng: s.lng })), ...siblings.map((p) => ({ lat: p.lat, lng: p.lng }))]}
          authoring={authoring}
        />
        {onCanvasClick && <CanvasClickBridge onCanvasClick={onCanvasClick} />}
        {/* D-17 (mock conformance, Aug 15): the ring must be legible at default zoom — the old
            0.5/0.07 opacities read as absent against pale tiles. */}
        {pin && radiusKm && radiusKm > 0 && (
          <Circle
            center={[pin.lat, pin.lng]}
            radius={radiusKm * 1000}
            pathOptions={{ color: BRAND, weight: 2.5, opacity: 0.85, fillColor: BRAND, fillOpacity: 0.14 }}
          />
        )}
        {/* Ruling 112 Q3: surcharge-zone rings — dashed, amber, display-only. Each popup names
            the authored fee for a pickup landing in that ring; no distance is computed or shown. */}
        {pin &&
          (surchargeZones ?? [])
            .filter((z) => Number(z.radiusKm) > 0)
            .map((z, i) => (
              <Circle
                key={`zone-${i}`}
                center={[pin.lat, pin.lng]}
                radius={Number(z.radiusKm) * 1000}
                pathOptions={{ color: "#B08A3C", weight: 1.5, opacity: 0.6, dashArray: "5 7", fillColor: "#B08A3C", fillOpacity: 0.05 }}
              >
                <Popup>
                  <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", fontSize: 12.5, color: INK }}>
                    Travel-surcharge zone {i + 1} — pickups out to {Number(z.radiusKm)} km add ${Number(z.fee).toFixed(2)}.
                    <br />
                    <span style={{ opacity: 0.7 }}>Amounts are set in Pricing &amp; fees; the charge is applied at checkout.</span>
                  </div>
                </Popup>
              </Circle>
            ))}
        {showConnector && (
          <Polyline
            positions={located.map((s) => [s.lat, s.lng] as [number, number])}
            pathOptions={{ color: BRAND, weight: 2.5, opacity: 0.7, dashArray: "6 8" }}
          />
        )}
        {/* D-5 sibling pins: smaller neutral dots with permanent name labels — the footprint. */}
        {siblings.map((p) => (
          <Marker
            key={`sibling-${p.id}`}
            position={[p.lat, p.lng]}
            icon={siblingDivIcon(`${testIdPrefix}-sibling-${p.id}`)}
            eventHandlers={onSiblingPinClick ? { click: () => onSiblingPinClick(p.id) } : undefined}
          >
            <Tooltip permanent direction="bottom" offset={[0, 8]} className="service-map-pin-label">
              {p.label}
            </Tooltip>
          </Marker>
        ))}
        {pin && (
          <Marker position={[pin.lat, pin.lng]} icon={pinDivIcon(`${testIdPrefix}-pin`)}>
            {labelPins && pinLabel ? (
              <Tooltip permanent direction="bottom" offset={[0, 10]} className="service-map-pin-label">
                {pinLabel}
              </Tooltip>
            ) : null}
            {pinLabel ? (
              <Popup>
                <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", fontSize: 13, fontWeight: 700, color: INK }}>
                  {pinLabel}
                </div>
              </Popup>
            ) : null}
          </Marker>
        )}
        {located.map((s) => (
          <Marker
            key={s.id}
            position={[s.lat, s.lng]}
            icon={stopDivIcon(s.position, `${testIdPrefix}-stop-${s.position}`, !!onStopDragEnd)}
            draggable={!!onStopDragEnd}
            eventHandlers={
              onStopDragEnd
                ? {
                    dragend: (e: L.LeafletEvent) => {
                      const ll = (e.target as L.Marker).getLatLng();
                      // Range-check before handing coordinates back — the same posture as
                      // parseLatLng above; a drag can never produce a fabricated point.
                      const next = parseLatLng(ll.lat, ll.lng);
                      if (next) onStopDragEnd(s.id, next.lat, next.lng);
                    },
                  }
                : undefined
            }
          >
            <Popup>
              <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", minWidth: 120 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{s.name}</div>
                <div style={{ fontSize: 11.5, color: MID }}>Stop {s.position}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {showConnector && (
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            zIndex: 1000,
            background: CARD,
            color: MID,
            borderRadius: 7,
            padding: "3px 8px",
            fontSize: 11,
            fontFamily: "'Inter',-apple-system,sans-serif",
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          }}
          data-testid={`${testIdPrefix}-sequence-note`}
        >
          Stop order shown — not travel directions
        </div>
      )}
    </div>
  );
}
