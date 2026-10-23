/**
 * Ops gap 10: the read-only thread behind one message report. Defaults to 10 messages each side; the server clamps
 * each side to 25 and records every open in the audit log.
 */
import React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { REPORT_CONTEXT_DEFAULT, REPORT_CONTEXT_MAX, clampReportContextCount, type ReportContextPayload } from "@shared/report-context";
import { REPORT_CONTEXT_COPY as T, REPORT_CONTEXT_SENDER_LABELS, reportContextUrl } from "@/lib/report-context-copy";

export function ReportContextView({ reportId }: { reportId: string }) {
  const [before, setBefore] = React.useState(REPORT_CONTEXT_DEFAULT);
  const [after, setAfter] = React.useState(REPORT_CONTEXT_DEFAULT);
  const [draft, setDraft] = React.useState({ before: String(REPORT_CONTEXT_DEFAULT), after: String(REPORT_CONTEXT_DEFAULT) });
  const url = reportContextUrl(reportId, before, after);
  // One open = one audit row, so this read is never refetched on focus or retried.
  const { data, isLoading, error } = useQuery<ReportContextPayload>({
    queryKey: [url],
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const usersMode = data?.mode === "users";

  return (
    <Card data-testid="report-context">
      <CardHeader>
        <CardTitle>{T.pageTitle}</CardTitle>
        <CardDescription>
          {data ? (data.anchorMissing ? T.anchorMissing : usersMode ? T.usersMode : T.messageMode) : null}
        </CardDescription>
        <p className="text-xs text-muted-foreground">{T.auditNotice}</p>
        <Link href="/admin/message-moderation" className="text-sm text-blue-600 underline">{T.back}</Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="report-context-before">{usersMode ? T.latestLabel : T.beforeLabel}</Label>
            <Input id="report-context-before" data-testid="report-context-before" className="w-24" inputMode="numeric" max={REPORT_CONTEXT_MAX} value={draft.before} onChange={(e) => setDraft({ ...draft, before: e.target.value })} />
          </div>
          {!usersMode ? (
            <div className="space-y-1">
              <Label htmlFor="report-context-after">{T.afterLabel}</Label>
              <Input id="report-context-after" data-testid="report-context-after" className="w-24" inputMode="numeric" max={REPORT_CONTEXT_MAX} value={draft.after} onChange={(e) => setDraft({ ...draft, after: e.target.value })} />
            </div>
          ) : null}
          <Button
            variant="outline"
            data-testid="report-context-show"
            onClick={() => {
              setBefore(clampReportContextCount(draft.before));
              setAfter(clampReportContextCount(draft.after));
            }}
          >
            {T.show}
          </Button>
          <span className="text-xs text-muted-foreground">{T.maxHint}</span>
        </div>
        {error ? (
          <p className="text-sm text-red-600">{String((error as Error).message ?? "").startsWith("404") ? T.notFound : T.loadFailed}</p>
        ) : isLoading || !data ? null : data.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="report-context-empty">{T.empty}</p>
        ) : (
          <ol className="space-y-2" data-testid="report-context-messages">
            {data.messages.map((m) => (
              <li
                key={m.id}
                data-testid={`report-context-message-${m.id}`}
                className={`rounded-md border p-3 text-sm ${m.isReported ? "border-red-400 bg-red-50 dark:bg-red-950/30" : ""}`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{REPORT_CONTEXT_SENDER_LABELS[m.sender]}</span>
                  <span>{m.createdAt ? new Date(m.createdAt).toLocaleString() : "—"}</span>
                  {m.isReported ? <Badge variant="destructive" data-testid="report-context-reported">{T.reportedBadge}</Badge> : null}
                  {m.hasAttachment ? <Badge variant="outline">{T.attachment}</Badge> : null}
                </div>
                <p className="whitespace-pre-wrap break-words">{m.body ?? T.noText}</p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
