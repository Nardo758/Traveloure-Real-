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
  - **Grok (xAI)**: Expert matching, real-time intelligence, content generation, and autonomous itinerary building via AI Orchestrator routing (grok-3-mini-beta model).
  - **Anthropic Claude**: Empathetic chat, itinerary optimization, transportation analysis, and nuanced travel advice (claude-sonnet-4-20250514 model).
  - **AI Orchestrator** (`server/services/ai-orchestrator.ts`): Routes requests to appropriate provider based on task type, with central logging to database.
- **Google Maps**: Interactive mapping, route visualization, and transit information.
- **Amadeus Self-Service API**: Real-time flight and hotel search (with caching layer).
- **Viator Partner API**: Real-time tours and activities search (with caching layer).
- **External API Caching System** (`server/services/cache.service.ts`):
  - Hotels: `/api/cache/hotels` - 24-hour cache with `hotelCache` and `hotelOfferCache` tables.
  - Flights: `/api/cache/flights` - 24-hour cache with `flightCache` table.
  - Activities: `/api/cache/activities` - 24-hour cache with `activityCache` table.
  - All endpoints return `{ data, fromCache, lastUpdated }` for transparency.
  - Fresh verification available before checkout for pricing/availability updates.
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