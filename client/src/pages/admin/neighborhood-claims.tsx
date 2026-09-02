/**
 * Admin neighborhood-claims review queue (ledger 2026-08-29-neighborhood-claims).
 *
 * Experts CLAIM neighborhoods here for review; verifying a submitted claim births exactly one
 * expert_neighborhoods row (attribution from the rail, never a body field) or declining returns
 * it with a reason the expert sees verbatim. Siblinged from admin/gem-candidates.tsx.
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
import { MapPin, Loader2, CheckCircle2 } from "lucide-react";

interface ClaimCandidate {
  id: string;
  expertId: string;
  expertFirstName: string | null;
  expertLastName: string | null;
  neighborhoodId: string;
  neighborhoodName: string;
  city: string;
  country: string;
  consentAt: string | null;
  consentVersion: string | null;
  accessNote: string | null;
  submittedAt: string | null;
}

function ClaimCard({ claim }: { claim: ClaimCandidate }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [declineReason, setDeclineReason] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/neighborhood-claims"] });

  const verifyMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/neighborhood-claims/${claim.id}/verify`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Claim verified", description: "The expert's neighborhood coverage is now live." });
    },
    onError: (err: any) =>
      toast({ title: "Verify failed", description: err?.message ?? "Unexpected error", variant: "destructive" }),
  });

  const declineMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/neighborhood-claims/${claim.id}/decline`, { reason: declineReason.trim() }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Claim declined" });
    },
    onError: (err: any) =>
      toast({ title: "Decline failed", description: err?.message ?? "Unexpected error", variant: "destructive" }),
  });

  const expertName = [claim.expertFirstName, claim.expertLastName].filter(Boolean).join(" ") || claim.expertId;

  return (
    <Card data-testid={`card-neighborhood-claim-${claim.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> {claim.neighborhoodName}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{claim.city}{claim.country ? `, ${claim.country}` : ""}</p>
            <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-claim-expert-${claim.id}`}>
              Claimed by {expertName}
            </p>
          </div>
          {claim.submittedAt && (
            <p className="text-xs text-muted-foreground">
              {new Date(claim.submittedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {claim.consentVersion && (
          <p className="text-xs text-muted-foreground">Consent: {claim.consentVersion}</p>
        )}
        {claim.accessNote && (
          <p className="text-sm">{claim.accessNote}</p>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-8 gap-1"
            disabled={verifyMutation.isPending}
            onClick={() => verifyMutation.mutate()}
            data-testid={`button-verify-claim-${claim.id}`}
          >
            {verifyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Verify
          </Button>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground block mb-1">Decline reason (shown to the expert)</label>
            <Input
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              className="h-8 text-sm"
              data-testid={`input-claim-decline-reason-${claim.id}`}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-destructive"
            disabled={!declineReason.trim() || declineMutation.isPending}
            onClick={() => declineMutation.mutate()}
            data-testid={`button-decline-claim-${claim.id}`}
          >
            Decline
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminNeighborhoodClaims() {
  const { data, isLoading } = useQuery<{ claims: ClaimCandidate[] }>({
    queryKey: ["/api/admin/neighborhood-claims"],
  });
  const claims = data?.claims ?? [];

  return (
    <AdminLayout title="Neighborhood Claims">
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MapPin className="w-5 h-5" /> Neighborhood claims review queue
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Experts who have claimed a neighborhood and submitted for review. Verifying publishes
            the expert's coverage; declining returns the claim with your reason.
          </p>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : claims.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-neighborhood-claims">
            No claims awaiting review.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {claims.map((c) => (
              <ClaimCard key={c.id} claim={c} />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
