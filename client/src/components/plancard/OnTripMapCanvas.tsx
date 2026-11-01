/**
 * Row 185 J5, screen: the Leaflet canvas behind `OnTripMapPanel`. Lazy-loaded (Leaflet needs a window).
 *
 * Draws only the projection's own points: a numbered pin per stop (projection order), a ★ for the chosen
 * stay, and a ring on the current leg's two ends. No polyline (GC-1), no device position, no geocode.
 * OpenStreetMap attribution is always drawn.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { OnTripMap } from "@shared/on-trip-map";
import { ON_TRIP_MAP_OSM_ATTRIBUTION, type OnTripMapLayer } from "@/lib/on-trip-map-copy";

function pinIcon(label: string, onLeg: boolean, testId: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div data-testid="${testId}" style="width:26px;height:26px;border-radius:50%;background:#1A1A18;color:#fff;border:3px solid ${onLeg ? "var(--coral-fill)" : "#fff"};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;font-family:Inter,sans-serif;">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function stayIcon(onLeg: boolean): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div data-testid="on-trip-map-stay" style="width:28px;height:28px;border-radius:8px;background:#7A7A72;color:#fff;border:3px solid ${onLeg ? "var(--coral-fill)" : "#fff"};display:flex;align-items:center;justify-content:center;font-size:14px;">★</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function Framing({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  const key = points.map((p) => p.join(":")).join("|");
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

export default function OnTripMapCanvas({ map, layers }: { map: OnTripMap; layers: Record<OnTripMapLayer, boolean> }) {
  const { data: tiles } = useQuery<{ url: string; attribution: string }>({ queryKey: ["/api/maps/tiles"], staleTime: Infinity });
  const legEnds = new Set(map.leg && layers.leg ? [map.leg.toItemId, map.leg.fromItemId].filter((v): v is string => !!v) : []);
  const showStops = layers.stops || legEnds.size > 0;
  const stops = showStops ? map.stops.filter((s) => layers.stops || legEnds.has(s.id)) : [];
  const stay = map.stay && (layers.stay || legEnds.has(map.stay.itemId)) ? map.stay : null;
  const points: Array<[number, number]> = [...stops.map((s) => [s.lat, s.lng] as [number, number]), ...(stay ? [[stay.lat, stay.lng] as [number, number]] : [])];
  const first = points[0] ?? (map.stay ? ([map.stay.lat, map.stay.lng] as [number, number]) : ([map.stops[0].lat, map.stops[0].lng] as [number, number]));
  return (
    <MapContainer center={first} zoom={14} style={{ width: "100%", height: "100%" }} scrollWheelZoom={false}>
      <TileLayer url={tiles?.url ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} attribution={tiles?.attribution ?? ON_TRIP_MAP_OSM_ATTRIBUTION} />
      <Framing points={points} />
      {stops.map((s) => {
        const n = map.stops.findIndex((x) => x.id === s.id) + 1;
        return <Marker key={s.id} position={[s.lat, s.lng]} icon={pinIcon(String(n), legEnds.has(s.id), `on-trip-map-stop-${s.id}`)} keyboard={false} />;
      })}
      {stay ? <Marker key="stay" position={[stay.lat, stay.lng]} icon={stayIcon(legEnds.has(stay.itemId))} keyboard={false} /> : null}
    </MapContainer>
  );
}
