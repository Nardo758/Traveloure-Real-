import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  MapPin, 
  Star, 
  Phone, 
  Globe, 
  Heart,
  Plus,
  Filter
} from "lucide-react";

export default function EAVenues() {
  const savedVenues = [
    {
      id: 1,
      name: "Le Jules Verne",
      type: "Restaurant",
      location: "Paris, France",
      rating: 4.9,
      priceRange: "$$$$",
      usedBy: ["James Anderson"],
      lastUsed: "Today",
      favorite: true,
      notes: "Eiffel Tower location, requires 2-week advance booking",
    },
    {
      id: 2,
      name: "Park Hyatt Tokyo",
      type: "Hotel",
      location: "Tokyo, Japan",
      rating: 4.9,
      priceRange: "$$$$",
      usedBy: ["Sarah Chen"],
      favorite: true,
      notes: "Executive prefers Park Suite, floors 42+",
    },
    {
      id: 3,
      name: "The Capital Grille",
      type: "Restaurant",
      location: "Multiple Locations",
      rating: 4.7,
      priceRange: "$$$",
      usedBy: ["Michael Torres", "Lisa Parker"],
      lastUsed: "Last Week",
      notes: "Great for client dinners, private rooms available",
    },
    {
      id: 4,
      name: "Four Seasons Paris",
      type: "Hotel",
      location: "Paris, France",
      rating: 4.9,
      priceRange: "$$$$",
      usedBy: ["James Anderson"],
      favorite: true,
      notes: "Preferred for European trips",
    },
  ];

  const recentSearches = [
    "Fine dining Tokyo",
    "Conference rooms London",
    "Hotels Singapore CBD",
    "Private dining Chicago",
  ];

  return (
    <EALayout title="Venues">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-venues-title">
              Venues & Locations
            </h1>
            <p className="text-gray-600">Manage favorite venues and search new locations</p>
          </div>
          <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-add-venue">
            <Plus className="w-4 h-4 mr-2" /> Add Venue
          </Button>
        </div>

        {/* Search */}
        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input 
                  placeholder="Search venues, restaurants, hotels..." 
                  className="pl-9"
                  data-testid="input-search-venues"
                />
              </div>
              <Button variant="outline" data-testid="button-filter">
                <Filter className="w-4 h-4 mr-2" /> Filter
              </Button>
            </div>
            <div className="flex gap-2 mt-3">
              <span className="text-sm text-gray-500">Recent:</span>
              {recentSearches.map((search, idx) => (
                <Badge 
                  key={idx} 
                  variant="outline" 
                  className="cursor-pointer hover:bg-gray-100"
                  data-testid={`recent-search-${idx}`}
                >
                  {search}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border border-gray-200" data-testid="stat-saved">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">48</p>
              <p className="text-sm text-gray-600">Saved Venues</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-favorites">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-[#FF385C]">12</p>
              <p className="text-sm text-gray-600">Favorites</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-restaurants">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">28</p>
              <p className="text-sm text-gray-600">Restaurants</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-hotels">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">20</p>
              <p className="text-sm text-gray-600">Hotels</p>
            </CardContent>
          </Card>
        </div>

        {/* Saved Venues */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">Saved Venues</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {savedVenues.map((venue) => (
              <div 
                key={venue.id} 
                className="p-4 rounded-lg border border-gray-200 hover:bg-gray-50"
                data-testid={`venue-${venue.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-gray-900">{venue.name}</h3>
                      {venue.favorite && (
                        <Heart className="w-4 h-4 text-[#FF385C] fill-[#FF385C]" />
                      )}
                      <Badge variant="outline">{venue.type}</Badge>
                      <Badge variant="secondary">{venue.priceRange}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" /> {venue.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-500" /> {venue.rating}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-2">
                      Used by: {venue.usedBy.join(", ")}
                      {venue.lastUsed && ` • Last used: ${venue.lastUsed}`}
                    </p>
                    {venue.notes && (
                      <p className="text-sm text-gray-500 italic">Note: {venue.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" data-testid={`button-book-${venue.id}`}>
                      Book
                    </Button>
                    <Button size="sm" variant="outline" data-testid={`button-details-${venue.id}`}>
                      Details
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      data-testid={`button-favorite-${venue.id}`}
                    >
                      <Heart className={`w-4 h-4 ${venue.favorite ? "text-[#FF385C] fill-[#FF385C]" : "text-gray-400"}`} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </EALayout>
  );
}
