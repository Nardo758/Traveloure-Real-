import { History, Lock, CheckCircle2 } from "lucide-react";
import type { TemplateConfig } from "./plancard-types";

interface SectionTabsProps {
  tripId: string;
  section: "activities" | "transport";
  onSetSection: (s: "activities" | "transport") => void;
  showChanges: boolean;
  onToggleChanges: () => void;
  templateConfig: TemplateConfig;
  dayActivityCount: number;
  dayTransportCount: number;
  confirmedActivities: number;
  totalActivities: number;
  transportLocked: boolean;
  changeLogCount: number;
  expertChanges: number;
}

export function SectionTabs({
  tripId, section, onSetSection, showChanges, onToggleChanges,
  templateConfig, dayActivityCount, dayTransportCount,
  confirmedActivities, totalActivities, transportLocked,
  changeLogCount, expertChanges,
}: SectionTabsProps) {
  return (
    <div className="flex border-b border-border px-4" data-testid={`section-tabs-${tripId}`}>
      <button
        onClick={() => onSetSection("activities")}
        className={`py-3 px-5 border-b-2 cursor-pointer transition-all text-sm font-medium flex items-center gap-2 ${
          section === "activities"
            ? "border-primary text-primary font-bold"
            : "border-transparent text-muted-foreground hover:text-foreground"
        }`}
        data-testid={`tab-activities-${tripId}`}
      >
        {templateConfig.activityLabel}
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
          section === "activities" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`} data-testid={`badge-activity-count-${tripId}`}>
          {dayActivityCount}
        </span>
        <span className="text-[11px] text-muted-foreground font-normal flex items-center gap-0.5" data-testid={`text-confirmation-progress-${tripId}`}>
          <CheckCircle2 className="w-3 h-3" /> {confirmedActivities}/{totalActivities} confirmed
        </span>
      </button>

      <button
        onClick={() => !transportLocked && onSetSection("transport")}
        className={`py-3 px-5 border-b-2 cursor-pointer transition-all text-sm font-medium flex items-center gap-2 ${
          transportLocked ? "opacity-50 cursor-not-allowed" : ""
        } ${
          section === "transport" && !transportLocked
            ? "border-primary text-primary font-bold"
            : "border-transparent text-muted-foreground hover:text-foreground"
        }`}
        data-testid={`tab-transport-${tripId}`}
      >
        {templateConfig.transportLabel}
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
          section === "transport" && !transportLocked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`} data-testid={`badge-transport-count-${tripId}`}>
          {dayTransportCount}
        </span>
        {transportLocked && <Lock className="w-3 h-3" />}
        {transportLocked && <span className="text-[10px] text-muted-foreground italic">finalize activities first</span>}
      </button>

      <button
        onClick={onToggleChanges}
        className={`ml-auto py-3 px-4 cursor-pointer transition-all text-xs font-semibold flex items-center gap-1.5 ${
          showChanges ? "text-amber-500 dark:text-amber-400" : "text-muted-foreground hover:text-foreground"
        }`}
        data-testid={`button-changes-${tripId}`}
      >
        <History className="w-3.5 h-3.5" /> Changes
        {changeLogCount > 0 && (
          <span className="bg-amber-500 text-amber-950 w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center" data-testid={`badge-changes-count-${tripId}`}>
            {changeLogCount}
          </span>
        )}
        {expertChanges > 0 && (
          <span className="text-[10px] text-blue-500 dark:text-blue-400 font-medium" data-testid={`badge-expert-changes-${tripId}`}>{expertChanges} expert</span>
        )}
      </button>
    </div>
  );
}
