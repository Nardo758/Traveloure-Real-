import { useState, useEffect } from "react";
import {
  MapPin, History, MessageSquare, Activity,
  CheckCircle2, Circle, Navigation2, ChevronDown, ChevronUp, Map,
} from "lucide-react";
import {
  TYPE_COLORS, STATUS_STYLES,
  type TemplateConfig, type PlanCardDay, type PlanCardActivity,
} from "./plancard-types";
import { TRANSPORT_MODE_ICONS, TRANSPORT_MODE_LABELS } from "@/lib/maps-platform";
import { openInMaps, type TraveloureMode } from "@/lib/navigate";
import type { InlineTransportLegData } from "@/components/itinerary/InlineTransportSelector";

interface ActivitiesSectionProps {
  tripId: string;
  day: PlanCardDay | undefined;
  templateConfig: TemplateConfig;
  legs?: InlineTransportLegData[];
}

type TemporalState = "past" | "upcoming" | "future";

function padTwo(n: number): string {
  return String(n).padStart(2, "0");
}

function todayIso(d: Date): string {
  return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(d.getDate())}`;
}

function nowHHMM(d: Date): string {
  return `${padTwo(d.getHours())}:${padTwo(d.getMinutes())}`;
}

function parseActivityTime(timeStr: string, dateStr: string): Date | null {
  if (!timeStr || !dateStr) return null;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h !== 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  const parts = dateStr.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], h, min, 0, 0);
}

function computeTemporalStates(
  activities: PlanCardActivity[],
  dateStr: string,
  now: Date,
  visited: Set<string>,
): Record<string, TemporalState> {
  const out: Record<string, TemporalState> = {};
  let foundUpcoming = false;
  for (const act of activities) {
    if (visited.has(act.id)) {
      out[act.id] = "past";
      continue;
    }
    const t = parseActivityTime(act.time, dateStr);
    const end = t ? new Date(t.getTime() + 90 * 60_000) : null;
    if (end && now > end) {
      out[act.id] = "past";
    } else if (!foundUpcoming) {
      out[act.id] = "upcoming";
      foundUpcoming = true;
    } else {
      out[act.id] = "future";
    }
  }
  return out;
}

function hasValidCoords(lat?: number, lng?: number): boolean {
  return (
    lat != null &&
    lng != null &&
    isFinite(lat) &&
    isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

interface ConnectorProps {
  leg: InlineTransportLegData;
  modeOverride?: string;
  onModeChange: (mode: string) => void;
}

function TransportConnector({ leg, modeOverride, onModeChange }: ConnectorProps) {
  const [open, setOpen] = useState(false);
  const activeMode = modeOverride || leg.userSelectedMode || leg.recommendedMode;
  const modeIcon = TRANSPORT_MODE_ICONS[activeMode] || "🚶";
  const modeLabel = TRANSPORT_MODE_LABELS[activeMode] || activeMode;

  const allModes = [
    { mode: activeMode, durationMinutes: leg.estimatedDurationMinutes, costUsd: leg.estimatedCostUsd },
    ...(leg.alternativeModes || [])
      .filter((m) => m.mode !== activeMode)
      .map((m) => ({ mode: m.mode, durationMinutes: m.durationMinutes, costUsd: m.costUsd })),
  ];

  const canNavigate =
    hasValidCoords(leg.fromLat ?? undefined, leg.fromLng ?? undefined) &&
    hasValidCoords(leg.toLat ?? undefined, leg.toLng ?? undefined);

  const handleOpenMaps = () => {
    openInMaps({
      origin: {
        lat: leg.fromLat ?? undefined,
        lng: leg.fromLng ?? undefined,
        name: leg.fromName,
      },
      destination: {
        lat: leg.toLat ?? undefined,
        lng: leg.toLng ?? undefined,
        name: leg.toName,
      },
      mode: activeMode as TraveloureMode,
    });
  };

  return (
    <div className="flex gap-3.5 py-0.5" data-testid={`transport-connector-${leg.id}`}>
      <div className="flex flex-col items-center w-12 flex-shrink-0 pt-1.5">
        <div className="w-px h-full bg-border/40" style={{ minHeight: 16 }} />
      </div>
      <div className="flex-1 min-w-0 py-1.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors text-left group flex-1 min-w-0"
            data-testid={`button-connector-toggle-${leg.id}`}
          >
            <span className="text-sm leading-none flex-shrink-0">{modeIcon}</span>
            <span className="font-medium">{modeLabel}</span>
            {leg.estimatedDurationMinutes > 0 && (
              <span className="text-muted-foreground/60">{leg.estimatedDurationMinutes}m</span>
            )}
            {leg.estimatedCostUsd != null && leg.estimatedCostUsd > 0 && (
              <span className="text-green-600 dark:text-green-400">${leg.estimatedCostUsd}</span>
            )}
            {leg.distanceDisplay && (
              <span className="text-muted-foreground/50 text-[11px]">{leg.distanceDisplay}</span>
            )}
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">
              {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </span>
          </button>

          {canNavigate && (
            <button
              onClick={handleOpenMaps}
              className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors flex-shrink-0 px-1.5 py-0.5 rounded hover:bg-primary/10"
              title={`Open route in Maps (${modeLabel})`}
              data-testid={`button-connector-maps-${leg.id}`}
            >
              <Map className="w-3 h-3" />
              <span>Maps</span>
            </button>
          )}
        </div>

        {open && (
          <div className="flex flex-wrap gap-1.5 mt-2" data-testid={`mode-picker-${leg.id}`}>
            {allModes.map((m) => {
              const icon = TRANSPORT_MODE_ICONS[m.mode] || "🚶";
              const label = TRANSPORT_MODE_LABELS[m.mode] || m.mode;
              const isActive = m.mode === activeMode;
              return (
                <button
                  key={m.mode}
                  onClick={() => { onModeChange(m.mode); setOpen(false); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
                    isActive
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 border-transparent"
                  }`}
                  data-testid={`mode-option-${leg.id}-${m.mode}`}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                  {m.durationMinutes > 0 && (
                    <span className="opacity-70">{m.durationMinutes}m</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ActivitiesSection({
  tripId,
  day,
  templateConfig,
  legs = [],
}: ActivitiesSectionProps) {
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => new Date());
  const [legModes, setLegModes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!day?.dayNum) return;
    const key = `traveloure_visited_${tripId}_${day.dayNum}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) setVisited(new Set(JSON.parse(raw)));
    } catch {}
  }, [tripId, day?.dayNum]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!day) return null;

  const isLiveDay = day.date === todayIso(now);

  const states = isLiveDay
    ? computeTemporalStates(day.activities, day.date, now, visited)
    : ({} as Record<string, TemporalState>);

  const upNextIndex = isLiveDay
    ? day.activities.findIndex((a) => states[a.id] === "upcoming")
    : -1;

  const lastPastIndex = isLiveDay
    ? day.activities.reduce((mx, a, i) => (states[a.id] === "past" ? i : mx), -1)
    : -1;

  const showNowLine = lastPastIndex >= 0 && upNextIndex > lastPastIndex;

  const upNextActivity = upNextIndex >= 0 ? day.activities[upNextIndex] : null;
  const upNextLeg = upNextIndex > 0 ? legs[upNextIndex - 1] : null;
  const upNextMode: TraveloureMode =
    (upNextLeg
      ? (legModes[upNextLeg.id] || upNextLeg.userSelectedMode || upNextLeg.recommendedMode)
      : "walk") as TraveloureMode;

  const fabCanShow =
    isLiveDay &&
    upNextActivity != null &&
    hasValidCoords(upNextActivity.lat, upNextActivity.lng);

  const toggleVisited = (actId: string) => {
    setVisited((prev) => {
      const next = new Set(prev);
      if (next.has(actId)) next.delete(actId);
      else next.add(actId);
      const key = `traveloure_visited_${tripId}_${day.dayNum}`;
      try {
        localStorage.setItem(key, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const activities = day.activities || [];

  return (
    <div className="px-5 pt-3 pb-6 relative" data-testid={`activities-section-${tripId}`}>
      <div className="flex justify-between mb-3">
        <div className="text-[13px] text-muted-foreground" data-testid={`text-day-info-${tripId}`}>
          {day.date} — <span className="text-foreground font-semibold">{day.label}</span>
        </div>
        {isLiveDay && (
          <div
            className="flex items-center gap-1 text-[11px] font-semibold text-green-600 dark:text-green-400"
            data-testid="badge-live-day"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live today
          </div>
        )}
      </div>

      {activities.length === 0 && (
        <div className="text-center py-8 text-muted-foreground" data-testid={`text-no-activities-${tripId}`}>
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No activities planned for this day</p>
        </div>
      )}

      {activities.map((a, i) => {
        const tc = TYPE_COLORS[a.type] || TYPE_COLORS.attraction;
        const ss = STATUS_STYLES[a.status] || STATUS_STYLES.pending;
        const typeLabel = templateConfig.activityTypes[a.type] || a.type;
        const state = states[a.id] as TemporalState | undefined;
        const isPast = state === "past";
        const isUpcoming = state === "upcoming";
        const isVisited = visited.has(a.id);
        const legAfter = i < activities.length - 1 ? legs[i] : undefined;

        return (
          <div key={a.id}>
            {showNowLine && i === upNextIndex && (
              <div className="flex items-center gap-2 py-1.5 -mx-1" data-testid="now-line">
                <div className="flex-1 h-px bg-red-400/60" />
                <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full shrink-0 border border-red-200 dark:border-red-800">
                  {nowHHMM(now)} now
                </span>
                <div className="flex-1 h-px bg-red-400/60" />
              </div>
            )}

            {isVisited ? (
              <div
                className={`flex gap-3.5 py-2.5 opacity-40 ${
                  i < activities.length - 1 ? "border-b border-border/20" : ""
                } border-l-[3px] border-l-transparent pl-1`}
                data-testid={`activity-row-${a.id}`}
              >
                <div className="w-12 flex-shrink-0">
                  <div className="text-[12px] text-muted-foreground" data-testid={`text-activity-time-${a.id}`}>
                    {a.time}
                  </div>
                </div>
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => toggleVisited(a.id)}
                    className="flex-shrink-0 text-green-500 hover:text-green-600 transition-colors"
                    title="Mark as not visited"
                    data-testid={`button-visited-${a.id}`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                  <span
                    className="text-[13px] text-muted-foreground line-through truncate"
                    data-testid={`text-activity-name-${a.id}`}
                  >
                    {a.name}
                  </span>
                </div>
              </div>
            ) : (
              <div
                className={`flex gap-3.5 py-3.5 transition-all ${
                  i < activities.length - 1 ? "border-b border-border/30" : ""
                } border-l-[3px] pl-1 ${
                  isUpcoming
                    ? "border-l-primary bg-primary/5 rounded-r-lg"
                    : "border-l-transparent"
                }`}
                data-testid={`activity-row-${a.id}`}
              >
                <div className="flex flex-col items-center w-12 flex-shrink-0">
                  <div
                    className={`text-[13px] font-bold ${isUpcoming ? "text-primary" : "text-foreground"}`}
                    data-testid={`text-activity-time-${a.id}`}
                  >
                    {a.time}
                  </div>
                  <div
                    className={`w-2.5 h-2.5 rounded-full mt-1.5 border-2 border-card transition-all ${
                      isUpcoming ? "scale-125 ring-2 ring-primary/40" : ""
                    }`}
                    style={{ backgroundColor: tc.dot, boxShadow: `0 0 8px ${tc.dot}40` }}
                  />
                  {i < activities.length - 1 && (
                    <div
                      className="w-0.5 flex-1 mt-1"
                      style={{
                        background: `linear-gradient(to bottom, ${tc.dot}40, transparent)`,
                      }}
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <button
                      onClick={() => toggleVisited(a.id)}
                      className="flex-shrink-0 mt-0.5 transition-colors text-muted-foreground/40 hover:text-muted-foreground"
                      title="Mark as visited"
                      data-testid={`button-visited-${a.id}`}
                    >
                      <Circle className="w-4 h-4" />
                    </button>

                    <span
                      className={`text-[15px] font-semibold flex-1 min-w-0 ${
                        isUpcoming ? "text-primary" : "text-foreground"
                      }`}
                      data-testid={`text-activity-name-${a.id}`}
                    >
                      {a.name}
                      {isUpcoming && (
                        <span
                          className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded-md align-middle"
                          data-testid={`badge-up-next-${a.id}`}
                        >
                          Up Next
                        </span>
                      )}
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ${tc.bg} ${tc.fg}`}
                      data-testid={`badge-activity-type-${a.id}`}
                    >
                      {typeLabel}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex-shrink-0 ${ss.bg} ${ss.fg}`}
                      data-testid={`badge-activity-status-${a.id}`}
                    >
                      {ss.label}
                    </span>
                  </div>

                  <div className="text-[12px] text-muted-foreground mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span data-testid={`text-activity-location-${a.id}`}>{a.location}</span>
                    {a.cost > 0 && (
                      <span
                        className="ml-2 text-green-600 dark:text-green-400 font-semibold"
                        data-testid={`text-activity-cost-${a.id}`}
                      >
                        ${a.cost}
                      </span>
                    )}
                  </div>

                  {a.expertNote && (
                    <div
                      className="mt-2 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 italic"
                      data-testid={`text-expert-note-${a.id}`}
                    >
                      💡 {a.expertNote}
                    </div>
                  )}

                  <div className="flex gap-2.5 mt-2">
                    {a.comments > 0 && (
                      <span
                        className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1 cursor-pointer hover:underline"
                        data-testid={`link-comments-${a.id}`}
                      >
                        <MessageSquare className="w-3 h-3" /> {a.comments} comment
                        {a.comments > 1 ? "s" : ""}
                      </span>
                    )}
                    {(a.changes?.length ?? 0) > 0 && (
                      <span
                        className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1"
                        data-testid={`text-activity-change-${a.id}`}
                      >
                        <History className="w-3 h-3" /> {a.changes![0].who}: {a.changes![0].what}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {legAfter && (
              <TransportConnector
                leg={legAfter}
                modeOverride={legModes[legAfter.id]}
                onModeChange={(mode) =>
                  setLegModes((prev) => ({ ...prev, [legAfter.id]: mode }))
                }
              />
            )}
          </div>
        );
      })}

      {fabCanShow && (
        <div className="sticky bottom-0 mt-4 flex justify-end pb-1 pointer-events-none">
          <button
            onClick={() =>
              openInMaps({
                destination: {
                  lat: upNextActivity!.lat,
                  lng: upNextActivity!.lng,
                  name: upNextActivity!.name,
                },
                mode: upNextMode,
              })
            }
            className="pointer-events-auto bg-primary text-primary-foreground rounded-full px-5 py-3 shadow-xl flex items-center gap-2 text-sm font-bold hover:bg-primary/90 transition-colors active:scale-95"
            data-testid="button-navigate-fab"
          >
            <Navigation2 className="w-4 h-4" />
            Navigate
          </button>
        </div>
      )}
    </div>
  );
}
