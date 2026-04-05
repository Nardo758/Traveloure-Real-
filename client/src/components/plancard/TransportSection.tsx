import { Clock, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiGoogle, SiApple } from "react-icons/si";
import { openInMaps } from "@/lib/navigate";
import { MODE_COLORS, STATUS_STYLES, ModeIcon, type PlanCardDay } from "./plancard-types";

interface TransportSectionProps {
  tripId: string;
  tripDestination: string;
  day: PlanCardDay | undefined;
}

export function TransportSection({ tripId, tripDestination, day }: TransportSectionProps) {
  if (!day) return null;

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

  return (
    <div className="p-5" data-testid={`transport-section-${tripId}`}>
      {day.transports?.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 rounded-xl p-3.5 flex flex-wrap justify-between items-center mb-5 gap-3" data-testid={`transport-summary-${tripId}`}>
          <div className="flex gap-6">
            {[
              { l: "Legs", v: day.transports.length },
              { l: "Total Time", v: `${day.transports.reduce((s: number, t) => s + (t.duration || 0), 0)}m` },
              { l: "Est. Cost", v: `$${day.transports.reduce((s: number, t) => s + (t.cost || 0), 0).toLocaleString()}` },
            ].map((s, si) => (
              <div key={si}>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.l}</div>
                <div className={`text-lg font-bold ${si === 2 ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}`} data-testid={`text-transport-stat-${s.l.toLowerCase().replace(/\s+/g, '-')}-${tripId}`}>{s.v}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            {Array.from(new Set(day.transports.map((t) => t.mode))).map((mode) => {
              const mins = day.transports.filter((t) => t.mode === mode).reduce((s: number, t) => s + (t.duration || 0), 0);
              return (
                <span
                  key={mode}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                  style={{ backgroundColor: `${MODE_COLORS[mode] || "#94a3b8"}15`, color: MODE_COLORS[mode] || "#94a3b8" }}
                  data-testid={`badge-mode-summary-${mode}-${tripId}`}
                >
                  <ModeIcon mode={mode} className="w-3.5 h-3.5" /> {mins}m
                </span>
              );
            })}
          </div>
        </div>
      )}

      {(day.transports || []).map((tr, i) => {
        const ss = STATUS_STYLES[tr.status] || STATUS_STYLES.pending;
        const modeColor = MODE_COLORS[tr.mode] || "#94a3b8";

        return (
          <div
            key={tr.id}
            className={`flex gap-3.5 py-4 ${i < day.transports.length - 1 ? "border-b border-border/30" : ""}`}
            data-testid={`transport-leg-${tr.id}`}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${modeColor}15`, color: modeColor }}
            >
              <ModeIcon mode={tr.mode} className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="text-muted-foreground truncate" data-testid={`text-transport-from-${tr.id}`}>{tr.fromName || tr.from}</span>
                <span className="text-muted-foreground/50">-&gt;</span>
                <span className="text-foreground font-semibold truncate" data-testid={`text-transport-to-${tr.id}`}>{tr.toName || tr.to}</span>
              </div>
              <div className="flex flex-wrap gap-2.5 mt-1.5 items-center">
                <span
                  className="px-2.5 py-0.5 rounded-md text-[11px] font-bold capitalize"
                  style={{ backgroundColor: `${modeColor}20`, color: modeColor }}
                  data-testid={`badge-transport-mode-${tr.id}`}
                >
                  {tr.mode}
                </span>
                <span className="text-[12px] text-muted-foreground flex items-center gap-1" data-testid={`text-transport-duration-${tr.id}`}>
                  <Clock className="w-3 h-3" /> {tr.duration} min
                </span>
                {tr.cost > 0 && (
                  <span className="text-[12px] text-green-600 dark:text-green-400 font-semibold" data-testid={`text-transport-cost-${tr.id}`}>${tr.cost}</span>
                )}
                {tr.line && (
                  <span className="text-[11px] text-muted-foreground italic" data-testid={`text-transport-line-${tr.id}`}>{tr.line}</span>
                )}
              </div>
              <div className="flex gap-2 mt-2 items-center">
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${ss.bg} ${ss.fg}`} data-testid={`badge-transport-status-${tr.id}`}>{ss.label}</span>
                {tr.suggestedBy && (
                  <span className={`text-[11px] flex items-center gap-1 ${tr.suggestedBy === "ai" ? "text-green-600 dark:text-green-400" : "text-purple-600 dark:text-purple-400"}`} data-testid={`text-transport-suggested-${tr.id}`}>
                    {tr.suggestedBy === "ai" ? "AI suggested" : "Expert suggested"}
                  </span>
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
        );
      })}

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
