import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * W5-A (QA_PUNCH_LIST item 19) — the discovery layer's candidate-pin publish/subscribe store.
 *
 * The Workstation canvas map (item 16, `CanvasMapSection` in expert/workspace.tsx) has a PLAN
 * layer (pins for what's already in the itinerary) and, per item 19's ratified layered model,
 * a DISCOVERY layer: whenever an Add-panel source drawer (DMO / Platform content / Platform
 * services / My services / Partner catalog / Transport) is open, that drawer's CURRENT results
 * render as candidate pins on the SAME map, in the SAME filter state the drawer's own list uses.
 *
 * Rather than rewriting each picker into a shared component, every picker publishes its own
 * already-filtered, already-coordinate-checked results here via `usePublishMapCandidates`, and
 * `CanvasMapSection` reads the single active publisher via `useMapCandidates`. Mount lifetime IS
 * the "is this drawer open" signal — a picker is only ever mounted while its pill is the active
 * Add-panel source (or, for the inline Platform-services drawer, while its own JSX block is
 * rendered — see the `MapCandidatesPublisher` wrapper in workspace.tsx), so switching drawers or
 * leaving the Add tab unmounts the previous publisher and its cleanup clears the store — no
 * separate "which drawer is open" flag needed here.
 *
 * Only ONE drawer is ever open at a time (ADD_SOURCES is a single-select pill row), so only one
 * publisher is ever mounted at a time — there is no cross-source merge to reconcile.
 */

export interface MapCandidate {
  id: string;
  title: string;
  lat: number;
  lng: number;
  /** Pre-formatted display string (e.g. "$45", "~USD 12") — never a raw number needing a
   *  currency guess here; each picker formats its own price, or omits it (null) when unknown. */
  price?: string | null;
}

export interface MapCandidatesSnapshot {
  source: string | null;
  sourceLabel: string | null;
  items: MapCandidate[];
  /** Calls back into the publishing drawer's OWN existing add handler (never duplicated) with
   *  the candidate's id. No-op when nothing is published. */
  onAdd: (id: string) => void;
}

const EMPTY_SNAPSHOT: MapCandidatesSnapshot = { source: null, sourceLabel: null, items: [], onAdd: () => {} };

let snapshot: MapCandidatesSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function publish(source: string, sourceLabel: string, items: MapCandidate[], onAdd: (id: string) => void): void {
  snapshot = { source, sourceLabel, items, onAdd };
  emit();
}

function clear(source: string): void {
  // Only clear if THIS source is still the active publisher — guards against a stale
  // unmount-cleanup racing a newer publish (e.g. rapid drawer switching).
  if (snapshot.source === source) {
    snapshot = EMPTY_SNAPSHOT;
    emit();
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): MapCandidatesSnapshot {
  return snapshot;
}

/** Consumed by CanvasMapSection — the currently-open Add-panel drawer's candidate pins. Empty
 *  ({source: null, items: []}) when no drawer is open, or the open drawer has zero coordinated
 *  results. */
export function useMapCandidates(): MapCandidatesSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT);
}

/** Mirrors workspace.tsx's own `isLocatedItem` / the pickers' local `hasRealCoords` helpers:
 *  reject null/NaN, out-of-range, and the (0,0) "Null Island" sentinel — a candidate pin must
 *  never be fabricated (§13). */
export function isRealLatLng(lat: unknown, lng: unknown): boolean {
  const la = lat == null ? NaN : typeof lat === "number" ? lat : parseFloat(String(lat));
  const ln = lng == null ? NaN : typeof lng === "number" ? lng : parseFloat(String(lng));
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return false;
  if (la === 0 && ln === 0) return false;
  return true;
}

/**
 * usePublishMapCandidates — called from each Add-panel source drawer. Publishes its CURRENT,
 * already-filtered results (the drawer's own search/category state drives this list — the SAME
 * filter state drives the pins, never a second map-only filter) as candidate pins, and routes
 * "Add to Day N" clicks back through `onAdd(id)` into the drawer's OWN existing add mutation —
 * never a duplicated write path.
 *
 * Publishes on mount / whenever the candidate SET changes (id+coords, so day-focus or query
 * changes that alter the visible set republish; unrelated re-renders don't), and clears on
 * unmount — so drawer-switch swaps the pins and closing the panel clears them for free.
 */
export function usePublishMapCandidates(
  source: string,
  sourceLabel: string,
  items: MapCandidate[],
  onAdd: (id: string) => void,
): void {
  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  // Stable dependency — republish only when the actual candidate set changes, not on every
  // parent re-render (mirrors CanvasMapSection's own PlanMapFitBounds `fitKey` pattern).
  const key = items.map((i) => `${i.id}:${i.lat}:${i.lng}:${i.price ?? ""}`).join("|");
  useEffect(() => {
    publish(source, sourceLabel, items, (id) => onAddRef.current(id));
    return () => clear(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, sourceLabel, key]);
}
