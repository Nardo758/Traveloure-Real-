import { MapPin, History, MessageSquare, Activity } from "lucide-react";
import { TYPE_COLORS, STATUS_STYLES, type TemplateConfig, type PlanCardDay } from "./plancard-types";

interface ActivitiesSectionProps {
  tripId: string;
  day: PlanCardDay | undefined;
  templateConfig: TemplateConfig;
}

export function ActivitiesSection({ tripId, day, templateConfig }: ActivitiesSectionProps) {
  if (!day) return null;

  return (
    <div className="p-5" data-testid={`activities-section-${tripId}`}>
      <div className="flex justify-between mb-4">
        <div className="text-[13px] text-muted-foreground" data-testid={`text-day-info-${tripId}`}>
          {day.date} - <span className="text-foreground font-semibold">{day.label}</span>
        </div>
      </div>

      {(day.activities || []).map((a: any, i: number) => {
        const tc = TYPE_COLORS[a.type] || TYPE_COLORS.attraction;
        const ss = STATUS_STYLES[a.status] || STATUS_STYLES.pending;
        const typeLabel = templateConfig.activityTypes[a.type] || a.type;

        return (
          <div
            key={a.id}
            className={`flex gap-3.5 py-3.5 ${i < day.activities.length - 1 ? "border-b border-border/30" : ""}`}
            data-testid={`activity-row-${a.id}`}
          >
            <div className="flex flex-col items-center w-12 flex-shrink-0">
              <div className="text-[13px] font-bold text-foreground" data-testid={`text-activity-time-${a.id}`}>{a.time}</div>
              <div
                className="w-2.5 h-2.5 rounded-full mt-1.5 border-2 border-card"
                style={{ backgroundColor: tc.dot, boxShadow: `0 0 8px ${tc.dot}40` }}
              />
              {i < day.activities.length - 1 && (
                <div
                  className="w-0.5 flex-1 mt-1"
                  style={{ background: `linear-gradient(to bottom, ${tc.dot}40, transparent)` }}
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[15px] font-semibold text-foreground" data-testid={`text-activity-name-${a.id}`}>{a.name}</span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${tc.bg} ${tc.fg}`} data-testid={`badge-activity-type-${a.id}`}>
                  {typeLabel}
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${ss.bg} ${ss.fg}`} data-testid={`badge-activity-status-${a.id}`}>
                  {ss.label}
                </span>
              </div>
              <div className="text-[12px] text-muted-foreground mt-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                <span data-testid={`text-activity-location-${a.id}`}>{a.location}</span>
                {a.cost > 0 && <span className="ml-2 text-green-600 dark:text-green-400 font-semibold" data-testid={`text-activity-cost-${a.id}`}>${a.cost}</span>}
              </div>
              <div className="flex gap-2.5 mt-2">
                {a.comments > 0 && (
                  <span className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1 cursor-pointer hover:underline" data-testid={`link-comments-${a.id}`}>
                    <MessageSquare className="w-3 h-3" /> {a.comments} comment{a.comments > 1 ? "s" : ""}
                  </span>
                )}
                {a.changes?.length > 0 && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1" data-testid={`text-activity-change-${a.id}`}>
                    <History className="w-3 h-3" /> {a.changes[0].who}: {a.changes[0].what}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {(!day.activities || day.activities.length === 0) && (
        <div className="text-center py-8 text-muted-foreground" data-testid={`text-no-activities-${tripId}`}>
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No activities planned for this day</p>
        </div>
      )}
    </div>
  );
}
