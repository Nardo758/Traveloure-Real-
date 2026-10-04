/**
 * Admin · Feedback (ledger `2026-10-04-feedback-phase-a`). ONE read-only query: counts by
 * city × group × moment × code for a date range, and the free-text rows for that filter. No charts.
 * Free text is shown here and nowhere public.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FEEDBACK_MOMENTS } from "@shared/feedback";

interface FeedbackReport {
  counts: Array<{ city: string | null; groupKey: string | null; moment: string | null; code: string | null; n: number }>;
  texts: Array<{ id: string; planId: string | null; city: string | null; groupKey: string | null; moment: string | null; text: string; buildSha: string | null; createdAt: string | null }>;
}

export default function AdminFeedback() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [city, setCity] = useState("");
  const [group, setGroup] = useState("");
  const [moment, setMoment] = useState("");
  const qs = new URLSearchParams(
    Object.entries({ from, to, city, group, moment }).filter(([, v]) => v.trim()) as [string, string][],
  ).toString();
  const { data, isLoading, isError } = useQuery<FeedbackReport>({ queryKey: [`/api/admin/feedback${qs ? `?${qs}` : ""}`] });
  return (
    <AdminLayout title="Feedback">
      <div className="space-y-4" data-testid="admin-feedback">
        <Card>
          <CardContent className="grid gap-2 pt-6 sm:grid-cols-5">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" data-testid="admin-feedback-from" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" data-testid="admin-feedback-to" />
            <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} data-testid="admin-feedback-city" />
            <Input placeholder="Group (trip, moment…)" value={group} onChange={(e) => setGroup(e.target.value)} data-testid="admin-feedback-group" />
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={moment}
              onChange={(e) => setMoment(e.target.value)}
              data-testid="admin-feedback-moment"
            >
              <option value="">All moments</option>
              {FEEDBACK_MOMENTS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Counts</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : isError ? (
              <p className="text-sm text-destructive">Couldn't read feedback.</p>
            ) : !data?.counts.length ? (
              <p className="text-sm text-muted-foreground" data-testid="admin-feedback-empty">No feedback for this filter.</p>
            ) : (
              <table className="w-full text-sm" data-testid="admin-feedback-counts">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1">City</th>
                    <th>Group</th>
                    <th>Moment</th>
                    <th>Code</th>
                    <th className="text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.counts.map((c, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1">{c.city ?? "—"}</td>
                      <td>{c.groupKey ?? "—"}</td>
                      <td>{c.moment ?? "—"}</td>
                      <td>{c.code ?? "—"}</td>
                      <td className="text-right tabular-nums">{c.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What travelers wrote</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!data?.texts.length ? (
              <p className="text-sm text-muted-foreground">No written feedback for this filter.</p>
            ) : (
              data.texts.map((t) => (
                <div key={t.id} className="rounded-md border border-border p-2 text-sm" data-testid={`admin-feedback-text-${t.id}`}>
                  <p className="whitespace-pre-wrap text-foreground">{t.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[t.city, t.groupKey, t.moment, t.planId ? `plan ${t.planId}` : null, t.buildSha ? `build ${t.buildSha.slice(0, 7)}` : null, t.createdAt ? new Date(t.createdAt).toLocaleString() : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
