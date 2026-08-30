import { useTranslation } from "react-i18next";
import { LanguagePreferenceCard } from "@/components/settings/language-preference-card";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { HandleClaimCard } from "@/components/backoffice/handle-claim-card";
import { StripeConnectCard } from "@/components/stripe-connect-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
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
  Loader2,
  FileText,
  Plane,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect, lazy, Suspense } from "react";
import { useSearch } from "wouter";

// Console IA C9 (§17 17→9 collapse): Profile retired as a standalone page and hosted as
// this page's FIRST tab (the expert C8 pattern — a mount, not an extraction; profile.tsx
// stays intact as a component, lazy-loaded here so its bundle only loads when the tab
// opens). Settings keeps DEFAULTING to its own content (the actionable verification +
// preferences surface); Profile is first in ORDER only. Deep-link: ?tab=profile
// (/provider/profile redirects there).
const ProviderProfile = lazy(() => import("@/pages/provider/profile"));

const SETTINGS_TABS = ["profile", "settings"] as const;
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Ledger 90 (FP-5, S1): only the fields this page still RENDERS are typed here. The other six
// columns on `provider_settings` are untouched on disk and still accepted by the PATCH allow-list
// — they simply have no control any more, because nothing on the platform reads them. See the
// removal block below the Verification section for the list and the evidence.
interface ProviderSettingsData {
  minimumPayoutAmount: string;
}

function VerificationPayoutsSection() {
  const { toast } = useToast();

  const { data: idStatus, isLoading: idLoading } = useQuery<any>({
    queryKey: ["/api/provider/application-status"],
  });
  const { data: bgVerification, isLoading: bgLoading } = useQuery<{ providerVerificationStatus: string; backgroundCheckConfirmed: boolean }>({
    queryKey: ["/api/provider/verification-status"],
  });

  const requestReviewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/provider/request-verification-review");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/verification-status"] });
      toast({
        title: data?.alreadyRequested ? "Review already requested" : "Review requested",
        description: "Our team will review your account for background/insurance-gated categories. You'll be notified when it's complete.",
      });
    },
    onError: () => toast({ title: "Couldn't submit request", description: "Please try again later.", variant: "destructive" }),
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

  const idVerifStatus = idStatus?.identityVerificationStatus ?? "pending";
  const bizVerifStatus = idStatus?.businessVerificationStatus ?? "pending";

  const statusBadge = (s: string) => {
    if (s === "verified") return <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>;
    if (s === "processing") return <Badge className="bg-amber-100 text-amber-700"><Clock className="w-3 h-3 mr-1" />Processing</Badge>;
    if (s === "failed") return <Badge className="bg-red-100 text-red-700"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    return <Badge variant="secondary">Not started</Badge>;
  };

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

      {/* Background / Category Verification (platform gate) */}
      {(() => {
        const bgStatus = bgVerification?.providerVerificationStatus ?? "pending";
        const bgBadge =
          bgStatus === "verified"
            ? <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>
            : bgStatus === "requested"
            ? <Badge className="bg-amber-100 text-amber-700"><Clock className="w-3 h-3 mr-1" />Under Review</Badge>
            : <Badge variant="secondary">Not requested</Badge>;
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-600" />
                  Background Verification
                </div>
                {bgLoading ? <Loader2 className="w-4 h-4 animate-spin text-console-mid" /> : bgBadge}
              </CardTitle>
              <CardDescription>Some service categories (background-check or higher-insurance) can't be published until our team reviews your account. Request a review to unlock them.</CardDescription>
            </CardHeader>
            <CardContent>
              {bgStatus === "verified" ? (
                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-green-800">Account verified</p>
                    <p className="text-sm text-green-600">You can publish listings in background/insurance-gated categories.</p>
                  </div>
                </div>
              ) : bgStatus === "requested" ? (
                <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <p className="text-sm text-amber-700">Your review request is in the queue — our team typically reviews within 3-5 business days.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-console-dark">This is separate from identity verification. Request it once you plan to offer a gated category.</p>
                  <Button onClick={() => requestReviewMutation.mutate()} disabled={requestReviewMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-request-verification-review">
                    {requestReviewMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                    Request Review
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Stripe Connect — the shared card (also used by the Money page). This section
          previously hand-rolled the same status query + onboard/dashboard mutations; deduped
          in the Aug 10 2026 provider-console fix wave so the two surfaces can't drift. */}
      <StripeConnectCard />
    </div>
  );
}

// Vacation mode (mockup §06b, provider back-office wave, decision-maker ratified Aug 9 2026).
// Business-level flag ONLY — GET/PATCH /api/me/vacation touches users.vacationUntil/
// vacationMessage; nothing here ever reads or writes provider_services. Server derives `active`
// (vacationUntil non-null AND in the future) so the chip below reads the same truth the
// storefront/advisor/checkout enforcement points use, never re-derived client-side.
interface VacationStatus {
  vacationUntil: string | null;
  vacationMessage: string | null;
  active: boolean;
}

function VacationModeSection() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<VacationStatus>({
    queryKey: ["/api/me/vacation"],
  });

  const [enabled, setEnabled] = useState(false);
  const [returnDate, setReturnDate] = useState(""); // yyyy-mm-dd, <input type="date"> shape
  const [message, setMessage] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.active);
    setReturnDate(data.vacationUntil ? data.vacationUntil.slice(0, 10) : "");
    setMessage(data.vacationMessage ?? "");
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (body: { vacationUntil: string | null; vacationMessage?: string | null }) => {
      const res = await apiRequest("PATCH", "/api/me/vacation", body);
      return res.json() as Promise<VacationStatus>;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["/api/me/vacation"], result);
      toast({
        title: result.active ? "Vacation mode on" : "Vacation mode off",
        description: result.active
          ? `New bookings are paused until ${new Date(result.vacationUntil!).toLocaleDateString()}.`
          : "You're accepting new bookings again.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't save vacation settings",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!enabled) {
      setDateError(null);
      saveMutation.mutate({ vacationUntil: null });
      return;
    }
    if (!returnDate) {
      setDateError("Choose a return date to turn vacation mode on.");
      return;
    }
    // End-of-day local time on the chosen date, so "today" picks that are still hours away
    // aren't rejected by the server's future-only check.
    const until = new Date(`${returnDate}T23:59:59`);
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
      setDateError("Return date must be in the future.");
      return;
    }
    setDateError(null);
    saveMutation.mutate({
      vacationUntil: until.toISOString(),
      vacationMessage: message.trim() ? message.trim() : null,
    });
  };

  const chipLabel = data?.active && data.vacationUntil
    ? `ON until ${new Date(data.vacationUntil).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : "OFF";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plane className="w-5 h-5 text-console-mid" />
            Vacation Mode
          </div>
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-console-mid" />
          ) : (
            <Badge
              variant={data?.active ? "default" : "secondary"}
              data-testid="badge-vacation-status"
            >
              {chipLabel}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Pause new bookings while you're away, without touching your listings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base">Away</Label>
            <p className="text-sm text-console-mid">
              New bookings will be blocked while you're away. Your listings stay visible but
              can't be booked. Confirmed bookings are not affected.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => {
              setEnabled(checked);
              setDateError(null);
            }}
            data-testid="switch-vacation-mode"
          />
        </div>

        {enabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="vacation-return-date">Return date</Label>
              <Input
                id="vacation-return-date"
                type="date"
                value={returnDate}
                onChange={(e) => {
                  setReturnDate(e.target.value);
                  setDateError(null);
                }}
                data-testid="input-vacation-return-date"
              />
              {dateError && <p className="text-sm text-red-600">{dateError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="vacation-message">Message to travelers (optional)</Label>
              <Textarea
                id="vacation-message"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 200))}
                placeholder="e.g. Back from a family trip on the 24th!"
                maxLength={200}
                rows={2}
                data-testid="input-vacation-message"
              />
              <p className="text-xs text-console-mid text-right">{message.length}/200</p>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            data-testid="button-save-vacation"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProviderSettings() {
  const { t } = useTranslation(["settings", "common"]);
  const { toast } = useToast();

  // C9: ?tab= deep-linking (the expert settings C8 convention). Unknown/absent ?tab= falls
  // back to the settings content — the kept default.
  const search = useSearch();
  const requestedTab = new URLSearchParams(search).get("tab");
  const tabParam = (SETTINGS_TABS as readonly string[]).includes(requestedTab ?? "")
    ? (requestedTab as (typeof SETTINGS_TABS)[number])
    : "settings";

  const { data: serverSettings } = useQuery<ProviderSettingsData>({
    queryKey: ["/api/provider/settings"],
  });

  // Ledger 90 (FP-5, S2): the ONE surviving preference on this card. The GET supplies the
  // server's own default (the platform payout floor) when no row exists, so the field never shows
  // a number the server would not honour.
  const [minPayout, setMinPayout] = useState("");

  useEffect(() => {
    if (serverSettings) {
      setMinPayout(String(serverSettings.minimumPayoutAmount ?? ""));
    }
  }, [serverSettings]);

  const saveSettingsMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/provider/settings", {
        minimumPayoutAmount: minPayout,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/settings"] });
      // The Money page's payout gate reads the effective threshold off the earnings summary —
      // invalidate it so the button and its copy reflect a change made here immediately (S2).
      queryClient.invalidateQueries({ queryKey: ["/api/provider/earnings/summary"] });
      toast({ title: t("settings:save.successTitle"), description: t("settings:save.successBody") });
    },
    onError: () => {
      toast({
        title: t("settings:save.errorTitle"),
        description: t("settings:save.errorBody"),
        variant: "destructive",
      });
    },
  });

  return (
    <ProviderLayout title="Settings">
      {/* FP-4: normalized onto ProviderLayout's shared content container. The old
          `max-w-4xl` carried no `mx-auto`, so this form-heavy page hugged the left edge
          with a lopsided gutter on any wide screen; the shared container centers it. */}
      <div className="p-6 space-y-6">
        <HandleClaimCard target="provider" />

        <Tabs defaultValue={tabParam} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            {/* C9: Profile is the FIRST tab in order; the settings content stays the default. */}
            <TabsTrigger value="profile" className="flex items-center gap-2" data-testid="tab-profile">
              <Building className="w-4 h-4" /> {t("settings:tabs.profile")}
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2" data-testid="tab-settings">
              <User className="w-4 h-4" /> {t("settings:tabs.settings")}
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab — C9: the profile page rendered embedded (no second ProviderLayout;
              the profile.tsx seam drops its own p-6 since this container already provides
              it). Lazy + Suspense mirrors the expert C8 mount. */}
          <TabsContent value="profile" className="mt-6">
            <Suspense
              fallback={
                <div className="space-y-4">
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="h-64 w-full" />
                </div>
              }
            >
              <ProviderProfile embedded />
            </Suspense>
          </TabsContent>

          <TabsContent value="settings" className="mt-6 space-y-6">

        {/* Ruling 60 Phase A — the Settings → Preferences card (mockup §06 frame A), selector
            entry point (a). Writes users.preferences.settings.language through the existing
            allow-listed PATCH /api/me/preferences. */}
        <LanguagePreferenceCard />

        {/* Verification & Payouts */}
        <div>
          <h2 className="text-lg font-semibold text-console-darkest mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            {t("settings:verification.title")}
          </h2>
          <VerificationPayoutsSection />
        </div>

        {/* Account Settings — REMOVED (Punchlist Phase 3, §13 honesty): the "Change Password"
            and "Enable Two-Factor Auth" buttons had nothing behind them. Checked
            server/routes.ts, every server/routes/*.ts, and
            server/replit_integrations/auth/emailAuth.ts — there is no self-service
            change-password endpoint for a logged-in user (only the token-based
            POST /api/auth/forgot-password + POST /api/auth/reset-password email-round-trip
            flow, already reachable from the sign-in page's "Forgot password" link) and no 2FA
            mechanism anywhere in the schema or server. Rather than leave two buttons that do
            nothing, the whole card is removed; re-add it alongside a real change-password
            endpoint and/or a real 2FA rail. (client/src/pages/expert/settings.tsx keeps an
            equivalent card but disables its inputs with the same finding as an inline note —
            an equally honest treatment; this page opts for removal per the same audit's
            explicit call.) */}

        {/* ═══ Ledger 90 (FP-5, S1) — ELEVEN CONTROLS REMOVED, not disabled ═══════════════════
            Evidence: docs/testing/CONSOLE_TABS_EXERCISE.md finding S1 (as-of `f747d0a`). The
            `provider_settings` table is a CLOSED LOOP: it is touched only by
            `getProviderSettings`/`upsertProviderSettings` in `server/storage.ts`, called only by
            the GET/PATCH in `server/routes/provider.routes.ts`, called only by this file. Nothing
            anywhere on the platform reads the values back. Two of them were confirmed EMPIRICALLY
            during the exercise, not just by grep: with `autoResponse: true` saved, a real traveler
            inquiry produced NO auto-response (`user_and_expert_chats` held exactly one row, the
            traveler's), and with `notificationsJson.messages: true` saved, no notification of any
            kind was produced.

            REMOVED (each persisted perfectly and was read by nothing):
              Business Preferences —
                1. Instant Booking          — worse than unread: a real consumer exists at
                                              routes.ts, but it reads a DIFFERENT column
                                              (`service_provider_forms.instant_booking`), so this
                                              switch wrote the twin nobody looks at.
                2. Auto-Response            — empirically proven inert (above).
                3. Minimum Lead Time (days) — no consumer.
                4. Target Response Time (h) — no consumer.
              Notification Preferences (the whole `notificationsJson` card) —
                5. New bookings   6. Booking updates   7. Messages
                8. Reviews        9. Payouts          10. Marketing
                                              — all six inert; #7 empirically proven (above).
              Payment Settings —
               11. Payout Frequency         — no consumer; payouts are admin-processed on request,
                                              not on a schedule, so the control also describes a
                                              mechanism that does not exist.

            KEPT AND WIRED: "Minimum Payout Amount" (below) — it was the one control in this set
            with a real consumer waiting, and FP-5's S2 connected it: the payout-request check now
            enforces max(platform floor, this value). See server/config/payout.config.ts.

            KEPT, UNAFFECTED: Vacation Mode (writes `/api/me/vacation`, genuinely enforced
            server-side) and the Language preference card.

            THE COLUMNS AND THE STORAGE ARE UNTOUCHED — no migration, no schema change, and the
            PATCH allow-list still accepts all seven fields. This lane removes the LIE (a switch
            that silently does nothing), not the data; the redesign decides which of these features
            get built, and a control comes back with its consumer, never before it. This is the
            same call this page already made when it deleted its Change-Password/2FA card because
            "the buttons had nothing behind them" — twelve controls with nothing behind them had
            survived that audit. */}

        {/* Vacation Mode — mockup §06b */}
        <VacationModeSection />

        {/* Payment Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-console-mid" />
              {t("settings:payment.title")}
            </CardTitle>
            <CardDescription>{t("settings:payment.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("settings:payment.minPayout")}</Label>
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
              {/* Ledger 90 (FP-5, S2): state the rule where the number is set, so the Money page's
                  disabled payout button is never a mystery. No literal here — the platform floor
                  is a server constant and is quoted by the server, on the surface that enforces it. */}
              <p className="text-sm text-console-mid">
                Payouts are held until your available balance reaches this amount. The platform has
                its own floor below which a payout can't be sent; whichever is higher applies, and
                your Money page shows the figure in force.
              </p>
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
            {saveSettingsMutation.isPending ? t("settings:save.saving") : t("settings:save.all")}
          </Button>
        </div>

          </TabsContent>
        </Tabs>
      </div>
    </ProviderLayout>
  );
}
