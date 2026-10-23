/** Ops gap 7: the support inbox — list by status, open one, set status, assignee and an internal note. */
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SUPPORT_STATUSES, isSupportStatus } from "@shared/support-intake";
import { SUPPORT_COPY as T, SUPPORT_STATUS_LABELS, supportListUrl, supportPatchFromDraft, type SupportDraft } from "@/lib/support-inbox";

export interface SupportRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  reason: string | null;
  preferredContactMethod: string | null;
  status: string | null;
  assignedAdminId: string | null;
  responseNotes: string | null;
  firstResponseAt: string | null;
  createdAt: string | null;
  overdue: boolean | null;
}
export interface SupportList {
  submissions: SupportRow[];
  firstResponseHours: number | null;
  assignees: Array<{ id: string; name: string }>;
}

const statusLabel = (s: string | null) => (isSupportStatus(s ?? "new") ? SUPPORT_STATUS_LABELS[(s ?? "new") as keyof typeof SUPPORT_STATUS_LABELS] : String(s));
const when = (d: string | null) => (d ? new Date(d).toLocaleString() : "—");
const draftOf = (r: SupportRow): SupportDraft => ({ status: r.status ?? "new", assignedAdminId: r.assignedAdminId ?? null, responseNotes: r.responseNotes ?? "" });

export function SupportInbox({ initialStatus = "", initialOpenId = null }: { initialStatus?: string; initialOpenId?: string | null }) {
  const [status, setStatus] = React.useState(initialStatus);
  const [openId, setOpenId] = React.useState<string | null>(initialOpenId);
  const [draft, setDraft] = React.useState<SupportDraft | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const url = supportListUrl(status);
  const { data, isLoading, error, refetch, isFetching } = useQuery<SupportList>({ queryKey: [url] });
  const rows = data?.submissions ?? [];
  const open = rows.find((r) => r.id === openId) ?? null;
  const assigneeName = (id: string | null) => (id ? data?.assignees.find((a) => a.id === id)?.name ?? id : null);
  const current = open ? draft ?? draftOf(open) : null;

  const save = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      (await apiRequest("PATCH", `/api/admin/contact-submissions/${encodeURIComponent(id)}`, body)).json(),
    onSuccess: () => {
      toast({ title: T.saved });
      setDraft(null);
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/contact-submissions") });
    },
    onError: () => toast({ title: T.saveFailed, variant: "destructive" }),
  });

  const onSave = () => {
    if (!open || !current) return;
    const body = supportPatchFromDraft(draftOf(open), current);
    if (Object.keys(body).length === 0) return toast({ title: T.nothingChanged });
    save.mutate({ id: open.id, body });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card data-testid="support-list">
        <CardHeader>
          <CardTitle>{T.pageTitle}</CardTitle>
          <CardDescription>{T.pageSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="support-status">{T.filterStatus}</Label>
              <select
                id="support-status"
                data-testid="support-status-filter"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={status}
                onChange={(e) => { setStatus(e.target.value); setOpenId(null); setDraft(null); }}
              >
                <option value="">{T.filterAll}</option>
                {SUPPORT_STATUSES.map((s) => <option key={s} value={s}>{SUPPORT_STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <Button variant="outline" size="sm" data-testid="support-refresh" disabled={isFetching} onClick={() => refetch()}>{T.refresh}</Button>
          </div>
          {data ? (
            <p className="text-xs text-muted-foreground" data-testid="support-target">
              {data.firstResponseHours == null ? T.targetUnset : T.targetSet(data.firstResponseHours)}
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-red-600">{T.loadFailed}</p>
          ) : isLoading ? null : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="support-empty">{status ? T.emptyFiltered : T.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-3">{T.colReceived}</th>
                    <th className="py-2 pr-3">{T.colFrom}</th>
                    <th className="py-2 pr-3">{T.colSubject}</th>
                    <th className="py-2 pr-3">{T.colStatus}</th>
                    <th className="py-2">{T.colAssignee}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      data-testid={`support-row-${r.id}`}
                      className={`border-t cursor-pointer ${r.id === openId ? "bg-muted" : ""}`}
                      onClick={() => { setOpenId(r.id); setDraft(null); }}
                    >
                      <td className="py-2 pr-3 whitespace-nowrap">{when(r.createdAt)}</td>
                      <td className="py-2 pr-3">{r.name}</td>
                      <td className="py-2 pr-3">{r.subject}</td>
                      <td className="py-2 pr-3 space-x-1">
                        <Badge variant="outline">{statusLabel(r.status)}</Badge>
                        {r.overdue === true ? <Badge variant="destructive" data-testid={`support-overdue-${r.id}`}>{T.overdue}</Badge> : null}
                      </td>
                      <td className="py-2">{assigneeName(r.assignedAdminId) ?? <span className="text-muted-foreground">{T.unassigned}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="support-detail">
        <CardHeader>
          <CardTitle>{open ? open.subject : T.detailTitle}</CardTitle>
          {open ? <CardDescription>{open.name} · {open.email}</CardDescription> : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {!open || !current ? (
            <p className="text-sm text-muted-foreground">{T.detailEmpty}</p>
          ) : (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">{T.detailReceived}</dt>
                <dd>{when(open.createdAt)}</dd>
                <dt className="text-muted-foreground">{T.detailFirstResponse}</dt>
                <dd data-testid="support-first-response">{open.firstResponseAt ? when(open.firstResponseAt) : T.detailNoResponse}</dd>
                {open.reason ? (<><dt className="text-muted-foreground">{T.colReason}</dt><dd>{open.reason}</dd></>) : null}
                {open.phone ? (<><dt className="text-muted-foreground">{T.detailPhone}</dt><dd>{open.phone}</dd></>) : null}
                {open.preferredContactMethod ? (<><dt className="text-muted-foreground">{T.detailPrefers}</dt><dd>{open.preferredContactMethod}</dd></>) : null}
              </dl>
              <p className="whitespace-pre-wrap rounded-md border p-3 text-sm" data-testid="support-message">{open.message}</p>
              <div className="space-y-1">
                <Label htmlFor="support-field-status">{T.fieldStatus}</Label>
                <select
                  id="support-field-status"
                  data-testid="support-field-status"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={current.status}
                  onChange={(e) => setDraft({ ...current, status: e.target.value })}
                >
                  {SUPPORT_STATUSES.map((s) => <option key={s} value={s}>{SUPPORT_STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="support-field-assignee">{T.fieldAssignee}</Label>
                <select
                  id="support-field-assignee"
                  data-testid="support-field-assignee"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={current.assignedAdminId ?? ""}
                  onChange={(e) => setDraft({ ...current, assignedAdminId: e.target.value || null })}
                >
                  <option value="">{T.fieldAssigneeNone}</option>
                  {(data?.assignees ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="support-field-note">{T.fieldNote}</Label>
                <Textarea id="support-field-note" data-testid="support-field-note" value={current.responseNotes} onChange={(e) => setDraft({ ...current, responseNotes: e.target.value })} />
                <p className="text-xs text-muted-foreground">{T.fieldNoteHint}</p>
              </div>
              <Button data-testid="support-save" disabled={save.isPending} onClick={onSave}>{T.save}</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
