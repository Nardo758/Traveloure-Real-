/**
 * Expert console — Neighborhoods panel (expert field knowledge v2, Phase 1).
 *
 * Claim a neighborhood from the catalog, then "show us" it: the four-prompt capture, saved as you
 * go, sent when it's ready. Chips are `claimed` / `verified` — the only two words the platform
 * uses for a claim on any expert or public surface.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Loader2, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { CLAIM_PROMPTS, UNLOCK_COPY, VERIFIED_COPY, type Daypart, type EvidenceUnlock } from "@shared/neighborhood-claims";
import {
  ClaimCaptureForm,
  captureCompleteness,
  captureHasContent,
  fromStoredDraft,
  toSubmitPayload,
  type CaptureDraft,
} from "@/components/neighborhood-claims/claim-capture-form";

interface ClaimView {
  id: string;
  neighborhoodId: string;
  neighborhoodName: string;
  city: string;
  daypart: Daypart;
  status: "claimed" | "verified";
  version: number;
  canEdit: boolean;
  awaitingReview: boolean;
  returnMessage: string | null;
  draftCapture: unknown | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  unlocks: EvidenceUnlock[];
}
interface NeighborhoodOption { id: string; name: string; slug: string; city: string; country: string; daypart: Daypart }

function StatusChip({ status }: { status: "claimed" | "verified" }) {
  return status === "verified" ? (
    <Badge className="bg-teal-600 hover:bg-teal-600 text-white gap-1" data-testid="claim-chip-verified"><CheckCircle2 className="w-3 h-3" /> verified</Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground" data-testid="claim-chip-claimed">claimed</Badge>
  );
}

function ClaimCard({ claim }: { claim: ClaimView }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(claim.canEdit && !!claim.returnMessage);
  const [draft, setDraft] = useState<CaptureDraft>(() => fromStoredDraft(claim.draftCapture));
  const [consent, setConsent] = useState(false);
  const completeness = useMemo(() => captureCompleteness(draft), [draft]);

  const save = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/expert/neighborhood-claims/${claim.id}/capture`, { capture: draft }),
    onSuccess: () => { toast({ title: "Saved", description: "Pick it up whenever you like." }); qc.invalidateQueries({ queryKey: ["/api/expert/neighborhood-claims"] }); },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message ?? "Please try again", variant: "destructive" }),
  });
  const send = useMutation({
    mutationFn: () => apiRequest("POST", `/api/expert/neighborhood-claims/${claim.id}/submit`, { consent, capture: toSubmitPayload(draft) }),
    onSuccess: () => { toast({ title: `Thank you — ${claim.neighborhoodName} is with us.`, description: "We'll let you know when it's verified." }); setOpen(false); qc.invalidateQueries({ queryKey: ["/api/expert/neighborhood-claims"] }); },
    onError: (e: any) => toast({ title: "Couldn't send", description: e?.message ?? "Please check the answers and try again", variant: "destructive" }),
  });

  return (
    <Card className="border-border" data-testid={`claim-card-${claim.neighborhoodId}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /> {claim.neighborhoodName}</CardTitle>
            <CardDescription>{claim.city}</CardDescription>
          </div>
          <StatusChip status={claim.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {claim.status === "verified" && (
          <div className="space-y-2" data-testid="claim-verified-copy">
            <p className="text-sm font-medium text-foreground">{VERIFIED_COPY(claim.neighborhoodName)}</p>
            {(claim.unlocks ?? []).length > 0 && (
              <ul className="text-sm text-muted-foreground space-y-1" data-testid="claim-unlocks">
                {(claim.unlocks ?? []).map((u) => (
                  <li key={u} className="flex gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 text-teal-600 shrink-0" /> <span>{UNLOCK_COPY[u](claim.neighborhoodName)}</span></li>
                ))}
              </ul>
            )}
          </div>
        )}
        {claim.awaitingReview && (
          <p className="text-sm text-muted-foreground" data-testid="claim-awaiting">Your answers are with us. We'll be in touch — nothing more to do here for now.</p>
        )}
        {claim.returnMessage && claim.canEdit && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="claim-return-message">
            {claim.returnMessage}
          </div>
        )}
        {claim.canEdit && (
          <>
            <Button type="button" variant={open ? "ghost" : "default"} size="sm" onClick={() => setOpen((o) => !o)} data-testid="claim-toggle-capture">
              {open ? <><ChevronUp className="w-4 h-4 mr-1" /> Hide</> : <><ChevronDown className="w-4 h-4 mr-1" /> {claim.returnMessage ? "Edit and send again" : CLAIM_PROMPTS.heading(claim.neighborhoodName)}</>}
            </Button>
            {open && (
              <div className="space-y-6 pt-2">
                <ClaimCaptureForm neighborhoodName={claim.neighborhoodName} daypart={claim.daypart} value={draft} onChange={setDraft} disabled={save.isPending || send.isPending} />
                <div className="flex items-start gap-2">
                  <Checkbox id={`consent-${claim.id}`} checked={consent} onCheckedChange={(v) => setConsent(v === true)} data-testid="claim-consent" />
                  <Label htmlFor={`consent-${claim.id}`} className="text-sm leading-snug text-muted-foreground">
                    I'm happy for Traveloure to use what I share here — my places may appear with my name on them and my {claim.daypart.replace("_", " ")} may be offered to travelers as a starting point.
                  </Label>
                </div>
                {!completeness.complete && captureHasContent(draft) && (
                  <p className="text-xs text-muted-foreground" data-testid="claim-incomplete-hint">Still needed before sending — {completeness.firstIssue}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" disabled={save.isPending || !captureHasContent(draft)} onClick={() => save.mutate()} data-testid="claim-save">
                    {save.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Save and finish later
                  </Button>
                  <Button type="button" disabled={send.isPending || !completeness.complete || !consent} onClick={() => send.mutate()} data-testid="claim-send">
                    {send.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Send
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function ExpertNeighborhoodsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ claims: ClaimView[] }>({ queryKey: ["/api/expert/neighborhood-claims"] });
  const { data: application } = useQuery<any>({ queryKey: ["/api/expert/application-status"], retry: false });
  const [cityOverride, setCityOverride] = useState("");
  const city: string = (cityOverride || application?.city || "").trim();

  const { data: optionsData, isLoading: optionsLoading } = useQuery<{ options: NeighborhoodOption[]; available: boolean }>({
    queryKey: ["/api/expert/neighborhood-options", city],
    queryFn: async () => {
      const res = await fetch(`/api/expert/neighborhood-options?city=${encodeURIComponent(city)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load neighborhoods");
      return res.json();
    },
    enabled: city.length >= 2,
  });

  const claims = data?.claims ?? [];
  const claimedIds = new Set(claims.map((c) => c.neighborhoodId));
  const unclaimed = (optionsData?.options ?? []).filter((o) => !claimedIds.has(o.id));

  const claimMutation = useMutation({
    mutationFn: (neighborhoodId: string) => apiRequest("POST", "/api/expert/neighborhood-claims", { neighborhoodId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/expert/neighborhood-claims"] }),
    onError: (e: any) => toast({ title: "Couldn't claim that neighborhood", description: e?.message ?? "Please try again", variant: "destructive" }),
  });

  return (
    <ExpertLayout title="Neighborhoods">
      <div className="p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Neighborhoods</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The places you know block by block. Claim one, then show us — a few places, one good {"evening"}, and what you'd do when it goes sideways.
          </p>
        </div>

        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Claim a neighborhood</CardTitle>
            <CardDescription>Pick from the catalog for your city. Anyone can claim the same neighborhood — this is a join, not a territory.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!application?.city && (
              <div>
                <Label htmlFor="claim-city">Your city</Label>
                <Input id="claim-city" className="mt-1 max-w-sm" value={cityOverride} onChange={(e) => setCityOverride(e.target.value)} placeholder="e.g. Kyoto" data-testid="claim-city-input" />
              </div>
            )}
            {city.length < 2 ? (
              <p className="text-sm text-muted-foreground">Tell us your city to see its neighborhoods.</p>
            ) : optionsLoading ? (
              <Skeleton className="h-8 w-64" />
            ) : optionsData && !optionsData.available ? (
              <p className="text-sm text-muted-foreground" data-testid="claim-no-options">
                We don't have {city}'s neighborhoods mapped yet. When they're in, you can claim yours here.
              </p>
            ) : unclaimed.length === 0 ? (
              <p className="text-sm text-muted-foreground">You've claimed every {city} neighborhood in the catalog.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {unclaimed.map((o) => (
                  <Button key={o.id} type="button" variant="outline" size="sm" disabled={claimMutation.isPending} onClick={() => claimMutation.mutate(o.id)} data-testid={`claim-option-${o.slug}`}>
                    <MapPin className="w-3 h-3 mr-1" /> {o.name}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : claims.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="claims-empty">No neighborhoods claimed yet.</p>
        ) : (
          <div className="space-y-4">
            {claims.map((c) => <ClaimCard key={c.id} claim={c} />)}
          </div>
        )}
      </div>
    </ExpertLayout>
  );
}
