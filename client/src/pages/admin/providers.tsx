import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Search, 
  Building2, 
  Star, 
  MapPin, 
  CheckCircle,
  XCircle,
  Eye,
  Clock,
  DollarSign
} from "lucide-react";
import { useState } from "react";

const applications = [
  {
    id: 1,
    name: "Sunset Restaurant Group",
    email: "contact@sunsetrestaurants.com",
    type: "Restaurant",
    location: "Los Angeles, CA",
    services: ["Fine Dining", "Private Events", "Catering"],
    appliedAt: "2 days ago",
  },
  {
    id: 2,
    name: "Elite Photography Studios",
    email: "bookings@elitephoto.com",
    type: "Photography",
    location: "New York, NY",
    services: ["Wedding Photography", "Event Coverage", "Portrait Sessions"],
    appliedAt: "3 days ago",
  },
];

const activeProviders = [
  {
    id: 101,
    name: "Grand Estate Venue",
    email: "events@grandestate.com",
    type: "Venue",
    location: "Napa Valley, CA",
    rating: 4.9,
    reviews: 127,
    bookings: 342,
    revenue: "$125,450",
    status: "active",
  },
  {
    id: 102,
    name: "Azure Catering Co.",
    email: "info@azurecatering.com",
    type: "Catering",
    location: "San Francisco, CA",
    rating: 4.8,
    reviews: 89,
    bookings: 215,
    revenue: "$82,300",
    status: "active",
  },
  {
    id: 103,
    name: "Bloom Florists",
    email: "orders@bloomflorists.com",
    type: "Florist",
    location: "Miami, FL",
    rating: 4.7,
    reviews: 64,
    bookings: 178,
    revenue: "$45,600",
    status: "active",
  },
];

export default function AdminProviders() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"applications" | "active">("applications");

  return (
    <AdminLayout title="Provider Management">
      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-stat-total">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">89</p>
              <p className="text-sm text-gray-500">Total Providers</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-active">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">82</p>
              <p className="text-sm text-gray-500">Active</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-pending">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{applications.length}</p>
              <p className="text-sm text-gray-500">Pending Approval</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-revenue">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">$2.4M</p>
              <p className="text-sm text-gray-500">Total Revenue</p>
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
            <Clock className="w-4 h-4 mr-2" /> Pending Applications ({applications.length})
          </Button>
          <Button 
            variant={activeTab === "active" ? "default" : "outline"}
            onClick={() => setActiveTab("active")}
            data-testid="button-tab-active"
          >
            <Building2 className="w-4 h-4 mr-2" /> Active Providers
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
              {applications.map((app) => (
                <div 
                  key={app.id}
                  className="p-4 border border-gray-200 rounded-lg space-y-3"
                  data-testid={`card-application-${app.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-green-100 text-green-700">
                          {app.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-gray-900">{app.name}</h3>
                        <p className="text-sm text-gray-500">{app.email}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">{app.appliedAt}</Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Type</p>
                      <p className="font-medium">{app.type}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Location</p>
                      <p className="font-medium flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {app.location}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Services</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {app.services.slice(0, 2).map((s, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button size="sm" data-testid={`button-approve-${app.id}`}>
                      <CheckCircle className="w-4 h-4 mr-1" /> Approve
                    </Button>
                    <Button variant="outline" size="sm" data-testid={`button-reject-${app.id}`}>
                      <XCircle className="w-4 h-4 mr-1" /> Reject
                    </Button>
                    <Button variant="ghost" size="sm" data-testid={`button-view-${app.id}`}>
                      <Eye className="w-4 h-4 mr-1" /> View Details
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-green-600" />
                Active Providers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Provider</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Type</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Location</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Rating</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Bookings</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Revenue</th>
                      <th className="text-right py-3 px-2 text-sm font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeProviders.map((provider) => (
                      <tr key={provider.id} className="border-b border-gray-100 last:border-0" data-testid={`row-provider-${provider.id}`}>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-green-100 text-green-700 text-xs">
                                {provider.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-gray-900">{provider.name}</p>
                              <p className="text-xs text-gray-500">{provider.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <Badge variant="outline">{provider.type}</Badge>
                        </td>
                        <td className="py-3 px-2 text-gray-600">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {provider.location}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <span className="flex items-center gap-1">
                            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                            {provider.rating} ({provider.reviews})
                          </span>
                        </td>
                        <td className="py-3 px-2 text-gray-600">{provider.bookings}</td>
                        <td className="py-3 px-2 font-medium text-green-600">{provider.revenue}</td>
                        <td className="py-3 px-2">
                          <Button variant="ghost" size="sm" data-testid={`button-view-provider-${provider.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
