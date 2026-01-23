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
    - TemplateFiltersPanel component renders filters dynamically for template-driven experience types
  - Seeded templates for Bachelor/Bachelorette Parties (8 tabs with logistics-focused filters: group size, budget tiers, venue capacity, energy level) and Anniversary Trips (8 tabs with romance-focused filters: intimacy level, privacy, ambiance, special services).
- **Reviews & Notifications**: System for user reviews and timely updates.
- **Role-Based Dashboards**: Comprehensive dashboards for Service Providers, Administrators, and Executive Assistants.
- **Wallet & Billing**: Credit package purchasing, transaction history, and payment management.
- **Coordination Hub**: Tracks the full planning lifecycle, including vendor availability, state management, and bookings.
- **Transportation Analysis & Map Integration**: Multi-modal transit analysis and route visualization using Google Maps and AI.

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