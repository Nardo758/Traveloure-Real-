# Traveloure - AI-Powered Travel Planning Platform

## Overview
Traveloure is an AI-powered, full-stack travel planning platform designed to offer personalized trip itineraries and connect users with expert travel advisors. It integrates advanced AI for personalization with human expertise, providing flexible travel planning options from AI-generated suggestions to guidance from local experts. The platform aims to capture a significant market share by catering to diverse travel needs and preferences.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (January 2026)
- **Traveloure Itinerary System**: Polished final itinerary view users receive after booking, featuring:
  - Smart activity sequencing with 10+ intelligent rules (spa after adventure, walk after meals, transport buffers, intensity balancing)
  - Methodology notes at activity, day, and itinerary levels explaining sequencing decisions
  - Rich metrics dashboard: cost breakdown by category, time allocation, physical intensity analysis
  - Activity balance scores (balance, diversity, pace, wellness) combined into overall Traveloure Score
  - Transport Package and Accommodation Package sections with booking status tracking
  - PDF export and calendar sync (.ics) capabilities
  - Navigation from Booking Confirmation and My Bookings pages
- **AI Quick Start Itinerary (Option 2)**: "Plan Now with AI" on TravelPulse city cards now generates an AI-powered itinerary using city intelligence (hidden gems, events, local insights). Features:
  - Auto-fetches TravelPulse data to inform AI generation
  - Day-by-day itinerary with activities, meals, transportation
  - "Customize This Trip" navigates to full experience builder
  - "Send to Expert" creates a trip record and connects users with local experts for refinement and bookable services
  - Form validation for dates and destination
- **Multi-City Trip Queue (Option 3)**: "Add to Multi-City Trip" queues destinations for batch planning. A floating indicator shows queued destinations with "Plan Trip with AI" functionality that pre-fills the experience template with all selected cities.
- **Content Creator Studio**: Complete content creation platform for travel experts with 10 content types (Travel Guide, Review, Top List, Photo Gallery, Video, Itinerary, Food Guide, Hotel Guide, Tips & Tricks, Travel Story). Features AI-powered title/description generation, hashtag suggestions, and destination intelligence.
- **Instagram Business API Integration**: Full OAuth flow for Instagram Business/Creator accounts, single and carousel image publishing, AI-generated hashtags, 24-hour publishing limit tracking (100 posts/day), accessible via Content Studio.
- **Landing Page Redesign**: Complete visual overhaul with Framer Motion animations, improved hero section with gradient text, modernized experience templates, updated stats/testimonials/FAQ sections
- **TrendingCities Component**: New section showing popular travel destinations with live updates toggle, category tags, pricing, traveler counts, and actionable travel tips
- **Design System Compliance**: Removed custom hover classes from Button components (relying on built-in behavior), added comprehensive data-testid attributes for testing, proper hover-elevate utility usage for non-button elements

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
- **Experience Planning System**: Template-based planning for various experience types (e.g., Travel, Wedding, Corporate) with category-specific provider browsing, interactive map view, and an AI Optimization tab for itinerary analysis. It features a dynamic template system with database-driven tabs, multi-level filtering, and comprehensive template support for 22+ experience types.
- **Reviews & Notifications**: User review and update system.
- **Role-Based Dashboards**: Dashboards for Service Providers, Administrators, and Executive Assistants.
- **Expert Tools Suite**: Comprehensive tools for travel experts to grow their business, including Revenue Optimization Dashboard, Expert Leaderboard, Business Analytics (with market intelligence from TravelPulse), and Templates & Quick Responses.
- **AI Assistant**: Task delegation, auto-draft responses, vendor research, and automated follow-ups.
- **Wallet & Billing**: Credit package purchasing, transaction history, and payment management.
- **Coordination Hub**: Tracks planning lifecycle, vendor availability, state management, and bookings.
- **Trip Transport Planner**: Intelligent transportation planning that analyzes all cart bookings to build a transport timeline, detect hotel transfer perks, and suggest actionable transport options.
- **Transportation Analysis & Map Integration**: Multi-modal transit analysis and route visualization using Google Maps and AI.
- **Logistics Intelligence Layer**: Provides shared functionality including multi-person RSVP tracking, vendor management, budget management, AI-powered scheduling optimization, and emergency services.
- **Spontaneous Activities & Live Intel Engine**: Real-time discovery of spontaneous opportunities from cached provider data with a scoring system.
- **AI Discovery System (Hidden Gems)**: Grok-powered discovery of authentic local secrets and off-the-beaten-path experiences.
- **Affiliate Web Scraping System**: AI-powered web scraping for partners without APIs, featuring partner management, Grok-powered HTML extraction, automatic affiliate link generation, and click tracking.
- **Content Tracking System**: Platform-wide content management and moderation with unique tracking numbers, 15 content types, statuses, moderation workflow, and version history. All content creation points automatically register content.
- **Revenue Tracking System**: Complete platform revenue tracking linked to content tracking, including platform revenue, provider earnings, provider payouts, and daily revenue summaries. It features automatic revenue recording on booking completion, template purchase, and expert tips, with content-linked audit trails.
- **Service Recommendation Engine**: AI-powered service opportunity recommendations based on TravelPulse trends, with templates for various recommendation types, displayed on Expert/Provider dashboards.

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
- **AI Cost Tracking System**: Platform-wide AI usage monitoring and cost analytics, tracking provider, model, operation, tokens, costs, and response times.
- **External API Cost Tracking System**: Platform-wide external API (Amadeus) usage monitoring.
- **TravelPulse AI Intelligence System**: Generates and updates comprehensive city intelligence daily.
- **Content Enrichment System**: Merges AI-generated recommendations with booking/affiliate data.
- **Google Maps**: Interactive mapping, route visualization, and transit information.
- **Amadeus Self-Service API**: Comprehensive travel content including real-time flight and hotel search, Points of Interest (POI) discovery, Tours and Activities search, Airport Transfer booking, and Destination Safety Ratings.
- **Viator Partner API**: Real-time tours and activities search.
- **Fever Partner API**: Event discovery and ticketing in global cities.
- **12Go Transportation Booking**: Affiliate widget for ground transportation bookings.
- **External API Caching System**: Provides 24-hour caching for hotel, flight, and activity data with background refreshers.
- **Unified Experience Catalog Service**: Unifies search across cached provider data (activities, hotels, events).
- **SERP API Hybrid Search System**: Integrates external providers via SerpAPI with native provider prioritization.
- **SerpAPI**: For venue searches (restaurants, attractions, nightlife).