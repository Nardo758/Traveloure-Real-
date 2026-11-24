/**
 * A7 part 1 - the canvas inside the map beside the days. Loaded on demand by `DaysMapPanel`, so the panel's own
 * rules can be read and tested without a map library, and a plan that never opens "Days and map" never pays for it.
 *
 * It draws the map view's own canvases and keeps GC-1: the OpenStreetMap canvas mounts only when the panel says
 * every located point shown is a non-Google point; otherwise the stops are listed.
 */
import { SceneMapGoogle } from "@/components/plancard/map/SceneMapGoogle";
import { SceneMapLeaflet } from "@/components/plancard/map/SceneMapLeaflet";
import { MapFallbackList } from "@/components/plancard/MapControlCenter";
import type { PlanCardActivity } from "@/components/plancard/plancard-types";
import type { MapRenderer } from "@/lib/map-renderer";
import type { MapScene } from "@/lib/map-scene";
import { MAPS_BROWSER_KEY } from "@/lib/maps-browser-key";

export interface DaysMapCanvasProps {
  tripId: string;
  scene: MapScene;
  center: { lat: number; lng: number };
  renderer: MapRenderer;
  leafletMapAllowed: boolean;
  activities: readonly PlanCardActivity[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onGoogleLoad: () => void;
  onGoogleError: () => void;
  /** R3 only: pins that coincide are nudged apart; old page passes nothing. */
  r3?: boolean;
}

const noBrowse = () => {};

export default function DaysMapCanvas({ tripId, scene, center, renderer, leafletMapAllowed, activities, selectedId, onSelect, onGoogleLoad, onGoogleError , r3 = false}: DaysMapCanvasProps) {
  if (renderer === "google") {
    return (
      <SceneMapGoogle apiKey={MAPS_BROWSER_KEY} onLoad={onGoogleLoad} onError={onGoogleError} scene={scene} center={center} selectedId={selectedId} onSelect={onSelect} onSelectBrowse={noBrowse} />
    );
  }
  if (leafletMapAllowed) {
    return <SceneMapLeaflet scene={scene} center={center} selectedId={selectedId} onSelect={onSelect} onSelectBrowse={noBrowse} r3={r3} />;
  }
  return <MapFallbackList tripId={tripId} activities={activities} />;
}
