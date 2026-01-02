import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Plus, 
  Edit, 
  Trash2, 
  DollarSign, 
  Clock, 
  Star,
  Plane,
  Heart,
  Gift,
  PartyPopper,
  Briefcase
} from "lucide-react";

export default function ExpertServices() {
  const services = [
    {
      id: 1,
      name: "Trip Planning Consultation",
      description: "One-on-one consultation to plan your perfect trip itinerary",
      price: 150,
      duration: "60 min",
      category: "travel",
      active: true,
      bookings: 24,
      rating: 4.9,
      icon: Plane,
    },
    {
      id: 2,
      name: "Proposal Planning Package",
      description: "Complete proposal planning including venue, photographer, and setup",
      price: 500,
      duration: "Full service",
      category: "proposal",
      active: true,
      bookings: 12,
      rating: 5.0,
      icon: Heart,
    },
    {
      id: 3,
      name: "Anniversary Dinner Arrangement",
      description: "Restaurant booking, menu customization, and special arrangements",
      price: 200,
      duration: "Per event",
      category: "anniversary",
      active: true,
      bookings: 18,
      rating: 4.8,
      icon: Gift,
    },
    {
      id: 4,
      name: "Birthday Celebration Planning",
      description: "Complete birthday party planning and coordination",
      price: 300,
      duration: "Per event",
      category: "birthday",
      active: false,
      bookings: 8,
      rating: 4.7,
      icon: PartyPopper,
    },
    {
      id: 5,
      name: "Corporate Retreat Coordination",
      description: "Team building events, venue booking, and activity planning",
      price: 1000,
      duration: "Per event",
      category: "corporate",
      active: true,
      bookings: 5,
      rating: 4.9,
      icon: Briefcase,
    },
  ];

  const stats = {
    totalServices: services.length,
    activeServices: services.filter(s => s.active).length,
    totalBookings: services.reduce((sum, s) => sum + s.bookings, 0),
    avgRating: (services.reduce((sum, s) => sum + s.rating, 0) / services.length).toFixed(1),
  };

  return (
    <ExpertLayout title="Services">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-services-title">My Services</h1>
            <p className="text-gray-600">Manage your service offerings and pricing</p>
          </div>
          <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-add-service">
            <Plus className="w-4 h-4 mr-2" /> Add Service
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border border-gray-200" data-testid="card-total-services">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">{stats.totalServices}</p>
              <p className="text-sm text-gray-600">Total Services</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="card-active-services">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{stats.activeServices}</p>
              <p className="text-sm text-gray-600">Active Services</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="card-total-bookings">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">{stats.totalBookings}</p>
              <p className="text-sm text-gray-600">Total Bookings</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="card-avg-rating">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-1">
                <Star className="w-5 h-5 text-yellow-500" />
                <p className="text-3xl font-bold text-gray-900">{stats.avgRating}</p>
              </div>
              <p className="text-sm text-gray-600">Avg Rating</p>
            </CardContent>
          </Card>
        </div>

        {/* Services List */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">Service Offerings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {services.map((service) => (
              <div 
                key={service.id} 
                className={`p-4 rounded-lg border ${service.active ? "border-gray-200" : "border-gray-100 bg-gray-50"}`}
                data-testid={`service-${service.id}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${service.active ? "bg-[#FF385C]/10" : "bg-gray-200"}`}>
                    <service.icon className={`w-6 h-6 ${service.active ? "text-[#FF385C]" : "text-gray-400"}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h3 className={`font-semibold ${service.active ? "text-gray-900" : "text-gray-500"}`}>
                          {service.name}
                        </h3>
                        {!service.active && (
                          <Badge variant="outline" className="text-gray-500">Inactive</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch 
                          checked={service.active} 
                          data-testid={`switch-service-${service.id}`}
                        />
                        <Button size="icon" variant="ghost" data-testid={`button-edit-service-${service.id}`}>
                          <Edit className="w-4 h-4 text-gray-500" />
                        </Button>
                        <Button size="icon" variant="ghost" data-testid={`button-delete-service-${service.id}`}>
                          <Trash2 className="w-4 h-4 text-gray-500" />
                        </Button>
                      </div>
                    </div>
                    <p className={`text-sm mt-1 ${service.active ? "text-gray-600" : "text-gray-400"}`}>
                      {service.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
                      <span className="flex items-center gap-1 font-medium text-gray-900">
                        <DollarSign className="w-4 h-4 text-green-600" />
                        ${service.price}
                      </span>
                      <span className="flex items-center gap-1 text-gray-600">
                        <Clock className="w-4 h-4" />
                        {service.duration}
                      </span>
                      <span className="flex items-center gap-1 text-gray-600">
                        <Star className="w-4 h-4 text-yellow-500" />
                        {service.rating} ({service.bookings} bookings)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </ExpertLayout>
  );
}
