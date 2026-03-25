# Traveloure - AI-Powered Travel Planning Platform

## Overview
Traveloure is an AI-powered, full-stack travel planning platform designed to offer personalized trip itineraries and connect users with expert travel advisors. It integrates advanced AI for personalization with human expertise, providing flexible travel planning options from AI-generated suggestions to guidance from local experts. The platform aims to capture a significant market share by catering to diverse travel needs and preferences, offering a blend of AI-driven efficiency and human-centric service for a comprehensive travel planning experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application uses a modern, responsive design built with React, Tailwind CSS, shadcn/ui for consistent components, and Framer Motion for smooth transitions. The primary color scheme is `#FF385C` with a gray-900 palette for admin interfaces and amber accents. Dashboards are role-specific (Provider, Admin, Executive Assistant) with distinct layouts and collapsible sidebars.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Wouter for routing, TanStack Query for server state management, and Vite.
- **Backend**: Node.js and Express with TypeScript, implementing RESTful APIs with Zod for validation and type safety.
- **Authentication**: Replit Auth with OpenID Connect (OIDC) via Passport.js, using PostgreSQL for session management.
- **Data Storage**: PostgreSQL with Drizzle ORM for schema management.
- **API Structure**: Declarative API definitions using HTTP methods, paths, and Zod schemas.
- **Storage Abstraction**: A server-side abstraction layer provides flexible database operations.

### Feature Specifications
- **AI-Powered Trip Planning**: Includes AI Itinerary Builder, Real-Time Intelligence Widget, AI-powered Expert-Traveler Matching, and an AI Content Assistant. Features smart sequencing rules, rich metrics, and options for multi-city trip planning.
- **Expert Interaction**: Direct communication with local travel experts and an expert-editable itinerary card system with diff tracking and review workflows.
- **Shareable Itineraries**: Publicly accessible itinerary views with transport leg swapping, KML/GPX exports, and platform-aware map deep links.
- **Experience Planning System**: Template-based planning for various experience types with category-specific provider browsing, interactive map view, and AI Optimization.
- **Content Creation Studio**: A platform for travel experts to create various content types, integrated with Instagram Business API for publishing.
- **Role-Based Dashboards**: Tailored dashboards for Service Providers, Administrators, and Executive Assistants with tools for revenue optimization, analytics, and content management.
- **Logistics Intelligence Layer**: Shared functionality including multi-person RSVP tracking, vendor management, budget management, AI-powered scheduling optimization, and emergency services.
- **Spontaneous Activities & Live Intel Engine**: Real-time discovery of spontaneous opportunities and AI-powered discovery of hidden gems.
- **Revenue & Content Tracking**: Comprehensive platform-wide systems for tracking revenue, content creation, and moderation with audit trails.
- **Service Recommendation Engine**: AI-powered service opportunity recommendations based on trend data.

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
- **Google Maps**: Interactive mapping, route visualization, and transit information.
- **Amadeus Self-Service API**: Comprehensive travel content including real-time flight/hotel search, POI discovery, tours, activities, airport transfers, and destination safety ratings.
- **Viator Partner API**: Real-time tours and activities search.
- **Fever Partner API**: Event discovery and ticketing.
- **12Go Transportation Booking**: Affiliate widget for ground transportation bookings.
- **SERP API Hybrid Search System**: Integrates external providers via SerpAPI with native provider prioritization.
- **SerpAPI**: For venue searches (restaurants, attractions, nightlife).
- **AI Cost Tracking System**: Monitors AI usage and costs.
- **External API Cost Tracking System**: Monitors external API usage (e.g., Amadeus).
- **TravelPulse AI Intelligence System**: Generates and updates comprehensive city intelligence.
- **Content Enrichment System**: Merges AI-generated recommendations with booking/affiliate data.
- **External API Caching System**: Provides 24-hour caching for hotel, flight, and activity data.
- **Unified Experience Catalog Service**: Unifies search across cached provider data.