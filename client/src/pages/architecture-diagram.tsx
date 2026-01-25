import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ArchitectureDiagram() {
  const architectureDiagram = `
╔═══════════════════════════════════════════════════════════════════════════════════════════════════╗
║                              TRAVELOURE - AI-POWERED TRAVEL PLANNING PLATFORM                      ║
║                                        SYSTEM ARCHITECTURE                                         ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════╝


┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND LAYER (React 18 + TypeScript + Vite + TanStack Query + Wouter)                          │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  EXPERIENCE TEMPLATES (22+ Template Types)                                                  │  │
│  │                                                                                             │  │
│  │  Row 1:  Travel  │  Wedding  │  Proposal  │  Romance  │  Birthday  │  Corporate             │  │
│  │  Row 2:  Boys Trip  │  Girls Trip  │  Date Night  │  Corporate Events  │  Reunions          │  │
│  │  Row 3:  Wedding Anniversary  │  Retreats  │  Baby Shower  │  Honeymoon  │  Bachelor/ette   │  │
│  │  Row 4:  Family Reunion  │  Graduation  │  Religious Pilgrimage  │  Adventure  │  Wellness  │  │
│  │  Row 5:  Cultural Immersion  │  Food & Wine  │  Photography Tour  │  Solo Travel           │  │
│  │                                                                                             │  │
│  │  Shared Template Features:                                                                  │  │
│  │  ├── Dynamic tab system with category-specific content (Flights, Hotels, Activities, etc.)  │  │
│  │  ├── Multi-level filtering (single_select, multi_select, range, toggle filter types)       │  │
│  │  ├── Universal filters (date range, budget, booking status, traveler count)                │  │
│  │  ├── Interactive map view with provider locations and route visualization                  │  │
│  │  ├── AI Optimization tab for itinerary analysis and suggestions                            │  │
│  │  ├── Transportation tab with Trip Transport Planner integration                            │  │
│  │  ├── Cart integration with real-time booking management                                    │  │
│  │  ├── Real-time availability checking across all providers                                  │  │
│  │  └── Provider comparison, reviews, and ratings                                             │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  TRIP TRANSPORT PLANNER                                                                     │  │
│  │  Features:                                                                                  │  │
│  │  ├── Analyzes all cart bookings (flights, hotels, activities)                               │  │
│  │  ├── Builds transport timeline segments:                                                    │  │
│  │  │   • Airport → Hotel (arrival)                                                            │  │
│  │  │   • Hotel → Activities                                                                   │  │
│  │  │   • Activity → Activity                                                                  │  │
│  │  │   • Hotel → Airport (departure)                                                          │  │
│  │  ├── Hotel transfer perk detection (shows "Covered" if included)                            │  │
│  │  ├── Flight sorting by departure time for arrival/departure identification                  │  │
│  │  └── Transport options: Google Transit, Amadeus transfers, taxi/ride-share, 12Go affiliate  │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  AI-POWERED FEATURES                                                                        │  │
│  │  ├── AI Itinerary Builder      │  Autonomous trip planning with Grok                        │  │
│  │  ├── Real-Time Intelligence    │  Live travel updates and alerts                            │  │
│  │  ├── Expert-Traveler Matching  │  AI-powered matching with local experts                    │  │
│  │  ├── AI Content Assistant      │  Helps experts create service descriptions                 │  │
│  │  ├── Hidden Gems Discovery     │  12-category local secrets finder                          │  │
│  │  └── Spontaneous Activities    │  Real-time opportunity discovery with urgency scoring      │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  ROLE-BASED DASHBOARDS                                                                      │  │
│  │  ├── Provider Dashboard        │  Features: Bookings, Services, Earnings, Calendar         │  │
│  │  ├── Admin Dashboard           │  Features: Users, Analytics, Revenue, System Config       │  │
│  │  └── Executive Assistant       │  Features: Executives, Events, Travel, Communications     │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  CORE UI COMPONENTS                                                                         │  │
│  │  ├── Amadeus POIs              │  Points of Interest discovery with categories              │  │
│  │  ├── Amadeus Transfers         │  Airport transfer booking with vehicle options             │  │
│  │  ├── Amadeus Safety            │  6-category safety ratings (LGBTQ+, medical, theft, etc.)  │  │
│  │  ├── Google Maps Integration   │  Interactive mapping and route visualization               │  │
│  │  ├── Expert Advisor Chat       │  Direct communication with travel experts                  │  │
│  │  ├── Wallet & Billing          │  Credit packages, transactions, payment management         │  │
│  │  └── Reviews & Notifications   │  User reviews and real-time updates                        │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                 ↓
                                                 ↓
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│  BACKEND INTELLIGENCE LAYER (Express + Node.js + TypeScript + Zod)                                │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  DUAL AI SYSTEM                                                                             │  │
│  │  ├── AI Orchestrator           │  Routes requests to appropriate AI provider                │  │
│  │  ├── Grok (xAI)                │  Expert matching, city intelligence, content generation,  │  │
│  │  │                             │  autonomous itinerary building, hidden gems discovery      │  │
│  │  ├── Anthropic Claude          │  Empathetic chat, itinerary optimization, transport        │  │
│  │  │                             │  analysis, nuanced travel advice                           │  │
│  │  └── TravelPulse AI            │  Daily city intelligence updates                           │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  LOGISTICS INTELLIGENCE LAYER                                                               │  │
│  │  ├── Payment Orchestration     │  Secure payment processing and transaction management      │  │
│  │  ├── Multi-Person Coordination │  RSVP tracking, group management, shared planning          │  │
│  │  ├── Vendor Management         │  Provider onboarding, availability, communication          │  │
│  │  ├── Itinerary Optimization    │  AI-powered scheduling and route optimization              │  │
│  │  ├── Budget Intelligence       │  Cost splitting, currency conversion, tip calculation      │  │
│  │  ├── Emergency Response        │  Crisis protocols and emergency contact management         │  │
│  │  └── Coordination Hub          │  Planning lifecycle, state management, bookings            │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  INTEGRATION SERVICES                                                                       │  │
│  │  ├── Amadeus Service           │  Flights, hotels, POIs, transfers, tours, safety ratings  │  │
│  │  ├── Viator Partner API        │  Real-time tours and activities with booking               │  │
│  │  ├── Fever Partner API         │  Event discovery and ticketing in global cities            │  │
│  │  ├── 12Go Affiliate            │  Ground transport (trains, buses, ferries) ID: 13805109   │  │
│  │  ├── SerpAPI Hybrid Search     │  Venue searches with native provider prioritization        │  │
│  │  ├── Unified Experience Catalog│  Cross-provider search with template-driven retrieval      │  │
│  │  └── Content Enrichment        │  Merges AI recommendations with booking/affiliate data     │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  AFFILIATE WEB SCRAPING SYSTEM                                                              │  │
│  │  ├── Partner Management        │  Tracking IDs, commission rates, status                    │  │
│  │  ├── AI-Powered Extraction     │  Grok converts HTML to structured product data             │  │
│  │  ├── Link Generation           │  Automatic affiliate link creation with templates          │  │
│  │  ├── Click Tracking            │  Attribution for commission calculation                    │  │
│  │  └── Admin UI                  │  /admin/affiliate-partners for CRUD and scrape triggers    │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  CACHING & PERFORMANCE                                                                      │  │
│  │  ├── External API Cache        │  24-hour caching for hotel, flight, activity data          │  │
│  │  ├── Background Refreshers     │  Automatic cache updates for fresh data                    │  │
│  │  ├── POI/Transfer/Safety Cache │  Amadeus data caching for performance                      │  │
│  │  └── Fever Events Cache        │  Event data caching with expiration                        │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  AUTHENTICATION & SECURITY                                                                  │  │
│  │  ├── Replit Auth (OIDC)        │  OpenID Connect via Passport.js                            │  │
│  │  ├── Session Management        │  PostgreSQL-backed sessions with connect-pg-simple         │  │
│  │  ├── Role-Based Access Control │  Provider, Admin, EA, Expert, User roles                   │  │
│  │  └── Ownership Verification    │  Resource-level permission checking                        │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                 ↓
                                                 ↓
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│  DATABASE LAYER (PostgreSQL + Drizzle ORM)                                                        │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  CORE DATA MODELS                                                                           │  │
│  │  ├── users                     │  User accounts, profiles, preferences                      │  │
│  │  ├── sessions                  │  Authentication sessions                                   │  │
│  │  ├── trips                     │  Trip details, destinations, dates                         │  │
│  │  ├── itineraries               │  Day-by-day trip plans                                     │  │
│  │  ├── bookings                  │  Reservation records                                       │  │
│  │  ├── experts                   │  Travel expert profiles and specializations               │  │
│  │  ├── providers                 │  Service provider accounts                                 │  │
│  │  ├── reviews                   │  User reviews and ratings                                  │  │
│  │  ├── notifications             │  User notification queue                                   │  │
│  │  ├── credits                   │  User credit balances                                      │  │
│  │  ├── wallet_transactions       │  Payment history                                           │  │
│  │  └── credit_packages           │  Available credit packages for purchase                    │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  CACHE TABLES                                                                               │  │
│  │  ├── poi_cache                 │  Amadeus Points of Interest cache                          │  │
│  │  ├── transfer_cache            │  Airport transfer options cache                            │  │
│  │  ├── safety_cache              │  Destination safety ratings cache                          │  │
│  │  ├── hotel_cache               │  Hotel search results cache                                │  │
│  │  ├── flight_cache              │  Flight search results cache                               │  │
│  │  ├── activity_cache            │  Activities and tours cache                                │  │
│  │  └── fever_events_cache        │  Fever events data cache                                   │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  AFFILIATE TABLES                                                                           │  │
│  │  ├── affiliate_partners        │  Partner info, tracking IDs, commission rates              │  │
│  │  ├── affiliate_products        │  Scraped product data with affiliate links                 │  │
│  │  ├── affiliate_scrape_jobs     │  Scraping job status and history                           │  │
│  │  └── affiliate_clicks          │  Click tracking for attribution                            │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  TEMPLATE TABLES                                                                            │  │
│  │  ├── experience_templates      │  22+ template definitions                                  │  │
│  │  ├── template_tabs             │  Tab configurations per template                           │  │
│  │  └── template_filters          │  Filter definitions per template                           │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                 ↓
                                                 ↓
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│  EXTERNAL INTEGRATIONS                                                                            │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                   │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐  ┌─────────────────────────────┐│
│  │  TRAVEL APIs               │  │  AI PROVIDERS               │  │  OTHER SERVICES             ││
│  │  ├── Amadeus Self-Service  │  │  ├── xAI (Grok)             │  │  ├── Google Maps API        ││
│  │  │   • Flights             │  │  │   • Expert Matching       │  │  │   • Maps                 ││
│  │  │   • Hotels              │  │  │   • City Intelligence     │  │  │   • Directions           ││
│  │  │   • Points of Interest  │  │  │   • Content Generation    │  │  │   • Transit              ││
│  │  │   • Tours & Activities  │  │  │   • Hidden Gems           │  │  │   • Places               ││
│  │  │   • Airport Transfers   │  │  │                           │  │  │                          ││
│  │  │   • Safety Ratings      │  │  ├── Anthropic (Claude)      │  │  ├── SerpAPI               ││
│  │  │                         │  │  │   • Chat                  │  │  │   • Venue Search         ││
│  │  ├── Viator Partner API    │  │  │   • Optimization          │  │  │   • Restaurants          ││
│  │  │   • Tours & Activities  │  │  │   • Transport Analysis    │  │  │   • Attractions          ││
│  │  │   • Real-time Booking   │  │  │   • Travel Advice         │  │  │   • Nightlife            ││
│  │  │                         │  │  │                           │  │  │                          ││
│  │  ├── Fever Partner API     │  │  └───────────────────────────│  │  ├── Replit Auth (OIDC)    ││
│  │  │   • Events & Tickets    │  │                              │  │  │   • Authentication       ││
│  │  │   • Global Cities       │  │                              │  │  │   • Session Management   ││
│  │  │                         │  │                              │  │  │                          ││
│  │  └── 12Go Asia Affiliate   │  │                              │  │  └───────────────────────────││
│  │      • Trains              │  │                              │  │                              ││
│  │      • Buses               │  │                              │  │                              ││
│  │      • Ferries             │  │                              │  │                              ││
│  │      • ID: 13805109        │  │                              │  │                              ││
│  └─────────────────────────────┘  └─────────────────────────────┘  └─────────────────────────────┘│
│                                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘


╔═══════════════════════════════════════════════════════════════════════════════════════════════════╗
║  KEY AFFILIATE PARTNERS                                                                           ║
╠═══════════════════════════════════════════════════════════════════════════════════════════════════╣
║  • 12Go Asia         │  Tracking ID: 13805109       │  Ground transportation across Asia          ║
║  • Musement          │  Tracking ID: traveloure-llc-3497  │  Tours and activities                 ║
║  • Klook             │  Tracking ID: 104866         │  Activities and experiences                 ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════╝
`;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6" data-testid="text-page-title">
          Traveloure System Architecture
        </h1>
        
        <Card>
          <CardHeader>
            <CardTitle data-testid="text-diagram-title">Complete Architecture Diagram</CardTitle>
          </CardHeader>
          <CardContent>
            <pre 
              className="text-[10px] sm:text-xs md:text-sm font-mono bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre leading-relaxed"
              data-testid="text-architecture-diagram"
            >
              {architectureDiagram}
            </pre>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" data-testid="text-frontend-title">Frontend Stack</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="space-y-1">
                <li>React 18 + TypeScript</li>
                <li>Vite build tool</li>
                <li>TanStack Query</li>
                <li>Wouter routing</li>
                <li>Tailwind + shadcn/ui</li>
                <li>Framer Motion</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" data-testid="text-backend-title">Backend Stack</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="space-y-1">
                <li>Node.js + Express</li>
                <li>TypeScript</li>
                <li>Zod validation</li>
                <li>RESTful APIs</li>
                <li>Passport.js (OIDC)</li>
                <li>Drizzle ORM</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" data-testid="text-ai-title">AI Systems</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="space-y-1">
                <li>Grok (xAI) - Matching</li>
                <li>Claude - Chat/Optimization</li>
                <li>AI Orchestrator</li>
                <li>TravelPulse Intelligence</li>
                <li>Hidden Gems Discovery</li>
                <li>Content Enrichment</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" data-testid="text-integrations-title">Integrations</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="space-y-1">
                <li>Amadeus API</li>
                <li>Viator Partner API</li>
                <li>Fever Partner API</li>
                <li>12Go Asia Affiliate</li>
                <li>Google Maps</li>
                <li>SerpAPI</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
