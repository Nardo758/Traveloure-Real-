# Traveloure Deep Dive: Per-Page Audit Plan

## Goal
Audit every page in `client/src/pages/` (and subdirectories) to identify:
1. "Trip" terminology that needs to become "experience" or "event"
2. Travel-specific copy that contradicts the event planning model
3. Missing event-specific features
4. Monetization misalignment
5. Budget/per-day pricing that needs event-tier pricing

## Approach
5 parallel subagents, each responsible for a page category. Each subagent reads pages, identifies issues, and outputs a structured report.

## Categories

### Category 1: Core User Flow Pages (Highest Priority)
Pages: create-trip.tsx, trip-details.tsx, my-trips.tsx, itinerary.tsx, itinerary-view.tsx, itinerary-comparison.tsx, cart.tsx, payment.tsx, pricing.tsx, landing.tsx, dashboard.tsx, experiences.tsx, experience-template.tsx, experience-discovery.tsx, discover.tsx, discover-location.tsx, browse.tsx, shared-trip.tsx, quick-start-itinerary.tsx, optimize.tsx, my-itinerary.tsx, my-bookings.tsx, global-calendar.tsx, help-me-decide.tsx

Focus: Terminology, budget tiers, event-specific UI, monetization flow

### Category 2: Expert/Provider Pages
Pages: experts.tsx, expert-detail.tsx, expert/workspace.tsx, expert/services.tsx, expert/service-wizard.tsx, expert/templates.tsx, expert/dashboard.tsx, expert/assigned-trips.tsx, expert/clients.tsx, expert/client-detail.tsx, expert/contract-categories.tsx, expert/content-studio.tsx, expert/analytics.tsx, expert/earnings.tsx, expert/performance.tsx, expert/revenue-optimization.tsx, expert/bookings.tsx, expert/booking-partners.tsx, provider-status.tsx, service-providers.tsx, services-provider.tsx, service-detail.tsx, vendors.tsx, travel-experts.tsx, partner-with-us.tsx

Focus: Expert role terminology, event-specific service templates, earnings model, contract categories

### Category 3: Guest/Event Management Pages
Pages: GuestInvitePage.tsx, my-itinerary.tsx, my-bookings.tsx, optimize.tsx, quick-start-itinerary.tsx, transportation-booking.tsx, itinerary-comparison.tsx, global-calendar.tsx, help-me-decide.tsx, shared-trip.tsx, executive-assistant.tsx, ea/dashboard.tsx, ea/trips.tsx, ea/events.tsx, ea/clients.tsx, ea/venues.tsx, ea/calendar.tsx, ea/communications.tsx, ea/gifts.tsx, ea/executives.tsx, ea/ai-assistant.tsx, ea/profile.tsx, ea/settings.tsx, ea/reports.tsx, ea/travel.tsx

Focus: Guest invite generalization, event coordination, multi-person coordination, EA event support

### Category 4: Marketing/Content Pages
Pages: about.tsx, partner-with-us.tsx, terms.tsx, privacy.tsx, faq.tsx, features.tsx, how-it-works.tsx, help.tsx, press.tsx, careers.tsx, blog.tsx, contact.tsx, earn.tsx, hidden-gems.tsx, explore.tsx, travel-experts.tsx, visa-help.tsx, deals.tsx, ai-assistant.tsx, chat.tsx, notifications.tsx, profile.tsx, credits-billing.tsx, credits.tsx, booking-demo.tsx, architecture-diagram.tsx, landing-mockups.tsx, layout-mock.tsx, spontaneous.tsx, not-found.tsx, reset-password.tsx, verify-email.tsx, accept-terms.tsx, contract-view.tsx, concierge/index.tsx

Focus: Brand terminology, marketing copy, feature descriptions, terms of service language

### Category 5: Admin Pages
Pages: admin/dashboard.tsx, admin/event-packages.tsx, admin/expert-templates.tsx, admin/experts.tsx, admin/providers.tsx, admin/services.tsx, admin/categories.tsx, admin/fee-bands.tsx, admin/fee-config.tsx, admin/plans.tsx, admin/revenue.tsx, admin/users.tsx, admin/analytics.tsx, admin/data.tsx, admin/content-mapping.tsx, admin/content-tracking.tsx, admin/cross-sell-analytics.tsx, admin/affiliate-partners.tsx, admin/ai-costs.tsx, admin/platform-providers.tsx, admin/neighborhoods.tsx, admin/neighborhood-backfill.tsx, admin/gem-photo-backfill.tsx, admin/search.tsx, admin/system.tsx, admin/tourism-analytics.tsx, admin/review-moderation.tsx, admin/routing-queue.tsx, admin/payouts.tsx, admin/offering-types.tsx, admin/category-fees.tsx, admin/notifications.tsx

Focus: Admin terminology, event package management, fee structure, revenue tracking, analytics categories

## Output Format
Each subagent outputs a markdown report with:
```markdown
## Page: {filename}
### Current State
- What the page does
- Key terminology used
- Event support level (0-5)

### Issues Found
- **Issue 1**: Description, severity (P0/P1/P2), evidence (line numbers)
- **Issue 2**: ...

### Changes Needed
1. Change X to Y (file:line)
2. Add Z feature
3. Remove W

### Estimated Effort
- Small: <1 hour
- Medium: 1-4 hours
- Large: 4-8 hours
- XL: 8+ hours
```

## Integration
Orchestrator will integrate all 5 reports into a single cohesive execution plan with:
- Phase 1 (This week): P0 changes across all pages
- Phase 2 (This month): P1 changes across all pages
- Phase 3 (Next quarter): P2 changes across all pages
- Per-page checklist with file paths and line numbers
