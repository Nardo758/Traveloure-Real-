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
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_DISTRICT_ZOOM, clampFramingZoom, mapFraming } from "@/lib/map-framing";
import { spreadPinsPx } from "@/lib/map-pin-spread";
import { ANCHOR_COLOR, AREA_PIN_STYLE, BROWSE_TEAL, PIN_STYLE, areaPinLabel, escapeHtml, leafletSceneInputs, sceneMarkers, type MapArea, type MapScene, type MarkerDescriptor } from "@/lib/map-scene";
import type { SceneMapProps } from "./SceneMapGoogle";

function iconFor(m: MarkerDescriptor, selected: boolean, r3 = false): L.DivIcon {
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
    if (r3) {
      // R3: the ring carries no glyph (Leon, Nov 23 2026) - a hollow circle, nothing inside.
      return L.divIcon({
        className: "",
        html: `<div data-testid="${m.testId}" data-anchor-kind="${m.anchorKind}" style="width:28px;height:28px;background:transparent;"></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
    }
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

function Framing({ scene, r3 = false }: { scene: MapScene; r3?: boolean }) {
  const map = useMap();
  // GC-1 (rows 196/197/218): a Google-derived anchor is not a framing point here (`leafletSceneInputs`).
  const pts = leafletSceneInputs(scene).framePoints;
  const key = pts.map((p) => `${p.lat}:${p.lng}`).join("|");
  useEffect(() => {
    // The Leaflet project's prefix ("Leaflet |") is dropped in r3; the ODbL text stays.
    if (r3) map.attributionControl?.setPrefix(false);
  }, [map, r3]);
  useEffect(() => {
    if (r3) {
      // R3 (Leon, Nov 23 2026): fit the plan's own points, with a margin - no district-wide framing.
      if (pts.length === 0) return;
      if (pts.length === 1) {
        map.setView([pts[0].lat, pts[0].lng], Math.max(map.getZoom(), MAP_DISTRICT_ZOOM));
        return;
      }
      map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number])), { padding: [48, 48] });
      return;
    }
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

function SpreadMarkers({
  markers,
  r3,
  selectedId,
  onSelect,
  onSelectBrowse,
}: {
  markers: ReturnType<typeof sceneMarkers>;
  r3: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSelectBrowse: (id: string) => void;
}) {
  const map = useMap();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!r3) return;
    const bump = () => setTick((t) => t + 1);
    map.on("zoomend", bump);
    map.on("moveend", bump);
    return () => {
      map.off("zoomend", bump);
      map.off("moveend", bump);
    };
  }, [map, r3]);
  const positioned = useMemo(() => {
    if (!r3) return markers.map((m) => ({ m, position: [m.lat, m.lng] as [number, number] }));
    const px = markers.map((m) => {
      const p = map.latLngToContainerPoint([m.lat, m.lng]);
      return { ...m, x: p.x, y: p.y };
    });
    return spreadPinsPx(px).map((m) => {
      const ll = map.containerPointToLatLng([m.x, m.y]);
      return { m, position: [ll.lat, ll.lng] as [number, number] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, r3, map, tick]);
  return (
    <>
      {positioned.map(({ m, position }) => (
        <Marker
          key={m.testId}
          position={position}
          icon={iconFor(m, m.kind === "pin" && selectedId === m.id, r3)}
          title={m.title}
          zIndexOffset={r3 && m.kind === "anchor" ? 900 : 0}
          eventHandlers={{
            click: () => {
              if (m.kind === "pin") onSelect(m.state === "ghost" ? null : m.id);
              else if (m.kind === "browse") onSelectBrowse(m.id);
            },
          }}
        />
      ))}
    </>
  );
}

export function SceneMapLeaflet({ scene, center, selectedId, onSelect, onSelectBrowse, r3 = false }: Omit<SceneMapProps, "legs"> & { r3?: boolean }) {
  const { data: tiles } = useQuery<{ url: string; attribution: string }>({ queryKey: ["/api/maps/tiles"], staleTime: Infinity });
  // GC-1: the SAME marker list, minus a Google-derived anchor (named in the legend only).
  const { markers: rawMarkers } = leafletSceneInputs(scene, sceneMarkers(scene));
  const markers = rawMarkers;
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={MAP_DISTRICT_ZOOM - 1} style={{ width: "100%", height: "100%" }} scrollWheelZoom={false}>
      <TileLayer
        url={tiles?.url ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
        attribution={tiles?.attribution ?? "© OpenStreetMap contributors"}
      />
      <Framing scene={scene} r3={r3} />
      {scene.areas.map((a) => (
        <Marker key={a.slug} position={[a.lat, a.lng]} icon={areaIcon(a)} title={a.name} interactive={false} keyboard={false} zIndexOffset={-1000} />
      ))}
      {/* Row PS-1 (GC-1): pins only — no stop-to-stop line. */}
      {/* Row PS-1: pins only. In R3 the markers go through a screen-space pass that re-runs on every zoom/move settle. */}
        <SpreadMarkers
          markers={markers}
          r3={r3}
          selectedId={selectedId}
          onSelect={onSelect}
          onSelectBrowse={onSelectBrowse}
        />
    </MapContainer>
  );
}
