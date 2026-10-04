/**
 * The Leaflet / OpenStreetMap renderer of a `MapScene` — the automatic fallback when Google is not
 * available (step 5 ruling 9). It draws the SAME `sceneMarkers(scene)` list the Google renderer
 * draws, with the same testids, so a pin, a gold moved stop, a ghost and the anchor look the same on
 * either. Tiles come from deployment config (`GET /api/maps/tiles`); ODbL attribution is always drawn.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_DISTRICT_ZOOM, clampFramingZoom, mapFraming } from "@/lib/map-framing";
import { ANCHOR_COLOR, BROWSE_TEAL, PIN_STYLE, sceneMarkers, type MapScene, type MarkerDescriptor } from "@/lib/map-scene";
import type { SceneMapProps } from "./SceneMapGoogle";

function iconFor(m: MarkerDescriptor, selected: boolean): L.DivIcon {
  if (m.kind === "pin") {
    const st = PIN_STYLE[m.state];
    return L.divIcon({
      className: "",
      html: `<div data-testid="${m.testId}" data-pin-state="${m.state}" aria-selected="${selected}" style="width:26px;height:26px;border-radius:50%;background:${st.fill};color:${st.text};opacity:${st.opacity};border:2px ${st.dashed ? "dashed" : "solid"} ${selected ? "#111" : st.ring};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;font-family:Inter,sans-serif;">${m.label}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }
  if (m.kind === "anchor") {
    return L.divIcon({
      className: "",
      html: `<div data-testid="${m.testId}" data-anchor-kind="${m.anchorKind}" style="width:28px;height:28px;border-radius:8px;background:${ANCHOR_COLOR};color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;">★</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }
  return L.divIcon({
    className: "",
    html: `<div data-testid="${m.testId}" style="width:18px;height:18px;border-radius:50%;background:transparent;border:3px solid ${BROWSE_TEAL};"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function Framing({ scene }: { scene: MapScene }) {
  const map = useMap();
  const key = [...scene.pins.map((p) => `${p.id}:${p.lat}:${p.lng}`), scene.anchor ? `a:${scene.anchor.lat}:${scene.anchor.lng}` : ""].join("|");
  useEffect(() => {
    const pts = [...scene.pins.map((p) => ({ lat: p.lat, lng: p.lng })), ...(scene.anchor ? [{ lat: scene.anchor.lat, lng: scene.anchor.lng }] : [])];
    const framing = mapFraming(pts);
    if (framing.kind === "center") map.setView([framing.center.lat, framing.center.lng], framing.zoom);
    else if (framing.kind === "bounds") {
      map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number])), { padding: [48, 48] });
      const clamped = clampFramingZoom(map.getZoom(), framing.maxZoom);
      if (clamped !== null) map.setZoom(clamped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

export function SceneMapLeaflet({ scene, center, selectedId, onSelect, onSelectBrowse, legs }: SceneMapProps) {
  const { data: tiles } = useQuery<{ url: string; attribution: string }>({ queryKey: ["/api/maps/tiles"], staleTime: Infinity });
  const markers = sceneMarkers(scene);
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={MAP_DISTRICT_ZOOM - 1} style={{ width: "100%", height: "100%" }} scrollWheelZoom={false}>
      <TileLayer
        url={tiles?.url ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
        attribution={tiles?.attribution ?? "© OpenStreetMap contributors"}
      />
      <Framing scene={scene} />
      {scene.areas.map((a) => (
        <Circle key={a.slug} center={[a.lat, a.lng]} radius={700} pathOptions={{ color: ANCHOR_COLOR, weight: 1, opacity: 0.35, fillOpacity: 0.08 }} />
      ))}
      {scene.connector.length > 1 ? (
        <Polyline positions={scene.connector.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: "#64748B", weight: 2, opacity: 0.6 }} />
      ) : null}
      {(legs ?? []).map((l) => (
        <Polyline key={l.id} positions={[[l.from.lat, l.from.lng], [l.to.lat, l.to.lng]]} pathOptions={{ color: l.color, weight: 3, opacity: 0.8 }}>
          {l.durationLabel ? <Tooltip permanent direction="center">{l.durationLabel}</Tooltip> : null}
        </Polyline>
      ))}
      {markers.map((m) => (
        <Marker
          key={m.testId}
          position={[m.lat, m.lng]}
          icon={iconFor(m, m.kind === "pin" && selectedId === m.id)}
          title={m.title}
          eventHandlers={{
            click: () => {
              if (m.kind === "pin") onSelect(m.state === "ghost" ? null : m.id);
              else if (m.kind === "browse") onSelectBrowse(m.id);
            },
          }}
        />
      ))}
    </MapContainer>
  );
}
