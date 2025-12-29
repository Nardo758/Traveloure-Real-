import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Users, ArrowRight } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import type { Trip } from "@shared/schema";
import { motion } from "framer-motion";

interface TripCardProps {
  trip: Trip;
}

export function TripCard({ trip }: TripCardProps) {
  const startDate = new Date(trip.startDate);
  const endDate = new Date(trip.endDate);
  const duration = differenceInDays(endDate, startDate) + 1;
  const isUpcoming = startDate > new Date();
  const daysUntil = differenceInDays(startDate, new Date());

  return (
    <Link href={`/trip/${trip.id}`}>
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ duration: 0.2 }}
      >
        <Card 
          className="overflow-hidden cursor-pointer group border-border hover:shadow-xl transition-all duration-300"
          data-testid={`card-trip-${trip.id}`}
        >
          {/* Image */}
          <div className="relative h-48 overflow-hidden">
            <img 
              src={`https://source.unsplash.com/800x600/?${encodeURIComponent(trip.destination)},travel,landmark`}
              alt={trip.destination}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            
            {/* Status Badge */}
            <div className="absolute top-3 left-3">
              {isUpcoming && daysUntil <= 7 && daysUntil > 0 ? (
                <Badge className="bg-accent text-white border-0">
                  In {daysUntil} days
                </Badge>
              ) : (
                <Badge variant="secondary" className="backdrop-blur-sm bg-white/80 text-slate-700">
                  {trip.status === 'draft' ? 'Draft' : trip.status === 'planned' ? 'Planned' : 'Completed'}
                </Badge>
              )}
            </div>

            {/* Duration Badge */}
            <div className="absolute top-3 right-3">
              <Badge variant="secondary" className="backdrop-blur-sm bg-white/80 text-slate-700">
                {duration} {duration === 1 ? 'day' : 'days'}
              </Badge>
            </div>

            {/* Destination overlay */}
            <div className="absolute bottom-3 left-3 right-3">
              <div className="flex items-center gap-1 text-white/90 text-sm mb-1">
                <MapPin className="w-3 h-3" />
                {trip.destination}
              </div>
            </div>
          </div>

          <CardContent className="p-4">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2 group-hover:text-primary transition-colors line-clamp-1">
              {trip.title}
            </h3>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {format(startDate, "MMM d")}
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {trip.numberOfTravelers}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform text-primary opacity-0 group-hover:opacity-100" />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </Link>
  );
}
