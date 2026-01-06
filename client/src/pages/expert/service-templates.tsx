import { ExpertLayout } from "@/components/expert-layout";
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
  DollarSign,
  ArrowRight
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";

interface ServiceTemplate {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  serviceType: string | null;
  deliveryMethod: string | null;
  deliveryTimeframe: string | null;
  suggestedPrice: string | null;
  requirements: string | null;
  whatIncluded: string | null;
  isActive: boolean;
  sortOrder: number | null;
  createdAt: string;
}

export default function ServiceTemplates() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: templates = [], isLoading } = useQuery<ServiceTemplate[]>({
    queryKey: ["/api/service-templates"],
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: async (template: ServiceTemplate) => {
      const serviceData = {
        serviceName: template.name,
        description: template.description,
        categoryId: template.categoryId,
        price: template.suggestedPrice || "0",
        serviceType: template.serviceType,
        deliveryMethod: template.deliveryMethod,
        deliveryTimeframe: template.deliveryTimeframe,
        requirements: template.requirements,
        whatIncluded: template.whatIncluded,
        status: "draft",
      };
      return apiRequest("POST", "/api/provider/services", serviceData);
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

  const popularTemplates: ServiceTemplate[] = [
    {
      id: "quick-consultation",
      name: "Quick Consultation",
      description: "15-minute video call to answer quick travel questions and provide immediate guidance",
      categoryId: null,
      serviceType: "consultation",
      deliveryMethod: "video",
      deliveryTimeframe: "15 min",
      suggestedPrice: "29",
      requirements: "Travel question or topic to discuss",
      whatIncluded: "15-min video call, Personalized advice, Follow-up summary email",
      isActive: true,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
    },
    {
      id: "cart-review",
      name: "Cart Review & Optimization",
      description: "Expert review of your travel cart to find savings and better alternatives",
      categoryId: null,
      serviceType: "review",
      deliveryMethod: "document",
      deliveryTimeframe: "24 hours",
      suggestedPrice: "49",
      requirements: "Cart link or selections, Budget constraints",
      whatIncluded: "Written recommendations, Alternative suggestions, Savings estimate",
      isActive: true,
      sortOrder: 2,
      createdAt: new Date().toISOString(),
    },
    {
      id: "full-trip-planning",
      name: "Full Trip Planning",
      description: "Comprehensive trip planning from start to finish with personalized itinerary",
      categoryId: null,
      serviceType: "planning",
      deliveryMethod: "hybrid",
      deliveryTimeframe: "3-5 days",
      suggestedPrice: "249",
      requirements: "Destination, Dates, Budget, Interests, Travel style",
      whatIncluded: "Full itinerary, Booking links, Restaurant reservations, Daily schedule, Packing list",
      isActive: true,
      sortOrder: 3,
      createdAt: new Date().toISOString(),
    },
    {
      id: "destination-guide",
      name: "Destination Deep Dive",
      description: "In-depth guide to a specific destination with local insights and hidden gems",
      categoryId: null,
      serviceType: "custom",
      deliveryMethod: "document",
      deliveryTimeframe: "48 hours",
      suggestedPrice: "79",
      requirements: "Destination, Travel dates, Interests",
      whatIncluded: "PDF guide, Local recommendations, Maps, Insider tips, Safety advice",
      isActive: true,
      sortOrder: 4,
      createdAt: new Date().toISOString(),
    },
    {
      id: "honeymoon-planning",
      name: "Honeymoon Planning Package",
      description: "Romantic trip planning with special touches and memorable experiences",
      categoryId: null,
      serviceType: "planning",
      deliveryMethod: "hybrid",
      deliveryTimeframe: "5-7 days",
      suggestedPrice: "399",
      requirements: "Couple preferences, Budget, Dates, Special requests",
      whatIncluded: "Custom itinerary, Romantic experiences, Special arrangements, Booking assistance",
      isActive: true,
      sortOrder: 5,
      createdAt: new Date().toISOString(),
    },
    {
      id: "group-coordination",
      name: "Group Trip Coordinator",
      description: "Organize and coordinate travel for groups with complex logistics",
      categoryId: null,
      serviceType: "planning",
      deliveryMethod: "video",
      deliveryTimeframe: "1 week",
      suggestedPrice: "349",
      requirements: "Group size, Budget per person, Destination preferences, Special needs",
      whatIncluded: "Group logistics, Shared itinerary, Booking coordination, Communication support",
      isActive: true,
      sortOrder: 6,
      createdAt: new Date().toISOString(),
    },
  ];

  const allTemplates = [...templates, ...popularTemplates];

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
              Start with a pre-built template and customize it for your expertise
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
            allTemplates.map((template) => (
              <Card key={template.id} className="border-gray-200 hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-10 h-10 rounded-lg bg-[#FF385C]/10 flex items-center justify-center">
                      {getDeliveryIcon(template.deliveryMethod)}
                    </div>
                    {template.suggestedPrice && (
                      <Badge variant="outline" className="font-medium">
                        ${template.suggestedPrice}
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg mt-3">{template.name}</CardTitle>
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

                  {template.whatIncluded && (
                    <div className="text-sm text-gray-600">
                      <p className="font-medium text-gray-900 mb-1">Includes:</p>
                      <p className="line-clamp-2">{template.whatIncluded}</p>
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
            ))
          )}
        </div>

        {allTemplates.length === 0 && !isLoading && (
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
