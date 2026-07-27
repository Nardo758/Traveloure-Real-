import { useState } from "react";
import { Link } from "wouter";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { HandleClaimCard } from "@/components/backoffice/handle-claim-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Bell,
  Lock,
  Globe,
  Zap,
  Edit,
  Eye,
  EyeOff,
  Save,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  CreditCard,
  CheckCircle,
  LinkIcon,
  Loader2,
  ArrowRight,
  Info,
} from "lucide-react";

interface NotificationSetting {
  name: string;
  email: boolean;
  push: boolean;
}

// NOTE (B6 deviation, recorded here rather than silently worked around): the phase brief for
// this tab claimed `users.preferences` jsonb exists (shared/schema.ts:78) as the persistence
// store for Notifications + Preferences. That line is `trips.preferences`, not `users` — the
// real `users` table (shared/models/auth.ts:38) carries no `preferences`/`settings` column, and
// no migration ever added one (checked server/migrations for `ALTER TABLE users`). Adding one
// requires a schema.ts change + a migration, both outside this phase's file scope
// (server/routes/storefront.routes.ts, settings.tsx, profile.tsx only — no schema, no
// migrations). Rather than wire a Save button to an endpoint that would 500 against a
// nonexistent column (a worse trap than the original useState theater — silent-failure, not
// honest-failure per §13), these two tabs get the same honest-gate treatment Part 2 mandates
// for Security-with-no-endpoint: controls stay visible, Save is disabled, and the reason is
// stated. Filed follow-up: add `users.preferences` (or a dedicated `user_settings` table) via a
// real migration, then wire GET/PATCH /api/me/preferences for real.
function UnavailableNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-800">
      <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <p>{children}</p>
    </div>
  );
}

function PointerCard({
  title,
  description,
  body,
  links,
}: {
  title: string;
  description: string;
  body: string;
  links: { label: string; href: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-console-mid">{body}</p>
        <div className="flex flex-wrap gap-3">
          {links.map((l) => (
            <Link key={l.href} href={l.href}>
              <Button variant="outline" className="gap-2" data-testid={`link-${l.href.replace(/\//g, "-")}`}>
                {l.label} <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function VerificationPayoutsTab() {
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
    mutationFn: async () => { const res = await apiRequest("POST", "/api/stripe/connect/onboard"); return res.json(); },
    onSuccess: (data: any) => { if (data.url) window.open(data.url, "_blank"); },
    onError: () => toast({ title: "Error", description: "Could not start Stripe setup.", variant: "destructive" }),
  });

  const dashboardMutation = useMutation({
    mutationFn: async () => { const res = await fetch("/api/stripe/connect/dashboard", { credentials: "include" }); if (!res.ok) throw new Error(); return res.json(); },
    onSuccess: (data: any) => { if (data.url) window.open(data.url, "_blank"); },
  });

  const idVerifStatus = idStatus?.identityVerificationStatus ?? "pending";

  const idBadge = idVerifStatus === "verified"
    ? <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>
    : idVerifStatus === "processing"
    ? <Badge className="bg-amber-100 text-amber-700"><Clock className="w-3 h-3 mr-1" />Processing</Badge>
    : idVerifStatus === "failed"
    ? <Badge className="bg-red-100 text-red-700"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>
    : <Badge variant="secondary">Not started</Badge>;

  const stripeConnected = stripeStatus?.connected;
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
            {idLoading ? <Loader2 className="w-4 h-4 animate-spin text-console-mid" /> : idBadge}
          </CardTitle>
          <CardDescription>Verify your government-issued ID to build trust with travellers and unlock higher visibility on the platform.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {idVerifStatus === "verified" ? (
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-800">Identity confirmed</p>
                {idStatus?.identityVerifiedAt && (
                  <p className="text-sm text-green-600">Verified on {new Date(idStatus.identityVerifiedAt).toLocaleDateString()}</p>
                )}
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
                  <p className="text-sm text-red-700">Verification failed. Please try again with a clear, unobstructed photo of your ID.</p>
                </div>
              )}
              <p className="text-sm text-console-mid">Supports passports, national IDs, and driver's licenses from 100+ countries. Takes about 2 minutes.</p>
              <Button
                onClick={() => identityMutation.mutate()}
                disabled={identityMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                data-testid="button-verify-identity"
              >
                {identityMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                {idVerifStatus === "failed" ? "Retry Verification" : "Verify My Identity"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stripe Connect / Payouts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-console-mid" />
              Payout Account (Stripe Connect)
            </div>
            {stripeLoading ? <Loader2 className="w-4 h-4 animate-spin text-console-mid" /> : stripeBadge}
          </CardTitle>
          <CardDescription>Connect your Stripe account to receive payouts directly when travellers book your services.</CardDescription>
        </CardHeader>
        <CardContent>
          {!stripeConnected ? (
            <div className="space-y-3">
              <p className="text-sm text-console-mid">You'll be guided through a quick Stripe setup — takes about 5 minutes. Stripe collects your bank details securely.</p>
              <Button onClick={() => onboardMutation.mutate()} disabled={onboardMutation.isPending} className="w-full" data-testid="button-connect-stripe">
                {onboardMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-2" />}
                Connect Stripe Account
              </Button>
            </div>
          ) : stripeStatusKey === "onboarding_incomplete" ? (
            <div className="space-y-3">
              <p className="text-sm text-orange-600">Your Stripe setup is incomplete. Finish onboarding to start receiving payouts.</p>
              <Button onClick={() => onboardMutation.mutate()} disabled={onboardMutation.isPending} variant="outline" className="w-full border-orange-200 text-orange-700 hover:bg-orange-50" data-testid="button-continue-stripe">
                {onboardMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                Continue Setup
              </Button>
            </div>
          ) : stripeStatusKey === "under_review" ? (
            <p className="text-sm text-amber-700">Your account is under review by Stripe. You'll be able to receive payouts once approved.</p>
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

export default function ExpertSettings() {
  // Notification settings — UI-only (no persistence store; see the UnavailableNote comment
  // above for why). Controls stay visible/interactive locally so the tab isn't blank, but the
  // Save button is disabled — never a Save that silently no-ops.
  const [notifications, setNotifications] = useState<NotificationSetting[]>([
    { name: "New Message", email: true, push: true },
    { name: "Booking Request", email: true, push: true },
    { name: "Itinerary Update", email: false, push: true },
    { name: "Payment Received", email: true, push: true },
    { name: "Platform Announcements", email: true, push: false },
  ]);

  // Preferences — same UI-only posture as notifications above.
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("UTC+9");
  const [enableLeaderboard, setEnableLeaderboard] = useState(true);
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const toggleNotification = (index: number, type: "email" | "push") => {
    const updated = [...notifications];
    updated[index] = {
      ...updated[index],
      [type]: !updated[index][type],
    };
    setNotifications(updated);
  };

  return (
    <ExpertLayout>
      <div className="p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold text-console-darkest">Settings</h1>
          <p className="text-console-mid mt-1">Manage your preferences and account settings</p>
        </div>

        <HandleClaimCard />

        <Tabs defaultValue="verification" className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="verification" className="flex items-center gap-2" data-testid="tab-verification">
              <ShieldCheck className="w-4 h-4" /> Verification
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="w-4 h-4" /> Notifications
            </TabsTrigger>
            <TabsTrigger value="availability" className="flex items-center gap-2">
              <Zap className="w-4 h-4" /> Availability
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <Edit className="w-4 h-4" /> Templates
            </TabsTrigger>
            <TabsTrigger value="preferences" className="flex items-center gap-2">
              <Globe className="w-4 h-4" /> Preferences
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Lock className="w-4 h-4" /> Security
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="flex items-center gap-2">
              <Eye className="w-4 h-4" /> Leaderboard
            </TabsTrigger>
          </TabsList>

          {/* Verification & Payouts Tab */}
          <TabsContent value="verification" className="mt-6">
            <VerificationPayoutsTab />
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Choose how you want to be notified</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {notifications.map((notification, index) => (
                  <div key={notification.name} className="flex items-center justify-between pb-4 border-b last:border-0 last:pb-0">
                    <div>
                      <p className="font-semibold text-console-darkest">{notification.name}</p>
                      <p className="text-sm text-console-mid mt-1">Receive via email and push notifications</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-console-mid">Email</Label>
                        <Switch
                          checked={notification.email}
                          onCheckedChange={() => toggleNotification(index, "email")}
                          data-testid={`toggle-email-${index}`}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-console-mid">Push</Label>
                        <Switch
                          checked={notification.push}
                          onCheckedChange={() => toggleNotification(index, "push")}
                          data-testid={`toggle-push-${index}`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <UnavailableNote>
                  Saving isn't available yet — notification preferences have no backend to persist
                  to. Toggles here are visual only until this is wired up.
                </UnavailableNote>
                <Button
                  className="w-full mt-4 bg-primary hover:bg-primary/90"
                  data-testid="button-save-notifications"
                  disabled
                  title="Not available yet — no persistence store is wired for notification preferences."
                >
                  <Save className="w-4 h-4 mr-2" /> Save Preferences
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Availability Status Tab — theater removed; real slot CRUD lives in Catalog (B3). */}
          <TabsContent value="availability" className="mt-6">
            <PointerCard
              title="Availability"
              description="Availability now lives in Catalog"
              body="Bookable availability is managed per service in Catalog — add and edit slots there instead of a global status here."
              links={[{ label: "Go to Catalog", href: "/expert/catalog" }]}
            />
          </TabsContent>

          {/* Response Templates Tab — the itinerary-template seller surface is retired (§10/§17
              sunset); trips are now built in the Workstation and shipped to Store Listings. */}
          <TabsContent value="templates" className="mt-6">
            <PointerCard
              title="Templates"
              description="Store trips now live in the Workstation"
              body="Store trips are built in the Workstation and managed in Store Listings — the old itinerary-template seller surface is retired."
              links={[
                { label: "Go to Workstation", href: "/expert/workspace" },
                { label: "Go to Store Listings", href: "/expert/ready-made" },
              ]}
            />
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Language & Timezone</CardTitle>
                <CardDescription>Set your preferred language and timezone</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-sm font-semibold">Language</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="mt-2" data-testid="select-language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ja">日本語 (Japanese)</SelectItem>
                      <SelectItem value="es">Español (Spanish)</SelectItem>
                      <SelectItem value="fr">Français (French)</SelectItem>
                      <SelectItem value="de">Deutsch (German)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-semibold">Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="mt-2" data-testid="select-timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC-8">Pacific Time (UTC-8)</SelectItem>
                      <SelectItem value="UTC-5">Eastern Time (UTC-5)</SelectItem>
                      <SelectItem value="UTC">GMT (UTC+0)</SelectItem>
                      <SelectItem value="UTC+1">Central European Time (UTC+1)</SelectItem>
                      <SelectItem value="UTC+9">Japan Standard Time (UTC+9)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <UnavailableNote>
                  Saving isn't available yet — language/timezone preferences have no backend to
                  persist to. Selections here are visual only until this is wired up.
                </UnavailableNote>
                <Button
                  className="w-full bg-primary hover:bg-primary/90"
                  data-testid="button-save-preferences"
                  disabled
                  title="Not available yet — no persistence store is wired for these preferences."
                >
                  <Save className="w-4 h-4 mr-2" /> Save Preferences
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab — honest-gated: no self-service change-password endpoint exists on the
              server (checked server/routes* + server/replit_integrations/auth/emailAuth.ts; only
              a token-based POST /api/auth/forgot-password + /api/auth/reset-password flow exists,
              which requires an email round-trip, not a logged-in current-password form). Rather
              than wire this form to a nonexistent endpoint, the inputs are disabled with a visible
              note — never a Save that silently does nothing (§13). 2FA has no backend either
              (no totp/2fa table or column anywhere in the schema), so it gets the same treatment. */}
          <TabsContent value="security" className="mt-6">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Change Password</CardTitle>
                  <CardDescription>Update your password to keep your account secure</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <UnavailableNote>
                    Password change isn't available here yet — the server has no self-service
                    change-password endpoint. Use "Forgot password" from the sign-in page to reset
                    your password by email in the meantime.
                  </UnavailableNote>
                  <div>
                    <Label className="text-sm font-semibold">Current Password</Label>
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="mt-2"
                      disabled
                      data-testid="input-current-password"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-semibold">New Password</Label>
                    <div className="relative mt-2">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled
                        data-testid="input-new-password"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                        data-testid="button-toggle-password-visibility"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-primary hover:bg-primary/90"
                    data-testid="button-change-password"
                    disabled
                    title="Not available yet — no self-service change-password endpoint exists."
                  >
                    <Save className="w-4 h-4 mr-2" /> Change Password
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Two-Factor Authentication</CardTitle>
                  <CardDescription>Add an extra layer of security to your account</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <UnavailableNote>
                    2FA isn't available yet — there's no two-factor mechanism on the server to
                    enable.
                  </UnavailableNote>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-console-darkest">
                        {twoFaEnabled ? "2FA Enabled" : "2FA Disabled"}
                      </p>
                      <p className="text-sm text-console-mid">
                        {twoFaEnabled
                          ? "Your account is protected with two-factor authentication"
                          : "Enable 2FA to secure your account"}
                      </p>
                    </div>
                    <Switch
                      checked={twoFaEnabled}
                      onCheckedChange={setTwoFaEnabled}
                      disabled
                      title="Not available yet — no 2FA mechanism exists on the server."
                      data-testid="toggle-2fa"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Leaderboard Tab */}
          <TabsContent value="leaderboard" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Leaderboard Visibility</CardTitle>
                <CardDescription>Control whether you appear on the expert leaderboard</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex-1">
                    <p className="font-semibold text-console-darkest">Show on Leaderboard</p>
                    <p className="text-sm text-console-mid mt-1">
                      When enabled, your profile and stats will be visible on the expert leaderboard
                    </p>
                  </div>
                  <Switch
                    checked={enableLeaderboard}
                    onCheckedChange={setEnableLeaderboard}
                    data-testid="toggle-leaderboard"
                  />
                </div>

                {enableLeaderboard && (
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-sm text-green-700">
                      ✓ Your profile is visible on the expert leaderboard. Your ranking updates daily based on client ratings and booking activity.
                    </p>
                  </div>
                )}

                <Button className="w-full bg-primary hover:bg-primary/90" data-testid="button-save-leaderboard">
                  <Save className="w-4 h-4 mr-2" /> Save Preference
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ExpertLayout>
  );
}
