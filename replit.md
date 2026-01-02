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