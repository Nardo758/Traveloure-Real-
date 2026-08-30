/**
 * Admin gem-candidate review queue (2026-08-29-replit-gem-audit ruling 4).
 *
 * Nugget → gem promotion enters ADMIN REVIEW + SCORING here: each submitted
 * local_knowledge_nugget candidate is approved with an admin-assigned gem
 * score (1–100) — birthing the travel_pulse_hidden_gems row with
 * curated_by_expert_id = the nugget's author (provenance from the rail,
 * ruling 1) — or rejected with a reason the expert sees verbatim.
 */
import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Gem, MapPin, Loader2 } from "lucide-react";

interface GemCandidate {
  id: string;
  nuggetType: string;
  city: string;
  linkedPoi: string | null;
  linkedNeighbourhood: string | null;
  insight: string;
  targetAudience: string | null;
  notFor: string | null;
  promotionSubmittedAt: string | null;
  expertUserId: string;
  authorFirstName: string | null;
  authorLastName: string | null;
}

function CandidateCard({ candidate }: { candidate: GemCandidate }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [gemScore, setGemScore] = useState("");
  const [placeName, setPlaceName] = useState(candidate.linkedPoi ?? "");
  const [rejectReason, setRejectReason] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/gem-candidates"] });

  const approveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/gem-candidates/${candidate.id}/approve`, {
        gemScore: Number(gemScore),
        ...(placeName.trim() ? { placeName: placeName.trim() } : {}),
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Gem approved", description: "The gem is live with the expert's attribution." });
    },
    onError: (err: any) =>
      toast({ title: "Approve failed", description: err?.message ?? "Unexpected error", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/gem-candidates/${candidate.id}/reject`, { reason: rejectReason.trim() }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Candidate rejected" });
    },
    onError: (err: any) =>
      toast({ title: "Reject failed", description: err?.message ?? "Unexpected error", variant: "destructive" }),
  });

  const scoreNum = Number(gemScore);
  const scoreValid = Number.isInteger(scoreNum) && scoreNum >= 1 && scoreNum <= 100;
  const authorName = [candidate.authorFirstName, candidate.authorLastName].filter(Boolean).join(" ") || candidate.expertUserId;

  return (
    <Card data-testid={`card-gem-candidate-${candidate.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Badge variant="outline" className="text-xs capitalize">{candidate.nuggetType}</Badge>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {candidate.city}
              {candidate.linkedNeighbourhood ? ` · ${candidate.linkedNeighbourhood}` : ""}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-candidate-author-${candidate.id}`}>
              Proposed by {authorName}
            </p>
          </div>
          {candidate.promotionSubmittedAt && (
            <p className="text-xs text-muted-foreground">
              {new Date(candidate.promotionSubmittedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{candidate.insight}</p>
        {candidate.targetAudience && (
          <p className="text-xs text-muted-foreground">For: {candidate.targetAudience}</p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Place name</label>
            <Input
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              placeholder={candidate.linkedPoi ?? "Required — nugget has no linked POI"}
              className="h-8 w-56 text-sm"
              data-testid={`input-candidate-place-${candidate.id}`}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Gem score (1–100)</label>
            <Input
              value={gemScore}
              onChange={(e) => setGemScore(e.target.value)}
              inputMode="numeric"
              className="h-8 w-24 text-sm"
              data-testid={`input-candidate-score-${candidate.id}`}
            />
          </div>
          <Button
            size="sm"
            className="h-8"
            disabled={!scoreValid || approveMutation.isPending}
            onClick={() => approveMutation.mutate()}
            data-testid={`button-approve-candidate-${candidate.id}`}
          >
            {approveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Approve as gem"}
          </Button>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground block mb-1">Rejection reason (shown to the expert)</label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="h-8 text-sm"
              data-testid={`input-candidate-reject-reason-${candidate.id}`}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-destructive"
            disabled={!rejectReason.trim() || rejectMutation.isPending}
            onClick={() => rejectMutation.mutate()}
            data-testid={`button-reject-candidate-${candidate.id}`}
          >
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminGemCandidates() {
  const { data, isLoading } = useQuery<{ candidates: GemCandidate[] }>({
    queryKey: ["/api/admin/gem-candidates"],
  });
  const candidates = data?.candidates ?? [];

  return (
    <AdminLayout title="Gem Candidates">
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Gem className="w-5 h-5" /> Nugget → gem review queue
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Expert-proposed knowledge nuggets awaiting review. Approval assigns the gem score and
            publishes the gem attributed to its author; rejection returns it with your reason.
          </p>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-gem-candidates">
            No candidates awaiting review.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {candidates.map((c) => (
              <CandidateCard key={c.id} candidate={c} />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
