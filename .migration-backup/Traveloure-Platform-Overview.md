# Traveloure — Platform Overview Document

**Document Date:** June 2026
**Platform Type:** AI-Powered Travel Planning Web Application

---

## What Is Traveloure?

Traveloure is a full-featured travel planning website that helps people plan trips using artificial intelligence. Instead of spending hours researching destinations, building schedules, and booking transport separately, users get personalized travel itineraries in seconds — and can connect with real local travel experts for additional guidance.

The platform serves three types of users:
- **Travelers** — people planning a trip
- **Travel Experts** — local guides and advisors who help travelers
- **Service Providers** — hotels, tour operators, and activity vendors

---

## What Does the Website Do?

At its core, Traveloure does three things:

1. **Generates complete trip itineraries using AI** — a traveler enters a destination, dates, and budget, and the AI produces a day-by-day plan with activities, transport, and recommendations.
2. **Connects travelers with local expert advisors** — after generating an itinerary, travelers can be matched with a real human expert in that destination for personalized advice.
3. **Handles bookings and payments** — travelers can book experiences, tours, and transport directly through the platform, with payments processed via Stripe.

---

## Core Features

### 1. AI Itinerary Builder
- Enter a destination, travel dates, number of travelers, and budget
- The AI (powered by Grok/xAI) generates a complete day-by-day itinerary
- Each itinerary includes: daily activities, estimated costs, transport between locations, and local tips
- Itineraries can be edited, saved, shared, and exported

### 2. AI Quick-Start Itinerary
- A fast version of the builder available directly on the homepage
- Designed for users who want a starting point in under 60 seconds
- Automatically redirects to a detailed comparison view after generation

### 3. Itinerary Comparison & Optimization
- After generating an itinerary, the AI produces multiple alternative variants
- Users can compare variants side-by-side (cost, pace, activities)
- An AI Optimizer can re-sequence activities for the most efficient route
- Premium optimization available via a one-time fee (unlocks for 24 hours)

### 4. Expert Advisor Matching
- AI matches travelers to the best local expert for their destination and travel style
- Matching is based on: destination expertise, budget fit, experience type, and travel preferences
- Travelers can chat directly with matched experts through the platform
- Experts can receive and respond to booking requests

### 5. Discover Page
- Browse destinations, neighborhoods, activities, and hidden gems
- Filter by experience type (cultural, adventure, food, nightlife, etc.)
- View curated "hidden gem" local spots not found on mainstream travel sites
- AI-matched expert cards appear for travelers coming from the quick-start flow

### 6. Transport Planner
- Each itinerary includes a Transport tab with day-by-day travel legs
- AI suggests the best transport modes (train, bus, taxi, rideshare) between locations
- Travelers can swap transport modes per leg with cost and duration comparison
- Affiliate booking links for 12Go, Uber, and Viator are auto-generated
- Stripe checkout available for platform-managed transport bookings

### 7. Activity & Experience Booking
- Search and book tours, activities, and experiences from multiple providers
- Data pulled from: Viator (tours), Amadeus (flights & hotels), Fever (events), and SerpAPI (restaurants, attractions)
- All results are cached for 24 hours for fast loading
- Cart system for adding multiple items before checking out

### 8. Shareable Itinerary Cards
- Every itinerary gets a unique public link (shareable token)
- Public view shows the full trip plan without requiring login
- Export options: KML (Google Earth), GPX (maps), and platform-aware deep links
- Day-by-day map buttons for navigation

### 9. Hidden Gems Discovery
- AI-powered discovery of authentic local experiences off the tourist trail
- Currently seeded with 20 curated spots across Tokyo, Kyoto, and Paris
- Each gem is linked to a neighborhood and a service provider
- Searchable by city and neighborhood

### 10. Expert Chat & Advisor Requests
- In-platform messaging between travelers and travel experts
- Conversations are private and scoped per user
- Experts can draft responses using an AI assistant
- Full message history saved per conversation

---

## Dashboards (Role-Based)

### Traveler Dashboard (My Trips)
- View all saved and generated itineraries as rich cards
- Each card shows: destination photo, trip dates, progress ring, activity chips, and budget summary
- Click any trip to open the full itinerary with Transport and Expert tabs

### Expert Dashboard
- View assigned trips and traveler requests
- Revenue optimization tools and earnings analytics
- Expert leaderboard showing performance vs. peers
- AI Content Assistant for writing travel guides and responses
- Template library for quick responses
- Stripe Connect payout management

### Provider Dashboard
- Manage services, availability, and bookings
- Revenue tracking and payout management via Stripe Connect
- Analytics on bookings and earnings

### Admin Dashboard
- Platform-wide booking and revenue overview
- Content moderation and management
- User management and trust controls
- AI cost tracking (monitors spend on Grok and Claude API calls)
- External API cost tracking (Amadeus usage)
- Ability to trigger expert/provider payouts

### Executive Assistant (EA) Dashboard
- Coordination hub for complex multi-vendor trip planning
- Tracks planning lifecycle, vendor availability, and booking states
- Multi-person RSVP tracking for group trips
- Budget management across vendors

---

## AI Systems

Traveloure uses two AI models, each assigned to tasks they handle best:

| AI | Used For |
|---|---|
| **Grok (xAI)** | Itinerary generation, expert matching, hidden gem discovery, real-time city intelligence, content creation |
| **Claude (Anthropic)** | Chat responses, itinerary optimization, transport analysis, nuanced travel advice |

An **AI Orchestrator** automatically routes each request to the right model.

---

## External Integrations

| Service | What It Does |
|---|---|
| **Google Maps** | Interactive maps, route visualization, transit information |
| **Amadeus API** | Real-time flights, hotels, points of interest, airport transfers, destination safety ratings |
| **Viator API** | Tours and activities search and booking |
| **Fever API** | Local events and ticketing |
| **12Go** | Ground transport (trains, buses) affiliate bookings |
| **SerpAPI** | Restaurant, attraction, and nightlife discovery |
| **Stripe** | Payment processing for all bookings |
| **Stripe Connect** | Automated payouts to experts and providers |
| **Instagram API** | Experts can publish travel content to Instagram directly from the platform |
| **Replit Auth** | User login via OpenID Connect |

---

## Authentication & Security

- **Three login methods:** Email/password, Replit account (one-click), Facebook/Instagram OAuth
- **Role-based access control (RBAC):** Each user role (Traveler, Expert, Provider, Admin, EA) sees only what they're allowed to
- **Session security:** Sessions stored in PostgreSQL with secure cookies
- **Ownership verification:** Users can only access their own trips, bookings, and conversations

---

## Payments & Monetization

- Travelers purchase **credit packages** to access premium AI features
- Per-use fees for **AI Optimization** of itineraries (complexity-based pricing)
- **Service bookings** charge travelers directly via Stripe checkout
- **Concierge fee** applied to premium planning services
- Experts and providers receive **automated payouts** via Stripe Connect

---

## Technology Stack (For Technical Reference)

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion |
| Routing | Wouter |
| State Management | TanStack Query (React Query) |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL with Drizzle ORM |
| AI | Grok (xAI) + Anthropic Claude |
| Payments | Stripe + Stripe Connect |
| Build Tool | Vite |

---

## Summary

Traveloure is a one-stop travel planning platform that combines the speed of AI with the depth of local human expertise. A traveler can go from "I want to visit Tokyo" to a complete, bookable, day-by-day itinerary in under a minute — and then connect with a Tokyo-based expert to fine-tune it. The platform handles everything from discovery and planning to booking, transport, and payment, all in one place.
