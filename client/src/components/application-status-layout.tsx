import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

/** Title row plus a labelled refresh. The phase pill and its subtitle sit in one block. */
export function ApplicationStatusHeader({
  title,
  phaseDetail,
  badge,
  onRefresh,
}: {
  title: string;
  phaseDetail?: string | null;
  badge: ReactNode;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4 min-w-0">
      <div className="flex items-center justify-between gap-3 min-w-0">
        <h1
          className="text-xl sm:text-3xl font-bold text-foreground min-w-0"
          data-testid="text-page-title"
        >
          {title}
        </h1>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={onRefresh}
          data-testid="button-refresh"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>
      <div
        className="rounded-lg border border-border bg-card px-4 py-3 min-w-0"
        data-testid="block-application-phase"
      >
        <div className="min-w-0">{badge}</div>
        {phaseDetail ? (
          <p
            className="text-sm text-muted-foreground mt-2 break-words"
            data-testid="text-application-phase-detail"
          >
            {phaseDetail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Neutral progress. Red only when the application was not approved or a step needs a retry.
 * The percent and the step count stay.
 */
export function ApplicationProgressCard({
  title,
  completed,
  total,
  urgent,
}: {
  title: string;
  completed: number;
  total: number;
  urgent: boolean;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <Card
      className={
        urgent
          ? "border border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-50"
          : "border border-border bg-card"
      }
      data-testid="card-application-progress"
    >
      <CardContent className="p-4 sm:p-6 min-w-0">
        <div className="flex items-start justify-between gap-4 min-w-0">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className={`mt-1 text-sm ${urgent ? "" : "text-muted-foreground"}`}>
              {completed} of {total} steps completed
            </p>
          </div>
          <p className="text-3xl sm:text-4xl font-bold tabular-nums shrink-0" data-testid="text-progress-percentage">
            {pct}%
          </p>
        </div>
        <Progress value={pct} className="mt-4 h-3" />
      </CardContent>
    </Card>
  );
}

/**
 * Mobile: icon and title on one row, body at full width, actions full width underneath.
 * From the sm breakpoint the action sits beside that block.
 */
export function StatusActionCard({
  title,
  icon,
  toneClassName,
  titleClassName = "text-foreground",
  testId,
  children,
  actions,
}: {
  title: string;
  icon: ReactNode;
  toneClassName: string;
  titleClassName?: string;
  testId?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Card className={toneClassName} data-testid={testId}>
      <CardContent className="p-4 sm:p-6 min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0">{icon}</div>
              <h3 className={`text-lg font-semibold min-w-0 ${titleClassName}`}>{title}</h3>
            </div>
            {children ? <div className="mt-3 min-w-0 break-words text-sm">{children}</div> : null}
          </div>
          {actions ? (
            <div className="flex flex-col gap-2 w-full min-w-0 sm:w-auto sm:max-w-full sm:shrink-0 sm:items-stretch">{actions}</div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function statusActionButtonClass(extra = ""): string {
  return `w-full sm:w-auto min-w-0 whitespace-normal h-auto text-center ${extra}`.trim();
}
