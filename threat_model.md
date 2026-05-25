# Threat Model

## Project Overview

Traveloure is a public, production-deployed travel planning platform with a React/Vite frontend and an Express/TypeScript backend backed by PostgreSQL. It supports email/password login, Replit OIDC login, Facebook/Instagram OAuth, payments through Stripe, booking and availability flows through Viator and other travel providers, and AI-assisted itinerary generation through Anthropic and xAI.

The application’s highest-risk production surface is the Express API mounted from `server/index.ts` and `server/routes.ts`, especially routes that cross from public or guest access into authenticated traveler data, payments, bookings, admin analytics, or share-token based collaboration.

## Assets

- **User accounts and sessions** — session cookies, OAuth-linked identities, password hashes, and account profile data. Compromise allows impersonation and access to trips, chats, and bookings.
- **Traveler data** — trip plans, itinerary items, transport legs, bookings, messages, profile details, and other planning records. This data includes private travel plans and user-generated content.
- **Payment and payout state** — Stripe customer/payment state, booking state, provider payout state, connected Stripe account metadata, and credit balances. Tampering could create fraudulent bookings, financial loss, or unauthorized payouts.
- **Share tokens and guest-collaboration links** — public/shareable itinerary views and suggestion links. These must not become a path to broader account or trip compromise.
- **Third-party API credentials and privileged integrations** — Stripe, Viator, Amadeus, Anthropic, xAI, Facebook/Instagram, SerpAPI, database credentials, and session secrets. Exposure would let attackers act as the platform.
- **Admin and provider/expert data** — platform analytics, revenue data, moderation/admin settings, provider dashboards, and expert business tooling. Unauthorized access would expose sensitive business and user data.

## Trust Boundaries

- **Browser to Express API** — every client request is untrusted. The server must enforce authentication, authorization, validation, and server-side business rules regardless of frontend behavior.
- **Express API to PostgreSQL** — application code has broad read/write access to core records. Query construction and ownership checks are security-critical.
- **Express API to external services** — the server calls Stripe, Viator, Amadeus, Anthropic, xAI, Facebook/Instagram, and related providers with secrets. Request integrity and secret handling matter at this boundary.
- **Public vs authenticated routes** — some discovery/share flows are intentionally public, while trips, chats, bookings, wallets, dashboards, and profile routes must stay scoped to the correct account.
- **Authenticated user vs privileged roles** — admin, provider, expert, and assistant features require stronger server-side role checks than ordinary traveler routes.
- **Owner vs share-token collaborator** — itinerary-sharing features intentionally permit limited guest access. Share tokens must only grant the exact read/suggest capability intended and must not bypass ownership boundaries elsewhere.

## Scan Anchors

- **Production entry points**: `server/index.ts`, `server/routes.ts`, `server/routes/**/*.ts`, `server/replit_integrations/auth/**`
- **Highest-risk areas**: auth flows, share-token itinerary routes, booking/payment flows, admin analytics routes, external-provider booking/integration routes
- **Public surfaces**: health/status endpoints, catalog/search/discovery routes, some venue/Fever/search endpoints, public itinerary share views
- **Authenticated surfaces**: trips, chats, profile, bookings, AI itinerary generation, Stripe Connect, provider/expert dashboards
- **Admin surfaces**: `server/routes/admin*.ts` and any `/api/admin/**` handlers
- **Usually dev-only**: `server/seeds/**`, `scripts/**`, docs/reports/screenshots, Vite-only dev setup paths

## Threat Categories

### Spoofing

The platform supports multiple auth methods and persistent sessions. The system must ensure every protected route validates a live session server-side, and account recovery flows must not let an attacker reset or assume another user’s identity based only on public information such as an email address.

### Tampering

Clients can submit trip, booking, transport, payout, and AI-generation inputs. The server must treat all client inputs as hostile, recompute sensitive business decisions server-side, and prevent guest/share-token flows from modifying records beyond the exact shared scope.

### Information Disclosure

The application stores sensitive traveler plans, messages, bookings, provider data, and business analytics. API responses, share-token views, and admin/provider dashboards must only expose data to the authorized principal, and server logs/errors must not leak secrets, tokens, or internal details.

### Denial of Service

The API includes AI endpoints, external-provider searches, and potentially expensive planning operations. Public or lightly protected routes must not permit unbounded abuse that can exhaust provider quotas, API budgets, or backend resources.

### Elevation of Privilege

This project has several privilege layers: public users, authenticated travelers, share-link collaborators, experts/providers, and admins. The platform must enforce server-side ownership and role checks on every sensitive route so a normal user or guest cannot read or mutate another user’s trips, bookings, transport plans, or admin data.
