import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Clock,
  FileText,
  Building2,
  Shield,
  Star,
  Calendar,
  MessageSquare,
  AlertCircle,
  ArrowRight,
  Upload,
  CheckCheck,
  MapPin,
  Phone,
  Mail,
} from "lucide-react";
import { Link } from "wouter";

const applicationSteps = [
  {
    id: 1,
    title: "Business Information",
    description: "Company details and contact information",
    status: "completed",
    completedAt: "Dec 30, 2025",
  },
  {
    id: 2,
    title: "Service Categories",
    description: "Types of services you offer",
    status: "completed",
    completedAt: "Dec 30, 2025",
  },
  {
    id: 3,
    title: "Location & Compliance",
    description: "Business address and legal requirements",
    status: "completed",
    completedAt: "Dec 31, 2025",
  },
  {
    id: 4,
    title: "Document Verification",
    description: "Business license and insurance verification",
    status: "in_progress",
    note: "Insurance document under review",
  },
  {
    id: 5,
    title: "Quality Assessment",
    description: "Service quality review",
    status: "pending",
  },
  {
    id: 6,
    title: "Account Activation",
    description: "Final approval and onboarding",
    status: "pending",
  },
];

const documents = [
  { id: 1, name: "Business License", status: "verified", uploadedAt: "Dec 30, 2025" },
  { id: 2, name: "Insurance Certificate", status: "pending", uploadedAt: "Dec 31, 2025" },
  { id: 3, name: "Tax Registration", status: "verified", uploadedAt: "Dec 30, 2025" },
  { id: 4, name: "Health & Safety Cert", status: "not_uploaded", uploadedAt: null },
];

const businessInfo = {
  name: "Sunset Beach Resort & Spa",
  type: "Accommodation",
  email: "contact@sunsetbeachresort.com",
  phone: "+1 (555) 123-4567",
  address: "123 Ocean Drive, Miami Beach, FL 33139",
  services: ["Luxury Rooms", "Spa Services", "Event Venues", "Restaurant"],
};

export default function ProviderStatusPage() {
  const completedSteps = applicationSteps.filter(s => s.status === "completed").length;
  const progressPercentage = (completedSteps / applicationSteps.length) * 100;
  const currentStep = applicationSteps.find(s => s.status === "in_progress") || applicationSteps.find(s => s.status === "pending");

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
          <Badge className="bg-amber-100 text-amber-700 px-4 py-2" data-testid="badge-status">
            <Clock className="w-4 h-4 mr-2" />
            Under Review
          </Badge>
        </div>

        <Card className="bg-gradient-to-r from-[#FF385C] to-[#E23350] text-white">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">Verification Progress</h3>
                <p className="text-white/80 mt-1">
                  {completedSteps} of {applicationSteps.length} steps completed
                </p>
              </div>
              <div className="text-right">
                <p className="text-4xl font-bold" data-testid="text-progress-percentage">{Math.round(progressPercentage)}%</p>
              </div>
            </div>
            <Progress value={progressPercentage} className="mt-4 h-3 bg-white/20" />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {currentStep && (
              <Card className="border-2 border-[#FF385C] bg-[#FFF5F7] dark:bg-[#FF385C]/10">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-[#FF385C] rounded-full">
                      <Clock className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-[#111827] dark:text-white">
                        Current Step: {currentStep.title}
                      </h3>
                      <p className="text-[#6B7280] mt-1">{currentStep.description}</p>
                      {currentStep.note && (
                        <p className="text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          {currentStep.note}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Verification Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
                  <div className="space-y-6">
                    {applicationSteps.map((step) => (
                      <div key={step.id} className="relative pl-10" data-testid={`step-${step.id}`}>
                        <div
                          className={`absolute left-2 top-1 w-5 h-5 rounded-full flex items-center justify-center ${
                            step.status === "completed"
                              ? "bg-green-500"
                              : step.status === "in_progress"
                              ? "bg-[#FF385C]"
                              : "bg-gray-300 dark:bg-gray-600"
                          }`}
                        >
                          {step.status === "completed" ? (
                            <CheckCircle2 className="w-3 h-3 text-white" />
                          ) : step.status === "in_progress" ? (
                            <Clock className="w-3 h-3 text-white" />
                          ) : (
                            <span className="text-xs text-white font-medium">{step.id}</span>
                          )}
                        </div>
                        <div
                          className={`p-4 rounded-lg ${
                            step.status === "completed"
                              ? "bg-green-50 dark:bg-green-900/20"
                              : step.status === "in_progress"
                              ? "bg-[#FFF5F7] dark:bg-[#FF385C]/10 border border-[#FF385C]"
                              : "bg-gray-50 dark:bg-gray-800"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-semibold text-[#111827] dark:text-white">{step.title}</h4>
                              <p className="text-sm text-[#6B7280] mt-1">{step.description}</p>
                            </div>
                            <div>
                              {step.status === "completed" && (
                                <Badge className="bg-green-100 text-green-700">
                                  <CheckCheck className="w-3 h-3 mr-1" />
                                  Done
                                </Badge>
                              )}
                              {step.status === "in_progress" && (
                                <Badge className="bg-amber-100 text-amber-700">
                                  <Clock className="w-3 h-3 mr-1" />
                                  In Progress
                                </Badge>
                              )}
                              {step.status === "pending" && (
                                <Badge variant="secondary">Pending</Badge>
                              )}
                            </div>
                          </div>
                          {step.completedAt && (
                            <p className="text-xs text-[#6B7280] mt-2">
                              Completed on {step.completedAt}
                            </p>
                          )}
                          {step.note && (
                            <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              {step.note}
                            </p>
                          )}
                        </div>
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
                  <Building2 className="w-5 h-5" />
                  Business Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-lg font-semibold text-[#111827] dark:text-white" data-testid="text-business-name">
                    {businessInfo.name}
                  </p>
                  <Badge variant="secondary" className="mt-1">{businessInfo.type}</Badge>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-[#6B7280]">
                    <Mail className="w-4 h-4" />
                    {businessInfo.email}
                  </div>
                  <div className="flex items-center gap-2 text-[#6B7280]">
                    <Phone className="w-4 h-4" />
                    {businessInfo.phone}
                  </div>
                  <div className="flex items-start gap-2 text-[#6B7280]">
                    <MapPin className="w-4 h-4 mt-0.5" />
                    {businessInfo.address}
                  </div>
                </div>
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-[#111827] dark:text-white mb-2">Services</p>
                  <div className="flex flex-wrap gap-2">
                    {businessInfo.services.map((service, idx) => (
                      <Badge key={idx} variant="outline">{service}</Badge>
                    ))}
                  </div>
                </div>
                <Button variant="outline" className="w-full" data-testid="button-edit-business">
                  Edit Details
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Documents
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    data-testid={`doc-${doc.id}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#111827] dark:text-white text-sm truncate">{doc.name}</p>
                      {doc.uploadedAt && (
                        <p className="text-xs text-[#6B7280]">{doc.uploadedAt}</p>
                      )}
                    </div>
                    {doc.status === "verified" ? (
                      <Badge className="bg-green-100 text-green-700 flex-shrink-0">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Verified
                      </Badge>
                    ) : doc.status === "pending" ? (
                      <Badge className="bg-amber-100 text-amber-700 flex-shrink-0">
                        <Clock className="w-3 h-3 mr-1" />
                        Pending
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="flex-shrink-0">
                        Required
                      </Badge>
                    )}
                  </div>
                ))}
                <Button variant="outline" className="w-full" data-testid="button-upload-doc">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Document
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Need Help?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-[#6B7280]">
                  Questions about your application? We're here to assist.
                </p>
                <Button variant="outline" className="w-full" data-testid="button-contact-support">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Contact Support
                </Button>
                <Link href="/faq">
                  <Button variant="ghost" className="w-full" data-testid="link-faq">
                    View FAQ
                    <ArrowRight className="w-4 h-4 ml-2" />
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
