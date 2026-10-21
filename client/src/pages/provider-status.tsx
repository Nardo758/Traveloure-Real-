import { DashboardLayout } from "@/components/dashboard-layout";
import {
  ApplicationProgressCard,
  ApplicationStatusHeader,
  StatusActionCard,
  statusActionButtonClass,
} from "@/components/application-status-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Globe,
  XCircle,
} from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { COMPANY_CONTACT_EMAIL } from "@/lib/company-facts";
import { applicationStatusQuery } from "@/lib/application-status-query";
import type { ApplicationPhase } from "@shared/application-status";

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
  phase?: ApplicationPhase;
  phaseTitle?: string;
  phaseDetail?: string;
  currentStepId?: number | null;
  overallStatus: string;
  rejectionMessage?: string | null;
  /** #924: the most recent EARLIER rejection's feedback, kept visible after a resubmission. */
  previousRejection?: { message: string; submittedAt: string | null } | null;
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
    step.status === "in_progress" ? "bg-muted border border-border" :
    step.status === "failed" ? "bg-red-50 dark:bg-red-900/20 border border-red-300" :
    "bg-gray-50 dark:bg-gray-800";

  return (
    <div className={`p-4 rounded-lg ${bg}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between min-w-0">
        <div className="min-w-0">
          <h4 className="font-semibold text-foreground dark:text-white break-words">{step.title}</h4>
          <p className="text-sm text-muted-foreground mt-1 break-words">{step.description}</p>
        </div>
        <div className="shrink-0 self-start">
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
  const { data: appStatus, isLoading, isFetching } = useQuery<ApplicationStatus>({
    queryKey: ["/api/provider/application-status"],
    ...applicationStatusQuery,
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

  if (isLoading || (isFetching && !appStatus?.phase)) {
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
  const currentStep = appStatus?.currentStepId != null ? steps.find(s => s.id === appStatus.currentStepId) : undefined;
  const overallStatus = appStatus?.overallStatus ?? "pending";
  const phase = appStatus?.phase;
  const badgeClass = phase === "approved"
    ? "bg-green-100 text-green-700"
    : phase === "rejected"
    ? "bg-red-100 text-red-700"
    : phase === "not_started"
    ? "bg-gray-100 text-gray-700"
    : "bg-amber-100 text-amber-700";
  const PhaseIcon = phase === "approved" ? CheckCircle2 : phase === "rejected" ? AlertCircle : Clock;
  const overallBadge = appStatus?.phaseTitle
    ? <Badge className={`${badgeClass} px-4 py-2`} data-testid="badge-application-phase"><PhaseIcon className="w-4 h-4 mr-2" />{appStatus.phaseTitle}</Badge>
    : null;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 min-w-0 max-w-full">
        <ApplicationStatusHeader
          title="Service Provider Application"
          phaseDetail={appStatus?.phaseDetail}
          badge={overallBadge}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ["/api/provider/application-status"] })}
        />

        {overallStatus !== "rejected" && appStatus?.previousRejection?.message && (
          <Card className="border border-amber-300 bg-amber-50 dark:bg-amber-900/20" data-testid="card-previous-rejection">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Feedback on your earlier application</p>
              <p className="text-sm text-amber-800 dark:text-amber-300 mt-1 leading-relaxed whitespace-pre-line" data-testid="text-previous-rejection">
                {appStatus.previousRejection.message}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                Kept here so you can check your resubmission addresses it.
              </p>
            </CardContent>
          </Card>
        )}

        {overallStatus === "rejected" && (
          <StatusActionCard
            testId="card-rejection-feedback"
            toneClassName="border-2 border-red-300 bg-red-50 dark:bg-red-900/20"
            title="Application Not Approved"
            titleClassName="text-red-800 dark:text-red-300"
            icon={<div className="p-3 bg-red-500 rounded-full"><XCircle className="w-6 h-6 text-white" /></div>}
            actions={
              <>
                <Link href="/become-provider" className="block w-full sm:w-auto">
                  <Button
                    className={statusActionButtonClass("bg-red-600 hover:bg-red-700 text-white")}
                    data-testid="button-resubmit-application"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Update &amp; Resubmit
                  </Button>
                </Link>
                <a href={`mailto:${COMPANY_CONTACT_EMAIL}`} className="block w-full sm:w-auto" data-testid="link-contact-support">
                  <Button
                    variant="outline"
                    className={statusActionButtonClass("border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30")}
                  >
                    <MessageSquare className="w-4 h-4" />
                    Contact Support
                  </Button>
                </a>
              </>
            }
          >
            <p className="text-red-700 dark:text-red-400 leading-relaxed" data-testid="text-rejection-message">
              {appStatus?.rejectionMessage
                ? appStatus.rejectionMessage
                : "Your application was not approved at this time. Please review the requirements and reapply when you are ready."}
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              Address the feedback above, then update your application and resubmit. If you need more clarity, our support team is happy to help.
            </p>
          </StatusActionCard>
        )}

        <ApplicationProgressCard
          title="Verification Progress"
          completed={completedSteps}
          total={steps.length}
          urgent={phase === "rejected" || identityStatus === "failed" || bizStatus === "failed" || steps.some((step) => step.status === "failed")}
        />

        {phase === "approved" && identityStatus !== "verified" ? (
          <StatusActionCard
            testId="card-identity-before-live"
            toneClassName="border-2 border-blue-300 bg-blue-50 dark:bg-blue-900/20"
            title="Verify your identity before a listing can go live"
            icon={<div className="p-3 bg-blue-600 rounded-full"><ShieldCheck className="w-6 h-6 text-white" /></div>}
            actions={
              <Button
                className={statusActionButtonClass("bg-blue-600 hover:bg-blue-700 text-white")}
                onClick={() => startIdVerification.mutate()}
                disabled={startIdVerification.isPending}
                data-testid="button-verify-identity"
              >
                {startIdVerification.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                Verify Owner ID →
              </Button>
            }
          >
            <p className="text-muted-foreground">Your application is approved. A listing stays private until this check is finished.</p>
          </StatusActionCard>
        ) : identityStatus !== "verified" ? (
          <StatusActionCard
            toneClassName={
              identityStatus === "failed"
                ? "border-2 border-red-300 bg-red-50 dark:bg-red-900/20"
                : "border-2 border-blue-300 bg-blue-50 dark:bg-blue-900/20"
            }
            title="Business Owner ID Verification"
            icon={
              <div className={`p-3 rounded-full ${identityStatus === "failed" ? "bg-red-600" : "bg-blue-600"}`}>
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
            }
            actions={
              identityStatus === "processing" ? (
                <Badge className="bg-amber-100 text-amber-700 self-start"><Clock className="w-3 h-3 mr-1" />Processing</Badge>
              ) : (
                <Button
                  className={statusActionButtonClass(
                    identityStatus === "failed"
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-blue-600 hover:bg-blue-700 text-white",
                  )}
                  onClick={() => startIdVerification.mutate()}
                  disabled={startIdVerification.isPending}
                  data-testid="button-verify-identity"
                >
                  {startIdVerification.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                  {identityStatus === "failed" ? "Retry" : "Verify Owner ID →"}
                </Button>
              )
            }
          >
            {identityStatus === "pending" && <p className="text-muted-foreground">Verify your government-issued ID and take a quick selfie. Supports passports, national IDs, and driver's licenses from 100+ countries.</p>}
            {identityStatus === "processing" && <p className="text-amber-600 flex items-start gap-2"><Clock className="w-4 h-4 shrink-0 mt-0.5" />Processing — usually takes a few minutes.</p>}
            {identityStatus === "failed" && <p className="text-red-600 flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />Verification was unsuccessful. Please try again.</p>}
          </StatusActionCard>
        ) : (
          <StatusActionCard
            toneClassName="border-2 border-green-300 bg-green-50 dark:bg-green-900/20"
            title="Owner identity check complete"
            titleClassName="text-green-800 dark:text-green-300"
            icon={<ShieldCheck className="w-6 h-6 text-green-600" />}
            actions={<Badge className="bg-green-100 text-green-700 self-start"><CheckCircle2 className="w-3 h-3 mr-1" />Complete</Badge>}
          >
            {appStatus?.identityVerifiedAt ? <p className="text-green-600">Completed on {new Date(appStatus.identityVerifiedAt).toLocaleDateString()}</p> : null}
          </StatusActionCard>
        )}

        {/* Business Verification — shown once identity is done, or after the application itself is approved.
            While identity is the open step this card is omitted so two steps are not current at once. */}
        {(identityStatus === "verified" || phase === "approved") && (bizStatus !== "verified" ? (
          <StatusActionCard
            toneClassName={
              bizStatus === "failed"
                ? "border-2 border-red-300 bg-red-50 dark:bg-red-900/20"
                : "border-2 border-purple-300 bg-purple-50 dark:bg-purple-900/20"
            }
            title="Business Verification"
            icon={
              <div className={`p-3 rounded-full ${bizStatus === "failed" ? "bg-red-600" : "bg-purple-600"}`}>
                <Building2 className="w-6 h-6 text-white" />
              </div>
            }
            actions={
              <>
                <Button
                  className={statusActionButtonClass(
                    bizStatus === "failed"
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-purple-600 hover:bg-purple-700 text-white",
                  )}
                  onClick={() => startConnectOnboarding.mutate()}
                  disabled={startConnectOnboarding.isPending || bizStatus === "submitted"}
                  data-testid="button-start-connect-onboarding"
                >
                  {startConnectOnboarding.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <ExternalLink className="w-4 h-4" />}
                  {bizStatus === "failed" ? "Retry Connect Onboarding" : "Complete Connect Onboarding →"}
                </Button>
                {bizStatus === "failed" && (
                  <a href={`mailto:${COMPANY_CONTACT_EMAIL}`} className="block w-full sm:w-auto">
                    <Button variant="outline" className={statusActionButtonClass("border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400")}>
                      <MessageSquare className="w-4 h-4" />Contact Support
                    </Button>
                  </a>
                )}
                {bizStatus === "submitted" && (
                  <Badge className="bg-amber-100 text-amber-700 self-start"><Clock className="w-3 h-3 mr-1" />Processing</Badge>
                )}
              </>
            }
          >
            {bizStatus === "pending" && (
              <p className="text-muted-foreground">
                Complete your Stripe Connect onboarding to verify your business. Stripe collects and verifies your business details directly during the secure onboarding flow.
              </p>
            )}
            {bizStatus === "submitted" && (
              <p className="text-amber-600 flex items-start gap-2">
                <Clock className="w-4 h-4 shrink-0 mt-0.5" />Stripe is reviewing your business details — this usually completes within a few minutes.
              </p>
            )}
            {bizStatus === "failed" && (
              <p className="text-red-600 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />Business verification was unsuccessful. Retry Connect onboarding or contact support.
              </p>
            )}
          </StatusActionCard>
        ) : (
          <StatusActionCard
            toneClassName="border-2 border-green-300 bg-green-50 dark:bg-green-900/20"
            title="Business check complete"
            titleClassName="text-green-800 dark:text-green-300"
            icon={<Globe className="w-6 h-6 text-green-600" />}
            actions={<Badge className="bg-green-100 text-green-700 self-start"><CheckCircle2 className="w-3 h-3 mr-1" />Complete</Badge>}
          >
            <p className="text-green-600">Completed through Stripe Connect</p>
          </StatusActionCard>
        ))}

        {currentStep && (
          <StatusActionCard
            toneClassName="border border-border bg-muted"
            title={`Current Step: ${currentStep.title}`}
            icon={<div className="p-3 bg-muted-foreground/80 rounded-full"><Clock className="w-6 h-6 text-white" /></div>}
          >
            <p className="text-muted-foreground">{currentStep.description}</p>
            {currentStep.note && <p className="text-amber-600 mt-2 flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{currentStep.note}</p>}
          </StatusActionCard>
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
                <Link href="/help">
                  <Button variant="ghost" className="w-full" data-testid="link-faq">
                    Help center<ArrowRight className="w-4 h-4 ml-2" />
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
