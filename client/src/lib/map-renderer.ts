/**
 * Which renderer draws the map (step 5 ruling 9). ONE map component, two renderers: Google when a
 * Maps key is present and the script loads; Leaflet/OpenStreetMap otherwise. The fallback is
 * AUTOMATIC and ONCE PER PAGE LOAD — no key, a script load failure, no load within 10 s, or a
 * quota/auth error on load — and there is no manual toggle. Pure decision + a small hook.
 */
import { useEffect, useState } from "react";

export const MAP_LOAD_TIMEOUT_MS = 10_000;
export const MAP_FALLBACK_NOTICE = "Map by OpenStreetMap";
export type MapRenderer = "google" | "leaflet";
export type FallbackReason = "no_key" | "load_error" | "timeout" | "auth_error";

export function chooseMapRenderer(input: { hasKey: boolean; fellBack: FallbackReason | null }): MapRenderer {
  if (!input.hasKey) return "leaflet";
  return input.fellBack ? "leaflet" : "google";
}

// Once per page load: the first fallback sticks for every map on the page until a reload.
let pageFallback: FallbackReason | null = null;
const listeners = new Set<(r: FallbackReason) => void>();
export function markMapFallback(reason: FallbackReason): void {
  if (pageFallback) return;
  pageFallback = reason;
  for (const l of Array.from(listeners)) l(reason);
}
/** Test seam only. */
export function __resetMapFallbackForTests(): void {
  pageFallback = null;
}

export function useMapRenderer(hasKey: boolean): {
  renderer: MapRenderer;
  reason: FallbackReason | null;
  onGoogleLoad: () => void;
  onGoogleError: () => void;
} {
  const [reason, setReason] = useState<FallbackReason | null>(hasKey ? pageFallback : "no_key");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!hasKey) return;
    const l = (r: FallbackReason) => setReason(r);
    listeners.add(l);
    // Google calls this global on an invalid key, a disabled API or an exhausted quota.
    const w = window as any;
    const prev = w.gm_authFailure;
    w.gm_authFailure = () => {
      markMapFallback("auth_error");
      if (typeof prev === "function") prev();
    };
    return () => {
      listeners.delete(l);
    };
  }, [hasKey]);
  useEffect(() => {
    if (!hasKey || loaded || reason) return;
    const t = setTimeout(() => markMapFallback("timeout"), MAP_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [hasKey, loaded, reason]);
  return {
    renderer: chooseMapRenderer({ hasKey, fellBack: reason }),
    reason,
    onGoogleLoad: () => setLoaded(true),
    onGoogleError: () => markMapFallback("load_error"),
  };
}
