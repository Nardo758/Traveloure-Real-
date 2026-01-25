# Traveloure - AI-Powered Travel Planning Platform

## Overview
Traveloure is an AI-powered, full-stack travel planning platform designed to offer personalized trip itineraries and connect users with expert travel advisors. It integrates advanced AI for personalization with human expertise, providing flexible travel planning options from AI-generated suggestions to guidance from local experts. The platform aims to capture a significant market share by catering to diverse travel needs and preferences.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application uses a modern, responsive design with Tailwind CSS and shadcn/ui for consistent components, and Framer Motion for smooth transitions. The primary color scheme is `#FF385C` with a gray-900 palette for admin interfaces and amber accents. Dashboards are role-specific (Provider, Admin, Executive Assistant) with distinct layouts and collapsible sidebars.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Wouter for routing, TanStack Query for server state management, and Vite.
- **Backend**: Node.js and Express with TypeScript, implementing RESTful APIs with Zod for validation and type safety.
- **Authentication**: Replit Auth with OpenID Connect (OIDC) via Passport.js, using PostgreSQL for session management.
- **Data Storage**: PostgreSQL with Drizzle ORM for schema management.
- **API Structure**: Declarative API definitions using HTTP methods, paths, and Zod schemas.
- **Storage Abstraction**: A server-side abstraction layer provides flexible database operations.

### Feature Specifications
- **AI-Powered Trip Planning**: Includes an AI Itinerary Builder, Real-Time Intelligence Widget, AI-powered Expert-Traveler Matching, and an AI Content Assistant for experts.
- **Expert Advisor Chat**: Direct communication with local travel experts.
- **Tourist Place Discovery**: Search and exploration of destinations.
- **Experience Planning System**: Template-based planning for various experience types (e.g., Travel, Wedding, Corporate) with category-specific provider browsing, interactive map view, and an AI Optimization tab for itinerary analysis.
  - **Dynamic Template System**: Database-driven tabs and multi-level filtering with various filter types (single_select, multi_select, range, toggle) and universal filters (date range, budget, booking status, etc.).
  - **Comprehensive Template Support**: Standardized tab and filter specifications across 22+ experience templates covering diverse travel and event types.
- **Reviews & Notifications**: User review and update system.
- **Role-Based Dashboards**: Dashboards for Service Providers, Administrators, and Executive Assistants.
- **Expert Tools Suite**: Comprehensive tools for travel experts to grow their business:
  - **Revenue Optimization Dashboard** (`/expert/revenue-optimization`): Earnings projections, suggested pricing analysis, upsell opportunities, seasonal demand forecasting, passive income streams (itinerary templates, affiliate commissions), and instant payout options.
  - **Expert Leaderboard** (`/expert/leaderboard`): Regional and global rankings, points system, badges/achievements, monthly competitions with prizes.
  - **Business Analytics** (`/expert/analytics`): Key metrics comparison with benchmarks, conversion funnel visualization, revenue by service breakdown, client acquisition sources, client lifetime value analysis, actionable AI-powered insights.
    - API endpoints: `/api/expert/analytics/dashboard` (comprehensive metrics), `/api/expert/market-intelligence` (TravelPulse-powered trends)
    - Real-time data from bookings, earnings, templates tables
    - Market Intelligence tab with trending destinations and seasonal demand forecasts from TravelPulse data
  - **Provider Performance Analytics** (`/provider/performance`): Service performance tracking for providers with monthly revenue trends, booking benchmarks, and service-level breakdowns.
    - API endpoint: `/api/provider/analytics/dashboard`
    - Benchmark comparisons (your average vs category average vs top performers)
    - Service performance with ratings and revenue per service
  - **Templates & Quick Responses** (`/expert/templates`): Reusable response templates, itinerary template marketplace for passive income, AI smart reply system.
  - **AI Assistant** (`/expert/ai-assistant`): Task delegation, auto-draft responses, vendor research, automated follow-ups with quality scores and regeneration options.
- **Wallet & Billing**: Credit package purchasing, transaction history, and payment management.
- **Coordination Hub**: Tracks planning lifecycle, vendor availability, state management, and bookings.
- **Trip Transport Planner**: Intelligent transportation planning that analyzes all cart bookings to build a transport timeline:
  - Automatically detects flights, hotels, and activities from cart with all type variations
  - Builds transport segments: airport→hotel, hotel→activities, activity→activity, hotel→airport
  - Hotel transfer perk detection via `metadata.includesAirportTransfer` showing "Covered" status
  - Flights sorted by departure time for accurate arrival/departure identification
  - Actionable transport options for each gap: Google Transit, Amadeus transfers, taxi/ride-share, 12Go affiliate links
  - Component: `TripTransportPlanner` in Transportation tab of experience templates
  - Affiliate integration: 12Go Asia (tracking ID: 13805109)
- **Transportation Analysis & Map Integration**: Multi-modal transit analysis and route visualization using Google Maps and AI.
- **Logistics Intelligence Layer**: Provides shared functionality including multi-person RSVP tracking, vendor management, budget management (cost splitting, currency conversion, tip calculation), AI-powered scheduling optimization, and emergency services.
- **Spontaneous Activities & Live Intel Engine**: Real-time discovery of spontaneous opportunities from cached provider data (e.g., activities, events, hotels) with a scoring system based on urgency, actionability, and trending.
- **AI Discovery System (Hidden Gems)**: Grok-powered discovery of authentic local secrets and off-the-beaten-path experiences across 12 categories.
- **Affiliate Web Scraping System**: AI-powered web scraping for partners without APIs, featuring:
  - Partner management with tracking IDs and commission rates
  - Grok-powered HTML extraction to structured product data
  - Automatic affiliate link generation with customizable templates
  - Click tracking for commission attribution
  - Database tables: `affiliate_partners`, `affiliate_products`, `affiliate_scrape_jobs`, `affiliate_clicks`
  - Admin UI at `/admin/affiliate-partners` for partner CRUD and scrape triggers
  - API endpoints: `/api/affiliate/partners`, `/api/affiliate/products`, `/api/affiliate/track-click`

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
- **TravelPulse AI Intelligence System**: Generates and updates comprehensive city intelligence daily.
- **Content Enrichment System**: Merges AI-generated recommendations with booking/affiliate data.
- **Google Maps**: Interactive mapping, route visualization, and transit information.
- **Amadeus Self-Service API**: Comprehensive travel content including:
  - Real-time flight and hotel search
  - Points of Interest (POI) discovery with categorized attractions
  - Tours and Activities search with real-time availability
  - Airport Transfer booking with vehicle options and pricing
  - Destination Safety Ratings with multi-category safety scores (LGBTQ+, medical, physical, political, theft, women safety)
  - Database caching tables: `poi_cache`, `transfer_cache`, `safety_cache`
  - UI components: AmadeusPOIs, AmadeusTransfers, AmadeusSafety
- **Viator Partner API**: Real-time tours and activities search.
- **Fever Partner API**: Event discovery and ticketing in global cities, with caching.
- **12Go Transportation Booking**: Affiliate widget for ground transportation bookings.
- **External API Caching System**: Provides 24-hour caching for hotel, flight, and activity data with background refreshers, filtering, and sorting.
- **Unified Experience Catalog Service**: Unifies search across cached provider data (activities, hotels, events) with template-driven retrieval, filtering, and sorting.
- **SERP API Hybrid Search System**: Integrates external providers via SerpAPI with native provider prioritization, quality filtering, template mappings, and partnership tracking.
- **SerpAPI**: For venue searches (restaurants, attractions, nightlife).

### Key NPM Packages
- `@tanstack/react-query`
- `drizzle-orm` / `drizzle-kit`
- `zod`
- `passport` / `openid-client`
- `express-session` / `connect-pg-simple`
- `framer-motion`
- `@vis.gl/react-google-maps`
- `@anthropic-ai/sdk`
- `openai`
- `amadeus`