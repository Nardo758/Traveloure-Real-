import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";

import LandingPage from "@/pages/landing";
import LandingMockups from "@/pages/landing-mockups";
import Dashboard from "@/pages/dashboard";
import CreateTrip from "@/pages/create-trip";
import TripDetails from "@/pages/trip-details";
import MyTrips from "@/pages/my-trips";
import Profile from "@/pages/profile";
import Notifications from "@/pages/notifications";
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
import ExpertCustomServices from "@/pages/expert/custom-services";
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
import ProviderDashboard from "@/pages/provider/dashboard";
import ProviderBookings from "@/pages/provider/bookings";
import ProviderServices from "@/pages/provider/services";
import ProviderEarnings from "@/pages/provider/earnings";
import ProviderPerformance from "@/pages/provider/performance";
import ProviderCalendar from "@/pages/provider/calendar";
import ProviderProfile from "@/pages/provider/profile";
import ProviderSettings from "@/pages/provider/settings";
import ProviderResources from "@/pages/provider/resources";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminExperts from "@/pages/admin/experts";
import AdminProviders from "@/pages/admin/providers";
import AdminPlans from "@/pages/admin/plans";
import AdminRevenue from "@/pages/admin/revenue";
import AdminAnalytics from "@/pages/admin/analytics";
import AdminCategories from "@/pages/admin/categories";
import AdminSearch from "@/pages/admin/search";
import AdminNotifications from "@/pages/admin/notifications";
import AdminSystem from "@/pages/admin/system";
import AdminData from "@/pages/admin/data";
import AdminAffiliatePartners from "@/pages/admin/affiliate-partners";
import OptimizePage from "@/pages/optimize";
import ExpertsPage from "@/pages/experts";
import ServiceProvidersPage from "@/pages/service-providers";
import DiscoverPage from "@/pages/discover";
import PartnerWithUsPage from "@/pages/partner-with-us";
import ContactPage from "@/pages/contact";
import FAQPage from "@/pages/faq";
import FeaturesPage from "@/pages/features";
import ExperienceTemplatePage from "@/pages/experience-template";
import ArchitectureDiagram from "@/pages/architecture-diagram";
import ExperiencesPage from "@/pages/experiences";
import ExperienceDiscoveryPage from "@/pages/experience-discovery";
import DealsPage from "@/pages/deals";
import PaymentPage from "@/pages/payment";
import TravelExpertsPage from "@/pages/travel-experts";
import ServicesProviderPage from "@/pages/services-provider";
import ItineraryPage from "@/pages/itinerary";
import CreditsBillingPage from "@/pages/credits-billing";
import ExpertStatusPage from "@/pages/expert-status";
import ProviderStatusPage from "@/pages/provider-status";
import ExpertContractCategories from "@/pages/expert/contract-categories";
import ServiceWizard from "@/pages/expert/service-wizard";
import ServiceTemplates from "@/pages/expert/service-templates";
import CartPage from "@/pages/cart";
import MyBookingsPage from "@/pages/my-bookings";
import ContractViewPage from "@/pages/contract-view";
import ServiceDetailPage from "@/pages/service-detail";
import LayoutMock from "@/pages/layout-mock";
import ItineraryComparisonPage from "@/pages/itinerary-comparison";
import GlobalCalendarPage from "@/pages/global-calendar";
import SpontaneousPage from "@/pages/spontaneous";
import HiddenGemsPage from "@/pages/hidden-gems";
import TransportationBookingPage from "@/pages/transportation-booking";
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
      <Route path="/landing-mockups">
        <LandingMockups />
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
      <Route path="/architecture">
        <ArchitectureDiagram />
      </Route>
      <Route path="/optimize">
        <OptimizePage />
      </Route>
      <Route path="/experts">
        <Layout><ExpertsPage /></Layout>
      </Route>
      <Route path="/service-providers">
        <ServiceProvidersPage />
      </Route>
      
      {/* Consolidated Discover page (formerly discover, help-me-decide, explore, browse) */}
      <Route path="/discover">
        <DiscoverPage />
      </Route>
      
      <Route path="/services/:id">
        <ServiceDetailPage />
      </Route>
      <Route path="/cart">
        <CartPage />
      </Route>
      <Route path="/itinerary-comparison/:id">
        {() => <ProtectedRoute component={ItineraryComparisonPage} />}
      </Route>
      <Route path="/bookings">
        <MyBookingsPage />
      </Route>
      <Route path="/contracts/:id">
        <ContractViewPage />
      </Route>
      <Route path="/global-calendar">
        <Layout><GlobalCalendarPage /></Layout>
      </Route>
      <Route path="/transportation">
        <Layout><TransportationBookingPage /></Layout>
      </Route>
      <Route path="/partner-with-us">
        <Layout><PartnerWithUsPage /></Layout>
      </Route>
      <Route path="/contact">
        <Layout><ContactPage /></Layout>
      </Route>
      <Route path="/faq">
        <Layout><FAQPage /></Layout>
      </Route>
      <Route path="/features">
        <Layout><FeaturesPage /></Layout>
      </Route>
      <Route path="/experiences">
        <ExperiencesPage />
      </Route>
      <Route path="/experiences/:slug">
        <ExperienceTemplatePage />
      </Route>
      <Route path="/experiences/:slug/new">
        <ExperienceTemplatePage />
      </Route>
      <Route path="/discover-experiences">
        <ExperienceDiscoveryPage />
      </Route>
      <Route path="/deals">
        <Layout><DealsPage /></Layout>
      </Route>
      <Route path="/spontaneous">
        <SpontaneousPage />
      </Route>
      <Route path="/hidden-gems">
        <Layout><HiddenGemsPage /></Layout>
      </Route>
      <Route path="/payment">
        <PaymentPage />
      </Route>
      
      {/* Application pages for becoming an expert or provider */}
      <Route path="/become-expert">
        <TravelExpertsPage />
      </Route>
      <Route path="/become-provider">
        <ServicesProviderPage />
      </Route>
      
      <Route path="/layout-mock">
        <LayoutMock />
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
      
      {/* Consolidated Credits page */}
      <Route path="/credits">
        {() => <ProtectedRoute component={CreditsBillingPage} />}
      </Route>
      
      <Route path="/notifications">
        {() => <ProtectedRoute component={Notifications} />}
      </Route>
      <Route path="/expert-status">
        {() => <ProtectedRoute component={ExpertStatusPage} />}
      </Route>
      <Route path="/provider-status">
        {() => <ProtectedRoute component={ProviderStatusPage} />}
      </Route>
      <Route path="/itinerary/:id">
        <ItineraryPage />
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
      <Route path="/expert/services/new">
        {() => <ProtectedRoute component={ServiceWizard} />}
      </Route>
      <Route path="/expert/services/templates">
        {() => <ProtectedRoute component={ServiceTemplates} />}
      </Route>
      <Route path="/expert/custom-services">
        {() => <ProtectedRoute component={ExpertCustomServices} />}
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
      <Route path="/expert/contract-categories">
        {() => <ProtectedRoute component={ExpertContractCategories} />}
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

      {/* Service Provider Dashboard Routes (use ProviderLayout - no global Layout) */}
      <Route path="/provider/dashboard">
        {() => <ProtectedRoute component={ProviderDashboard} />}
      </Route>
      <Route path="/provider/bookings">
        {() => <ProtectedRoute component={ProviderBookings} />}
      </Route>
      <Route path="/provider/services">
        {() => <ProtectedRoute component={ProviderServices} />}
      </Route>
      <Route path="/provider/earnings">
        {() => <ProtectedRoute component={ProviderEarnings} />}
      </Route>
      <Route path="/provider/performance">
        {() => <ProtectedRoute component={ProviderPerformance} />}
      </Route>
      <Route path="/provider/calendar">
        {() => <ProtectedRoute component={ProviderCalendar} />}
      </Route>
      <Route path="/provider/profile">
        {() => <ProtectedRoute component={ProviderProfile} />}
      </Route>
      <Route path="/provider/settings">
        {() => <ProtectedRoute component={ProviderSettings} />}
      </Route>
      <Route path="/provider/resources">
        {() => <ProtectedRoute component={ProviderResources} />}
      </Route>

      {/* Admin Dashboard Routes (use AdminLayout - no global Layout) */}
      <Route path="/admin/dashboard">
        {() => <ProtectedRoute component={AdminDashboard} />}
      </Route>
      <Route path="/admin/users">
        {() => <ProtectedRoute component={AdminUsers} />}
      </Route>
      <Route path="/admin/experts">
        {() => <ProtectedRoute component={AdminExperts} />}
      </Route>
      <Route path="/admin/providers">
        {() => <ProtectedRoute component={AdminProviders} />}
      </Route>
      <Route path="/admin/plans">
        {() => <ProtectedRoute component={AdminPlans} />}
      </Route>
      <Route path="/admin/revenue">
        {() => <ProtectedRoute component={AdminRevenue} />}
      </Route>
      <Route path="/admin/analytics">
        {() => <ProtectedRoute component={AdminAnalytics} />}
      </Route>
      <Route path="/admin/categories">
        {() => <ProtectedRoute component={AdminCategories} />}
      </Route>
      <Route path="/admin/search">
        {() => <ProtectedRoute component={AdminSearch} />}
      </Route>
      <Route path="/admin/notifications">
        {() => <ProtectedRoute component={AdminNotifications} />}
      </Route>
      <Route path="/admin/system">
        {() => <ProtectedRoute component={AdminSystem} />}
      </Route>
      <Route path="/admin/data">
        {() => <ProtectedRoute component={AdminData} />}
      </Route>
      <Route path="/admin/affiliate-partners">
        {() => <ProtectedRoute component={AdminAffiliatePartners} />}
      </Route>

      {/* Redirects for consolidated/renamed pages */}
      <Route path="/create-trip">
        <Redirect to="/experiences" />
      </Route>
      <Route path="/help-me-decide">
        <Redirect to="/discover" />
      </Route>
      <Route path="/explore">
        <Redirect to="/discover" />
      </Route>
      <Route path="/browse">
        <Redirect to="/discover" />
      </Route>
      <Route path="/travel-experts">
        <Redirect to="/become-expert" />
      </Route>
      <Route path="/services-provider">
        <Redirect to="/become-provider" />
      </Route>
      <Route path="/credits-billing">
        <Redirect to="/credits" />
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
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
