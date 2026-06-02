import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Bot, 
  Palette,
  Calendar,
  Mail,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  CreditCard,
  CheckCircle,
  Loader2,
} from "lucide-react";

function VerificationPayoutsSection() {
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
    <div className="space-y-4">
      {/* Identity Verification */}
      <Card data-testid="card-ea-identity-verification">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              Identity Verification
            </div>
            {idLoading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : idBadge}
          </CardTitle>
          <CardDescription>Verify your government-issued ID to build trust with clients and unlock platform features.</CardDescription>
        </CardHeader>
        <CardContent>
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
                <p className="text-xs text-amber-600">We're reviewing your submission. Usually 1–2 business days.</p>
              </div>
            </div>
          ) : idVerifStatus === "failed" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-800">Verification failed</p>
                  <p className="text-xs text-red-600">Please try again with a clear, valid ID.</p>
                </div>
              </div>
              <Button size="sm" onClick={() => identityMutation.mutate()} disabled={identityMutation.isPending} className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-ea-retry-identity">
                {identityMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}Retry
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Upload a government-issued ID and take a short selfie. Takes about 3 minutes.</p>
              <Button size="sm" onClick={() => identityMutation.mutate()} disabled={identityMutation.isPending} className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-ea-start-identity">
                {identityMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}Start Verification
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payout Account */}
      <Card data-testid="card-ea-payout-account">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-purple-600" />
              Payout Account (Stripe Connect)
            </div>
            {stripeLoading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : stripeBadge}
          </CardTitle>
          <CardDescription>Connect your bank account to receive earnings directly.</CardDescription>
        </CardHeader>
        <CardContent>
          {stripeStatusKey === "active" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">Payout account active</p>
                  <p className="text-xs text-green-600">Earnings are deposited automatically to your bank account.</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => dashboardMutation.mutate()} disabled={dashboardMutation.isPending} data-testid="button-ea-stripe-dashboard">
                {dashboardMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}Open Stripe Dashboard
              </Button>
            </div>
          ) : stripeStatusKey === "onboarding_incomplete" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-orange-800">Setup incomplete</p>
                  <p className="text-xs text-orange-600">Finish setting up your payout account to receive earnings.</p>
                </div>
              </div>
              <Button size="sm" onClick={() => onboardMutation.mutate()} disabled={onboardMutation.isPending} className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-ea-continue-stripe">
                {onboardMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}Continue Setup
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Connect your bank account via Stripe. Your financial details are handled securely — Traveloure never sees your banking information.</p>
              <Button size="sm" onClick={() => onboardMutation.mutate()} disabled={onboardMutation.isPending} className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-ea-connect-stripe">
                {onboardMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}Connect Payout Account
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function EASettings() {
  const aiSettings = [
    { id: 1, label: "Auto-delegate routine tasks", enabled: true },
    { id: 2, label: "AI draft communications", enabled: true },
    { id: 3, label: "Smart calendar suggestions", enabled: true },
    { id: 4, label: "Proactive travel recommendations", enabled: false },
    { id: 5, label: "Gift reminders", enabled: true },
  ];

  const generalSettings = [
    { id: 1, label: "Show executive photos", enabled: true },
    { id: 2, label: "Compact view mode", enabled: false },
    { id: 3, label: "Show calendar week numbers", enabled: false },
    { id: 4, label: "24-hour time format", enabled: false },
  ];

  return (
    <EALayout title="Settings">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="text-settings-title">
            Settings
          </h1>
          <p className="text-gray-600">Configure your workspace preferences</p>
        </div>

        {/* Verification & Payouts */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            Verification & Payouts
          </h2>
          <VerificationPayoutsSection />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Assistant Settings */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bot className="w-5 h-5 text-green-600" />
                AI Assistant
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiSettings.map((setting) => (
                <div 
                  key={setting.id} 
                  className="flex items-center justify-between"
                  data-testid={`ai-setting-${setting.id}`}
                >
                  <span className="text-gray-700">{setting.label}</span>
                  <Switch 
                    defaultChecked={setting.enabled} 
                    data-testid={`switch-ai-${setting.id}`}
                  />
                </div>
              ))}
              <Button variant="outline" className="w-full mt-4" data-testid="button-ai-training">
                AI Training Preferences
              </Button>
            </CardContent>
          </Card>

          {/* Display Settings */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Palette className="w-5 h-5" />
                Display
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {generalSettings.map((setting) => (
                <div 
                  key={setting.id} 
                  className="flex items-center justify-between"
                  data-testid={`display-setting-${setting.id}`}
                >
                  <span className="text-gray-700">{setting.label}</span>
                  <Switch 
                    defaultChecked={setting.enabled} 
                    data-testid={`switch-display-${setting.id}`}
                  />
                </div>
              ))}
              <div className="pt-4 border-t border-gray-100">
                <Label className="mb-2 block">Theme</Label>
                <Select defaultValue="light" data-testid="select-theme">
                  <SelectTrigger>
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Calendar Settings */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Calendar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="mb-2 block">Default Calendar View</Label>
                <Select defaultValue="week" data-testid="select-calendar-view">
                  <SelectTrigger>
                    <SelectValue placeholder="Select view" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Week Starts On</Label>
                <Select defaultValue="monday" data-testid="select-week-start">
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sunday">Sunday</SelectItem>
                    <SelectItem value="monday">Monday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Working Hours</Label>
                <div className="flex gap-2">
                  <Select defaultValue="9" data-testid="select-start-hour">
                    <SelectTrigger className="w-24">
                      <SelectValue placeholder="Start" />
                    </SelectTrigger>
                    <SelectContent>
                      {[...Array(12)].map((_, i) => (
                        <SelectItem key={i} value={String(i + 6)}>{i + 6}:00 AM</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="flex items-center text-gray-500">to</span>
                  <Select defaultValue="17" data-testid="select-end-hour">
                    <SelectTrigger className="w-24">
                      <SelectValue placeholder="End" />
                    </SelectTrigger>
                    <SelectContent>
                      {[...Array(12)].map((_, i) => (
                        <SelectItem key={i} value={String(i + 12)}>{i + 12}:00 PM</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Email Integration */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Email Integration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Outlook Integration</p>
                  <p className="text-sm text-gray-500">Sync calendars and contacts</p>
                </div>
                <Button variant="outline" size="sm" data-testid="button-connect-outlook">
                  Connect
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Gmail Integration</p>
                  <p className="text-sm text-gray-500">Sync emails and calendar</p>
                </div>
                <Button variant="outline" size="sm" data-testid="button-connect-gmail">
                  Connect
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Slack Integration</p>
                  <p className="text-sm text-gray-500">Receive notifications</p>
                </div>
                <Button variant="outline" size="sm" data-testid="button-connect-slack">
                  Connect
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-save-settings">
            Save All Settings
          </Button>
        </div>
      </div>
    </EALayout>
  );
}
