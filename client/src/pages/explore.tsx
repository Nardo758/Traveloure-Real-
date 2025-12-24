import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, ArrowRight } from "lucide-react";
import { useTouristPlaceSearch, useHelpGuideTrips } from "@/hooks/use-tourist-places";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "wouter";

export default function Explore() {
  const [query, setQuery] = useState("");
  const { data: results, isLoading } = useTouristPlaceSearch(query);
  const { data: guideTrips } = useHelpGuideTrips();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-primary py-20 px-4 text-center">
        <h1 className="text-4xl font-display font-bold text-white mb-6">Explore the World</h1>
        <div className="max-w-2xl mx-auto relative">
          <Input 
            className="w-full h-14 pl-12 pr-4 rounded-full bg-white/10 border-white/20 text-white placeholder:text-white/60 focus:bg-white/20 transition-all"
            placeholder="Search for cities, countries, or places..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60 w-5 h-5" />
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : query && results ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {results.map((place) => (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                key={place.id}
                className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all"
              >
                <div className="h-48 bg-gray-200 relative">
                   {/* place image from db if array exists, else unsplash */}
                   <img 
                     src={(place.imageUrl as string[])?.[0] || `https://source.unsplash.com/800x600/?${encodeURIComponent(place.place)}`}
                     alt={place.place}
                     className="w-full h-full object-cover"
                   />
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-lg mb-1">{place.place}</h3>
                  <div className="flex items-center text-sm text-slate-500 mb-3">
                    <MapPin className="w-4 h-4 mr-1" />
                    {place.city}, {place.country}
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-2">{place.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="space-y-12">
            <section>
              <h2 className="text-2xl font-display font-bold text-slate-900 mb-6">Popular Packages</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {guideTrips?.map((trip) => (
                  <Link key={trip.id} href={`/trip-guide/${trip.id}`}>
                    <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer group">
                      <div className="h-56 overflow-hidden relative">
                         <img 
                           src={`https://source.unsplash.com/800x600/?${encodeURIComponent(trip.city)},travel`}
                           alt={trip.title}
                           className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                         />
                         <div className="absolute top-4 right-4 bg-white/90 px-3 py-1 rounded-full text-sm font-bold text-primary">
                           ${trip.price}
                         </div>
                      </div>
                      <div className="p-6">
                         <div className="text-xs font-bold text-accent uppercase tracking-wider mb-2">{trip.days} Days / {trip.nights} Nights</div>
                         <h3 className="font-bold text-xl mb-2 text-slate-900 group-hover:text-primary transition-colors">{trip.title}</h3>
                         <p className="text-slate-600 text-sm line-clamp-2 mb-4">{trip.description}</p>
                         <div className="flex items-center text-primary text-sm font-semibold">
                           View Details <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                         </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
