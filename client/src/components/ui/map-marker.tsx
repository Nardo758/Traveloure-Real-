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

/** A 1x1 fully transparent image: passed as `icon`, it hides the default red pin and leaves the `label` text. */
export const HIDDEN_PIN_ICON: google.maps.Icon = {
  url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')}`,
};

export interface MapMarkerProps {
  position: google.maps.LatLngLiteral;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: (e: google.maps.MapMouseEvent) => void;
  title?: string;
  /** Standard-marker text, used when no Cloud Map ID is configured. */
  label?: string | google.maps.MarkerLabel;
  /**
   * Standard-marker icon, used only when no Cloud Map ID is configured. Omit it and Google's default red pin is drawn, as before.
   * Ignored on the AdvancedMarker path, where `children` draw the pin.
   */
  icon?: google.maps.MarkerOptions["icon"];
  /** Custom pin content — only rendered when a Map ID is configured (AdvancedMarker). */
  children?: ReactNode;
}

/**
 * Renders an AdvancedMarker (with custom children) when a Cloud Map ID is
 * configured, and falls back to a standard Marker (default red pin, unless an icon is passed) otherwise,
 * so markers are always visible regardless of Map ID setup.
 */
export function MapMarker({
  position,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
  title,
  label,
  icon,
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
      label={label}
      icon={icon}
    />
  );
}
