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
    <div className="flex border-b border-border px-2 sm:px-4" data-testid={`section-tabs-${tripId}`}>
      <button
        onClick={() => onSetSection("activities")}
        className={`py-2.5 px-3 sm:px-5 border-b-2 cursor-pointer transition-all text-xs sm:text-sm font-medium flex items-center gap-1.5 ${
          section === "activities"
            ? "border-primary text-primary font-bold"
            : "border-transparent text-muted-foreground hover:text-foreground"
        }`}
        data-testid={`tab-activities-${tripId}`}
      >
        {templateConfig.activityLabel}
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
          section === "activities" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`} data-testid={`badge-activity-count-${tripId}`}>
          {dayActivityCount}
        </span>
        <span className="hidden sm:flex text-[11px] text-muted-foreground font-normal items-center gap-0.5" data-testid={`text-confirmation-progress-${tripId}`}>
          <CheckCircle2 className="w-3 h-3" /> {confirmedActivities}/{totalActivities}
        </span>
      </button>

      <button
        onClick={() => !transportLocked && onSetSection("transport")}
        className={`py-2.5 px-3 sm:px-5 border-b-2 cursor-pointer transition-all text-xs sm:text-sm font-medium flex items-center gap-1.5 ${
          transportLocked ? "opacity-50 cursor-not-allowed" : ""
        } ${
          section === "transport" && !transportLocked
            ? "border-primary text-primary font-bold"
            : "border-transparent text-muted-foreground hover:text-foreground"
        }`}
        data-testid={`tab-transport-${tripId}`}
      >
        {templateConfig.transportLabel}
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
          section === "transport" && !transportLocked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`} data-testid={`badge-transport-count-${tripId}`}>
          {dayTransportCount}
        </span>
        {transportLocked && <Lock className="w-3 h-3" />}
      </button>

      <button
        onClick={onToggleChanges}
        className={`ml-auto py-2.5 px-2 sm:px-4 cursor-pointer transition-all text-xs font-semibold flex items-center gap-1 ${
          showChanges ? "text-amber-500 dark:text-amber-400" : "text-muted-foreground hover:text-foreground"
        }`}
        data-testid={`button-changes-${tripId}`}
      >
        <History className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Changes</span>
        {changeLogCount > 0 && (
          <span className="bg-amber-500 text-amber-950 w-4 h-4 rounded-full text-[9px] font-extrabold flex items-center justify-center" data-testid={`badge-changes-count-${tripId}`}>
            {changeLogCount}
          </span>
        )}
      </button>
    </div>
  );
}
