import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";

import LandingPage from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import CreateTrip from "@/pages/create-trip";
import TripDetails from "@/pages/trip-details";
import Explore from "@/pages/explore";
import Chat from "@/pages/chat";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // Redirect to login if not authenticated
    window.location.href = "/api/login";
    return null;
  }

  return <Component {...rest} />;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={LandingPage} />
        
        {/* Protected Routes */}
        <Route path="/dashboard">
          {() => <ProtectedRoute component={Dashboard} />}
        </Route>
        <Route path="/create-trip">
          {() => <ProtectedRoute component={CreateTrip} />}
        </Route>
        <Route path="/trip/:id">
          {() => <ProtectedRoute component={TripDetails} />}
        </Route>
        <Route path="/chat">
          {() => <ProtectedRoute component={Chat} />}
        </Route>

        {/* Public Route */}
        <Route path="/explore" component={Explore} />

        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <Router />
    </QueryClientProvider>
  );
}

export default App;
