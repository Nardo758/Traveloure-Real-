# Traveloure - AI-Powered Travel Planning Platform

## Overview

Traveloure is an AI-powered, full-stack travel planning platform designed to offer personalized trip itineraries and connect users with expert travel advisors. It aims to revolutionize travel planning by providing flexible options, from independent AI-generated suggestions to personalized guidance from local experts. The platform's vision is to capture a significant market share by blending cutting-edge AI personalization with human expertise, catering to diverse travel needs and preferences.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application utilizes a modern, responsive design with Tailwind CSS and shadcn/ui for consistent components. Framer Motion provides smooth transitions. The primary color scheme is `#FF385C` with a gray-900 palette for admin interfaces and amber accents for ratings. Dashboards are tailored for Provider, Admin, and Executive Assistant roles, featuring distinct layouts and collapsible sidebars.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Wouter for routing, TanStack Query for server state management, and Vite as the build tool.
- **Backend**: Node.js and Express with TypeScript, implementing RESTful APIs. Zod schemas are used for request/response validation, ensuring type safety.
- **Authentication**: Replit Auth with OpenID Connect (OIDC) via Passport.js, using PostgreSQL for session management and enforcing authentication on protected routes.
- **Data Storage**: PostgreSQL with Drizzle ORM for schema management and migrations.
- **API Structure**: Declarative API definitions using HTTP methods, paths, and Zod schemas for type-safe communication.
- **Storage Abstraction**: A server-side abstraction layer (`server/storage.ts`) ensures flexible database operations.

### Feature Specifications
- **AI-Powered Trip Planning**: Users can create and manage trips with AI-generated itineraries based on preferences.
  - **AI Itinerary Builder** (`/experience/travel` → AI Plan tab): Multi-step wizard for autonomous itinerary generation via Grok.
  - **Real-Time Intelligence Widget**: Displays destination events, weather, safety alerts, trending experiences, and deals with 1-hour caching.
  - **Expert-Traveler Matching**: AI-powered matching scores (0-100) with breakdown and reasoning.
  - **Content Assistant**: AI-generated bios, service descriptions, and inquiry responses for experts.
- **Expert Advisor Chat**: Facilitates direct communication with local travel experts.
- **Tourist Place Discovery**: Functionality for searching and exploring destinations.
- **Experience Planning System**: Template-based planning for 8 experience types (e.g., Travel, Wedding, Corporate) featuring:
    - Category-specific provider browsing with filtering (category, search, price, rating).
    - Interactive Map View with Google Maps integration.
    - AI Optimization tab for itinerary analysis, efficiency scoring, and recommendations using Anthropic Claude.
    - Expert assistance touchpoints throughout the planning flow.
- **Reviews & Notifications**: System for user reviews and timely updates.
- **Role-Based Dashboards**: Comprehensive dashboards for Service Providers, Administrators, and Executive Assistants to manage services, bookings, users, and analytics.
- **Wallet & Billing**: Credit package purchasing, transaction history, and payment method management.
- **Coordination Hub**: System for tracking the full planning lifecycle from intake to completion, including vendor availability, state management, and bookings.
- **Transportation Analysis & Map Integration**: Provides multi-modal transit analysis and visualizes routes on the map using Google Maps and AI recommendations.

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
  - **Grok (xAI)**: Expert matching, real-time intelligence, content generation, autonomous itinerary building, and TravelPulse city intelligence via AI Orchestrator routing (grok-3 model).
  - **Anthropic Claude**: Empathetic chat, itinerary optimization, transportation analysis, and nuanced travel advice (claude-sonnet-4-20250514 model).
  - **AI Orchestrator** (`server/services/ai-orchestrator.ts`): Routes requests to appropriate provider based on task type, with central logging to database.
- **TravelPulse AI Intelligence System** (`server/services/travelpulse.service.ts`, `server/services/grok.service.ts`):
  - Daily AI refresh scheduler runs every 24 hours to update city intelligence
  - `generateCityIntelligence()` in grok.service.ts generates comprehensive data including:
    - Pulse metrics (pulseScore, trendingScore, crowdLevel, weatherScore)
    - Seasonal insights (best time to visit, 12-month highlights, upcoming events)
    - Travel recommendations (optimal duration, budget estimates, must-see attractions, hidden gems)
    - Safety notes and cultural insights
  - Data merges into `travelPulseCities`, `destinationSeasons`, and `destinationEvents` tables
  - AI fields: `aiGeneratedAt`, `aiSeasonalHighlights`, `aiUpcomingEvents`, `aiTravelTips`, `aiLocalInsights`, `aiBudgetEstimate`, `aiMustSeeAttractions`, `aiAvoidDates`
  - Admin-only API endpoints with rate limiting (max 10 manual refreshes per hour):
    - `GET /api/travelpulse/ai/status` - Scheduler status and cities needing refresh
    - `POST /api/travelpulse/ai/refresh/:cityName/:country` - Manual city refresh
    - `POST /api/travelpulse/ai/refresh-all` - Batch refresh all stale cities
    - `GET /api/travelpulse/ai/city/:cityName` - Get city with full AI data
  - Scheduler service: `server/services/travelpulse-scheduler.service.ts`
- **Content Enrichment System** (`server/services/content-enrichment.service.ts`, `server/services/serp.service.ts`):
  - Merges AI-generated recommendations with real booking/affiliate data
  - SERP Service searches Google Maps via SerpAPI for venues (restaurants, attractions, nightlife)
  - Returns enriched venues with ratings, reviews, hours, addresses, Google Maps links
  - Booking options include Viator (tours), OpenTable (restaurants), GetYourGuide
  - API endpoints:
    - `GET /api/travelpulse/enriched/:cityName` - Get enriched recommendations with booking links
    - `GET /api/travelpulse/serp-search` - Search for venues by type (restaurant, attraction, nightlife)
  - UI integration: EnrichedRecommendationsSection in CityDetailView "For You" tab
    - CityGrid (Trending tab) and GlobalCalendar (Calendar tab) both open CityDetailView on city click
    - Pattern: local selectedCity state → render CityDetailView → onBack resets to list
  - Environment variable: `SERP_API_KEY` for SerpAPI access
  - Launch market cities (Year 1): Kyoto, Edinburgh, Goa, Mumbai, Bogotá, Porto, Jaipur, Cartagena
- **Landing Page Ticker Tape** (`client/src/components/CityTickerTape.tsx`):
  - Animated horizontal scroll showing all 8 launch cities
  - CSS keyframe animation with seamless loop
  - Accessibility: pauses on hover, respects prefers-reduced-motion
- **Google Maps**: Interactive mapping, route visualization, and transit information.
- **Amadeus Self-Service API**: Real-time flight and hotel search (with caching layer).
- **Viator Partner API**: Real-time tours and activities search (with caching layer).
- **Fever Partner API** (`server/services/fever.service.ts`):
  - Integration with Fever (feverup.com) for event discovery and ticketing
  - Partner signup via impact.com affiliate network
  - Supports 29 cities globally including launch markets
  - Event categories: experiences, concerts, theater, exhibitions, festivals, nightlife, food-drink, sports, wellness, tours, classes, family
  - Affiliate tracking for commission via impact.com
  - API endpoints:
    - `GET /api/fever/status` - Service status and supported cities/categories
    - `GET /api/fever/events?city=London&limit=10` - Search events by city with filters
    - `GET /api/fever/events/:eventId` - Get event details
    - `GET /api/fever/cities/:cityCode/upcoming` - Upcoming events for a city
    - `GET /api/fever/cities/:cityCode/free` - Free events for a city
    - `GET /api/fever/cities/:cityCode/dates?startDate=&endDate=` - Events by date range
    - `GET /api/fever/cities` - List all supported cities
    - `GET /api/travelpulse/fever-events/:cityName` - Merged Fever + TravelPulse events for calendar
  - Uses Impact.com Partner API with HTTP Basic Auth
  - **Fever Event Caching** (`server/services/fever-cache.service.ts`):
    - Database table: `fever_event_cache` stores events with 24-hour expiry
    - Auto-refresh via cache scheduler when data is stale (>20 hours old)
    - Reduces API calls to stay within Impact.com rate limits (~100 requests/hour)
    - Cache endpoints:
      - `GET /api/fever/cache/status` - Cache statistics and health
      - `GET /api/fever/cache/events/:cityCode` - Get cached events (auto-refreshes if stale)
      - `POST /api/fever/cache/refresh/:cityCode` - Manual city refresh (admin only)
      - `POST /api/fever/cache/refresh-all` - Batch refresh all cities (admin only)
  - Environment variables: `IMPACT_ACCOUNT_SID`, `IMPACT_AUTH_TOKEN`
- **12Go Transportation Booking** (`client/src/components/TwelveGoTransport.tsx`):
  - Affiliate widget for ground transportation bookings (trains, buses, ferries)
  - Deep linking with pre-filled trip data (origin, destination, date, passengers)
  - Three variants: `full` (card with details), `compact` (minimal card), `button` (just a button)
  - Generates URLs: `https://12go.co/en/travel/{origin}/{destination}?affiliate_id={id}&date=YYYY-MM-DD&people=N`
  - Integrated into itinerary page sidebar for seamless transportation booking
  - Environment variable: `VITE_TWELVEGO_AFFILIATE_ID` (affiliate ID: 13805109)
- **External API Caching System** (`server/services/cache.service.ts`):
  - Hotels: `/api/cache/hotels` - 24-hour cache with `hotelCache` and `hotelOfferCache` tables.
  - Flights: `/api/cache/flights` - 24-hour cache with `flightCache` table.
  - Activities: `/api/cache/activities` - 24-hour cache with `activityCache` table.
  - All endpoints return `{ data, fromCache, lastUpdated }` for transparency.
  - Fresh verification available before checkout for pricing/availability updates.
  - **Background Cache Scheduler** (`server/services/cache-scheduler.service.ts`):
    - Runs every 24 hours via in-process setInterval
    - Refreshes stale hotel and activity cache data (>20 hours old)
    - Batch processing (5 items per batch, 2s delay) to avoid overwhelming APIs
    - Started automatically on server init
  - **Cache Status Indicators**: All search components display "Updated X ago" badges showing data freshness.
  - **Enhanced Location Fields**: All cache tables store comprehensive location data (city, state, county, countryCode, countryName, postalCode, coordinates).
  - **Preference Tags System**: Auto-inferred preference tags (18+ categories) from amenities, pricing, descriptions:
    - `budget`, `luxury`, `family`, `adventure`, `beach`, `city`, `nature`, `culture_history`, `food_dining`, `nature_outdoors`, `nightlife`, `shopping`, `wellness_spa`, `art_museums`, `romantic`, `solo`, `group`, `business`
  - **Filtering API** (`/api/cache/filter/hotels`, `/api/cache/filter/activities`):
    - Text search (name, address, description)
    - Price range ($0-$500+)
    - Minimum rating (3+, 3.5+, 4+, 4.5+)
    - Preference tags (multiple)
    - Location (county, state, country)
    - Pagination (limit, offset)
  - **Sorting Options**: `price_low`, `price_high`, `rating`, `popularity`, `newest`
  - **Metadata Endpoints**: `/api/cache/preference-tags/:itemType`, `/api/cache/categories`

### Key NPM Packages
- `@tanstack/react-query`: Server state management.
- `drizzle-orm` / `drizzle-kit`: ORM and migration for PostgreSQL.
- `zod`: Schema validation.
- `passport` / `openid-client`: Authentication middleware.
- `express-session` / `connect-pg-simple`: Session management.
- `framer-motion`: Animations.
- `@vis.gl/react-google-maps`: Google Maps React components.
- `@anthropic-ai/sdk`: Anthropic SDK.
- `openai`: OpenAI SDK (used for xAI Grok API compatibility layer).
- `amadeus`: Amadeus Node.js SDK.

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string.
- `SESSION_SECRET`: Session encryption key.
- `ISSUER_URL`: Replit OIDC issuer URL.
- `REPL_ID`: Replit environment identifier.
- `GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAPS_API_KEY`: Google Maps API keys.
- `AMADEUS_API_KEY`, `AMADEUS_API_SECRET`: Amadeus API credentials.
- `VIATOR_API_KEY`: Viator API key.
- `ANTHROPIC_API_KEY`: Anthropic Claude API key.
- `XAI_API_KEY`: xAI Grok API key.
- `IMPACT_ACCOUNT_SID`: Impact.com Account SID for Fever integration (from impact.com partner settings).
- `IMPACT_AUTH_TOKEN`: Impact.com Auth Token for API access (from impact.com partner settings).