/**
 * WORKSTATION_LOCATION_MAP_SPEC Part B — the keyless fallback for the Workstation's plan map.
 *
 * `CanvasMapSection` (client/src/pages/expert/workspace.tsx) renders the Google Maps JS map when
 * `VITE_GOOGLE_MAPS_API_KEY` is set; when it is NOT, it renders THIS component instead of the old
 * "Map unavailable" notice — Leaflet + OpenStreetMap tiles need no key at all. This is the
 * documented "Google swap point" the spec calls for: the moment a referrer-restricted key is
 * provisioned, `CanvasMapSection`'s existing `MAPS_KEY ? <GoogleBlock/> : <LeafletPlanMap/>` branch
 * switches over on its own — nothing here needs to change.
 *
 * Discovery layer (added Aug 9 2026 — WAS scoped out as a Google enhancement, but the runtime
 * billing fallback means Leaflet can be the ACTIVE map on a fully-keyed deploy, so the item-19
 * candidate-pin layer is a parity requirement, not an extra): hollow "+" markers for the open
 * Add-drawer's published candidates, popup carries the same "Add to Day N" action routed back
 * through the drawer's own add handler.
 */
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Local console-token strings (§17: tokens only, never raw hex) — mirrors the pattern every other
// console component uses (e.g. location-point-picker.tsx's inkStyle/midStyle) rather than reaching
// into workspace.tsx's module-level consts.
const INK = "var(--console-ink)";
const MID = "var(--console-mid)";
const BRAND = "var(--console-brand)";
const BRAND_SOFT = "var(--console-brand-soft)";
const CARD = "var(--console-card)";

export interface LeafletPlanMapItem {
  id: string;
  title: string;
  dayNumber: number;
  lat: number;
  lng: number;
}

/** Discovery-layer candidate (mirrors map-candidates.ts's MapCandidate — coords already
 *  §13-checked by the publisher; this component never fabricates a pin). */
export interface LeafletCandidate {
  id: string;
  title: string;
  lat: number;
  lng: number;
  price?: string | null;
}

function candidateDivIcon(id: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div data-testid="map-candidate-pin-${id}" style="width:20px;height:20px;border-radius:50%;background:${CARD};border:2.5px solid ${BRAND};box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:${BRAND};font-size:13px;font-weight:800;line-height:1;font-family:'Inter',-apple-system,sans-serif;">+</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function dayDivIcon(dayNumber: number, selected: boolean): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${BRAND};color:${CARD};border:2px solid ${selected ? CARD : "transparent"};box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:10.5px;font-weight:800;display:flex;align-items:center;justify-content:center;font-family:'Inter',-apple-system,sans-serif;">${dayNumber}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/** Mirrors CanvasMapSection's PlanMapFitBounds (needs a `<MapContainer>` ancestor for `useMap()`). */
function FitBounds({ items }: { items: LeafletPlanMapItem[] }) {
  const map = useMap();
  const fitKey = items.map(i => `${i.id}:${i.lat}:${i.lng}`).join("|");
  useEffect(() => {
    if (items.length === 0) return;
    if (items.length === 1) {
      map.setView([items[0].lat, items[0].lng], 14);
      return;
    }
    const bounds = L.latLngBounds(items.map(i => [i.lat, i.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  return null;
}

/** Mirrors CanvasMapSection's PlanMapFocusFromList — pans to a list-selected pin (Part B "vice
 *  versa"), one-shot, keyed only on the target's id so it doesn't re-fire on unrelated re-renders.
 *  Takes the ALREADY-RESOLVED target (not an id + a list to search) so it never races the caller's
 *  day-filter widening: `items` below is the day-filtered render set, which may not contain the
 *  target on the very first render after a cross-day focus request. */
function FocusFromList({ target }: { target: LeafletPlanMapItem | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.setView([target.lat, target.lng], 15, { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);
  return null;
}

export function LeafletPlanMap({
  items, center, selectedId, onSelect, onGoToItem, focusTarget,
  candidates = [], candidateSourceLabel, onAddCandidate, addCandidateLabel,
}: {
  items: LeafletPlanMapItem[];
  center: { lat: number; lng: number };
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onGoToItem: (id: string) => void;
  /** WORKSTATION_LOCATION_MAP_SPEC Part B "vice versa" — the list-selected item, already resolved
   *  by the caller against its full located set (see FocusFromList's doc comment above). */
  focusTarget?: LeafletPlanMapItem | null;
  /** Item-19 discovery layer: the open Add-drawer's published candidates (hollow "+" pins). */
  candidates?: LeafletCandidate[];
  candidateSourceLabel?: string | null;
  onAddCandidate?: (id: string) => void;
  /** Button text for the candidate popup's add action, e.g. "Add to Day 2". */
  addCandidateLabel?: string;
}) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={13}
      style={{ width: "100%", height: "100%" }}
      scrollWheelZoom
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <FitBounds items={items} />
      <FocusFromList target={focusTarget ?? null} />
      {items.map(item => (
        <Marker
          key={item.id}
          position={[item.lat, item.lng]}
          icon={dayDivIcon(item.dayNumber, selectedId === item.id)}
          eventHandlers={{
            click: () => onSelect(item.id),
            // Leaflet auto-closes the previously-open popup on a new marker click / map click —
            // this keeps selectedId in sync with whatever popup is actually showing.
            popupclose: () => onSelect(null),
          }}
        >
          <Popup>
            <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", minWidth: 140 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 2 }}>{item.title}</div>
              <div style={{ fontSize: 11.5, color: MID, marginBottom: 8 }}>Day {item.dayNumber}</div>
              <button
                onClick={() => onGoToItem(item.id)}
                data-testid={`button-goto-item-leaflet-${item.id}`}
                style={{
                  width: "100%", padding: "5px 8px", borderRadius: 7, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", border: `1px solid ${BRAND}`, background: BRAND_SOFT, color: INK,
                }}
              >
                Go to item
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
      {candidates.map(cand => (
        <Marker
          key={`candidate-${cand.id}`}
          position={[cand.lat, cand.lng]}
          icon={candidateDivIcon(cand.id)}
        >
          <Popup>
            <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", minWidth: 140 }} data-testid={`leaflet-candidate-${cand.id}`}>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 2 }}>{cand.title}</div>
              {candidateSourceLabel && <div style={{ fontSize: 11.5, color: MID, marginBottom: cand.price ? 2 : 8 }}>{candidateSourceLabel}</div>}
              {cand.price && <div style={{ fontSize: 11.5, color: MID, marginBottom: 8 }}>{cand.price}</div>}
              {onAddCandidate && (
                <button
                  onClick={() => onAddCandidate(cand.id)}
                  data-testid={`button-add-candidate-leaflet-${cand.id}`}
                  style={{
                    width: "100%", padding: "5px 8px", borderRadius: 7, fontSize: 12, fontWeight: 700,
                    cursor: "pointer", border: `1px solid ${BRAND}`, background: BRAND_SOFT, color: INK,
                  }}
                >
                  {addCandidateLabel ?? "Add"}
                </button>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
