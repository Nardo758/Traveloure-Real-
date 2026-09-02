/**
 * Admin — neighborhood claims review queue (expert field knowledge v2, Phase 2).
 *
 * Two decisions only: Ratify (THE writer of expert_neighborhoods, via ratifyClaim) and Return (the
 * admin picks the weakest dimension; the expert-facing sentence is derived server-side). The scorer's
 * §4 output is shown per row as the four dimensions, with the web-gap verdict + URL and the flags.
 * Scores live here and nowhere an expert can see. A missing evidence_thresholds row is a BLOCKING
 * banner — the server refuses Ratify anyway; the UI says why instead of disabling a button quietly.
 */
import { useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, Loader2, MapPin, RefreshCw, Undo2 } from "lucide-react";
import { EVIDENCE_DIMENSIONS, type EvidenceDimension } from "@shared/neighborhood-claims";

type Status = "draft" | "submitted" | "scored" | "verified" | "declined";
interface Thresholds { ok: boolean; missing: string[] }
interface QueueRow {
  id: string; status: Status; version: number; expertId: string; expertName: string; expertEmail: string | null;
  neighborhoodId: string; neighborhoodName: string; city: string; daypart: string;
  submittedAt: string | null; scoredAt: string | null; ratifiedAt: string | null; declinedAt: string | null;
  scorerFailed: boolean; scorerFailedReason: string | null; recommendedUnlocks: string[]; weakestDimension: string | null; flagCount: number; webGapAvailable: boolean | null;
}
interface Dims { specificity: number; verifiability: number; localness: number; practicality: number; total: number; note: string }
interface ScorerJson {
  model: string; scored_at: string; web_gap_available: boolean;
  p1: Array<Dims & { row_id: string; web_gap: string | null; web_gap_url: string | null; localness_uncapped: number }>;
  p2: Dims & { hard_constraint_valid: boolean }; p3: Dims;
  recommended_unlocks: string[]; weakest_dimension: string; flags: string[];
}
interface Detail {
  claim: QueueRow & { consentAt: string | null; consentVersion: string | null; declinedDimension: string | null; ratifiedBy: string | null };
  scorerJson: ScorerJson | null;
  p1: Array<{ id: string; name: string | null; category: string | null; doThis: string; when: any; watchOut: string | null; priceBand: string | null; expertConfidence: string | null; webGap: string | null; webGapUrl: string | null }>;
  p2: { daypart: string; items: any[]; orderReason: string; hardConstraints: any[] } | null;
  p3: Array<{ id: string; trigger: string; replacesPosition: number | null; alternate: any; reason: string }>;
  p4Held: Array<{ id: string; venue: string; accessType: string; relationshipBasis: string | null; verificationStatus: string }>;
  transitions: Array<{ fromStatus: string | null; toStatus: string; actorType: string; actorId: string | null; claimVersion: number; createdAt: string }>;
  thresholds: Thresholds;
}

function ThresholdsBanner({ t }: { t: Thresholds | undefined }) {
  if (!t || t.ok) return null;
  return (
    <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 flex gap-2" data-testid="thresholds-missing-banner">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <div>
        <p className="font-medium">Scoring and ratification are blocked: evidence_thresholds is missing rows.</p>
        <p className="text-xs mt-1">Missing: {t.missing.join(", ")}. Run migrations (272 seeds them) or restore the rows under Evidence thresholds. Nothing here can be ratified against numbers that don't exist.</p>
      </div>
    </div>
  );
}

function StatusBadge({ s }: { s: Status }) {
  const cls = s === "verified" ? "bg-teal-600 text-white" : s === "scored" ? "bg-amber-100 text-amber-900" : s === "declined" ? "bg-red-100 text-red-900" : "";
  return <Badge variant={cls ? "default" : "outline"} className={cls}>{s}</Badge>;
}

function DimRow({ label, d, extra }: { label: string; d: Dims; extra?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_repeat(5,3.5rem)] items-center gap-2 text-sm py-1 border-b border-border last:border-0" data-testid={`dims-${label}`}>
      <div className="truncate"><span className="font-medium">{label}</span>{d.note && <span className="text-muted-foreground"> — {d.note}</span>}{extra}</div>
      {EVIDENCE_DIMENSIONS.map((k) => <div key={k} className="text-center tabular-nums">{(d as any)[k]}</div>)}
      <div className="text-center tabular-nums font-semibold">{d.total}</div>
    </div>
  );
}

function ClaimDetail({ id }: { id: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Detail>({ queryKey: [`/api/admin/neighborhood-claims/${id}`] });
  const [dimension, setDimension] = useState<EvidenceDimension | "">("");
  const invalidate = () => { qc.invalidateQueries({ queryKey: [`/api/admin/neighborhood-claims/${id}`] }); qc.invalidateQueries({ queryKey: ["/api/admin/neighborhood-claims"] }); };

  const ratify = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/neighborhood-claims/${id}/ratify`),
    onSuccess: () => { toast({ title: "Ratified", description: "The neighborhood row is born; the expert sees “verified”." }); invalidate(); },
    onError: (e: any) => toast({ title: "Ratify refused", description: e?.message ?? "Unexpected error", variant: "destructive" }),
  });
  const ret = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/neighborhood-claims/${id}/return`, { dimension }),
    onSuccess: () => { toast({ title: "Returned for edits", description: "The expert sees the one-sentence prompt for that dimension — never a number." }); invalidate(); },
    onError: (e: any) => toast({ title: "Return refused", description: e?.message ?? "Unexpected error", variant: "destructive" }),
  });
  const rescore = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/neighborhood-claims/${id}/rescore`),
    onSuccess: () => { toast({ title: "Scorer re-run" }); invalidate(); },
    onError: (e: any) => toast({ title: "Re-run refused", description: e?.message ?? "Unexpected error", variant: "destructive" }),
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const { claim, scorerJson: sj } = data;
  const dimsHeader = (
    <div className="grid grid-cols-[1fr_repeat(5,3.5rem)] gap-2 text-xs text-muted-foreground uppercase tracking-wide pb-1 border-b border-border">
      <div>Row</div>{EVIDENCE_DIMENSIONS.map((k) => <div key={k} className="text-center">{k.slice(0, 4)}</div>)}<div className="text-center">total</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Link href="/admin/neighborhood-claims" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to queue</Link>
      <ThresholdsBanner t={data.thresholds} />
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2"><MapPin className="w-4 h-4" /> {claim.neighborhoodName} <span className="text-muted-foreground font-normal">· {claim.city}</span></CardTitle>
              <CardDescription>{claim.expertName} {claim.expertEmail ? `· ${claim.expertEmail}` : ""} · version {claim.version} · {claim.daypart.replace("_", " ")} · consent {claim.consentAt ? `recorded (${claim.consentVersion})` : "not recorded"}</CardDescription>
            </div>
            <StatusBadge s={claim.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {claim.scorerFailed && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-center justify-between gap-3" data-testid="scorer-failed-banner">
              <span>Scorer did not produce a result: <code>{claim.scorerFailedReason}</code>. The claim stays submitted.</span>
              <Button size="sm" variant="outline" disabled={rescore.isPending} onClick={() => rescore.mutate()} data-testid="button-rescore">{rescore.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-4 h-4 mr-1" /> Re-run scorer</>}</Button>
            </div>
          )}
          {claim.status === "submitted" && !claim.scorerFailed && !sj && (
            <p className="text-sm text-muted-foreground">Awaiting the first-pass scorer (runs on the hourly job; re-run to score now).
              <Button size="sm" variant="ghost" className="ml-2" disabled={rescore.isPending} onClick={() => rescore.mutate()}>Score now</Button>
            </p>
          )}
          {sj && (
            <div className="space-y-2" data-testid="scorer-output">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>model {sj.model}</span><span>· scored {new Date(sj.scored_at).toLocaleString()}</span>
                {!sj.web_gap_available && <Badge variant="outline" className="text-amber-700 border-amber-300" data-testid="web-gap-unavailable">web-gap not run — no search key; Localness uncapped</Badge>}
              </div>
              {dimsHeader}
              {sj.p1.map((e, i) => {
                const row = data.p1.find((r) => r.id === e.row_id);
                return (
                  <DimRow key={e.row_id} label={row?.name ?? `P1 #${i + 1}`} d={e} extra={
                    <span className="ml-2 text-xs">
                      {e.web_gap && <Badge variant="outline" className={e.web_gap === "found" ? "border-red-300 text-red-800" : e.web_gap === "partial" ? "border-amber-300 text-amber-800" : "border-teal-300 text-teal-800"}>web-gap {e.web_gap}{e.web_gap === "found" && e.localness_uncapped !== e.localness ? ` (localness capped from ${e.localness_uncapped})` : ""}</Badge>}
                      {e.web_gap_url && <a className="ml-1 inline-flex items-center gap-0.5 underline" href={e.web_gap_url} target="_blank" rel="noreferrer">source <ExternalLink className="w-3 h-3" /></a>}
                    </span>
                  } />
                );
              })}
              <DimRow label="P2 outing" d={sj.p2} extra={<span className="ml-2 text-xs">{sj.p2.hard_constraint_valid ? "hard constraint valid" : "no valid hard constraint"}</span>} />
              <DimRow label="P3 contingency" d={sj.p3} />
              <div className="flex flex-wrap gap-2 pt-2 text-sm">
                <span>Recommended unlocks:</span>
                {sj.recommended_unlocks.length ? sj.recommended_unlocks.map((u) => <Badge key={u} className="bg-teal-600 text-white">{u}</Badge>) : <Badge variant="outline">none</Badge>}
                <span className="ml-3">Weakest: <Badge variant="outline">{sj.weakest_dimension}</Badge></span>
              </div>
              {sj.flags.length > 0 && (
                <div className="flex flex-wrap gap-1 text-xs" data-testid="scorer-flags">{sj.flags.map((f) => <Badge key={f} variant="outline" className="border-amber-300 text-amber-800">{f}</Badge>)}</div>
              )}
            </div>
          )}
          {claim.status === "scored" && (
            <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-border" data-testid="decision-actions">
              <Button disabled={ratify.isPending || !data.thresholds.ok} onClick={() => ratify.mutate()} data-testid="button-ratify">
                {ratify.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1" /> Ratify</>}
              </Button>
              <div className="flex items-end gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Return — weakest dimension (the expert sees the sentence, not the number)</label>
                  <Select value={dimension} onValueChange={(v) => setDimension(v as EvidenceDimension)}>
                    <SelectTrigger className="w-56" data-testid="select-return-dimension"><SelectValue placeholder={sj?.weakest_dimension ? `suggested: ${sj.weakest_dimension}` : "Pick a dimension"} /></SelectTrigger>
                    <SelectContent>{EVIDENCE_DIMENSIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button variant="outline" disabled={!dimension || ret.isPending} onClick={() => ret.mutate()} data-testid="button-return">
                  {ret.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Undo2 className="w-4 h-4 mr-1" /> Return for edits</>}
                </Button>
              </div>
            </div>
          )}
          {claim.status === "declined" && <p className="text-sm text-muted-foreground">Returned on the <strong>{claim.declinedDimension}</strong> dimension {claim.declinedAt ? new Date(claim.declinedAt).toLocaleDateString() : ""}. The expert may edit and resubmit after the cooldown.</p>}
          {claim.status === "verified" && <p className="text-sm text-muted-foreground">Ratified {claim.ratifiedAt ? new Date(claim.ratifiedAt).toLocaleString() : ""} by {claim.ratifiedBy ?? "—"}.</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">P1 — Places</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {data.p1.map((r) => (
              <div key={r.id} className="rounded border border-border p-3 space-y-1" data-testid={`p1-row-${r.id}`}>
                <div className="font-medium">{r.name} {r.category && <span className="text-muted-foreground">· {r.category}</span>} {r.priceBand && <span className="text-muted-foreground">· {r.priceBand}</span>}</div>
                <div><span className="text-muted-foreground">Do this:</span> {r.doThis}</div>
                <div><span className="text-muted-foreground">When:</span> {[r.when?.hours, r.when?.days, r.when?.season].filter(Boolean).join(" · ") || <em className="text-amber-700">not given</em>}</div>
                <div><span className="text-muted-foreground">Watch out:</span> {r.watchOut}</div>
                {r.expertConfidence && <div className="text-xs text-muted-foreground">confidence: {r.expertConfidence}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">P2 — Outing · P3 — Contingency</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {data.p2 ? (
              <div className="space-y-1">
                <ol className="list-decimal pl-5 space-y-0.5">
                  {(data.p2.items ?? []).map((it: any) => <li key={it.position}>{it.name} · {it.durationMin} min{it.transition ? ` · ${it.transition.mode} ${it.transition.minutes} min before` : ""}</li>)}
                </ol>
                <div><span className="text-muted-foreground">Why this order:</span> {data.p2.orderReason}</div>
                <div><span className="text-muted-foreground">Can't move:</span> {(data.p2.hardConstraints ?? []).map((h: any) => `${h.kind}: ${h.detail}`).join("; ")}</div>
              </div>
            ) : <p className="text-muted-foreground">No outing on this version.</p>}
            {data.p3.map((c) => (
              <div key={c.id} className="rounded border border-border p-3 space-y-1">
                <div><span className="text-muted-foreground">If</span> <strong>{c.trigger}</strong> · replaces {c.replacesPosition ? `stop ${c.replacesPosition}` : "the whole outing"}</div>
                <div><span className="text-muted-foreground">Instead:</span> {c.alternate?.name} · {c.alternate?.durationMin} min</div>
                <div><span className="text-muted-foreground">Why:</span> {c.reason}</div>
              </div>
            ))}
            {data.p4Held.length > 0 && (
              <div className="rounded border border-dashed border-border p-3 space-y-1" data-testid="p4-held">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">P4 access — HELD (not scored, not surfaced, not counted)</div>
                {data.p4Held.map((a) => <div key={a.id}>{a.venue} · {a.accessType}{a.relationshipBasis ? ` · ${a.relationshipBasis}` : ""}</div>)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Diary</CardTitle></CardHeader>
        <CardContent>
          <ul className="text-xs text-muted-foreground space-y-0.5" data-testid="claim-diary">
            {data.transitions.map((t, i) => <li key={i}>{new Date(t.createdAt).toLocaleString()} · v{t.claimVersion} · {t.fromStatus ?? "—"} → {t.toStatus} · {t.actorType}{t.actorId ? ` (${t.actorId})` : ""}</li>)}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Queue() {
  const [filter, setFilter] = useState("submitted,scored");
  const { data, isLoading } = useQuery<{ claims: QueueRow[]; thresholds: Thresholds }>({
    queryKey: ["/api/admin/neighborhood-claims", filter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/neighborhood-claims?status=${encodeURIComponent(filter)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load the queue");
      return res.json();
    },
  });
  const claims = data?.claims ?? [];
  return (
    <div className="space-y-4">
      <ThresholdsBanner t={data?.thresholds} />
      <div className="flex items-center justify-between gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-64" data-testid="queue-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="submitted,scored">Awaiting (submitted + scored)</SelectItem>
            <SelectItem value="scored">Scored — ready for a decision</SelectItem>
            <SelectItem value="submitted">Submitted — awaiting scorer</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="declined">Returned</SelectItem>
            <SelectItem value="draft">Drafts (claimed, not sent)</SelectItem>
          </SelectContent>
        </Select>
        <Link href="/admin/neighborhood-claims/manual-entry" className="text-sm underline text-muted-foreground">Ops manual entry (email replies)</Link>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : claims.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="queue-empty">Nothing in this view.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {claims.map((c) => (
            <Link key={c.id} href={`/admin/neighborhood-claims/${c.id}`}>
              <Card className="hover:border-primary cursor-pointer" data-testid={`queue-row-${c.id}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium flex items-center gap-1"><MapPin className="w-4 h-4 text-muted-foreground" /> {c.neighborhoodName} <span className="text-muted-foreground font-normal">· {c.city}</span></div>
                      <div className="text-xs text-muted-foreground">{c.expertName} · v{c.version} · {c.submittedAt ? `sent ${new Date(c.submittedAt).toLocaleDateString()}` : "not sent"}</div>
                    </div>
                    <StatusBadge s={c.status} />
                  </div>
                  <div className="flex flex-wrap gap-1 text-xs">
                    {c.scorerFailed && <Badge variant="outline" className="border-amber-300 text-amber-800">scorer: {c.scorerFailedReason}</Badge>}
                    {c.weakestDimension && <Badge variant="outline">weakest: {c.weakestDimension}</Badge>}
                    {c.recommendedUnlocks.map((u) => <Badge key={u} className="bg-teal-600 text-white">{u}</Badge>)}
                    {c.flagCount > 0 && <Badge variant="outline" className="border-amber-300 text-amber-800">{c.flagCount} flag{c.flagCount === 1 ? "" : "s"}</Badge>}
                    {c.webGapAvailable === false && <Badge variant="outline" className="text-amber-700 border-amber-300">web-gap not run</Badge>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminNeighborhoodClaims() {
  const params = useParams<{ id?: string }>();
  return (
    <AdminLayout title="Neighborhood Claims">
      <div className="p-6 space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Neighborhood claims</h1>
          <p className="text-sm text-muted-foreground mt-1">Experts claim; the first-pass scorer grades on four dimensions; you ratify or return. Ratify is the only way an <code>expert_neighborhoods</code> row is born. The expert sees two words — claimed, verified — and never a number.</p>
        </div>
        {params.id ? <ClaimDetail id={params.id} /> : <Queue />}
      </div>
    </AdminLayout>
  );
}
