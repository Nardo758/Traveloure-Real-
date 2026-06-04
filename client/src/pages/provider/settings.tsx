import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Bell, 
  CreditCard, 
  Shield, 
  Clock,
  User,
  Building,
  Save,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  CheckCircle,
  LinkIcon,
  Loader2,
  FileText,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ProviderSettingsData {
  instantBooking: boolean;
  autoResponse: boolean;
  minimumLeadTimeDays: number;
  targetResponseTimeHours: number;
  payoutFrequency: string;
  minimumPayoutAmount: string;
  notificationsJson: Record<string, boolean>;
}

function VerificationPayoutsSection() {
  const { toast } = useToast();

  const { data: idStatus, isLoading: idLoading } = useQuery<any>({
    queryKey: ["/api/provider/application-status"],
  });
  const { data: stripeStatus, isLoading: stripeLoading } = useQuery<any>({
    queryKey: ["/api/stripe/connect/status"],
  });

  const identityMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/identity/create-session", { formType: "provider" });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/application-status"] });
      if (data.verificationUrl) window.open(data.verificationUrl, "_blank");
    },
    onError: () => toast({ title: "Verification unavailable", description: "Please try again later.", variant: "destructive" }),
  });

  const onboardMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/stripe/connect/onboard"); return res.json(); },
    onSuccess: (data: any) => { if (data.url) window.open(data.url, "_blank"); },
    onError: () => toast({ title: "Error", description: "Could not start Stripe setup.", variant: "destructive" }),
  });

  const dashboardMutation = useMutation({
    mutationFn: async () => { const res = await fetch("/api/stripe/connect/dashboard", { credentials: "include" }); if (!res.ok) throw new Error(); return res.json(); },
    onSuccess: (data: any) => { if (data.url) window.open(data.url, "_blank"); },
  });

  const idVerifStatus = idStatus?.identityVerificationStatus ?? "pending";
  const bizVerifStatus = idStatus?.businessVerificationStatus ?? "pending";

  const statusBadge = (s: string) => {
    if (s === "verified") return <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>;
    if (s === "processing") return <Badge className="bg-amber-100 text-amber-700"><Clock className="w-3 h-3 mr-1" />Processing</Badge>;
    if (s === "failed") return <Badge className="bg-red-100 text-red-700"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    return <Badge variant="secondary">Not started</Badge>;
  };

  const stripeStatusKey = stripeStatus?.status ?? "not_connected";
  const stripeBadge = stripeStatusKey === "active"
    ? <Badge className="bg-green-100 text-green-700"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>
    : stripeStatusKey === "onboarding_incomplete"
    ? <Badge className="bg-orange-100 text-orange-700"><AlertCircle className="w-3 h-3 mr-1" />Incomplete</Badge>
    : stripeStatusKey === "under_review"
    ? <Badge className="bg-amber-100 text-amber-700"><Clock className="w-3 h-3 mr-1" />Under Review</Badge>
    : <Badge variant="secondary">Not connected</Badge>;

  return (
    <div className="space-y-4">
      {/* Identity Verification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              Identity Verification
            </div>
            {idLoading ? <Loader2 className="w-4 h-4 animate-spin text-console-mid" /> : statusBadge(idVerifStatus)}
          </CardTitle>
          <CardDescription>Verify your personal government-issued ID. Required for all providers before payouts are enabled.</CardDescription>
        </CardHeader>
        <CardContent>
          {idVerifStatus === "verified" ? (
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-800">Identity confirmed</p>
                {idStatus?.identityVerifiedAt && <p className="text-sm text-green-600">Verified on {new Date(idStatus.identityVerifiedAt).toLocaleDateString()}</p>}
              </div>
            </div>
          ) : idVerifStatus === "processing" ? (
            <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-700">Your verification is being processed — usually takes a few minutes.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {idVerifStatus === "failed" && (
                <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-700">Verification failed. Please try again with a clear photo of your ID.</p>
                </div>
              )}
              <p className="text-sm text-console-dark">Supports passports, national IDs, and driver's licenses from 100+ countries. Takes about 2 minutes.</p>
              <Button onClick={() => identityMutation.mutate()} disabled={identityMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-verify-identity">
                {identityMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                {idVerifStatus === "failed" ? "Retry Verification" : "Verify My Identity"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Business Verification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-600" />
              Business Verification
            </div>
            {idLoading ? <Loader2 className="w-4 h-4 animate-spin text-console-mid" /> : statusBadge(bizVerifStatus)}
          </CardTitle>
          <CardDescription>Verify your business registration to unlock full provider features and higher booking limits.</CardDescription>
        </CardHeader>
        <CardContent>
          {bizVerifStatus === "verified" ? (
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="font-medium text-green-800">Business verified</p>
            </div>
          ) : bizVerifStatus === "processing" ? (
            <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-700">Business verification is under review — typically 1-2 business days.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {bizVerifStatus === "failed" && (
                <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-700">Business verification was unsuccessful. Please re-submit your documents.</p>
                </div>
              )}
              <p className="text-sm text-console-dark">Submit your business registration number and supporting documents (business license, certificate of incorporation, or equivalent).</p>
              <a href="/provider-status" className="block">
                <Button variant="outline" className="w-full border-purple-200 text-purple-700 hover:bg-purple-50" data-testid="button-business-verify">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {bizVerifStatus === "failed" ? "Resubmit Business Documents" : "Start Business Verification"}
                </Button>
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stripe Connect */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-console-dark" />
              Payout Account (Stripe Connect)
            </div>
            {stripeLoading ? <Loader2 className="w-4 h-4 animate-spin text-console-mid" /> : stripeBadge}
          </CardTitle>
          <CardDescription>Connect your Stripe account to receive payouts directly when clients book your services.</CardDescription>
        </CardHeader>
        <CardContent>
          {!stripeStatus?.connected ? (
            <div className="space-y-3">
              <p className="text-sm text-console-dark">You'll be guided through a quick Stripe setup — about 5 minutes. Stripe securely collects your bank details.</p>
              <Button onClick={() => onboardMutation.mutate()} disabled={onboardMutation.isPending} className="w-full" data-testid="button-connect-stripe">
                {onboardMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-2" />}
                Connect Stripe Account
              </Button>
            </div>
          ) : stripeStatusKey === "onboarding_incomplete" ? (
            <div className="space-y-3">
              <p className="text-sm text-orange-600">Your Stripe setup is incomplete. Finish to start receiving payouts.</p>
              <Button onClick={() => onboardMutation.mutate()} disabled={onboardMutation.isPending} variant="outline" className="w-full border-orange-200 text-orange-700 hover:bg-orange-50" data-testid="button-continue-stripe">
                {onboardMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                Continue Setup
              </Button>
            </div>
          ) : stripeStatusKey === "under_review" ? (
            <p className="text-sm text-amber-700">Your account is under review by Stripe. Payouts will be enabled once approved.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-700 p-3 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle className="w-4 h-4" />Your account is active and ready to receive payouts.
              </div>
              <Button onClick={() => dashboardMutation.mutate()} disabled={dashboardMutation.isPending} variant="outline" className="w-full" data-testid="button-stripe-dashboard">
                {dashboardMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                View Stripe Dashboard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProviderSettings() {
  const { toast } = useToast();

  const { data: serverSettings } = useQuery<ProviderSettingsData>({
    queryKey: ["/api/provider/settings"],
  });

  const [notifications, setNotifications] = useState({
    newBookings: true,
    bookingUpdates: true,
    messages: true,
    reviews: true,
    payouts: true,
    marketing: false,
  });
  const [autoResponse, setAutoResponse] = useState(true);
  const [instantBooking, setInstantBooking] = useState(false);
  const [leadTime, setLeadTime] = useState("7");
  const [responseTime, setResponseTime] = useState("2");
  const [payoutFrequency, setPayoutFrequency] = useState("monthly");
  const [minPayout, setMinPayout] = useState("100");

  useEffect(() => {
    if (serverSettings) {
      setInstantBooking(serverSettings.instantBooking ?? false);
      setAutoResponse(serverSettings.autoResponse ?? true);
      setLeadTime(String(serverSettings.minimumLeadTimeDays ?? 7));
      setResponseTime(String(serverSettings.targetResponseTimeHours ?? 2));
      setPayoutFrequency(serverSettings.payoutFrequency ?? "monthly");
      setMinPayout(String(serverSettings.minimumPayoutAmount ?? "100"));
      if (serverSettings.notificationsJson) {
        setNotifications(serverSettings.notificationsJson as typeof notifications);
      }
    }
  }, [serverSettings]);

  const saveSettingsMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/provider/settings", {
        instantBooking,
        autoResponse,
        minimumLeadTimeDays: parseInt(leadTime, 10),
        targetResponseTimeHours: parseInt(responseTime, 10),
        payoutFrequency,
        minimumPayoutAmount: minPayout,
        notificationsJson: notifications,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/settings"] });
      toast({ title: "Settings saved", description: "Your preferences have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    },
  });

  return (
    <ProviderLayout title="Settings">
      <div className="p-6 space-y-6 max-w-4xl">
        {/* Verification & Payouts */}
        <div>
          <h2 className="text-lg font-semibold text-console-darkest mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            Verification & Payouts
          </h2>
          <VerificationPayoutsSection />
        </div>

        {/* Account Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-console-mid" />
              Account Settings
            </CardTitle>
            <CardDescription>Manage your account credentials and security</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button variant="outline" data-testid="button-change-password">
                <Shield className="w-4 h-4 mr-2" /> Change Password
              </Button>
              <Button variant="outline" data-testid="button-two-factor">
                Enable Two-Factor Auth
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Business Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="w-5 h-5 text-console-mid" />
              Business Preferences
            </CardTitle>
            <CardDescription>Configure how you receive and manage bookings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Instant Booking</Label>
                <p className="text-sm text-console-mid">
                  Allow clients to book without prior approval
                </p>
              </div>
              <Switch
                checked={instantBooking}
                onCheckedChange={setInstantBooking}
                data-testid="switch-instant-booking"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Auto-Response</Label>
                <p className="text-sm text-console-mid">
                  Send automatic responses to new inquiries
                </p>
              </div>
              <Switch
                checked={autoResponse}
                onCheckedChange={setAutoResponse}
                data-testid="switch-auto-response"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lead-time">Minimum Lead Time</Label>
              <div className="flex items-center gap-2">
                <Input 
                  id="lead-time" 
                  type="number" 
                  value={leadTime}
                  onChange={(e) => setLeadTime(e.target.value)}
                  className="w-24"
                  data-testid="input-lead-time"
                />
                <span className="text-console-dark">days before event</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="response-time">
                <Clock className="w-4 h-4 inline mr-1" />
                Target Response Time
              </Label>
              <div className="flex items-center gap-2">
                <Input 
                  id="response-time" 
                  type="number" 
                  value={responseTime}
                  onChange={(e) => setResponseTime(e.target.value)}
                  className="w-24"
                  data-testid="input-response-time"
                />
                <span className="text-console-dark">hours</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-console-mid" />
              Notification Preferences
            </CardTitle>
            <CardDescription>Choose how you want to be notified</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(notifications).map(([key, value]) => {
              const labels: Record<string, { title: string; desc: string }> = {
                newBookings: { title: "New Booking Requests", desc: "Get notified when you receive a new booking request" },
                bookingUpdates: { title: "Booking Updates", desc: "Updates on confirmed bookings and changes" },
                messages: { title: "Messages", desc: "New messages from clients and experts" },
                reviews: { title: "Reviews", desc: "When clients leave reviews" },
                payouts: { title: "Payout Notifications", desc: "Payout processing and completion" },
                marketing: { title: "Marketing & Tips", desc: "Tips to improve your listing and promotions" },
              };
              
              return (
                <div key={key} className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <Label className="text-base">{labels[key]?.title ?? key}</Label>
                    <p className="text-sm text-console-mid">{labels[key]?.desc ?? ""}</p>
                  </div>
                  <Switch
                    checked={value}
                    onCheckedChange={(checked) => 
                      setNotifications(prev => ({ ...prev, [key]: checked }))
                    }
                    data-testid={`switch-notification-${key}`}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Payment Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-console-mid" />
              Payment Settings
            </CardTitle>
            <CardDescription>Manage your payout methods and preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Payout Frequency</Label>
              <div className="flex gap-2">
                {(["weekly", "biweekly", "monthly"] as const).map((freq) => (
                  <Button
                    key={freq}
                    variant={payoutFrequency === freq ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setPayoutFrequency(freq)}
                    data-testid={`button-payout-${freq}`}
                  >
                    {freq.charAt(0).toUpperCase() + freq.slice(1).replace("biweekly", "Bi-weekly")}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Minimum Payout Amount</Label>
              <div className="flex items-center gap-2">
                <span className="text-console-dark">$</span>
                <Input 
                  type="number" 
                  value={minPayout}
                  onChange={(e) => setMinPayout(e.target.value)}
                  className="w-32"
                  data-testid="input-min-payout"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={() => saveSettingsMutation.mutate()}
            disabled={saveSettingsMutation.isPending}
            data-testid="button-save-settings"
          >
            <Save className="w-4 h-4 mr-2" />
            {saveSettingsMutation.isPending ? "Saving..." : "Save All Settings"}
          </Button>
        </div>
      </div>
    </ProviderLayout>
  );
}
