# Marketing, Content & MISC Pages Audit Report
## Traveloure Platform — Experience Planning Rebrand Gap Analysis

**Date:** 2026-06-13  
**Scope:** 35 pages in `client/src/pages/` + 4 layout components  
**Goal:** Identify gaps between current "travel" branding and the reframed "Experience Planning" business model (weddings, birthdays, proposals, corporate events, reunions, retreats in foreign cities).

---

## Page: about.tsx
### Current State
- Core company marketing page with mission, values, team, timeline, stats, and CTA.
- Event support level: **1/5** — Mentions "travel" and "trip" dozens of times; no mention of weddings, events, corporate retreats, or celebrations.

### Issues Found
- **P0**: Title "Revolutionizing How the World Plans Travel" (line: 115) — Core brand positioning contradicts event model.
- **P0**: Mission statement: "We believe everyone deserves incredible travel experiences" (line: 184) — Entire mission is travel-only.
- **P0**: Values section: "Passion for Travel" (line: 29), "We believe travel transforms lives" (line: 30), "Our global network of local experts and travelers" (line: 36), "best of both worlds in travel planning" (line: 41), "sustainable tourism" (line: 45).
- **P0**: Stats label "Trips Planned" (line: 91) — Should be "Experiences Planned" or "Events Planned".
- **P0**: Milestones: "make travel planning effortless" (line: 77), "revolutionizing trip planning" (line: 79).
- **P0**: Team bio: "Former travel industry executive" (line: 54), "travel platforms" (line: 55), "travelers" (line: 72).
- **P0**: CTA: "Whether you're a traveler seeking adventure" (line: 363) — Excludes event planners and celebration organizers.
- **P1**: SEO keywords: `travel platform`, `AI travel` (line: 102) — No event keywords.
- **P2**: Description meta: "transform travel planning through AI and human expertise" (line: 101).

### Changes Needed
1. Change "Revolutionizing How the World Plans Travel" → "Revolutionizing How the World Plans Experiences" (line: 115)
2. Change "Passion for Travel" → "Passion for Experiences" (line: 29)
3. Change all "travel", "travelers", "trip", "traveling" terminology in mission/values to "experience", "guest", "planning", "celebration" (lines: 29-46, 77-80, 117-121, 184-187, 363-365)
4. Change "Trips Planned" stat label → "Experiences Planned" (line: 91)
5. Add event-specific milestones or values (e.g., "2025: Event Planning Launch" for weddings, proposals, corporate events)
6. Update SEO keywords to include `event planning`, `wedding planning`, `destination events`, `experience platform` (line: 102)

### Effort Estimate
- Medium (1-4hr) — Text-only changes, but extensive copy rewriting needed.

---

## Page: partner-with-us.tsx
### Current State
- Partner onboarding page with 5 partner types, testimonials, benefits, how-it-works.
- Already partially event-aware (has "Event Planner" card).
- Event support level: **3/5** — Event planner exists but hero and most copy is travel-centric.

### Issues Found
- **P0**: Hero: "Join our global network of local experts, trip planners, and service providers. Help travelers create unforgettable experiences" (line: 229-231) — "travelers" and "trip planners" exclude event clients.
- **P0**: Stats label "Trips Planned" (line: 206) — Should be "Experiences Planned".
- **P1**: Partner type ID "trip-planner" (line: 37) and title "Trip Planner" (line: 38) — Should be "Experience Planner" or "Trip & Event Planner".
- **P1**: Trip Planner description: "Design personalised itineraries and guide travellers through every step of their journey" (line: 39) — "journey" is travel-only.
- **P1**: Trip Planner CTA: "Apply as Trip Planner" (line: 52).
- **P1**: Local Expert description: "Guide travelers through your city with personalized tours" (line: 59) — "travelers" and "tours".
- **P1**: Testimonial from Marie L.: "help 20+ travelers every month" (line: 140).
- **P1**: Testimonial from Kenji T.: "creating custom itineraries" (line: 146), "Local Expert, Tokyo" (line: 148).
- **P1**: Platform Benefits: "AI-powered tools to create personalized itineraries" (line: 167), "Connect with travelers from around the world" (line: 172), "grow your travel business" (line: 380).
- **P1**: How It Works step 4: "Connect with travelers and earn on your terms" (line: 196).
- **P2**: Service Provider description: "List your hotel, restaurant, tour, or experience" (line: 99) — "tour" is travel-specific.

### Changes Needed
1. Hero copy: "travelers" → "guests and travelers" or "clients" (line: 229)
2. "Trip Planner" → "Experience Planner" (lines: 37, 38, 52, 53, 342)
3. Stats label "Trips Planned" → "Experiences Planned" (line: 206)
4. Testimonials: Update Marie L. and Kenji T. quotes to mention events/celebrations or make them generic (lines: 140-149)
5. Platform Benefits copy: "travelers" → "clients/guests", "itineraries" → "plans/itineraries" (lines: 167-172, 380)
6. How It Works step 4: "travelers" → "clients" (line: 196)

### Effort Estimate
- Medium (1-4hr)

---

## Page: terms.tsx
### Current State
- Full Terms and Conditions page with 18 sections.
- Event support level: **2/5** — Legal definitions are travel-heavy but do mention "life event planning services" in section 2.1.

### Issues Found
- **P0**: Section 2.1: "Travelers: Individuals seeking personalized travel experiences and life event planning services" (line: 49) — Good that life events are mentioned, but the party is still called "Travelers" not "Clients/Guests".
- **P0**: Section 2.2: "Directly provide travel services, accommodations, or experiences" (line: 59) — "travel services" should be "event and travel services".
- **P0**: Section 3.3: "Traveler Accounts" (line: 102) — Should be "Client Accounts" or "Guest Accounts".
- **P1**: Section 5.5: "Travel Content Creator & Influencer Terms" (line: 186) — "Travel" prefix is unnecessary.
- **P1**: Section 5.6: "Travel Expert & Local Expert Specific Terms" (line: 227) — "Travel Expert" should be "Trip/Experience Planner".
- **P1**: Section 5.6.1: "Travel Expert: Destination specialists offering itinerary planning and travel advice" (line: 231) — "travel advice" only.
- **P1**: Section 7.5: "Travelers are responsible for applicable sales tax, VAT, or tourism taxes" (line: 320) — "tourism taxes" is travel-only; event taxes exist too.
- **P1**: Section 8.1: "Cancellation by Travelers" (line: 327) — Should be "Cancellation by Clients".
- **P2**: Multiple references to "trip", "travel", "travelers" throughout that are technically accurate but brand-narrow.

### Changes Needed
1. "Travelers" → "Clients" or "Guests" throughout (lines: 49, 102, 103, 138, 190, 204, 327, 320)
2. "travel services" → "event and travel services" or "experience services" (line: 59)
3. "Travel Content Creator" → "Content Creator" (line: 186)
4. "Travel Expert" → "Trip Planner" or "Experience Planner" (lines: 227, 231)
5. "tourism taxes" → "tourism or event taxes" (line: 320)
6. "Traveler Accounts" → "Client Accounts" (line: 102)

### Effort Estimate
- Large (4-8hr) — Legal text requires careful consistency across all sections.

---

## Page: privacy.tsx
### Current State
- Full Privacy Policy with 14 sections.
- Event support level: **2/5** — Mentions "travelers" repeatedly as the primary user type.

### Issues Found
- **P0**: Introduction: "connecting travelers with authenticated Local Experts and Service Providers to facilitate personalized travel experiences and life events" (line: 31) — Good life events mention, but "travelers" is the label.
- **P0**: Section 2.1: "Complete your user profile (travel preferences, interests, accessibility needs, dietary restrictions)" (line: 50) — "travel preferences" should be "travel and event preferences".
- **P0**: Section 2.1: "Book services or experiences (trip details, dates, participant information, special requests)" (line: 53) — "trip details" should be "event/trip details".
- **P1**: Section 3.1: "Facilitate connections between Travelers, Experts, and Service Providers" (line: 117) — "Travelers" → "Clients".
- **P1**: Section 4.1: "Travelers, Experts, and Service Providers: Information necessary to facilitate bookings and services (names, contact information, trip details, special requirements)" (line: 168) — "trip details" → "event/trip details".
- **P1**: Section 4.2: "Travel inventory partners (Viator, GetYourGuide, Klook, Fever, Musement, 12Go)" (line: 184) — These are travel-only partners; should mention event vendor partners too.
- **P2**: Multiple references to "travel" as the primary activity type.

### Changes Needed
1. "travelers" → "clients" or "users" in all user-type references (lines: 31, 117, 168)
2. "travel preferences" → "travel and event preferences" (line: 50)
3. "trip details" → "event or trip details" (lines: 53, 168)
4. Add event vendor partners alongside travel inventory partners (line: 184)

### Effort Estimate
- Medium (1-4hr)

---

## Page: faq.tsx
### Current State
- FAQ page with 5 categories and 15 Q&A pairs.
- Event support level: **1/5** — 100% travel-focused. No mention of weddings, events, corporate retreats, celebrations.

### Issues Found
- **P0**: "What is Traveloure?" answer: "Traveloure is a travel planning platform that connects travelers with local experts who help create personalized itineraries and experiences." (line: 36-37) — Zero mention of events.
- **P0**: "How does Traveloure work?" answer: "You can either browse and book experiences directly, work with a local expert to create a custom itinerary, or use our Help Me Decide feature to explore pre-researched trip packages." (line: 43-44) — "trip packages" only.
- **P0**: "How do I book a trip?" (line: 53) — Question assumes travel. No "How do I plan an event?" question.
- **P0**: "Who are the local experts and trip planners?" (line: 72-73) — "trip planners", "travel plans", "travelers".
- **P0**: Booking category icon is `Plane` (line: 19) — Should be more generic (Calendar or Event).
- **P1**: All FAQ answers reference "trip", "travel", "travelers", "itinerary" exclusively.
- **P1**: No FAQ about event planning, wedding coordination, corporate event logistics, group bookings, guest invites, etc.

### Changes Needed
1. Rewrite "What is Traveloure?" to include event planning (line: 36-37)
2. Rewrite "How does Traveloure work?" to mention event planning packages (line: 43-44)
3. Add new FAQ: "How do I plan a wedding or event in another city?"
4. Add new FAQ: "Can I invite guests to collaborate on my event plan?"
5. Add new FAQ: "How do corporate event bookings work?"
6. Change Booking category icon from `Plane` to `Calendar` or `PartyPopper` (line: 19)
7. Add "Event Planning" category (lines: 24-30)

### Effort Estimate
- Medium (1-4hr) — Requires new FAQ content creation.

---

## Page: features.tsx
### Current State
- Features marketing page with 3 main features + 6 additional features + stats.
- Event support level: **1/5** — Completely travel-focused. "Perfect Trip", "AI-Powered Trip Planning", "travel planning companion".

### Issues Found
- **P0**: Hero title: "Everything You Need for the Perfect Trip" (line: 130-132) — Should be "Perfect Experience" or "Perfect Event".
- **P0**: Hero description: "unforgettable travel experiences" (line: 136), "travel planning companion" (line: 189-190).
- **P0**: Feature 1 title: "AI-Powered Trip Planning" (line: 33) — Should be "AI-Powered Experience Planning".
- **P0**: Feature 1 description: "personalized itineraries based on your preferences, travel style, and budget" (line: 35) — "travel style" is travel-only.
- **P0**: Feature 1 highlights: "Instant itinerary generation", "Smart activity suggestions", "Budget optimization", "Real-time adjustments" — All travel-framed.
- **P0**: Feature 2: "Local Expert Network" — description mentions "guidebooks" (line: 47) — travel reference.
- **P0**: Feature 3: "Seamless Booking" — mentions "activities, accommodations" (line: 59) — okay but missing "venues, catering, photographers, florists".
- **P0**: Stats label "Trips Planned" (line: 109) — Should be "Experiences Planned".
- **P1**: Additional feature "Interactive Maps" (line: 97) — Fine for travel, less relevant for event planning.
- **P2**: No mention of event-specific features: guest list management, vendor coordination, venue booking, timeline creation, RSVP tracking, budget splitting.

### Changes Needed
1. Hero title: "Perfect Trip" → "Perfect Experience" (line: 130-132)
2. "AI-Powered Trip Planning" → "AI-Powered Experience Planning" (line: 33)
3. "travel style" → "event style and preferences" (line: 35)
4. Add event-specific highlights: "Venue sourcing", "Vendor coordination", "Guest list management" (line: 37-42)
5. Feature 3 description: add "venues, catering, photography, transport" (line: 59)
6. Stats label "Trips Planned" → "Experiences Planned" (line: 109)
7. Add event-specific additional features: "Guest Coordination", "Vendor Management", "Timeline Builder" (lines: 71-101)

### Effort Estimate
- Medium (1-4hr)

---

## Page: how-it-works.tsx
### Current State
- 3-step process page + 3 planning options (AI, Hybrid, Expert).
- Already partially event-aware: step 1 mentions "romantic getaway, adventure trip, or corporate retreat" (line: 21) and planning option features mention "Wedding, Proposal, etc." (line: 25).
- Event support level: **3/5** — Good event mention in step 1, but rest is travel-heavy.

### Issues Found
- **P0**: Hero title: "How Traveloure Works" (line: 97) — Fine, but subtitle is travel-only.
- **P0**: Hero description: "Our AI-powered platform and expert network make travel planning effortless" (line: 100) — "travel planning" only.
- **P1**: Step 2 title: "Get Matched & Plan" — description: "Our AI analyzes thousands of options to create the perfect itinerary" (line: 34) — "itinerary" is travel-term; should be "plan" or "timeline".
- **P1**: Step 3 title: "Enjoy Your Experience" — description: "Travel with confidence knowing every detail is handled" (line: 47) — "Travel with confidence" is travel-only.
- **P1**: Step 3 features: "All bookings managed in one place", "24/7 support during your trip" (line: 51-52) — "during your trip" → "during your event".
- **P1**: Planning option 1: "AI-Powered Planning" description mentions "travel style" (line: 62) and "Multi-destination support" (line: 65) — both travel-only.
- **P1**: Planning option 2: "Hybrid AI + Expert" — "trip planners" (line: 69), "Insider local tips" (line: 71) — travel framing.
- **P1**: Planning option 3: "Expert-Led Planning" — "certified local expert who crafts every detail of your trip personally" (line: 76), "Dedicated trip planner" (line: 79), "Concierge-level service" — okay but "trip" is travel-only.
- **P1**: CTA: "Join thousands of travelers who have discovered the joy of effortless trip planning" (line: 219) — "travelers" and "trip planning".
- **P1**: CTA button: "Create Your First Trip" (line: 223) — Should be "Create Your First Experience".

### Changes Needed
1. Hero description: "travel planning effortless" → "experience planning effortless" (line: 100)
2. Step 2 description: "itinerary" → "experience plan" or "event timeline" (line: 34)
3. Step 3 description: "Travel with confidence" → "Celebrate with confidence" or "Enjoy with confidence" (line: 47)
4. Step 3 feature: "during your trip" → "during your event or trip" (line: 52)
5. Planning option 1: "travel style" → "event style" (line: 62)
6. Planning option 3: "trip" → "experience" (lines: 76, 79)
7. CTA: "travelers" → "guests and travelers", "trip planning" → "experience planning" (line: 219)
8. CTA button: "Create Your First Trip" → "Create Your First Experience" (line: 223)

### Effort Estimate
- Small (<1hr)

---

## Page: help.tsx
### Current State
- Help center with categories, search, contact methods, and popular FAQs.
- Event support level: **1/5** — All help categories and articles are travel-centric.

### Issues Found
- **P0**: Category "Getting Started" article: "Planning your first trip" (line: 34) — No "Planning your first event".
- **P0**: Category "Destinations" (line: 60) — Travel-only concept. Missing "Event Types" or "Occasions" category.
- **P0**: Popular FAQ: "How does the AI trip planning work?" (line: 103) — "trip planning" only.
- **P0**: Popular FAQ: "What if I have an issue during my trip?" (line: 107) — "during my trip" → "during my event".
- **P1**: All articles in "Working with Experts" category are travel-framed (lines: 50-58).
- **P2**: No help articles about: wedding planning, vendor coordination, guest invites, corporate event logistics, event timelines, venue selection.

### Changes Needed
1. Add "Event Planning" category with articles: "Planning your first wedding abroad", "How to coordinate vendors", "Guest list and invites" (lines: 28-78)
2. Change "Planning your first trip" → "Planning your first experience" (line: 34)
3. Add "Destinations & Venues" category to replace or augment "Destinations" (line: 60)
4. Add event-specific FAQs to popular FAQ list (lines: 81-114)

### Effort Estimate
- Medium (1-4hr)

---

## Page: press.tsx
### Current State
- Press page with press releases, media coverage, media kit, and contact.
- Event support level: **1/5** — All press releases and coverage headlines are travel-focused.

### Issues Found
- **P0**: Press release 1: "Traveloure Raises $15M Series A to Transform Travel Planning with AI" (line: 26) — "Travel Planning" only.
- **P0**: Press release 2: "Traveloure Surpasses 1 Million Users Milestone" — excerpt: "travelers embrace personalized, expert-guided trip planning" (line: 34) — "travelers" and "trip planning".
- **P0**: Press release 3: "Traveloure Partners with Major Airlines" — excerpt: "seamless booking experiences to travelers planning their perfect trips" (line: 40) — travel-only.
- **P0**: Coverage headlines: "Traveloure is changing how we plan trips", "The future of personalized travel planning", "AI meets local expertise in new travel platform" (lines: 72-91) — All travel-only.
- **P0**: Stats label "Trips Planned" (line: 103) — Should be "Experiences Planned".
- **P1**: No press releases about event planning expansion, wedding services, corporate retreats, or partnerships with event vendors.

### Changes Needed
1. Add press release about event planning launch: "Traveloure Expands to Experience Planning: Weddings, Corporate Events & Celebrations in 25+ Cities" (lines: 23-42)
2. Add coverage headline about event planning: "Traveloure brings AI to destination wedding planning" (lines: 71-92)
3. Change "Trips Planned" stat → "Experiences Planned" (line: 103)
4. Update press team email to mention event inquiries (line: 248)

### Effort Estimate
- Small (<1hr) — Mostly placeholder content anyway.

---

## Page: careers.tsx
### Current State
- Careers page with open positions, perks, and company values.
- Event support level: **1/5** — All job descriptions are travel-focused.

### Issues Found
- **P0**: Hero: "Join Our Mission to Transform Travel" (line: 117) — Should be "Transform Experience Planning".
- **P0**: Hero description: "Help us build the future of personalized travel experiences. Work with a passionate team making travel planning effortless and inspiring." (line: 119-121) — Travel-only.
- **P0**: Job title: "Travel Experience Designer" (line: 31) — "help travelers discover and book their perfect trips" (line: 36) — travel-only.
- **P0**: Job: "Local Expert Partnership Manager" (line: 40) — description: "Build relationships with local experts and service providers worldwide" (line: 45) — okay but no mention of event planners or wedding coordinators.
- **P0**: Job: "AI/ML Engineer" (line: 49) — description: "Develop AI-powered recommendation engines and travel planning systems" (line: 54) — "travel planning systems" only.
- **P0**: Job: "Customer Success Lead" (line: 58) — description: "Ensure travelers and experts have exceptional experiences on our platform" (line: 63) — "travelers" not "clients/guests".
- **P0**: Job: "Content Marketing Manager" (line: 67) — description: "Create compelling content that inspires travel and showcases our platform" (line: 72) — "inspires travel" only.
- **P0**: Perk: "Travel Credits" (line: 104) — description: "Annual travel credits to explore new destinations" (line: 105) — travel-only.
- **P1**: No event-specific roles: Event Planner Partnership Manager, Wedding Coordinator Specialist, Corporate Events Account Manager, Venue Sourcing Manager.
- **P2**: Open Positions description: "Join our growing team and help shape the future of travel" (line: 169) — "travel" → "experience planning".

### Changes Needed
1. Hero: "Transform Travel" → "Transform Experience Planning" (line: 117)
2. Hero description: "travel experiences" → "experiences and celebrations", "travel planning" → "experience planning" (lines: 119-121)
3. Job: "Travel Experience Designer" → "Experience Designer" (line: 31), description: "travelers" → "clients/guests", "trips" → "experiences" (line: 36)
4. Job: "AI/ML Engineer" description: "travel planning systems" → "experience planning and event coordination systems" (line: 54)
5. Job: "Customer Success Lead" description: "travelers" → "clients and guests" (line: 63)
6. Job: "Content Marketing Manager" description: "inspires travel" → "inspires event planning and travel" (line: 72)
7. Perk: "Travel Credits" → "Experience Credits" (line: 104), description: "explore new destinations" → "plan experiences anywhere in the world" (line: 105)
8. Add event-specific roles: "Event Planner Partnership Manager", "Wedding & Celebration Specialist" (lines: 19-73)

### Effort Estimate
- Medium (1-4hr)

---

## Page: blog.tsx
### Current State
- Blog page with 6 posts, categories, and newsletter CTA.
- Event support level: **1/5** — All blog posts are travel-focused. Categories include Destinations, Tips & Guides, Food & Drink, Romance, Photography, Sustainability. No "Weddings", "Corporate Events", "Celebrations" categories.

### Issues Found
- **P0**: Post 1: "10 Hidden Gems in Paris You've Never Heard Of" (line: 20) — Travel-only destination content.
- **P0**: Post 2: "The Ultimate Guide to Planning a Honeymoon in Bali" (line: 32) — Honeymoon is event-adjacent but framed as travel.
- **P0**: Post 3: "Budget Travel: How to See Europe on $50 a Day" (line: 44) — Pure travel.
- **P0**: Categories: "Destinations", "Tips & Guides", "Food & Drink", "Romance", "Photography", "Sustainability" (lines: 92-100) — No event categories.
- **P1**: Newsletter CTA: "Never Miss an Adventure" (line: 288) — "Adventure" is travel-only.
- **P1**: Newsletter description: "travel inspiration, insider tips, and exclusive deals" (line: 290) — No event content.
- **P2**: No blog posts about: destination weddings, planning a proposal in Paris, corporate retreats in Bali, birthday celebrations abroad, how to coordinate vendors remotely.

### Changes Needed
1. Add categories: "Weddings", "Corporate Events", "Birthdays & Celebrations" (lines: 92-100)
2. Add event-themed blog posts: "How to Plan a Destination Wedding in Bali", "The Complete Guide to Corporate Retreats in Lisbon", "Planning a Surprise Proposal in Paris: A Step-by-Step Guide" (lines: 17-90)
3. Newsletter CTA: "Never Miss an Adventure" → "Never Miss a Moment" or "Never Miss an Experience" (line: 288)
4. Newsletter description: "travel inspiration" → "experience inspiration, from travel to celebrations" (line: 290)

### Effort Estimate
- Medium (1-4hr) — Requires new blog content creation.

---

## Page: contact.tsx
### Current State
- Contact page with form, contact methods, offices, and quick links.
- Event support level: **4/5** — Mostly generic; SEO keywords have "travel help" but page itself is fairly neutral.

### Issues Found
- **P1**: SEO keywords: `travel help`, `travel help` (line: 137) — Should include `event planning help`, `wedding planning support`.
- **P1**: SEO description: "Get in touch with the Traveloure team. We're here to help with inquiries, support, partnerships, and feedback." (line: 136) — Generic but could mention "event planning inquiries".
- **P2**: Contact reasons: "General Inquiry", "Customer Support", "Partnership Inquiry", "Press & Media", "Feedback" (lines: 29-35) — Could add "Event Planning Inquiry".
- **P2**: Offices: New York, London, Singapore (lines: 58-73) — All listed with travel-themed street names ("Travel Lane", "Explorer St", "Journey Rd"). Fun but reinforces travel brand.

### Changes Needed
1. SEO keywords: add `event planning help`, `wedding planning support`, `corporate event inquiry` (line: 137)
2. SEO description: mention "event planning inquiries" (line: 136)
3. Add "Event Planning Inquiry" to contact reasons (lines: 29-35)

### Effort Estimate
- Small (<1hr)

---

## Page: earn.tsx
### Current State
- Ways to Earn hub with role-to-offering layout. Very well-structured and config-driven.
- Event support level: **4/5** — Already has event planner role, but hero and some copy is still travel-tinged.

### Issues Found
- **P1**: Comment at top: "earn-page role-to-offering redesign brief" (line: 3) — okay, but the page is well-designed for both.
- **P1**: The `trip_planner` role key (line: 183) and references in the URL mapping logic — `trip_planner` should be `experience_planner` or similar.
- **P2**: Hero title: "Get paid for what you already know" (line: 294) — Generic, fine.
- **P2**: The EA signup path is present (line: 340) — Good.
- **P2**: No major travel terminology issues; this page is fairly neutral and uses the config-driven offering names.

### Changes Needed
1. Rename `trip_planner` role key to `experience_planner` in the config module (referenced on line: 183, but the actual config is in `lib/earn-roles.ts` which was not audited here)
2. No significant changes needed on this page itself.

### Effort Estimate
- Small (<1hr) — Config change in `lib/earn-roles.ts`.

---

## Page: hidden-gems.tsx
### Current State
- Hidden gems discovery page with AI-powered gem scanning.
- Event support level: **2/5** — "Hidden gems" is travel-centric framing, but gems could be venues or event locations.

### Issues Found
- **P1**: Page title: "Hidden Gems" (line: 158) — Travel concept. Could be "Local Secrets & Venues".
- **P1**: Description: "AI-discovered local secrets and authentic experiences that tourists rarely find" (line: 161) — "tourists" is travel-only.
- **P1**: Category icons and labels: `local_food_secrets`, `hidden_viewpoints`, `off_tourist_path`, `seasonal_events`, `secret_beaches`, `sunset_spots`, `nature_escapes` (lines: 33-46) — Mostly travel/tourism categories. Missing: `event_venues`, `wedding_locations`, `corporate_retreat_spaces`, `photography_studios`, `catering_gems`.
- **P2**: Discover button: "Discover Gems" (line: 198) — Fine, but context is travel.

### Changes Needed
1. Description: "tourists" → "visitors" or "guests" (line: 161)
2. Add event venue categories: `event_venues`, `wedding_locations`, `corporate_spaces` (lines: 33-46)
3. Consider renaming page to "Local Secrets & Venues" (line: 158)

### Effort Estimate
- Small (<1hr)

---

## Page: explore.tsx
### Current State
- Explore page with search, featured destinations, popular packages, and CTA.
- Event support level: **1/5** — Pure travel destination and package explorer.

### Issues Found
- **P0**: Hero title: "Explore the World" (line: 93) — Pure travel positioning.
- **P0**: Hero description: "Discover amazing destinations, curated packages, and hidden gems around the globe" (line: 96) — Travel-only.
- **P0**: Featured destinations: Tokyo, Paris, Bali, New York (lines: 12-45) — All travel destinations with "trips" counts (line: 19, 27, 35, 43).
- **P0**: Popular packages: "Cherry Blossom Japan", "Romantic Paris Getaway", "Bali Wellness Retreat" (lines: 47-78) — All vacation packages with "days/nights" framing (lines: 53, 61, 69).
- **P1**: CTA: "Not sure where to go?" (line: 256) — "Let our AI help you discover the perfect destination based on your preferences, budget, and travel style." (line: 260) — "travel style" is travel-only.
- **P1**: CTA button: "Plan My Trip" (line: 264) — Should be "Plan My Experience".
- **P2**: No event types or experience categories in the search/filter.

### Changes Needed
1. Hero title: "Explore the World" → "Explore Experiences & Destinations" or "Discover Your Next Celebration" (line: 93)
2. Hero description: "amazing destinations, curated packages, and hidden gems" → add "event venues, wedding packages, and corporate retreats" (line: 96)
3. Add event packages alongside travel packages: "Destination Wedding in Bali", "Corporate Retreat in Lisbon" (lines: 47-78)
4. CTA: "travel style" → "event style" (line: 260)
5. CTA button: "Plan My Trip" → "Plan My Experience" (line: 264)

### Effort Estimate
- Medium (1-4hr)

---

## Page: travel-experts.tsx
### Current State
- Expert application page (become-expert flow) with multi-step form.
- Already supports 4 expert types: travel_expert, local_expert, event_planner, executive_assistant.
- Event support level: **3/5** — Has event planner type but form copy is still travel-heavy.

### Issues Found
- **P0**: `expertTypeTitles` mapping: `travel_expert: "Trip Planner"` (line: 173) — Should be "Experience Planner".
- **P0**: Default title fallback: `"Trip Planner"` (line: 179) — Travel-only default.
- **P0**: Specialties list: "Cultural Tours", "Adventure Travel", "Food & Wine", "Luxury Travel", "Budget Travel", "Wedding Planning", "Honeymoon Planning", "Family Vacations", "Solo Travel", "Business Travel", "Photography Tours", "Historical Tours" (lines: 113-127) — Mix of travel and event, but heavily travel. Should be reframed as "Experience Specialties" with event options more prominent.
- **P1**: Benefits: "Access to global travelers" (line: 146) — "travelers" → "clients".
- **P1**: Step 2 (non-local): "Destinations You Cover" (line: 981) — "Destinations" is travel-centric but works for events too.
- **P1**: Step 2 (non-local): "Experience Types You Can Plan" (line: 1055) — Good, but the data source `experienceTypes` may still be travel-oriented.
- **P1**: Step 3: "Services You Offer" description: "Select the services you want to offer to travelers" (line: 1112) — "travelers" → "clients/guests".
- **P1**: Step 4 (non-local): "Your Experience" bio placeholder: "Tell travelers about yourself, your passion for travel, and what makes you a great guide..." (line: 1175) — "passion for travel" and "great guide" are travel-only.
- **P1**: Step 5 (non-local): "Availability & Rates" — "Average expert rates: $50-150/hour depending on experience" (line: 1265) — Fine, but event planners often charge differently (flat fee, percentage).
- **P2**: Multiple references to "trip" in the form labels and placeholders.

### Changes Needed
1. `travel_expert` title: "Trip Planner" → "Experience Planner" (line: 173)
2. Default title: "Trip Planner" → "Experience Planner" (line: 179)
3. Specialties list: reorder to prioritize event specializations; rename "Family Vacations" → "Family Celebrations", "Solo Travel" → "Solo Experiences" (lines: 113-127)
4. Benefits: "travelers" → "clients" (line: 146)
5. Step 3 description: "travelers" → "clients and guests" (line: 1112)
6. Step 4 bio placeholder: "passion for travel" → "passion for creating unforgettable experiences" (line: 1175)
7. Consider adding event-specific fields for event planners (e.g., "Venue types you specialize in", "Vendor networks you have")

### Effort Estimate
- Medium (1-4hr)

---

## Page: visa-help.tsx
### Current State
- Visa requirements lookup + expert booking page.
- Event support level: **4/5** — Visa is inherently travel-related, but events also require visas. The page is functional and fairly neutral.

### Issues Found
- **P1**: SEO title: "Visa Help - Requirements & Expert Assistance | Traveloure" (line: 239) — Fine, but could mention "Event Travel Visa Help".
- **P1**: Booking modal fields: "Travel Start Date", "Travel End Date" (lines: 312, 322) — Could be "Event Start Date" / "Event End Date" or "Trip Start Date" / "Trip End Date".
- **P2**: How it works step 3: "Travel confidently" (line: 665) — "Travel" → "Travel and celebrate".
- **P2**: No mention of event-specific visa needs (e.g., business visas for corporate events, wedding visas for destination weddings).

### Changes Needed
1. Booking modal: "Travel Start Date" → "Trip/Event Start Date" (line: 312)
2. Booking modal: "Travel End Date" → "Trip/Event End Date" (line: 322)
3. How it works step 3: "Travel confidently" → "Travel and celebrate confidently" (line: 665)

### Effort Estimate
- Small (<1hr)

---

## Page: deals.tsx
### Current State
- Deals aggregator page with flights, hotels, experiences, car rentals.
- Event support level: **1/5** — Pure travel deal aggregator. Categories are flights, hotels, experiences, cars.

### Issues Found
- **P0**: Hero title: "Exclusive Travel Deals" (line: 329) — Should be "Exclusive Travel & Event Deals" or "Experience Deals".
- **P0**: Hero description: "Real prices from Aviasales, Hotellook, Agoda, GetYourGuide, Klook, Tiqets and DiscoverCars" (line: 332) — All travel vendors. No event vendors (venues, catering, florists, photographers, decorators).
- **P0**: Deal categories: "Flights", "Hotels", "Experiences", "Car Rentals" (lines: 23-29) — Missing: "Venues", "Catering", "Photography", "Decor", "Entertainment".
- **P1**: All destination photos and deal mappings are travel cities (lines: 64-109).
- **P2**: No event-specific deals or packages.

### Changes Needed
1. Hero title: "Exclusive Travel Deals" → "Exclusive Travel & Event Deals" (line: 329)
2. Hero description: Add event vendor names (e.g., "venue partners, catering providers, local photographers") (line: 332)
3. Add deal categories: "Venues", "Catering", "Photography & Video", "Decor & Flowers" (lines: 23-29)
4. Add event-specific deals in the grid

### Effort Estimate
- Large (4-8hr) — Requires backend deal source integration for event vendors.

---

## Page: ai-assistant.tsx
### Current State
- AI chat assistant page with conversation history and suggested prompts.
- Event support level: **2/5** — Suggested prompts are travel-only.

### Issues Found
- **P0**: Page title: "AI Travel Assistant" (line: 263) — Should be "AI Experience Assistant" or "AI Planning Assistant".
- **P0**: Subtitle: "Your personal travel planning companion" (line: 266) — "travel planning" → "experience planning".
- **P0**: Suggested prompts: "Plan a romantic getaway to Bali", "Best destinations for a winter wedding" (line: 238), "Create an itinerary for Tokyo in spring" (line: 240), "Surprise anniversary trip ideas" (line: 241) — 2/4 are event-adjacent but framed as travel. Missing: "Plan a wedding in Bali", "Organize a corporate retreat in Lisbon", "Plan a surprise birthday party in Paris".
- **P0**: Empty state description: "I can help you plan trips, find destinations, create itineraries, and more!" (line: 407) — "trips" and "itineraries" are travel-only. Should be "plan events, find venues, create timelines, and more!".
- **P1**: Placeholder: "Ask me about your travel plans..." (line: 488) — "travel plans" → "plans".
- **P2**: Footer note: "AI assistant powered by Claude. Responses are for planning purposes only." (line: 508) — Fine.

### Changes Needed
1. Title: "AI Travel Assistant" → "AI Experience Assistant" (line: 263)
2. Subtitle: "travel planning companion" → "experience planning companion" (line: 266)
3. Suggested prompts: Replace "Create an itinerary for Tokyo in spring" with "Plan a corporate retreat in Lisbon" (line: 240)
4. Suggested prompts: Replace "Plan a romantic getaway to Bali" with "Plan a destination wedding in Bali" (line: 238)
5. Empty state description: "plan trips, find destinations, create itineraries" → "plan events, find venues and destinations, create timelines and itineraries" (line: 407)
6. Placeholder: "travel plans" → "experience plans" (line: 488)

### Effort Estimate
- Small (<1hr)

---

## Page: chat.tsx
### Current State
- Expert chat page with sample experts and chat interface.
- Event support level: **2/5** — Sample experts are travel-only destinations.

### Issues Found
- **P0**: Page title: "Expert Chat" (line: 259) — Fine, but subtitle: "Connect with local experts for your trips" (line: 260) — "trips" → "experiences and events".
- **P0**: Sample experts: Yuki Tanaka (Tokyo), Marie Dubois (Paris), Made Surya (Bali) (lines: 26-60) — All travel destinations. No event planners (e.g., "Sofia Martinez — Wedding Planner, Barcelona").
- **P0**: Sample expert specialties: "Culture, Food, Nightlife", "Art, Wine, Fashion", "Nature, Wellness, Adventure" (lines: 34, 45, 56) — No event specialties like "Weddings, Venues, Catering", "Corporate Events, Team Building", "Photography, Decor, Florals".
- **P1**: Empty state: "Choose a local expert from the list to start chatting and get personalized travel advice." (line: 462) — "travel advice" → "planning advice".
- **P1**: Prefilled message: "I'm interested in X — can you share any tips or help me plan this?" (line: 123) — Fine, but context is travel.

### Changes Needed
1. Subtitle: "for your trips" → "for your experiences and events" (line: 260)
2. Add sample event experts: "Sofia Martinez — Wedding Planner, Barcelona", "James Chen — Corporate Event Planner, Singapore" (lines: 26-60)
3. Add event specialties to sample experts (lines: 34, 45, 56)
4. Empty state: "travel advice" → "planning advice" (line: 462)

### Effort Estimate
- Small (<1hr)

---

## Page: notifications.tsx
### Current State
- Notifications page with read/unread, booking actions, and workspace links.
- Event support level: **4/5** — Mostly neutral. Uses `tripId` in data mapping but UI doesn't expose it to users.

### Issues Found
- **P2**: Internal variable `tripId` (line: 112) and `workspacePath` — Fine for internal use, but the notification rendering should show "Event" or "Experience" instead of "Trip" if the notification is event-related.
- **P2**: Button label: "Open Workspace" (line: 270) — Fine.
- **P2**: No major user-facing travel terminology.

### Changes Needed
- None significant. The page is already fairly event-neutral.

### Effort Estimate
- Small (<1hr) — Only if backend notification types need event-specific labels.

---

## Page: profile.tsx
### Current State
- User profile settings with photo, personal info, and travel preferences.
- Event support level: **2/5** — "Travel Preferences" card is travel-only.

### Issues Found
- **P0**: Section title: "Travel Preferences" (line: 187) — Should be "Experience Preferences" or "Event & Travel Preferences".
- **P0**: "Travel Preferences" description: "Help us personalize your experience" (line: 191) — Fine, but the content is travel-only.
- **P0**: Preferred Travel Style: "Adventure, Relaxation, Culture, Food & Dining, Nature, Nightlife" (line: 198) — No event styles: "Romantic, Corporate, Family Celebration, Wellness Retreat, Festival, Intimate Gathering".
- **P1**: Bio placeholder: "Tell us a bit about yourself and your travel preferences..." (line: 178) — "travel preferences" → "experience preferences".
- **P2**: Budget Preference: "Budget-Friendly, Moderate, Luxury" (line: 209) — Fine, but could add event-specific budgets: "Per-Person, Group Rate, All-Inclusive".

### Changes Needed
1. "Travel Preferences" → "Experience Preferences" (line: 187)
2. Bio placeholder: "travel preferences" → "experience and event preferences" (line: 178)
3. Preferred style: Add event styles: "Romantic/Wedding", "Corporate/Team", "Family Celebration", "Wellness Retreat", "Festival/Event" (line: 198)
4. Budget Preference: Add "Per-Person (Event)", "Group Rate", "All-Inclusive Package" (line: 209)

### Effort Estimate
- Small (<1hr)

---

## Page: credits-billing.tsx
### Current State
- Credits and billing page with packages, transactions, payment methods, invoices.
- Event support level: **4/5** — Mostly neutral. One transaction description mentions "Tokyo Trip".

### Issues Found
- **P1**: Transaction history: "AI Itinerary Generation - Tokyo Trip" (line: 45) — "Tokyo Trip" is travel-only. Should use a more generic example or an event example.
- **P1**: Transaction history: "Restaurant Booking - Paris" (line: 72) — This is actually event-adjacent (dining), but framed as travel.
- **P2**: No event-specific credit packages or pricing mentioned.

### Changes Needed
1. Transaction example: "AI Itinerary Generation - Tokyo Trip" → "AI Experience Plan - Tokyo Wedding" or "AI Itinerary Generation - Barcelona Retreat" (line: 45)
2. Add an event-themed transaction example: "Wedding Venue Sourcing - Bali" (lines: 32-87)

### Effort Estimate
- Small (<1hr)

---

## Page: credits.tsx
### Current State
- Credits page with balance, packages, and transaction history.
- Event support level: **4/5** — Mostly neutral. One transaction mentions "Tokyo".

### Issues Found
- **P1**: Transaction: "AI Itinerary Generation - Tokyo" (line: 17) — Travel-only example.
- **P2**: No event-specific credit packages or messaging.

### Changes Needed
1. Transaction example: "AI Itinerary Generation - Tokyo" → "AI Experience Plan - Bali Wedding" (line: 17)

### Effort Estimate
- Small (<1hr)

---

## Page: booking-demo.tsx
### Current State
- Booking demo/test page for the planning → booking → payment flow.
- Event support level: **1/5** — Entirely travel-focused: "Trip", "AI Trip Planning", "Generate Itinerary".

### Issues Found
- **P0**: Page title: "Traveloure Booking Demo" (line: 23) — Fine.
- **P0**: Hero: "Complete Booking System" (line: 38) — Fine.
- **P0**: Feature 1: "AI Trip Planning" (line: 59) — Should be "AI Experience Planning".
- **P0**: Feature 1 description: "Enter your destination, dates, and preferences. Our AI generates a custom itinerary." (line: 61-62) — "itinerary" is travel-only.
- **P0**: CTA button: "Start Planning Your Trip" (line: 49) — "Trip" → "Experience".
- **P1**: Step 1: "Plan Your Trip" (line: 95) — "Trip" → "Experience".
- **P1**: Step 2: "Generate Itinerary" (line: 107) — "Itinerary" → "Plan" or "Timeline".
- **P1**: Step 3: "Review & Book" — Fine.
- **P2**: No event-specific demo flow (e.g., "Plan a Wedding", "Book a Corporate Retreat").

### Changes Needed
1. "AI Trip Planning" → "AI Experience Planning" (line: 59)
2. CTA button: "Start Planning Your Trip" → "Start Planning Your Experience" (line: 49)
3. Step 1: "Plan Your Trip" → "Plan Your Experience" (line: 95)
4. Step 2: "Generate Itinerary" → "Generate Your Plan" (line: 107)
5. Add an event demo option: "Plan a Wedding in Bali" alongside "Plan a Trip to Paris" (lines: 34-53)

### Effort Estimate
- Small (<1hr)

---

## Page: architecture-diagram.tsx
### Current State
- Internal architecture diagram page showing platform features and tech stack.
- Event support level: **2/5** — Heavy travel terminology, but some event awareness ("Guest & Event Coordination" section exists).

### Issues Found
- **P0**: Page title: "Traveloure Platform Architecture" (line: 434) — Fine.
- **P0**: Subtitle: "Core functionality and features of the AI-powered travel planning platform" (line: 437) — "travel planning" → "experience planning".
- **P0**: Section 1 title: "AI-Powered Trip Planning" (line: 34) — "Trip Planning" → "Experience Planning".
- **P0**: Section 1 subtitle: "Core travel planning engine" (line: 35) — "travel planning" → "experience planning".
- **P0**: Section 1 feature: "AI Itinerary Builder" description: "Autonomous trip planning using Grok AI" (line: 43) — "trip planning" → "experience planning".
- **P0**: Section 1 feature: "TravelPulse Intelligence" (line: 56) — "TravelPulse" is travel-branded. Could be "ExperiencePulse" or keep as is with note.
- **P1**: Section 2 title: "Experience Planning System" (line: 72) — Good! This section is already event-aware with "22+ template types" including "Travel, Wedding, Corporate, Honeymoon, Adventure, Wellness" (line: 106).
- **P1**: Section 2 feature: "Flights Tab", "Hotels Tab", "Activities Tab", "Transportation Tab" (lines: 79-99) — Missing: "Venues Tab", "Catering Tab", "Photography Tab", "Decor Tab".
- **P1**: Section 3 title: "Booking & Payments" — Fine.
- **P1**: Section 4 title: "Experts & Service Providers" — feature: "AI-powered matching of travelers with local travel experts" (line: 158) — "travelers" and "travel experts".
- **P1**: Section 5 title: "Guest & Event Coordination" — Good! Already event-aware.
- **P2**: Data flow labels: "searches destination", "fetch from Amadeus, Viator, Fever APIs" (lines: 422-423) — Missing event vendor APIs.
- **P2**: Tech stack AI badge: "Grok (xAI)", "Claude (Anthropic)", "TravelPulse" (line: 518) — Fine.

### Changes Needed
1. Subtitle: "travel planning platform" → "experience planning platform" (line: 437)
2. Section 1 title: "AI-Powered Trip Planning" → "AI-Powered Experience Planning" (line: 34)
3. Section 1 subtitle: "Core travel planning engine" → "Core experience planning engine" (line: 35)
4. Section 1 feature descriptions: "trip planning" → "experience planning" (lines: 43, 51, 57, 66)
5. Section 2: Add "Venues Tab", "Catering Tab", "Photography Tab" to features (lines: 79-109)
6. Section 4 feature: "travelers with local travel experts" → "clients with local experts and event planners" (line: 158)
7. Data flow: Add "Event vendor APIs" alongside Amadeus, Viator, etc. (lines: 422-423)

### Effort Estimate
- Small (<1hr) — Internal page, mostly for dev reference.

---

## Page: landing-mockups.tsx
### Current State
- Three landing page hero mockup options (A, B, C) with experience category grid.
- Event support level: **4/5** — Already very event-aware! Includes Wedding, Proposal, Date Night, Birthday, Bachelor/Bachelorette, Anniversary, Corporate, Reunions, Retreats, Baby Shower, Graduation.

### Issues Found
- **P1**: Option A hero: "Plan Your Perfect Life Experiences" (line: 90) — Good! But still has "From dream vacations to unforgettable celebrations" (line: 95) — "vacations" is travel-only.
- **P1**: Option B hero: "What's Your Next Adventure?" (line: 173) — "Adventure" is travel-centric. Could be "What's Your Next Celebration?" or "What's Your Next Experience?".
- **P1**: Option B description: "Choose your experience and let AI or local experts help you plan" (line: 177) — Good, but missing event-specific context.
- **P2**: Option C hero: "Plan Unforgettable Experiences" (line: 249) — Good.
- **P2**: No major issues; this page is already well-aligned with the event model.

### Changes Needed
1. Option A: "dream vacations" → "dream trips and celebrations" (line: 95)
2. Option B: "What's Your Next Adventure?" → "What's Your Next Experience?" (line: 173)

### Effort Estimate
- Small (<1hr)

---

## Page: layout-mock.tsx
### Current State
- Layout mock page with 60/40 split, trip details form, tabs, and map.
- Event support level: **1/5** — Pure travel planning UI mock.

### Issues Found
- **P0**: Header: "TRAVELOURE BETA" (line: 22) — Fine.
- **P0**: Button: "Generate Itinerary" (line: 46) — "Itinerary" → "Plan" or "Timeline".
- **P0**: Card title: "Trip Details" (line: 54) — "Trip" → "Event" or "Experience".
- **P0**: Label: "Trip to:" (line: 63) — "Trip" → "Event" or "Destination".
- **P0**: Label: "Travel Dates:" (line: 71) — "Travel Dates" → "Event Dates" or "Dates".
- **P1**: Tab: "Activities" (line: 128) — Fine, but missing "Venues", "Vendors", "Guest List" tabs.
- **P1**: Tab: "AI Optimization" (line: 144) — Fine.
- **P2**: All labels and placeholders are trip/travel focused.

### Changes Needed
1. "Generate Itinerary" → "Generate Plan" (line: 46)
2. "Trip Details" → "Experience Details" (line: 54)
3. "Trip to:" → "Destination:" or "Event in:" (line: 63)
4. "Travel Dates" → "Dates" or "Event Dates" (line: 71)
5. Add tabs: "Venues", "Vendors", "Guest List" (lines: 122-148)

### Effort Estimate
- Small (<1hr)

---

## Page: spontaneous.tsx
### Current State
- Spontaneous discovery page with live intel engine.
- Event support level: **3/5** — "spontaneous activities, trending experiences, and last-minute deals" is fairly neutral.

### Issues Found
- **P1**: Description: "Enter a city to find opportunities happening tonight, tomorrow, or this weekend" (line: 11-12) — Fine, but "opportunities" is vague. Could mention "events, activities, and last-minute venues".
- **P2**: No major travel terminology.

### Changes Needed
- Minimal. The page is already fairly event-neutral.

### Effort Estimate
- Small (<1hr)

---

## Page: not-found.tsx
### Current State
- 404 page with "Lost at Sea?" message and map icon.
- Event support level: **3/5** — "Lost at Sea" is travel metaphor. Fine for a 404.

### Issues Found
- **P2**: Title: "404 - Lost at Sea?" (line: 11) — Travel metaphor. Could be "404 - Lost?" or "404 - Page Not Found".
- **P2**: Icon: `Map` (line: 9) — Fine, neutral enough.

### Changes Needed
- Optional: "Lost at Sea?" → "Lost?" (line: 11)

### Effort Estimate
- Small (<1hr)

---

## Page: reset-password.tsx
### Current State
- Password reset page. Fully event-neutral.
- Event support level: **5/5** — No travel terminology.

### Issues Found
- None.

### Changes Needed
- None.

### Effort Estimate
- Already aligned.

---

## Page: verify-email.tsx
### Current State
- Email verification page. Fully event-neutral.
- Event support level: **5/5** — No travel terminology.

### Issues Found
- None.

### Changes Needed
- None.

### Effort Estimate
- Already aligned.

---

## Page: accept-terms.tsx
### Current State
- Terms acceptance page with checkboxes for ToS and Privacy.
- Event support level: **5/5** — Generic, no travel terminology.

### Issues Found
- None.

### Changes Needed
- None.

### Effort Estimate
- Already aligned.

---

## Page: contract-view.tsx
### Current State
- Contract detail view with status, signatures, terms, and booking links.
- Event support level: **4/5** — Mostly neutral. Uses "Service Contract" which is generic enough.

### Issues Found
- **P2**: Back link: "Back to Bookings" (lines: 83, 266) — Fine, but could be "Back to Bookings & Events".
- **P2**: Contract type display: `contract.contractType.replace(/_/g, ' ')` (line: 123) — Fine, relies on backend data.

### Changes Needed
- Minimal. Page is already fairly event-neutral.

### Effort Estimate
- Already aligned.

---

## Page: concierge/index.tsx
### Current State
- Concierge entry page with intent form and delivery options (AI, Expert, Full Service).
- Event support level: **5/5** — Already fully event-aware! Mentions `eventType` in the form, routes to AI/expert/full tiers, and handles event planning natively.

### Issues Found
- None.

### Changes Needed
- None.

### Effort Estimate
- Already aligned.

---

## Component: layout.tsx (client/src/components/layout.tsx)
### Current State
- Main layout with navigation, footer, mobile menu, and auth elements.
- Event support level: **3/5** — Nav has good event coverage (Wedding, Proposal, Birthday, Corporate, etc.) but some items are travel-only.

### Issues Found
- **P0**: Auth nav item: "My Trips" (line: 156) — Should be "My Experiences" or "My Plans".
- **P0**: Nav dropdown: "AI Trip Planner" (line: 138) — "Trip Planner" → "Experience Planner".
- **P0**: Nav dropdown: "Travel Advisors" (line: 84) — "Travel Advisors" → "Trip Planners" or "Experience Planners".
- **P0**: Nav dropdown: "Travel Planning" under Experiences (line: 97) — Could be "Trip Planning" or "Travel & Getaways".
- **P1**: Footer description: "Experience personalized travel planning with insider knowledge from local experts and trip planners, powered by advanced AI technology." (line: 525) — "travel planning" and "trip planners".
- **P1**: Footer link: "Plan an Experience" (line: 563) — Good.
- **P1**: Footer link: "Talk to Experts" (line: 565) — Good.
- **P1**: Partner dropdown: "Trip Planner" (line: 342) — Should be "Experience Planner".
- **P1**: Mobile menu: "Trip Planner" (line: 477) — Should be "Experience Planner".

### Changes Needed
1. "My Trips" → "My Experiences" (line: 156)
2. "AI Trip Planner" → "AI Experience Planner" (line: 138)
3. "Travel Advisors" → "Experience Planners" (line: 84)
4. Footer description: "travel planning" → "experience planning", "trip planners" → "experience planners" (line: 525)
5. Partner dropdown: "Trip Planner" → "Experience Planner" (lines: 342, 477)

### Effort Estimate
- Small (<1hr)

---

## Component: user-menu.tsx (client/src/components/user-menu.tsx)
### Current State
- User dropdown menu with console links, role labels, and auth actions.
- Event support level: **4/5** — Already event-aware with role labels.

### Issues Found
- **P1**: Role label: `travel_expert: "Trip Planner"` (line: 31) — Should be "Experience Planner".
- **P2**: No major issues; the rest is generic and functional.

### Changes Needed
1. `travel_expert` label: "Trip Planner" → "Experience Planner" (line: 31)

### Effort Estimate
- Small (<1hr)

---

## Component: expert-card.tsx (client/src/components/expert-card.tsx)
### Current State
- Expert card component with avatar, badges, metrics, and action buttons.
- Event support level: **3/5** — Has role badges for event_planner but still travel-heavy.

### Issues Found
- **P0**: Role badge: `travel_expert: { label: "Travel Advisor" }` (line: 12) — Should be "Experience Planner" or "Trip Planner".
- **P1**: Metric: `tripsCount` (line: 26) and display: `{tripsCount} trips` (line: 179) — "trips" should be "experiences" or "events" for event planners.
- **P2**: `expertForm.destinations` (line: 49) — Fine for travel, but event planners might have "Regions Served" or "Cities Covered".

### Changes Needed
1. `travel_expert` badge label: "Travel Advisor" → "Experience Planner" (line: 12)
2. `tripsCount` display: "trips" → "experiences" (line: 179)
3. Consider adding an `eventsCount` metric for event planners.

### Effort Estimate
- Small (<1hr)

---

## Component: expert-sidebar.tsx (client/src/components/expert/expert-sidebar.tsx)
### Current State
- Expert sidebar with menu groups, role labels, and logout.
- Event support level: **4/5** — Already event-aware with conditional menus for event planners.

### Issues Found
- **P1**: Role label: `travel_expert: "Trip Planner"` (line: 73) — Should be "Experience Planner".
- **P1**: Menu item: "Assigned Trips" (line: 46) — Should be "Assigned Experiences" or "Assigned Events".
- **P2**: No major issues otherwise; the conditional logic for event planners is good.

### Changes Needed
1. `travel_expert` role label: "Trip Planner" → "Experience Planner" (line: 73)
2. "Assigned Trips" → "Assigned Experiences" (line: 46)

### Effort Estimate
- Small (<1hr)

---

## Summary Priority Table

| Page / Component | Priority | Event Support | Effort | Key Issues |
|---|---|---|---|---|
| about.tsx | **P0** | 1/5 | Medium | Entire page is travel-only; mission, values, stats, team bios all travel |
| faq.tsx | **P0** | 1/5 | Medium | 100% travel Q&A; no event FAQs at all |
| features.tsx | **P0** | 1/5 | Medium | "Perfect Trip", "Trip Planning", travel-only features |
| explore.tsx | **P0** | 1/5 | Medium | "Explore the World", travel packages, no event packages |
| careers.tsx | **P0** | 1/5 | Medium | "Transform Travel", all jobs travel-only, no event roles |
| press.tsx | **P1** | 1/5 | Small | All press releases travel-only; stats say "Trips" |
| blog.tsx | **P1** | 1/5 | Medium | All posts travel-only; no event categories |
| deals.tsx | **P1** | 1/5 | Large | Travel deals only; no event vendor categories |
| ai-assistant.tsx | **P1** | 2/5 | Small | "AI Travel Assistant", travel-only prompts |
| chat.tsx | **P1** | 2/5 | Small | Sample experts are travel-only; no event planners |
| help.tsx | **P1** | 1/5 | Medium | All help categories travel-only; no event help |
| travel-experts.tsx | **P1** | 3/5 | Medium | "Trip Planner" default, travel-heavy form copy |
| partner-with-us.tsx | **P1** | 3/5 | Medium | Hero is travel-only; "Trip Planner" partner type |
| terms.tsx | **P1** | 2/5 | Large | "Travelers" as legal term; "travel services" in ToS |
| privacy.tsx | **P1** | 2/5 | Medium | "travelers" in privacy language; travel inventory partners |
| how-it-works.tsx | **P2** | 3/5 | Small | Mostly aligned; some "trip" and "traveler" remnants |
| booking-demo.tsx | **P2** | 1/5 | Small | "Trip" and "Itinerary" throughout; internal dev page |
| architecture-diagram.tsx | **P2** | 2/5 | Small | Internal page; "travel planning" used heavily |
| hidden-gems.tsx | **P2** | 2/5 | Small | "tourists", travel-only gem categories |
| layout-mock.tsx | **P2** | 1/5 | Small | Internal mock; "Trip" everywhere |
| credits-billing.tsx | **P2** | 4/5 | Small | One travel-only transaction example |
| credits.tsx | **P2** | 4/5 | Small | One travel-only transaction example |
| landing-mockups.tsx | **P2** | 4/5 | Small | Minor: "vacations" and "Adventure" in hero copy |
| profile.tsx | **P2** | 2/5 | Small | "Travel Preferences" card is travel-only |
| layout.tsx | **P2** | 3/5 | Small | "My Trips", "AI Trip Planner", "Travel Advisors" in nav |
| expert-card.tsx | **P2** | 3/5 | Small | "Travel Advisor" badge, "trips" metric |
| expert-sidebar.tsx | **P2** | 4/5 | Small | "Trip Planner" label, "Assigned Trips" menu item |
| user-menu.tsx | **P2** | 4/5 | Small | "Trip Planner" role label |
| notifications.tsx | **P3** | 4/5 | Small | Internal `tripId` variable; user-facing is neutral |
| contract-view.tsx | **P3** | 4/5 | Small | Already neutral |
| visa-help.tsx | **P3** | 4/5 | Small | "Travel" dates in modal; minor |
| spontaneous.tsx | **P3** | 3/5 | Small | Already fairly neutral |
| not-found.tsx | **P3** | 3/5 | Small | "Lost at Sea" travel metaphor |
| earn.tsx | **P3** | 4/5 | Small | `trip_planner` role key in config (not this page) |
| concierge/index.tsx | **—** | 5/5 | Already aligned | Fully event-aware |
| reset-password.tsx | **—** | 5/5 | Already aligned | Fully neutral |
| verify-email.tsx | **—** | 5/5 | Already aligned | Fully neutral |
| accept-terms.tsx | **—** | 5/5 | Already aligned | Fully neutral |
| contact.tsx | **—** | 4/5 | Small | Minor SEO keywords only |

---

## Top 10 Actions by Impact

1. **Rewrite `about.tsx` copy** — Mission, values, hero, and stats must reflect "Experience Planning" not "Travel Planning".
2. **Rewrite `faq.tsx` Q&A** — Add event planning FAQs and reframe existing answers.
3. **Rewrite `features.tsx` marketing** — Reframe all features as experience/event features, not travel features.
4. **Rewrite `explore.tsx` packages** — Add event packages and destinations, not just travel.
5. **Rewrite `careers.tsx` roles** — Add event-specific job postings and reframe all copy.
6. **Rewrite `terms.tsx` legal language** — Change "Travelers" to "Clients/Guests" throughout.
7. **Rewrite `press.tsx` press releases** — Add event-themed press releases and coverage.
8. **Rewrite `blog.tsx` categories & posts** — Add event categories and sample posts.
9. **Rename "Trip Planner" → "Experience Planner" everywhere** — `layout.tsx`, `user-menu.tsx`, `expert-card.tsx`, `expert-sidebar.tsx`, `travel-experts.tsx`, `partner-with-us.tsx`, `how-it-works.tsx`, `ai-assistant.tsx`, `earn.tsx` config.
10. **Add event vendor categories to `deals.tsx`** — Venues, Catering, Photography, etc.

## Total Effort Estimate
- **P0 pages (5 pages):** ~15-20 hours
- **P1 pages (12 pages):** ~20-30 hours
- **P2 pages (15 pages/components):** ~10-15 hours
- **P3 pages (5 pages):** ~2-3 hours
- **Grand Total:** ~47-68 hours

## Recommended Sequence
1. **Phase 1 (Week 1):** P0 pages — `about.tsx`, `faq.tsx`, `features.tsx`, `explore.tsx`, `careers.tsx`
2. **Phase 2 (Week 2):** P1 pages — `terms.tsx`, `privacy.tsx`, `press.tsx`, `blog.tsx`, `help.tsx`, `ai-assistant.tsx`, `chat.tsx`, `deals.tsx`
3. **Phase 3 (Week 3):** Rename "Trip Planner" → "Experience Planner" across all components and pages; `travel-experts.tsx` form copy; `partner-with-us.tsx` hero
4. **Phase 4 (Week 4):** P2/P3 cleanup — `profile.tsx`, `notifications.tsx`, `how-it-works.tsx`, `booking-demo.tsx`, `layout.tsx`, `expert-card.tsx`, `expert-sidebar.tsx`, `user-menu.tsx`
5. **Phase 5 (Ongoing):** Add real event-specific content (blog posts, FAQs, press releases, job listings, deals)

---
*Report generated by: Marketing & Content Audit Bot*  
*Files audited: 39*  
*Total lines reviewed: ~14,000+*
