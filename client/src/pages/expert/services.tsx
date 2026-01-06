import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Plus, 
  Edit, 
  Copy, 
  DollarSign, 
  Clock, 
  Star,
  Video,
  MapPin,
  FileText,
  TrendingUp,
  Package,
  MoreVertical,
  Eye,
  Pause,
  Play
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

interface ServiceAnalytics {
  totalServices: number;
  activeServices: number;
  draftServices: number;
  pausedServices: number;
  totalRevenue: number;
  totalBookings: number;
  averageRating: number | null;
  pendingBookings: number;
  completedBookings: number;
}

interface ProviderService {
  id: string;
  userId: string;
  serviceName: string;
  description: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  price: string;
  serviceType: string | null;
  deliveryMethod: string | null;
  deliveryTimeframe: string | null;
  requirements: string | null;
  whatIncluded: string | null;
  location: string | null;
  status: string;
  bookingsCount: number | null;
  totalRevenue: string | null;
  averageRating: string | null;
  reviewCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export default function ExpertServices() {
  const { toast } = useToast();

  const { data: analytics, isLoading: analyticsLoading } = useQuery<ServiceAnalytics>({
    queryKey: ["/api/expert/analytics"],
  });

  const { data: services = [], isLoading: servicesLoading } = useQuery<ProviderService[]>({
    queryKey: ["/api/expert/services"],
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/expert/services/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expert/analytics"] });
      toast({ title: "Service status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/expert/services/${id}/duplicate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/services"] });
      toast({ title: "Service duplicated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to duplicate service", variant: "destructive" });
    },
  });

  const handleToggleStatus = (service: ProviderService) => {
    const newStatus = service.status === "active" ? "paused" : "active";
    toggleStatusMutation.mutate({ id: service.id, status: newStatus });
  };

  const handleDuplicate = (id: string) => {
    duplicateMutation.mutate(id);
  };

  const getDeliveryIcon = (method: string | null) => {
    switch (method) {
      case "video":
        return <Video className="w-4 h-4" />;
      case "in-person":
        return <MapPin className="w-4 h-4" />;
      case "document":
        return <FileText className="w-4 h-4" />;
      default:
        return <Package className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "paused":
        return "bg-yellow-100 text-yellow-800";
      case "draft":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const activeServices = services.filter(s => s.status === "active");
  const draftServices = services.filter(s => s.status === "draft");
  const pausedServices = services.filter(s => s.status === "paused");

  const renderServiceCard = (service: ProviderService) => (
    <div 
      key={service.id} 
      className={`p-4 rounded-lg border ${service.status === "active" ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50"}`}
      data-testid={`service-${service.id}`}
    >
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${service.status === "active" ? "bg-[#FF385C]/10" : "bg-gray-200"}`}>
          {getDeliveryIcon(service.deliveryMethod)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`font-semibold ${service.status === "active" ? "text-gray-900" : "text-gray-500"}`}>
                {service.serviceName}
              </h3>
              <Badge className={getStatusColor(service.status)}>
                {service.status.charAt(0).toUpperCase() + service.status.slice(1)}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Switch 
                checked={service.status === "active"} 
                onCheckedChange={() => handleToggleStatus(service)}
                disabled={toggleStatusMutation.isPending}
                data-testid={`switch-service-${service.id}`}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" data-testid={`button-service-menu-${service.id}`}>
                    <MoreVertical className="w-4 h-4 text-gray-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/expert/services/${service.id}/edit`}>
                      <Edit className="w-4 h-4 mr-2" /> Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDuplicate(service.id)}>
                    <Copy className="w-4 h-4 mr-2" /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleToggleStatus(service)}>
                    {service.status === "active" ? (
                      <>
                        <Pause className="w-4 h-4 mr-2" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" /> Activate
                      </>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <p className={`text-sm mt-1 line-clamp-2 ${service.status === "active" ? "text-gray-600" : "text-gray-400"}`}>
            {service.description || "No description"}
          </p>
          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
            <span className="flex items-center gap-1 font-medium text-gray-900">
              <DollarSign className="w-4 h-4 text-green-600" />
              ${service.price}
            </span>
            {service.deliveryTimeframe && (
              <span className="flex items-center gap-1 text-gray-600">
                <Clock className="w-4 h-4" />
                {service.deliveryTimeframe}
              </span>
            )}
            {service.averageRating && (
              <span className="flex items-center gap-1 text-gray-600">
                <Star className="w-4 h-4 text-yellow-500" />
                {Number(service.averageRating).toFixed(1)} ({service.reviewCount || 0} reviews)
              </span>
            )}
            <span className="flex items-center gap-1 text-gray-600">
              <Eye className="w-4 h-4" />
              {service.bookingsCount || 0} bookings
            </span>
            {service.deliveryMethod && (
              <span className="flex items-center gap-1 text-gray-600">
                {getDeliveryIcon(service.deliveryMethod)}
                {service.deliveryMethod}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <ExpertLayout title="Services">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-services-title">My Services</h1>
            <p className="text-gray-600">Create and manage your service offerings</p>
          </div>
          <Link href="/expert/services/new">
            <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-add-service">
              <Plus className="w-4 h-4 mr-2" /> Create Service
            </Button>
          </Link>
        </div>

        {analyticsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="border border-gray-200">
                <CardContent className="p-4">
                  <Skeleton className="h-10 w-16 mx-auto mb-2" />
                  <Skeleton className="h-4 w-24 mx-auto" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border border-gray-200" data-testid="card-total-services">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-gray-900">{analytics?.totalServices || 0}</p>
                <p className="text-sm text-gray-600">Total Services</p>
              </CardContent>
            </Card>
            <Card className="border border-gray-200" data-testid="card-active-services">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-green-600">{analytics?.activeServices || 0}</p>
                <p className="text-sm text-gray-600">Active Services</p>
              </CardContent>
            </Card>
            <Card className="border border-gray-200" data-testid="card-total-revenue">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-1">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                  <p className="text-3xl font-bold text-gray-900">${analytics?.totalRevenue || 0}</p>
                </div>
                <p className="text-sm text-gray-600">Total Revenue</p>
              </CardContent>
            </Card>
            <Card className="border border-gray-200" data-testid="card-avg-rating">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Star className="w-5 h-5 text-yellow-500" />
                  <p className="text-3xl font-bold text-gray-900">
                    {analytics?.averageRating ? Number(analytics.averageRating).toFixed(1) : "N/A"}
                  </p>
                </div>
                <p className="text-sm text-gray-600">Avg Rating</p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Card className="border border-gray-200">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{analytics?.totalBookings || 0}</p>
              <p className="text-sm text-gray-600">Total Bookings</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-yellow-600">{analytics?.pendingBookings || 0}</p>
              <p className="text-sm text-gray-600">Pending</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{analytics?.completedBookings || 0}</p>
              <p className="text-sm text-gray-600">Completed</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-500">{analytics?.draftServices || 0}</p>
              <p className="text-sm text-gray-600">Drafts</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-4">
            <TabsTrigger value="all" data-testid="tab-all-services">
              All ({services.length})
            </TabsTrigger>
            <TabsTrigger value="active" data-testid="tab-active-services">
              Active ({activeServices.length})
            </TabsTrigger>
            <TabsTrigger value="draft" data-testid="tab-draft-services">
              Draft ({draftServices.length})
            </TabsTrigger>
            <TabsTrigger value="paused" data-testid="tab-paused-services">
              Paused ({pausedServices.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6">
            <Card className="border border-gray-200">
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="text-lg">All Services</CardTitle>
                <Link href="/expert/services/templates">
                  <Button variant="outline" size="sm" data-testid="button-view-templates">
                    <Package className="w-4 h-4 mr-2" /> Use Template
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="space-y-4">
                {servicesLoading ? (
                  [...Array(3)].map((_, i) => (
                    <div key={i} className="p-4 rounded-lg border border-gray-200">
                      <div className="flex items-start gap-4">
                        <Skeleton className="w-12 h-12 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-5 w-48" />
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                      </div>
                    </div>
                  ))
                ) : services.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No services yet</h3>
                    <p className="text-gray-600 mb-4">Create your first service to start accepting bookings</p>
                    <Link href="/expert/services/new">
                      <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-create-first-service">
                        <Plus className="w-4 h-4 mr-2" /> Create Service
                      </Button>
                    </Link>
                  </div>
                ) : (
                  services.map(renderServiceCard)
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="active" className="mt-6">
            <Card className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg">Active Services</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeServices.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No active services</p>
                ) : (
                  activeServices.map(renderServiceCard)
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="draft" className="mt-6">
            <Card className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg">Draft Services</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {draftServices.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No draft services</p>
                ) : (
                  draftServices.map(renderServiceCard)
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="paused" className="mt-6">
            <Card className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg">Paused Services</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {pausedServices.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No paused services</p>
                ) : (
                  pausedServices.map(renderServiceCard)
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ExpertLayout>
  );
}
