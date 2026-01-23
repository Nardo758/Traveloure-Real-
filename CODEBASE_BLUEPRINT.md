# Traveloure - Complete Codebase Blueprint

## Table of Contents
1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Directory Structure](#directory-structure)
4. [Database Schema](#database-schema)
5. [Backend Architecture](#backend-architecture)
6. [Frontend Architecture](#frontend-architecture)
7. [AI Integration Layer](#ai-integration-layer)
8. [External API Integrations](#external-api-integrations)
9. [Authentication & Authorization](#authentication--authorization)
10. [Key Features & Components](#key-features--components)
11. [Data Flow Patterns](#data-flow-patterns)

---

## Project Overview

Traveloure is an AI-powered, full-stack travel planning platform that combines cutting-edge AI personalization with human expertise. The platform offers:

- **AI-Powered Trip Planning**: Autonomous itinerary generation using Grok AI
- **Expert Advisor Network**: Connect with local travel experts for personalized guidance
- **Experience Templates**: 22+ standardized templates for various travel experiences
- **Real-Time Intelligence**: Live destination data, events, and recommendations
- **Logistics Intelligence Layer**: Comprehensive backend services for coordination, budgeting, and emergency response

---

## Technology Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 | UI Framework |
| TypeScript | Type Safety |
| Vite | Build Tool & Dev Server |
| Wouter | Client-side Routing |
| TanStack Query v5 | Server State Management |
| Tailwind CSS | Styling |
| shadcn/ui | Component Library |
| Framer Motion | Animations |
| Google Maps API | Interactive Maps |

### Backend
| Technology | Purpose |
|------------|---------|
| Node.js | Runtime |
| Express | HTTP Server |
| TypeScript | Type Safety |
| Drizzle ORM | Database ORM |
| PostgreSQL (Neon) | Database |
| Passport.js | Authentication |
| Zod | Schema Validation |
| WebSocket | Real-time Communication |

### AI & External Services
| Service | Purpose |
|---------|---------|
| xAI Grok | Primary AI (matching, content, itineraries) |
| Anthropic Claude | Secondary AI (chat, optimization) |
| Amadeus API | Flights & Hotels |
| Viator API | Tours & Activities |
| Fever API | Events & Ticketing |
| Google Places | Location Data |
| SerpAPI | Venue Search |

---

## Directory Structure

```
traveloure/
├── client/                     # Frontend Application
│   └── src/
│       ├── pages/              # Route Components (49 pages)
│       │   ├── admin/          # Admin Dashboard Pages
│       │   ├── ea/             # Executive Assistant Pages
│       │   ├── expert/         # Expert Dashboard Pages
│       │   └── provider/       # Service Provider Pages
│       ├── components/         # Reusable Components
│       │   ├── ui/             # shadcn/ui Components (40+)
│       │   ├── logistics/      # Logistics Dashboard Components
│       │   └── travelpulse/    # TravelPulse AI Components
│       ├── hooks/              # Custom React Hooks
│       ├── lib/                # Utilities & Query Client
│       └── App.tsx             # Root Component & Router
│
├── server/                     # Backend Application
│   ├── services/               # Business Logic Services (27 services)
│   ├── seeds/                  # Database Seed Scripts
│   ├── routes.ts               # API Route Definitions (261KB)
│   ├── storage.ts              # Database Operations (75KB)
│   ├── db.ts                   # Database Connection
│   └── index.ts                # Server Entry Point
│
├── shared/                     # Shared Code
│   ├── schema.ts               # Database Schema (133KB)
│   ├── routes.ts               # API Route Types
│   ├── constants/              # Shared Constants
│   └── models/                 # Shared Data Models
│
└── Configuration Files
    ├── package.json            # Dependencies
    ├── tsconfig.json           # TypeScript Config
    ├── tailwind.config.ts      # Tailwind Config
    ├── drizzle.config.ts       # Drizzle Config
    └── vite.config.ts          # Vite Config
```

---

## Database Schema

### Core Tables (87 total)

#### User & Authentication
- `users` - User accounts (managed by Replit Auth)
- `sessions` - User sessions

#### Trip Planning
| Table | Description |
|-------|-------------|
| `trips` | User trip records |
| `generated_itineraries` | AI-generated itineraries |
| `itinerary_items` | Individual itinerary activities |
| `itinerary_variants` | Alternative itinerary versions |
| `itinerary_comparisons` | Side-by-side comparisons |
| `trip_selected_places` | User-selected destinations |
| `trip_selected_hotels` | User-selected accommodations |
| `trip_selected_flights` | User-selected flights |
| `trip_selected_services` | User-selected services |

#### Experience Templates
| Table | Description |
|-------|-------------|
| `experience_types` | Template definitions (22 types) |
| `experience_template_tabs` | Template tab configurations |
| `experience_template_filters` | Tab-specific filters |
| `experience_template_filter_options` | Filter option values |
| `experience_template_steps` | Wizard step definitions |
| `experience_universal_filters` | Cross-template filters |
| `experience_universal_filter_options` | Universal filter options |
| `user_experiences` | User's saved experiences |
| `user_experience_items` | Items within experiences |

#### Expert & Provider System
| Table | Description |
|-------|-------------|
| `local_expert_forms` | Expert applications |
| `service_provider_forms` | Provider applications |
| `expert_service_categories` | Expert service types |
| `expert_service_offerings` | Individual offerings |
| `expert_selected_services` | Expert's chosen services |
| `expert_specializations` | Expert specialization areas |
| `expert_custom_services` | Custom service definitions |
| `expert_match_scores` | AI-computed match scores |
| `user_and_expert_chats` | Chat messages |
| `user_and_expert_contracts` | Service contracts |

#### Logistics Intelligence
| Table | Description |
|-------|-------------|
| `trip_participants` | Multi-person RSVP tracking |
| `vendor_contracts` | Vendor contract management |
| `trip_transactions` | Budget/payment tracking |
| `trip_emergency_contacts` | Emergency contact info |
| `trip_alerts` | Safety/emergency alerts |
| `itinerary_items` | Scheduled activities |
| `coordination_states` | Planning state management |
| `coordination_bookings` | Booking coordination |

#### Caching & Performance
| Table | Description |
|-------|-------------|
| `hotel_cache` | Cached hotel data |
| `flight_cache` | Cached flight data |
| `activity_cache` | Cached activity data |
| `fever_event_cache` | Cached Fever events |
| `location_cache` | Cached location data |
| `city_media_cache` | Cached city images |

#### TravelPulse Intelligence
| Table | Description |
|-------|-------------|
| `travel_pulse_cities` | City intelligence data |
| `travel_pulse_live_scores` | Real-time pulse metrics |
| `travel_pulse_trending` | Trending destinations |
| `travel_pulse_hidden_gems` | Hidden gem discoveries |
| `travel_pulse_crowd_forecasts` | Crowd predictions |
| `travel_pulse_calendar_events` | Destination events |

---

## Backend Architecture

### Service Layer (27 Services)

#### AI Services
```
server/services/
├── ai-orchestrator.ts              # Routes AI requests to appropriate provider
├── grok.service.ts                 # xAI Grok integration
├── claude.service.ts               # Anthropic Claude integration
├── ai-recommendation-engine.service.ts  # Recommendation logic
└── trip-optimization.service.ts    # AI itinerary optimization
```

#### Core Business Services
```
server/services/
├── budget.service.ts               # Transaction logging, cost splitting, currency conversion
├── coordination.service.ts         # Multi-person RSVP, dietary/accessibility management
├── vendor-management.service.ts    # Contract tracking, payment milestones
├── itinerary-intelligence.service.ts  # AI scheduling optimization
└── emergency.service.ts            # Emergency contacts, alerts, rebooking
```

#### External API Services
```
server/services/
├── amadeus.service.ts              # Flights & Hotels API
├── viator.service.ts               # Tours & Activities API
├── fever.service.ts                # Events & Ticketing API
├── serp.service.ts                 # Venue search via SerpAPI
├── pexels.service.ts               # Stock photos
├── unsplash.service.ts             # Stock photos
└── google-places-photos.service.ts # Google Places photos
```

#### Caching & Performance
```
server/services/
├── cache.service.ts                # Generic caching logic
├── cache-scheduler.service.ts      # Background cache refresh
├── fever-cache.service.ts          # Fever-specific caching
└── routes.service.ts               # Route optimization
```

#### Intelligence Services
```
server/services/
├── travelpulse.service.ts          # City intelligence generation
├── travelpulse-scheduler.service.ts # Daily intelligence updates
├── content-enrichment.service.ts   # Merge AI with real booking data
└── media-aggregator.service.ts     # Aggregate media from multiple sources
```

### API Routes Structure

The `server/routes.ts` file (261KB) defines all API endpoints organized by domain:

#### Public Endpoints
```
GET  /api/experience-types          # List experience templates
GET  /api/experience-types/:slug    # Get template by slug
GET  /api/experts                   # List travel experts
GET  /api/experts/:id               # Get expert details
GET  /api/service-categories        # List service categories
GET  /api/faqs                      # FAQ content
GET  /api/destination-calendar/*    # Calendar events
```

#### Protected Endpoints (require authentication)
```
# Trip Management
GET    /api/trips                   # List user's trips
POST   /api/trips                   # Create new trip
PATCH  /api/trips/:id               # Update trip
DELETE /api/trips/:id               # Delete trip
POST   /api/trips/:id/generate-itinerary  # Generate AI itinerary

# User Experiences
GET    /api/user-experiences        # List saved experiences
POST   /api/user-experiences        # Create experience
PATCH  /api/user-experiences/:id    # Update experience
DELETE /api/user-experiences/:id    # Delete experience

# Expert Interaction
POST   /api/expert-booking-requests # Request expert booking
GET    /api/chats                   # List chat conversations
POST   /api/chats                   # Send message

# Wallet & Billing
GET    /api/wallet                  # Get wallet balance
POST   /api/wallet/add-credits      # Purchase credits
GET    /api/wallet/transactions     # Transaction history

# AI Features
POST   /api/ai/generate-blueprint   # Generate AI blueprint
POST   /api/ai/chat                 # AI chat interaction
POST   /api/ai/optimize-experience  # Optimize itinerary
```

#### Admin Endpoints
```
GET    /api/admin/stats             # Dashboard statistics
GET    /api/admin/expert-applications    # Pending expert apps
PATCH  /api/admin/expert-applications/:id/status  # Approve/reject
GET    /api/admin/provider-applications  # Pending provider apps
POST   /api/admin/seed-categories   # Seed category data
```

---

## Frontend Architecture

### Page Structure (49 pages)

#### Public Pages
| Page | Path | Description |
|------|------|-------------|
| Landing | `/` | Home page with hero & features |
| Experiences | `/experiences` | Browse experience templates |
| Experience Template | `/experiences/:slug` | Template-specific planning |
| Experts | `/experts` | Browse travel experts |
| Discover | `/discover` | Explore destinations |
| Help Me Decide | `/help-me-decide` | AI-guided trip selection |
| Pricing | `/pricing` | Pricing information |

#### Authenticated Pages
| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/dashboard` | User dashboard |
| My Trips | `/my-trips` | Trip management |
| Itinerary | `/itinerary/:id` | View/edit itinerary |
| Chat | `/chat` | Expert chat interface |
| Cart | `/cart` | Shopping cart |
| Wallet | `/credits-billing` | Credits & billing |

#### Role-Based Dashboards
| Role | Path Prefix | Pages |
|------|-------------|-------|
| Admin | `/admin/*` | Stats, Applications, Categories, Services |
| Expert | `/expert/*` | Dashboard, Clients, Services, Bookings |
| Provider | `/provider/*` | Dashboard, Services, Analytics |
| EA | `/ea/*` | Dashboard, Tasks, Clients |

### Component Library

#### UI Components (shadcn/ui - 40+ components)
```
client/src/components/ui/
├── button.tsx          # Button variants
├── card.tsx            # Card container
├── dialog.tsx          # Modal dialogs
├── form.tsx            # Form with validation
├── input.tsx           # Text inputs
├── select.tsx          # Dropdowns
├── tabs.tsx            # Tab navigation
├── sidebar.tsx         # Sidebar navigation
├── toast.tsx           # Notifications
└── ... (35+ more)
```

#### Feature Components
```
client/src/components/
├── ai-itinerary-builder.tsx       # AI itinerary wizard
├── experience-map.tsx             # Google Maps integration
├── expert-chat-widget.tsx         # Chat interface
├── flight-search.tsx              # Flight search UI
├── hotel-search.tsx               # Hotel search UI
├── activity-search.tsx            # Activity search UI
├── real-time-intel-widget.tsx     # Live intelligence display
├── template-filters-panel.tsx     # Dynamic filter rendering
├── transportation-analysis.tsx    # Route analysis UI
└── destination-calendar.tsx       # Event calendar
```

#### Logistics Components
```
client/src/components/logistics/
├── trip-logistics-dashboard.tsx   # Main logistics view
├── participant-management.tsx     # RSVP tracking
├── budget-tracker.tsx             # Budget management
├── vendor-contracts.tsx           # Contract overview
└── emergency-panel.tsx            # Emergency info
```

### Hooks
```
client/src/hooks/
├── use-auth.ts           # Authentication state
├── use-trips.ts          # Trip data management
├── use-chat.ts           # Chat functionality
├── use-websocket.ts      # WebSocket connection
├── use-toast.ts          # Toast notifications
└── use-mobile.tsx        # Mobile detection
```

---

## AI Integration Layer

### Dual AI System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Orchestrator                           │
│                 (server/services/ai-orchestrator.ts)         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────┐    ┌─────────────────────┐        │
│  │     Grok (xAI)      │    │  Anthropic Claude   │        │
│  ├─────────────────────┤    ├─────────────────────┤        │
│  │ - Expert Matching   │    │ - Empathetic Chat   │        │
│  │ - Content Gen       │    │ - Itinerary Optim   │        │
│  │ - Itinerary Build   │    │ - Transport Analysis│        │
│  │ - Real-time Intel   │    │ - Nuanced Advice    │        │
│  │ - TravelPulse       │    │                     │        │
│  └─────────────────────┘    └─────────────────────┘        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### AI Feature Implementations

1. **AI Itinerary Builder** (`ai-itinerary-builder.tsx`)
   - Multi-step wizard interface
   - Autonomous generation via Grok
   - Real-time streaming responses

2. **Expert Matching** (`grok.service.ts`)
   - Compute match scores based on preferences
   - Generate matching reasoning

3. **Content Assistant** (`grok.service.ts`)
   - Generate expert bios
   - Create service descriptions
   - Draft inquiry responses

4. **TravelPulse Intelligence** (`travelpulse.service.ts`)
   - Daily city intelligence updates
   - Pulse metrics & trending analysis
   - Hidden gems discovery

5. **Itinerary Optimization** (`trip-optimization.service.ts`)
   - Efficiency scoring
   - Route optimization
   - Time management suggestions

---

## External API Integrations

### Travel APIs

#### Amadeus Self-Service
```typescript
// server/services/amadeus.service.ts
- Flight search (one-way, round-trip)
- Hotel search & offers
- 24-hour response caching
```

#### Viator Partner API
```typescript
// server/services/viator.service.ts
- Tours & activities search
- Booking deep links
- Category-based filtering
```

#### Fever Partner API
```typescript
// server/services/fever.service.ts
- Event discovery (29 cities)
- Multiple event categories
- Ticket booking integration
```

#### 12Go Transportation
```typescript
// client/src/components/TwelveGoTransport.tsx
- Ground transportation (trains, buses, ferries)
- Affiliate widget integration
- Deep linking capabilities
```

### Media APIs

| API | Service File | Usage |
|-----|--------------|-------|
| Google Places | `google-places-photos.service.ts` | Location photos |
| Pexels | `pexels.service.ts` | Stock imagery |
| Unsplash | `unsplash.service.ts` | Stock imagery |
| SerpAPI | `serp.service.ts` | Venue search |

### Caching Strategy

```
┌─────────────────────────────────────────────────┐
│              Cache Layer (24-hour TTL)           │
├─────────────────────────────────────────────────┤
│  hotel_cache      │ Hotel search results         │
│  flight_cache     │ Flight search results        │
│  activity_cache   │ Tour/activity data           │
│  fever_event_cache│ Event listings               │
│  location_cache   │ Geocoding results            │
│  city_media_cache │ City imagery                 │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│         Background Scheduler                     │
│     (cache-scheduler.service.ts)                 │
│  - Refreshes stale data automatically           │
│  - Maintains cache health                        │
└─────────────────────────────────────────────────┘
```

---

## Authentication & Authorization

### Replit Auth Integration

```typescript
// Authentication Flow
1. User clicks "Login"
2. Redirect to Replit OIDC provider
3. Callback with user claims
4. Create/update user in database
5. Establish session (PostgreSQL-backed)
```

### Session Management
```typescript
// server/index.ts
- express-session with connect-pg-simple
- Secure session cookies
- 24-hour session expiry
```

### Role-Based Access Control

| Role | Access Level |
|------|--------------|
| `user` | Basic trip planning, bookings |
| `expert` | Expert dashboard, client management |
| `provider` | Service provider dashboard |
| `admin` | Full administrative access |
| `ea` | Executive assistant features |

### Route Protection

```typescript
// Middleware Pattern
const isAuthenticated = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// Role Verification
const isAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};
```

---

## Key Features & Components

### Experience Planning System

#### 22 Experience Templates
| Template | Tabs | Modes |
|----------|------|-------|
| Travel | Activities, Hotels, Services, Dining, Flights, Transportation | Single |
| Wedding | Venues, Vendors, Services, Guest Accommodations, Transportation, Rehearsal | Dual (Planning/Guest) |
| Proposal | Locations, Services, Celebration Dining, Post-Proposal Activities, Accommodations | Single |
| Date Night | Dining, Activities, Entertainment, Services, Transportation | Single |
| Birthday | Venues, Activities, Dining, Entertainment, Services, Accommodations | Single |
| Corporate Events | Venues, Team Activities, Services, Dining, Transportation, Accommodations | Single |
| Reunions | Venues, Activities, Services, Dining, Accommodations, Transportation | Single |
| Retreats | Venues, Activities, Services, Dining, Accommodations, Wellness | Single |
| Bachelor/Bachelorette | 8 tabs with logistics-focused filters | Single |
| Anniversary | 8 tabs with romance-focused filters | Single |

#### Universal Filters
- **Sort Options**: Most Popular, Price: Low to High, Price: High to Low, Highest Rated
- **Rating Filter**: All, 3+, 3.5+, 4+, 4.5+
- **Date Range**: Custom date selection
- **Budget**: Price range slider
- **Booking Status**: Available, Booked
- **Expert Verified**: Toggle

### Logistics Intelligence Layer

#### Coordination Service
```typescript
// Multi-person RSVP tracking
- Participant management
- Dietary restrictions
- Accessibility needs
- Payment collection
- Group communication
```

#### Budget Service
```typescript
// Transaction logging
- Cost splitting (equal/percentage/custom)
- Currency conversion (12 currencies)
- Tip calculation (11 countries)
- Real-time budget tracking
```

#### Vendor Management
```typescript
// Contract tracking
- Deposit schedules
- Payment milestones
- Communication logging
- Document management
```

#### Emergency Service
```typescript
// Safety features
- Emergency contacts
- Alert management (severity levels)
- Embassy information
- Emergency numbers
- Rebooking assistance
```

---

## Data Flow Patterns

### Query Pattern (TanStack Query)

```typescript
// Fetching data
const { data, isLoading } = useQuery({
  queryKey: ['/api/trips'],
});

// Mutations with cache invalidation
const mutation = useMutation({
  mutationFn: (data) => apiRequest('/api/trips', 'POST', data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/trips'] });
  },
});
```

### WebSocket Pattern

```typescript
// Real-time updates
const { sendMessage, lastMessage } = useWebSocket('/ws');

// Subscribe to channels
sendMessage(JSON.stringify({ type: 'subscribe', channel: 'trip:123' }));

// Handle incoming messages
useEffect(() => {
  if (lastMessage) {
    const data = JSON.parse(lastMessage.data);
    // Update local state
  }
}, [lastMessage]);
```

### API Request Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Express    │────▶│   Storage    │
│   (React)    │     │   Routes     │     │   (Drizzle)  │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │                    ▼                    │
       │            ┌──────────────┐             │
       │            │   Services   │             │
       │            │  (AI, Cache) │             │
       │            └──────────────┘             │
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  TanStack    │     │  External    │     │  PostgreSQL  │
│   Query      │     │    APIs      │     │   (Neon)     │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## Development Commands

```bash
# Start development server
npm run dev

# Database operations
npm run db:push        # Push schema changes
npm run db:push --force # Force schema sync
npm run db:generate    # Generate migrations
npm run db:migrate     # Run migrations

# Type checking
npm run typecheck

# Build for production
npm run build
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REPLIT_DOMAINS` | Allowed domains for OIDC |
| `ISSUER_URL` | Replit Auth issuer |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | xAI Grok API key |
| `ANTHROPIC_API_KEY` | Claude API key |
| `AMADEUS_CLIENT_ID` | Amadeus API credentials |
| `AMADEUS_CLIENT_SECRET` | Amadeus API credentials |
| `VIATOR_API_KEY` | Viator API key |
| `FEVER_API_KEY` | Fever API key |
| `GOOGLE_MAPS_API_KEY` | Google Maps key |
| `SERP_API_KEY` | SerpAPI key |

---

*Last Updated: January 2026*
*Version: 1.0*
