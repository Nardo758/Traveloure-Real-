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
  Star,
  MessageSquare,
  AlertCircle,
  ArrowRight,
  CheckCheck,
  ShieldCheck,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { helpArticlePath } from "@shared/help-article-slugs";
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
  rejectionMessage: string | null;
  identityVerificationStatus: string;
  identityVerifiedAt?: string;
  form: {
    id: string;
    status: string;
    firstName?: string;
    createdAt: string;
  } | null;
}

function StepIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="w-3 h-3 text-white" />;
  if (status === "in_progress") return <Clock className="w-3 h-3 text-white" />;
  if (status === "failed") return <AlertCircle className="w-3 h-3 text-white" />;
  return null;
}

function StepDot({ status, id }: { status: string; id: number }) {
  const base = "absolute left-2 top-1 w-5 h-5 rounded-full flex items-center justify-center";
  if (status === "completed") return <div className={`${base} bg-green-500`}><StepIcon status="completed" /></div>;
  if (status === "in_progress") return <div className={`${base} bg-primary`}><StepIcon status="in_progress" /></div>;
  if (status === "failed") return <div className={`${base} bg-red-500`}><StepIcon status="failed" /></div>;
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
          {step.status === "completed" && <Badge className="bg-green-100 text-green-700"><CheckCheck className="w-3 h-3 mr-1" />Completed</Badge>}
          {step.status === "in_progress" && <Badge className="bg-amber-100 text-amber-700"><Clock className="w-3 h-3 mr-1" />In Progress</Badge>}
          {step.status === "failed" && <Badge className="bg-red-100 text-red-700"><AlertCircle className="w-3 h-3 mr-1" />Needs Attention</Badge>}
          {step.status === "pending" && <Badge variant="secondary">Pending</Badge>}
        </div>
      </div>
      {step.completedAt && <p className="text-xs text-muted-foreground mt-2">Completed on {step.completedAt}</p>}
      {step.note && (
        <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />{step.note}
        </p>
      )}
    </div>
  );
}

export default function ExpertStatusPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: appStatus, isLoading, isFetching } = useQuery<ApplicationStatus>({
    queryKey: ["/api/expert/application-status"],
    ...applicationStatusQuery,
  });

  const startVerificationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/identity/create-session", { formType: "expert" });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/application-status"] });
      if (data.verificationUrl) {
        window.open(data.verificationUrl, "_blank");
      }
    },
    onError: (err: any) => {
      toast({ title: "Verification unavailable", description: err.message || "Please try again later.", variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verification") === "complete") {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/application-status"] });
      toast({ title: "Verification submitted", description: "We're processing your identity verification. This usually takes a few minutes." });
      window.history.replaceState({}, "", "/expert-status");
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
          title="Expert Application Status"
          phaseDetail={appStatus?.phaseDetail}
          badge={overallBadge}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ["/api/expert/application-status"] })}
        />

        <ApplicationProgressCard
          title="Application Progress"
          completed={completedSteps}
          total={steps.length}
          urgent={phase === "rejected" || identityStatus === "failed" || steps.some((step) => step.status === "failed")}
        />

        {/* Rejection callout — only shown when the application was not approved */}
        {overallStatus === "rejected" && (
          <StatusActionCard
            testId="card-rejection-details"
            toneClassName="border-2 border-red-300 bg-red-50 dark:bg-red-900/20"
            title="Application Not Approved"
            titleClassName="text-red-800 dark:text-red-300"
            icon={<div className="p-3 bg-red-500 rounded-full"><AlertCircle className="w-6 h-6 text-white" /></div>}
            actions={
              <a href="/expert/apply" className="block w-full sm:w-auto">
                <Button className={statusActionButtonClass("bg-red-600 hover:bg-red-700 text-white")} data-testid="button-reapply">
                  Update &amp; Resubmit Application
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </a>
            }
          >
            {appStatus?.rejectionMessage ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-red-100 dark:bg-red-900/30 px-4 py-3 border border-red-200 dark:border-red-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 mb-1">
                    Reason from our review team
                  </p>
                  <p className="text-sm text-red-800 dark:text-red-200 leading-relaxed" data-testid="text-rejection-reason">
                    {appStatus.rejectionMessage}
                  </p>
                </div>
                <p className="text-sm text-red-700 dark:text-red-400">
                  Please address the feedback above and resubmit your application.
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Our review team did not leave a specific reason. Please review your application, make any improvements, and reapply.
              </p>
            )}
          </StatusActionCard>
        )}

        {phase === "approved" && identityStatus !== "verified" && (
          <StatusActionCard
            testId="card-identity-before-live"
            toneClassName="border-2 border-blue-300 bg-blue-50 dark:bg-blue-900/20"
            title="Verify your identity before a listing can go live"
            icon={<div className="p-3 bg-blue-600 rounded-full"><ShieldCheck className="w-6 h-6 text-white" /></div>}
            actions={
              <Button
                className={statusActionButtonClass("bg-blue-600 hover:bg-blue-700 text-white")}
                onClick={() => startVerificationMutation.mutate()}
                disabled={startVerificationMutation.isPending}
                data-testid="button-verify-identity"
              >
                {startVerificationMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                Verify My Identity →
              </Button>
            }
          >
            <p className="text-muted-foreground">Your application is approved. A listing stays private until this check is finished.</p>
          </StatusActionCard>
        )}
        {phase !== "approved" && identityStatus !== "verified" && (
          <StatusActionCard
            toneClassName={
              identityStatus === "failed"
                ? "border-2 border-red-300 bg-red-50 dark:bg-red-900/20"
                : "border-2 border-blue-300 bg-blue-50 dark:bg-blue-900/20"
            }
            title="Identity Verification Required"
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
                  onClick={() => startVerificationMutation.mutate()}
                  disabled={startVerificationMutation.isPending}
                  data-testid="button-verify-identity"
                >
                  {startVerificationMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                  {identityStatus === "failed" ? "Retry Verification" : "Verify My Identity →"}
                </Button>
              )
            }
          >
            {identityStatus === "pending" && (
              <p className="text-muted-foreground">Verify your government-issued ID and take a quick selfie. Takes about 2 minutes and supports passports, national IDs, and driver's licenses from 100+ countries.</p>
            )}
            {identityStatus === "processing" && (
              <p className="text-amber-600 flex items-center gap-2"><Clock className="w-4 h-4 shrink-0" />Your verification is being processed. Usually takes a few minutes.</p>
            )}
            {identityStatus === "failed" && (
              <p className="text-red-600 flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />Verification was unsuccessful. Please try again with a clear photo of your ID.</p>
            )}
          </StatusActionCard>
        )}

        {identityStatus === "verified" && (
          <StatusActionCard
            toneClassName="border-2 border-green-300 bg-green-50 dark:bg-green-900/20"
            title="Identity check complete"
            titleClassName="text-green-800 dark:text-green-300"
            icon={<ShieldCheck className="w-6 h-6 text-green-600" />}
            actions={<Badge className="bg-green-100 text-green-700 self-start"><CheckCircle2 className="w-3 h-3 mr-1" />Complete</Badge>}
          >
            {appStatus?.identityVerifiedAt ? (
              <p className="text-green-600">Completed on {new Date(appStatus.identityVerifiedAt).toLocaleDateString()}</p>
            ) : null}
          </StatusActionCard>
        )}

        {currentStep && (
          <StatusActionCard
            toneClassName="border border-border bg-muted"
            title={`Current Step: ${currentStep.title}`}
            icon={<div className="p-3 bg-muted-foreground/80 rounded-full"><Clock className="w-6 h-6 text-white" /></div>}
          >
            <p className="text-muted-foreground">{currentStep.description}</p>
            {currentStep.note && (
              <p className="text-amber-600 dark:text-amber-400 mt-2 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{currentStep.note}
              </p>
            )}
          </StatusActionCard>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Application Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
                  <div className="space-y-6">
                    {steps.map((step) => (
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
            <Card className="bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
              <CardContent className="p-6">
                <Star className="w-8 h-8 mb-3" />
                <h4 className="font-semibold text-lg">Prepare for Success</h4>
                <p className="text-white/80 text-sm mt-2">While you wait, check out our expert guidelines and best practices.</p>
                <Button variant="secondary" className="mt-4 w-full" data-testid="button-view-guidelines">View Guidelines</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Need Help?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Have questions about your application? Our team is here to help.</p>
                <Link href="/contact">
                  <Button variant="outline" className="w-full" data-testid="button-contact-support">
                    <MessageSquare className="w-4 h-4 mr-2" />Contact Support
                  </Button>
                </Link>
                <Link href={helpArticlePath("become-a-local-expert")}>
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
