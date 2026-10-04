/** A routed leg drawn on the map — only when the travel-time service is on (A8 / R-h). */
export interface SceneLeg {
  id: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  color: string;
  /** In-plan only, and only when the travel-time service is on. */
  durationLabel: string | null;
}
