import { useState } from "react";
import { Clock, Route, Check, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiGoogle, SiApple } from "react-icons/si";
import { openInMaps } from "@/lib/navigate";
import {
  MODE_COLORS, MODE_LABELS, SOURCE_LABELS, STATUS_STYLES, ModeIcon,
  formatDuration, DAY_COLORS,
  type PlanCardDay, type PlanCardTransport,
} from "./plancard-types";

interface TransportSectionProps {
  tripId: string;
  tripDestination: string;
  day: PlanCardDay | undefined;
  days?: PlanCardDay[];
  selectedModes?: Record<string, string>;
  onModeChange?: (legId: string, mode: string) => void;
  tripWideMode?: string | null;
  onApplyTripWideMode?: (mode: string) => void;
  onResetModes?: () => void;
}

export function TransportSection({
  tripId, tripDestination, day, days,
  selectedModes = {}, onModeChange,
  tripWideMode, onApplyTripWideMode, onResetModes,
}: TransportSectionProps) {
  const [transitPickerOpen, setTransitPickerOpen] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([0]));

  if (!day) return null;

  const allDays = days || [day];

  function handleGoogleMaps() {
    const act = day?.activities?.[0];
    openInMaps({
      destination: {
        lat: act?.lat ?? undefined,
        lng: act?.lng ?? undefined,
        name: act?.location || act?.name || tripDestination,
      },
      app: "google",
    });
  }

  function handleAppleMaps() {
    const act = day?.activities?.[0];
    openInMaps({
      destination: {
        lat: act?.lat ?? undefined,
        lng: act?.lng ?? undefined,
        name: act?.location || act?.name || tripDestination,
      },
      app: "apple",
    });
  }

  const toggleDay = (idx: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const hasTransitOptions = allDays.some(d =>
    d.transports?.some(t => t.transitOptions && t.transitOptions.length > 0)
  );

  return (
    <div className="p-5" data-testid={`transport-section-${tripId}`}>
      {day.transports?.length > 0 && (() => {
        const effectiveLegs = day.transports.map(t => {
          const curMode = selectedModes[t.id] || t.selectedMode || t.mode;
          const curOption = t.transitOptions?.find(o => o.mode === curMode);
          return { mode: curMode, duration: curOption?.duration ?? t.duration, cost: curOption?.cost ?? t.cost };
        });
        const totalTime = effectiveLegs.reduce((s, l) => s + (l.duration || 0), 0);
        const totalCost = effectiveLegs.reduce((s, l) => s + (l.cost || 0), 0);
        const modeSet = Array.from(new Set(effectiveLegs.map(l => l.mode)));
        return (
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 rounded-xl p-3.5 flex flex-wrap justify-between items-center mb-5 gap-3" data-testid={`transport-summary-${tripId}`}>
            <div className="flex gap-6">
              {[
                { l: "Legs", v: day.transports.length },
                { l: "Total Time", v: formatDuration(totalTime) },
                { l: "Est. Cost", v: `$${totalCost.toLocaleString()}` },
              ].map((s, si) => (
                <div key={si}>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.l}</div>
                  <div className={`text-lg font-bold ${si === 2 ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}`} data-testid={`text-transport-stat-${s.l.toLowerCase().replace(/\s+/g, '-')}-${tripId}`}>{s.v}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              {modeSet.map((mode) => {
                const mins = effectiveLegs.filter(l => l.mode === mode).reduce((s, l) => s + (l.duration || 0), 0);
                return (
                  <span
                    key={mode}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                    style={{ backgroundColor: `${MODE_COLORS[mode] || "#94a3b8"}15`, color: MODE_COLORS[mode] || "#94a3b8" }}
                    data-testid={`badge-mode-summary-${mode}-${tripId}`}
                  >
                    <ModeIcon mode={mode} className="w-3.5 h-3.5" /> {formatDuration(mins)}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}

      {hasTransitOptions && onApplyTripWideMode && (
        <div className="mb-4 bg-gradient-to-r from-muted/50 to-muted/30 dark:from-muted/20 dark:to-muted/10 rounded-xl border border-border p-2.5" data-testid="trip-wide-mode-selector">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-foreground flex items-center gap-1">
              <Route className="w-3 h-3 text-muted-foreground" /> Set for entire trip
            </span>
            {tripWideMode && onResetModes && (
              <button
                onClick={onResetModes}
                className="text-[9px] text-muted-foreground hover:text-foreground underline cursor-pointer"
                data-testid="reset-trip-mode"
              >
                Reset to defaults
              </button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {([
              { mode: "private_car", label: "Private Car", tag: "TRAVELOURE" },
              { mode: "rental_car", label: "Rental Car", tag: "TRAVELOURE" },
              { mode: "rideshare", label: "Rideshare", tag: null },
              { mode: "bus", label: "Public Transit", tag: null },
              { mode: "walk", label: "Walk", tag: null },
            ] as const).map(opt => {
              const isActive = tripWideMode === opt.mode;
              const legCount = allDays.reduce((s, d) =>
                s + (d.transports || []).filter(t =>
                  t.transitOptions?.some(o => o.mode === opt.mode)
                ).length, 0
              );
              return (
                <button
                  key={opt.mode}
                  onClick={() => onApplyTripWideMode(opt.mode)}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-all border cursor-pointer ${
                    isActive
                      ? "border-primary bg-primary text-primary-foreground shadow-md"
                      : "border-border bg-card text-foreground hover:border-muted-foreground hover:shadow-sm"
                  }`}
                  data-testid={`trip-mode-${opt.mode}`}
                >
                  <ModeIcon mode={opt.mode} className="w-3 h-3" />
                  <span>{opt.label}</span>
                  {opt.tag && !isActive && (
                    <span className="text-[7px] bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 px-1 rounded font-bold ml-0.5">{opt.tag}</span>
                  )}
                  {isActive && (
                    <span className="text-[8px] bg-primary-foreground/20 px-1 rounded">{legCount} legs</span>
                  )}
                </button>
              );
            })}
          </div>
          {tripWideMode && (
            <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
              <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
              Applied <span className="font-semibold text-foreground">{MODE_LABELS[tripWideMode] || tripWideMode}</span> to all compatible legs.
              {allDays.some(d => d.transports?.some(t => !t.transitOptions?.some(o => o.mode === tripWideMode))) && (
                <span className="text-amber-600 dark:text-amber-400 ml-1">Some legs don't support this mode.</span>
              )}
            </div>
          )}
        </div>
      )}

      {allDays.length > 1 && hasTransitOptions ? (
        allDays.map((d, dayIdx) => {
          if (!d.transports || d.transports.length === 0) return null;
          const dayColor = DAY_COLORS[dayIdx % DAY_COLORS.length];
          const isExpanded = expandedDays.has(dayIdx);
          return (
            <div key={d.dayNum} className="mb-1.5">
              <button
                onClick={() => toggleDay(dayIdx)}
                className="w-full flex items-center gap-2 py-2 px-2.5 rounded-lg hover:bg-muted/40 transition-colors text-left cursor-pointer border-0 bg-transparent"
                data-testid={`transport-day-toggle-${d.dayNum}-${tripId}`}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                  style={{ backgroundColor: dayColor }}
                >
                  {d.dayNum}
                </div>
                <div className="flex-1">
                  <div className="text-[12px] font-bold text-foreground">{d.label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {d.transports.length} leg{d.transports.length !== 1 ? "s" : ""} · {formatDuration(d.transports.reduce((s, t) => s + t.duration, 0))} · ${d.transports.reduce((s, t) => s + t.cost, 0)}
                  </div>
                </div>
              </button>
              {isExpanded && (
                <div className="ml-4 mt-1 mb-2">
                  {d.transports.map((tr) => (
                    <TransportLegRow
                      key={tr.id}
                      tr={tr}
                      tripId={tripId}
                      selectedMode={selectedModes[tr.id]}
                      onModeChange={onModeChange}
                      transitPickerOpen={transitPickerOpen}
                      setTransitPickerOpen={setTransitPickerOpen}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })
      ) : (
        (day.transports || []).map((tr) => (
          <TransportLegRow
            key={tr.id}
            tr={tr}
            tripId={tripId}
            selectedMode={selectedModes[tr.id]}
            onModeChange={onModeChange}
            transitPickerOpen={transitPickerOpen}
            setTransitPickerOpen={setTransitPickerOpen}
          />
        ))
      )}

      {(!day.transports || day.transports.length === 0) && (
        <div className="text-center py-8 text-muted-foreground" data-testid={`text-no-transport-${tripId}`}>
          <Route className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No transport legs for this day</p>
        </div>
      )}

      {day.transports?.length > 0 && (
        <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border border-blue-200/30 dark:border-blue-800/20 flex flex-wrap gap-3 items-center justify-between" data-testid={`maps-cta-${tripId}`}>
          <div>
            <div className="text-[14px] font-bold text-foreground" data-testid={`text-maps-cta-title-${tripId}`}>Open Day {day.dayNum} in Maps</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">Activities + transport routes as layers</div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleGoogleMaps}
              variant="default"
              className="text-xs gap-1.5"
              data-testid={`button-google-maps-${tripId}`}
            >
              <SiGoogle className="w-3.5 h-3.5" /> Google Maps
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAppleMaps}
              className="text-xs gap-1.5"
              data-testid={`button-apple-maps-${tripId}`}
            >
              <SiApple className="w-3.5 h-3.5" /> Apple Maps
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TransportLegRow({
  tr, tripId, selectedMode, onModeChange,
  transitPickerOpen, setTransitPickerOpen,
}: {
  tr: PlanCardTransport;
  tripId: string;
  selectedMode?: string;
  onModeChange?: (legId: string, mode: string) => void;
  transitPickerOpen: string | null;
  setTransitPickerOpen: (id: string | null) => void;
}) {
  const curMode = selectedMode || tr.selectedMode || tr.mode;
  const curOption = tr.transitOptions?.find(o => o.mode === curMode);
  const ss = STATUS_STYLES[tr.status] || STATUS_STYLES.pending;
  const modeColor = MODE_COLORS[curMode] || "#94a3b8";
  const isPickerOpen = transitPickerOpen === tr.id;
  const displayDuration = curOption?.duration ?? tr.duration;
  const displayCost = curOption?.cost ?? tr.cost;

  return (
    <div className="mb-1" data-testid={`transport-leg-${tr.id}`}>
      <div className="flex gap-3.5 py-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${modeColor}15`, color: modeColor }}
        >
          <ModeIcon mode={curMode} className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-muted-foreground truncate" data-testid={`text-transport-from-${tr.id}`}>{tr.fromName || tr.from}</span>
            <span className="text-muted-foreground/50">→</span>
            <span className="text-foreground font-semibold truncate" data-testid={`text-transport-to-${tr.id}`}>{tr.toName || tr.to}</span>
          </div>
          <div className="flex flex-wrap gap-2.5 mt-1.5 items-center">
            <span
              className="px-2.5 py-0.5 rounded-md text-[11px] font-bold"
              style={{ backgroundColor: `${modeColor}20`, color: modeColor }}
              data-testid={`badge-transport-mode-${tr.id}`}
            >
              {MODE_LABELS[curMode] || curMode}
            </span>
            <span className="text-[12px] text-muted-foreground flex items-center gap-1" data-testid={`text-transport-duration-${tr.id}`}>
              <Clock className="w-3 h-3" /> {formatDuration(displayDuration)}
            </span>
            {displayCost > 0 && (
              <span className="text-[12px] text-green-600 dark:text-green-400 font-semibold" data-testid={`text-transport-cost-${tr.id}`}>${displayCost}</span>
            )}
            {tr.line && (
              <span className="text-[11px] text-muted-foreground italic" data-testid={`text-transport-line-${tr.id}`}>{tr.line}</span>
            )}
            {tr.transitOptions && tr.transitOptions.length > 1 && (
              <button
                onClick={() => setTransitPickerOpen(isPickerOpen ? null : tr.id)}
                className="flex items-center gap-0.5 text-[10px] text-primary hover:text-primary/80 cursor-pointer transition-colors"
                data-testid={`transit-toggle-${tr.id}`}
              >
                <Repeat className="w-2.5 h-2.5" />
                {tr.transitOptions.length} options
              </button>
            )}
          </div>
          <div className="flex gap-2 mt-2 items-center">
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${ss.bg} ${ss.fg}`} data-testid={`badge-transport-status-${tr.id}`}>{ss.label}</span>
            {tr.suggestedBy && (
              <span className={`text-[11px] flex items-center gap-1 ${tr.suggestedBy === "ai" ? "text-green-600 dark:text-green-400" : "text-purple-600 dark:text-purple-400"}`} data-testid={`text-transport-suggested-${tr.id}`}>
                {tr.suggestedBy === "ai" ? "AI suggested" : "Expert suggested"}
              </span>
            )}
            {curOption?.provider && (
              <span className="text-[10px] text-muted-foreground">via {curOption.provider}</span>
            )}
          </div>
        </div>
        {tr.status === "suggested" && (
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <Button size="sm" variant="default" className="text-[11px] h-7 px-3" data-testid={`button-accept-${tr.id}`}>
              Accept
            </Button>
            <Button size="sm" variant="outline" className="text-[11px] h-7 px-3" data-testid={`button-change-${tr.id}`}>
              Change
            </Button>
          </div>
        )}
      </div>

      {isPickerOpen && tr.transitOptions && (
        <div className="ml-14 mb-3 bg-card border border-border rounded-lg shadow-lg overflow-hidden" data-testid={`transit-picker-${tr.id}`}>
          <div className="px-2.5 py-1.5 bg-muted/50 border-b border-border">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Choose transit mode</span>
            <span className="text-[9px] text-muted-foreground ml-2">{tr.transitOptions.length} options</span>
          </div>
          {tr.transitOptions.map((opt) => {
            const optColor = MODE_COLORS[opt.mode] || "#94a3b8";
            const isSelected = curMode === opt.mode;
            return (
              <button
                key={opt.mode}
                onClick={() => {
                  onModeChange?.(tr.id, opt.mode);
                  setTransitPickerOpen(null);
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-muted/40 transition-colors border-b border-border/30 last:border-b-0 cursor-pointer ${
                  isSelected ? "bg-primary/5" : ""
                }`}
                data-testid={`transit-option-${tr.id}-${opt.mode}`}
              >
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${optColor}15`, color: optColor }}
                >
                  <ModeIcon mode={opt.mode} className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-semibold text-foreground">{opt.label || MODE_LABELS[opt.mode] || opt.mode}</span>
                    {opt.recommended && <span className="text-[8px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1 rounded font-bold">REC</span>}
                    {opt.source === "platform" && <span className="text-[8px] bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 px-1 rounded font-bold">TRAVELOURE</span>}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{formatDuration(opt.duration)}</span>
                    <span>{opt.cost === 0 ? "Free" : `$${opt.cost}`}</span>
                    {opt.provider && <span className="text-muted-foreground/60">via {opt.provider}</span>}
                  </div>
                  {opt.notes && <div className="text-[9px] text-muted-foreground/60 mt-0.5">{opt.notes}</div>}
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
