import { ProviderLayout } from "@/components/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Building, 
  MapPin, 
  Phone, 
  Mail, 
  Globe, 
  Star, 
  Users, 
  Calendar,
  Camera,
  Edit,
  CheckCircle
} from "lucide-react";

const businessInfo = {
  name: "Grand Estate Venue",
  type: "Wedding & Event Venue",
  description: "Grand Estate Venue is a premier wedding and event destination featuring 10 acres of manicured gardens, a stunning 5,000 sq ft ballroom, and breathtaking outdoor ceremony spaces. Our historic estate has been hosting unforgettable celebrations since 1920.",
  address: "1234 Estate Drive, Napa Valley, CA 94558",
  phone: "+1 (707) 555-0123",
  email: "events@grandestatevenue.com",
  website: "www.grandestatevenue.com",
  rating: 4.9,
  totalReviews: 127,
  totalEvents: 342,
  memberSince: "March 2022",
  verified: true,
};

const amenities = [
  "Indoor & Outdoor Spaces",
  "Full-Service Catering",
  "Open Bar Available",
  "On-site Parking (200+)",
  "Bridal Suite",
  "Groom's Quarters",
  "Audio/Visual Equipment",
  "Wheelchair Accessible",
];

const capacities = [
  { space: "Main Ballroom", seated: 250, standing: 400 },
  { space: "Garden Terrace", seated: 150, standing: 200 },
  { space: "Private Dining Room", seated: 30, standing: 50 },
  { space: "Ceremony Garden", seated: 200, standing: 300 },
];

const photos = [
  { id: 1, label: "Main Ballroom" },
  { id: 2, label: "Garden Terrace" },
  { id: 3, label: "Ceremony Space" },
  { id: 4, label: "Bridal Suite" },
  { id: 5, label: "Dining Setup" },
  { id: 6, label: "Night View" },
];

export default function ProviderProfile() {
  return (
    <ProviderLayout title="Business Profile">
      <div className="p-6 space-y-6">
        {/* Header Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
              <div className="relative">
                <Avatar className="w-24 h-24">
                  <AvatarFallback className="bg-[#FF385C]/10 text-[#FF385C] text-2xl">GE</AvatarFallback>
                </Avatar>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="absolute -bottom-2 -right-2 rounded-full w-8 h-8"
                  data-testid="button-change-logo"
                >
                  <Camera className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-bold text-gray-900" data-testid="text-business-name">
                    {businessInfo.name}
                  </h2>
                  {businessInfo.verified && (
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200" data-testid="badge-verified">
                      <CheckCircle className="w-3 h-3 mr-1" /> Verified
                    </Badge>
                  )}
                </div>
                <p className="text-gray-600">{businessInfo.type}</p>
                
                <div className="flex flex-wrap items-center gap-4 mt-3">
                  <div className="flex items-center gap-1">
                    <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                    <span className="font-semibold">{businessInfo.rating}</span>
                    <span className="text-gray-500">({businessInfo.totalReviews} reviews)</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>{businessInfo.totalEvents} events hosted</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-600">
                    <Users className="w-4 h-4" />
                    <span>Member since {businessInfo.memberSince}</span>
                  </div>
                </div>
              </div>
              <Button data-testid="button-edit-profile">
                <Edit className="w-4 h-4 mr-2" /> Edit Profile
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* About & Contact */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>About</CardTitle>
                <Button variant="ghost" size="sm" data-testid="button-edit-about">
                  <Edit className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700" data-testid="text-description">{businessInfo.description}</p>
              </CardContent>
            </Card>

            {/* Photos */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>Photos ({photos.length})</CardTitle>
                <Button variant="ghost" size="sm" data-testid="button-manage-photos">
                  <Camera className="w-4 h-4 mr-1" /> Manage
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {photos.map((photo) => (
                    <div 
                      key={photo.id}
                      className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center relative group"
                      data-testid={`photo-${photo.id}`}
                    >
                      <Camera className="w-8 h-8 text-gray-400" />
                      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent rounded-b-lg">
                        <p className="text-white text-sm">{photo.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Capacity */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>Venue Capacity</CardTitle>
                <Button variant="ghost" size="sm" data-testid="button-edit-capacity">
                  <Edit className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 text-sm font-medium text-gray-500">Space</th>
                        <th className="text-center py-2 text-sm font-medium text-gray-500">Seated</th>
                        <th className="text-center py-2 text-sm font-medium text-gray-500">Standing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {capacities.map((cap, index) => (
                        <tr key={index} className="border-b border-gray-100 last:border-0" data-testid={`row-capacity-${index}`}>
                          <td className="py-3 font-medium text-gray-900">{cap.space}</td>
                          <td className="py-3 text-center text-gray-600">{cap.seated}</td>
                          <td className="py-3 text-center text-gray-600">{cap.standing}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Contact Info */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>Contact Information</CardTitle>
                <Button variant="ghost" size="sm" data-testid="button-edit-contact">
                  <Edit className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                  <p className="text-gray-700">{businessInfo.address}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-gray-400" />
                  <p className="text-gray-700">{businessInfo.phone}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-gray-400" />
                  <p className="text-gray-700">{businessInfo.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-gray-400" />
                  <p className="text-gray-700">{businessInfo.website}</p>
                </div>
              </CardContent>
            </Card>

            {/* Amenities */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>Amenities</CardTitle>
                <Button variant="ghost" size="sm" data-testid="button-edit-amenities">
                  <Edit className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {amenities.map((amenity, index) => (
                    <Badge 
                      key={index} 
                      variant="outline" 
                      className="text-gray-700"
                      data-testid={`badge-amenity-${index}`}
                    >
                      {amenity}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ProviderLayout>
  );
}
