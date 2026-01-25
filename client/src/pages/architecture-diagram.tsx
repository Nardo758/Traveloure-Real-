import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ArchitectureDiagram() {
  const architectureDiagram = `
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TRAVELOURE SYSTEM ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React 18 + TypeScript + Vite)                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│  Experience Templates (22+):                                                     │
│  ├── Travel Template                                                             │
│  ├── Wedding Template                                                            │
│  ├── Bachelor/Bachelorette Template                                              │
│  ├── Corporate Event Template                                                    │
│  ├── Family Reunion Template                                                     │
│  ├── Anniversary Template                                                        │
│  ├── Honeymoon Template                                                          │
│  └── All other experience templates...                                           │
│                                                                                  │
│  Role-Based Dashboards:                                                          │
│  ├── Provider Dashboard                                                          │
│  ├── Admin Dashboard                                                             │
│  └── Executive Assistant Dashboard                                               │
│                                                                                  │
│  Core Components:                                                                │
│  ├── Trip Transport Planner                                                      │
│  ├── AI Itinerary Builder                                                        │
│  ├── Expert Matching UI                                                          │
│  ├── Hidden Gems Discovery                                                       │
│  ├── Amadeus POIs / Transfers / Safety                                           │
│  └── Google Maps Integration                                                     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                         ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│  BACKEND INTELLIGENCE LAYER (Express + Node.js + TypeScript)                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│  AI Services:                                                                    │
│  ├── AI Orchestrator (Routes to Grok / Claude)                                   │
│  ├── Grok (xAI) - Expert Matching, City Intelligence, Content Generation        │
│  ├── Anthropic Claude - Chat, Itinerary Optimization, Transport Analysis        │
│  └── TravelPulse AI Intelligence System                                         │
│                                                                                  │
│  Core Services:                                                                  │
│  ├── Payment Orchestration Service                                               │
│  ├── Multi-Person Coordination Engine                                            │
│  ├── Vendor Management System                                                    │
│  ├── Itinerary Optimization Algorithm                                            │
│  ├── Budget Intelligence Service                                                 │
│  ├── Emergency Response Protocol                                                 │
│  └── Spontaneous Activities Engine                                               │
│                                                                                  │
│  Integration Services:                                                           │
│  ├── Amadeus Service (Flights, Hotels, POIs, Transfers, Safety)                  │
│  ├── Viator Partner API (Tours & Activities)                                     │
│  ├── Fever Partner API (Events & Tickets)                                        │
│  ├── 12Go Affiliate Integration (Ground Transport)                               │
│  ├── SerpAPI Hybrid Search (Venues, Restaurants)                                 │
│  ├── Unified Experience Catalog Service                                          │
│  └── Affiliate Web Scraping System                                               │
│                                                                                  │
│  Supporting Services:                                                            │
│  ├── External API Caching (24hr cache)                                           │
│  ├── Authentication (Replit Auth + OIDC)                                         │
│  └── Content Enrichment System                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                         ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│  DATABASE (PostgreSQL + Drizzle ORM)                                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│  Core Tables:                                                                    │
│  ├── users, sessions, trips, itineraries                                         │
│  ├── experts, providers, bookings                                                │
│  ├── reviews, notifications, credits                                             │
│  └── wallet_transactions, credit_packages                                        │
│                                                                                  │
│  Cache Tables:                                                                   │
│  ├── poi_cache (Points of Interest)                                              │
│  ├── transfer_cache (Airport Transfers)                                          │
│  ├── safety_cache (Destination Safety Ratings)                                   │
│  ├── hotel_cache, flight_cache, activity_cache                                   │
│  └── fever_events_cache                                                          │
│                                                                                  │
│  Affiliate Tables:                                                               │
│  ├── affiliate_partners                                                          │
│  ├── affiliate_products                                                          │
│  ├── affiliate_scrape_jobs                                                       │
│  └── affiliate_clicks                                                            │
│                                                                                  │
│  Template Tables:                                                                │
│  ├── experience_templates                                                        │
│  ├── template_tabs                                                               │
│  └── template_filters                                                            │
└─────────────────────────────────────────────────────────────────────────────────┘
                                         ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│  EXTERNAL INTEGRATIONS                                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│  Travel APIs:                                                                    │
│  ├── Amadeus Self-Service API                                                    │
│  ├── Viator Partner API                                                          │
│  ├── Fever Partner API                                                           │
│  └── 12Go Asia (Affiliate ID: 13805109)                                          │
│                                                                                  │
│  AI Providers:                                                                   │
│  ├── xAI (Grok)                                                                  │
│  └── Anthropic (Claude)                                                          │
│                                                                                  │
│  Other Services:                                                                 │
│  ├── Google Maps API                                                             │
│  ├── SerpAPI                                                                     │
│  └── Replit Auth (OIDC)                                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
`;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6" data-testid="text-page-title">
          Traveloure System Architecture
        </h1>
        
        <Card>
          <CardHeader>
            <CardTitle data-testid="text-diagram-title">Architecture Diagram</CardTitle>
          </CardHeader>
          <CardContent>
            <pre 
              className="text-xs sm:text-sm font-mono bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre"
              data-testid="text-architecture-diagram"
            >
              {architectureDiagram}
            </pre>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg" data-testid="text-frontend-title">Frontend Stack</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="space-y-1">
                <li>React 18 + TypeScript</li>
                <li>Vite build tool</li>
                <li>TanStack Query</li>
                <li>Wouter routing</li>
                <li>Tailwind CSS + shadcn/ui</li>
                <li>Framer Motion</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg" data-testid="text-backend-title">Backend Stack</CardTitle>
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
            <CardHeader>
              <CardTitle className="text-lg" data-testid="text-integrations-title">Key Integrations</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="space-y-1">
                <li>Amadeus API</li>
                <li>Viator Partner API</li>
                <li>Fever Partner API</li>
                <li>12Go Asia Affiliate</li>
                <li>Google Maps</li>
                <li>Grok + Claude AI</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
