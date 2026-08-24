import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  CreditCard,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  LinkIcon,
} from "lucide-react";

interface ConnectStatus {
  connected: boolean;
  status: string;
  accountId?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
}

export function StripeConnectCard() {
  const { data: status, isLoading } = useQuery<ConnectStatus>({
    queryKey: ["/api/stripe/connect/status"],
  });

  const onboardMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/connect/onboard");
      return res.json();
    },
    onSuccess: (data: { url: string }) => {
      window.open(data.url, '_blank');
    },
  });

  const dashboardMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/stripe/connect/dashboard", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to get dashboard link");
      return res.json();
    },
    onSuccess: (data: { url: string }) => {
      window.open(data.url, '_blank');
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  const getStatusDisplay = () => {
    if (!status?.connected) {
      return { icon: AlertCircle, color: "text-gray-500", bg: "bg-gray-100", label: "Not Connected", badgeClass: "bg-gray-100 text-gray-700 border-gray-200" };
    }
    switch (status.status) {
      case 'active':
        return { icon: CheckCircle, color: "text-green-600", bg: "bg-green-100", label: "Active", badgeClass: "bg-green-100 text-green-700 border-green-200" };
      case 'under_review':
        return { icon: Clock, color: "text-yellow-600", bg: "bg-yellow-100", label: "Under Review", badgeClass: "bg-yellow-100 text-yellow-700 border-yellow-200" };
      case 'onboarding_incomplete':
        return { icon: AlertCircle, color: "text-orange-600", bg: "bg-orange-100", label: "Incomplete", badgeClass: "bg-orange-100 text-orange-700 border-orange-200" };
      default:
        return { icon: Clock, color: "text-gray-500", bg: "bg-gray-100", label: status.status, badgeClass: "bg-gray-100 text-gray-700 border-gray-200" };
    }
  };

  const display = getStatusDisplay();
  const StatusIcon = display.icon;

  return (
    <Card data-testid="card-stripe-connect">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payout Account
          </div>
          <Badge className={display.badgeClass} data-testid="badge-stripe-status">
            <StatusIcon className="w-3 h-3 mr-1" />
            {display.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!status?.connected ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Connect your Stripe account to receive payouts directly. You'll be guided through a quick setup process.
            </p>
            <Button
              onClick={() => onboardMutation.mutate()}
              disabled={onboardMutation.isPending}
              className="w-full"
              data-testid="button-connect-stripe"
            >
              {onboardMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <LinkIcon className="w-4 h-4 mr-2" />
              )}
              Connect Stripe Account
            </Button>
          </div>
        ) : status.status === 'onboarding_incomplete' ? (
          <div className="space-y-3">
            <p className="text-sm text-orange-600">
              Your Stripe account setup is incomplete. Please finish onboarding to receive payouts.
            </p>
            <Button
              onClick={() => onboardMutation.mutate()}
              disabled={onboardMutation.isPending}
              variant="outline"
              className="w-full border-orange-200 text-orange-700 hover:bg-orange-50"
              data-testid="button-continue-onboarding"
            >
              {onboardMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4 mr-2" />
              )}
              Continue Setup
            </Button>
          </div>
        ) : status.status === 'under_review' ? (
          <div className="space-y-3">
            <p className="text-sm text-yellow-600">
              Your account is under review by Stripe. You'll be able to receive payouts once approved.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              Your account is ready to receive payouts
            </div>
            <Button
              onClick={() => dashboardMutation.mutate()}
              disabled={dashboardMutation.isPending}
              variant="outline"
              className="w-full"
              data-testid="button-stripe-dashboard"
            >
              {dashboardMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4 mr-2" />
              )}
              View Stripe Dashboard
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
