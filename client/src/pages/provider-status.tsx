import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Clock,
  Building2,
  MessageSquare,
  AlertCircle,
  ArrowRight,
  CheckCheck,
  ShieldCheck,
  ExternalLink,
  Loader2,
  RefreshCw,
  Globe,
  XCircle,
} from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

interface ApplicationStep {
  id: number;
  title: string;
  description: string;
  status: "completed" | "in_progress" | "pending" | "failed";
  completedAt?: string;
  note?: string;
}

interface ApplicationStatus {
  steps: ApplicationStep[];
  overallStatus: string;
  rejectionMessage?: string | null;
  identityVerificationStatus: string;
  identityVerifiedAt?: string;
  businessVerificationStatus: string;
  businessCountry?: string;
  form: {
    id: string;
    status: string;
    businessName?: string;
    country?: string;
    createdAt: string;
  } | null;
}

// COUNTRY_REGISTRATION_LABELS, COUNTRY_REQUIRED_DOCS, and COUNTRY_LIST removed Aug 2026.
// Business verification now flows through Stripe Connect KYB (see account.updated webhook).
// The Persona KYB form that used these constants has been retired.

function StepDot({ status, id }: { status: string; id: number }) {
  const base = "absolute left-2 top-1 w-5 h-5 rounded-full flex items-center justify-center";
  if (status === "completed") return <div className={`${base} bg-green-500`}><CheckCircle2 className="w-3 h-3 text-white" /></div>;
  if (status === "in_progress") return <div className={`${base} bg-primary`}><Clock className="w-3 h-3 text-white" /></div>;
  if (status === "failed") return <div className={`${base} bg-red-500`}><AlertCircle className="w-3 h-3 text-white" /></div>;
  return <div className={`${base} bg-gray-300 dark:bg-gray-600`}><span className="text-xs text-white font-medium">{id}</span></div>;
}

function StepCard({ step }: { step: ApplicationStep }) {
  const bg =
    step.status === "completed" ? "bg-green-50 dark:bg-green-900/20" :
    step.status === "in_progress" ? "bg-[#FFF5F7] dark:bg-primary/10 border border-primary" :
    step.status === "failed" ? "bg-red-50 dark:bg-red-900/20 border border-red-300" :
    "bg-gray-50 dark:bg-gray-800";

  return (
    <div className={`p-4 rounded-lg ${bg}`}>
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-foreground dark:text-white">{step.title}</h4>
          <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
        </div>
        <div>
          {step.status === "completed" && <Badge className="bg-green-100 text-green-700"><CheckCheck className="w-3 h-3 mr-1" />Done</Badge>}
          {step.status === "in_progress" && <Badge className="bg-amber-100 text-amber-700"><Clock className="w-3 h-3 mr-1" />In Progress</Badge>}
          {step.status === "failed" && <Badge className="bg-red-100 text-red-700"><AlertCircle className="w-3 h-3 mr-1" />Needs Attention</Badge>}
          {step.status === "pending" && <Badge variant="secondary">Pending</Badge>}
        </div>
      </div>
      {step.completedAt && <p className="text-xs text-muted-foreground mt-2">Completed on {step.completedAt}</p>}
      {step.note && <p className="text-sm text-amber-600 mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{step.note}</p>}
    </div>
  );
}

export default function ProviderStatusPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: appStatus, isLoading } = useQuery<ApplicationStatus>({
    queryKey: ["/api/provider/application-status"],
    refetchInterval: 10000,
  });

  const startIdVerification = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/identity/create-session", { formType: "provider" });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/application-status"] });
      if (data.verificationUrl) window.open(data.verificationUrl, "_blank");
    },
    onError: (err: any) => {
      toast({ title: "Verification unavailable", description: err.message || "Please try again later.", variant: "destructive" });
    },
  });

  // Business verification is now derived from Stripe Connect (account.updated webhook).
  // Providers complete Stripe Express onboarding; Stripe performs KYB there.
  const startConnectOnboarding = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/connect/onboard", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.open(data.url, "_blank");
      } else {
        toast({ title: "Onboarding unavailable", description: "Please try again later.", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Connect onboarding failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verification") === "complete") {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/application-status"] });
      toast({ title: "Verification submitted", description: "We're processing your identity verification." });
      window.history.replaceState({}, "", "/provider-status");
    }
  }, []);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const steps = appStatus?.steps ?? [];
  const identityStatus = appStatus?.identityVerificationStatus ?? "pending";
  const bizStatus = appStatus?.businessVerificationStatus ?? "pending";
  const completedSteps = steps.filter(s => s.status === "completed").length;
  const progressPercentage = steps.length > 0 ? (completedSteps / steps.length) * 100 : 0;
  const currentStep = steps.find(s => s.status === "in_progress") || steps.find(s => s.status === "pending" || s.status === "failed");
  const overallStatus = appStatus?.overallStatus ?? "pending";


  const overallBadge = overallStatus === "approved"
    ? <Badge className="bg-green-100 text-green-700 px-4 py-2"><CheckCircle2 className="w-4 h-4 mr-2" />Approved</Badge>
    : overallStatus === "rejected"
    ? <Badge className="bg-red-100 text-red-700 px-4 py-2"><AlertCircle className="w-4 h-4 mr-2" />Not Approved</Badge>
    : <Badge className="bg-amber-100 text-amber-700 px-4 py-2"><Clock className="w-4 h-4 mr-2" />Under Review</Badge>;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground dark:text-white" data-testid="text-page-title">
              Service Provider Application
            </h1>
            <p className="text-muted-foreground mt-1">Track your business verification progress</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/provider/application-status"] })} data-testid="button-refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
            {overallBadge}
          </div>
        </div>

        {overallStatus === "rejected" && (
          <Card className="border-2 border-red-300 bg-red-50 dark:bg-red-900/20" data-testid="card-rejection-feedback">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-500 rounded-full flex-shrink-0">
                  <XCircle className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-red-800 dark:text-red-300">Application Not Approved</h3>
                  <p className="text-sm text-red-700 dark:text-red-400 mt-1 leading-relaxed" data-testid="text-rejection-message">
                    {appStatus?.rejectionMessage
                      ? appStatus.rejectionMessage
                      : "Your application was not approved at this time. Please review the requirements and reapply when you are ready."}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    Address the feedback above, then update your application and resubmit. If you need more clarity, our support team is happy to help.
                  </p>
                  <div className="flex flex-wrap gap-3 mt-4">
                    <Link href="/become-provider">
                      <Button
                        size="sm"
                        className="bg-red-600 hover:bg-red-700 text-white"
                        data-testid="button-resubmit-application"
                      >
                        <ArrowRight className="w-4 h-4 mr-2" />
                        Update &amp; Resubmit
                      </Button>
                    </Link>
                    <a href="mailto:support@traveloure.com" data-testid="link-contact-support">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
                      >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Contact Support
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-gradient-to-r from-[#FF385C] to-[#E23350] text-white">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">Verification Progress</h3>
                <p className="text-white/80 mt-1">{completedSteps} of {steps.length} steps completed</p>
              </div>
              <p className="text-4xl font-bold" data-testid="text-progress-percentage">{Math.round(progressPercentage)}%</p>
            </div>
            <Progress value={progressPercentage} className="mt-4 h-3 bg-white/20" />
          </CardContent>
        </Card>

        {/* Owner Identity Verification */}
        {identityStatus !== "verified" ? (
          <Card className="border-2 border-blue-300 bg-blue-50 dark:bg-blue-900/20">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-600 rounded-full flex-shrink-0">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground dark:text-white">Business Owner ID Verification</h3>
                  {identityStatus === "pending" && <p className="text-muted-foreground mt-1">Verify your government-issued ID and take a quick selfie. Supports passports, national IDs, and driver's licenses from 100+ countries.</p>}
                  {identityStatus === "processing" && <p className="text-amber-600 mt-1 flex items-center gap-2"><Clock className="w-4 h-4" />Processing — usually takes a few minutes.</p>}
                  {identityStatus === "failed" && <p className="text-red-600 mt-1 flex items-center gap-2"><AlertCircle className="w-4 h-4" />Verification was unsuccessful. Please try again.</p>}
                </div>
                <div className="flex-shrink-0">
                  {identityStatus === "processing" ? (
                    <Badge className="bg-amber-100 text-amber-700"><Clock className="w-3 h-3 mr-1" />Processing</Badge>
                  ) : (
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => startIdVerification.mutate()}
                      disabled={startIdVerification.isPending}
                      data-testid="button-verify-identity"
                    >
                      {startIdVerification.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                      {identityStatus === "failed" ? "Retry" : "Verify Owner ID →"}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-2 border-green-300 bg-green-50 dark:bg-green-900/20">
            <CardContent className="p-4 flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-800 dark:text-green-300">Owner Identity Verified</p>
                {appStatus?.identityVerifiedAt && <p className="text-sm text-green-600">Verified on {new Date(appStatus.identityVerifiedAt).toLocaleDateString()}</p>}
              </div>
              <Badge className="ml-auto bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>
            </CardContent>
          </Card>
        )}

        {/* Business Verification — Stripe Connect KYB (Persona KYB retired Aug 2026).
            businessVerificationStatus is now derived from the provider's Stripe Connect account
            via the account.updated webhook. Stripe performs its own KYB during Express onboarding. */}
        {bizStatus !== "verified" ? (
          <Card className="border-2 border-purple-300 bg-purple-50 dark:bg-purple-900/20">
            <CardContent className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-3 bg-purple-600 rounded-full flex-shrink-0">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground dark:text-white">Business Verification</h3>
                  {bizStatus === "pending" && (
                    <p className="text-muted-foreground mt-1">
                      Complete your Stripe Connect onboarding to verify your business. Stripe collects and verifies your business details directly during the secure onboarding flow.
                    </p>
                  )}
                  {bizStatus === "submitted" && (
                    <p className="text-amber-600 mt-1 flex items-center gap-2">
                      <Clock className="w-4 h-4" />Stripe is reviewing your business details — this usually completes within a few minutes.
                    </p>
                  )}
                  {bizStatus === "failed" && (
                    <p className="text-red-600 mt-1 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />Business verification was unsuccessful. Retry Connect onboarding or contact support.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-3 mt-2">
                <Button
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => startConnectOnboarding.mutate()}
                  disabled={startConnectOnboarding.isPending || bizStatus === "submitted"}
                  data-testid="button-start-connect-onboarding"
                >
                  {startConnectOnboarding.isPending
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <ExternalLink className="w-4 h-4 mr-2" />}
                  {bizStatus === "failed" ? "Retry Connect Onboarding" : "Complete Connect Onboarding →"}
                </Button>
                {bizStatus === "failed" && (
                  <a href="mailto:support@traveloure.com">
                    <Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400">
                      <MessageSquare className="w-4 h-4 mr-2" />Contact Support
                    </Button>
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-2 border-green-300 bg-green-50 dark:bg-green-900/20">
            <CardContent className="p-4 flex items-center gap-3">
              <Globe className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-800 dark:text-green-300">Business Verified</p>
                <p className="text-sm text-green-600">Verified via Stripe Connect</p>
              </div>
              <Badge className="ml-auto bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>
            </CardContent>
          </Card>
        )}

        {currentStep && (
          <Card className="border-2 border-primary bg-[#FFF5F7] dark:bg-primary/10">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary rounded-full">
                  <Clock className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground dark:text-white">Current Step: {currentStep.title}</h3>
                  <p className="text-muted-foreground mt-1">{currentStep.description}</p>
                  {currentStep.note && <p className="text-amber-600 mt-2 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{currentStep.note}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader><CardTitle className="text-lg">Verification Timeline</CardTitle></CardHeader>
              <CardContent>
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
                  <div className="space-y-6">
                    {steps.map(step => (
                      <div key={step.id} className="relative pl-10" data-testid={`step-${step.id}`}>
                        <StepDot status={step.status} id={step.id} />
                        <StepCard step={step} />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5" />Business Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {appStatus?.form?.businessName && (
                  <div>
                    <p className="text-lg font-semibold text-foreground dark:text-white" data-testid="text-business-name">{appStatus.form.businessName}</p>
                    {appStatus.form.country && <p className="text-sm text-muted-foreground mt-1">{appStatus.form.country}</p>}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Applied {appStatus?.form?.createdAt ? new Date(appStatus.form.createdAt).toLocaleDateString() : "—"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">Need Help?</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Questions about your application? We're here to assist.</p>
                <Link href="/contact">
                  <Button variant="outline" className="w-full" data-testid="button-contact-support">
                    <MessageSquare className="w-4 h-4 mr-2" />Contact Support
                  </Button>
                </Link>
                <Link href="/faq">
                  <Button variant="ghost" className="w-full" data-testid="link-faq">
                    View FAQ<ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
