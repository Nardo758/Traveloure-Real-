# Traveloure - AI-Powered Travel Planning Platform

## Overview
Traveloure is an AI-powered, full-stack travel planning platform designed to offer personalized trip itineraries and connect users with expert travel advisors. It integrates advanced AI for personalization with human expertise, providing flexible travel planning options from AI-generated suggestions to guidance from local experts. The platform aims to capture a significant market share by catering to diverse travel needs and preferences, offering solutions from AI Quick Start Itineraries to multi-city trip planning. It also provides a comprehensive content creation studio for travel experts and a polished final itinerary view for users.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (April 2026)
- **Codebase Cleanup (Task #55)**: Removed 6 dead frontend files (`GuestInvitePage.tsx`, `layout-mock.tsx`, `architecture-diagram.tsx`, `landing-mockups.tsx`, `booking-demo.tsx`, `PlanningWithBooking.tsx`) and their route registrations from `App.tsx`. Removed 101-line duplicate provider availability block from `server/routes.ts`. Extracted itinerary comparison & optimization routes (7 endpoints: POST/GET `/api/itinerary-comparisons`, GET `/api/dashboard/trip-scores`, and related routes) into `server/routes/itinerary-comparisons.ts`. routes.ts reduced from 15,626 to 15,151 lines.

## Recent Changes (March 2026)
- **Stripe Checkout Flow Fixes**: Standardized all Stripe API versions to `2024-12-18.acacia`. Cart checkout now creates a Stripe PaymentIntent and renders the StripeCheckout component for in-page payment. Credit purchase flow wired up with server-side package validation (prices enforced server-side, not client-trusted) via `/api/credits/purchase` endpoint creating Stripe Checkout Sessions. Pricing page auth check fixed: logged-in users navigate to `/credits`, unauthenticated users see sign-in modal. `getBaseUrl()` helper in stripe.service.ts reads REPLIT_DOMAINS for dynamic URL resolution.
- **QA Endpoint Fixes**: Added missing API routes: `GET /api/bookings/user`, `GET /api/service-bookings`, `POST /api/cart/items`, `GET /api/expert/dashboard`, `GET /api/provider/dashboard`, `GET /api/admin/bookings`, `GET /api/admin/revenue`. These complement existing routes (`/api/my-bookings`, `POST /api/cart`, `/api/expert/analytics/dashboard`, `/api/provider/analytics/dashboard`, `/api/admin/revenue/dashboard`).
- **POST /api/auth/logout**: Added logout endpoint that destroys session and clears cookie.
- **Viator Activity Coordinate Fix**: Enriched Viator freetext search results with product details and destination center coordinates. Activities now have lat/lng for maps, transport legs, and exports. Stale cache entries (missing coordinates) are auto-refreshed.
- **Chat API Authentication & User Scoping**: All `/api/conversations` routes now require authentication via `isAuthenticated` middleware. Conversations are scoped per user (`user_id` column added) to prevent cross-user data access.
- **Database Schema Sync**: Added missing `energy_cost`, `energy_type`, `attendance_requirement`, `conflicts_with`, `peak_timing_preference` columns to `itinerary_items` table.
- **Kyoto Expert Coverage**: Added 2 Kyoto-based travel experts (Yuki Nakamura, Takeshi Yamamoto) to seed data alongside existing Tokyo-based Kenji Tanaka.
- **Transport Hub System**: Complete transport booking layer with `transport_booking_options` DB table, `TransportHub` / `TransportBookingCard` / `MultiDayPassCard` components, AI-powered booking option population, Stripe checkout for platform bookings, and affiliate click tracking (12Go, Uber, Viator, etc.)
- **Transport Tab on Itinerary Page**: Added "Itinerary" + "Transport" tabs to `/itinerary/:id`. Transport tab shows summary stats, legs grouped by day (fully editable via `TransportLeg`), 12Go CTA, and empty state linking to AI Optimization.
- **Shareable Itinerary Card System**: `transport_legs`, `shared_itineraries`, `maps_export_cache` tables; 8 API endpoints; `TransportLeg`, `DayMapsButton`, `TripExportButton`, `NavigateNextButton`, `ItineraryCard` components; public `/itinerary-view/:token` route.
- **Dashboard redesign**: Rich plan cards with cover photos, progress rings, activity chips, and stat chips on the trips dashboard.
- **Per-leg transport mode selector**: Dropdown selector on each transport leg chip with PATCH `/api/transport-legs/:legId/mode` endpoint and AI cost/duration comparison.

## System Architecture

### UI/UX Decisions
The application uses a modern, responsive design built with React, Tailwind CSS, shadcn/ui for consistent components, and Framer Motion for smooth transitions. The primary color scheme is `#FF385C` with a gray-900 palette for admin interfaces and amber accents. Dashboards are role-specific (Provider, Admin, Executive Assistant) with distinct layouts and collapsible sidebars.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Wouter for routing, TanStack Query for server state management, and Vite.
- **Backend**: Node.js and Express with TypeScript, implementing RESTful APIs with Zod for validation and type safety.
- **Authentication**: Three methods — Email/password (scrypt hashing in `emailAuth.ts`), Replit Auth with OIDC (`replitAuth.ts`), and Facebook/Instagram OAuth (`facebookAuth.ts`). All use Passport.js with PostgreSQL session store. DB columns: `password` (varchar 255), `auth_provider` (varchar 20, default 'email'), `email_verified` (timestamp).
- **Data Storage**: PostgreSQL with Drizzle ORM for schema management.
- **API Structure**: Declarative API definitions using HTTP methods, paths, and Zod schemas.
- **Storage Abstraction**: A server-side abstraction layer provides flexible database operations.

### Feature Specifications
- **AI-Powered Trip Planning**: Includes an AI Itinerary Builder, Real-Time Intelligence Widget, AI-powered Expert-Traveler Matching, AI Content Assistant, Smart Sequencing integration for activities, and AI Quick Start Itinerary generation.
- **Expert Advisor Chat**: Direct communication with local travel experts.
- **Tourist Place Discovery**: Search and exploration of destinations.
- **Experience Planning System**: Template-based planning for various experience types with category-specific provider browsing, interactive map view, and an AI Optimization tab.
- **Reviews & Notifications**: User review and update system.
- **Role-Based Dashboards**: Dashboards for Service Providers, Administrators, and Executive Assistants.
- **Expert Tools Suite**: Comprehensive tools for travel experts including Revenue Optimization Dashboard, Expert Leaderboard, Business Analytics, and Templates & Quick Responses.
- **AI Assistant**: Task delegation, auto-draft responses, vendor research, and automated follow-ups.
- **Wallet & Billing**: Credit package purchasing, transaction history, and payment management.
- **Coordination Hub**: Tracks planning lifecycle, vendor availability, state management, and bookings.
- **Trip Transport Planner**: Intelligent transportation planning, analysis, and map integration, including shareable itinerary cards with transport leg swapping.
- **Logistics Intelligence Layer**: Provides shared functionality including multi-person RSVP tracking, vendor management, budget management, AI-powered scheduling optimization, and emergency services.
- **Spontaneous Activities & Live Intel Engine**: Real-time discovery of spontaneous opportunities.
- **AI Discovery System (Hidden Gems)**: Grok-powered discovery of authentic local experiences.
- **Affiliate Web Scraping System**: AI-powered web scraping for partners without APIs, with partner management and automatic affiliate link generation.
- **Content Tracking System**: Platform-wide content management and moderation with various content types and moderation workflows.
- **Revenue Tracking System**: Complete platform revenue tracking linked to content tracking, including platform revenue, provider earnings, and payouts.
- **Stripe Connect Payouts**: Automated expert/provider payouts via Stripe Connect. Experts and providers onboard through `/api/stripe/connect/onboard`, check status via `/api/stripe/connect/status`, and access their Stripe dashboard via `/api/stripe/connect/dashboard`. Admin payout execution automatically creates Stripe transfers to connected accounts. DB columns: `stripe_account_id`, `stripe_account_status`, `can_receive_payments` on users table. Service: `server/services/stripe-connect.service.ts`. UI: `StripeConnectCard` component on expert/provider earnings pages.
- **Service Recommendation Engine**: AI-powered service opportunity recommendations based on TravelPulse trends.
- **Shareable Itinerary System**: Publicly shareable itinerary views with KML/GPX export and platform-aware Maps deep links.

### System Design Choices
- **Modularity**: Codebase organized for clear separation of concerns.
- **Type Safety**: Extensive use of TypeScript and Zod.
- **Scalability**: Designed to support future expansion.
- **Security**: Role-based access control (RBAC) and ownership verification.

## External Dependencies

### Third-Party Services
- **Replit Auth**: OpenID Connect for user authentication.
- **PostgreSQL**: Primary database.
- **Dual AI System**:
  - **Grok (xAI)**: For expert matching, real-time intelligence, content generation, autonomous itinerary building, and city intelligence.
  - **Anthropic Claude**: For empathetic chat, itinerary optimization, transportation analysis, and nuanced travel advice.
  - **AI Orchestrator**: Routes requests to the appropriate AI provider.
- **AI Cost Tracking System**: Platform-wide AI usage monitoring and cost analytics.
- **External API Cost Tracking System**: Platform-wide external API (Amadeus) usage monitoring.
- **TravelPulse AI Intelligence System**: Generates and updates comprehensive city intelligence daily.
- **Content Enrichment System**: Merges AI-generated recommendations with booking/affiliate data.
- **Google Maps**: Interactive mapping, route visualization, and transit information.
- **Amadeus Self-Service API**: Comprehensive travel content including real-time flight and hotel search, POI discovery, Tours and Activities search, Airport Transfer booking, and Destination Safety Ratings.
- **Viator Partner API**: Real-time tours and activities search.
- **Fever Partner API**: Event discovery and ticketing.
- **12Go Transportation Booking**: Affiliate widget for ground transportation bookings.
- **External API Caching System**: Provides 24-hour caching for hotel, flight, and activity data.
- **Unified Experience Catalog Service**: Unifies search across cached provider data.
- **SERP API Hybrid Search System**: Integrates external providers via SerpAPI with native provider prioritization.
- **SerpAPI**: For venue searches (restaurants, attractions, nightlife).
- **Instagram Business API**: OAuth flow for Instagram Business/Creator accounts, single and carousel image publishing, AI-generated hashtags.
