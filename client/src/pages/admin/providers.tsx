import { AdminLayout } from "@/components/admin/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search,
  Building2,
  MapPin,
  CheckCircle,
  XCircle,
  Eye,
  Clock,
  Loader2,
  Calendar
} from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface ProviderApplication {
  id: string;
  userId: string;
  businessName: string;
  name?: string;
  email: string;
  mobile?: string;
  website?: string;
  country: string;
  address: string;
  businessType: string;
  serviceOffers?: string[];
  description?: string;
  status: string;
  createdAt: string;
}

export default function AdminProviders() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"applications" | "active">("applications");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location] = useLocation();

  useEffect(() => {
    if (location.endsWith("/pending")) {
      setActiveTab("applications");
    }
  }, [location]);

  const { data: applications = [], isLoading } = useQuery<ProviderApplication[]>({
    queryKey: ["/api/admin/provider-applications"],
  });

  const pendingApps = applications.filter(a => a.status === "pending");
  const approvedApps = applications.filter(a => a.status === "approved");

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, rejectionMessage }: { id: string; status: string; rejectionMessage?: string }) => {
      return apiRequest("PATCH", `/api/admin/provider-applications/${id}/status`, { status, rejectionMessage });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/provider-applications"] });
      toast({
        title: variables.status === "approved" ? "Provider Approved" : "Application Rejected",
        description: variables.status === "approved"
          ? "The provider has been approved and can now list services."
          : "The application has been rejected.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Action failed",
        description: error.message || "Failed to update application status.",
        variant: "destructive",
      });
    },
  });

  const filteredPending = pendingApps.filter(app => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return app.businessName.toLowerCase().includes(q) || app.email.toLowerCase().includes(q) || app.country.toLowerCase().includes(q);
  });

  const filteredApproved = approvedApps.filter(app => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return app.businessName.toLowerCase().includes(q) || app.email.toLowerCase().includes(q);
  });

  if (isLoading) {
    return (
      <AdminLayout title="Provider Management">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Provider Management">
      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-stat-total">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{applications.length}</p>
              <p className="text-sm text-gray-500">Total Applications</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-active">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{approvedApps.length}</p>
              <p className="text-sm text-gray-500">Approved</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-pending">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{pendingApps.length}</p>
              <p className="text-sm text-gray-500">Pending Approval</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-rejected">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{applications.filter(a => a.status === "rejected").length}</p>
              <p className="text-sm text-gray-500">Rejected</p>
            </CardContent>
          </Card>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2">
          <Button
            variant={activeTab === "applications" ? "default" : "outline"}
            onClick={() => setActiveTab("applications")}
            data-testid="button-tab-applications"
          >
            <Clock className="w-4 h-4 mr-2" /> Pending Applications ({pendingApps.length})
          </Button>
          <Button
            variant={activeTab === "active" ? "default" : "outline"}
            onClick={() => setActiveTab("active")}
            data-testid="button-tab-active"
          >
            <Building2 className="w-4 h-4 mr-2" /> Approved Providers ({approvedApps.length})
          </Button>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search providers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-providers"
              />
            </div>
          </CardContent>
        </Card>

        {activeTab === "applications" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                Pending Applications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {filteredPending.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No pending applications</p>
              ) : (
                filteredPending.map((app) => (
                  <div
                    key={app.id}
                    className="p-4 border border-gray-200 rounded-lg space-y-3"
                    data-testid={`card-application-${app.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-green-100 text-green-700">
                            {app.businessName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-semibold text-gray-900">{app.businessName}</h3>
                          <p className="text-sm text-gray-500">{app.email}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        <Calendar className="w-3 h-3 mr-1" />
                        {new Date(app.createdAt).toLocaleDateString()}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Business Type</p>
                        <p className="font-medium">{app.businessType}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Location</p>
                        <p className="font-medium flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {app.address}, {app.country}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Services</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(Array.isArray(app.serviceOffers) ? app.serviceOffers : []).slice(0, 2).map((s: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                          ))}
                          {(Array.isArray(app.serviceOffers) ? app.serviceOffers : []).length > 2 && (
                            <Badge variant="outline" className="text-xs">+{(app.serviceOffers as string[]).length - 2}</Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {app.description && (
                      <p className="text-sm text-gray-600 italic">"{app.description.slice(0, 150)}{app.description.length > 150 ? "..." : ""}"</p>
                    )}

                    {app.website && (
                      <p className="text-sm text-blue-600">{app.website}</p>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={() => updateStatusMutation.mutate({ id: app.id, status: "approved" })}
                        disabled={updateStatusMutation.isPending}
                        data-testid={`button-approve-${app.id}`}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" /> Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateStatusMutation.mutate({ id: app.id, status: "rejected", rejectionMessage: "Does not meet requirements at this time." })}
                        disabled={updateStatusMutation.isPending}
                        data-testid={`button-reject-${app.id}`}
                      >
                        <XCircle className="w-4 h-4 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-green-600" />
                Approved Providers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredApproved.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No approved providers yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Provider</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Type</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Location</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Approved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApproved.map((provider) => (
                        <tr key={provider.id} className="border-b border-gray-100 last:border-0" data-testid={`row-provider-${provider.id}`}>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-green-100 text-green-700 text-xs">
                                  {provider.businessName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-gray-900">{provider.businessName}</p>
                                <p className="text-xs text-gray-500">{provider.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <Badge variant="outline">{provider.businessType}</Badge>
                          </td>
                          <td className="py-3 px-2 text-gray-600">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {provider.country}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-sm text-gray-500">
                            {new Date(provider.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
