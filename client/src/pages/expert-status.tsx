import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Clock,
  FileText,
  Star,
  MessageSquare,
  AlertCircle,
  ArrowRight,
  CheckCheck,
  ShieldCheck,
  ExternalLink,
  Loader2,
  RefreshCw,
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
  if (status === "in_progress") return <div className={`${base} bg-[#FF385C]`}><StepIcon status="in_progress" /></div>;
  if (status === "failed") return <div className={`${base} bg-red-500`}><StepIcon status="failed" /></div>;
  return <div className={`${base} bg-gray-300 dark:bg-gray-600`}><span className="text-xs text-white font-medium">{id}</span></div>;
}

function StepCard({ step }: { step: ApplicationStep }) {
  const bg =
    step.status === "completed" ? "bg-green-50 dark:bg-green-900/20" :
    step.status === "in_progress" ? "bg-[#FFF5F7] dark:bg-[#FF385C]/10 border border-[#FF385C]" :
    step.status === "failed" ? "bg-red-50 dark:bg-red-900/20 border border-red-300" :
    "bg-gray-50 dark:bg-gray-800";

  return (
    <div className={`p-4 rounded-lg ${bg}`}>
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-[#111827] dark:text-white">{step.title}</h4>
          <p className="text-sm text-[#6B7280] mt-1">{step.description}</p>
        </div>
        <div className="text-right">
          {step.status === "completed" && <Badge className="bg-green-100 text-green-700"><CheckCheck className="w-3 h-3 mr-1" />Completed</Badge>}
          {step.status === "in_progress" && <Badge className="bg-amber-100 text-amber-700"><Clock className="w-3 h-3 mr-1" />In Progress</Badge>}
          {step.status === "failed" && <Badge className="bg-red-100 text-red-700"><AlertCircle className="w-3 h-3 mr-1" />Needs Attention</Badge>}
          {step.status === "pending" && <Badge variant="secondary">Pending</Badge>}
        </div>
      </div>
      {step.completedAt && <p className="text-xs text-[#6B7280] mt-2">Completed on {step.completedAt}</p>}
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

  const { data: appStatus, isLoading } = useQuery<ApplicationStatus>({
    queryKey: ["/api/expert/application-status"],
    refetchInterval: 10000,
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

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF385C]" />
        </div>
      </DashboardLayout>
    );
  }

  const steps = appStatus?.steps ?? [];
  const identityStatus = appStatus?.identityVerificationStatus ?? "pending";
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
            <h1 className="text-2xl md:text-3xl font-bold text-[#111827] dark:text-white" data-testid="text-page-title">
              Expert Application Status
            </h1>
            <p className="text-[#6B7280] mt-1">Track your progress to becoming a travel expert</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/expert/application-status"] })} data-testid="button-refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
            {overallBadge}
          </div>
        </div>

        <Card className="bg-gradient-to-r from-[#FF385C] to-[#E23350] text-white">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">Application Progress</h3>
                <p className="text-white/80 mt-1">{completedSteps} of {steps.length} steps completed</p>
              </div>
              <div className="text-right">
                <p className="text-4xl font-bold" data-testid="text-progress-percentage">{Math.round(progressPercentage)}%</p>
              </div>
            </div>
            <Progress value={progressPercentage} className="mt-4 h-3 bg-white/20" />
          </CardContent>
        </Card>

        {/* Identity Verification Action Card */}
        {identityStatus !== "verified" && (
          <Card className="border-2 border-blue-300 bg-blue-50 dark:bg-blue-900/20">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-600 rounded-full flex-shrink-0">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[#111827] dark:text-white">Identity Verification Required</h3>
                  {identityStatus === "pending" && (
                    <p className="text-[#6B7280] mt-1">Verify your government-issued ID and take a quick selfie. Takes about 2 minutes and supports passports, national IDs, and driver's licenses from 100+ countries.</p>
                  )}
                  {identityStatus === "processing" && (
                    <p className="text-amber-600 mt-1 flex items-center gap-2"><Clock className="w-4 h-4" />Your verification is being processed. Usually takes a few minutes.</p>
                  )}
                  {identityStatus === "failed" && (
                    <p className="text-red-600 mt-1 flex items-center gap-2"><AlertCircle className="w-4 h-4" />Verification was unsuccessful. Please try again with a clear photo of your ID.</p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {identityStatus === "processing" ? (
                    <Badge className="bg-amber-100 text-amber-700"><Clock className="w-3 h-3 mr-1" />Processing</Badge>
                  ) : (
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => startVerificationMutation.mutate()}
                      disabled={startVerificationMutation.isPending}
                      data-testid="button-verify-identity"
                    >
                      {startVerificationMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                      {identityStatus === "failed" ? "Retry Verification" : "Verify My Identity →"}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {identityStatus === "verified" && (
          <Card className="border-2 border-green-300 bg-green-50 dark:bg-green-900/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-semibold text-green-800 dark:text-green-300">Identity Verified</p>
                  {appStatus?.identityVerifiedAt && (
                    <p className="text-sm text-green-600">Verified on {new Date(appStatus.identityVerifiedAt).toLocaleDateString()}</p>
                  )}
                </div>
                <Badge className="ml-auto bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep && (
          <Card className="border-2 border-[#FF385C] bg-[#FFF5F7] dark:bg-[#FF385C]/10">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-[#FF385C] rounded-full">
                  <Clock className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[#111827] dark:text-white">Current Step: {currentStep.title}</h3>
                  <p className="text-[#6B7280] mt-1">{currentStep.description}</p>
                  {currentStep.note && (
                    <p className="text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />{currentStep.note}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
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
                <p className="text-sm text-[#6B7280]">Have questions about your application? Our team is here to help.</p>
                <Button variant="outline" className="w-full" data-testid="button-contact-support">
                  <MessageSquare className="w-4 h-4 mr-2" />Contact Support
                </Button>
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
