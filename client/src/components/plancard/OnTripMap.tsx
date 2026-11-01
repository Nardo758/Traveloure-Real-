/**
 * Row 185 J5, screen: the Trip Card's on-trip map.
 *
 * It draws the ONE server projection (`plancard.onTripMap`, `projectOnTripMap` in `@shared/on-trip-map`)
 * as three toggleable layers — today's confirmed stops, the chosen stay, the current leg with its
 * leave-by — and computes nothing. Every point is one the server already sent (stored, non-Google
 * coordinates only); the screen reads no device position and fills no coordinate. The leg is shown by
 * marking its two ends and the server's "HH:MM" leave-by: no line is drawn, because Leaflet draws no leg
 * lines (GC-1). No projection, or one with nothing to draw, renders nothing.
 */
import { lazy, Suspense, useState } from "react";
import type { OnTripMap as OnTripMapProjection } from "@shared/on-trip-map";
import { ON_TRIP_MAP_COPY, ON_TRIP_MAP_DEFAULT_LAYERS, type OnTripMapLayer } from "@/lib/on-trip-map-copy";

const OnTripMapCanvas = lazy(() => import("./OnTripMapCanvas"));

export function OnTripMapPanel({ map }: { map: OnTripMapProjection | null | undefined }) {
  const [layers, setLayers] = useState<Record<OnTripMapLayer, boolean>>({ ...ON_TRIP_MAP_DEFAULT_LAYERS });
  if (!map || (map.stops.length === 0 && !map.stay)) return null;

  const toggles: Array<{ key: OnTripMapLayer; label: string; present: boolean }> = [
    { key: "stops", label: ON_TRIP_MAP_COPY.layerStops, present: map.stops.length > 0 },
    { key: "stay", label: ON_TRIP_MAP_COPY.layerStay, present: map.stay != null },
    { key: "leg", label: ON_TRIP_MAP_COPY.layerLeg, present: map.leg != null },
  ];

  return (
    <section className="rounded-xl border border-border bg-background p-3 space-y-2" data-testid="on-trip-map" data-day={map.day}>
      <h3 className="text-sm font-semibold m-0">{ON_TRIP_MAP_COPY.heading}</h3>
      <div className="flex flex-wrap gap-2" role="group">
        {toggles
          .filter((t) => t.present)
          .map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={layers[t.key]}
              onClick={() => setLayers((l) => ({ ...l, [t.key]: !l[t.key] }))}
              className={`text-xs rounded-full border px-3 py-1 ${layers[t.key] ? "bg-foreground text-background" : "bg-background text-foreground"}`}
              data-testid={`on-trip-map-toggle-${t.key}`}
            >
              {t.label}
            </button>
          ))}
      </div>
      <div className="h-64 w-full overflow-hidden rounded-lg" data-testid="on-trip-map-canvas">
        <Suspense fallback={null}>
          <OnTripMapCanvas map={map} layers={layers} />
        </Suspense>
      </div>
      {map.leg && layers.leg ? (
        <p className="text-sm m-0" data-testid="on-trip-map-leave-by">
          {ON_TRIP_MAP_COPY.leaveBy} <span className="font-semibold">{map.leg.leaveBy}</span>
        </p>
      ) : null}
    </section>
  );
}
