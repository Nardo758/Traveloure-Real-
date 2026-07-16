import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { DashboardLayout } from "@/components/dashboard-layout";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { EALayout } from "@/components/ea-layout";
import { useAuth } from "@/hooks/use-auth";
import { TripQueueProvider } from "@/contexts/TripQueueContext";
import { SignInModalProvider } from "@/contexts/SignInModalContext";
import { GuestTripProvider } from "@/contexts/GuestTripContext";
import { ActiveConsoleProvider } from "@/contexts/ActiveConsoleContext";
import { ConsoleAwareLayout } from "@/components/console-aware-layout";
import { useEffect, useRef } from "react";

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
import EarnPage from "@/pages/earn";
import NotFound from "@/pages/not-found";
import { SignupPage } from "@/pages/Signup";
import BookingConfirmationPage from "@/pages/BookingConfirmationPage";
import ExpertDashboard from "@/pages/expert/dashboard";
import ExpertClients from "@/pages/expert/clients";
import ExpertEarnings from "@/pages/expert/earnings";
import ExpertProfile from "@/pages/expert/profile";
import ExpertAIAssistant from "@/pages/expert/ai-assistant";
import ExpertBookings from "@/pages/expert/bookings";
import ExpertServices from "@/pages/expert/services";
import ExpertAssignedTrips from "@/pages/expert/assigned-trips";
import EADashboard from "@/pages/ea/dashboard";
import EAExecutives from "@/pages/ea/executives";
import EAClients from "@/pages/ea/clients";
import EACalendar from "@/pages/ea/calendar";
import EAEvents from "@/pages/ea/events";
import EACommunications from "@/pages/ea/communications";
import EAAIAssistant from "@/pages/ea/ai-assistant";
import EATravel from "@/pages/ea/travel";
import EATrips from "@/pages/ea/trips";
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
import ProviderAnalytics from "@/pages/provider/analytics";
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
import AdminExpertTemplates from "@/pages/admin/expert-templates";
import AdminTemplateApprovals from "@/pages/admin/template-approvals";
import AdminSearch from "@/pages/admin/search";
import AdminNotifications from "@/pages/admin/notifications";
import AdminSystem from "@/pages/admin/system";
import AdminData from "@/pages/admin/data";
import AdminAffiliatePartners from "@/pages/admin/affiliate-partners";
import AdminContentTracking from "@/pages/admin/content-tracking";
import AdminContentMapping from "@/pages/admin/content-mapping";
import AdminServices from "@/pages/admin/services";
import AdminAICosts from "@/pages/admin/ai-costs";
import AdminTourismAnalytics from "@/pages/admin/tourism-analytics";
import AdminPayouts from "@/pages/admin/payouts";
import AdminNeighborhoodBackfill from "@/pages/admin/neighborhood-backfill";
import AdminGemPhotoBackfill from "@/pages/admin/gem-photo-backfill";
import AdminReviewModeration from "@/pages/admin/review-moderation";
import AdminDestinationEvents from "@/pages/admin/destination-events";
import AdminReconciliation from "@/pages/admin/reconciliation";
import ConciergePage from "@/pages/concierge";
import ResetPasswordPage from "@/pages/reset-password";
import VerifyEmailPage from "@/pages/verify-email";
import ExpertsPage from "@/pages/experts";
import ServiceProvidersPage from "@/pages/service-providers";
import DiscoverPage from "@/pages/discover";
import DiscoverLocationPage from "@/pages/discover-location";
import ContactPage from "@/pages/contact";
import FAQPage from "@/pages/faq";
import FeaturesPage from "@/pages/features";
import ExperienceTemplatePage from "@/pages/experience-template";
import ArchitectureDiagram from "@/pages/architecture-diagram";
import ExperiencesPage from "@/pages/experiences";
import DealsPage from "@/pages/deals";
import PaymentPage from "@/pages/payment";
import TravelExpertsPage from "@/pages/travel-experts";
import ServicesProviderPage from "@/pages/services-provider";
import ItineraryPage from "@/pages/itinerary";
import CreditsBillingPage from "@/pages/credits-billing";
import ExpertStatusPage from "@/pages/expert-status";
import ProviderStatusPage from "@/pages/provider-status";
import ExpertContractCategories from "@/pages/expert/contract-categories";
import ExpertBookingPartners from "@/pages/expert/booking-partners";
import AdminFeeConfig from "@/pages/admin/fee-config";
import AdminFeeBands from "@/pages/admin/fee-bands";
import AdminOfferingTypes from "@/pages/admin/offering-types";
import AdminCategoryFees from "@/pages/admin/category-fees";
import AdminNeighborhoods from "@/pages/admin/neighborhoods";
import AdminEventPackages from "@/pages/admin/event-packages";
import AdminPlatformProviders from "@/pages/admin/platform-providers";
import AdminRoutingQueue from "@/pages/admin/routing-queue";
import AdminCrossSellAnalytics from "@/pages/admin/cross-sell-analytics";
import AdminQAChecklist from "@/pages/admin/qa-checklist";
import ExpertAnalytics from "@/pages/expert/analytics";
import ExpertContentStudio from "@/pages/expert/content-studio";
import ExpertClientDetail from "@/pages/expert/client-detail";
import ExpertSettings from "@/pages/expert/settings";
import ExpertVerification from "@/pages/expert/verification";
import ExpertServiceForm from "@/pages/expert/service-form";
import ProviderServiceForm from "@/pages/provider/service-form";
import ServiceWizard from "@/pages/expert/service-wizard";
import ExpertWorkspace from "@/pages/expert/workspace";
import CartPage from "@/pages/cart";
import MyBookingsPage from "@/pages/my-bookings";
import ContractViewPage from "@/pages/contract-view";
import ServiceDetailPage from "@/pages/service-detail";
import LayoutMock from "@/pages/layout-mock";
import ItineraryComparisonPage from "@/pages/itinerary-comparison";
import GlobalCalendarPage from "@/pages/global-calendar";
import HiddenGemsPage from "@/pages/hidden-gems";
import TransportationBookingPage from "@/pages/transportation-booking";
import PrivacyPolicyPage from "@/pages/privacy";
import TermsOfServicePage from "@/pages/terms";
import AcceptTermsPage from "@/pages/accept-terms";
import CareersPage from "@/pages/careers";
import BlogPage from "@/pages/blog";
import PressPage from "@/pages/press";
import HelpPage from "@/pages/help";
import ExpertDetailPage from "@/pages/expert-detail";
import ExpertTemplateDetail from "@/pages/expert-template-detail";
import QuickStartItinerary from "@/pages/quick-start-itinerary";
import BookingDemo from "@/pages/booking-demo";
import MyItineraryPage from "@/pages/my-itinerary";
import ItineraryViewPage from "@/pages/itinerary-view";
import SharedTripPage from "@/pages/shared-trip";
import VisaHelpPage from "@/pages/visa-help";
import { Loader2 } from "lucide-react";

import { getRoleHomePath, userHasRequiredRole } from "@/lib/role-utils";
import { useClaimGuestTrips } from "@/hooks/use-claim-guest-trips";

function ProtectedRoute({ component: Component, skipTermsCheck = false, requiredRole, ...rest }: any) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    window.location.replace("/");
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  // Check if user has accepted BOTH terms AND privacy policy (unless skipTermsCheck is true)
  if (!skipTermsCheck && user && (!user.termsAcceptedAt || !user.privacyAcceptedAt)) {
    window.location.href = "/accept-terms";
    return null;
  }

  // Check role-based access
  if (requiredRole && !userHasRequiredRole(user.role ?? "user", requiredRole)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-4">You don't have permission to access this page.</p>
        <a href="/dashboard"><button className="px-4 py-2 bg-primary text-white rounded-lg">Back to Dashboard</button></a>
      </div>
    );
  }

  return <Component {...rest} />;
}

function ChatWithRoleLayout() {
  return (
    <ConsoleAwareLayout title="Messages">
      <Chat />
    </ConsoleAwareLayout>
  );
}

function Router() {
  // Automatically claim guest trips when user signs up
  useClaimGuestTrips();

  return (
    <Switch>
      {/* Public Routes with Layout */}
      <Route path="/">
        <Layout><LandingPage /></Layout>
      </Route>
      <Route path="/landing-mockups">
        {process.env.NODE_ENV === "development" ? <LandingMockups /> : <Redirect to="/" />}
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
      <Route path="/earn">
        <EarnPage />
      </Route>
      <Route path="/architecture">
        {process.env.NODE_ENV === "development" ? <ArchitectureDiagram /> : <Redirect to="/" />}
      </Route>
      <Route path="/concierge">
        <ConciergePage />
      </Route>
      <Route path="/optimize">
        <Redirect to="/concierge?tier=ai" />
      </Route>
      <Route path="/reset-password">
        <ResetPasswordPage />
      </Route>
      <Route path="/verify-email">
        <VerifyEmailPage />
      </Route>
      <Route path="/experts">
        <Layout><ExpertsPage /></Layout>
      </Route>
      <Route path="/experts/:id">
        <ExpertDetailPage />
      </Route>
      {/* Marketplace Phase B2: public package detail + purchase (content-gated server-side) */}
      <Route path="/expert-templates/:id">
        <ExpertTemplateDetail />
      </Route>
      <Route path="/local-experts">
        <Layout><ExpertsPage /></Layout>
      </Route>
      <Route path="/local-experts/:id">
        <ExpertDetailPage />
      </Route>
      <Route path="/service-providers">
        <ServiceProvidersPage />
      </Route>
      
      {/* Consolidated Discover page (formerly discover, help-me-decide, explore, browse) */}
      <Route path="/discover">
        <Layout><DiscoverPage /></Layout>
      </Route>
      {/* Phase 3 LocationView — 9-section city marketplace (Decision #5 = Replace). */}
      <Route path="/discover/location/:city">
        <DiscoverLocationPage />
      </Route>
      {/* Phase B: /city/:slug deep-link redirect (CityDetailView retirement). */}
      <Route path="/city/:slug">
        {(params: any) => <Redirect to={`/discover/location/${params.slug}`} />}
      </Route>

      {/* Phase B: Legacy route redirect — /city/:slug → /discover/location/:slug for bookmark continuity */}
      <Route path="/city/:city">
        {({ city }) => <Redirect to={`/discover/location/${city}`} />}
      </Route>

      <Route path="/services/:id">
        <ServiceDetailPage />
      </Route>
      <Route path="/cart">
        <Layout><CartPage /></Layout>
      </Route>

      <Route path="/itinerary-view/:token">
        <ItineraryViewPage />
      </Route>
      <Route path="/trips/shared/:token">
        <SharedTripPage />
      </Route>
      <Route path="/bookings">
        {() => <ProtectedRoute component={MyBookingsPage} />}
      </Route>
      <Route path="/contracts/:id">
        {() => <ProtectedRoute component={ContractViewPage} />}
      </Route>
      <Route path="/global-calendar">
        <Layout><GlobalCalendarPage /></Layout>
      </Route>
      <Route path="/transportation">
        <Layout><TransportationBookingPage /></Layout>
      </Route>
      {/* Role copy folded into /earn's role band (earn role-to-offering redesign) */}
      <Route path="/partner-with-us">
        <Redirect to="/earn" />
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
      <Route path="/careers">
        <Layout><CareersPage /></Layout>
      </Route>
      <Route path="/blog">
        <Layout><BlogPage /></Layout>
      </Route>
      <Route path="/press">
        <Layout><PressPage /></Layout>
      </Route>
      <Route path="/help">
        <Layout><HelpPage /></Layout>
      </Route>
      <Route path="/support">
        <Layout><HelpPage /></Layout>
      </Route>
      <Route path="/privacy">
        <PrivacyPolicyPage />
      </Route>
      <Route path="/terms">
        <TermsOfServicePage />
      </Route>
      <Route path="/accept-terms">
        <AcceptTermsPage />
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
        <Redirect to="/discover" />
      </Route>
      {/* /deals kept: unique content (flash sales, seasonal, last-minute, bundle listings)
          with countdown timers and discount data not surfaced inside /discover. */}
      <Route path="/deals">
        <Layout><DealsPage /></Layout>
      </Route>
      {/* /spontaneous absorbed into Discover happening-now (v2 spec §6, Phase 2). */}
      {/* Route preserved as redirect for bookmark continuity; Phase 3 wires the */}
      {/* per-city happening-now section into the location view. */}
      <Route path="/spontaneous">
        <Redirect to="/discover" />
      </Route>
      {/* /hidden-gems kept: unique Grok-powered discovery of authentic local experiences with
          category-based filtering (local food secrets, hidden viewpoints, etc.) — not present
          inside /discover. */}
      <Route path="/hidden-gems">
        <Layout><HiddenGemsPage /></Layout>
      </Route>
      <Route path="/quick-start">
        {() => <Layout><ProtectedRoute component={QuickStartItinerary} /></Layout>}
      </Route>
      <Route path="/payment">
        <PaymentPage />
      </Route>
      <Route path="/booking-demo">
        {process.env.NODE_ENV === "development" ? <BookingDemo /> : <Redirect to="/" />}
      </Route>
      <Route path="/visa-help">
        <Layout><VisaHelpPage /></Layout>
      </Route>
      
      {/* Application pages for becoming an expert or provider */}
      <Route path="/become-expert">
        <TravelExpertsPage />
      </Route>
      <Route path="/become-provider">
        <ServicesProviderPage />
      </Route>
      {/* Supply recruitment entry points from location feed CTAs */}
      <Route path="/expert/apply">
        <TravelExpertsPage />
      </Route>
      <Route path="/provider/new-service">
        <ServicesProviderPage />
      </Route>
      
      <Route path="/layout-mock">
        {process.env.NODE_ENV === "development" ? <LayoutMock /> : <Redirect to="/" />}
      </Route>

      {/* Trip/Itinerary detail pages — must be BEFORE catch-all routes */}
      <Route path="/trip/:id">
        {() => <DashboardLayout><ProtectedRoute component={TripDetails} /></DashboardLayout>}
      </Route>
      <Route path="/itinerary/:id">
        {({ id }) => <Redirect to={`/trip/${id}?tab=itinerary`} />}
      </Route>
      <Route path="/my-itinerary/:id">
        {({ id }) => <Redirect to={`/trip/${id}?tab=itinerary`} />}
      </Route>
      <Route path="/itinerary-comparison/:id">
        {() => <DashboardLayout><ProtectedRoute component={ItineraryComparisonPage} /></DashboardLayout>}
      </Route>

      {/* Protected Dashboard Routes (use DashboardLayout - no global Layout) */}
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/my-trips">
        {() => <ProtectedRoute component={MyTrips} />}
      </Route>
      <Route path="/profile">
        {() => <DashboardLayout><ProtectedRoute component={Profile} /></DashboardLayout>}
      </Route>
      
      {/* Consolidated Credits page */}
      <Route path="/credits">
        {() => <DashboardLayout><ProtectedRoute component={CreditsBillingPage} /></DashboardLayout>}
      </Route>
      
      <Route path="/notifications">
        {() => <DashboardLayout><ProtectedRoute component={Notifications} /></DashboardLayout>}
      </Route>
      <Route path="/expert-status">
        {() => <ProtectedRoute component={ExpertStatusPage} />}
      </Route>
      <Route path="/provider-status">
        {() => <ProtectedRoute component={ProviderStatusPage} />}
      </Route>
      {/* Expert Dashboard Routes (use ExpertLayout - no global Layout) */}
      <Route path="/expert/dashboard">
        {() => <ProtectedRoute component={ExpertDashboard} requiredRole="expert" />}
      </Route>
      {/* /expert/ai-assistant is role-specific AI task delegation (auto-draft, vendor research,
          quality scoring) — distinct from /chat (human messaging). Keep separate. */}
      <Route path="/expert/ai-assistant">
        {() => <ProtectedRoute component={ExpertAIAssistant} requiredRole="expert" />}
      </Route>
      {/* /expert/messages consolidated into /chat (ChatWithRoleLayout already applies
          ExpertLayout when user role is expert). Deep-link clientId forwarded as ?clientId=
          so chat.tsx pre-populates the search box with the client's name. */}
      <Route path="/expert/messages/:clientId">
        {(params: any) => <Redirect to={`/chat?clientId=${params.clientId}`} />}
      </Route>
      <Route path="/expert/messages">
        <Redirect to="/chat" />
      </Route>
      <Route path="/expert/clients">
        {() => <ProtectedRoute component={ExpertClients} requiredRole="expert" />}
      </Route>
      <Route path="/expert/assigned-trips">
        {() => <ProtectedRoute component={ExpertAssignedTrips} requiredRole="expert" />}
      </Route>
      <Route path="/expert/bookings">
        {() => <ProtectedRoute component={ExpertBookings} requiredRole="expert" />}
      </Route>
      <Route path="/expert/services">
        {() => <ProtectedRoute component={ExpertServices} requiredRole="expert" />}
      </Route>
      <Route path="/expert/services/new">
        {() => <ProtectedRoute component={ServiceWizard} requiredRole="expert" />}
      </Route>
      <Route path="/expert/services/:id/edit">
        {() => <ProtectedRoute component={ExpertServiceForm} requiredRole="expert" />}
      </Route>
      <Route path="/expert/services/templates">
        <Redirect to="/expert/services/new" />
      </Route>
      <Route path="/expert/service-listings">
        <Redirect to="/expert/services/new" />
      </Route>
      <Route path="/expert/earnings">
        {() => <ProtectedRoute component={ExpertEarnings} requiredRole="expert" />}
      </Route>
      <Route path="/expert/performance">
        <Redirect to="/expert/analytics?tab=performance" />
      </Route>
      <Route path="/expert/revenue-optimization">
        <Redirect to="/expert/analytics?tab=revenue-optimization" />
      </Route>
      <Route path="/expert/leaderboard">
        <Redirect to="/expert/analytics?tab=leaderboard" />
      </Route>
      <Route path="/expert/analytics">
        {() => <ProtectedRoute component={ExpertAnalytics} requiredRole="expert" />}
      </Route>
      <Route path="/expert/templates">
        <Redirect to="/expert/services/new" />
      </Route>
      <Route path="/expert/content-studio">
        {() => <ProtectedRoute component={ExpertContentStudio} requiredRole="expert" />}
      </Route>
      <Route path="/expert/content-studio/:contentType">
        {() => <ProtectedRoute component={ExpertContentStudio} requiredRole="expert" />}
      </Route>
      <Route path="/expert/clients/:id">
        {() => <ProtectedRoute component={ExpertClientDetail} requiredRole="expert" />}
      </Route>
      <Route path="/expert/settings">
        {() => <ProtectedRoute component={ExpertSettings} requiredRole="expert" />}
      </Route>
      <Route path="/expert/verification">
        {() => <ProtectedRoute component={ExpertVerification} requiredRole="expert" />}
      </Route>
      <Route path="/expert/profile">
        {() => <ProtectedRoute component={ExpertProfile} requiredRole="expert" />}
      </Route>
      <Route path="/expert/contract-categories">
        {() => <ProtectedRoute component={ExpertContractCategories} requiredRole="expert" />}
      </Route>
      <Route path="/expert/booking-partners">
        {() => <ProtectedRoute component={ExpertBookingPartners} requiredRole="expert" />}
      </Route>
      <Route path="/expert/service-wizard">
        <Redirect to="/expert/services/new" />
      </Route>
      <Route path="/expert/workspace/:tripId">
        {() => <ProtectedRoute component={ExpertWorkspace} requiredRole="expert" />}
      </Route>
      <Route path="/expert/workspace">
        {() => <ProtectedRoute component={ExpertWorkspace} requiredRole="expert" />}
      </Route>

      {/* Executive Assistant Dashboard Routes (use EALayout - no global Layout) */}
      <Route path="/ea/dashboard">
        {() => <ProtectedRoute component={EADashboard} requiredRole="executive_assistant" />}
      </Route>
      <Route path="/ea/clients">
        {() => <ProtectedRoute component={EAClients} requiredRole="executive_assistant" />}
      </Route>
      <Route path="/ea/executives">
        {() => <ProtectedRoute component={EAExecutives} requiredRole="executive_assistant" />}
      </Route>
      <Route path="/ea/calendar">
        {() => <ProtectedRoute component={EACalendar} requiredRole="executive_assistant" />}
      </Route>
      <Route path="/ea/events">
        {() => <ProtectedRoute component={EAEvents} requiredRole="executive_assistant" />}
      </Route>
      <Route path="/ea/communications">
        {() => <ProtectedRoute component={EACommunications} requiredRole="executive_assistant" />}
      </Route>
      {/* /ea/ai-assistant kept: EA-specific AI task management (approve/reject delegated tasks,
          executive travel research, vendor options) — role-specific tools distinct from /chat. */}
      <Route path="/ea/ai-assistant">
        {() => <ProtectedRoute component={EAAIAssistant} requiredRole="executive_assistant" />}
      </Route>
      <Route path="/ea/travel">
        {() => <ProtectedRoute component={EATravel} requiredRole="executive_assistant" />}
      </Route>
      <Route path="/ea/trips">
        {() => <ProtectedRoute component={EATrips} requiredRole="executive_assistant" />}
      </Route>
      <Route path="/ea/venues">
        {() => <ProtectedRoute component={EAVenues} requiredRole="executive_assistant" />}
      </Route>
      <Route path="/ea/gifts">
        {() => <ProtectedRoute component={EAGifts} requiredRole="executive_assistant" />}
      </Route>
      <Route path="/ea/reports">
        {() => <ProtectedRoute component={EAReports} requiredRole="executive_assistant" />}
      </Route>
      <Route path="/ea/profile">
        {() => <ProtectedRoute component={EAProfile} requiredRole="executive_assistant" />}
      </Route>
      <Route path="/ea/settings">
        {() => <ProtectedRoute component={EASettings} requiredRole="executive_assistant" />}
      </Route>

      {/* Service Provider Dashboard Routes (use ProviderLayout - no global Layout) */}
      <Route path="/provider/dashboard">
        {() => <ProtectedRoute component={ProviderDashboard} requiredRole="provider" />}
      </Route>
      <Route path="/provider/bookings">
        {() => <ProtectedRoute component={ProviderBookings} requiredRole="provider" />}
      </Route>
      {/* /provider/messages consolidated into /chat (ChatWithRoleLayout applies ProviderLayout
          when user role is service_provider). Deep-link clientId forwarded as ?clientId=
          so chat.tsx pre-populates the search box with the client's name. */}
      <Route path="/provider/messages/:clientId">
        {(params: any) => <Redirect to={`/chat?clientId=${params.clientId}`} />}
      </Route>
      <Route path="/provider/messages">
        <Redirect to="/chat" />
      </Route>
      <Route path="/provider/services">
        {() => <ProtectedRoute component={ProviderServices} requiredRole="provider" />}
      </Route>
      <Route path="/provider/services/new">
        {() => <ProtectedRoute component={ProviderServiceForm} requiredRole="provider" />}
      </Route>
      <Route path="/provider/services/:id/edit">
        {() => <ProtectedRoute component={ProviderServiceForm} requiredRole="provider" />}
      </Route>
      <Route path="/provider/earnings">
        {() => <ProtectedRoute component={ProviderEarnings} requiredRole="provider" />}
      </Route>
      <Route path="/provider/performance">
        {() => <ProtectedRoute component={ProviderPerformance} requiredRole="provider" />}
      </Route>
      <Route path="/provider/analytics">
        {() => <ProtectedRoute component={ProviderAnalytics} requiredRole="provider" />}
      </Route>
      <Route path="/provider/calendar">
        {() => <ProtectedRoute component={ProviderCalendar} requiredRole="provider" />}
      </Route>
      <Route path="/provider/profile">
        {() => <ProtectedRoute component={ProviderProfile} requiredRole="provider" />}
      </Route>
      <Route path="/provider/settings">
        {() => <ProtectedRoute component={ProviderSettings} requiredRole="provider" />}
      </Route>
      <Route path="/provider/resources">
        {() => <ProtectedRoute component={ProviderResources} requiredRole="provider" />}
      </Route>

      {/* Admin Dashboard Routes (use AdminLayout - no global Layout) */}
      <Route path="/admin/dashboard">
        {() => <ProtectedRoute component={AdminDashboard} requiredRole="admin" />}
      </Route>
      <Route path="/admin/users">
        {() => <ProtectedRoute component={AdminUsers} requiredRole="admin" />}
      </Route>
      <Route path="/admin/experts">
        {() => <ProtectedRoute component={AdminExperts} requiredRole="admin" />}
      </Route>
      <Route path="/admin/providers">
        {() => <ProtectedRoute component={AdminProviders} requiredRole="admin" />}
      </Route>
      <Route path="/admin/plans">
        {() => <ProtectedRoute component={AdminPlans} requiredRole="admin" />}
      </Route>
      <Route path="/admin/revenue">
        {() => <ProtectedRoute component={AdminRevenue} requiredRole="admin" />}
      </Route>
      <Route path="/admin/analytics">
        {() => <ProtectedRoute component={AdminAnalytics} requiredRole="admin" />}
      </Route>
      <Route path="/admin/categories">
        {() => <ProtectedRoute component={AdminCategories} requiredRole="admin" />}
      </Route>
      <Route path="/admin/expert-templates">
        {() => <ProtectedRoute component={AdminExpertTemplates} requiredRole="admin" />}
      </Route>
      <Route path="/admin/template-approvals">
        {() => <ProtectedRoute component={AdminTemplateApprovals} requiredRole="admin" />}
      </Route>
      <Route path="/admin/search">
        {() => <ProtectedRoute component={AdminSearch} requiredRole="admin" />}
      </Route>
      <Route path="/admin/notifications">
        {() => <ProtectedRoute component={AdminNotifications} requiredRole="admin" />}
      </Route>
      <Route path="/admin/system">
        {() => <ProtectedRoute component={AdminSystem} requiredRole="admin" />}
      </Route>
      <Route path="/admin/data">
        {() => <ProtectedRoute component={AdminData} requiredRole="admin" />}
      </Route>
      <Route path="/admin/affiliate-partners">
        {() => <ProtectedRoute component={AdminAffiliatePartners} requiredRole="admin" />}
      </Route>
      <Route path="/admin/content-tracking">
        {() => <ProtectedRoute component={AdminContentTracking} requiredRole="admin" />}
      </Route>
      <Route path="/admin/services">
        {() => <ProtectedRoute component={AdminServices} requiredRole="admin" />}
      </Route>
      <Route path="/admin/ai-costs">
        {() => <ProtectedRoute component={AdminAICosts} requiredRole="admin" />}
      </Route>
      <Route path="/admin/tourism-analytics">
        {() => <ProtectedRoute component={AdminTourismAnalytics} requiredRole="admin" />}
      </Route>
      <Route path="/admin/payouts">
        {() => <ProtectedRoute component={AdminPayouts} requiredRole="admin" />}
      </Route>
      <Route path="/admin/reconciliation">
        {() => <ProtectedRoute component={AdminReconciliation} requiredRole="admin" />}
      </Route>
      <Route path="/admin/fee-config">
        {() => <ProtectedRoute component={AdminFeeConfig} requiredRole="admin" />}
      </Route>
      <Route path="/admin/fee-bands">
        {() => <ProtectedRoute component={AdminFeeBands} requiredRole="admin" />}
      </Route>
      <Route path="/admin/offering-types">
        {() => <ProtectedRoute component={AdminOfferingTypes} requiredRole="admin" />}
      </Route>
      <Route path="/admin/category-fees">
        {() => <ProtectedRoute component={AdminCategoryFees} requiredRole="admin" />}
      </Route>
      <Route path="/admin/neighborhoods">
        {() => <ProtectedRoute component={AdminNeighborhoods} requiredRole="admin" />}
      </Route>
      <Route path="/admin/event-packages">
        {() => <ProtectedRoute component={AdminEventPackages} requiredRole="admin" />}
      </Route>
      <Route path="/admin/platform-providers">
        {() => <ProtectedRoute component={AdminPlatformProviders} requiredRole="admin" />}
      </Route>
      <Route path="/admin/content-mapping">
        {() => <ProtectedRoute component={AdminContentMapping} requiredRole="admin" />}
      </Route>
      <Route path="/admin/routing-queue">
        {() => <ProtectedRoute component={AdminRoutingQueue} requiredRole="admin" />}
      </Route>
      <Route path="/admin/neighborhood-backfill">
        {() => <ProtectedRoute component={AdminNeighborhoodBackfill} requiredRole="admin" />}
      </Route>
      <Route path="/admin/gem-photo-backfill">
        {() => <ProtectedRoute component={AdminGemPhotoBackfill} requiredRole="admin" />}
      </Route>
      <Route path="/admin/review-moderation">
        {() => <ProtectedRoute component={AdminReviewModeration} requiredRole="admin" />}
      </Route>
      <Route path="/admin/destination-events">
        {() => <ProtectedRoute component={AdminDestinationEvents} requiredRole="admin" />}
      </Route>
      <Route path="/admin/analytics/cross-sell">
        {() => <ProtectedRoute component={AdminCrossSellAnalytics} requiredRole="admin" />}
      </Route>
      <Route path="/admin/qa-checklist">
        {() => <ProtectedRoute component={AdminQAChecklist} requiredRole="admin" />}
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
      <Route path="/checkout">
        <Redirect to="/cart" />
      </Route>
      <Route path="/admin">
        <Redirect to="/admin/dashboard" />
      </Route>
      
      <Route path="/chat">
        {() => <ProtectedRoute component={ChatWithRoleLayout} />}
      </Route>
      {/* /ai-assistant kept: general travel AI chat with conversation history and streaming
          (uses /api/conversations). Serves traveler role. Distinct from /chat (human
          expert-to-traveler messaging) and from role-specific expert/ea AI tool pages. */}
      <Route path="/ai-assistant">
        {() => <DashboardLayout><ProtectedRoute component={AIAssistant} /></DashboardLayout>}
      </Route>
      <Route path="/vendors">
        {() => <Layout><ProtectedRoute component={Vendors} /></Layout>}
      </Route>
      <Route path="/executive-assistant">
        {() => <Layout><ProtectedRoute component={ExecutiveAssistant} /></Layout>}
      </Route>

      {/* Dedicated signup page for paid acquisition attribution */}
      <Route path="/signup" component={SignupPage} />

      {/* 3DS / Stripe redirect-back landing page */}
      <Route path="/booking/confirmation" component={BookingConfirmationPage} />

      {/* 404 */}
      <Route>
        <Layout><NotFound /></Layout>
      </Route>
    </Switch>
  );
}

function GuestCartMigrator() {
  const { user, isLoading } = useAuth();
  const qc = useQueryClient();
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    const isNowAuth = !!user;
    if (!wasAuthenticated.current && isNowAuth) {
      const guestSessionId = localStorage.getItem("traveloure_guest_session");
      if (guestSessionId) {
        fetch("/api/cart/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestSessionId }),
          credentials: "include",
        })
          .then((res) => {
            if (!res.ok) {
              console.warn("[cart] Guest cart migration returned", res.status);
            } else {
              qc.invalidateQueries({ queryKey: ["/api/cart"] });
            }
          })
          .catch((err) => console.warn("[cart] Guest cart migration failed", err));
      }
    }
    wasAuthenticated.current = isNowAuth;
  }, [user, isLoading, qc]);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GuestTripProvider>
        <TripQueueProvider>
          <SignInModalProvider>
            <ActiveConsoleProvider>
              <TooltipProvider>
                <Toaster />
                <GuestCartMigrator />
                <Router />
              </TooltipProvider>
            </ActiveConsoleProvider>
          </SignInModalProvider>
        </TripQueueProvider>
      </GuestTripProvider>
    </QueryClientProvider>
  );
}

export default App;
