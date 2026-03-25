import { motion, AnimatePresence } from "framer-motion";
import { CHANGE_DOT_COLORS, type PlanCardChange } from "./plancard-types";

interface ChangeLogPanelProps {
  tripId: string;
  showChanges: boolean;
  changeLog: PlanCardChange[];
}

export function ChangeLogPanel({ tripId, showChanges, changeLog }: ChangeLogPanelProps) {
  return (
    <AnimatePresence>
      {showChanges && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
          data-testid={`changelog-panel-${tripId}`}
        >
          <div className="bg-amber-50/50 dark:bg-amber-950/10 border-b border-amber-200/30 dark:border-amber-800/20 px-5 py-4">
            <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mb-3 uppercase tracking-wider">Change History</div>
            {changeLog.length > 0 ? changeLog.map((c, i) => (
              <div
                key={c.id || i}
                className={`flex items-start gap-2.5 py-2 ${i < changeLog.length - 1 ? "border-b border-border/30" : ""}`}
                data-testid={`change-entry-${c.id || i}-${tripId}`}
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${CHANGE_DOT_COLORS[c.role] || "bg-muted-foreground"}`} />
                <div>
                  <span className="text-foreground text-[13px] font-semibold" data-testid={`text-change-who-${c.id || i}-${tripId}`}>{c.who}</span>
                  <span className="text-muted-foreground text-[13px]"> - {c.action}</span>
                  <div className="text-muted-foreground/60 text-[11px] mt-0.5">{c.when}</div>
                </div>
              </div>
            )) : (
              <p className="text-muted-foreground text-sm">No changes yet</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
