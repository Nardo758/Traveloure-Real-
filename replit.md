# Traveloure - AI-Powered Travel Planning Platform

## Overview

Traveloure is a full-stack travel planning application designed to help users create, manage, and discover personalized trip itineraries. The platform leverages AI for trip generation and facilitates connections with expert travel advisors. Its core purpose is to offer flexible trip planning, either independently through AI-generated suggestions or with personalized guidance from local experts. The project aims to capture a significant market share in the travel planning industry by offering unique AI-driven personalization and human expert interaction.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application features a modern and responsive design using Tailwind CSS and shadcn/ui for components, ensuring a consistent and appealing user experience. Framer Motion is used for smooth page transitions and UI interactions. The primary color scheme uses `#FF385C` with a gray-900 palette for admin interfaces, and amber accents for ratings. Dashboards (Provider, Admin, EA) utilize distinct layouts and collapsible sidebars tailored to their specific user roles.

### Technical Implementations
- **Frontend**: Built with React 18 and TypeScript, using Wouter for routing and TanStack Query for server state management. Vite is used as the build tool.
- **Backend**: Developed with Node.js and Express in TypeScript, employing RESTful APIs with Zod schemas for request/response validation, ensuring type safety.
- **Authentication**: Integrates Replit Auth using OpenID Connect (OIDC) via Passport.js, with session management backed by PostgreSQL. Protected routes enforce authentication.
- **Data Storage**: PostgreSQL is the primary database, managed with Drizzle ORM. The schema is defined in `shared/schema.ts`, and `drizzle-kit` handles migrations.
- **API Structure**: Routes are defined declaratively with HTTP methods, paths, and Zod schemas for input/output and error responses, enabling type-safe client-server communication.
- **Storage Abstraction**: A server-side storage abstraction layer (`server/storage.ts`) allows for flexible database operations and potential future changes in storage backend.

### Feature Specifications
- **Trip Planning**: Users can create and manage trips with AI-generated itineraries based on preferences.
- **Expert Advisor Chat**: A system for users to chat with local travel experts for personalized recommendations.
- **Tourist Place Discovery**: Functionality to search and discover tourist destinations.
- **"Help Guide" Packages**: Pre-made trip packages for user inspiration.
- **Experience Planning System**: A dynamic, configurable wizard system for planning various experiences (Travel, Wedding, Proposal, etc.) with steps loaded from the database.
- **Reviews & Notifications**: System for users to review services and receive timely notifications.
- **Provider & Admin Dashboards**: Comprehensive dashboards for service providers to manage bookings, services, earnings, and for administrators to manage users, experts, providers, and platform analytics.
- **Executive Assistant (EA) Dashboard**: A specialized dashboard for managing multiple C-level executives, including calendar, travel, events, and AI assistance.
- **Public Pages & Registration Flows**: Includes pages for expert discovery, partner registration, FAQs, deals, and various registration wizards for experts and service providers.
- **Wallet & Billing**: Credit package purchasing, transaction history, and payment method management for users.

### System Design Choices
- **Modularity**: The codebase is organized into a `pages`-based frontend structure and a clear `server` and `shared` directory separation.
- **Type Safety**: Extensive use of TypeScript and Zod for robust type checking across the stack.
- **Scalability**: Architectural decisions like storage abstraction and clear API definitions aim for future scalability.
- **Security**: Implementation of role-based access control (RBAC) for admin and provider functionalities, with ownership verification for data modifications.

## External Dependencies

### Third-Party Services
- **Replit Auth**: For OpenID Connect-based user authentication.
- **PostgreSQL**: The relational database management system for data persistence.

### Key NPM Packages
- `@tanstack/react-query`: Server state management for React.
- `drizzle-orm` / `drizzle-kit`: ORM and migration tool for PostgreSQL.
- `zod`: Schema declaration and validation library.
- `passport` / `openid-client`: Authentication middleware and OIDC client.
- `express-session` / `connect-pg-simple`: Session management with PostgreSQL store.
- `framer-motion`: Animation library for React.
- `date-fns`: Date utility library.
- `lucide-react`: Icon library.

### Environment Variables
- `DATABASE_URL`: Connection string for PostgreSQL.
- `SESSION_SECRET`: Secret key for encrypting session data.
- `ISSUER_URL`: URL of the Replit OIDC issuer.
- `REPL_ID`: Identifier for the Replit environment.