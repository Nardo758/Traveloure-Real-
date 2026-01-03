# Traveloure - AI-Powered Travel Planning Platform

## Overview

Traveloure is a full-stack travel planning application that helps users create, manage, and discover personalized trip itineraries. The platform combines AI-powered trip generation with expert travel advisor connections, allowing users to plan trips either independently or with guidance from local travel experts.

Key features include:
- Trip creation and management with customizable preferences
- AI-generated itineraries based on destination and travel style
- Expert advisor chat system for personalized recommendations
- Tourist place discovery and search functionality
- Pre-made "Help Guide" trip packages for inspiration

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack Query (React Query) for server state
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Animations**: Framer Motion for page transitions and UI interactions
- **Build Tool**: Vite with HMR support

The frontend follows a pages-based structure with reusable components. Protected routes redirect unauthenticated users to the Replit Auth login flow.

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ES modules
- **API Pattern**: RESTful endpoints defined in `shared/routes.ts` with Zod schemas for request/response validation
- **Authentication**: Replit Auth integration using OpenID Connect (OIDC) with Passport.js
- **Session Management**: PostgreSQL-backed sessions via `connect-pg-simple`

The server uses a storage abstraction layer (`server/storage.ts`) that implements database operations through a defined interface, enabling potential storage backend changes.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Managed via `drizzle-kit push` command

Key database tables:
- `users` and `sessions` - Authentication (required for Replit Auth)
- `trips` - User trip records with preferences
- `generated_itineraries` - AI-generated trip plans
- `tourist_places_searches` / `tourist_place_results` - Destination search cache
- `user_and_expert_chats` - Chat messages between users and experts
- `help_guide_trips` - Pre-made trip packages

## Recent Changes (January 2026)

### Backend API Security Implementation (January 3)

**New Database Tables:**
- `local_expert_forms` - Expert application submissions with status tracking
- `service_provider_forms` - Provider application submissions with status tracking
- `provider_services` - Services offered by approved providers
- `service_categories` / `service_subcategories` - Service categorization hierarchy
- `faqs` - Platform FAQ management
- `wallets` / `credit_transactions` - User wallet and credit system

**API Endpoints Added:**
- Expert applications: POST /api/expert-application, GET /api/my-expert-application
- Provider applications: POST /api/provider-application, GET /api/my-provider-application
- Provider services: Full CRUD at /api/provider/services/*
- Service categories: GET /api/service-categories, POST (admin only)
- FAQs: GET /api/faqs, POST/PATCH/DELETE (admin only)
- Wallet: GET /api/wallet, GET /api/wallet/transactions, POST /api/wallet/add-credits (admin only)

**Security Patterns:**
- All admin routes verify `user.role === "admin"` before processing
- Provider service mutations verify ownership before allowing update/delete
- userId is stripped from service update payloads to prevent ownership transfer attacks
- Wallet credit additions are admin-only (production will integrate with Stripe)

**Application Workflow:**
1. User submits expert/provider application → status: "pending"
2. Admin reviews via /api/admin/[expert|provider]-applications endpoints
3. Admin approves/rejects → if approved, user role updated to "expert" or "provider"

### Phase 7 Complete: Public Pages & Registration Flows (January 3)

**New Public Pages:**
- `/experts` - Expert discovery with filters by destination, specialty, rating
- `/help-me-decide` - Pre-researched packages with articles and events sub-pages
- `/partner-with-us` - Partner signup overview with 5 partner types and benefits
- `/contact` - Contact form with office locations worldwide
- `/faq` - FAQ with accordion search functionality
- `/features` - Features showcase with stats
- `/deals` - Flash sales and category filters
- `/payment` - Checkout with cart summary, payment form, promo codes

**Registration Wizards:**
- `/travel-experts` - 5-step wizard (basic info, expertise, experience, availability, review) with step validation
- `/services-provider` - 4-step form (business info, services, compliance, review) with step validation

**Navigation Updates:**
- Added Deals and Contact links to header
- Partner With Us dropdown now routes directly to registration pages
- Benefits items link to /partner-with-us info page

**Validation Patterns:**
- `canProceed()` function gates wizard step progression
- Payment form requires valid card details before submission
- Contact form validates required fields before submit enabled
- All forms use destructive toast feedback for validation errors

### Phase 8 Complete: Additional Dashboard & Trip Pages (January 3)

**New Pages:**
- `/itinerary/:id` - Day-by-day trip breakdown with activity timeline, booking status indicators, interactive day navigation, and booking CTAs
- `/credits-billing` - Credit package purchasing with 4 tiers, transaction history, payment methods management, invoices with tabs interface
- `/expert-status` - Expert application progress tracking with 6-step timeline, document verification workflow, progress percentage
- `/provider-status` - Service provider application progress with document management, business details display
- `/expert/contract-categories` - Service category management for experts with revenue tracking, contracts overview, commission rates

**Routes:**
- Itinerary page is public (no auth required)
- Credits-billing, expert-status, provider-status use DashboardLayout with ProtectedRoute
- Expert contract-categories uses ExpertLayout with ProtectedRoute

### Phase 6 Complete: Service Provider & Admin Dashboards

**Service Provider Dashboard (9 pages):**
Components in `client/src/components/`:
- `provider-sidebar.tsx` - Collapsible sidebar with 9 navigation items
- `provider-layout.tsx` - Layout wrapper with header showing rating badge

Pages in `client/src/pages/provider/`:
- `dashboard.tsx` - Stats, pending requests, upcoming bookings, quick actions
- `bookings.tsx` - All bookings with search, status filters, and booking details
- `services.tsx` - Service management with categories, pricing, toggle active/inactive
- `earnings.tsx` - Revenue stats, monthly earnings chart, payout schedule, transaction history
- `performance.tsx` - Metrics, benchmarks, rating distribution, reviews with response capability
- `calendar.tsx` - Interactive calendar with event management, blocking dates
- `profile.tsx` - Business profile with photos, amenities, capacity information
- `settings.tsx` - Account, business preferences, notifications, payment settings
- `resources.tsx` - Learning guides, video tutorials, downloadable resources, FAQ

**Routes:** All provider routes follow `/provider/*` pattern with ProtectedRoute wrapper

**Admin Dashboard (10 pages):**
Components in `client/src/components/`:
- `admin-sidebar.tsx` - Collapsible sidebar with 10 navigation items (dark theme)
- `admin-layout.tsx` - Layout wrapper with system status badge

Pages in `client/src/pages/admin/`:
- `dashboard.tsx` - Platform stats, pending approvals (experts, providers, disputes), system health, activity feed
- `users.tsx` - User management with search, role filters, user table with actions
- `experts.tsx` - Expert management with pending applications and active expert table
- `providers.tsx` - Provider management with pending applications and active provider table
- `plans.tsx` - Plan management with search, status filters, progress tracking
- `revenue.tsx` - Revenue stats, monthly chart, revenue by source, transaction history
- `analytics.tsx` - Page views, user metrics, traffic sources, top destinations, demographics
- `search.tsx` - Global search across users, experts, providers, plans
- `notifications.tsx` - Notification center with filters, mark as read, delete functionality
- `system.tsx` - System status, platform settings, API usage, security, backup settings

**Routes:** All admin routes follow `/admin/*` pattern with ProtectedRoute wrapper

**Design Notes:**
- Provider Dashboard uses #FF385C primary color with amber rating badge
- Admin Dashboard uses gray-900 for sidebar active states (professional admin look)
- All interactive elements have data-testid attributes following {action}-{target} convention
- Both dashboards bypass global Layout, using their respective Layout components

### Phase 5 Complete: Executive Assistant (EA) Dashboard
Implemented comprehensive EA Dashboard for managing multiple C-level executives:

**EA Components:**
- `client/src/components/ea-sidebar.tsx` - Collapsible sidebar with 12 navigation items
- `client/src/components/ea-layout.tsx` - Layout wrapper with header and sidebar

**EA Pages (12 total) in `client/src/pages/ea/`:**
- `dashboard.tsx` - Stats overview, urgent alerts, executives summary, AI activity, calendar, quick actions
- `executives.tsx` - Executive management with expandable profile cards, preferences, family info, gift history
- `calendar.tsx` - Multi-event coordination with matrix view across all executives
- `events.tsx` - Event management with filters by executive, type, status
- `communications.tsx` - Email/message center with AI draft capabilities
- `ai-assistant.tsx` - Task delegation, AI work review, pending approvals
- `travel.tsx` - Travel coordination with trip segments and hotel/flight status
- `venues.tsx` - Venue/restaurant/hotel database with favorites
- `gifts.tsx` - Gift tracking, occasion reminders, AI gift suggestions
- `reports.tsx` - Analytics dashboard with monthly performance metrics
- `profile.tsx` - EA user profile and account settings
- `settings.tsx` - Workspace preferences, AI settings, integrations

**Routes:** All EA routes follow `/ea/*` pattern with ProtectedRoute wrapper

**Design Notes:**
- EA Dashboard manages multiple executives (not clients like Expert Dashboard)
- All interactive elements have data-testid attributes
- Uses same design tokens: #FF385C primary, gray-* color palette
- Each page uses EALayout (no global Layout)

### Authentication Flow
The application uses Replit Auth, which provides:
- OIDC-based authentication flow
- Automatic user provisioning on first login
- Session persistence in PostgreSQL
- Protected route middleware (`isAuthenticated`)

### API Structure
Routes are defined declaratively in `shared/routes.ts` with:
- HTTP method and path
- Zod input/output schemas
- Error response schemas

This enables type-safe API consumption on both client and server.

## External Dependencies

### Third-Party Services
- **Replit Auth**: Primary authentication provider via OIDC
- **PostgreSQL**: Database (provisioned via Replit)

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit`: Database ORM and migration tooling
- `@tanstack/react-query`: Server state management
- `zod`: Runtime type validation
- `passport` / `openid-client`: Authentication
- `express-session` / `connect-pg-simple`: Session management
- `framer-motion`: Animations
- `date-fns`: Date formatting utilities
- `lucide-react`: Icon library

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Secret for session encryption
- `ISSUER_URL`: Replit OIDC issuer (defaults to https://replit.com/oidc)
- `REPL_ID`: Replit environment identifier