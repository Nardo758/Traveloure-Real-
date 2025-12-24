import { useTrips } from "@/hooks/use-trips";
import { TripCard } from "@/components/trip-card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Plus, Loader2, Plane } from "lucide-react";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { data: trips, isLoading, isError } = useTrips();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h2 className="text-2xl font-bold text-destructive">Something went wrong</h2>
        <p className="text-slate-600 mt-2">Could not load your trips. Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-7xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900">My Trips</h1>
          <p className="text-slate-500 mt-2">Manage your upcoming adventures and past journeys.</p>
        </div>
        <Link href="/create-trip">
          <Button size="lg" className="rounded-xl shadow-lg shadow-primary/20">
            <Plus className="w-5 h-5 mr-2" />
            Plan New Trip
          </Button>
        </Link>
      </div>

      {trips && trips.length > 0 ? (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </motion.div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-200"
        >
          <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
            <Plane className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3">No trips yet</h2>
          <p className="text-slate-500 max-w-md mx-auto mb-8">
            You haven't planned any trips yet. Start your journey by creating your first itinerary!
          </p>
          <Link href="/create-trip">
            <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/5">
              Create First Trip
            </Button>
          </Link>
        </motion.div>
      )}
    </div>
  );
}
