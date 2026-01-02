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
import MyTrips from "@/pages/my-trips";
import Profile from "@/pages/profile";
import Credits from "@/pages/credits";
import Notifications from "@/pages/notifications";
import Explore from "@/pages/explore";
import Chat from "@/pages/chat";
import AIAssistant from "@/pages/ai-assistant";
import Vendors from "@/pages/vendors";
import ExecutiveAssistant from "@/pages/executive-assistant";
import HowItWorks from "@/pages/how-it-works";
import Pricing from "@/pages/pricing";
import About from "@/pages/about";
import NotFound from "@/pages/not-found";
import ExpertDashboard from "@/pages/expert/dashboard";
import ExpertClients from "@/pages/expert/clients";
import ExpertEarnings from "@/pages/expert/earnings";
import ExpertProfile from "@/pages/expert/profile";
import ExpertAIAssistant from "@/pages/expert/ai-assistant";
import ExpertMessages from "@/pages/expert/messages";
import ExpertBookings from "@/pages/expert/bookings";
import ExpertServices from "@/pages/expert/services";
import ExpertPerformance from "@/pages/expert/performance";
import EADashboard from "@/pages/ea/dashboard";
import EAExecutives from "@/pages/ea/executives";
import EACalendar from "@/pages/ea/calendar";
import EAEvents from "@/pages/ea/events";
import EACommunications from "@/pages/ea/communications";
import EAAIAssistant from "@/pages/ea/ai-assistant";
import EATravel from "@/pages/ea/travel";
import EAVenues from "@/pages/ea/venues";
import EAGifts from "@/pages/ea/gifts";
import EAReports from "@/pages/ea/reports";
import EAProfile from "@/pages/ea/profile";
import EASettings from "@/pages/ea/settings";
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
    window.location.href = "/api/login";
    return null;
  }

  return <Component {...rest} />;
}

function Router() {
  return (
    <Switch>
      {/* Public Routes with Layout */}
      <Route path="/">
        <Layout><LandingPage /></Layout>
      </Route>
      <Route path="/how-it-works">
        <Layout><HowItWorks /></Layout>
      </Route>
      <Route path="/pricing">
        <Layout><Pricing /></Layout>
      </Route>
      <Route path="/about">
        <Layout><About /></Layout>
      </Route>
      <Route path="/explore">
        <Layout><Explore /></Layout>
      </Route>

      {/* Protected Dashboard Routes (use DashboardLayout - no global Layout) */}
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/my-trips">
        {() => <ProtectedRoute component={MyTrips} />}
      </Route>
      <Route path="/profile">
        {() => <ProtectedRoute component={Profile} />}
      </Route>
      <Route path="/credits">
        {() => <ProtectedRoute component={Credits} />}
      </Route>
      <Route path="/notifications">
        {() => <ProtectedRoute component={Notifications} />}
      </Route>

      {/* Expert Dashboard Routes (use ExpertLayout - no global Layout) */}
      <Route path="/expert/dashboard">
        {() => <ProtectedRoute component={ExpertDashboard} />}
      </Route>
      <Route path="/expert/ai-assistant">
        {() => <ProtectedRoute component={ExpertAIAssistant} />}
      </Route>
      <Route path="/expert/messages">
        {() => <ProtectedRoute component={ExpertMessages} />}
      </Route>
      <Route path="/expert/clients">
        {() => <ProtectedRoute component={ExpertClients} />}
      </Route>
      <Route path="/expert/bookings">
        {() => <ProtectedRoute component={ExpertBookings} />}
      </Route>
      <Route path="/expert/services">
        {() => <ProtectedRoute component={ExpertServices} />}
      </Route>
      <Route path="/expert/earnings">
        {() => <ProtectedRoute component={ExpertEarnings} />}
      </Route>
      <Route path="/expert/performance">
        {() => <ProtectedRoute component={ExpertPerformance} />}
      </Route>
      <Route path="/expert/profile">
        {() => <ProtectedRoute component={ExpertProfile} />}
      </Route>

      {/* Executive Assistant Dashboard Routes (use EALayout - no global Layout) */}
      <Route path="/ea/dashboard">
        {() => <ProtectedRoute component={EADashboard} />}
      </Route>
      <Route path="/ea/executives">
        {() => <ProtectedRoute component={EAExecutives} />}
      </Route>
      <Route path="/ea/calendar">
        {() => <ProtectedRoute component={EACalendar} />}
      </Route>
      <Route path="/ea/events">
        {() => <ProtectedRoute component={EAEvents} />}
      </Route>
      <Route path="/ea/communications">
        {() => <ProtectedRoute component={EACommunications} />}
      </Route>
      <Route path="/ea/ai-assistant">
        {() => <ProtectedRoute component={EAAIAssistant} />}
      </Route>
      <Route path="/ea/travel">
        {() => <ProtectedRoute component={EATravel} />}
      </Route>
      <Route path="/ea/venues">
        {() => <ProtectedRoute component={EAVenues} />}
      </Route>
      <Route path="/ea/gifts">
        {() => <ProtectedRoute component={EAGifts} />}
      </Route>
      <Route path="/ea/reports">
        {() => <ProtectedRoute component={EAReports} />}
      </Route>
      <Route path="/ea/profile">
        {() => <ProtectedRoute component={EAProfile} />}
      </Route>
      <Route path="/ea/settings">
        {() => <ProtectedRoute component={EASettings} />}
      </Route>

      {/* Protected Routes with Layout */}
      <Route path="/create-trip">
        {() => <Layout><ProtectedRoute component={CreateTrip} /></Layout>}
      </Route>
      <Route path="/trip/:id">
        {() => <Layout><ProtectedRoute component={TripDetails} /></Layout>}
      </Route>
      <Route path="/chat">
        {() => <Layout><ProtectedRoute component={Chat} /></Layout>}
      </Route>
      <Route path="/ai-assistant">
        {() => <Layout><ProtectedRoute component={AIAssistant} /></Layout>}
      </Route>
      <Route path="/vendors">
        {() => <Layout><ProtectedRoute component={Vendors} /></Layout>}
      </Route>
      <Route path="/executive-assistant">
        {() => <Layout><ProtectedRoute component={ExecutiveAssistant} /></Layout>}
      </Route>

      {/* 404 */}
      <Route>
        <Layout><NotFound /></Layout>
      </Route>
    </Switch>
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
