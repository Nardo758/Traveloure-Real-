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
 */
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from "react-leaflet";
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

function pinDivIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${BRAND};border:3px solid ${CARD};box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function stopDivIcon(position: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${CARD};color:${BRAND};border:2.5px solid ${BRAND};box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;font-family:'Inter',-apple-system,sans-serif;">${position}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/** Fits the viewport to everything real: pin (plus its radius ring extent) + located stops. */
function FitToContent({
  pin,
  radiusKm,
  located,
}: {
  pin: ServicePinView | null;
  radiusKm: number | null;
  located: Array<{ lat: number; lng: number }>;
}) {
  const map = useMap();
  const fitKey = `${pin ? `${pin.lat}:${pin.lng}:${radiusKm ?? 0}` : ""}|${located
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
  stops = [],
  height = 320,
  testIdPrefix = "service-location-map",
}: {
  /** The service's CONFIRMED meeting pin (migration-129 latitude/longitude), or null. */
  pin: ServicePinView | null;
  /** Popup label for the pin (e.g. the meeting point text or service name). */
  pinLabel?: string | null;
  /** serviceRadius in km — rendered as a display-only ring around the pin. */
  radiusKm?: number | null;
  /** Full ordered stop list; unlocated stops are counted but never drawn. */
  stops?: ServiceRouteStopView[];
  height?: number | string;
  testIdPrefix?: string;
}) {
  const located = stops
    .filter((s): s is ServiceRouteStopView & { lat: number; lng: number } => s.lat !== null && s.lng !== null)
    .sort((a, b) => a.position - b.position);

  // §13: nothing real to draw ⇒ no map at all (the caller shows its own "no location yet" state).
  if (!pin && located.length === 0) return null;

  const center: [number, number] = pin ? [pin.lat, pin.lng] : [located[0].lat, located[0].lng];
  const showConnector = located.length >= 2;

  return (
    <div style={{ position: "relative", width: "100%", height }} data-testid={testIdPrefix}>
      <MapContainer center={center} zoom={13} style={{ width: "100%", height: "100%" }} scrollWheelZoom={false}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <FitToContent pin={pin} radiusKm={radiusKm ?? null} located={located} />
        {pin && radiusKm && radiusKm > 0 && (
          <Circle
            center={[pin.lat, pin.lng]}
            radius={radiusKm * 1000}
            pathOptions={{ color: BRAND, weight: 1.5, opacity: 0.5, fillColor: BRAND, fillOpacity: 0.07 }}
          />
        )}
        {showConnector && (
          <Polyline
            positions={located.map((s) => [s.lat, s.lng] as [number, number])}
            pathOptions={{ color: BRAND, weight: 2.5, opacity: 0.7, dashArray: "6 8" }}
          />
        )}
        {pin && (
          <Marker position={[pin.lat, pin.lng]} icon={pinDivIcon()}>
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
          <Marker key={s.id} position={[s.lat, s.lng]} icon={stopDivIcon(s.position)}>
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
