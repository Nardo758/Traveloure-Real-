# Homepage DOM Inventory (dev, 2026-07-29)

Homepage DOM inventory for `/` on the dev app.

Top-level sections / landmarks (top to bottom):
1. Header / main navigation
2. Main content wrapper
3. Hero / intro band
4. Trending Cities
5. Popular Experiences
6. How It Works
7. Platform Intelligence
8. Success Stories
9. Earn CTA
10. Ready To Plan Your Experience?
11. Footer

1) Header / main navigation
Interactive elements:
- Skip to main content — link, data-testid=MISSING
- Traveloure home — link, data-testid=link-logo
- Discover — button, data-testid=button-nav-dropdown-discover
- Experts & Services — button, data-testid=button-nav-dropdown-experts-&-services
- Experiences — button, data-testid=button-nav-dropdown-experiences
- Planning Tools — button, data-testid=button-nav-dropdown-planning-tools
- Ways to earn — link, data-testid=link-nav-ways-to-earn
- Join as Partner — button, data-testid=button-become-expert-nav
- Sign In — button, data-testid=button-sign-in

Links:
- Internal: Traveloure home, Ways to earn
- No external links in the header

Images / backgrounds:
- Logo mark icon — img, src not exposed in accessible snapshot, alt empty
- Dropdown chevron icons — img/SVG icons, src not exposed, alt empty
- Partner button icon — img/icon, src not exposed, alt empty

2) Main content wrapper
Interactive elements:
- None directly; this is the shell containing the landing sections below

Images / backgrounds:
- Hero background image detected via CSS background-image; src not exposed in DOM snapshot

3) Hero / intro band
Visible content: “Join Our Beta in 8 Cities World Wide”, “Limited Expert Spots Available”, hero headline “Plan Your Perfect Life Experiences”, supporting copy, and the CTA cluster below.
Interactive elements:
- Apply Now — link, data-testid=link-apply-now
- Plan a Trip with AI — button, data-testid=button-plan-trip
- Travel — link/button composite, data-testid=button-category-travel
- Wedding — link/button composite, data-testid=button-category-wedding
- Proposal — link/button composite, data-testid=button-category-proposal
- Date Night — link/button composite, data-testid=button-category-date-night
- Birthday — link/button composite, data-testid=button-category-birthday
- Bachelor/Bachelorette — link/button composite, data-testid=button-category-bachelor-bachelorette
- Anniversary Trip — link/button composite, data-testid=button-category-anniversary-trip
- Corporate Events — link/button composite, data-testid=button-category-corporate-events
- Reunions — link/button composite, data-testid=button-category-reunions
- Wedding Anniversaries — link/button composite, data-testid=button-category-wedding-anniversaries
- Retreats — link/button composite, data-testid=button-category-retreats
- Baby Shower — link/button composite, data-testid=button-category-baby-shower
- Graduation Party — link/button composite, data-testid=button-category-graduation-party
- Engagement Party — link/button composite, data-testid=button-category-engagement-party
- Housewarming Party — link/button composite, data-testid=button-category-housewarming-party
- Retirement Party — link/button composite, data-testid=button-category-retirement-party
- Career Achievement Party — link/button composite, data-testid=button-category-career-achievement-party
- Farewell Party — link/button composite, data-testid=button-category-farewell-party
- Holiday Party — link/button composite, data-testid=button-category-holiday-party
- Find an Expert — link/button composite, data-testid=button-find-expert
- Plan your event — link/button composite, data-testid=button-plan-event
- AI Trip Planner — link card, data-testid=link-feature-ai-trip-planner
- Expert Matching — link card, data-testid=link-feature-expert-matching

Links:
- Internal: Apply Now (/experiences/travel), all category cards (/experiences/*), Find an Expert (/experts?role=local_expert), Plan your event (/experts?role=event_planner), AI Trip Planner (/ai-assistant), Expert Matching (/experts)

Images / backgrounds:
- BETA VERSION badge icon — src not exposed, alt empty
- Hero decorative icons inside CTA/cards — src not exposed, alt empty
- Category card icons — src not exposed, alt empty

4) Trending Cities
Visible content: marquee/ticker of city chips (Kyoto, Edinburgh, Goa, Mumbai, Bogotá, Porto, Jaipur, Cartagena, repeated sequence)
Interactive elements:
- No clickable controls captured; the ticker items are visible content cards, data-testid=ticker-city-*

Images:
- City ticker icons on the cards — src not exposed, alt empty

5) Popular Experiences
Interactive elements:
- No clickable controls captured in the visible DOM inventory

6) How It Works
Interactive elements:
- No clickable controls captured in the visible DOM inventory

7) Platform Intelligence
Visible content: platform stats bar (Average Rating, Reviews, Would Recommend, Happy Travelers)
Interactive elements:
- None captured; the section is informational/statistical only

8) Success Stories
Visible content: testimonial cards for Porto, Kyoto, and Mumbai.
Interactive elements:
- None captured; testimonial cards are content-only in the inventory

Images:
- Testimonial hero/location images — alt text present: “Porto, Portugal”, “Kyoto, Japan”, “Mumbai, India”
- Expert/avatar images within testimonials and star-rating icons — decorative or avatar images; src not exposed, alt mostly empty or icon-only

9) Earn CTA
Interactive elements:
- Earn as a local — link card, data-testid=card-earn-local, href=/earn?track=provider
- Share your expertise — link card, data-testid=card-earn-expert, href=/earn?track=expert
- View all earning options — internal link, data-testid=MISSING, href=/earn

Links:
- Internal: both earn cards and the “View all earning options” link

Images / backgrounds:
- Card icons — src not exposed, alt empty

10) Ready To Plan Your Experience?
Interactive elements:
- Get Started - Free — button, data-testid=button-cta-get-started
- Browse Experts — button, data-testid=button-cta-browse
- See Pricing — button, data-testid=button-cta-pricing

Links:
- Internal: Browse Experts (/experts), See Pricing (/pricing)

11) Footer
Visible headings/columns: Product, Company, Support
Interactive elements:
- Facebook — external link, data-testid=link-social-facebook
- X / Twitter — external link, data-testid=link-social-twitter
- Instagram — external link, data-testid=link-social-instagram
- Plan an Experience — link, data-testid=link-footer-experiences
- Discover Services — link, data-testid=link-footer-discover
- Talk to Experts — link, data-testid=link-footer-chat
- How It Works — link, data-testid=link-footer-how-it-works
- Pricing — link, data-testid=link-footer-pricing
- Features — link, data-testid=link-footer-features
- Global Calendar — link, data-testid=link-footer-global-calendar
- Executive Assistant — link, data-testid=link-footer-executive-assistant
- About Us — link, data-testid=link-footer-about
- Ways to earn — link, data-testid=link-footer-earn
- Careers — link, data-testid=link-footer-careers
- Blog — link, data-testid=link-footer-blog
- Press — link, data-testid=link-footer-press
- Help Center — link, data-testid=link-footer-help
- Contact Us — link, data-testid=link-footer-contact
- Visa Help — link, data-testid=link-footer-visa-help
- Privacy Policy — link, data-testid=link-footer-privacy
- Terms of Service — link, data-testid=link-footer-terms
- FAQ — link, data-testid=link-footer-faq

Links:
- External: Facebook, X / Twitter, Instagram — external; the visible labels indicate they open in a new tab, and the DOM attributes include rel=noopener
- Internal: all footer product/company/support links listed above

Images / backgrounds:
- Footer logo mark — src not exposed, alt empty
- Locale / language icon — src not exposed, alt empty
- Footer social icons — src not exposed, alt empty

Heading hierarchy (captured outline)
- h1: Plan Your Perfect Life Experiences
- h3: Choose Your Experience
- h3: Local Experts
- h3: Plan Your Event
- h2: Know a city well? Get paid for it.
- h3: Earn as a local
- h3: Share your expertise
- h2: Ready To Plan Your Experience?
- h4: Product
- h4: Company
- h4: Support

Notes on heading audit:
- Exactly one h1 was present.
- No skipped heading levels were observed in the captured outline.
- The page also contains additional section labels in the DOM for Trending Cities, Popular Experiences, How It Works, Platform Intelligence, and Success Stories.

Images / background summary:
- 17 visible images were detected overall.
- Most were decorative icons with empty alt text; the only meaningful alt-bearing content images observed in the snapshot were the testimonial/location images (“Porto, Portugal”, “Kyoto, Japan”, “Mumbai, India”).
- Hero background image is present as a CSS background-image and its src was not exposed in the DOM snapshot.

Inventory complete: 11 sections, 114 interactive elements, 17 images