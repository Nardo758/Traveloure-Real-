import { useTrips } from "@/hooks/use-trips";
import { TripCard } from "@/components/trip-card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Plus, Loader2, Plane, Map, Calendar, Sparkles, Bot, Building2, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";

export default function Dashboard() {
  const { data: trips, isLoading, isError } = useTrips();
  const { user } = useAuth();

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
        <p className="text-gray-600 dark:text-gray-400 mt-2">Could not load your trips. Please try again later.</p>
      </div>
    );
  }

  const upcomingTrips = trips?.filter(t => new Date(t.startDate) > new Date()) || [];
  const pastTrips = trips?.filter(t => new Date(t.endDate) < new Date()) || [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header Section */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
                Welcome back, {user?.firstName || 'Traveler'}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Ready for your next adventure?
              </p>
            </div>
            <Link href="/create-trip">
              <Button size="lg" className="bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg shadow-sm hover:shadow-md transition-all" data-testid="button-new-trip">
                <Plus className="w-5 h-5 mr-2" />
                Plan New Trip
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-10">
          <Link href="/create-trip" data-testid="link-create-ai">
            <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-xl transition-all cursor-pointer group border border-gray-200 dark:border-gray-700" data-testid="card-action-create-ai">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Create Trip</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Plan your adventure</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/ai-assistant" data-testid="link-ai-assistant">
            <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-xl transition-all cursor-pointer group border border-gray-200 dark:border-gray-700" data-testid="card-action-ai-assistant">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Bot className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">AI Assistant</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Get AI-powered help</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/chat" data-testid="link-talk-experts">
            <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-xl transition-all cursor-pointer group border border-gray-200 dark:border-gray-700" data-testid="card-action-talk-experts">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center group-hover:bg-blue-200 dark:group-hover:bg-blue-800/40 transition-colors">
                  <Map className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Talk to Experts</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Local insider tips</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/vendors" data-testid="link-vendors">
            <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-xl transition-all cursor-pointer group border border-gray-200 dark:border-gray-700" data-testid="card-action-vendors">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center group-hover:bg-green-200 dark:group-hover:bg-green-800/40 transition-colors">
                  <Building2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Vendors</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Service providers</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/executive-assistant" data-testid="link-executive-assistant">
            <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-xl transition-all cursor-pointer group border border-gray-200 dark:border-gray-700" data-testid="card-action-executive-assistant">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center group-hover:bg-purple-200 dark:group-hover:bg-purple-800/40 transition-colors">
                  <BarChart3 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Overview</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Trip management</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/explore" data-testid="link-explore-deals">
            <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-xl transition-all cursor-pointer group border border-gray-200 dark:border-gray-700" data-testid="card-action-explore-deals">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center group-hover:bg-yellow-200 dark:group-hover:bg-yellow-800/40 transition-colors">
                  <Calendar className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Explore</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Amazing packages</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {trips && trips.length > 0 ? (
          <div className="space-y-10">
            {/* Upcoming Trips */}
            {upcomingTrips.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-6">
                  <Plane className="w-6 h-6 text-primary" />
                  <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">
                    Upcoming Trips
                  </h2>
                </div>
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                  {upcomingTrips.map((trip) => (
                    <TripCard key={trip.id} trip={trip} />
                  ))}
                </motion.div>
              </section>
            )}

            {/* All Trips */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <Map className="w-6 h-6 text-gray-500" />
                <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">
                  All Trips
                </h2>
              </div>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {trips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
              </motion.div>
            </section>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700"
          >
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Plane className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">No trips yet</h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto mb-8">
              You haven't planned any trips yet. Start your journey by creating your first itinerary!
            </p>
            <Link href="/create-trip">
              <Button size="lg" className="bg-primary hover:bg-primary-hover text-white font-semibold" data-testid="button-first-trip">
                <Plus className="w-5 h-5 mr-2" />
                Create Your First Trip
              </Button>
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
