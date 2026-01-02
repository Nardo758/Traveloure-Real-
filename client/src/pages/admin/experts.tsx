import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Search, 
  UserCheck, 
  Star, 
  MapPin, 
  Calendar,
  CheckCircle,
  XCircle,
  Eye,
  Clock
} from "lucide-react";
import { useState } from "react";

const applications = [
  {
    id: 1,
    name: "Yuki Tanaka",
    email: "yuki@email.co.jp",
    type: "Local Expert",
    location: "Tokyo, Japan",
    specialties: ["Cultural Tours", "Food & Dining", "Hidden Gems"],
    experience: "5 years",
    appliedAt: "2 days ago",
    status: "pending",
  },
  {
    id: 2,
    name: "Marie Dubois",
    email: "marie@email.fr",
    type: "Wedding Planner",
    location: "Paris, France",
    specialties: ["Destination Weddings", "Luxury Events", "Venue Selection"],
    experience: "8 years",
    appliedAt: "3 days ago",
    status: "pending",
  },
  {
    id: 3,
    name: "Carlos Rivera",
    email: "carlos@email.co",
    type: "Travel Expert",
    location: "Bogotá, Colombia",
    specialties: ["Adventure Travel", "Eco-Tourism", "Local Culture"],
    experience: "4 years",
    appliedAt: "5 days ago",
    status: "pending",
  },
];

const activeExperts = [
  {
    id: 101,
    name: "Emily Rose",
    email: "emily@traveloure.com",
    type: "Wedding Planner",
    location: "New York, USA",
    rating: 4.9,
    reviews: 127,
    clients: 85,
    earnings: "$45,200",
    status: "active",
    verified: true,
  },
  {
    id: 102,
    name: "David Chen",
    email: "david@traveloure.com",
    type: "Corporate Events",
    location: "San Francisco, USA",
    rating: 4.8,
    reviews: 92,
    clients: 64,
    earnings: "$38,500",
    status: "active",
    verified: true,
  },
  {
    id: 103,
    name: "Maria Garcia",
    email: "maria@traveloure.com",
    type: "Local Expert",
    location: "Barcelona, Spain",
    rating: 4.7,
    reviews: 78,
    clients: 52,
    earnings: "$28,200",
    status: "active",
    verified: true,
  },
];

export default function AdminExperts() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"applications" | "active">("applications");

  return (
    <AdminLayout title="Expert Management">
      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-stat-total">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">156</p>
              <p className="text-sm text-gray-500">Total Experts</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-active">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">142</p>
              <p className="text-sm text-gray-500">Active</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-pending">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{applications.length}</p>
              <p className="text-sm text-gray-500">Pending Approval</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-avg-rating">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">4.8</p>
              <p className="text-sm text-gray-500">Avg Rating</p>
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
            <UserCheck className="w-4 h-4 mr-2" /> Active Experts
          </Button>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search experts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-experts"
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
                        <AvatarFallback className="bg-purple-100 text-purple-700">
                          {app.name.split(" ").map(n => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-gray-900">{app.name}</h3>
                        <p className="text-sm text-gray-500">{app.email}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">{app.appliedAt}</Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
                      <p className="text-gray-500">Experience</p>
                      <p className="font-medium">{app.experience}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Specialties</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {app.specialties.slice(0, 2).map((s, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                        ))}
                        {app.specialties.length > 2 && (
                          <Badge variant="outline" className="text-xs">+{app.specialties.length - 2}</Badge>
                        )}
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
                      <Eye className="w-4 h-4 mr-1" /> View Full Profile
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
                <UserCheck className="w-5 h-5 text-green-600" />
                Active Experts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Expert</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Type</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Location</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Rating</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Clients</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Earnings</th>
                      <th className="text-right py-3 px-2 text-sm font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeExperts.map((expert) => (
                      <tr key={expert.id} className="border-b border-gray-100 last:border-0" data-testid={`row-expert-${expert.id}`}>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-green-100 text-green-700 text-xs">
                                {expert.name.split(" ").map(n => n[0]).join("")}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="flex items-center gap-1">
                                <p className="font-medium text-gray-900">{expert.name}</p>
                                {expert.verified && <CheckCircle className="w-4 h-4 text-blue-500" />}
                              </div>
                              <p className="text-xs text-gray-500">{expert.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <Badge variant="outline">{expert.type}</Badge>
                        </td>
                        <td className="py-3 px-2 text-gray-600">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {expert.location}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <span className="flex items-center gap-1">
                            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                            {expert.rating} ({expert.reviews})
                          </span>
                        </td>
                        <td className="py-3 px-2 text-gray-600">{expert.clients}</td>
                        <td className="py-3 px-2 font-medium text-green-600">{expert.earnings}</td>
                        <td className="py-3 px-2">
                          <Button variant="ghost" size="sm" data-testid={`button-view-expert-${expert.id}`}>
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
