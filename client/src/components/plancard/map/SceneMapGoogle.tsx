/**
 * The Google renderer of a `MapScene` (step 5; R-d; ruling 9). It draws the scene and nothing else —
 * every pin, connector, ghost, anchor and Browse marker comes from `sceneMarkers(scene)` and the
 * scene's geometry, the same list the Leaflet renderer draws, so the two never disagree. A neighbourhood
 * is a labelled pin from `scene.areas` (`areaPinLabel`), never a shape (audit E4).
 */
import { useEffect } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { MapMarker, GOOGLE_MAPS_MAP_ID } from "@/components/ui/map-marker";
import { Polyline } from "@/components/ui/map-polyline";
import { clampFramingZoom, mapFraming } from "@/lib/map-framing";
import { ANCHOR_COLOR, AREA_PIN_STYLE, BROWSE_TEAL, PIN_STYLE, areaPinLabel, sceneMarkers, type MapScene } from "@/lib/map-scene";
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

/** Audit E4: a neighbourhood is a dot and its name — no shape, nothing to click. */
function AreaPins({ scene }: { scene: MapScene }) {
  return (
    <>
      {scene.areas.map((a) => {
        const l = areaPinLabel(a);
        return (
          <MapMarker
            key={l.testId}
            position={{ lat: a.lat, lng: a.lng }}
            title={l.title}
            label={GOOGLE_MAPS_MAP_ID ? undefined : { text: l.text, fontSize: `${AREA_PIN_STYLE.fontSize}px`, fontWeight: String(AREA_PIN_STYLE.fontWeight), color: AREA_PIN_STYLE.text }}
          >
            <div data-testid={l.testId} style={{ display: "flex", alignItems: "center", gap: 4, pointerEvents: "none" }}>
              <span style={{ width: AREA_PIN_STYLE.dotSize, height: AREA_PIN_STYLE.dotSize, borderRadius: "50%", background: AREA_PIN_STYLE.dot }} />
              <span style={{ color: AREA_PIN_STYLE.text, fontSize: AREA_PIN_STYLE.fontSize, fontWeight: AREA_PIN_STYLE.fontWeight, textShadow: AREA_PIN_STYLE.halo, whiteSpace: "nowrap" }}>{l.text}</span>
            </div>
          </MapMarker>
        );
      })}
    </>
  );
}

function Scene({ scene, selectedId, onSelect, onSelectBrowse, legs }: Omit<SceneMapProps, "center">) {
  const markers = sceneMarkers(scene);
  return (
    <>
      <Framing scene={scene} />
      <AreaPins scene={scene} />
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
