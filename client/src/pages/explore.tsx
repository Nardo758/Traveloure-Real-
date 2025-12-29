import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, ArrowRight, Star, Clock, Users } from "lucide-react";
import { useTouristPlaceSearch, useHelpGuideTrips } from "@/hooks/use-tourist-places";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const featuredDestinations = [
  {
    id: 1,
    name: "Tokyo, Japan",
    image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=800",
    description: "Experience the perfect blend of ancient traditions and cutting-edge technology",
    rating: 4.9,
    trips: 234
  },
  {
    id: 2,
    name: "Paris, France",
    image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=800",
    description: "The city of love, art, and unforgettable culinary experiences",
    rating: 4.8,
    trips: 456
  },
  {
    id: 3,
    name: "Bali, Indonesia",
    image: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?q=80&w=800",
    description: "Tropical paradise with stunning temples, beaches, and rice terraces",
    rating: 4.7,
    trips: 189
  },
  {
    id: 4,
    name: "New York, USA",
    image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?q=80&w=800",
    description: "The city that never sleeps - iconic landmarks and endless entertainment",
    rating: 4.8,
    trips: 567
  },
];

const popularPackages = [
  {
    id: 1,
    title: "Cherry Blossom Japan",
    city: "Tokyo",
    days: 7,
    nights: 6,
    price: 2499,
    description: "Experience Japan during the magical cherry blossom season",
    image: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=800"
  },
  {
    id: 2,
    title: "Romantic Paris Getaway",
    city: "Paris",
    days: 5,
    nights: 4,
    price: 1899,
    description: "A romantic escape through the city of lights",
    image: "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?q=80&w=800"
  },
  {
    id: 3,
    title: "Bali Wellness Retreat",
    city: "Bali",
    days: 8,
    nights: 7,
    price: 1699,
    description: "Rejuvenate your mind and body in tropical paradise",
    image: "https://images.unsplash.com/photo-1573843981267-be1999ff37cd?q=80&w=800"
  },
];

export default function Explore() {
  const [query, setQuery] = useState("");
  const { data: results, isLoading } = useTouristPlaceSearch(query);
  const { data: guideTrips } = useHelpGuideTrips();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Search Section */}
      <div className="relative py-20 px-4 bg-gradient-to-br from-primary via-primary/90 to-accent">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=2000')] bg-cover bg-center opacity-10" />
        <div className="container mx-auto relative z-10">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">
              Explore the World
            </h1>
            <p className="text-white/80 text-lg max-w-2xl mx-auto">
              Discover amazing destinations, curated packages, and hidden gems around the globe
            </p>
          </div>
          <div className="max-w-2xl mx-auto relative">
            <Input 
              className="w-full h-14 pl-12 pr-4 rounded-full bg-white/95 backdrop-blur border-0 text-slate-900 placeholder:text-slate-400 shadow-xl focus-visible:ring-4 focus-visible:ring-white/30"
              placeholder="Search for cities, countries, or places..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="input-search"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : query && results && results.length > 0 ? (
          <>
            <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white mb-6">
              Search Results for "{query}"
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.map((place) => (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key={place.id}
                >
                  <Card className="overflow-hidden hover:shadow-xl transition-all group cursor-pointer">
                    <div className="h-48 relative overflow-hidden">
                      <img 
                        src={(place.imageUrl as string[])?.[0] || `https://source.unsplash.com/800x600/?${encodeURIComponent(place.place)}`}
                        alt={place.place}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    </div>
                    <CardContent className="p-5">
                      <h3 className="font-bold text-lg mb-1 text-slate-900 dark:text-white">{place.place}</h3>
                      <div className="flex items-center text-sm text-muted-foreground mb-3">
                        <MapPin className="w-4 h-4 mr-1" />
                        {place.city}, {place.country}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{place.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </>
        ) : query ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No results found for "{query}"</p>
          </div>
        ) : (
          <div className="space-y-16">
            {/* Featured Destinations */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
                  Featured Destinations
                </h2>
                <Button variant="ghost" className="text-primary" data-testid="button-view-all-destinations">
                  View All <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {featuredDestinations.map((dest, index) => (
                  <motion.div
                    key={dest.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className="overflow-hidden hover:shadow-xl transition-all group cursor-pointer h-full">
                      <div className="h-40 relative overflow-hidden">
                        <img 
                          src={dest.image}
                          alt={dest.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-3 left-3 right-3">
                          <h3 className="font-bold text-white">{dest.name}</h3>
                        </div>
                      </div>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{dest.description}</p>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-1 text-amber-500">
                            <Star className="w-4 h-4 fill-current" />
                            {dest.rating}
                          </div>
                          <span className="text-muted-foreground">{dest.trips} trips</span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </section>

            {/* Popular Packages */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
                  Popular Packages
                </h2>
                <Button variant="ghost" className="text-primary" data-testid="button-view-all-packages">
                  View All <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(guideTrips || popularPackages).map((trip, index) => (
                  <motion.div
                    key={trip.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className="overflow-hidden hover:shadow-xl transition-all cursor-pointer group h-full">
                      <div className="h-56 overflow-hidden relative">
                        <img 
                          src={'image' in trip ? trip.image : `https://source.unsplash.com/800x600/?${encodeURIComponent(trip.city)},travel`}
                          alt={trip.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <Badge className="absolute top-4 right-4 bg-white/90 text-primary border-0 font-bold">
                          ${trip.price}
                        </Badge>
                        <div className="absolute bottom-4 left-4 right-4">
                          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
                            <Clock className="w-4 h-4" />
                            {trip.days} Days / {trip.nights} Nights
                          </div>
                        </div>
                      </div>
                      <CardContent className="p-5">
                        <h3 className="font-bold text-xl mb-2 text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                          {trip.title}
                        </h3>
                        <p className="text-muted-foreground text-sm line-clamp-2 mb-4">{trip.description}</p>
                        <div className="flex items-center text-primary text-sm font-semibold">
                          View Details <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </section>

            {/* CTA Section */}
            <section className="bg-muted/50 rounded-2xl p-8 md:p-12 text-center">
              <h2 className="text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white mb-4">
                Not sure where to go?
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
                Let our AI help you discover the perfect destination based on your preferences, budget, and travel style.
              </p>
              <Link href="/create-trip">
                <Button size="lg" data-testid="button-plan-trip">
                  Plan My Trip <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
