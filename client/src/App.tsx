import { Switch, Route, Redirect, useLocation } from "wouter";
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
import { SignInModalProvider, useSignInModal } from "@/contexts/SignInModalContext";
import { GuestTripProvider } from "@/contexts/GuestTripContext";
import { ActiveConsoleProvider } from "@/contexts/ActiveConsoleContext";
import { ConsoleAwareLayout } from "@/components/console-aware-layout";
import { useEffect, useRef, lazy, Suspense } from "react";
import { PageErrorBoundary } from "@/components/page-error-boundary";

const LandingPage = lazy(() => import("@/pages/landing"));
const LandingMockups = lazy(() => import("@/pages/landing-mockups"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const CreateTrip = lazy(() => import("@/pages/create-trip"));
const TripDetails = lazy(() => import("@/pages/trip-details"));
const MyTrips = lazy(() => import("@/pages/my-trips"));
const Profile = lazy(() => import("@/pages/profile"));
const Notifications = lazy(() => import("@/pages/notifications"));
const Chat = lazy(() => import("@/pages/chat"));
const AIAssistant = lazy(() => import("@/pages/ai-assistant"));
const Vendors = lazy(() => import("@/pages/vendors"));
const ExecutiveAssistant = lazy(() => import("@/pages/executive-assistant"));
const HowItWorks = lazy(() => import("@/pages/how-it-works"));
const Pricing = lazy(() => import("@/pages/pricing"));
const About = lazy(() => import("@/pages/about"));
const EarnPage = lazy(() => import("@/pages/earn"));
const NotFound = lazy(() => import("@/pages/not-found"));
const SignupPage = lazy(() => import("@/pages/Signup").then((m) => ({ default: m.SignupPage })));
const BookingConfirmationPage = lazy(() => import("@/pages/BookingConfirmationPage"));
const ExpertDashboard = lazy(() => import("@/pages/expert/dashboard"));
const ExpertEarnings = lazy(() => import("@/pages/expert/earnings"));
const ExpertProfile = lazy(() => import("@/pages/expert/profile"));
const ExpertAIAssistant = lazy(() => import("@/pages/expert/ai-assistant"));
const ExpertBookings = lazy(() => import("@/pages/expert/bookings"));
const ExpertServices = lazy(() => import("@/pages/expert/services"));
const ExpertAssignedTrips = lazy(() => import("@/pages/expert/assigned-trips"));
const EADashboard = lazy(() => import("@/pages/ea/dashboard"));
const EAExecutives = lazy(() => import("@/pages/ea/executives"));
const EAClients = lazy(() => import("@/pages/ea/clients"));
const EACalendar = lazy(() => import("@/pages/ea/calendar"));
const EAEvents = lazy(() => import("@/pages/ea/events"));
const EACommunications = lazy(() => import("@/pages/ea/communications"));
const EAAIAssistant = lazy(() => import("@/pages/ea/ai-assistant"));
const EATravel = lazy(() => import("@/pages/ea/travel"));
const EATrips = lazy(() => import("@/pages/ea/trips"));
const EAVenues = lazy(() => import("@/pages/ea/venues"));
const EAGifts = lazy(() => import("@/pages/ea/gifts"));
const EAReports = lazy(() => import("@/pages/ea/reports"));
const EAProfile = lazy(() => import("@/pages/ea/profile"));
const EASettings = lazy(() => import("@/pages/ea/settings"));
const ProviderDashboard = lazy(() => import("@/pages/provider/dashboard"));
const ProviderBookings = lazy(() => import("@/pages/provider/bookings"));
const ProviderServices = lazy(() => import("@/pages/provider/services"));
const ProviderEarnings = lazy(() => import("@/pages/provider/earnings"));
const ProviderPerformance = lazy(() => import("@/pages/provider/performance"));
const ProviderAnalytics = lazy(() => import("@/pages/provider/analytics"));
const ProviderCalendar = lazy(() => import("@/pages/provider/calendar"));
const ProviderProfile = lazy(() => import("@/pages/provider/profile"));
const ProviderSettings = lazy(() => import("@/pages/provider/settings"));
const ProviderResources = lazy(() => import("@/pages/provider/resources"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminExperts = lazy(() => import("@/pages/admin/experts"));
const AdminProviders = lazy(() => import("@/pages/admin/providers"));
const AdminPlans = lazy(() => import("@/pages/admin/plans"));
const AdminRevenue = lazy(() => import("@/pages/admin/revenue"));
const AdminAnalytics = lazy(() => import("@/pages/admin/analytics"));
const AdminCategories = lazy(() => import("@/pages/admin/categories"));
const AdminExpertTemplates = lazy(() => import("@/pages/admin/expert-templates"));
const AdminTemplateApprovals = lazy(() => import("@/pages/admin/template-approvals"));
const AdminSearch = lazy(() => import("@/pages/admin/search"));
const AdminNotifications = lazy(() => import("@/pages/admin/notifications"));
const AdminSystem = lazy(() => import("@/pages/admin/system"));
const AdminData = lazy(() => import("@/pages/admin/data"));
const AdminAffiliatePartners = lazy(() => import("@/pages/admin/affiliate-partners"));
const AdminContentTracking = lazy(() => import("@/pages/admin/content-tracking"));
const AdminContentMapping = lazy(() => import("@/pages/admin/content-mapping"));
const AdminServices = lazy(() => import("@/pages/admin/services"));
const AdminServiceApprovals = lazy(() => import("@/pages/admin/service-approvals"));
const AdminAICosts = lazy(() => import("@/pages/admin/ai-costs"));
const AdminTourismAnalytics = lazy(() => import("@/pages/admin/tourism-analytics"));
const AdminPayouts = lazy(() => import("@/pages/admin/payouts"));
const AdminNeighborhoodBackfill = lazy(() => import("@/pages/admin/neighborhood-backfill"));
const AdminGemPhotoBackfill = lazy(() => import("@/pages/admin/gem-photo-backfill"));
const AdminReviewModeration = lazy(() => import("@/pages/admin/review-moderation"));
const AdminDestinationEvents = lazy(() => import("@/pages/admin/destination-events"));
const AdminServiceRequests = lazy(() => import("@/pages/admin/service-requests"));
const AdminReconciliation = lazy(() => import("@/pages/admin/reconciliation"));
const ConciergePage = lazy(() => import("@/pages/concierge"));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password"));
const VerifyEmailPage = lazy(() => import("@/pages/verify-email"));
const ExpertsPage = lazy(() => import("@/pages/experts"));
const DiscoverPage = lazy(() => import("@/pages/discover"));
const DiscoverLocationPage = lazy(() => import("@/pages/discover-location"));
const ContactPage = lazy(() => import("@/pages/contact"));
const FAQPage = lazy(() => import("@/pages/faq"));
const FeaturesPage = lazy(() => import("@/pages/features"));
const ExperienceTemplatePage = lazy(() => import("@/pages/experience-template"));
const ArchitectureDiagram = lazy(() => import("@/pages/architecture-diagram"));
const ExperiencesPage = lazy(() => import("@/pages/experiences"));
const DealsPage = lazy(() => import("@/pages/deals"));
const PaymentPage = lazy(() => import("@/pages/payment"));
const TravelExpertsPage = lazy(() => import("@/pages/travel-experts"));
const ServicesProviderPage = lazy(() => import("@/pages/services-provider"));
const ExpertStatusPage = lazy(() => import("@/pages/expert-status"));
const ProviderStatusPage = lazy(() => import("@/pages/provider-status"));
const AdminFeeBands = lazy(() => import("@/pages/admin/fee-bands"));
const AdminOfferingTypes = lazy(() => import("@/pages/admin/offering-types"));
const AdminCategoryFees = lazy(() => import("@/pages/admin/category-fees"));
const AdminNeighborhoods = lazy(() => import("@/pages/admin/neighborhoods"));
const AdminEventPackages = lazy(() => import("@/pages/admin/event-packages"));
const AdminPlatformProviders = lazy(() => import("@/pages/admin/platform-providers"));
const AdminRoutingQueue = lazy(() => import("@/pages/admin/routing-queue"));
const AdminConciergeRequests = lazy(() => import("@/pages/admin/concierge-requests"));
const AdminCrossSellAnalytics = lazy(() => import("@/pages/admin/cross-sell-analytics"));
const AdminQAChecklist = lazy(() => import("@/pages/admin/qa-checklist"));
const ExpertAnalytics = lazy(() => import("@/pages/expert/analytics"));
const ExpertContentStudio = lazy(() => import("@/pages/expert/content-studio"));
const ExpertTemplates = lazy(() => import("@/pages/expert/templates"));
const ExpertReadyMade = lazy(() => import("@/pages/expert/ready-made"));
const ReadyMadeDetailPage = lazy(() => import("@/pages/ready-made-detail"));
const StorefrontPage = lazy(() => import("@/pages/storefront"));
const ExpertSettings = lazy(() => import("@/pages/expert/settings"));
const ExpertServiceForm = lazy(() => import("@/pages/expert/service-form"));
const ProviderServiceForm = lazy(() => import("@/pages/provider/service-form"));
const ExpertWorkspace = lazy(() => import("@/pages/expert/workspace"));
const DmoLibrary = lazy(() => import("@/pages/expert/dmo-library"));
const SharePromote = lazy(() => import("@/pages/backoffice/share-promote"));
const CartPage = lazy(() => import("@/pages/cart"));
const MyBookingsPage = lazy(() => import("@/pages/my-bookings"));
const MyEventsPage = lazy(() => import("@/pages/my-events"));
const ContractViewPage = lazy(() => import("@/pages/contract-view"));
const ServiceDetailPage = lazy(() => import("@/pages/service-detail"));
const LayoutMock = lazy(() => import("@/pages/layout-mock"));
const ItineraryComparisonPage = lazy(() => import("@/pages/itinerary-comparison"));
const GlobalCalendarPage = lazy(() => import("@/pages/global-calendar"));
const HiddenGemsPage = lazy(() => import("@/pages/hidden-gems"));
const TransportationBookingPage = lazy(() => import("@/pages/transportation-booking"));
const PrivacyPolicyPage = lazy(() => import("@/pages/privacy"));
const TermsOfServicePage = lazy(() => import("@/pages/terms"));
const AcceptTermsPage = lazy(() => import("@/pages/accept-terms"));
const CareersPage = lazy(() => import("@/pages/careers"));
const BlogPage = lazy(() => import("@/pages/blog"));
const PressPage = lazy(() => import("@/pages/press"));
const HelpPage = lazy(() => import("@/pages/help"));
const ExpertDetailPage = lazy(() => import("@/pages/expert-detail"));
const ExpertTemplateDetail = lazy(() => import("@/pages/expert-template-detail"));
const QuickStartItinerary = lazy(() => import("@/pages/quick-start-itinerary"));
const BookingDemo = lazy(() => import("@/pages/booking-demo"));
const MyItineraryPage = lazy(() => import("@/pages/my-itinerary"));
const ItineraryViewPage = lazy(() => import("@/pages/itinerary-view"));
const SharedTripPage = lazy(() => import("@/pages/shared-trip"));
const GuestInvitePage = lazy(() => import("@/pages/GuestInvitePage").then((m) => ({ default: m.GuestInvitePage })));
const VisaHelpPage = lazy(() => import("@/pages/visa-help"));
import { Loader2 } from "lucide-react";

import { getRoleHomePath, userHasRequiredRole } from "@/lib/role-utils";
import { useClaimGuestTrips } from "@/hooks/use-claim-guest-trips";
import { useClaimGuestConcierge } from "@/hooks/use-claim-guest-concierge";
import { captureAcquisitionRef } from "@/lib/acquisition";

// Fallback shown while a lazily-loaded route chunk is being fetched.
// Routes are code-split (React.lazy) so the browser and the Vite dev server
// only load the page you're actually on — without this the whole app (140+
// pages) is pulled in on first paint, which spikes memory and freezes on
// constrained hosts.
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
    </div>
  );
}

function ProtectedRoute({ component: Component, skipTermsCheck = false, requiredRole, ...rest }: any) {
  const { user, isLoading } = useAuth();
  const { openSignInModal } = useSignInModal();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      const dest = window.location.pathname + window.location.search;
      if (dest && dest !== "/") {
        sessionStorage.setItem("traveloure_return_to", dest);
      }
      openSignInModal({
        title: "Sign in to continue",
        description: "Please sign in to access this page.",
        returnTo: dest !== "/" ? dest : undefined,
      });
      navigate("/");
    }
  }, [isLoading, user, openSignInModal, navigate]);

  if (isLoading || !user) {
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
  // Automatically claim guest trips and concierge requests when user signs in
  useClaimGuestTrips();
  useClaimGuestConcierge();

  return (
    <Suspense fallback={<PageLoader />}>
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
        <PageErrorBoundary fallbackHeading="Expert Not Found">
          <ExpertDetailPage />
        </PageErrorBoundary>
      </Route>
      {/* Marketplace Phase B2: public package detail + purchase (content-gated server-side) */}
      {/* Ready Made Trips store detail (Phase 4): public teaser + purchase→clone; the author of
          an unapproved listing sees the same page flagged Preview. */}
      <Route path="/ready-made/:id">
        {() => <ReadyMadeDetailPage />}
      </Route>
      <Route path="/expert-templates/:id">
        <ExpertTemplateDetail />
      </Route>
      {/* Public earner storefront (backoffice Phase 1b) — the mockup's /p/{handle} "one link
          that books and pays". Server injects OG tags for crawlers; SPA renders here. */}
      <Route path="/p/:handle">
        {() => <StorefrontPage />}
      </Route>
      <Route path="/local-experts">
        <Layout><ExpertsPage /></Layout>
      </Route>
      <Route path="/local-experts/:id">
        <PageErrorBoundary fallbackHeading="Expert Not Found">
          <ExpertDetailPage />
        </PageErrorBoundary>
      </Route>
      {/* /service-providers retired as a standalone surface — providers now live in the
          Discover "Services" tab (redesign decision, Jul 2026). Redirect preserves any
          inbound links/bookmarks. */}
      <Route path="/service-providers">
        <Redirect to="/discover?tab=services" />
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
        <PageErrorBoundary fallbackHeading="Service Not Found">
          <ServiceDetailPage />
        </PageErrorBoundary>
      </Route>
      <Route path="/cart">
        <Layout><CartPage /></Layout>
      </Route>

      <Route path="/itinerary-view/:token">
        <PageErrorBoundary fallbackHeading="Link Not Found or Expired">
          <ItineraryViewPage />
        </PageErrorBoundary>
      </Route>
      <Route path="/trips/shared/:token">
        <SharedTripPage />
      </Route>
      {/* Guest invite RSVP page — public by unguessable token (guests don't have accounts) */}
      <Route path="/invite/:token">
        <Layout><GuestInvitePage /></Layout>
      </Route>
      <Route path="/bookings">
        {() => <ProtectedRoute component={MyBookingsPage} />}
      </Route>
      <Route path="/my-events">
        {() => <ProtectedRoute component={MyEventsPage} />}
      </Route>
      <Route path="/contracts/:id">
        <PageErrorBoundary fallbackHeading="Contract Not Found">
          <ProtectedRoute component={ContractViewPage} />
        </PageErrorBoundary>
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
        {() => (
          <PageErrorBoundary fallbackHeading="Trip Not Found">
            <DashboardLayout><ProtectedRoute component={TripDetails} /></DashboardLayout>
          </PageErrorBoundary>
        )}
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
      
      {/* FP-3: credits system retired (per-use fee funnel + one-click saved-card is the
          monetization model; credits had zero real consumers). Old links redirect home. */}
      <Route path="/credits">
        <Redirect to="/dashboard" />
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
        <Redirect to="/expert/assigned-trips" />
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
      {/* Wizard retired (§5 Phase 3): ServiceForm is the single offering-creation surface;
          it absorbed the wizard's from-template gallery + requirements field in Phase 2. */}
      <Route path="/expert/services/new">
        {() => <ProtectedRoute component={ExpertServiceForm} requiredRole="expert" />}
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
        {() => <ProtectedRoute component={ExpertTemplates} requiredRole="expert" />}
      </Route>
      {/* Trips by Locals authoring console — a DIFFERENT product from /expert/templates
          (that's the expert_templates Guides lane). See spec v3 §0a. */}
      <Route path="/expert/ready-made">
        {() => <ProtectedRoute component={ExpertReadyMade} requiredRole="expert" />}
      </Route>
      <Route path="/expert/content-studio">
        {() => <ProtectedRoute component={ExpertContentStudio} requiredRole="expert" />}
      </Route>
      <Route path="/expert/content-studio/:contentType">
        {() => <ProtectedRoute component={ExpertContentStudio} requiredRole="expert" />}
      </Route>
      <Route path="/expert/clients/:id">
        {() => <Redirect to="/expert/assigned-trips" />}
      </Route>
      <Route path="/expert/settings">
        {() => <ProtectedRoute component={ExpertSettings} requiredRole="expert" />}
      </Route>
      <Route path="/expert/verification">
        <Redirect to="/expert/settings" />
      </Route>
      <Route path="/expert/profile">
        {() => <ProtectedRoute component={ExpertProfile} requiredRole="expert" />}
      </Route>
      <Route path="/expert/booking-partners">
        <Redirect to="/expert/workspace" />
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
      <Route path="/expert/dmo-library">
        {() => <ProtectedRoute component={DmoLibrary} requiredRole="expert" />}
      </Route>
      {/* Share & Promote (SH2) — one shared page component, mounted per-role so each console's
          sidebar link and ProtectedRoute guard stay role-scoped (SharePromote itself picks
          ExpertLayout vs ProviderLayout off the session user's role). */}
      <Route path="/expert/share-promote">
        {() => <ProtectedRoute component={SharePromote} requiredRole="expert" />}
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
      <Route path="/provider/share-promote">
        {() => <ProtectedRoute component={SharePromote} requiredRole="provider" />}
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
      <Route path="/admin/service-requests">
        {() => <ProtectedRoute component={AdminServiceRequests} requiredRole="admin" />}
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
      <Route path="/admin/service-approvals">
        {() => <ProtectedRoute component={AdminServiceApprovals} requiredRole="admin" />}
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
        {() => <Redirect to="/admin/fee-bands" />}
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
      <Route path="/admin/concierge-requests">
        {() => <ProtectedRoute component={AdminConciergeRequests} requiredRole="admin" />}
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
        <Redirect to="/dashboard" />
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
    </Suspense>
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
  // S4: capture a short-link ?ref= (set by GET /r/:code) once per session; checkout relays it
  // and the server derives the attribution source.
  useEffect(() => {
    captureAcquisitionRef();
  }, []);

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
