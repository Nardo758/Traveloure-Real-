# Traveloure - AI-Powered Travel Planning Platform

## Overview
Traveloure is an AI-powered, full-stack travel planning platform offering personalized trip itineraries and connecting users with expert travel advisors. It combines cutting-edge AI personalization with human expertise to provide flexible travel planning options, from AI-generated suggestions to guidance from local experts. The platform aims to capture a significant market share by catering to diverse travel needs and preferences.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application features a modern, responsive design built with Tailwind CSS and shadcn/ui for consistent components. Framer Motion is used for smooth transitions. The primary color scheme uses `#FF385C` with a gray-900 palette for admin interfaces and amber accents for ratings. Dashboards are tailored for Provider, Admin, and Executive Assistant roles, each with distinct layouts and collapsible sidebars.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Wouter for routing, TanStack Query for server state management, and Vite.
- **Backend**: Node.js and Express with TypeScript, implementing RESTful APIs. Zod schemas ensure request/response validation and type safety.
- **Authentication**: Replit Auth with OpenID Connect (OIDC) via Passport.js, using PostgreSQL for session management and enforcing authentication.
- **Data Storage**: PostgreSQL with Drizzle ORM for schema management and migrations.
- **API Structure**: Declarative API definitions using HTTP methods, paths, and Zod schemas for type-safe communication.
- **Storage Abstraction**: A server-side abstraction layer (`server/storage.ts`) provides flexible database operations.

### Feature Specifications
- **AI-Powered Trip Planning**:
  - **AI Itinerary Builder**: Multi-step wizard for autonomous itinerary generation via Grok.
  - **Real-Time Intelligence Widget**: Displays destination events, weather, safety alerts, trending experiences, and deals.
  - **Expert-Traveler Matching**: AI-powered matching scores and reasoning.
  - **Content Assistant**: AI-generated content for experts (bios, service descriptions, inquiry responses).
- **Expert Advisor Chat**: Facilitates direct communication with local travel experts.
- **Tourist Place Discovery**: Functionality for searching and exploring destinations.
- **Experience Planning System**: Template-based planning for various experience types (e.g., Travel, Wedding, Corporate).
  - Category-specific provider browsing with filtering and an interactive Map View (Google Maps).
  - AI Optimization tab for itinerary analysis, efficiency scoring, and recommendations using Anthropic Claude.
  - **Dynamic Template System**: Database-driven tabs and multi-level filtering via 5 schema tables (experienceTemplateTabs, experienceTemplateFilters, experienceTemplateFilterOptions, experienceUniversalFilters, experienceUniversalFilterOptions).
    - Filter types: `single_select`, `multi_select`, `range`, `toggle`
    - Universal filters: date range, budget, booking status, cancellation policy, expert verified
    - Universal sort options: Most Popular | Price: Low to High | Price: High to Low | Highest Rated
    - Universal rating filter: All | 3+ | 3.5+ | 4+ | 4.5+
    - TemplateFiltersPanel component renders filters dynamically for template-driven experience types
  - **Complete Tab & Filter Specifications**: Standardized across all 22 experience templates:
    - **Travel**: Activities | Hotels | Services | Dining | Flights | Transportation (6 tabs)
    - **Wedding**: Venues | Vendors | Services | Guest Accommodations | Transportation | Rehearsal (6 tabs)
    - **Proposal**: Locations | Services | Celebration Dining | Accommodations (4 tabs with privacy/setting filters)
    - **Date Night**: Dining | Activities | Entertainment | Services | Transportation (5 tabs)
    - **Birthday**: Venues | Activities | Dining | Entertainment | Services | Accommodations (6 tabs)
    - **Corporate Events**: Venues | Team Activities | Services | Dining | Transportation | Accommodations (6 tabs)
    - **Reunions**: Venues | Activities | Catering | Accommodations | Transportation (5 tabs with capacity filters)
    - **Retreats**: Venues | Activities | Services | Dining | Accommodations | Wellness (6 tabs)
    - **Bachelor/Bachelorette**: Destinations | Accommodations | Daytime Activities | Nightlife | Dining | Transportation | Party Services | Activities (8 tabs)
    - **Anniversary Trip**: Destinations | Romantic Accommodations | Couple Experiences | Romantic Dining | Spa | Special Touches | Transportation | Activities (8 tabs)
    - **Wedding Anniversaries**: Venues | Catering | Entertainment | Decor | Photography (5 tabs with milestone filters)
    - **Boys Trip**: Activities | Nightlife | Accommodations | Dining | Transportation (5 tabs with energy level filters)
    - **Girls Trip**: Activities | Nightlife | Spa & Wellness | Accommodations | Dining (5 tabs)
    - **Baby Shower**: Venues | Catering | Decor & Supplies | Entertainment (4 tabs with theme filters)
    - **Graduation Party**: Venues | Catering | Entertainment | Decor (4 tabs)
    - **Engagement Party**: Venues | Catering | Entertainment | Photography (4 tabs)
    - **Housewarming Party**: Catering | Decor & Setup | Entertainment | Services (4 tabs)
    - **Retirement Party**: Venues | Catering | Entertainment | Gifts & Keepsakes (4 tabs)
    - **Career Achievement Party**: Venues | Catering | Entertainment (3 tabs)
    - **Farewell Party**: Venues | Catering | Entertainment | Keepsakes (4 tabs)
    - **Holiday Party**: Venues | Catering | Decor | Entertainment | Services (5 tabs with holiday-specific filters)
    - **Sports Event**: Tickets | Accommodations | Pre-Game | Dining | Transportation | VIP Experiences (6 tabs with sport type filters)
- **Reviews & Notifications**: System for user reviews and timely updates.
- **Role-Based Dashboards**: Comprehensive dashboards for Service Providers, Administrators, and Executive Assistants.
- **Wallet & Billing**: Credit package purchasing, transaction history, and payment management.
- **Coordination Hub**: Tracks the full planning lifecycle, including vendor availability, state management, and bookings.
- **Transportation Analysis & Map Integration**: Multi-modal transit analysis and route visualization using Google Maps and AI.
- **Logistics Intelligence Layer**: Comprehensive backend services providing shared functionality across all experience templates:
  - **Coordination Service** (`server/services/coordination.service.ts`): Multi-person RSVP tracking, dietary/accessibility management, payment collection, group communication
  - **Vendor Management Service** (`server/services/vendor-management.service.ts`): Contract tracking, deposit schedules, payment milestones, communication logging
  - **Budget Service** (`server/services/budget.service.ts`): Transaction logging, cost splitting (equal/percentage/custom), currency conversion (12 currencies), tip calculation (11 countries)
  - **Itinerary Intelligence Service** (`server/services/itinerary-intelligence.service.ts`): AI-powered scheduling optimization, travel time estimation, day schedule organization
  - **Emergency Service** (`server/services/emergency.service.ts`): Emergency contacts, alerts with severity levels, embassy info, emergency numbers, rebooking assistance
  - **Database Tables**: trip_participants, vendor_contracts, trip_transactions, itinerary_items, trip_emergency_contacts, trip_alerts
  - **Frontend Component**: TripLogisticsDashboard (`client/src/components/logistics/trip-logistics-dashboard.tsx`) displays real-time logistics data
- **Spontaneous Activities & Live Intel Engine**: Real-time discovery of spontaneous opportunities from cached provider data:
  - **OpportunityEngineService** (`server/services/opportunity-engine.service.ts`): Generates scored opportunities from Viator activities, Fever events, and Amadeus hotels
  - **Scoring System**: Urgency, actionability, and trending scores based on popularity, booking availability, time-to-start, and review counts
  - **Quick Search Time Windows**: Tonight, Tomorrow, This Weekend, Surprise Me - with smart filtering
  - **User Preferences**: Spontaneity level, notification radius, preferred categories, budget limits, blacklisted types
  - **Database Tables**: spontaneous_opportunities, realtime_signals, user_spontaneity_preferences
  - **API Endpoints**: `/api/spontaneous/opportunities`, `/api/spontaneous/preferences`, `/api/spontaneous/quick-search/:window`, `/api/spontaneous/:id/book`
  - **Frontend Component**: SpontaneousDiscovery (`client/src/components/spontaneous-discovery.tsx`) with tabbed time window UI, city search, and opportunity cards
  - **Page Route**: `/spontaneous` - Live Intel Engine discovery page

### System Design Choices
- **Modularity**: Codebase organized into `pages`-based frontend, and `server`/`shared` directories.
- **Type Safety**: Extensive use of TypeScript and Zod.
- **Scalability**: Architectural decisions support future expansion.
- **Security**: Role-based access control (RBAC) and ownership verification.

## External Dependencies

### Third-Party Services
- **Replit Auth**: OpenID Connect for user authentication.
- **PostgreSQL**: Primary database.
- **Dual AI System**:
  - **Grok (xAI)**: Used for expert matching, real-time intelligence, content generation, autonomous itinerary building, and TravelPulse city intelligence (via AI Orchestrator).
  - **Anthropic Claude**: Used for empathetic chat, itinerary optimization, transportation analysis, and nuanced travel advice.
  - **AI Orchestrator**: Routes requests to appropriate AI provider based on task type.
- **TravelPulse AI Intelligence System**: Generates and updates comprehensive city intelligence daily, including pulse metrics, seasonal insights, travel recommendations, safety notes, and cultural insights.
- **Content Enrichment System**: Merges AI-generated recommendations with real booking/affiliate data. Uses SerpAPI for venue searches (restaurants, attractions, nightlife) and integrates booking options like Viator and OpenTable.
- **Google Maps**: Interactive mapping, route visualization, and transit information.
- **Amadeus Self-Service API**: Real-time flight and hotel search (with caching).
- **Viator Partner API**: Real-time tours and activities search (with caching).
- **Fever Partner API**: Integration for event discovery and ticketing in 29 global cities, supporting various event categories. Includes a caching system with a 24-hour expiry to manage API rate limits.
- **12Go Transportation Booking**: Affiliate widget for ground transportation bookings (trains, buses, ferries) with deep linking capabilities.
- **External API Caching System**: Provides 24-hour caching for hotel, flight, and activity data, with background schedulers to refresh stale data. Includes filtering capabilities by text, price, rating, preference tags, and location, along with various sorting options. Automatically infers preference tags for cached items.
- **Unified Experience Catalog Service** (`server/services/experience-catalog.service.ts`):
  - Unified search across all provider caches (activityCache, hotelCache, feverEventCache)
  - Template-driven experience type retrieval with tabs and filters
  - Multi-provider filtering, sorting (popular, price_low, price_high, rating), and destination aggregation
  - API endpoints: `/api/catalog/search`, `/api/catalog/templates/:slug`, `/api/catalog/items/:type/:id`, `/api/catalog/destinations`
- **Experience Discovery Page** (`client/src/pages/experience-discovery.tsx`): Frontend for browsing the unified catalog with reactive filters, provider selection, and visual result cards
- **SERP API Hybrid Search System**: Seamless integration of external providers via SerpAPI with native provider prioritization:
  - **SerpService** (`server/services/serp.service.ts`): Template-aware query construction, result parsing, quality filtering (min 3.5 rating, 5+ reviews), and 24-hour caching
  - **Quality Filters**: Excludes aggregators (Viator, TripAdvisor, Booking.com), requires valid contact info (website/phone)
  - **Template Mappings**: Context-appropriate searches for 22+ experience types (wedding venues, corporate events, proposals, etc.)
  - **Partnership Tracking**: Automatic identification of high-engagement providers (HIGH: 50+ clicks or 10+ inquiries, MEDIUM: 20+ clicks or 5+ inquiries)
  - **Inquiry System**: Direct contact flow for external providers with user/trip context
  - **Database Tables**: serp_cache, serp_providers, serp_inquiries
  - **API Endpoints**: `/api/serp/template-search`, `/api/serp/track-click`, `/api/serp/inquiry`, `/api/serp/partnerships`, `/api/catalog/search-hybrid`
  - **Frontend Components**: UnifiedResultCard (with "Traveloure Partner" badges), SerpInquiryDialog
  - **Hybrid Search**: Automatic SERP fallback when native results < threshold, prioritizes native providers in results

### Key NPM Packages
- `@tanstack/react-query`: Server state management.
- `drizzle-orm` / `drizzle-kit`: ORM and migration for PostgreSQL.
- `zod`: Schema validation.
- `passport` / `openid-client`: Authentication middleware.
- `express-session` / `connect-pg-simple`: Session management.
- `framer-motion`: Animations.
- `@vis.gl/react-google-maps`: Google Maps React components.
- `@anthropic-ai/sdk`: Anthropic SDK.
- `openai`: OpenAI SDK (for xAI Grok API compatibility).
- `amadeus`: Amadeus Node.js SDK.