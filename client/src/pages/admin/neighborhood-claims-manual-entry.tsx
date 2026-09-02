/**
 * Admin — ops manual entry for neighborhood claims (expert field knowledge v2, Phase 1).
 *
 * The backfill email's replies are typed here into the SAME typed rows the console writes, through
 * the same service (POST /api/admin/neighborhood-claims/manual-entry → createClaim + submitClaim
 * with actor 'ops'). Not a bypass: the only difference is the diary's actor_type. The review queue
 * (Ratify / Return) is Phase 2 and lives at /admin/neighborhood-claims.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin } from "lucide-react";
import type { Daypart } from "@shared/neighborhood-claims";
import { ClaimCaptureForm, captureCompleteness, emptyCapture, toSubmitPayload, type CaptureDraft } from "@/components/neighborhood-claims/claim-capture-form";

interface ExpertHit { id: string; name: string; email: string | null; city: string | null }
interface NeighborhoodOption { id: string; name: string; slug: string; city: string; country: string; daypart: Daypart }

export default function AdminNeighborhoodClaimsManualEntry() {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [expert, setExpert] = useState<ExpertHit | null>(null);
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState<NeighborhoodOption | null>(null);
  const [draft, setDraft] = useState<CaptureDraft>(() => emptyCapture());
  const [consentAttested, setConsentAttested] = useState(false);
  const [lastResult, setLastResult] = useState<{ claimId: string; version: number } | null>(null);

  const { data: hits } = useQuery<{ experts: ExpertHit[] }>({
    queryKey: ["/api/admin/neighborhood-claims/experts", q],
    queryFn: async () => {
      const res = await fetch(`/api/admin/neighborhood-claims/experts?q=${encodeURIComponent(q)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Search didn't go through");
      return res.json();
    },
    enabled: q.trim().length >= 2 && !expert,
  });

  const effectiveCity = (city || expert?.city || "").trim();
  const { data: optionsData } = useQuery<{ options: NeighborhoodOption[]; available: boolean }>({
    queryKey: ["/api/expert/neighborhood-options", effectiveCity],
    queryFn: async () => {
      const res = await fetch(`/api/expert/neighborhood-options?city=${encodeURIComponent(effectiveCity)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load neighborhoods");
      return res.json();
    },
    enabled: effectiveCity.length >= 2,
  });

  const completeness = useMemo(() => captureCompleteness(draft), [draft]);

  const submit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/neighborhood-claims/manual-entry", {
        expertId: expert!.id,
        neighborhoodId: neighborhood!.id,
        capture: toSubmitPayload(draft),
        consentAttested: true,
      });
      return (await res.json()) as { claimId: string; version: number; status: string };
    },
    onSuccess: (r) => {
      setLastResult({ claimId: r.claimId, version: r.version });
      toast({ title: "Reply recorded", description: `${neighborhood?.name} for ${expert?.name} — version ${r.version} is submitted and queued for scoring.` });
      setDraft(emptyCapture());
      setConsentAttested(false);
      setNeighborhood(null);
    },
    onError: (e: any) => toast({ title: "Couldn't record the reply", description: e?.message ?? "Check the fields and try again", variant: "destructive" }),
  });

  return (
    <AdminLayout title="Neighborhood Claims — manual entry">
      <div className="p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Manual entry (email backfill)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Type an expert's emailed answers into the same typed rows the console writes. Same scorer, same ratification — only the diary's actor reads <code>ops</code>.
            If the expert names a neighborhood the picker doesn't have, that market's rows are missing: file it, do not free-type a neighborhood.
          </p>
        </div>

        <Card className="border-border">
          <CardHeader className="pb-3"><CardTitle className="text-base">1. Expert</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {expert ? (
              <div className="flex items-center gap-3">
                <Badge variant="secondary">{expert.name}</Badge>
                <span className="text-sm text-muted-foreground">{expert.email} · {expert.city ?? "city unknown"}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setExpert(null); setNeighborhood(null); }}>Change</Button>
              </div>
            ) : (
              <>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="max-w-sm" data-testid="manual-entry-expert-search" />
                <div className="flex flex-wrap gap-2">
                  {(hits?.experts ?? []).map((h) => (
                    <Button key={h.id} type="button" variant="outline" size="sm" onClick={() => setExpert(h)} data-testid={`manual-entry-expert-${h.id}`}>{h.name} <span className="ml-1 text-muted-foreground">{h.email}</span></Button>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-3"><CardTitle className="text-base">2. Neighborhood</CardTitle><CardDescription>From the catalog only.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="manual-city">City</Label>
              <Input id="manual-city" className="mt-1 max-w-sm" value={city || expert?.city || ""} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Kyoto" />
            </div>
            {effectiveCity.length >= 2 && optionsData && !optionsData.available && (
              <p className="text-sm text-amber-700" data-testid="manual-entry-no-options">No neighborhoods in the catalog for {effectiveCity} — file the market, don't free-type.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {(optionsData?.options ?? []).map((o) => (
                <Button key={o.id} type="button" size="sm" variant={neighborhood?.id === o.id ? "default" : "outline"} onClick={() => setNeighborhood(o)} data-testid={`manual-entry-neighborhood-${o.slug}`}>
                  <MapPin className="w-3 h-3 mr-1" /> {o.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {expert && neighborhood && (
          <Card className="border-border">
            <CardHeader className="pb-3"><CardTitle className="text-base">3. The answers, as written</CardTitle><CardDescription>Transcribe; don't improve. A thin answer is honest inventory.</CardDescription></CardHeader>
            <CardContent className="space-y-6">
              <ClaimCaptureForm neighborhoodName={neighborhood.name} daypart={neighborhood.daypart} value={draft} onChange={setDraft} disabled={submit.isPending} />
              <div className="flex items-start gap-2">
                <Checkbox id="consent-attested" checked={consentAttested} onCheckedChange={(v) => setConsentAttested(v === true)} data-testid="manual-entry-consent" />
                <Label htmlFor="consent-attested" className="text-sm leading-snug text-muted-foreground">
                  The reply was sent in response to the backfill email, which carries the consent paragraph, and the expert did not opt out of any part of it.
                </Label>
              </div>
              {!completeness.complete && <p className="text-xs text-muted-foreground">Still needed — {completeness.firstIssue}</p>}
              <Button type="button" disabled={submit.isPending || !completeness.complete || !consentAttested} onClick={() => submit.mutate()} data-testid="manual-entry-submit">
                {submit.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Record reply as submitted claim
              </Button>
              {lastResult && <p className="text-xs text-muted-foreground">Last recorded: claim {lastResult.claimId} · version {lastResult.version}</p>}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
