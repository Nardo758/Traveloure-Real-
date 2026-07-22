import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useAuth } from "@/hooks/use-auth";

export default function ProviderProfile() {
  const { user } = useAuth();

  const businessInfo = {
    name: user?.businessName || `${user?.firstName} ${user?.lastName}`.trim() || "Service Provider",
    type: user?.businessType || "Service Provider",
    description: user?.bio || "Welcome to our business profile",
    address: user?.address || "",
    phone: user?.phone || "",
    email: user?.email || "",
    website: user?.website || "",
    // §13: no fabricated trust stats. Real rating/reviews/verification aren't wired
    // into this self-view yet, so show honest empties ("New" / 0 / no badge) rather
    // than invented numbers. memberSince is the only real signal available (createdAt).
    rating: null as number | null,
    totalReviews: 0,
    totalEvents: 0,
    memberSince: user?.createdAt
      ? new Date(user.createdAt as string | Date).toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : null,
    verified: false,
  };

  const amenities = user?.amenities || [
    "Service Available",
  ];

  const capacities = user?.capacities || [];

  const photos = user?.photos || [];

  return (
    <ProviderLayout title="Business Profile">
      <div className="p-6 space-y-6">
        {/* Header Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
              <div className="relative">
                <Avatar className="w-24 h-24">
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl">GE</AvatarFallback>
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
                  <h2 className="text-2xl font-bold text-console-darkest" data-testid="text-business-name">
                    {businessInfo.name}
                  </h2>
                  {businessInfo.verified && (
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200" data-testid="badge-verified">
                      <CheckCircle className="w-3 h-3 mr-1" /> Verified
                    </Badge>
                  )}
                </div>
                <p className="text-console-dark">{businessInfo.type}</p>
                
                <div className="flex flex-wrap items-center gap-4 mt-3">
                  <div className="flex items-center gap-1">
                    <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                    {businessInfo.rating !== null && businessInfo.totalReviews > 0 ? (
                      <>
                        <span className="font-semibold">{businessInfo.rating}</span>
                        <span className="text-console-mid">({businessInfo.totalReviews} reviews)</span>
                      </>
                    ) : (
                      <span className="font-semibold">New</span>
                    )}
                  </div>
                  {businessInfo.totalEvents > 0 && (
                    <div className="flex items-center gap-1 text-console-dark">
                      <Calendar className="w-4 h-4" />
                      <span>{businessInfo.totalEvents} events hosted</span>
                    </div>
                  )}
                  {businessInfo.memberSince && (
                    <div className="flex items-center gap-1 text-console-dark">
                      <Users className="w-4 h-4" />
                      <span>Member since {businessInfo.memberSince}</span>
                    </div>
                  )}
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
                <p className="text-console-dark" data-testid="text-description">{businessInfo.description}</p>
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
                      className="aspect-video bg-console-bg rounded-lg flex items-center justify-center relative group"
                      data-testid={`photo-${photo.id}`}
                    >
                      <Camera className="w-8 h-8 text-console-mid" />
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
                      <tr className="border-b border-console-light">
                        <th className="text-left py-2 text-sm font-medium text-console-mid">Space</th>
                        <th className="text-center py-2 text-sm font-medium text-console-mid">Seated</th>
                        <th className="text-center py-2 text-sm font-medium text-console-mid">Standing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {capacities.map((cap, index) => (
                        <tr key={index} className="border-b border-console-light last:border-0" data-testid={`row-capacity-${index}`}>
                          <td className="py-3 font-medium text-console-darkest">{cap.space}</td>
                          <td className="py-3 text-center text-console-dark">{cap.seated}</td>
                          <td className="py-3 text-center text-console-dark">{cap.standing}</td>
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
                  <MapPin className="w-5 h-5 text-console-mid mt-0.5" />
                  <p className="text-console-dark">{businessInfo.address}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-console-mid" />
                  <p className="text-console-dark">{businessInfo.phone}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-console-mid" />
                  <p className="text-console-dark">{businessInfo.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-console-mid" />
                  <p className="text-console-dark">{businessInfo.website}</p>
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
                      className="text-console-dark"
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
