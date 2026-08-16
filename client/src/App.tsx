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
import { useLocale } from "@/hooks/use-locale";
import { TripQueueProvider } from "@/contexts/TripQueueContext";
import { SignInModalProvider, useSignInModal } from "@/contexts/SignInModalContext";
import { GuestTripProvider } from "@/contexts/GuestTripContext";
import { ActiveConsoleProvider } from "@/contexts/ActiveConsoleContext";
import { ConsoleAwareLayout } from "@/components/console-aware-layout";
import { useEffect, useRef, lazy, Suspense } from "react";
import { PageErrorBoundary } from "@/components/page-error-boundary";
import { MaintenanceGate } from "@/components/maintenance-screen";

const LandingPage = lazy(() => import("@/pages/landing"));
const LandingMockups = lazy(() => import("@/pages/landing-mockups"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
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
const ExpertToday = lazy(() => import("@/pages/expert/today"));
const ExpertCalendar = lazy(() => import("@/pages/expert/calendar"));
const ExpertEarnings = lazy(() => import("@/pages/expert/earnings"));
// Console IA C8: ExpertProfile is no longer routed standalone — settings.tsx lazy-mounts it
// as its Profile tab (the C6 embedded pattern); /expert/profile redirects there below.
const ExpertAIAssistant = lazy(() => import("@/pages/expert/ai-assistant"));
const ExpertInbox = lazy(() => import("@/pages/expert/inbox"));
const ExpertCatalog = lazy(() => import("@/pages/expert/catalog"));
const ExpertPerformance = lazy(() => import("@/pages/expert/performance"));
const ExpertCustomers = lazy(() => import("@/pages/expert/customers"));

const ExpertClientDetail = lazy(() => import("@/pages/expert/client-detail"));
const ExpertContractCategories = lazy(() => import("@/pages/expert/contract-categories"));
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
// C9 Inbox absorption: ProviderBookings lazy import dropped — the page is retired
// (/provider/bookings redirects to /provider/inbox); ProviderInbox absorbs its uniques.
const ProviderInbox = lazy(() => import("@/pages/provider/inbox"));
const ProviderServices = lazy(() => import("@/pages/provider/services"));
const ProviderEarnings = lazy(() => import("@/pages/provider/earnings"));
const ProviderPerformance = lazy(() => import("@/pages/provider/performance"));
// C9: ProviderAnalytics/ProviderProfile lazy imports dropped — those pages are now mounted
// only as embedded tabs (provider performance.tsx / settings.tsx); their routes redirect.
const ProviderCalendar = lazy(() => import("@/pages/provider/calendar"));
const ProviderCustomers = lazy(() => import("@/pages/provider/customers"));
const ProviderSettings = lazy(() => import("@/pages/provider/settings"));
const ProviderWorkstation = lazy(() => import("@/pages/provider/workstation"));
const ProviderPropertyCreate = lazy(() => import("@/pages/provider/property-create"));
const ProviderListingHome = lazy(() => import("@/pages/provider/listing-home"));
const ProviderBundleBuilder = lazy(() => import("@/pages/provider/bundle-builder"));
const ProviderDistribute = lazy(() => import("@/pages/provider/distribute"));
const ProviderAvailability = lazy(() => import("@/pages/provider/availability"));
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
const TravelExpertsPage = lazy(() => import("@/pages/travel-experts"));
const StartEventsPage = lazy(() => import("@/pages/start-events"));
const ServicesProviderPage = lazy(() => import("@/pages/services-provider"));
const ExpertStatusPage = lazy(() => import("@/pages/expert-status"));
const ProviderStatusPage = lazy(() => import("@/pages/provider-status"));
const AdminFeeBands = lazy(() => import("@/pages/admin/fee-bands"));
const AdminOfferingTypes = lazy(() => import("@/pages/admin/offering-types"));
const AdminCategoryFees = lazy(() => import("@/pages/admin/category-fees"));
const AdminNeighborhoods = lazy(() => import("@/pages/admin/neighborhoods"));
const AdminMarkets = lazy(() => import("@/pages/admin/markets"));
const AdminEventPackages = lazy(() => import("@/pages/admin/event-packages"));
const AdminPlatformProviders = lazy(() => import("@/pages/admin/platform-providers"));
const AdminRoutingQueue = lazy(() => import("@/pages/admin/routing-queue"));
const AdminMessageModeration = lazy(() => import("@/pages/admin/message-moderation"));
const AdminConciergeRequests = lazy(() => import("@/pages/admin/concierge-requests"));
const AdminCrossSellAnalytics = lazy(() => import("@/pages/admin/cross-sell-analytics"));
const AdminQAChecklist = lazy(() => import("@/pages/admin/qa-checklist"));
const AdminContentOps = lazy(() => import("@/pages/admin/content-ops"));
const AdminAuditLog = lazy(() => import("@/pages/admin/audit-log"));
const ExpertContentStudio = lazy(() => import("@/pages/expert/content-studio"));
const ReadyMadeDetailPage = lazy(() => import("@/pages/ready-made-detail"));
const StorefrontPage = lazy(() => import("@/pages/storefront"));
const ExpertSettings = lazy(() => import("@/pages/expert/settings"));
const ExpertServiceForm = lazy(() => import("@/pages/expert/service-form"));
const ProviderServiceForm = lazy(() => import("@/pages/provider/service-form"));
const CreateServiceWizard = lazy(() => import("@/pages/provider/create-service"));
const ExpertWorkspace = lazy(() => import("@/pages/expert/workspace"));
// C9: SharePromote lazy import dropped — the page is retired (both console routes redirect
// into their Catalogs; the sharing primitives live in components/backoffice/share-tools.tsx).
const CartPage = lazy(() => import("@/pages/cart"));
const MyBookingsPage = lazy(() => import("@/pages/my-bookings"));
const MyEventsPage = lazy(() => import("@/pages/my-events"));
// W5-E (docs/planning/QA_PUNCH_LIST.md item 15 [DM]): traveler unified Inbox — Messages
// (real /api/chats threads, via the shared useConversationThreads hook) + Updates (real
// /api/notifications), mirroring the earner console's Inbox concept.
const InboxPage = lazy(() => import("@/pages/inbox"));
const ContractViewPage = lazy(() => import("@/pages/contract-view"));
const ServiceDetailPage = lazy(() => import("@/pages/service-detail"));
const LayoutMock = lazy(() => import("@/pages/layout-mock"));
const ItineraryComparisonPage = lazy(() => import("@/pages/itinerary-comparison"));
// Slip dispatch §4 Spec A: the slip's canonical address (/plans/:tripId). Parameterised
// route — deliberately NOT in role-routes-config.ts (that registry is static-paths-only).
const SlipViewPage = lazy(() => import("@/pages/slip-view"));
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
import { sanitizeReturnTo } from "@/lib/safe-return-to";

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

/* Direct /login URL (bookmarks, emailed links, redirects): open the sign-in
   modal over the landing page instead of falling through to the 404 route.
   Honors ?returnTo=/path so the user lands where they were headed after auth. */
function LoginRoute() {
  const { user, isLoading } = useAuth();
  const { openSignInModal } = useSignInModal();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    const params = new URLSearchParams(window.location.search);
    // Only allow same-origin destinations (prevent open redirects); see
    // sanitizeReturnTo for how "/\evil.com"-style tricks are caught.
    const returnTo = sanitizeReturnTo(
      params.get("returnTo") || params.get("redirect"),
    );

    if (user) {
      navigate(returnTo ?? "/", { replace: true });
      return;
    }
    if (returnTo) {
      sessionStorage.setItem("traveloure_return_to", returnTo);
    }
    navigate("/", { replace: true });
    openSignInModal({
      title: "Sign in to your account",
      description: "Welcome back! Sign in to continue planning your travels.",
      returnTo,
    });
  }, [isLoading, user, openSignInModal, navigate]);

  return <PageLoader />;
}

/* OAuth (Replit) sign-in is a server-side redirect: the callback lands on "/"
   and never sees browser storage. Password sign-in consumes and removes
   traveloure_return_to itself before redirecting, so any value still present
   once a user is authenticated belongs to an OAuth round-trip — restore it
   here on authenticated bootstrap so /login?returnTo=… works for both paths. */
function AuthReturnToRestorer() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const restoredRef = useRef(false);

  useEffect(() => {
    if (isLoading || !user || restoredRef.current) return;
    restoredRef.current = true;
    const stored = sessionStorage.getItem("traveloure_return_to");
    if (!stored) return;
    sessionStorage.removeItem("traveloure_return_to");
    const dest = sanitizeReturnTo(stored);
    if (dest && dest !== window.location.pathname + window.location.search) {
      navigate(dest, { replace: true });
    }
  }, [isLoading, user, navigate]);

  return null;
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
      <Route path="/login">
        <LoginRoute />
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
      {/* Alias — the page file/docs call this "my-bookings" and links have used both forms;
          /my-bookings previously client-404'd (dispatch P2-2). */}
      <Route path="/my-bookings">
        <Redirect to="/bookings" />
      </Route>
      <Route path="/my-events">
        {() => <ProtectedRoute component={MyEventsPage} />}
      </Route>
      <Route path="/inbox">
        {() => <ProtectedRoute component={InboxPage} />}
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
      {/* /payment was a stale, orphaned checkout page (no in-app Link/setLocation targets
          it) that hard-crashed on the current object-shaped GET /api/cart response —
          `(cartData || []).map(...)` on `{items, subtotal, total, itemCount}` throws.
          The real checkout lives in cart.tsx's own payment step; redirect here mirrors
          the /checkout redirect above so the route still resolves (app-routes CI gate
          visits every registered route) instead of crashing. */}
      <Route path="/payment">
        <Redirect to="/cart" />
      </Route>
      <Route path="/booking-demo">
        {process.env.NODE_ENV === "development" ? <BookingDemo /> : <Redirect to="/" />}
      </Route>
      <Route path="/visa-help">
        <Layout><VisaHelpPage /></Layout>
      </Route>
      
      {/* Application pages for becoming an expert or provider */}
      {/* Event Planner fork (Build 2): every "Event Planner" entry point lands here and the
          person picks vendor (provider track) vs planner (expert track) — the two entry
          points previously disagreed about which business the card started. */}
      <Route path="/start/events">
        <StartEventsPage />
      </Route>
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
      {/* Slip (Spec A/B) — the ONE canonical slip address; messages/My Plans rows link here.
          Auth is the session (server-side plancard gate) — the URL grants nothing. */}
      <Route path="/plans/:tripId">
        {() => (
          <PageErrorBoundary fallbackHeading="Plan Not Found">
            <DashboardLayout><ProtectedRoute component={SlipViewPage} /></DashboardLayout>
          </PageErrorBoundary>
        )}
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

      {/* R-G (Console Realign, Lane E4): retired — Notifications now redirects to the Inbox's
          Updates tab (client/src/pages/inbox.tsx), which absorbed its uniques. Route
          kept registered so existing links/bookmarks still resolve. No DashboardLayout wrapper
          needed — the redirect target (/inbox) supplies its own. */}
      <Route path="/notifications">
        {() => <ProtectedRoute component={Notifications} />}
      </Route>
      <Route path="/expert-status">
        {() => <ProtectedRoute component={ExpertStatusPage} />}
      </Route>
      <Route path="/provider-status">
        {() => <ProtectedRoute component={ProviderStatusPage} />}
      </Route>
      {/* Expert Dashboard Routes (use ExpertLayout - no global Layout) */}
      {/* Backoffice B5: Dashboard retired in favor of Today (module 1, ops home). The redirect
          keeps every existing /expert/dashboard navigation working. */}
      <Route path="/expert/dashboard">
        <Redirect to="/expert/today" />
      </Route>
      <Route path="/expert/today">
        {() => <ProtectedRoute component={ExpertToday} requiredRole="expert" />}
      </Route>
      {/* Channel Calendar — the console's 9th module (Console IA PR-Ca C3, §17): one
          channel-filtered month view over GET /api/me/calendar; events link to their
          owning module (Inbox / Workstation / Catalog), never re-rendered here. */}
      <Route path="/expert/calendar">
        {() => <ProtectedRoute component={ExpertCalendar} requiredRole="expert" />}
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
        <Redirect to="/expert/customers" />
      </Route>
      {/* Console IA C5 (§17 17→9): Assigned Trips retired — the list + accept action live on
          Inbox's Assigned Trips tab; the Suggest flow moved to the Workstation
          Distribute→Client card; the by-client grouping lives on /expert/customers. */}
      <Route path="/expert/assigned-trips">
        <Redirect to="/expert/inbox?tab=assignments" />
      </Route>
      {/* Console IA C5: Bookings retired — booking history/stats, visa-status management,
          and the trip-plan snapshot live on Inbox's History tab; pending accept/decline was
          already Inbox's Queue. */}
      <Route path="/expert/bookings">
        <Redirect to="/expert/inbox?tab=history" />
      </Route>
      <Route path="/expert/inbox">
        {() => <ProtectedRoute component={ExpertInbox} requiredRole="expert" />}
      </Route>
      <Route path="/expert/catalog">
        {() => <ProtectedRoute component={ExpertCatalog} requiredRole="expert" />}
      </Route>
      {/* Console IA C2 (§17 17→9 collapse): "My Offerings" (/expert/services list page)
          retired into Catalog — the MyOfferingsTable now carries the page's per-service
          edit (/expert/services/:id/edit), pause/activate (PATCH …/:id/status), and
          duplicate (POST …/:id/duplicate) actions, and Catalog's header carries the
          create entry. The ServiceForm routes below (/new, /:id/edit) are untouched. */}
      <Route path="/expert/services">
        <Redirect to="/expert/catalog" />
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
      {/* Console IA C8 (§17 17→9 collapse): Earnings renamed Money — the ratified module
          name (route move /expert/earnings → /expert/money; same page, no endpoint or
          queryKey change). The redirect keeps every existing /expert/earnings navigation
          working (B5 dashboard pattern). */}
      <Route path="/expert/money">
        {() => <ProtectedRoute component={ExpertEarnings} requiredRole="expert" />}
      </Route>
      <Route path="/expert/earnings">
        <Redirect to="/expert/money" />
      </Route>
      <Route path="/expert/performance">
        {() => <ProtectedRoute component={ExpertPerformance} requiredRole="expert" />}
      </Route>
      {/* Customers — Console IA C4 (§17 module 6): honest self-scoped aggregation over this
          earner's real bookings / store purchases / assigned trips (GET /api/me/customers).
          Detail rows link out to the owning modules; no CRM fields are invented. */}
      <Route path="/expert/customers">
        {() => <ProtectedRoute component={ExpertCustomers} requiredRole="expert" />}
      </Route>
      {/* Console IA C6: Analytics retired as a standalone page — it is hosted as
          Performance's Analytics tab (performance.tsx lazy-mounts the analytics
          component embedded; its internal 9-tab picker rides ?sub= there so it can't
          collide with Performance's ?tab=). The two routes that redirected INTO
          /expert/analytics are re-pointed the same way, ?tab=X becoming &sub=X. */}
      <Route path="/expert/revenue-optimization">
        <Redirect to="/expert/performance?tab=analytics&sub=revenue-optimization" />
      </Route>
      <Route path="/expert/leaderboard">
        <Redirect to="/expert/performance?tab=analytics&sub=leaderboard" />
      </Route>
      <Route path="/expert/analytics">
        <Redirect to="/expert/performance?tab=analytics" />
      </Route>
      {/* Console IA C1 (§17 17→9 collapse): Store Listings retired into Catalog — the
          MyOfferingsTable ready_made lane carries list + approval status, listing editing
          lives on the build in the Workstation (ReadyMadeListingPanel via Distribute), and
          new listings are created ship-to-store from a build (build-first). The redirect
          keeps every existing /expert/ready-made navigation working (B5 dashboard pattern). */}
      <Route path="/expert/ready-made">
        <Redirect to="/expert/catalog" />
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
        <Redirect to="/expert/settings" />
      </Route>
      {/* Console IA C8 (§17 17→9 collapse): Profile retired as a standalone page — it is
          hosted as Settings' FIRST tab (settings.tsx lazy-mounts the profile component
          embedded, the C6 pattern; Settings keeps defaulting to its Verification tab —
          the actionable surface). The redirect keeps every existing /expert/profile
          navigation working (B5 dashboard pattern). */}
      <Route path="/expert/profile">
        <Redirect to="/expert/settings?tab=profile" />
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
      {/* Console IA C7 (§17 17→9 collapse): DMO Library retired into the Workstation — the
          Add panel's DMO drawer (DmoPickerCore) now carries browse/add AND the
          review-and-refine flow (expert_dmo_edits, same content/:id/edit → edits/:id/submit
          write), resolving the C1 keep-reason. DMO content stays expert-workspace-only
          (`sourced` origin) — never a traveler surface. The redirect keeps every existing
          /expert/dmo-library navigation working (B5 dashboard pattern). */}
      <Route path="/expert/dmo-library">
        <Redirect to="/expert/workspace" />
      </Route>
      {/* Console IA C2 (§17 17→9 collapse): expert Share & Promote retired into Catalog —
          the offering-scoped creation half (per-row share kits, posting opportunities,
          storefront caption) lives on /expert/catalog via the moved share-tools components;
          the measurement half already lives on Performance. C9 retired the PROVIDER route
          the same way (/provider/share-promote → /provider/services), so the SharePromote
          page itself is gone — share-tools.tsx carries the primitives for both consoles. */}
      <Route path="/expert/share-promote">
        <Redirect to="/expert/catalog" />
      </Route>
      <Route path="/expert/contract-categories">
        {() => <ProtectedRoute component={ExpertContractCategories} requiredRole="expert" />}
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
      {/* Console IA C9 (§17 17→9 collapse): the provider console adopts the expert console's
          nine-module IA — Today (dashboard, label-only rename) · Calendar (Channel Calendar)
          · Inbox (Queue/History/Messages — absorbs the retired Bookings + Messages seats,
          C9 Inbox absorption, mirrors expert C5) · Catalog (services) · Money (earnings,
          renamed) · Customers (new) · Performance (hosts Analytics) · Settings (hosts Profile).
          PB: Workstation (the Provider Product Builder) landed after its §17 gated
          ratifications — the bundle rung is live (/provider/workstation), the property
          rung stays gated. */}
      <Route path="/provider/dashboard">
        {() => <ProtectedRoute component={ProviderDashboard} requiredRole="provider" />}
      </Route>
      {/* Console IA C9 Inbox absorption (§17 17→9 collapse, mirrors expert C5): "Bookings"
          retired — accept/decline, the visa-status dialog, and stats now live on Inbox's
          Queue tab; the search/filter capability lives on Inbox's History tab. */}
      <Route path="/provider/bookings">
        <Redirect to="/provider/inbox" />
      </Route>
      <Route path="/provider/inbox">
        {() => <ProtectedRoute component={ProviderInbox} requiredRole="provider" />}
      </Route>
      {/* /provider/messages consolidated into /chat (ChatWithRoleLayout applies ProviderLayout
          when user role is service_provider). Deep-link clientId forwarded as ?clientId=
          so chat.tsx pre-populates the search box with the client's name. The sidebar's bare
          "Messages" link is retired (C9 Inbox absorption) — Inbox's Messages tab is the new
          entry point into /chat, but these deep-link redirects stay live for existing links. */}
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
        {() => <ProtectedRoute component={CreateServiceWizard} requiredRole="provider" />}
      </Route>
      {/* Listing Home — the post-save landing page for a service draft.
          Must be BEFORE /:id/edit so the bare :id path matches first.
          /provider/services/new above guards against "new" being treated as an id. */}
      <Route path="/provider/services/:id">
        {() => <ProtectedRoute component={ProviderListingHome} requiredRole="provider" />}
      </Route>
      <Route path="/provider/services/:id/edit">
        {() => <ProtectedRoute component={ProviderServiceForm} requiredRole="provider" />}
      </Route>
      {/* Property builder — the 3-step create flow, graduated from canvas mockup. */}
      <Route path="/provider/properties/new">
        {() => <ProtectedRoute component={ProviderPropertyCreate} requiredRole="provider" />}
      </Route>
      {/* Bundle builder — full-page graduated from canvas mockup.
          Workstation's Bundle rung tile links here; replaces the old dialog. */}
      <Route path="/provider/bundles/new">
        {() => <ProtectedRoute component={ProviderBundleBuilder} requiredRole="provider" />}
      </Route>
      {/* PB (§17 Product Builder): the provider Workstation — the creation ladder
          (single service → bundle → property). Bundle rung live (migration 151 +
          /api/provider/bundles); property rung honestly gated (later phase). */}
      <Route path="/provider/workstation">
        {() => <ProtectedRoute component={ProviderWorkstation} requiredRole="provider" />}
      </Route>
      {/* Catalog+Distribute (ruling 74, lane D1): the distribution hub — Storefront +
          Marketplace channels now, Direct/Social/state-strip (D2–D4) mount into it later.
          Reached from the Workstation. */}
      <Route path="/provider/availability">
        {() => <ProtectedRoute component={ProviderAvailability} requiredRole="provider" />}
      </Route>
      <Route path="/provider/distribute">
        {() => <ProtectedRoute component={ProviderDistribute} requiredRole="provider" />}
      </Route>
      {/* Console IA C9: Earnings renamed Money — the ratified module name (route move
          /provider/earnings → /provider/money; same page, no endpoint or queryKey change).
          The redirect keeps every existing /provider/earnings navigation working (the C8
          expert pattern; the reminder/approval notification + email links are re-pointed). */}
      <Route path="/provider/money">
        {() => <ProtectedRoute component={ProviderEarnings} requiredRole="provider" />}
      </Route>
      <Route path="/provider/earnings">
        <Redirect to="/provider/money" />
      </Route>
      <Route path="/provider/performance">
        {() => <ProtectedRoute component={ProviderPerformance} requiredRole="provider" />}
      </Route>
      {/* Console IA C9: Analytics retired as a standalone page — it is hosted as
          Performance's Analytics tab (provider performance.tsx lazy-mounts the analytics
          component embedded; it has no internal ?tab= picker, so no ?sub= seam). */}
      <Route path="/provider/analytics">
        <Redirect to="/provider/performance?tab=analytics" />
      </Route>
      {/* Console IA C9: /provider/calendar is the provider Channel Calendar (the 9th module,
          the expert C3 pattern). The old page's availability-editor sheets were
          non-persisting previews; real slot editing lives on Catalog (/provider/services). */}
      <Route path="/provider/calendar">
        {() => <ProtectedRoute component={ProviderCalendar} requiredRole="provider" />}
      </Route>
      {/* Customers — Console IA C9 (§17 module 6): honest self-scoped aggregation over this
          provider's real bookings (GET /api/me/customers). Detail rows link to the owning
          modules; no CRM fields are invented. */}
      <Route path="/provider/customers">
        {() => <ProtectedRoute component={ProviderCustomers} requiredRole="provider" />}
      </Route>
      {/* Console IA C9: Profile retired as a standalone page — it is hosted as Settings'
          FIRST tab (provider settings.tsx lazy-mounts the profile component embedded, the
          expert C8 pattern; Settings keeps defaulting to its own settings content). */}
      <Route path="/provider/profile">
        <Redirect to="/provider/settings?tab=profile" />
      </Route>
      <Route path="/provider/settings">
        {() => <ProtectedRoute component={ProviderSettings} requiredRole="provider" />}
      </Route>
      {/* Console IA C9 follow-up: /provider/resources rebuilt as the Playbook (real, written
          content — the §13 fabrication removal that let this rejoin the nav; see
          provider-sidebar.tsx). Route renamed to match the nav label the same way
          /provider/earnings → /provider/money did; the old path keeps working as a redirect. */}
      <Route path="/provider/resources">
        <Redirect to="/provider/playbook" />
      </Route>
      <Route path="/provider/playbook">
        {() => <ProtectedRoute component={ProviderResources} requiredRole="provider" />}
      </Route>
      {/* Console IA C9: provider Share & Promote retired into Catalog — per-service share
          kits, posting opportunities, and the storefront share tools live on
          /provider/services via the shared components/backoffice/share-tools.tsx (the same
          absorption expert C2 did); the measurement half renders on Performance's Analytics
          tab. This retires the SharePromote page entirely (its expert route redirected in C2). */}
      <Route path="/provider/share-promote">
        <Redirect to="/provider/services" />
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
      <Route path="/admin/markets">
        {() => <ProtectedRoute component={AdminMarkets} requiredRole="admin" />}
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
      <Route path="/admin/message-moderation">
        {() => <ProtectedRoute component={AdminMessageModeration} requiredRole="admin" />}
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
      <Route path="/admin/content-ops">
        {() => <ProtectedRoute component={AdminContentOps} requiredRole="admin" />}
      </Route>
      <Route path="/admin/audit-log">
        {() => <ProtectedRoute component={AdminAuditLog} requiredRole="admin" />}
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

/**
 * Ruling 60 Phase A — applies resolution STEP 1 (the authenticated user's saved chrome locale,
 * users.preferences.settings.language) as soon as the session resolves, and keeps <html lang>
 * in sync. Steps 2-4 (localStorage → Accept-Language → en) already ran at i18n module load, so
 * this only ever overrides them with a real account preference. Renders nothing.
 */
function LocaleSync() {
  useLocale();
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
                <LocaleSync />
                <GuestCartMigrator />
                <AuthReturnToRestorer />
                <MaintenanceGate>
                  <Router />
                </MaintenanceGate>
              </TooltipProvider>
            </ActiveConsoleProvider>
          </SignInModalProvider>
        </TripQueueProvider>
      </GuestTripProvider>
    </QueryClientProvider>
  );
}

export default App;
