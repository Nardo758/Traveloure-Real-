import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";

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

const COUNTRY_REGISTRATION_LABELS: Record<string, { label: string; placeholder: string }> = {
  IN: { label: "GSTIN (GST Number)", placeholder: "e.g. 22AAAAA0000A1Z5" },
  JP: { label: "Corporate Number (法人番号)", placeholder: "e.g. 1234567890123" },
  CO: { label: "NIT (Tax ID)", placeholder: "e.g. 900123456-7" },
  GB: { label: "Company Number", placeholder: "e.g. 12345678" },
  US: { label: "EIN (Employer ID Number)", placeholder: "e.g. 12-3456789" },
  DE: { label: "Handelsregisternummer", placeholder: "e.g. HRB 12345" },
  AU: { label: "ABN (Australian Business Number)", placeholder: "e.g. 51 824 753 556" },
  BR: { label: "CNPJ", placeholder: "e.g. 11.222.333/0001-81" },
  SG: { label: "UEN (Unique Entity Number)", placeholder: "e.g. 201912345K" },
  MX: { label: "RFC (Tax ID)", placeholder: "e.g. XAXX010101000" },
  FR: { label: "SIRET Number", placeholder: "e.g. 732 829 320 00074" },
  ES: { label: "CIF (Tax ID)", placeholder: "e.g. A-12345678" },
  ID: { label: "NPWP (Tax ID)", placeholder: "e.g. 01.234.567.8-901.000" },
  TH: { label: "Tax ID Number", placeholder: "e.g. 0105562123456" },
};

const COUNTRY_LIST = [
  { code: "IN", name: "India" },
  { code: "JP", name: "Japan" },
  { code: "CO", name: "Colombia" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "DE", name: "Germany" },
  { code: "AU", name: "Australia" },
  { code: "BR", name: "Brazil" },
  { code: "SG", name: "Singapore" },
  { code: "MX", name: "Mexico" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "ID", name: "Indonesia" },
  { code: "TH", name: "Thailand" },
  { code: "OTHER", name: "Other country" },
];

function StepDot({ status, id }: { status: string; id: number }) {
  const base = "absolute left-2 top-1 w-5 h-5 rounded-full flex items-center justify-center";
  if (status === "completed") return <div className={`${base} bg-green-500`}><CheckCircle2 className="w-3 h-3 text-white" /></div>;
  if (status === "in_progress") return <div className={`${base} bg-[#FF385C]`}><Clock className="w-3 h-3 text-white" /></div>;
  if (status === "failed") return <div className={`${base} bg-red-500`}><AlertCircle className="w-3 h-3 text-white" /></div>;
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
        <div>
          {step.status === "completed" && <Badge className="bg-green-100 text-green-700"><CheckCheck className="w-3 h-3 mr-1" />Done</Badge>}
          {step.status === "in_progress" && <Badge className="bg-amber-100 text-amber-700"><Clock className="w-3 h-3 mr-1" />In Progress</Badge>}
          {step.status === "failed" && <Badge className="bg-red-100 text-red-700"><AlertCircle className="w-3 h-3 mr-1" />Needs Attention</Badge>}
          {step.status === "pending" && <Badge variant="secondary">Pending</Badge>}
        </div>
      </div>
      {step.completedAt && <p className="text-xs text-[#6B7280] mt-2">Completed on {step.completedAt}</p>}
      {step.note && <p className="text-sm text-amber-600 mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{step.note}</p>}
    </div>
  );
}

export default function ProviderStatusPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [bizCountry, setBizCountry] = useState("");
  const [bizRegNumber, setBizRegNumber] = useState("");

  const { data: appStatus, isLoading } = useQuery<ApplicationStatus>({
    queryKey: ["/api/provider/application-status"],
    refetchInterval: 10000,
  });

  const [bizDocUrl, setBizDocUrl] = useState("");

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

  const submitBizVerification = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/identity/business/create-inquiry", {
        country: bizCountry,
        registrationNumber: bizRegNumber,
        additionalDocUrl: bizDocUrl || undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/application-status"] });
      if (data.inquiryUrl) {
        window.open(data.inquiryUrl, "_blank");
      } else {
        toast({ title: "Submitted for verification", description: "Your business details have been submitted. We'll notify you when verification is complete." });
      }
    },
    onError: (err: any) => {
      toast({ title: "Submission failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verification") === "complete") {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/application-status"] });
      toast({ title: "Verification submitted", description: "We're processing your identity verification." });
      window.history.replaceState({}, "", "/provider-status");
    }
    if (appStatus?.businessCountry) setBizCountry(appStatus.businessCountry);
  }, [appStatus?.businessCountry]);

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
  const bizStatus = appStatus?.businessVerificationStatus ?? "pending";
  const completedSteps = steps.filter(s => s.status === "completed").length;
  const progressPercentage = steps.length > 0 ? (completedSteps / steps.length) * 100 : 0;
  const currentStep = steps.find(s => s.status === "in_progress") || steps.find(s => s.status === "pending" || s.status === "failed");
  const overallStatus = appStatus?.overallStatus ?? "pending";

  const regInfo = COUNTRY_REGISTRATION_LABELS[bizCountry] ?? { label: "Business Registration Number", placeholder: "Enter your registration number" };

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
              Service Provider Application
            </h1>
            <p className="text-[#6B7280] mt-1">Track your business verification progress</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/provider/application-status"] })} data-testid="button-refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
            {overallBadge}
          </div>
        </div>

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
                  <h3 className="text-lg font-semibold text-[#111827] dark:text-white">Business Owner ID Verification</h3>
                  {identityStatus === "pending" && <p className="text-[#6B7280] mt-1">Verify your government-issued ID and take a quick selfie. Supports passports, national IDs, and driver's licenses from 100+ countries.</p>}
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

        {/* Business Verification (Persona KYB) */}
        {bizStatus !== "verified" ? (
          <Card className="border-2 border-purple-300 bg-purple-50 dark:bg-purple-900/20">
            <CardContent className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-3 bg-purple-600 rounded-full flex-shrink-0">
                  <Globe className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#111827] dark:text-white">Business Verification</h3>
                  {bizStatus === "pending" && <p className="text-[#6B7280] mt-1">Verify your business entity. We check against national registries in 180+ countries.</p>}
                  {bizStatus === "submitted" && <p className="text-amber-600 mt-1 flex items-center gap-2"><Clock className="w-4 h-4" />Verification submitted — we'll notify you when complete.</p>}
                  {bizStatus === "failed" && <p className="text-red-600 mt-1 flex items-center gap-2"><AlertCircle className="w-4 h-4" />Verification failed. Please check your details and try again.</p>}
                </div>
              </div>

              {(bizStatus === "pending" || bizStatus === "failed") && (
                <div className="space-y-4 mt-2">
                  <div>
                    <Label htmlFor="biz-country">Business Country</Label>
                    <Select value={bizCountry} onValueChange={setBizCountry}>
                      <SelectTrigger id="biz-country" className="mt-1" data-testid="select-business-country">
                        <SelectValue placeholder="Select your country" />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRY_LIST.map(c => (
                          <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="biz-reg">{regInfo.label}</Label>
                    <Input
                      id="biz-reg"
                      className="mt-1"
                      placeholder={regInfo.placeholder}
                      value={bizRegNumber}
                      onChange={e => setBizRegNumber(e.target.value)}
                      data-testid="input-registration-number"
                    />
                  </div>
                  <div>
                    <Label htmlFor="biz-doc-url">Supporting Document URL <span className="text-gray-400 text-xs font-normal">(optional)</span></Label>
                    <Input
                      id="biz-doc-url"
                      className="mt-1"
                      placeholder="Link to business license, certificate of incorporation, etc."
                      value={bizDocUrl}
                      onChange={e => setBizDocUrl(e.target.value)}
                      data-testid="input-document-url"
                    />
                    <p className="text-xs text-gray-500 mt-1">Upload your document elsewhere and paste the URL, or your previously uploaded business license will be used automatically.</p>
                  </div>
                  <Button
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => submitBizVerification.mutate()}
                    disabled={submitBizVerification.isPending || !bizCountry || !bizRegNumber}
                    data-testid="button-submit-business-verification"
                  >
                    {submitBizVerification.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
                    Submit for Business Verification
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-2 border-green-300 bg-green-50 dark:bg-green-900/20">
            <CardContent className="p-4 flex items-center gap-3">
              <Globe className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-800 dark:text-green-300">Business Verified</p>
                {appStatus?.businessCountry && <p className="text-sm text-green-600">{COUNTRY_LIST.find(c => c.code === appStatus.businessCountry)?.name ?? appStatus.businessCountry}</p>}
              </div>
              <Badge className="ml-auto bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>
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
                <div>
                  <h3 className="text-lg font-semibold text-[#111827] dark:text-white">Current Step: {currentStep.title}</h3>
                  <p className="text-[#6B7280] mt-1">{currentStep.description}</p>
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
                    <p className="text-lg font-semibold text-[#111827] dark:text-white" data-testid="text-business-name">{appStatus.form.businessName}</p>
                    {appStatus.form.country && <p className="text-sm text-[#6B7280] mt-1">{appStatus.form.country}</p>}
                  </div>
                )}
                <p className="text-xs text-[#6B7280]">Applied {appStatus?.form?.createdAt ? new Date(appStatus.form.createdAt).toLocaleDateString() : "—"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">Need Help?</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-[#6B7280]">Questions about your application? We're here to assist.</p>
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
