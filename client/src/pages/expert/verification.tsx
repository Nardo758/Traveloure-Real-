import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  CreditCard,
  CheckCircle,
  Loader2,
} from "lucide-react";

export default function ExpertVerification() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: idStatus, isLoading: idLoading } = useQuery<any>({
    queryKey: ["/api/expert/application-status"],
  });
  const { data: stripeStatus, isLoading: stripeLoading } = useQuery<any>({
    queryKey: ["/api/stripe/connect/status"],
  });

  const identityMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/identity/create-session", { formType: "expert" });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/application-status"] });
      if (data.verificationUrl) window.open(data.verificationUrl, "_blank");
    },
    onError: () => toast({ title: "Verification unavailable", description: "Please try again later.", variant: "destructive" }),
  });

  const onboardMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/connect/onboard");
      return res.json();
    },
    onSuccess: (data: any) => { if (data.url) window.open(data.url, "_blank"); },
    onError: () => toast({ title: "Error", description: "Could not start Stripe setup.", variant: "destructive" }),
  });

  const dashboardMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/stripe/connect/dashboard", { credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: (data: any) => { if (data.url) window.open(data.url, "_blank"); },
    onError: () => toast({ title: "Error", description: "Could not open Stripe dashboard.", variant: "destructive" }),
  });

  const idVerifStatus = idStatus?.identityVerificationStatus ?? "pending";

  const idBadge = idVerifStatus === "verified"
    ? <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>
    : idVerifStatus === "processing"
    ? <Badge className="bg-amber-100 text-amber-700"><Clock className="w-3 h-3 mr-1" />Processing</Badge>
    : idVerifStatus === "failed"
    ? <Badge className="bg-red-100 text-red-700"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>
    : <Badge variant="secondary">Not started</Badge>;

  const stripeStatusKey = stripeStatus?.status ?? "not_connected";
  const stripeBadge = stripeStatusKey === "active"
    ? <Badge className="bg-green-100 text-green-700"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>
    : stripeStatusKey === "onboarding_incomplete"
    ? <Badge className="bg-orange-100 text-orange-700"><AlertCircle className="w-3 h-3 mr-1" />Incomplete</Badge>
    : stripeStatusKey === "under_review"
    ? <Badge className="bg-amber-100 text-amber-700"><Clock className="w-3 h-3 mr-1" />Under Review</Badge>
    : <Badge variant="secondary">Not connected</Badge>;

  return (
    <ExpertLayout title="Verification & Payouts">
      <div className="p-6 space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="text-verification-title">Verification & Payouts</h1>
          <p className="text-gray-500 mt-1">Complete these steps to unlock full platform features and receive earnings.</p>
        </div>

        {/* Identity Verification */}
        <Card data-testid="card-identity-verification">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                Identity Verification
              </div>
              {idLoading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : idBadge}
            </CardTitle>
            <CardDescription>Verify your government-issued ID to build trust with travellers and unlock higher visibility on the platform.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {idVerifStatus === "verified" ? (
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">Identity verified</p>
                  <p className="text-xs text-green-600">Your government ID and selfie have been confirmed.</p>
                </div>
              </div>
            ) : idVerifStatus === "processing" ? (
              <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Under review</p>
                  <p className="text-xs text-amber-600">We're reviewing your submission. This usually takes 1–2 business days.</p>
                </div>
              </div>
            ) : idVerifStatus === "failed" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-800">Verification failed</p>
                    <p className="text-xs text-red-600">Your documents could not be verified. Please try again with clear, valid ID.</p>
                  </div>
                </div>
                <Button
                  onClick={() => identityMutation.mutate()}
                  disabled={identityMutation.isPending}
                  className="bg-[#FF385C] hover:bg-[#E23350]"
                  data-testid="button-retry-identity"
                >
                  {identityMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                  Retry Verification
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">You'll need to upload a government-issued ID (passport, driving licence, or national ID) and take a short selfie. The process takes about 3 minutes.</p>
                <Button
                  onClick={() => identityMutation.mutate()}
                  disabled={identityMutation.isPending}
                  className="bg-[#FF385C] hover:bg-[#E23350]"
                  data-testid="button-start-identity"
                >
                  {identityMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                  Start Identity Verification
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payout Account */}
        <Card data-testid="card-payout-account">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-purple-600" />
                Payout Account (Stripe Connect)
              </div>
              {stripeLoading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : stripeBadge}
            </CardTitle>
            <CardDescription>Connect your bank account to receive earnings from bookings and consultations directly.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stripeStatusKey === "active" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-800">Payout account active</p>
                    <p className="text-xs text-green-600">Earnings are automatically deposited to your connected bank account.</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => dashboardMutation.mutate()}
                  disabled={dashboardMutation.isPending}
                  data-testid="button-stripe-dashboard"
                >
                  {dashboardMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                  Open Stripe Dashboard
                </Button>
              </div>
            ) : stripeStatusKey === "onboarding_incomplete" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-orange-800">Setup incomplete</p>
                    <p className="text-xs text-orange-600">Please finish setting up your payout account to receive earnings.</p>
                  </div>
                </div>
                <Button
                  onClick={() => onboardMutation.mutate()}
                  disabled={onboardMutation.isPending}
                  className="bg-[#FF385C] hover:bg-[#E23350]"
                  data-testid="button-continue-stripe"
                >
                  {onboardMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                  Continue Setup
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Connect your bank account via Stripe. Your financial details are handled securely by Stripe — Traveloure never sees your banking information.</p>
                <Button
                  onClick={() => onboardMutation.mutate()}
                  disabled={onboardMutation.isPending}
                  className="bg-[#FF385C] hover:bg-[#E23350]"
                  data-testid="button-connect-stripe"
                >
                  {onboardMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                  Connect Payout Account
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ExpertLayout>
  );
}
