# TRAVELOURE MARKETPLACE EVOLUTION - MASTER SPECIFICATION
## Complete Expert & Service Provider System

**Version**: 10.0 - Master Consolidation  
**Last Updated**: January 2, 2026  
**Document Type**: Complete Product Specification  
**Status**: Production-Ready Implementation Guide

---

## EXECUTIVE SUMMARY

This document consolidates all enhancements to transform Traveloure from a travel planning platform into a **comprehensive travel services marketplace** - combining the expert guidance of Local Experts with the practical services of verified Service Providers.

### What's Changing

**FROM**: Basic expert chat system with manual contract creation  
**TO**: Full-service marketplace with:
- Self-service expert booking with service menus
- 15+ service provider categories (photography, childcare, drivers, chefs, etc.)
- Dynamic role system (admin can add new categories)
- Multi-role support (one provider, multiple services)
- Integrated commerce experience

### Business Impact

**Revenue Expansion:**
- Local Expert services: $29-499 per booking
- Service Provider services: $80-1,500 per booking
- Platform fee: 20% across all bookings
- Average order value increase: **3-5x**

**Market Expansion:**
- Current: ~2,800 Local Experts
- Target: 10,000+ Local Experts + 20,000+ Service Providers
- TAM: Every traveler needs multiple services per trip

**Competitive Moat:**
- Only platform combining planning + execution
- Verified, background-checked providers
- Integrated booking, payment, communication
- Quality-controlled marketplace

---

## TABLE OF CONTENTS

### PART I: CURRENT STATE & VISION
1. [Current Implementation Analysis](#current-implementation-analysis)
2. [Product Vision](#product-vision)
3. [User Personas](#user-personas)

### PART II: LOCAL EXPERT SYSTEM
4. [Local Expert Overview](#local-expert-overview)
5. [Expert Service Catalog](#expert-service-catalog)
6. [Expert Services Menu Creation](#expert-services-menu-creation)
7. [Expert Discovery & Booking](#expert-discovery-booking)

### PART III: SERVICE PROVIDER SYSTEM
8. [Service Provider Overview](#service-provider-overview)
9. [Service Provider Categories](#service-provider-categories)
10. [Category Management](#category-management)
11. [Provider Registration & Verification](#provider-registration-verification)

### PART IV: UNIFIED MARKETPLACE
12. [Homepage & Entry Points](#homepage-entry-points)
13. [Browse & Discovery Experience](#browse-discovery-experience)
14. [Service Booking Flow](#service-booking-flow)
15. [Integration with DIY Trip Planning](#integration-diy-trip-planning)

### PART V: TECHNICAL IMPLEMENTATION
16. [System Architecture](#system-architecture)
17. [Database Schema](#database-schema)
18. [API Endpoints](#api-endpoints)
19. [UI Components](#ui-components)
20. [Integration Points](#integration-points)

### PART VI: IMPLEMENTATION ROADMAP
21. [Phase 1: Expert Services Menu](#phase-1-expert-services-menu)
22. [Phase 2: Service Provider Categories](#phase-2-service-provider-categories)
23. [Phase 3: Unified Discovery](#phase-3-unified-discovery)
24. [Phase 4: DIY Integration](#phase-4-diy-integration)
25. [Phase 5: Scale & Optimization](#phase-5-scale-optimization)

---

## CURRENT IMPLEMENTATION ANALYSIS

### What's Already Built

**✅ Expert Marketplace** (`/experts`)
- Browse experts with filters (location, language, specialty)
- Expert cards showing profile, rating, reviews
- "Chat Now" to open real-time communication

**✅ Real-Time Chat System** (WebSocket)
- Expert-traveler messaging
- File/image attachments
- Online/offline status
- Message history

**✅ Contract System**
- Expert manually creates contracts
- Contract sent through chat as special message
- User can accept/reject
- Contract tracking (pending, accepted, rejected, paid)

**✅ Payment Integration** (Stripe)
- Payment URL generated on contract acceptance
- Secure payment processing
- Payment confirmation updates contract status
- WebSocket notification to expert

**✅ Expert Dashboard** (`/local-expert/dashboard`)
- Bookings management
- Earnings tracking
- Chat with travelers
- Business profile

### What's Missing

**❌ Expert Services Menu**
- File exists: `/local-expert/services/page.jsx`
- Status: Shows "Under Construction"
- Need: Service creation, pricing, templates

**❌ Self-Service Booking**
- Current: Must chat first
- Need: Browse services → Select → Book directly

**❌ Expert Profile Pages**
- Current: Only marketplace list view
- Need: Individual profile pages showing services menu

**❌ Service Provider Categories**
- Current: Only "Local Expert" role
- Need: Photographer, Driver, Chef, Babysitter, etc.

**❌ Auto-Contract Generation**
- Current: Expert manually creates each contract
- Need: Service selection → Auto-create contract

### Current User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ CURRENT FLOW (Chat-First)                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 1. Homepage → Click "Work with Expert"                          │
│         ↓                                                       │
│ 2. /experts → Browse expert list                               │
│         ↓                                                       │
│ 3. Click "Chat Now" on expert                                  │
│         ↓                                                       │
│ 4. Real-time chat opens                                        │
│         ↓                                                       │
│ 5. User explains needs                                         │
│         ↓                                                       │
│ 6. Expert manually creates contract                            │
│         ↓                                                       │
│ 7. Contract sent through chat                                  │
│         ↓                                                       │
│ 8. User accepts → Redirects to Stripe                          │
│         ↓                                                       │
│ 9. Payment confirmed → Expert delivers                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Pros:**
- Personal, conversational experience
- Expert can customize offering
- Builds trust and relationship

**Cons:**
- High friction - must chat before booking
- Requires expert to be responsive
- No self-service option
- Doesn't scale well

---

## PRODUCT VISION

### The Future Traveloure

**"The complete marketplace for travel planning AND execution"**

Travelers get:
- **Knowledge** from Local Experts (planning, guidance, recommendations)
- **Services** from Service Providers (photography, transportation, childcare, etc.)
- **Everything** in one platform, one checkout, one support system

### Three Paths, One Platform

```
┌─────────────────────────────────────────────────────────────────┐
│ PATH 1: DIY-FIRST (Browse & Build)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ User browses activities, hotels, services                       │
│      ↓                                                          │
│ Builds cart with real inventory                                │
│      ↓                                                          │
│ Can add expert services or provider services to cart           │
│      ↓                                                          │
│ Single checkout for everything                                 │
│                                                                 │
│ Best for: Familiar destinations, quick trips, budget travelers  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ PATH 2: EXPERT-FIRST (Work with Local Expert)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Browse Local Experts by destination                            │
│      ↓                                                          │
│ View expert profile & services menu                            │
│      ↓                                                          │
│ Option A: Select service → Book directly                       │
│ Option B: Chat first → Custom proposal                         │
│      ↓                                                          │
│ Expert provides planning/guidance                              │
│      ↓                                                          │
│ Can book services through expert's recommendations             │
│                                                                 │
│ Best for: First-time visitors, complex trips, special occasions│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ PATH 3: SERVICE-FIRST (Book Specific Services)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Need specific service (photographer, babysitter, driver)        │
│      ↓                                                          │
│ Browse Service Providers by category                           │
│      ↓                                                          │
│ View provider profile & services                               │
│      ↓                                                          │
│ Select service → Book directly                                 │
│      ↓                                                          │
│ Provider delivers service during trip                          │
│                                                                 │
│ Best for: Specific needs, standalone services                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**All three paths converge** at the same booking, payment, and communication systems.

---

## USER PERSONAS

### Persona 1: Sarah - The DIY Planner

**Profile:**
- 28, Marketing Manager
- Planning Paris anniversary trip
- Budget-conscious but values experiences
- Comfortable researching online

**Journey:**
1. Starts browsing activities in Paris
2. Builds cart: Eiffel Tower tickets, cooking class, Seine cruise
3. Sees "Add Expert Review - $49" in cart
4. Thinks: "Worth $49 to make sure I'm not missing anything"
5. Adds Maria's Cart Review service
6. Maria suggests 3 better restaurants, saves $200
7. Sarah is delighted, leaves 5-star review

**Value:** Self-service with expert safety net

---

### Persona 2: John - The Hands-Off Planner

**Profile:**
- 45, Busy executive
- Planning family trip to Japan
- High budget, low time
- Wants someone else to handle everything

**Journey:**
1. Clicks "Work with Expert" on homepage
2. Filters for Kyoto + Family trips
3. Views Kenji's profile
4. Sees "Full Trip Planning - $499"
5. Books directly (no chat needed)
6. Kenji sends questionnaire
7. Kenji creates complete itinerary
8. John approves, everything's booked
9. Kenji provides 24/7 support during trip

**Value:** Completely hands-off, professional service

---

### Persona 3: Emily - The Solo Female Traveler

**Profile:**
- 32, Freelance designer
- Solo trip to Colombia
- Safety-conscious
- Wants authentic local experiences

**Journey:**
1. Searches for "Travel Companion in Bogotá"
2. Browses verified companions
3. Filters by: Female, English-speaking, 5-star rated
4. Views Ana's profile: Background checked, 127 reviews
5. Sees "Day Companion - $150/day"
6. Books Ana for 3 days
7. Ana meets her, shows local markets, cafes, neighborhoods
8. Emily feels safe, has authentic experience
9. Books Ana for 2 more days

**Value:** Safety + authenticity + local knowledge

---

### Persona 4: Michael & Lisa - The Wedding Photographers

**Profile:**
- Couple getting engaged in Paris
- Want professional photos
- Don't know photographers in Paris
- Will pay for quality

**Journey:**
1. Searches "Photographer Paris"
2. Browses 847 photographers
3. Filters by: Engagement/Couples, 5-star, Available dates
4. Views Pierre's profile
5. Portfolio is stunning
6. Sees "Engagement Shoot - $300 (2 hours, 50+ photos)"
7. Books directly
8. Pierre scouts perfect locations
9. Delivers 73 edited photos in 48 hours
10. Photos are perfect for announcement

**Value:** Verified quality, easy booking, professional results

---

## LOCAL EXPERT OVERVIEW

### What Local Experts Do

**Primary Function:** Knowledge & Planning Provider

**Deliverables:**
- Trip planning & itineraries
- Consultation & advice
- Cart reviews & optimization
- Cultural interpretation
- Insider recommendations
- Ongoing trip support

**Can be:** Remote or local to destination

**Example:** Maria in Paris who plans trips but doesn't personally guide tours

---

### Local Expert Service Categories

```
┌─────────────────────────────────────────────────────────────────┐
│ TIER 1: CONSULTATION ($29-49)                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Quick Consultation (30 min)                              $29   │
│ • Answer specific questions                                     │
│ • Neighborhood recommendations                                  │
│ • Restaurant/activity suggestions                               │
│ • Best times to visit                                           │
│                                                                 │
│ Delivery: Same day to 48 hours                                  │
│ Format: Phone, video, or voice notes                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ TIER 2: PLANNING ($49-99)                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Cart Review & Optimization                               $49   │
│ • Review all cart items                                         │
│ • Identify better deals/alternatives                            │
│ • Add hidden gems                                               │
│ • Optimize routes & timing                                      │
│ • Detailed PDF recommendations                                  │
│                                                                 │
│ Delivery: 24-48 hours                                           │
│ Typical savings: $200-400                                       │
│                                                                 │
│ Itinerary Review (Pre-Built)                             $69   │
│ • Review existing itinerary                                     │
│ • Identify gaps & conflicts                                     │
│ • Suggest improvements                                          │
│ • Optimize flow                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ TIER 3: FULL PLANNING ($199-499)                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Complete Trip Planning                                  $249   │
│ • Custom itinerary from scratch                                 │
│ • Restaurant reservations (3-5)                                 │
│ • Activity bookings & skip-line tickets                         │
│ • Day-by-day schedule with maps                                 │
│ • 24/7 WhatsApp support during trip                             │
│ • Unlimited revisions                                           │
│                                                                 │
│ Delivery: 48-72 hours                                           │
│ Best for: 3-10 day trips                                        │
│                                                                 │
│ Premium Trip Planning                                   $499   │
│ Everything above PLUS:                                          │
│ • Impossible-to-get reservations                                │
│ • Private experiences & VIP access                              │
│ • Personal shopping assistance                                  │
│ • Meet-and-greet at airport                                     │
│ • Dedicated phone line                                          │
│                                                                 │
│ Best for: Luxury trips, honeymoons, celebrations               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SPECIALTY SERVICES ($99-899)                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Proposal Planning                                  $399-899    │
│ • Scout & secure proposal location                              │
│ • Coordinate photographer                                       │
│ • Arrange celebration dinner                                    │
│ • Backup weather plan                                           │
│ • Flowers/champagne delivery                                    │
│                                                                 │
│ Virtual Services                                    $49-149    │
│ • Virtual neighborhood tours                                    │
│ • Virtual apartment inspections                                 │
│ • Pre-trip orientation                                          │
│ • Virtual cooking classes                                       │
│                                                                 │
│ Family Trip Planning                                    $299   │
│ • Kid-friendly activities                                       │
│ • Nap-time scheduling                                           │
│ • Stroller-accessible routes                                    │
│ • Babysitting coordination                                      │
│                                                                 │
│ Relocation Consulting                                   $599   │
│ • Neighborhood research                                         │
│ • Apartment hunting                                             │
│ • School recommendations                                        │
│ • Utility setup guidance                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## EXPERT SERVICE CATALOG

### Complete Service Template Library

Local Experts can offer these pre-defined services (fully customizable):

**CONSULTATION SERVICES**
1. Quick Consultation (30 min) - $29
2. Extended Consultation (60 min) - $49
3. Messaging Consultation (async) - $39

**PLANNING SERVICES**
4. Cart Review & Optimization - $49
5. Itinerary Review - $69
6. Custom Day Plan - $89/day
7. Complete Trip Planning - $249
8. Premium Trip Planning - $499

**SPECIALTY PLANNING**
9. Proposal Planning Package - $399
10. Luxury Proposal - $899
11. Anniversary Trip - $299
12. Bachelor/Bachelorette Party - $399
13. Milestone Birthday - $249
14. Wedding Trip Coordination - $599

**VIRTUAL SERVICES**
15. Virtual Neighborhood Tour - $79
16. Virtual Apartment Tour - $49
17. Virtual Cooking Class - $99
18. Pre-Trip Orientation - $69

**FAMILY & GROUP**
19. Family Trip Planning - $299
20. Multi-Generational Planning - $399
21. Corporate Retreat Planning - $599-2,000

**EXPERIENCE PLANNING**
22. Photo Experience Coordination - $149
23. Food Tour Curation - $199
24. Wine Tour Planning - $199
25. Live Like a Local Package - $199

**SPECIALTY INTERESTS**
26. Art & Museum Enthusiast Plan - $179
27. Fitness-Focused Planning - $149
28. Personal Shopping Experience - $249
29. Literary Tour Planning - $129

**LONG-TERM SERVICES**
30. Relocation Consulting - $599
31. Remote Work Setup - $299
32. Extended Stay Planning (1-3 months) - $499

**EMERGENCY & SUPPORT**
33. Trip Rescue Service - $99
34. Medical Tourism Coordination - $399
35. Accessibility Planning - $149

**SUSTAINABLE & ECO**
36. Sustainable Travel Planning - $179
37. Ethical Wildlife Experiences - $149
38. Low-Impact Adventure Planning - $199

---

## EXPERT SERVICES MENU CREATION

### Expert Dashboard - Services Page

**File:** `/local-expert/services/page.jsx` (Currently "Under Construction")

```
┌────────────────────────────────────────────────────────────────────┐
│ LOCAL EXPERT DASHBOARD - Maria Dubois                             │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│ [Dashboard] [Bookings] [Chats] [Services ✓] [Earnings] [Reviews] │
│                                                                    │
│  MY SERVICES                                  [+ Create Service]   │
│                                                                    │
│  [All (8)] [Active (6)] [Paused (2)] [Draft (0)]                 │
│                                                                    │
│  Sort: [Most Popular ▼]  Filter: [All Types ▼]                    │
│                                                                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                    │
│  ⭐ BEST PERFORMER                                                 │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 💬 Quick Consultation                               $29      │ │
│  │ Category: Consultation • Delivery: Real-time                 │ │
│  │                                                              │ │
│  │ 📊 Performance:                                              │ │
│  │ • 47 bookings this month                                     │ │
│  │ • $1,363 revenue                                             │ │
│  │ • 4.9 ⭐ (45 reviews)                                         │ │
│  │ • 92% conversion rate                                        │ │
│  │                                                              │ │
│  │ Status: 🟢 Active • Last booking: 2 hours ago               │ │
│  │                                                              │ │
│  │ [Edit] [Analytics] [Pause] [Duplicate]                      │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 📋 Cart Review & Optimization                       $49      │ │
│  │ Category: Planning • Delivery: 24-48 hours                   │ │
│  │                                                              │ │
│  │ 📊 89 bookings • $4,361 revenue • 5.0 ⭐                     │ │
│  │ Status: 🟢 Active                                           │ │
│  │                                                              │ │
│  │ [Edit] [Analytics] [Pause] [Duplicate]                      │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ ⭐ Complete Trip Planning                            $249    │ │
│  │ Category: Full Planning • Delivery: 48-72 hours              │ │
│  │                                                              │ │
│  │ 📊 111 bookings • $27,639 revenue • 4.9 ⭐                   │ │
│  │ Status: 🟢 Active • ⚠️ High demand                          │ │
│  │                                                              │ │
│  │ [Edit] [Analytics] [Pause] [Duplicate]                      │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  [Load More Services...]                                           │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Service Creation Wizard (5 Steps)

**Step 1: Choose Service Type**
```
Service Categories:
☎️ Consultation - Quick calls, video chats
📋 Planning - Cart reviews, itineraries
🎯 Action-Based - Reservations, bookings
💎 Concierge - Ongoing support
🎭 Experience - Tours, workshops
⭐ Specialty - Proposals, events, unique
```

**Step 2: Service Basics**
```
• Service title
• Short description (150 chars)
• Detailed description
• Service image (optional)
```

**Step 3: What's Included**
```
• List deliverables (bullet points)
• Delivery method (PDF, video, call, etc.)
• Delivery timeframe
• Revisions included
```

**Step 4: Pricing & Availability**
```
• Price (fixed, variable, or custom quote)
• Platform fee calculation (20%)
• Service status (active/paused/draft)
• Max concurrent bookings
• Lead time required
• Blackout dates
```

**Step 5: Requirements & FAQs**
```
• What you need from travelers
• Common FAQs
• Cancellation policy
```

### Service Templates

Pre-built templates experts can use:

```
┌────────────────────────────────────────────────────────────────────┐
│ SERVICE TEMPLATES                                          [✕]     │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│ POPULAR TEMPLATES                                                  │
│                                                                    │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ ☎️ Quick Consultation (30 min)                      $29      │ │
│ │ Used by 1,247 experts • Avg rating: 4.8                      │ │
│ │ [Use This Template]                                           │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 📋 Cart Review & Optimization                        $49      │ │
│ │ Used by 892 experts • Avg rating: 4.9                        │ │
│ │ [Use This Template]                                           │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ ⭐ Full Trip Planning                                $249     │ │
│ │ Used by 2,103 experts • Avg rating: 4.8                      │ │
│ │ [Use This Template]                                           │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│ [View All Templates] [Start from Scratch]                        │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## EXPERT DISCOVERY & BOOKING

### Expert Profile Page (NEW)

**Route:** `/experts/[expertId]`

```
┌────────────────────────────────────────────────────────────────────┐
│ [NAVBAR]                                     🛒 Cart    [Profile]  │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ← Back to All Experts                                             │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                                                            │   │
│  │  [Large Photo]    MARIA DUBOIS                             │   │
│  │                  Paris Travel Expert                       │   │
│  │                  ⭐ 4.8 (247 reviews)                       │   │
│  │                  💬 Responds in <2 hours                   │   │
│  │                  🌍 English, French, Spanish               │   │
│  │                  📍 Paris, France                          │   │
│  │                                                            │   │
│  │  [Chat Now]  [View All Services]                          │   │
│  │                                                            │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  [About] [Services ✓] [Reviews] [Portfolio]                       │
│                                                                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                    │
│  MY SERVICES                                                       │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  ☎️ QUICK CONSULTATION                              $29     │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │  30-minute video or phone call                               │ │
│  │  • Answer specific questions                                 │ │
│  │  • Best neighborhoods & restaurants                          │ │
│  │  • Quick validation of your plans                            │ │
│  │                                                              │ │
│  │  ⏱️ 30 minutes  📅 Same-day available                       │ │
│  │  ⭐ 4.9 (23 reviews for this service)                        │ │
│  │                                                              │ │
│  │  [Select This Service]  [Learn More]                        │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  📋 CART REVIEW & OPTIMIZATION          $49  ⭐ POPULAR     │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │  I'll review your complete trip cart and provide:            │ │
│  │  • Better deals & alternatives                               │ │
│  │  • Hidden gems you're missing                                │ │
│  │  • Route & timing optimization                               │ │
│  │  • Detailed PDF recommendations                              │ │
│  │                                                              │ │
│  │  ⏱️ 24-48 hours  💰 Avg savings: $300                       │ │
│  │  ⭐ 5.0 (67 reviews for this service)                        │ │
│  │                                                              │ │
│  │  [Select This Service]  [Learn More]                        │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  ⭐ COMPLETE TRIP PLANNING                          $249    │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │  Full-service planning from start to finish:                 │ │
│  │  • Custom itinerary based on your preferences                │ │
│  │  • Restaurant reservations (3-5 spots)                       │ │
│  │  • Activity bookings & skip-line tickets                     │ │
│  │  • Day-by-day schedule with maps                             │ │
│  │  • 24/7 WhatsApp support during trip                         │ │
│  │  • Unlimited revisions                                       │ │
│  │                                                              │ │
│  │  ⏱️ 48-72 hours  💯 Satisfaction guaranteed                 │ │
│  │  ⭐ 4.9 (157 reviews for this service)                       │ │
│  │                                                              │ │
│  │  [Select This Service]  [Learn More]                        │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  [View All 8 Services]                                             │
│                                                                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                    │
│  💡 Not sure which service? [Chat with Maria First]                │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Service Selection Flow

```
User clicks "Select This Service"
                ↓
┌────────────────────────────────────────────────────────────────────┐
│ BOOK: CART REVIEW & OPTIMIZATION                          [✕]     │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│ Service: Cart Review & Optimization                                │
│ Expert: Maria Dubois                                               │
│ Price: $49.00                                                      │
│                                                                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                    │
│ YOUR TRIP DETAILS                                                  │
│                                                                    │
│ Destination: [Paris, France                                   ▼]  │
│ Travel Dates: [Jan 15 - Jan 22, 2026                          ]   │
│ Number of travelers: [2 adults                                ▼]  │
│                                                                    │
│ Link to your trip cart:                                            │
│ [https://traveloure.com/trips/abc123                          ]   │
│ Auto-detected from your account ✓                                  │
│                                                                    │
│ Budget per person: (optional)                                      │
│ $[1,500]                                                           │
│                                                                    │
│ Special requests or preferences:                                   │
│ [We love romantic spots and great food! Also vegetarian.      ]   │
│ [                                                             ]   │
│                                                                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                    │
│ WHAT HAPPENS NEXT                                                  │
│                                                                    │
│ 1. Maria will be notified of your booking                          │
│ 2. She'll review your cart within 24-48 hours                      │
│ 3. You'll receive detailed recommendations                         │
│ 4. Optional 15-min follow-up call included                         │
│                                                                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                    │
│ PAYMENT                                                            │
│                                                                    │
│ Service: $49.00                                                    │
│ Platform fee: Waived when booking expert service                   │
│ ━━━━━━━━━━━                                                        │
│ Total: $49.00                                                      │
│                                                                    │
│ [Cancel]  [Confirm & Pay →]                                        │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

                ↓ Click "Confirm & Pay"

Redirect to Stripe payment
                ↓
Payment successful
                ↓
Auto-generate contract with service details
                ↓
Contract status: "paid"
                ↓
Notify expert via WebSocket
                ↓
Auto-open chat with expert
                ↓
Expert delivers service
```

---

## SERVICE PROVIDER OVERVIEW

### What Service Providers Do

**Primary Function:** Service Execution & Delivery

**Deliverables:**
- Physical services (photography, transportation, etc.)
- In-person experiences
- Task completion
- Tangible results

**Must be:** Local to destination

**Example:** Pierre the photographer who takes actual photos in Paris

---

## SERVICE PROVIDER CATEGORIES

### 15 Core Categories

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. PHOTOGRAPHY & VIDEOGRAPHY                                   │
├─────────────────────────────────────────────────────────────────┤
│ 📸 Photographer                                                 │
│ • Portrait, event, engagement, family, architectural            │
│ • Typical: $150-500 per session                                 │
│ • Verification: Portfolio, insurance                            │
│                                                                 │
│ 🎬 Videographer                                                 │
│ • Travel videos, events, drone footage, social content          │
│ • Typical: $300-1,000 per day                                   │
│ • Verification: Portfolio reel, drone license                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 2. TRANSPORTATION & LOGISTICS                                  │
├─────────────────────────────────────────────────────────────────┤
│ 🚗 Private Driver                                               │
│ • Airport transfers, day trips, multi-day chauffeur             │
│ • Typical: $50-150/hour, $400-800/day                           │
│ • Verification: License, insurance, vehicle registration        │
│                                                                 │
│ 🚙 Car Rental with Driver                                       │
│ 🚁 Specialty Transport (helicopter, boat, bicycle)              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 3. FOOD & CULINARY                                             │
├─────────────────────────────────────────────────────────────────┤
│ 👨‍🍳 Private Chef                                                │
│ • In-villa cooking, dinner parties, cooking lessons, meal prep  │
│ • Typical: $200-600 per meal/session                            │
│ • Verification: Culinary credentials, food handler's license    │
│                                                                 │
│ 🍷 Sommelier / Wine Guide                                       │
│ 🍜 Food Tour Guide                                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 4. CHILDCARE & FAMILY                                          │
├─────────────────────────────────────────────────────────────────┤
│ 👶 Babysitter / Nanny                                           │
│ • Hourly, overnight, multi-day, newborn specialists             │
│ • Typical: $20-50 per hour                                      │
│ • Verification: Background check, CPR, references               │
│                                                                 │
│ 🎭 Kids Activity Coordinator                                    │
│ 👨‍👩‍👧‍👦 Family Assistant                                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 5. TOURS & EXPERIENCES                                         │
├─────────────────────────────────────────────────────────────────┤
│ 🎯 Tour Guide                                                   │
│ • Walking, museum, historical, neighborhood, multi-day          │
│ • Typical: $100-300 per tour                                    │
│ • Verification: Tour guide license, insurance                   │
│                                                                 │
│ 🏃 Adventure Guide (hiking, climbing, water sports)             │
│ 🎨 Cultural Experience Host (art, craft, ceremonies)            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 6. PERSONAL ASSISTANCE                                         │
├─────────────────────────────────────────────────────────────────┤
│ 🤝 Travel Companion                                             │
│ • Solo traveler, elderly, accessibility, language, safety       │
│ • Typical: $100-300 per day                                     │
│ • Verification: Background check, references, first aid         │
│                                                                 │
│ 🏨 Personal Concierge                                           │
│ 💼 Executive Assistant                                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 7. TASKRABBIT-STYLE SERVICES                                   │
├─────────────────────────────────────────────────────────────────┤
│ 🔧 Handyman / Fixer                                             │
│ 📦 Delivery & Pickup                                            │
│ 🧹 Cleaning Service                                             │
│ 🔑 Property Management                                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 8. HEALTH & WELLNESS                                           │
├─────────────────────────────────────────────────────────────────┤
│ 🧘 Fitness Instructor                                           │
│ 💆 Massage Therapist                                            │
│ 🏥 Medical Assistant                                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 9. BEAUTY & STYLING                                            │
├─────────────────────────────────────────────────────────────────┤
│ 💇 Hair & Makeup                                                │
│ 👗 Personal Stylist                                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 10. PETS & ANIMALS                                             │
├─────────────────────────────────────────────────────────────────┤
│ 🐕 Pet Sitter                                                   │
│ 🐴 Animal Experience Guide                                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 11. EVENTS & CELEBRATIONS                                      │
├─────────────────────────────────────────────────────────────────┤
│ 🎉 Event Coordinator                                            │
│ 💐 Florist                                                      │
│ 🎂 Baker / Pastry Chef                                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 12. TECHNOLOGY & CONNECTIVITY                                  │
├─────────────────────────────────────────────────────────────────┤
│ 💻 Tech Support                                                 │
│ 📱 Social Media Manager                                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 13. LANGUAGE & TRANSLATION                                     │
├─────────────────────────────────────────────────────────────────┤
│ 🗣️ Translator / Interpreter                                    │
│ 📚 Language Tutor                                               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 14. SPECIALTY SERVICES                                         │
├─────────────────────────────────────────────────────────────────┤
│ 👰 Wedding Coordinator                                          │
│ 🎓 Education Guide                                              │
│ 🏠 Relocation Specialist                                        │
│ ⚖️ Legal / Visa Assistant                                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 15. CUSTOM / OTHER                                             │
├─────────────────────────────────────────────────────────────────┤
│ ⭐ Custom Service Provider                                      │
│ • User-requested categories                                     │
│ • Admin approval required                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## CATEGORY MANAGEMENT

### Admin Can Create New Categories

```
┌────────────────────────────────────────────────────────────────────┐
│ ADMIN: CREATE SERVICE PROVIDER CATEGORY                           │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│ BASIC INFORMATION                                                  │
│                                                                    │
│ Category Name: *                                                   │
│ [Travel Companion                                             ]   │
│                                                                    │
│ URL Slug: (auto-generated)                                         │
│ [travel-companion                                             ]   │
│                                                                    │
│ Icon/Emoji:                                                        │
│ [🤝] [Choose Icon]                                                 │
│                                                                    │
│ Category Type:                                                     │
│ ● Service Provider (delivers physical services)                   │
│ ○ Local Expert (provides knowledge/planning)                      │
│ ○ Hybrid (can be both)                                            │
│                                                                    │
│ Description:                                                       │
│ [Verified companions for solo travelers, elderly assistance,  ]   │
│ [accessibility support, and language help                     ]   │
│                                                                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                    │
│ VERIFICATION REQUIREMENTS                                          │
│                                                                    │
│ ☑ Verification required for this category                         │
│                                                                    │
│ Required Documents:                                                │
│ ☑ Background check (mandatory)                                    │
│ ☑ Government ID                                                   │
│ ☑ References (3 minimum)                                          │
│ ☑ First Aid / CPR certification                                   │
│ ☐ Professional license                                            │
│ ☐ Insurance proof                                                 │
│                                                                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                    │
│ CUSTOM PROFILE FIELDS                                              │
│                                                                    │
│ Field 1: [Languages Spoken        ] Type: [Multi-select      ▼]  │
│ Field 2: [Specialization          ] Type: [Multi-select      ▼]  │
│          Options: Solo travelers, Elderly, Accessibility,          │
│                   Language assistance, Safety                      │
│ Field 3: [Years of Experience      ] Type: [Number           ▼]  │
│ Field 4: [Emergency Contact Info   ] Type: [Text             ▼]  │
│                                                                    │
│ [+ Add Custom Field]                                               │
│                                                                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                    │
│ SERVICE TEMPLATES                                                  │
│                                                                    │
│ Pre-define common services for this category:                     │
│                                                                    │
│ Template 1: Day Companion                                          │
│ • Price: $150/day                                                  │
│ • Description: Full-day companionship and assistance              │
│                                                                    │
│ Template 2: Half-Day Companion                                     │
│ • Price: $80/half-day                                              │
│ • Description: 4-hour companionship                                │
│                                                                    │
│ [+ Add Service Template]                                           │
│                                                                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                    │
│ CATEGORY SETTINGS                                                  │
│                                                                    │
│ Display Order: [6] (higher = shows first)                         │
│ ☑ Active (visible to users)                                       │
│ ☑ Featured category (promoted on homepage)                        │
│ ☑ Allow multiple services per provider                            │
│ ☑ Limit to verified providers only                                │
│                                                                    │
│                         [Cancel]  [Create Category]               │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## PROVIDER REGISTRATION & VERIFICATION

### Multi-Step Registration (5 Steps)

**Step 1: Select Roles**
```
What services do you provide? (Select all that apply)

Photography & Video:
☑ Photographer
☐ Videographer

Transportation:
☐ Private Driver

Food & Culinary:
☑ Private Chef

Personal Assistance:
☐ Travel Companion

[Show More Categories...]

Don't see your service?
[Request New Category]
```

**Step 2: Basic Information**
```
Business/Professional Name: *
[Pierre's Photography & Culinary Services]

Primary Role: (What you do most)
● Photographer
○ Private Chef

Location: *
[Paris, France]

Service Radius: [15] km

Languages: French, English

Bio: [Professional photographer and chef...]

Profile Photo: [Upload]
```

**Step 3: Role-Specific Details**

For Photographer:
```
Photography Styles:
☑ Portrait  ☑ Event  ☑ Landscape

Equipment:
Camera: [Canon EOS R5]
Lenses: [24-70mm, 70-200mm, 50mm]
☑ Drone  ☑ Lighting  ☑ Backup camera

Years Experience: [8]

Portfolio: [https://pierrephotos.com]
```

For Private Chef:
```
Cuisine Specialties:
☑ French  ☑ Italian  ☑ Pastry

Dietary Accommodations:
☑ Vegan  ☑ Vegetarian  ☑ Gluten-free

Certifications:
[Le Cordon Bleu Paris - 2012]
[Food Handler's License - 2027]

Years Experience: [12]
```

**Step 4: Verification Documents**

For Photographer:
```
✓ Portfolio (Required) - [Uploaded ✓]
✓ Insurance (Required) - [Uploaded ✓]
○ Equipment List (Optional)
```

For Private Chef:
```
✓ Culinary Certification - [Uploaded ✓]
✓ Food Handler's License - [Uploaded ✓]
○ Liability Insurance (Recommended)
```

General:
```
✓ Government ID - [Uploaded ✓]
○ Background Check (Required for childcare/companions)
```

**Step 5: Payment & Legal**
```
PAYOUT INFORMATION
Bank Account: [IBAN or PayPal]

TAX INFORMATION
● Individual
○ Business
Tax ID: [FR12345678901]

TERMS & CONDITIONS
☑ Service Provider Terms
☑ 20% platform fee
☑ Maintain insurance
☑ Quality service commitment
```

---

## HOMEPAGE & ENTRY POINTS

### Dual-Path Landing Page

```
┌────────────────────────────────────────────────────────────────────┐
│                     [Hero Background Image]                        │
│                                                                    │
│  [NAVBAR]                            🛒 Cart        [Sign In]      │
│                                                                    │
│              ╔════════════════════════════════════╗                │
│              ║  PLAN YOUR PERFECT EXPERIENCE      ║                │
│              ╚════════════════════════════════════╝                │
│                                                                    │
│          Choose how you'd like to get started:                     │
│                                                                    │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐ │
│  │  🛍️ BROWSE & BUILD          │  │  👤 WORK WITH EXPERTS       │ │
│  │                             │  │                             │ │
│  │  Explore activities,        │  │  Get help from verified     │ │
│  │  hotels, and services       │  │  local experts              │ │
│  │                             │  │                             │ │
│  │  ✓ Browse real inventory    │  │  ✓ Planning & guidance      │ │
│  │  ✓ Add to cart              │  │  ✓ Custom itineraries       │ │
│  │  ✓ AI optimization          │  │  ✓ Insider knowledge        │ │
│  │  ✓ Add expert help anytime  │  │  ✓ 24/7 trip support        │ │
│  │                             │  │                             │ │
│  │  [Start Browsing - Free →] │  │  [Browse Experts - $29+ →]  │ │
│  └─────────────────────────────┘  └─────────────────────────────┘ │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  🎯 OR BOOK SPECIFIC SERVICES                               │  │
│  │                                                             │  │
│  │  Need a photographer? Babysitter? Private driver?          │  │
│  │  [Browse Service Providers →]                              │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                    │
│  🌟 MEET OUR LOCAL EXPERTS                                         │
│                                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ [Photo]  │  │ [Photo]  │  │ [Photo]  │  │ [Photo]  │          │
│  │ Maria    │  │ Kenji    │  │ Priya    │  │ Ana      │          │
│  │ Paris    │  │ Kyoto    │  │ Mumbai   │  │ Bogotá   │          │
│  │ ⭐ 4.9   │  │ ⭐ 5.0   │  │ ⭐ 4.8   │  │ ⭐ 4.9   │          │
│  │ $29+     │  │ $29+     │  │ $29+     │  │ $29+     │          │
│  │ [View]   │  │ [View]   │  │ [View]   │  │ [View]   │          │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │
│                                                                    │
│  [Browse All 2,847 Experts Worldwide →]                            │
│                                                                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                    │
│  🎯 POPULAR SERVICE CATEGORIES                                     │
│                                                                    │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│  │   📸    │ │   🚗    │ │   👨‍🍳    │ │   👶    │ │   🤝    │     │
│  │  Photo  │ │ Transport│ │  Chef   │ │ Childcare│ │Companion│     │
│  │  (847)  │ │  (234)  │ │  (156)  │ │  (98)   │ │  (143)  │     │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │
│                                                                    │
│  [View All 15 Service Categories]                                  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## BROWSE & DISCOVERY EXPERIENCE

### Service Provider Marketplace

```
┌────────────────────────────────────────────────────────────────────┐
│ SERVICE PROVIDERS                                                  │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│ BROWSE BY CATEGORY:                                                │
│                                                                    │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│ │   📸    │ │   🚗    │ │   👨‍🍳    │ │   👶    │ │   🤝    │     │
│ │  Photo  │ │ Transport│ │  Chef   │ │ Childcare│ │Companion│     │
│ │  (847)  │ │  (234)  │ │  (156)  │ │  (98)   │ │  (143)  │     │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │
│                                                                    │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│ │   🎭    │ │   💆    │ │   🐕    │ │   🎉    │ │   🗣️   │     │
│ │  Tours  │ │ Wellness│ │  Pets   │ │  Events │ │Language │     │
│ │  (423)  │ │  (187)  │ │  (67)   │ │  (112)  │ │  (201)  │     │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │
│                                                                    │
│ [View All 15 Categories]                                           │
│                                                                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                    │
│ OR SEARCH:                                                         │
│                                                                    │
│ [🔍 What service do you need?                                 ]   │
│     Examples: "wedding photographer Paris", "babysitter 3 hours"  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

                    ↓ User clicks "Photo (847)"

┌────────────────────────────────────────────────────────────────────┐
│ PHOTOGRAPHERS                                                      │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│ 📍 Location: [Paris, France                                   ▼]  │
│ 📅 Dates: [Jan 15-22, 2026                                    ]   │
│                                                                    │
│ Filters:                                                           │
│ Price: [Any ▼] Rating: [4+ ⭐] Style: [All ▼] Language: [Any ▼]  │
│                                                                    │
│ Sort by: [Recommended ▼]                                           │
│                                                                    │
│ Showing 847 photographers in Paris                                 │
│                                                                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                    │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 🏆 TOP RATED                                                 │ │
│ ├──────────────────────────────────────────────────────────────┤ │
│ │                                                              │ │
│ │ [Photo]  PIERRE DUBOIS                                       │ │
│ │          Photographer • Videographer • Tour Guide            │ │
│ │          ⭐ 4.9 (243 reviews)                                 │ │
│ │                                                              │ │
│ │          📸 Portrait, Event, Street, Architectural           │ │
│ │          💬 French, English                                  │ │
│ │          📍 15km radius                                      │ │
│ │                                                              │ │
│ │          Services from: $150                                 │ │
│ │          • Portrait Session - $200 (2 hours)                 │ │
│ │          • Engagement Shoot - $300 (3 hours, 50+ photos)    │ │
│ │          • Full Day Wedding - $1,200                         │ │
│ │                                                              │ │
│ │          ✓ Available Jan 15-22                               │ │
│ │          ✓ Verified  ✓ Insured  ✓ Background Checked        │ │
│ │                                                              │ │
│ │          [View Profile]  [Book Now]  [Chat]                  │ │
│ │                                                              │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│ [Load More...]                                                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## SERVICE BOOKING FLOW

### Unified Booking Experience

Same flow for both Local Experts and Service Providers:

```
1. Browse → Select provider → View profile
2. View services menu → Select service
3. Fill in details (dates, requirements, preferences)
4. Review & pay (Stripe)
5. Auto-generate contract
6. Notify provider (WebSocket)
7. Auto-open chat
8. Provider delivers service
```

**Key Features:**
- Single checkout flow
- Same contract system
- Same payment processor
- Same chat interface
- Same review system

---

## INTEGRATION WITH DIY TRIP PLANNING

### Experts & Providers in Cart Sidebar

```
┌────────────────────────────────────────────────────────────────────┐
│ Paris • Jan 2-9, 2026              🛒 Cart: $2,161 (7 items)      │
├─────────────────────────────┬──────────────────────────────────────┤
│                             │                                      │
│ [Activities] [Hotels]       │  ┌────────────────────────────────┐ │
│ [Services] [Experts ✓]      │  │ YOUR CART                      │ │
│ [AI Optimization]           │  ├────────────────────────────────┤ │
│                             │  │ ACTIVITIES (3)        $522     │ │
│  PARIS TRAVEL EXPERTS       │  │ HOTEL (7 nights)    $1,330     │ │
│                             │  │ SERVICES (2)          $260     │ │
│  💡 Get expert help!        │  │ EXPERT SERVICES (1)    $49     │ │
│                             │  │ • Cart Review - Maria          │ │
│  ┌───────────────────────┐ │  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━   │ │
│  │ [Photo] MARIA         │ │  │ SUBTOTAL            $2,161     │ │
│  │ ⭐ 5.0 (247)          │ │  │ Platform Fee            $0     │ │
│  │                       │ │  │ (waived)                       │ │
│  │ "I can review your    │ │  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━   │ │
│  │ cart and save you     │ │  │ TOTAL               $2,161     │ │
│  │ $300-400!"            │ │  └────────────────────────────────┘ │
│  │                       │ │                                      │
│  │ Services from: $29    │ │                                      │
│  │                       │ │                                      │
│  │ [View Services]       │ │                                      │
│  │ [Add Cart Review $49] │ │                                      │
│  └───────────────────────┘ │                                      │
│                             │                                      │
│  [Browse All Experts]       │                                      │
│                             │                                      │
└─────────────────────────────┴──────────────────────────────────────┘
```

---

## SYSTEM ARCHITECTURE

### Component Hierarchy

```
Traveloure Platform
├── User Roles
│   ├── Traveler (consumer)
│   ├── Local Expert (knowledge provider)
│   └── Service Provider (service executor)
│       └── Can have multiple categories
│
├── Marketplace Structure
│   ├── DIY Commerce (activities, hotels, services)
│   ├── Expert Marketplace
│   │   ├── Browse experts
│   │   ├── Expert profiles with services menu
│   │   └── Self-service or chat-first booking
│   │
│   └── Service Provider Marketplace
│       ├── Browse by category
│       ├── Provider profiles with services
│       └── Direct booking
│
├── Shared Infrastructure
│   ├── Contract System
│   │   ├── Manual creation (expert creates)
│   │   └── Auto-generation (service selection)
│   │
│   ├── Payment System (Stripe)
│   │   ├── Payment link generation
│   │   ├── Payment confirmation
│   │   └── Payout processing (80/20 split)
│   │
│   ├── Communication System (WebSocket)
│   │   ├── Real-time messaging
│   │   ├── File attachments
│   │   └── Online/offline status
│   │
│   └── Booking Management
│       ├── Service fulfillment tracking
│       ├── Review system
│       └── Support/dispute resolution
│
└── Admin Tools
    ├── Category management
    ├── Provider verification
    ├── Content moderation
    └── Analytics
```

### Data Flow

```
SERVICE BOOKING FLOW:

1. Traveler → Browse providers/experts
2. Select service → Fill requirements
3. Checkout → Stripe payment
4. Payment success → Trigger webhook
5. Webhook → Create/update contract
6. Contract → Status: "paid"
7. WebSocket → Notify provider
8. Auto-open chat → Communication established
9. Provider → Deliver service
10. Traveler → Leave review
11. System → Process payout (weekly)
```

---

## DATABASE SCHEMA

### New Tables

```sql
-- Service Provider Categories
CREATE TABLE service_provider_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  icon VARCHAR(10), -- Emoji
  category_type VARCHAR(20) NOT NULL, -- 'service_provider', 'local_expert', 'hybrid'
  is_active BOOLEAN DEFAULT true,
  verification_required BOOLEAN DEFAULT true,
  required_documents JSONB, -- ['portfolio', 'insurance', 'license']
  custom_fields JSONB, -- Category-specific profile fields
  service_templates JSONB, -- Pre-defined service templates
  display_order INT DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Provider to Role Mapping (Many-to-Many)
CREATE TABLE provider_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES service_provider_categories(id) ON DELETE CASCADE,
  verification_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  verification_documents JSONB, -- Uploaded docs
  custom_field_values JSONB, -- Category-specific data
  is_primary_role BOOLEAN DEFAULT false,
  approved_at TIMESTAMP,
  approved_by UUID REFERENCES users(id),
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider_id, category_id)
);

-- Index for performance
CREATE INDEX idx_provider_roles_provider ON provider_roles(provider_id);
CREATE INDEX idx_provider_roles_category ON provider_roles(category_id);
CREATE INDEX idx_provider_roles_status ON provider_roles(verification_status);

-- Services Table (extend existing)
ALTER TABLE services ADD COLUMN category_id UUID REFERENCES service_provider_categories(id);
ALTER TABLE services ADD COLUMN is_featured BOOLEAN DEFAULT false;
ALTER TABLE services ADD COLUMN service_type VARCHAR(50); -- 'consultation', 'planning', 'action', etc.
ALTER TABLE services ADD COLUMN delivery_method VARCHAR(50); -- 'pdf', 'video', 'in-person', etc.
ALTER TABLE services ADD COLUMN delivery_timeframe VARCHAR(100); -- '24-48 hours', 'same-day', etc.
ALTER TABLE services ADD COLUMN revisions_included INT DEFAULT 0;
ALTER TABLE services ADD COLUMN max_concurrent_bookings INT;
ALTER TABLE services ADD COLUMN lead_time_hours INT DEFAULT 24;
ALTER TABLE services ADD COLUMN requirements JSONB; -- What provider needs from traveler

-- Service Bookings (track all bookings)
CREATE TABLE service_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES services(id),
  traveler_id UUID REFERENCES users(id),
  provider_id UUID REFERENCES users(id),
  contract_id UUID REFERENCES contracts(id), -- Links to existing contract system
  booking_details JSONB, -- Trip dates, preferences, requirements
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'
  total_amount DECIMAL(10,2),
  platform_fee DECIMAL(10,2),
  provider_earnings DECIMAL(10,2),
  stripe_payment_intent_id VARCHAR(255),
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  cancellation_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bookings_traveler ON service_bookings(traveler_id);
CREATE INDEX idx_bookings_provider ON service_bookings(provider_id);
CREATE INDEX idx_bookings_status ON service_bookings(status);
CREATE INDEX idx_bookings_service ON service_bookings(service_id);

-- Reviews (extend if not exists, or create)
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES service_bookings(id),
  service_id UUID REFERENCES services(id),
  provider_id UUID REFERENCES users(id),
  traveler_id UUID REFERENCES users(id),
  rating INT CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  review_type VARCHAR(50), -- 'service', 'provider', 'expert'
  response_text TEXT, -- Provider can respond
  response_at TIMESTAMP,
  is_verified BOOLEAN DEFAULT false, -- Booking actually happened
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_reviews_provider ON reviews(provider_id);
CREATE INDEX idx_reviews_service ON reviews(service_id);
```

### Sample Data

```sql
-- Insert Photography Category
INSERT INTO service_provider_categories (name, slug, icon, category_type, description, verification_required, required_documents, custom_fields, service_templates)
VALUES (
  'Photographer',
  'photographer',
  '📸',
  'service_provider',
  'Professional photography services for portraits, events, engagements, and more',
  true,
  '["portfolio", "insurance", "government_id"]',
  '{
    "photography_styles": {
      "type": "multi-select",
      "options": ["Portrait", "Event", "Landscape", "Street", "Wedding", "Family"]
    },
    "equipment": {
      "type": "text",
      "label": "Camera and equipment"
    },
    "years_experience": {
      "type": "number",
      "label": "Years of experience"
    }
  }',
  '[
    {
      "title": "Portrait Session",
      "description": "2-hour portrait photography session",
      "price_range": [150, 300],
      "what_included": ["2 hours shooting", "30+ edited photos", "Online gallery"]
    },
    {
      "title": "Engagement Shoot",
      "description": "Capture your engagement with professional photos",
      "price_range": [250, 500],
      "what_included": ["3 hours shooting", "50+ edited photos", "Multiple locations", "Online gallery"]
    }
  ]'
);

-- Insert Travel Companion Category
INSERT INTO service_provider_categories (name, slug, icon, category_type, description, verification_required, required_documents, custom_fields)
VALUES (
  'Travel Companion',
  'travel-companion',
  '🤝',
  'service_provider',
  'Verified companions for solo travelers, elderly assistance, and safety support',
  true,
  '["background_check", "government_id", "references", "first_aid_cert"]',
  '{
    "specialization": {
      "type": "multi-select",
      "options": ["Solo Travelers", "Elderly", "Accessibility", "Language Assistance", "Safety"]
    },
    "languages_spoken": {
      "type": "multi-select",
      "label": "Languages spoken"
    },
    "emergency_contact": {
      "type": "text",
      "label": "Emergency contact information"
    }
  }'
);
```

---

## API ENDPOINTS

### Category Management

```javascript
// GET /api/admin/service-categories
// List all service provider categories
Response: [
  {
    id: "uuid",
    name: "Photographer",
    slug: "photographer",
    icon: "📸",
    category_type: "service_provider",
    provider_count: 847,
    booking_count: 12432,
    is_active: true
  }
]

// POST /api/admin/service-categories
// Create new category
Body: {
  name: "Travel Companion",
  slug: "travel-companion",
  icon: "🤝",
  category_type: "service_provider",
  description: "...",
  verification_required: true,
  required_documents: ["background_check", "references"],
  custom_fields: {...}
}

// PUT /api/admin/service-categories/:id
// Update category

// DELETE /api/admin/service-categories/:id
// Soft delete (set is_active = false)
```

### Provider Registration & Roles

```javascript
// POST /api/providers/register
// Multi-role provider registration
Body: {
  basic_info: {
    business_name: "Pierre's Services",
    location: "Paris, France",
    bio: "...",
    languages: ["French", "English"]
  },
  roles: [
    {
      category_id: "photographer-uuid",
      custom_fields: {
        photography_styles: ["Portrait", "Event"],
        equipment: "Canon EOS R5",
        years_experience: 8
      },
      verification_documents: {
        portfolio: "url",
        insurance: "url"
      },
      is_primary: true
    },
    {
      category_id: "chef-uuid",
      custom_fields: {...},
      verification_documents: {...}
    }
  ]
}

// GET /api/providers/:providerId/roles
// Get provider's roles and verification status
Response: [
  {
    category: {name: "Photographer", icon: "📸"},
    verification_status: "approved",
    is_primary: true
  }
]

// POST /api/admin/providers/verify
// Approve provider role
Body: {
  provider_role_id: "uuid",
  action: "approve", // or "reject"
  admin_notes: "..."
}
```

### Service Creation (Same as Experts)

```javascript
// POST /api/services
// Create service (works for both experts and providers)
Body: {
  provider_id: "uuid",
  category_id: "photographer-uuid", // Links to service category
  title: "Engagement Photoshoot",
  description: "...",
  price: 300,
  service_type: "photography",
  delivery_method: "in-person",
  delivery_timeframe: "Within 48 hours",
  what_included: ["3 hours", "50+ photos", "Online gallery"],
  requirements: ["Date", "Location preference", "Style preference"],
  max_concurrent_bookings: 5,
  is_active: true
}

// GET /api/services?provider_id=uuid
// Get provider's services

// GET /api/services?category_id=uuid&location=Paris
// Browse services by category and location
```

### Service Booking

```javascript
// POST /api/bookings
// Book a service (auto-generates contract)
Body: {
  service_id: "uuid",
  traveler_id: "uuid",
  booking_details: {
    trip_dates: "2026-01-15 to 2026-01-22",
    location: "Paris",
    requirements: {
      num_travelers: 2,
      preferences: "We love romantic spots"
    }
  },
  payment_method_id: "stripe-pm-id"
}

Response: {
  booking_id: "uuid",
  contract_id: "uuid",
  stripe_payment_intent: "pi_...",
  status: "pending_payment"
}

// Webhook: /api/webhooks/stripe
// On payment success:
// 1. Update booking status → "confirmed"
// 2. Update contract status → "paid"
// 3. Send WebSocket to provider
// 4. Create/open chat room
// 5. Send email notifications
```

### Discovery & Search

```javascript
// GET /api/marketplace/experts
// Browse local experts
Query params: location, specialty, rating, language

// GET /api/marketplace/providers
// Browse service providers
Query params: category_id, location, dates, rating

// GET /api/marketplace/providers/:id
// Get provider profile + services + reviews

// GET /api/marketplace/search
// Unified search across experts and providers
Query: "photographer Paris wedding"
Response: {
  experts: [...],
  providers: [...]
}
```

---

## UI COMPONENTS

### Reusable Components

**ExpertCard / ProviderCard**
```jsx
<ProviderCard
  provider={provider}
  primaryRole="Photographer"
  rating={4.9}
  reviewCount={243}
  servicesFrom={150}
  badges={['Verified', 'Insured', 'Background Checked']}
  onViewProfile={() => {}}
  onBookNow={() => {}}
  onChat={() => {}}
/>
```

**ServiceCard**
```jsx
<ServiceCard
  service={service}
  title="Engagement Photoshoot"
  price={300}
  description="..."
  rating={4.9}
  reviewCount={23}
  deliveryTime="Within 48 hours"
  whatIncluded={['3 hours', '50+ photos']}
  onSelect={() => {}}
  onLearnMore={() => {}}
/>
```

**ServiceBookingModal**
```jsx
<ServiceBookingModal
  isOpen={isOpen}
  service={service}
  provider={provider}
  onClose={() => {}}
  onConfirm={(bookingDetails) => {}}
/>
```

**CategoryBrowser**
```jsx
<CategoryBrowser
  categories={categories}
  onSelectCategory={(category) => {}}
  layout="grid" // or "carousel"
/>
```

**ProviderDashboard**
```jsx
// Reuse LocalExpertDashboard with role-aware features
<ProviderDashboard
  provider={provider}
  roles={['photographer', 'chef']}
  activeRole="photographer"
  onSwitchRole={(role) => {}}
/>
```

---

## INTEGRATION POINTS

### Existing Systems

**Contract System** ✅ No Changes Needed
- Service booking → auto-generate contract
- Same ContractMessage component
- Same payment flow
- Same status tracking

**Payment System** ✅ No Changes Needed
- Stripe integration unchanged
- 80/20 split logic same
- Payout processing same

**Chat System** ✅ No Changes Needed
- WebSocket infrastructure same
- ChatInterface component reused
- Message types extended (service bookings)

**User System** ✅ Minor Extension
- Add user_type field: 'traveler' | 'local_expert' | 'service_provider'
- One user can be multiple types

**Search System** ✅ Extension Needed
- Add category filtering
- Add multi-role search
- Unified search across experts + providers

---

## PHASE 1: EXPERT SERVICES MENU

**Duration:** 2-3 weeks

### Backend (Week 1)
```
□ Service model enhancements
  □ Add category_id, service_type, delivery_method
  □ Add requirements, max_bookings, lead_time
  
□ CRUD endpoints
  □ POST /api/services (create)
  □ GET /api/services (list with filters)
  □ PUT /api/services/:id (update)
  □ DELETE /api/services/:id (soft delete)
  
□ Service templates
  □ Pre-defined templates in database
  □ Template selection endpoint
```

### Frontend (Week 2)
```
□ Complete /local-expert/services/page.jsx
  □ Service list view with analytics
  □ Create service button
  
□ Service creation wizard (5 steps)
  □ Step 1: Choose type
  □ Step 2: Basic info
  □ Step 3: What's included
  □ Step 4: Pricing
  □ Step 5: Requirements
  
□ Service templates UI
  □ Template browser
  □ Template selection
  □ Customization
  
□ Service management
  □ Edit services
  □ Pause/activate
  □ Analytics view
  □ Duplicate service
```

### Testing (Week 3)
```
□ Expert creates services
□ Services appear in expert profile
□ Service editing works
□ Analytics tracking works
□ Template system works
```

---

## PHASE 2: SERVICE PROVIDER CATEGORIES

**Duration:** 3-4 weeks

### Backend (Week 1-2)
```
□ Database schema
  □ service_provider_categories table
  □ provider_roles table
  □ Indexes for performance
  
□ Admin API endpoints
  □ Category CRUD
  □ Provider verification
  □ Category stats
  
□ Provider registration API
  □ Multi-step registration
  □ Document upload
  □ Verification workflow
  
□ Category-specific logic
  □ Custom fields handling
  □ Verification rules engine
  □ Service templates per category
```

### Frontend (Week 2-3)
```
□ Admin category management
  □ Category list view
  □ Create category form
  □ Edit category
  □ View providers per category
  □ Verification queue
  
□ Provider registration flow
  □ Step 1: Select roles
  □ Step 2: Basic info
  □ Step 3: Role-specific details
  □ Step 4: Document upload
  □ Step 5: Payment setup
  
□ Provider dashboard
  □ Multi-role support
  □ Role switcher
  □ Service creation per role
  □ Bookings by role
```

### Testing (Week 4)
```
□ Admin creates categories
□ Providers register for multiple roles
□ Verification workflow
□ Provider dashboard works
□ Service creation works per role
```

---

## PHASE 3: UNIFIED DISCOVERY

**Duration:** 2-3 weeks

### Expert Profile Pages (Week 1)
```
□ Create /experts/[expertId]/page.jsx
  □ Expert info section
  □ Services menu display
  □ Reviews section
  □ Portfolio section
  
□ Service selection modal
  □ Service details
  □ Booking form
  □ Requirements collection
  
□ Chat integration
  □ "Chat Now" button
  □ Auto-open chat after booking
```

### Service Provider Discovery (Week 2)
```
□ Category browse page
  □ /services/[category]/page.jsx
  □ Provider grid with filters
  □ Sort options
  
□ Provider profile pages
  □ /providers/[providerId]/page.jsx
  □ Multi-role indicator
  □ Services by role
  □ Reviews by service
  
□ Search functionality
  □ Unified search bar
  □ Category filtering
  □ Location filtering
  □ Availability filtering
```

### Homepage Integration (Week 3)
```
□ Dual-path entry
  □ Browse & Build vs Work with Experts
  □ Service Provider categories
  
□ Featured sections
  □ Featured experts carousel
  □ Popular categories grid
  
□ Search bar
  □ Auto-suggest
  □ Recent searches
```

---

## PHASE 4: DIY INTEGRATION

**Duration:** 1-2 weeks

### Cart Integration (Week 1)
```
□ Add "Experts" tab to trip planner
  □ Recommended experts based on destination
  □ "Add to Cart" for expert services
  
□ Expert services in cart
  □ Display expert services
  □ Calculate totals
  □ Platform fee waiver logic
  
□ Service provider services in cart
  □ Mix activities + expert + provider services
  □ Unified checkout
```

### Auto-Contract Generation (Week 1-2)
```
□ Service selection → Contract creation
  □ Extract service details
  □ Populate contract fields
  □ Generate payment URL
  
□ Payment webhook handling
  □ Update contract status
  □ Notify provider
  □ Create chat room
  
□ Testing
  □ Self-service booking flow
  □ Contract auto-generation
  □ Payment → Chat flow
```

---

## PHASE 5: SCALE & OPTIMIZATION

**Duration:** Ongoing

### Performance (Month 1)
```
□ Database optimization
  □ Query performance
  □ Index tuning
  □ Caching strategy
  
□ CDN for images
  □ Provider profile photos
  □ Service images
  □ Portfolio images
```

### Analytics (Month 2)
```
□ Provider analytics
  □ Booking trends
  □ Revenue tracking
  □ Service performance
  
□ Platform analytics
  □ Category popularity
  □ GMV by category
  □ Conversion funnels
```

### Marketing (Month 3)
```
□ Provider acquisition
  □ Targeted recruitment
  □ Referral program
  □ Onboarding optimization
  
□ Traveler acquisition
  □ SEO for service categories
  □ Content marketing
  □ Social proof
```

### Feature Enhancements (Month 4+)
```
□ Advanced features
  □ Instant booking
  □ Calendar sync
  □ Package deals
  □ Subscription services
  □ Provider teams
  □ Gift certificates
```

---

## IMPLEMENTATION CHECKLIST

### Phase 1: Expert Services ✓
- [ ] Backend service CRUD
- [ ] Service templates
- [ ] Expert dashboard services page
- [ ] Service creation wizard
- [ ] Service management UI

### Phase 2: Service Provider Categories
- [ ] Database schema
- [ ] Admin category management
- [ ] Provider registration flow
- [ ] Multi-role support
- [ ] Verification workflow

### Phase 3: Discovery
- [ ] Expert profile pages
- [ ] Service provider marketplace
- [ ] Category browsing
- [ ] Search functionality
- [ ] Homepage integration

### Phase 4: DIY Integration
- [ ] Experts tab in trip planner
- [ ] Cart integration
- [ ] Auto-contract generation
- [ ] Unified checkout

### Phase 5: Scale
- [ ] Performance optimization
- [ ] Analytics tracking
- [ ] Marketing automation
- [ ] Advanced features

---

## SUCCESS METRICS

### Launch Metrics (First 3 Months)

**Expert Services:**
- 80% of experts create at least 3 services
- 40% adoption of self-service booking
- $150 average service booking value
- 4.5+ average service rating

**Service Provider Categories:**
- 10+ active categories
- 500+ verified providers per top category
- 60% of providers offer multiple roles
- $300 average provider booking value

**Platform:**
- 30% increase in GMV
- 25% reduction in platform fee revenue (due to waivers) offset by 50% increase in total bookings
- 4.8+ overall platform rating

### 6-Month Targets

**Supply Side:**
- 5,000+ Local Experts with service menus
- 10,000+ Service Providers across all categories
- Average 4+ services per provider

**Demand Side:**
- 50% of trips include expert OR provider service
- 20% of trips include BOTH expert AND provider services
- 70% repeat booking rate for satisfied customers

**Revenue:**
- 2x GMV vs pre-launch
- $50 average platform take per booking (20% of $250 avg)
- 40% margin after payment processing & support

---

## APPENDIX: GLOSSARY

**Local Expert:** Knowledge provider who plans trips and gives advice (can be remote or local)

**Service Provider:** Service executor who delivers physical services (must be local)

**Multi-Role:** One provider offering services in multiple categories

**Service Menu:** List of pre-defined services a provider offers

**Self-Service Booking:** Traveler selects service directly without chatting first

**Chat-First Booking:** Traveler chats with provider, then provider creates custom contract

**Auto-Contract:** System automatically generates contract from service selection

**Category:** Type of service provider (Photographer, Chef, Driver, etc.)

**Verification:** Admin review and approval of provider credentials

**Platform Fee:** 20% of each booking (can be waived)

**Payout Split:** 80% to provider, 20% to Traveloure

---

## DOCUMENT CHANGE LOG

- v10.0 (2026-01-02): Master consolidation document created
- v9.0: Service Provider Roles System
- v8.0: Expert Services Menu Complete
- v7.0: Reality-Based Expert Wireframes
- v6.0: Expert Integration Dual-Path
- Earlier versions: Initial expert system exploration

---

**END OF MASTER SPECIFICATION DOCUMENT**

This document serves as the complete, production-ready specification for transforming Traveloure into a comprehensive travel services marketplace with Local Experts and Service Providers unified under one platform.
