import { ProviderLayout } from "@/components/provider-layout";
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
  Users,
  Image as ImageIcon
} from "lucide-react";
import { useState } from "react";

interface Service {
  id: number;
  name: string;
  description: string;
  category: string;
  basePrice: string;
  priceUnit: string;
  minGuests?: number;
  maxGuests?: number;
  duration?: string;
  active: boolean;
  featured: boolean;
}

const initialServices: Service[] = [
  {
    id: 1,
    name: "Venue Rental - Main Hall",
    description: "Our beautiful 5,000 sq ft main hall with elegant chandeliers and floor-to-ceiling windows",
    category: "Venue",
    basePrice: "$3,000",
    priceUnit: "per event",
    maxGuests: 250,
    duration: "Up to 8 hours",
    active: true,
    featured: true,
  },
  {
    id: 2,
    name: "Venue Rental - Garden Terrace",
    description: "Outdoor garden space with beautiful landscaping, perfect for ceremonies",
    category: "Venue",
    basePrice: "$1,500",
    priceUnit: "per event",
    maxGuests: 150,
    duration: "Up to 6 hours",
    active: true,
    featured: false,
  },
  {
    id: 3,
    name: "Full Catering Service",
    description: "Complete catering with appetizers, main course, and dessert",
    category: "Catering",
    basePrice: "$85",
    priceUnit: "per person",
    minGuests: 50,
    active: true,
    featured: true,
  },
  {
    id: 4,
    name: "Open Bar Package",
    description: "Premium open bar with craft cocktails, wine, and beer selection",
    category: "Beverage",
    basePrice: "$45",
    priceUnit: "per person",
    minGuests: 50,
    duration: "Up to 5 hours",
    active: true,
    featured: false,
  },
  {
    id: 5,
    name: "Table & Chair Rental",
    description: "Elegant tables and chairs with white linens included",
    category: "Equipment",
    basePrice: "$15",
    priceUnit: "per person",
    active: true,
    featured: false,
  },
  {
    id: 6,
    name: "Floral Arrangements",
    description: "Custom floral centerpieces and venue decoration",
    category: "Decoration",
    basePrice: "$500",
    priceUnit: "starting",
    active: false,
    featured: false,
  },
];

const categories = ["All", "Venue", "Catering", "Beverage", "Equipment", "Decoration"];

export default function ProviderServices() {
  const [services, setServices] = useState(initialServices);
  const [selectedCategory, setSelectedCategory] = useState("All");

  const filteredServices = selectedCategory === "All" 
    ? services 
    : services.filter(s => s.category === selectedCategory);

  const toggleActive = (id: number) => {
    setServices(services.map(s => s.id === id ? { ...s, active: !s.active } : s));
  };

  const activeCount = services.filter(s => s.active).length;

  return (
    <ProviderLayout title="Services">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900" data-testid="text-services-title">
              Your Services
            </h2>
            <p className="text-gray-600">{activeCount} of {services.length} services active</p>
          </div>
          <Button data-testid="button-add-service">
            <Plus className="w-4 h-4 mr-2" /> Add New Service
          </Button>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 flex-wrap">
          {categories.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(category)}
              data-testid={`button-category-${category.toLowerCase()}`}
            >
              {category}
            </Button>
          ))}
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredServices.map((service) => (
            <Card 
              key={service.id} 
              className={!service.active ? "opacity-60" : ""}
              data-testid={`card-service-${service.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{service.name}</h3>
                      {service.featured && (
                        <Badge className="bg-[#FF385C] text-white" data-testid={`badge-featured-${service.id}`}>
                          Featured
                        </Badge>
                      )}
                      <Badge variant="outline">{service.category}</Badge>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{service.description}</p>
                    
                    <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
                      <span className="flex items-center gap-1 font-semibold text-green-600">
                        <DollarSign className="w-4 h-4" /> {service.basePrice} {service.priceUnit}
                      </span>
                      {service.maxGuests && (
                        <span className="flex items-center gap-1 text-gray-500">
                          <Users className="w-4 h-4" /> Up to {service.maxGuests} guests
                        </span>
                      )}
                      {service.minGuests && (
                        <span className="flex items-center gap-1 text-gray-500">
                          <Users className="w-4 h-4" /> Min {service.minGuests} guests
                        </span>
                      )}
                      {service.duration && (
                        <span className="flex items-center gap-1 text-gray-500">
                          <Clock className="w-4 h-4" /> {service.duration}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    <Switch
                      checked={service.active}
                      onCheckedChange={() => toggleActive(service.id)}
                      data-testid={`switch-active-${service.id}`}
                    />
                    <span className="text-xs text-gray-500">
                      {service.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                  <Button variant="outline" size="sm" data-testid={`button-edit-${service.id}`}>
                    <Edit className="w-4 h-4 mr-1" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" data-testid={`button-images-${service.id}`}>
                    <ImageIcon className="w-4 h-4 mr-1" /> Images
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-600" data-testid={`button-delete-${service.id}`}>
                    <Trash2 className="w-4 h-4 mr-1" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredServices.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-500">No services found in this category.</p>
              <Button className="mt-4" data-testid="button-add-first-service">
                <Plus className="w-4 h-4 mr-2" /> Add Your First Service
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </ProviderLayout>
  );
}
