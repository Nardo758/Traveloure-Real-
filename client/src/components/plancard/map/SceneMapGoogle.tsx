/**
 * The Google renderer of a `MapScene` (step 5; R-d; ruling 9). It draws the scene and nothing else —
 * every pin, connector, ghost, anchor, area and Browse marker comes from `sceneMarkers(scene)` and
 * the scene's geometry, the same list the Leaflet renderer draws, so the two never disagree.
 */
import { useEffect } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { MapMarker, GOOGLE_MAPS_MAP_ID } from "@/components/ui/map-marker";
import { Polyline } from "@/components/ui/map-polyline";
import { clampFramingZoom, mapFraming } from "@/lib/map-framing";
import { ANCHOR_COLOR, BROWSE_TEAL, PIN_STYLE, sceneMarkers, type MapScene } from "@/lib/map-scene";
import type { SceneLeg } from "./scene-legs";

export interface SceneMapProps {
  scene: MapScene;
  center: { lat: number; lng: number };
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSelectBrowse: (id: string) => void;
  legs?: SceneLeg[];
}

function Framing({ scene }: { scene: MapScene }) {
  const map = useMap();
  const key = [...scene.pins.map((p) => `${p.id}:${p.lat}:${p.lng}`), scene.anchor ? `a:${scene.anchor.lat}:${scene.anchor.lng}` : ""].join("|");
  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    const pts = [...scene.pins.map((p) => ({ lat: p.lat, lng: p.lng })), ...(scene.anchor ? [{ lat: scene.anchor.lat, lng: scene.anchor.lng }] : [])];
    const framing = mapFraming(pts);
    if (framing.kind === "center") {
      map.setCenter(framing.center);
      map.setZoom(framing.zoom);
    } else if (framing.kind === "bounds") {
      const bounds = new google.maps.LatLngBounds();
      pts.forEach((p) => bounds.extend(p));
      google.maps.event.addListenerOnce(map, "idle", () => {
        const clamped = clampFramingZoom(map.getZoom(), framing.maxZoom);
        if (clamped !== null) map.setZoom(clamped);
      });
      map.fitBounds(bounds, 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/** Neighbourhood shading — a soft disc at each centroid (stronger while the AnchorPanel is open). */
function Areas({ scene }: { scene: MapScene }) {
  const map = useMap();
  useEffect(() => {
    if (!map || typeof google === "undefined" || !scene.areas.length) return;
    const circles = scene.areas.map(
      (a) =>
        new google.maps.Circle({
          map,
          center: { lat: a.lat, lng: a.lng },
          radius: 700,
          strokeColor: ANCHOR_COLOR,
          strokeOpacity: scene.areaStyle.strokeOpacity,
          strokeWeight: 1,
          fillColor: ANCHOR_COLOR,
          fillOpacity: scene.areaStyle.fillOpacity,
          clickable: false,
        }),
    );
    return () => circles.forEach((c) => c.setMap(null));
  }, [map, scene.areas, scene.areaStyle]);
  return null;
}

function Scene({ scene, selectedId, onSelect, onSelectBrowse, legs }: Omit<SceneMapProps, "center">) {
  const markers = sceneMarkers(scene);
  return (
    <>
      <Framing scene={scene} />
      <Areas scene={scene} />
      {scene.connector.length > 1 ? (
        <Polyline path={scene.connector} strokeColor="#64748B" strokeOpacity={0.6} strokeWeight={2} />
      ) : null}
      {(legs ?? []).map((l) => (
        <Polyline key={l.id} path={[l.from, l.to]} strokeColor={l.color} strokeOpacity={0.8} strokeWeight={3} />
      ))}
      {markers.map((m) => {
        if (m.kind === "pin") {
          const st = PIN_STYLE[m.state];
          return (
            <MapMarker key={m.testId} position={{ lat: m.lat, lng: m.lng }} title={m.title} label={GOOGLE_MAPS_MAP_ID ? undefined : m.label} onClick={() => onSelect(m.state === "ghost" ? null : m.id)}>
              <div
                data-testid={m.testId}
                data-pin-state={m.state}
                aria-selected={selectedId === m.id}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: st.fill,
                  color: st.text,
                  opacity: st.opacity,
                  border: `2px ${st.dashed ? "dashed" : "solid"} ${selectedId === m.id ? "#111" : st.ring}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {m.label}
              </div>
            </MapMarker>
          );
        }
        if (m.kind === "anchor") {
          return (
            <MapMarker key={m.testId} position={{ lat: m.lat, lng: m.lng }} title={m.title} label={GOOGLE_MAPS_MAP_ID ? undefined : "★"}>
              <div data-testid={m.testId} data-anchor-kind={m.anchorKind} style={{ width: 28, height: 28, borderRadius: 8, background: ANCHOR_COLOR, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                ★
              </div>
            </MapMarker>
          );
        }
        return (
          <MapMarker key={m.testId} position={{ lat: m.lat, lng: m.lng }} title={m.title} onClick={() => onSelectBrowse(m.id)}>
            <div data-testid={m.testId} style={{ width: 18, height: 18, borderRadius: "50%", background: "transparent", border: `3px solid ${BROWSE_TEAL}` }} />
          </MapMarker>
        );
      })}
    </>
  );
}

export function SceneMapGoogle({ apiKey, onLoad, onError, ...props }: SceneMapProps & { apiKey: string; onLoad: () => void; onError: () => void }) {
  return (
    <APIProvider apiKey={apiKey} onLoad={onLoad} onError={onError}>
      <Map
        mapId={GOOGLE_MAPS_MAP_ID}
        style={{ width: "100%", height: "100%" }}
        defaultZoom={13}
        defaultCenter={props.center}
        gestureHandling="greedy"
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
      >
        <Scene {...props} />
      </Map>
    </APIProvider>
  );
}
