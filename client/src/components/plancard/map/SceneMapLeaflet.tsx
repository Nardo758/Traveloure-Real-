/**
 * The Leaflet / OpenStreetMap renderer of a `MapScene` — the automatic fallback when Google is not
 * available (step 5 ruling 9). It draws the SAME `sceneMarkers(scene)` list the Google renderer
 * draws, with the same testids, so a pin, a gold moved stop, a ghost and the anchor look the same on
 * either. Tiles come from deployment config (`GET /api/maps/tiles`); ODbL attribution is always drawn.
 *
 * GC-1 (ledger `2026-10-17-gc1-google-coords`): it draws NO leg lines and no minutes — a leg is a Google route,
 * and this is not a Google map. It is mounted only for a day whose every located stop AND located anchor has a
 * non-Google point (`leafletMountPoints`); otherwise the map shows the day as a list. A Google-derived anchor
 * draws no marker and frames nothing here (`leafletSceneInputs`).
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_DISTRICT_ZOOM, clampFramingZoom, mapFraming } from "@/lib/map-framing";
import { ANCHOR_COLOR, AREA_PIN_STYLE, BROWSE_TEAL, PIN_STYLE, areaPinLabel, escapeHtml, leafletSceneInputs, sceneMarkers, type MapArea, type MapScene, type MarkerDescriptor } from "@/lib/map-scene";
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

/** Audit E4: a neighbourhood is a dot and its (escaped) name — no shape, nothing to click. */
function areaIcon(a: MapArea): L.DivIcon {
  const l = areaPinLabel(a);
  const st = AREA_PIN_STYLE;
  return L.divIcon({
    className: "",
    html: `<div data-testid="${l.testId}" style="display:flex;align-items:center;gap:4px;white-space:nowrap;pointer-events:none;"><span style="width:${st.dotSize}px;height:${st.dotSize}px;border-radius:50%;background:${st.dot};"></span><span style="color:${st.text};font-size:${st.fontSize}px;font-weight:${st.fontWeight};text-shadow:${st.halo};font-family:Inter,sans-serif;">${escapeHtml(l.text)}</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [st.dotSize / 2, st.dotSize / 2],
  });
}

function Framing({ scene }: { scene: MapScene }) {
  const map = useMap();
  // GC-1 (rows 196/197/218): a Google-derived anchor is not a framing point here (`leafletSceneInputs`).
  const pts = leafletSceneInputs(scene).framePoints;
  const key = pts.map((p) => `${p.lat}:${p.lng}`).join("|");
  useEffect(() => {
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

export function SceneMapLeaflet({ scene, center, selectedId, onSelect, onSelectBrowse }: Omit<SceneMapProps, "legs">) {
  const { data: tiles } = useQuery<{ url: string; attribution: string }>({ queryKey: ["/api/maps/tiles"], staleTime: Infinity });
  // GC-1: the SAME marker list, minus a Google-derived anchor (named in the legend only).
  const { markers } = leafletSceneInputs(scene, sceneMarkers(scene));
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={MAP_DISTRICT_ZOOM - 1} style={{ width: "100%", height: "100%" }} scrollWheelZoom={false}>
      <TileLayer
        url={tiles?.url ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
        attribution={tiles?.attribution ?? "© OpenStreetMap contributors"}
      />
      <Framing scene={scene} />
      {scene.areas.map((a) => (
        <Marker key={a.slug} position={[a.lat, a.lng]} icon={areaIcon(a)} title={a.name} interactive={false} keyboard={false} zIndexOffset={-1000} />
      ))}
      {scene.connector.length > 1 ? (
        <Polyline positions={scene.connector.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: "#64748B", weight: 2, opacity: 0.6 }} />
      ) : null}
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
