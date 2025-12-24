import type { Trip } from "@shared/schema";
import { format } from "date-fns";
import { Calendar, MapPin, Users } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";

interface TripCardProps {
  trip: Trip;
}

export function TripCard({ trip }: TripCardProps) {
  // Using a deterministic way to get a nice image if unsplash isn't available
  // In a real app, this would come from the destination metadata or user upload
  const defaultImage = "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&q=80";

  return (
    <Link href={`/trip/${trip.id}`} className="block h-full group">
      <motion.div 
        whileHover={{ y: -5 }}
        className="h-full bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100"
      >
        <div className="relative h-48 overflow-hidden">
          {/* Use Unsplash source with destination query */}
          {/* trip card destination image */}
          <img 
            src={`https://source.unsplash.com/800x600/?${encodeURIComponent(trip.destination)},travel`}
            onError={(e) => {
              (e.target as HTMLImageElement).src = defaultImage;
            }}
            alt={trip.destination}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-4 left-4 text-white">
            <h3 className="text-xl font-bold font-display">{trip.title}</h3>
            <div className="flex items-center text-sm text-white/90 mt-1">
              <MapPin className="w-3 h-3 mr-1" />
              {trip.destination}
            </div>
          </div>
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wide text-slate-800 shadow-sm">
            {trip.status}
          </div>
        </div>
        
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <div className="flex items-center">
              <Calendar className="w-4 h-4 mr-2 text-primary" />
              <span>
                {format(new Date(trip.startDate), "MMM d")} - {format(new Date(trip.endDate), "MMM d, yyyy")}
              </span>
            </div>
          </div>
          
          <div className="flex items-center text-sm text-slate-600">
            <Users className="w-4 h-4 mr-2 text-primary" />
            <span>{trip.numberOfTravelers} Traveler{trip.numberOfTravelers !== 1 ? 's' : ''}</span>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
             <span className="text-xs font-medium text-slate-400">Created {format(new Date(trip.createdAt || new Date()), "MMM d")}</span>
             <span className="text-sm font-semibold text-primary group-hover:underline">View Itinerary &rarr;</span>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
