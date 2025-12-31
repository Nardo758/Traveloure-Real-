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
        <p className="text-muted-foreground mt-2">Could not load your trips. Please try again later.</p>
      </div>
    );
  }

  const upcomingTrips = trips?.filter(t => new Date(t.startDate) > new Date()) || [];
  const pastTrips = trips?.filter(t => new Date(t.endDate) < new Date()) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-pink-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-900 border-b border-border">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 dark:text-white">
                Welcome back, {user?.firstName || 'Traveler'}
              </h1>
              <p className="text-muted-foreground mt-2">
                Ready for your next adventure?
              </p>
            </div>
            <Link href="/create-trip">
              <Button size="lg" className="rounded-xl shadow-lg shadow-primary/20" data-testid="button-new-trip">
                <Plus className="w-5 h-5 mr-2" />
                Plan New Trip
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
          <Link href="/create-trip" data-testid="link-create-ai">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group" data-testid="card-action-create-ai">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">Create Trip</h3>
                  <p className="text-sm text-muted-foreground">Plan your adventure</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/ai-assistant" data-testid="link-ai-assistant">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group" data-testid="card-action-ai-assistant">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center group-hover:from-primary/20 group-hover:to-accent/20 transition-colors">
                  <Bot className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">AI Assistant</h3>
                  <p className="text-sm text-muted-foreground">Get AI-powered help</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/chat" data-testid="link-talk-experts">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group" data-testid="card-action-talk-experts">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                  <Map className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">Talk to Experts</h3>
                  <p className="text-sm text-muted-foreground">Local insider tips</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/vendors" data-testid="link-vendors">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group" data-testid="card-action-vendors">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center group-hover:bg-green-200 dark:group-hover:bg-green-900/50 transition-colors">
                  <Building2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">Vendors</h3>
                  <p className="text-sm text-muted-foreground">Service providers</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/executive-assistant" data-testid="link-executive-assistant">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group" data-testid="card-action-executive-assistant">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center group-hover:bg-purple-200 dark:group-hover:bg-purple-900/50 transition-colors">
                  <BarChart3 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">Overview</h3>
                  <p className="text-sm text-muted-foreground">Trip management</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/explore" data-testid="link-explore-deals">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group" data-testid="card-action-explore-deals">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
                  <Calendar className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">Explore</h3>
                  <p className="text-sm text-muted-foreground">Amazing packages</p>
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
                  <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
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
                <Map className="w-6 h-6 text-muted-foreground" />
                <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
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
            className="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-border"
          >
            <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
              <Plane className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">No trips yet</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-8">
              You haven't planned any trips yet. Start your journey by creating your first itinerary!
            </p>
            <Link href="/create-trip">
              <Button size="lg" data-testid="button-first-trip">
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
