import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ChevronLeft, 
  Package, 
  Video,
  MapPin,
  FileText,
  Clock,
  ArrowRight,
  Plane,
  PartyPopper,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";

interface ServiceTemplate {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  serviceType: string | null;
  deliveryMethod: string | null;
  deliveryTimeframe: string | null;
  suggestedPrice: string | null;
  requirements: unknown;
  whatIncluded: unknown;
  isActive: boolean;
  sortOrder: number | null;
  createdAt: string;
  targetRoles: string[];
  roleBadge: string | null;
}

const ROLE_BADGE_STYLE: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  "Local Expert": {
    bg: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-700",
    icon: <MapPin className="w-3 h-3" />,
  },
  "Travel Advisor": {
    bg: "bg-blue-50 border-blue-200",
    text: "text-blue-700",
    icon: <Plane className="w-3 h-3" />,
  },
  "Event Planner": {
    bg: "bg-purple-50 border-purple-200",
    text: "text-purple-700",
    icon: <PartyPopper className="w-3 h-3" />,
  },
};

export default function ServiceTemplates() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: templates = [], isLoading } = useQuery<ServiceTemplate[]>({
    queryKey: ["/api/expert/service-templates"],
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: async (template: ServiceTemplate) => {
      return apiRequest("POST", `/api/expert/services/from-template/${template.id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/services"] });
      toast({ title: "Service created from template. You can now customize it." });
      navigate("/expert/services");
    },
    onError: () => {
      toast({ title: "Failed to create service", variant: "destructive" });
    },
  });

  const getDeliveryIcon = (method: string | null) => {
    switch (method) {
      case "video":
        return <Video className="w-5 h-5" />;
      case "in-person":
        return <MapPin className="w-5 h-5" />;
      case "document":
        return <FileText className="w-5 h-5" />;
      default:
        return <Package className="w-5 h-5" />;
    }
  };

  const getDeliveryLabel = (method: string | null) => {
    switch (method) {
      case "video":
        return "Video Call";
      case "in-person":
        return "In-Person";
      case "document":
        return "Document";
      case "hybrid":
        return "Hybrid";
      default:
        return "Mixed";
    }
  };

  const formatWhatIncluded = (value: unknown): string | null => {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.join(", ");
    return null;
  };

  return (
    <ExpertLayout title="Service Templates">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <Link href="/expert/services">
              <Button variant="ghost" className="mb-2" data-testid="button-back-to-services">
                <ChevronLeft className="w-4 h-4 mr-1" /> Back to Services
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-templates-title">
              Service Templates
            </h1>
            <p className="text-gray-600">
              Start with a pre-built template matched to your expert role and customize it
            </p>
          </div>
          <Link href="/expert/services/new">
            <Button variant="outline" data-testid="button-create-from-scratch">
              Create from Scratch
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            [...Array(6)].map((_, i) => (
              <Card key={i} className="border-gray-200">
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-1/2 mb-4" />
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))
          ) : (
            templates.map((template) => {
              const roleStyle = template.roleBadge
                ? ROLE_BADGE_STYLE[template.roleBadge]
                : null;
              return (
                <Card key={template.id} className="border-gray-200 hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-10 h-10 rounded-lg bg-[#FF385C]/10 flex items-center justify-center text-[#FF385C]">
                        {getDeliveryIcon(template.deliveryMethod)}
                      </div>
                      {template.suggestedPrice && (
                        <Badge variant="outline" className="font-medium">
                          ${template.suggestedPrice}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-lg mt-3">{template.title}</CardTitle>
                    {template.roleBadge && roleStyle && (
                      <div
                        className={`inline-flex items-center gap-1.5 self-start px-2 py-0.5 rounded-full border text-xs font-medium ${roleStyle.bg} ${roleStyle.text}`}
                        data-testid={`badge-role-${template.id}`}
                      >
                        {roleStyle.icon}
                        {template.roleBadge}
                      </div>
                    )}
                    <CardDescription className="line-clamp-2">
                      {template.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                      {template.deliveryMethod && (
                        <span className="flex items-center gap-1">
                          {getDeliveryIcon(template.deliveryMethod)}
                          {getDeliveryLabel(template.deliveryMethod)}
                        </span>
                      )}
                      {template.deliveryTimeframe && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {template.deliveryTimeframe}
                        </span>
                      )}
                    </div>

                    {formatWhatIncluded(template.whatIncluded) && (
                      <div className="text-sm text-gray-600">
                        <p className="font-medium text-gray-900 mb-1">Includes:</p>
                        <p className="line-clamp-2">{formatWhatIncluded(template.whatIncluded)}</p>
                      </div>
                    )}

                    <Button
                      className="w-full bg-[#FF385C] hover:bg-[#E23350]"
                      onClick={() => createFromTemplateMutation.mutate(template)}
                      disabled={createFromTemplateMutation.isPending}
                      data-testid={`button-use-template-${template.id}`}
                    >
                      {createFromTemplateMutation.isPending ? "Creating..." : "Use This Template"}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {templates.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No templates available</h3>
            <p className="text-gray-600 mb-4">Create your service from scratch instead</p>
            <Link href="/expert/services/new">
              <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-create-service">
                Create Service
              </Button>
            </Link>
          </div>
        )}
      </div>
    </ExpertLayout>
  );
}
