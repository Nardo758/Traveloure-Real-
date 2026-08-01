import type { ReactNode } from "react";
import { AdvancedMarker, Marker } from "@vis.gl/react-google-maps";

/**
 * Optional Cloud-registered Google Maps Map ID (VITE_GOOGLE_MAPS_MAP_ID).
 * AdvancedMarker only works when the <Map> has a real, Cloud-registered mapId.
 * When unset, maps must omit mapId and use standard Markers instead — passing
 * a placeholder string makes AdvancedMarkers silently invisible.
 */
export const GOOGLE_MAPS_MAP_ID: string | undefined =
  import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || undefined;

export interface MapMarkerProps {
  position: google.maps.LatLngLiteral;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: (e: google.maps.MapMouseEvent) => void;
  title?: string;
  /** Custom pin content — only rendered when a Map ID is configured (AdvancedMarker). */
  children?: ReactNode;
}

/**
 * Renders an AdvancedMarker (with custom children) when a Cloud Map ID is
 * configured, and falls back to a standard Marker (default red pin) otherwise,
 * so markers are always visible regardless of Map ID setup.
 */
export function MapMarker({
  position,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
  title,
  children,
}: MapMarkerProps) {
  if (GOOGLE_MAPS_MAP_ID) {
    return (
      <AdvancedMarker
        position={position}
        onClick={onClick}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title={title}
      >
        {children}
      </AdvancedMarker>
    );
  }
  return (
    <Marker
      position={position}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={title}
    />
  );
}
