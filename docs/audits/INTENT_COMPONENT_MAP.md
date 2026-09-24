# Intent → component map

Generated with the matrix (base `858d28f`). One section per normalised `intent`; every component rendering it, the labels it uses and the routes it appears on. **More than one component per intent = consolidation candidate**; differing labels for one intent = INCONSISTENT_AFFORDANCE. `navigate` is omitted.

| Intent | Components | Distinct labels | Consolidation candidate? |
|---|---|---|---|
| `open_planner` | 26 | 28 | **yes** |
| `filter` | 15 | 31 | **yes** |
| `ui_local` | 15 | 26 | **yes** |
| `dismiss` | 14 | 13 | **yes** |
| `sign_in` | 13 | 18 | **yes** |
| `add_to_plan` | 13 | 15 | **yes** |
| `message_expert` | 11 | 10 | **yes** |
| `record_analytics` | 10 | 13 | **yes** |
| `book_via_agent` | 9 | 9 | **yes** |
| `open_in_maps` | 8 | 6 | **yes** |
| `share_plan` | 7 | 6 | **yes** |
| `capture_url_intent` | 7 | 7 | **yes** |
| `claim_guest_state` | 6 | 9 | **yes** |
| `checkout` | 5 | 6 | **yes** |
| `create_plan` | 4 | 15 | **yes** |
| `open_ai_planner` | 4 | 3 | **yes** |
| `request_expert` | 4 | 4 | **yes** |
| `add_to_cart` | 4 | 4 | **yes** |
| `view_map` | 4 | 13 | **yes** |
| `add_to_calendar` | 4 | 3 | **yes** |
| `view_day` | 4 | 6 | **yes** |
| `dismiss_planner` | 3 | 3 | **yes** |
| `bind_planning_pen` | 3 | 3 | **yes** |
| `book_via_partner` | 3 | 3 | **yes** |
| `open_details` | 3 | 3 | **yes** |
| `report` | 3 | 4 | **yes** |
| `restore_draft` | 3 | 4 | **yes** |
| `update_cart` | 3 | 4 | **yes** |
| `buy_trip_pass` | 3 | 4 | **yes** |
| `copy_link` | 3 | 3 | **yes** |
| `route_to_checkout` | 3 | 3 | **yes** |
| `optimize_plan` | 3 | 10 | **yes** |
| `hire_expert` | 3 | 5 | **yes** |
| `view_logistics` | 3 | 4 | **yes** |
| `invite_guests` | 3 | 12 | **yes** |
| `resume_after_auth` | 2 | 3 | **yes** |
| `finish_plan` | 2 | 2 | **yes** |
| `open_menu` | 2 | 5 | **yes** |
| `set_locale` | 2 | 2 | **yes** |
| `sign_out` | 2 | 2 | **yes** |
| `add_stop` | 2 | 2 | **yes** |
| `edit_queue` | 2 | 2 | **yes** |
| `save_item` | 2 | 2 | **yes** |
| `request_service` | 2 | 3 | **yes** |
| `persist_draft` | 2 | 3 | **yes** |
| `remove_from_cart` | 2 | 2 | **yes** |
| `compare_plans` | 2 | 2 | **yes** |
| `request_concierge` | 2 | 2 | **yes** |
| `checkout_pay` | 2 | 5 | **yes** |
| `view_booking_status` | 2 | 3 | **yes** |
| `pay_coordination_fee` | 2 | 3 | **yes** |
| `block_user` | 2 | 2 | **yes** |
| `mark_read` | 2 | 3 | **yes** |
| `accept_terms` | 2 | 2 | **yes** |
| `review_suggestion` | 2 | 7 | **yes** |
| `view_log` | 2 | 2 | **yes** |
| `create_event` | 2 | 6 | **yes** |
| `apply_ai_proposal` | 2 | 3 | **yes** |
| `download_pdf` | 2 | 2 | **yes** |
| `reopen_plan` | 2 | 1 | **yes** |
| `set_transport_mode` | 2 | 3 | **yes** |
| `contact_vendor` | 2 | 2 | **yes** |
| `adopt_proposal` | 2 | 8 | **yes** |
| `view_plan` | 2 | 5 | **yes** |
| `request_expert_booking` | 2 | 5 | **yes** |
| `show_maintenance` | 1 | 1 | no |
| `reload_page` | 1 | 1 | no |
| `persist_guest_state` | 1 | 1 | no |
| `add_guest_trip` | 1 | 1 | no |
| `remove_guest_trip` | 1 | 1 | no |
| `add_city` | 1 | 1 | no |
| `remove_city` | 1 | 1 | no |
| `clear_queue` | 1 | 1 | no |
| `sync_console_role` | 1 | 1 | no |
| `checkout_membership` | 1 | 1 | no |
| `dismiss_ai_planner` | 1 | 1 | no |
| `seed_form` | 1 | 4 | no |
| `navigate_step` | 1 | 5 | no |
| `select_occasion` | 1 | 1 | no |
| `edit_plan_field` | 1 | 27 | no |
| `clear_plan` | 1 | 1 | no |
| `save_plan_draft` | 1 | 1 | no |
| `open_notifications` | 1 | 1 | no |
| `match_experts` | 1 | 2 | no |
| `refetch` | 1 | 1 | no |
| `pick_trip` | 1 | 1 | no |
| `record_recently_viewed` | 1 | 1 | no |
| `request_quote` | 1 | 1 | no |
| `discover_gems` | 1 | 1 | no |
| `set_trip_basics` | 1 | 3 | no |
| `geocode` | 1 | 1 | no |
| `choose_concierge_tier` | 1 | 1 | no |
| `request_coordination` | 1 | 1 | no |
| `buy_membership` | 1 | 1 | no |
| `prepare_optimization` | 1 | 2 | no |
| `set_currency` | 1 | 1 | no |
| `convert_cart_to_plan` | 1 | 2 | no |
| `pay_optimization` | 1 | 3 | no |
| `update_checklist` | 1 | 1 | no |
| `raise_concern` | 1 | 1 | no |
| `download_deliverable` | 1 | 1 | no |
| `cancel_booking` | 1 | 1 | no |
| `confirm_completion` | 1 | 1 | no |
| `dispute_booking` | 1 | 1 | no |
| `review_service` | 1 | 1 | no |
| `delete_notification` | 1 | 1 | no |
| `save_profile` | 1 | 2 | no |
| `set_home_city` | 1 | 1 | no |
| `add_occasion` | 1 | 1 | no |
| `delete_occasion` | 1 | 1 | no |
| `rsvp_invite` | 1 | 2 | no |
| `save_invite_origin` | 1 | 1 | no |
| `suggest_itinerary_edits` | 1 | 1 | no |
| `acknowledge_itinerary_edits` | 1 | 1 | no |
| `reset_password` | 1 | 1 | no |
| `sign_up` | 1 | 1 | no |
| `toggle_sidebar` | 1 | 1 | no |
| `record_visit_marker` | 1 | 1 | no |
| `edit_plan_dates` | 1 | 5 | no |
| `edit_event_time` | 1 | 1 | no |
| `edit_event_budget` | 1 | 1 | no |
| `reorder_item` | 1 | 2 | no |
| `edit_item` | 1 | 3 | no |
| `remove_item` | 1 | 3 | no |
| `comment_on_item` | 1 | 3 | no |
| `route_to_expert` | 1 | 1 | no |
| `recall_from_expert` | 1 | 1 | no |
| `remove_from_checkout` | 1 | 1 | no |
| `return_to_planning` | 1 | 1 | no |
| `approve_plan` | 1 | 2 | no |
| `request_changes` | 1 | 4 | no |
| `request_revision` | 1 | 1 | no |
| `draft_with_ai` | 1 | 1 | no |
| `manage_party` | 1 | 4 | no |
| `add_party_member` | 1 | 1 | no |
| `edit_party_member` | 1 | 1 | no |
| `remove_party_member` | 1 | 1 | no |
| `ask_ai` | 1 | 4 | no |
| `discard_ai_proposal` | 1 | 1 | no |
| `finalize_plan` | 1 | 1 | no |
| `choose_booking_lane` | 1 | 5 | no |
| `share_invite` | 1 | 1 | no |
| `send_invites` | 1 | 2 | no |
| `delete_invite` | 1 | 1 | no |
| `retry_load` | 1 | 1 | no |
| `delete_plan` | 1 | 1 | no |
| `mark_visited` | 1 | 1 | no |
| `book_transport` | 1 | 2 | no |
| `accept_transport_leg` | 1 | 1 | no |
| `decline_transport_leg` | 1 | 1 | no |
| `record_impression` | 1 | 1 | no |
| `regenerate_proposals` | 1 | 3 | no |
| `save_variant` | 1 | 1 | no |
| `apply_to_cart` | 1 | 1 | no |
| `escalate_to_team` | 1 | 1 | no |
| `send_ai_message` | 1 | 5 | no |
| `rename_conversation` | 1 | 2 | no |
| `delete_conversation` | 1 | 1 | no |
| `extract_trip_context` | 1 | 1 | no |

## `open_planner` — 26 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlanningProvider (client/src/contexts/PlanningContext.tsx) | "usePlanning().open(source)" | global |
| EnhancedPlanningModal (client/src/contexts/PlanningContext.tsx) | "change (AI summary)" | global |
| DesktopDropdown (client/src/components/layout.tsx) | "Start a plan (Wedding)" | global (public Layout) |
| LandingPage (client/src/pages/landing.tsx) | "hero onPlanTrip → open()", "final CTA onPlanTrip → open()" | / |
| LandingHeroContent (client/src/components/landing/landing-hero.tsx) | "Plan my trip" | / |
| FinalCta (client/src/components/landing/final-cta.tsx) | "Plan my trip" | / |
| MomentsSection (client/src/components/landing/moments-section.tsx) | "Plan this moment" | / |
| PlanEntryCta (client/src/components/planning/plan-entry-cta.tsx) | "Start a plan" | /destinations \| /ready-made \| /events \| /services, /ready-made/:id, /s/:handle \| /experts/:id |
| TripQueueIndicator (client/src/components/TripQueueIndicator.tsx) | "Plan (Multi-City) Trip with AI" | /destinations \| /ready-made \| /events \| /services |
| CuratedCard (client/src/components/curated-content-section.tsx) | "Book Now (no-price curated item)" | /services |
| GlobalCalendar (client/src/components/travelpulse/GlobalCalendar.tsx) | "Plan event" | /events |
| CityGrid CityCard (client/src/components/travelpulse/CityGrid.tsx) | "Plan New Trip with AI" | /destinations |
| Experiences (client/src/pages/experiences.tsx) | "?plan=1", "Start a plan" | /experiences |
| ExperienceTemplatePage (client/src/pages/experience-template.tsx) | "Itinerary Preview", "Edit trip" | /experiences/:slug \| /experiences/:slug/new |
| ConciergePage (client/src/pages/concierge/index.tsx) | "Continue planning" | /concierge |
| PricingPage (client/src/pages/pricing.tsx) | "Start planning", "Optimize a plan" | /pricing |
| HowItWorksPage (client/src/pages/how-it-works.tsx) | "Create a trip" | /how-it-works |
| CartPage (client/src/pages/cart.tsx) | "Edit trip" | /cart |
| ItineraryViewPage (client/src/pages/itinerary-view.tsx) | "Plan a trip like this" | /itinerary-view/:token |
| StartTiles (client/src/pages/dashboard.tsx) | "New plan" | /dashboard |
| Dashboard (client/src/pages/dashboard.tsx) | "IntakePanel open/close" | /dashboard |
| IntakePanel (client/src/components/intake-panel.tsx) | "Dialog open/close (reset)" | /dashboard\|/my-trips |
| MyTrips (client/src/pages/my-trips.tsx) | "Create New", "Create Your First Plan", "IntakePanel open/close" | /my-trips |
| SlipHeader (client/src/components/plancard/SlipView.tsx) | "Edit ›" | /plans/:tripId |
| PlanCard (rail) (client/src/components/plancard/SlipRail.tsx) | "Stops & timezone" | /plans/:tripId |
| AiPlannerDraftPanel (client/src/components/ai-planner-draft-panel.tsx) | "Continue in planner" | /ai-assistant |

## `filter` — 15 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| TwoFieldSearch (client/src/pages/discover.tsx) | "What / Where inputs" | /destinations \| /ready-made \| /services |
| ServiceFiltersPopover (client/src/pages/discover.tsx) | "Min/Max price, Min rating, Sort, Clear …" | /services |
| DiscoverPage (client/src/pages/discover.tsx) | "All / category chips", "Prev / Next page", "Did you mean <suggestion>", "Theme chips / See all / Show all (local…" | /services, /ready-made |
| GlobalCalendar (client/src/components/travelpulse/GlobalCalendar.tsx) | "view / calendar toggle / vibe / clear /…" | /events |
| HeroBand (client/src/pages/discover-location.tsx) | "dismiss date chip" | /discover/location/:city |
| DiscoverLocationPage (client/src/pages/discover-location.tsx) | "search input, price/sort popover, spine…" | /discover/location/:city |
| FeedRenderer (client/src/pages/discover-location.tsx) | "See all / neighbourhood tabs" | /discover/location/:city |
| ServiceDetailPage (client/src/pages/service-detail.tsx) | "availability month, slot pick, room che…" | /services/:id |
| HiddenGemsPage (client/src/pages/hidden-gems.tsx) | "destination input, destination chips, c…" | /hidden-gems |
| DealsPage (client/src/pages/deals.tsx) | "search (debounced), category chips, cle…" | /deals |
| TransportationBookingPage (client/src/pages/transportation-booking.tsx) | "tabs, from/to inputs, Search (local-UI …" | /transportation |
| ExpertsPage (client/src/pages/experts.tsx) | "?role/?destination/?topic", "role auto-switch", "chips / clear filters / load more / sort" | /experts |
| StorefrontPage (client/src/pages/storefront.tsx) | "Category / search / clear" | /s/:handle \| /experts/:id |
| MyTrips (client/src/pages/my-trips.tsx) | "Search plans", "Type filter", "Status filter", "Grid view", "List view", "Show all / Show less" | /my-trips |
| CompactFilterBar (client/src/components/compact-filter-bar.tsx) | "Budget? — Under $150 / Premium ($150+)", "Vendor focus? — Photography / Florals /…", "Activity focus? — Zen / Sake / Craft (c…", "date-night refine controls (none render…", "proposal refine controls (none rendered)", "birthday refine controls (none rendered)", "Custom refine controls (no template)" | /experiences/:slug |

## `ui_local` — 15 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| IntakePanel (client/src/components/intake-panel.tsx) | "Intake dialog close", "Next/Back/type chips/show all" | /experiences |
| ExperienceTemplatePage (client/src/pages/experience-template.tsx) | "Skip", "Expert help dialog close", "Open chat", "Start Chat with Expert", "Wedding mode / tabs / filters / map-pre…" | /experiences/:slug \| /experiences/:slug/new |
| ExpertRequestReviewSheet (client/src/pages/experience-template.tsx) | "Review sheet close" | /experiences/:slug \| /experiences/:slug/new |
| ExpertRequestReviewSheet (client/src/pages/concierge/index.tsx) | "Review sheet close" | /concierge |
| PricingPage (client/src/pages/pricing.tsx) | "Join Plus · Coming soon", "Turn on Pro" | /pricing |
| ExpertCard (client/src/components/expert-card.tsx) | "Favorite" | /experts |
| CartPage (client/src/pages/cart.tsx) | "payment step with empty cart", "Step pills", "Existing/New trip mode, trip select, ca…" | /cart |
| MyBookingsPage (client/src/pages/my-bookings.tsx) | "Raise a concern", "Report a problem" | /bookings |
| EngagementCard (client/src/pages/my-events.tsx) | "Pay dialog close" | /my-events |
| Chat (client/src/pages/chat.tsx) | "Conversation row" | /chat |
| Profile (client/src/pages/profile.tsx) | "Travel style / budget chips" | /profile |
| GuestInvitePage (client/src/pages/GuestInvitePage.tsx) | "Get started / Back", "Origin/RSVP form fields" | /invite/:token |
| ItineraryViewPage (client/src/pages/itinerary-view.tsx) | "Send edits", "Review changes", "Notes/map/diff edit toggles" | /itinerary-view/:token |
| SignInModal (client/src/components/SignInModal.tsx) | "Sign in / Sign up / Forgot password tog…" | global |
| AcceptTermsPage (client/src/pages/accept-terms.tsx) | "Terms / Privacy checkboxes and links" | /accept-terms |

## `dismiss` — 14 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| SignInModalProvider (client/src/contexts/SignInModalContext.tsx) | "closeSignInModal()" | global |
| SignInModal (client/src/contexts/SignInModalContext.tsx) | "SignInModal onOpenChange" | global |
| Layout (client/src/components/layout.tsx) | "(effect) Esc / outside click" | global (public Layout) |
| DesktopDropdown (client/src/components/layout.tsx) | "(effect) close on location", "panel pointerdown/click" | global (public Layout) |
| DiscoverPage (client/src/pages/discover.tsx) | "Dismiss handoff banner" | /destinations \| /ready-made \| /events \| /services |
| LocationMismatchDialog (client/src/components/location-mismatch-dialog.tsx) | "Cancel / close" | /destinations \| /ready-made \| /events \| /services, /services/:id |
| AddToTripDialog (client/src/components/curated-content-section.tsx) | "dialog close" | /services |
| UnifiedResultCard (client/src/components/unified-result-card.tsx) | "Cancel / close booking modal" | /services |
| CityGrid CityCard (client/src/components/travelpulse/CityGrid.tsx) | "dialog close" | /destinations |
| AddToExperienceDialog (client/src/components/add-to-experience-dialog.tsx) | "Cancel / close" | /destinations, /discover/location/:city |
| WhichEventDialog (client/src/pages/service-detail.tsx) | "cancel / close" | /services/:id |
| ReviewCard (client/src/pages/service-detail.tsx) | "Cancel / close flag dialog" | /services/:id |
| ReadyMadeDetailPage (client/src/pages/ready-made-detail.tsx) | "payment dialog close" | /ready-made/:id |
| SavePaymentMethodPrompt (client/src/components/payment/SavePaymentMethodPrompt.tsx) | "Dismiss" | /plans/:tripId |

## `sign_in` — 13 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ProtectedRoute (client/src/App.tsx) | "(effect) unauthenticated gate", "Protected route guard", "Auth gate (unauthenticated visit)" | protected routes (ProtectedRoute), global |
| LoginRoute (client/src/App.tsx) | "(url) /login?returnTo=", "/login?returnTo=\|?redirect=" | /login |
| SignInModalProvider (client/src/contexts/SignInModalContext.tsx) | "openSignInModal()" | global |
| DesktopDropdown (client/src/components/layout.tsx) | "requiresAuth item (guest)" | global (public Layout) |
| Layout (client/src/components/layout.tsx) | "Sign In", "Sign In (mobile top)", "requiresAuth item (mobile guest)", "Sign In (mobile)" | global (public Layout) |
| CityGrid CityCard (client/src/components/travelpulse/CityGrid.tsx) | "Sign In" | /destinations |
| AddToExperienceDialog (client/src/components/add-to-experience-dialog.tsx) | "Sign In (guest)" | /destinations, /discover/location/:city |
| DoneForYouCard (client/src/components/concierge/DoneForYouCard.tsx) | "Sign in to track" | /concierge |
| HowItWorksPage (client/src/pages/how-it-works.tsx) | "Get Started" | /how-it-works |
| CartPage (client/src/pages/cart.tsx) | "Sign in" | /cart |
| MyBookingsPage (client/src/pages/my-bookings.tsx) | "Sign In" | /bookings |
| SignInModal (client/src/components/SignInModal.tsx) | "Sign in / Create account", "Continue with Replit" | global |
| ItineraryComparisonPage (client/src/pages/itinerary-comparison.tsx) | "Unauthenticated redirect" | /itinerary-comparison/:id |

## `add_to_plan` — 13 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| LocationMismatchDialog (client/src/components/location-mismatch-dialog.tsx) | "Add anyway" | /destinations \| /ready-made \| /events \| /services, /services/:id |
| ServiceCard (client/src/pages/discover.tsx) | "Add to plan" | /services |
| CuratedCard (client/src/components/curated-content-section.tsx) | "Add to plan (opens trip picker)" | /services |
| AddToTripDialog (client/src/components/curated-content-section.tsx) | "<trip title> (pick trip)" | /services |
| WishlistSection (client/src/components/dashboard/WishlistSection.tsx) | "+ Trip (opens AddToExperienceDialog)" | /destinations |
| AddToExperienceDialog (client/src/components/add-to-experience-dialog.tsx) | "Add to my trip plan / Add to my trip ca…", "<trip title> (or add to a specific trip)" | /destinations, /discover/location/:city |
| DateHighlightStrip (client/src/pages/discover-location.tsx) | "Add to <Mon> <d>" | /discover/location/:city |
| CityFeedCard* (gem/event/supply/vendor/recommendation) (client/src/components/city-feed-card.tsx) | "Add to plan (all feed tiles)" | /discover/location/:city |
| ServiceDetailPage (client/src/pages/service-detail.tsx) | "Add to plan" | /services/:id |
| WhichEventDialog (client/src/pages/service-detail.tsx) | "Confirm event" | /services/:id |
| SlipAddItemControl (client/src/components/plancard/SlipItemTools.tsx) | "Add something to this event/day", "Add", "Cancel" | /plans/:tripId |
| BuildCard (client/src/components/plancard/SlipRail.tsx) | "Browse services for this trip" | /plans/:tripId |
| ProposalColumn (client/src/components/plancard/ProposalColumn.tsx) | "Add this stop" | /itinerary-comparison/:id |

## `message_expert` — 11 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| CityFeedCard* (client/src/components/city-feed-card.tsx) | "Ask (feed tiles)" | /discover/location/:city |
| CityFeedCardExpert / ExpertCard (client/src/components/city-feed-card-expert.tsx) | "expert profile / Ask" | /discover/location/:city |
| ServiceDetailPage (client/src/pages/service-detail.tsx) | "Contact provider" | /services/:id |
| ExpertCard (client/src/components/expert-card.tsx) | "Message" | /experts |
| StorefrontPage (client/src/pages/storefront.tsx) | "Start a conversation" | /s/:handle \| /experts/:id |
| StorefrontBookingPanel (client/src/components/storefront/StorefrontBookingPanel.tsx) | "Start a conversation (panel)" | /s/:handle \| /experts/:id |
| BookingCard (client/src/pages/my-bookings.tsx) | "Message" | /bookings |
| Chat (client/src/pages/chat.tsx) | "Send", "Typing indicator" | /chat |
| ConciergeCard (client/src/components/marketplace/concierge-card.tsx) | "Message expert" | /plans/:tripId |
| BuildCard (client/src/components/plancard/SlipRail.tsx) | "Message <expert>" | /plans/:tripId |
| TripCardRail/YourExpertCard (client/src/components/plancard/TripCardRail.tsx) | "Message" | /trip/:id |

## `record_analytics` — 10 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| App (client/src/App.tsx) | "(mount) ?ref= capture" | global |
| MomentsSection (client/src/components/landing/moments-section.tsx) | "(timer) moment impression", "carousel dot", "moment tab" | / |
| DiscoverPage (client/src/pages/discover.tsx) | "locationFilter change (analytics)" | /destinations \| /ready-made \| /events \| /services |
| UnifiedResultCard (client/src/components/unified-result-card.tsx) | "partner activity card click (serp only)" | /services |
| DiscoverLocationPage (client/src/pages/discover-location.tsx) | "Unsplash download tracking (effect)" | /discover/location/:city |
| useUpsellSlot (client/src/components/UpsellSlot.tsx) | "recommendation ranking + impressions (m…" | /discover/location/:city |
| useImpressionTracker (client/src/hooks/use-impression-tracker.ts) | "feed card visible (IntersectionObserver)" | /discover/location/:city |
| CityFeedCardRecommendation (client/src/components/city-feed-card-recommendation.tsx) | "Book (recommendation)", "recommendation impression (mount)" | /discover/location/:city |
| FeedWantedSlotCard (client/src/components/feed/wanted-slot-card.tsx) | "More info / Sign up / Ask" | /discover/location/:city |
| TripComplementsStrip (client/src/pages/discover-location.tsx) | "complement add-on link" | /discover/location/:city |

## `book_via_agent` — 9 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| UnifiedResultCard (client/src/components/unified-result-card.tsx) | "Request booking / Book / View", "Request booking (submit)" | /services |
| AddOnAgentCard (client/src/pages/discover-location.tsx) | "Ground transport add-on (12Go agent)" | /discover/location/:city |
| DealCard (client/src/pages/deals.tsx) | "Book Now" | /deals |
| TwelveGoWidget (client/src/components/widgets/TwelveGoWidget.tsx) | "Book via agent" | /transportation |
| TwelveGoDeepLink (client/src/components/widgets/TwelveGoWidget.tsx) | "popular route card" | /transportation |
| AffiliateBookButton (client/src/components/plancard/AffiliateBookButton.tsx) | "Book via your Traveloure agent" | /trip/:id |
| TransportSection/AffiliateOption (client/src/components/plancard/TransportSection.tsx) | "Book via your agent" | /trip/:id |
| UpNextHero (client/src/components/plancard/UpNextHero.tsx) | "Book this ride" | /trip/:id |
| PartnerAgentBookButton (client/src/pages/itinerary-comparison.tsx) | "Book via agent" | /itinerary-comparison/:id |

## `open_in_maps` — 8 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| MapControlCenter (client/src/components/plancard/MapControlCenter.tsx) | "Google Maps", "Apple Maps" | /plans/:tripId, /trip/:id |
| ActivitiesSection (client/src/components/plancard/ActivitiesSection.tsx) | "Connector maps", "Navigate" | /trip/:id |
| TransportSection (client/src/components/plancard/TransportSection.tsx) | "Google Maps", "Apple Maps" | /trip/:id |
| UpNextHero (client/src/components/plancard/UpNextHero.tsx) | "Navigate" | /trip/:id |
| CollapsedSections (client/src/components/plancard/CollapsedSections.tsx) | "Google Maps", "Apple Maps" | /trip/:id |
| PlanCard (client/src/components/plancard/PlanCard.tsx) | "Open in Maps" | /trip/:id |
| BottomActionBar (client/src/components/plancard/BottomActionBar.tsx) | "Maps" | /trip/:id |
| OpenInMapsButton (client/src/pages/itinerary-comparison.tsx) | "Open in Maps" | /itinerary-comparison/:id |

## `share_plan` — 7 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ReadyMadeDetailPage (client/src/pages/ready-made-detail.tsx) | "Copy trip link" | /ready-made/:id |
| ShareCard (client/src/components/plancard/SlipRail.tsx) | "Share link" | /plans/:tripId |
| TripDetails (PlanCard onShare) (client/src/pages/trip-details.tsx) | "Share (Trip Card)" | /trip/:id |
| TripDetails (client/src/pages/trip-details.tsx) | "Share dialog", "Copy link" | /trip/:id |
| HeroSection (client/src/components/plancard/HeroSection.tsx) | "Share" | /trip/:id |
| BottomActionBar (client/src/components/plancard/BottomActionBar.tsx) | "Share" | /trip/:id |
| ShareVariantButton (client/src/pages/itinerary-comparison.tsx) | "Share" | /itinerary-comparison/:id |

## `capture_url_intent` — 7 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| Experiences (client/src/pages/experiences.tsx) | "?destination/country/multiCity/destinat…" | /experiences |
| ExperienceTemplatePage (client/src/pages/experience-template.tsx) | "?destination/destinations/country/multi…", "?tripId=" | /experiences/:slug \| /experiences/:slug/new |
| ConciergePage (client/src/pages/concierge/index.tsx) | "?tier/?intent/?eventType" | /concierge |
| ExpertsPage (client/src/pages/experts.tsx) | "?tripId" | /experts |
| StorefrontPage (client/src/pages/storefront.tsx) | "?tripId" | /s/:handle \| /experts/:id |
| Chat (client/src/pages/chat.tsx) | "?conversation/?expertId/?provider/?clie…" | /chat |
| SignupPage (client/src/pages/Signup.tsx) | "?ref / ?source" | /signup |

## `claim_guest_state` — 6 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| GuestCartMigrator (client/src/App.tsx) | "(effect) guest cart migrate on auth" | global |
| Router (client/src/App.tsx) | "(effect) useClaimGuestTrips", "(effect) useClaimGuestConcierge", "useClaimGuestTrips / useClaimGuestConci…" | global |
| useClaimGuestTrips (client/src/hooks/use-claim-guest-trips.ts) | "(effect) user + guestTrips" | global |
| useClaimGuestConcierge (client/src/hooks/use-claim-guest-concierge.ts) | "(effect) user + guestConciergeRequestId" | global |
| GuestTripProvider (client/src/contexts/GuestTripContext.tsx) | "(mount) load guestTrips", "claimTrips(userId)" | global |
| CartPage (client/src/pages/cart.tsx) | "post-auth guest cart migrate" | /cart |

## `checkout` — 5 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ServiceDetailPage (client/src/pages/service-detail.tsx) | "Book now" | /services/:id |
| ReadyMadeDetailPage (client/src/pages/ready-made-detail.tsx) | "Get this trip / Buy" | /ready-made/:id |
| StripeCheckout (client/src/components/booking/StripeCheckout.tsx) | "Pay (Stripe success)", "payment error toast" | /ready-made/:id |
| RoutingActions (client/src/components/plancard/ActivitiesSection.tsx:~318) | "Go to checkout" | /plans/:tripId, /trip/:id |
| FinishCard (client/src/components/plancard/SlipRail.tsx) | "Go to checkout (n)" | /plans/:tripId |

## `create_plan` — 4 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlanningProvider (client/src/contexts/PlanningContext.tsx) | "mintPlan (finish mint door)" | global |
| PlanModal (client/src/components/trip/plan-modal.tsx) | "Build it myself / Get a local expert / …" | global |
| SavedTripsSection (client/src/components/dashboard/SavedTripsSection.tsx) | "Convert saved trip to plan" | /destinations |
| IntakePanel (client/src/components/intake-panel.tsx) | "Create plan", "Destination", "Start date", "End date", "Travelers", "Next", "Back", "Edit (recap)", "Shape (featured)", "Shape (more)", "More types", "Create" | /experiences, /dashboard\|/my-trips |

## `open_ai_planner` — 4 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlanningProvider (client/src/contexts/PlanningContext.tsx) | "runBranch('ai')" | global |
| PlanModal (client/src/components/trip/plan-modal.tsx) | "Plan with AI" | global |
| IntakePanel (client/src/components/intake-panel.tsx) | "Plan with AI" | /experiences, /dashboard\|/my-trips |
| TripDetails (client/src/pages/trip-details.tsx) | "Plan with preferences" | /trip/:id |

## `request_expert` — 4 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ExperienceTemplatePage (client/src/pages/experience-template.tsx) | "Get Expert Help" | /experiences/:slug \| /experiences/:slug/new |
| ExpertRequestReviewSheet (client/src/pages/experience-template.tsx) | "Send (expert request review)" | /experiences/:slug \| /experiences/:slug/new |
| ExpertRequestReviewSheet (client/src/pages/concierge/index.tsx) | "Send request / Join queue" | /concierge |
| StorefrontBookingPanel (client/src/components/storefront/StorefrontBookingPanel.tsx) | "Share my plan with <name>" | /s/:handle \| /experts/:id |

## `add_to_cart` — 4 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ExperienceTemplatePage (client/src/pages/experience-template.tsx) | "Add (transport/hotel/service/activity/e…" | /experiences/:slug \| /experiences/:slug/new |
| AddCustomVenueModal (client/src/components/add-custom-venue-modal.tsx) | "Add custom venue" | /experiences/:slug \| /experiences/:slug/new |
| UpsellSlot (client/src/pages/cart.tsx) | "Frequently booked together: Add" | /cart |
| ItineraryComparisonPage (client/src/pages/itinerary-comparison.tsx) | "Add upsell" | /itinerary-comparison/:id |

## `view_map` — 4 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| SlipView (client/src/components/plancard/SlipView.tsx) | "List", "Map" | /plans/:tripId |
| MapControlCenter (client/src/components/plancard/MapControlCenter.tsx) | "Map pin", "Expert note pin", "Day (mobile)", "Day", "Activities layer", "Transport layer", "Expert notes layer" | /plans/:tripId, /trip/:id |
| PlanCard (client/src/components/plancard/PlanCard.tsx) | "Card view", "Map view" | /trip/:id |
| ProposalComparisonMap (client/src/components/plancard/ProposalComparisonMap.tsx) | "Map tab", "Compare" | /itinerary-comparison/:id |

## `add_to_calendar` — 4 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| MapControlCenter (client/src/components/plancard/MapControlCenter.tsx) | "Add to calendar (.ics day)" | /plans/:tripId, /trip/:id |
| ShareCard (client/src/components/plancard/SlipRail.tsx) | "Add to calendar" | /plans/:tripId |
| HeroSection (client/src/components/plancard/HeroSection.tsx) | "Calendar" | /trip/:id |
| CollapsedSections (client/src/components/plancard/CollapsedSections.tsx) | "Add to calendar" | /trip/:id |

## `view_day` — 4 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| DaySelector (client/src/components/plancard/DaySelector.tsx) | "Day" | /trip/:id |
| SectionTabs (client/src/components/plancard/SectionTabs.tsx) | "Activities tab", "Transport tab" | /trip/:id |
| ActivitiesSection (client/src/components/plancard/ActivitiesSection.tsx) | "Connector toggle", "Expert note" | /trip/:id |
| CollapsedSections (client/src/components/plancard/CollapsedSections.tsx) | "Collapsed section" | /trip/:id |

## `dismiss_planner` — 3 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlanningProvider (client/src/contexts/PlanningContext.tsx) | "usePlanning().close()" | global |
| PlanModal (client/src/contexts/PlanningContext.tsx) | "PlanModal onOpenChange" | global |
| PlanModal (client/src/components/trip/plan-modal.tsx) | "Dialog onOpenChange (Esc/backdrop/✕)" | global |

## `bind_planning_pen` — 3 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| useTripContextSync (client/src/lib/trip-context.ts) | "(effect) bind pen principal" | global (called from public Layout only) |
| useTripContext (client/src/lib/trip-context.ts) | "(effect) change/storage listeners" | global |
| Layout (client/src/components/layout.tsx) | "(effect) useTripContextSync(principal)" | global (public Layout) |

## `book_via_partner` — 3 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| CuratedCard (client/src/components/curated-content-section.tsx) | "Book via Traveloure" | /services |
| CityFeedCard* (client/src/components/city-feed-card.tsx) | "Book now / Reserve (affiliate)" | /discover/location/:city |
| CityFeedCardExternalStub (client/src/components/city-feed-card-external-stub.tsx) | "affiliate CTA / View source" | /discover/location/:city |

## `open_details` — 3 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| GlobalCalendar CityCard (client/src/components/travelpulse/GlobalCalendar.tsx) | "More info dialog open/close" | /events |
| CityFeedCard* (client/src/components/city-feed-card.tsx) | "card click → More info sheet open/close" | /discover/location/:city |
| CityFeedCardRecommendation (client/src/components/city-feed-card-recommendation.tsx) | "info dialog open/close" | /discover/location/:city |

## `report` — 3 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ReviewCard (client/src/pages/service-detail.tsx) | "Flag review", "Submit flag" | /services/:id |
| MessagesTab (client/src/pages/inbox.tsx) | "Report" | /inbox |
| Chat (client/src/pages/chat.tsx) | "Report user / message" | /chat |

## `restore_draft` — 3 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ExperienceTemplatePage (client/src/pages/experience-template.tsx) | "Rehydrate search settings on mount", "context->local sync / cleared listener" | /experiences/:slug \| /experiences/:slug/new |
| CartPage (client/src/pages/cart.tsx) | "?step=optimize\|payment" | /cart |
| Profile (client/src/pages/profile.tsx) | "hydrate form from server" | /profile |

## `update_cart` — 3 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ExperienceTemplatePage (client/src/pages/experience-template.tsx) | "Quantity slider" | /experiences/:slug \| /experiences/:slug/new |
| CartPage (client/src/pages/cart.tsx) | "Quantity / party size", "External item qty/remove" | /cart |
| PickupLocationField (client/src/pages/cart.tsx) | "Confirm / clear pickup" | /cart |

## `buy_trip_pass` — 3 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PricingPage (client/src/pages/pricing.tsx) | "Get a Trip Pass" | /pricing |
| TripPassCard (client/src/components/plancard/TripPassCard.tsx) | "Buy Trip Pass", "Trip Pass pay sheet" | /plans/:tripId |
| TripPassCard/StripeCheckout (client/src/components/plancard/TripPassCard.tsx:~177) | "Trip Pass paid" | /plans/:tripId |

## `copy_link` — 3 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| StorefrontPage (client/src/pages/storefront.tsx) | "Share page" | /s/:handle \| /experts/:id |
| MyBookingsPage (client/src/pages/my-bookings.tsx) | "Copy code" | /bookings |
| ItineraryViewPage (client/src/pages/itinerary-view.tsx) | "Share" | /itinerary-view/:token |

## `route_to_checkout` — 3 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| RoutingActions (client/src/components/plancard/ActivitiesSection.tsx) | "Add to checkout" | /plans/:tripId, /trip/:id |
| PlanApprovalBanner (client/src/components/plancard/PlanApprovalBanner.tsx) | "Book N items (approved plan)" | /plans/:tripId, /trip/:id |
| ExpertSuggestionsPanel (client/src/components/plancard/ExpertSuggestionsPanel.tsx) | "Approve & book" | /plans/:tripId, /trip/:id |

## `optimize_plan` — 3 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| BuildCard (client/src/components/plancard/SlipRail.tsx) | "Optimize this plan", "Optimization pay sheet", "Pay sheet cancel" | /plans/:tripId |
| BuildAroundDialog (client/src/components/plancard/BuildAroundDialog.tsx) | "Build-around dialog", "Auto mode", "Anchor mode (hotel/neighborhood/activit…", "Candidate", "Cancel", "Confirm (build around)" | /plans/:tripId |
| BuildCard/StripeCheckout (client/src/components/plancard/SlipRail.tsx) | "Optimization fee paid" | /plans/:tripId |

## `hire_expert` — 3 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| BuildCard (client/src/components/plancard/SlipRail.tsx) | "Hand off to a local expert" | /plans/:tripId |
| HireExpertDialog (client/src/components/plancard/HireExpertDialog.tsx) | "Hire dialog", "Expert option", "Send request" | /plans/:tripId |
| EscalationCTA (client/src/components/plancard/EscalationCTA.tsx) | "Get expert polish" | /trip/:id |

## `view_logistics` — 3 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| SlipLogisticsSection (client/src/components/plancard/SlipLogisticsSection.tsx) | "Anchors", "Guests" | /plans/:tripId |
| PlanCard (rail) (client/src/components/plancard/SlipRail.tsx) | "Vendor contracts" | /plans/:tripId |
| TripDetails (client/src/pages/trip-details.tsx) | "Logistics drawer" | /trip/:id |

## `invite_guests` — 3 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| GuestInviteManager (delegated, slip mount) (client/src/components/plancard/SlipLogisticsSection.tsx) | "Guest invites (embedded)" | /plans/:tripId |
| PlanGuestsPage (client/src/pages/plan-guests.tsx) | "Invite by email", "Invite (column)", "Which event? dialog", "Pick event", "Invite dialog" | /plans/:tripId/guests |
| GuestInviteManager (client/src/components/GuestInviteManager.tsx) | "Add guests dialog", "Add row", "Remove row", "Cancel", "Load invites (mount)", "Create Invites" | /plans/:tripId/guests |

## `resume_after_auth` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| AuthReturnToRestorer (client/src/App.tsx) | "(effect) restore traveloure_return_to", "Restore return-to after OAuth" | global |
| PricingPage (client/src/pages/pricing.tsx) | "?membership=success" | /pricing |

## `finish_plan` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlanningProvider (client/src/contexts/PlanningContext.tsx) | "source.onFinish override" | global |
| PlanModal (client/src/contexts/PlanningContext.tsx) | "onFinish=runBranch" | global |

## `open_menu` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| DesktopDropdown (client/src/components/layout.tsx) | "dropdown hover/focus", "dropdown trigger keys" | global (public Layout) |
| Layout (client/src/components/layout.tsx) | "Join as Partner", "UserMenu (untraced)", "menu toggle" | global (public Layout) |

## `set_locale` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| Layout (client/src/components/layout.tsx) | "LanguageMenu" | global (public Layout) |
| LanguageMenu (client/src/components/language-menu.tsx) | "language picker" | /ready-made/:id |

## `sign_out` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| Layout (client/src/components/layout.tsx) | "(icon) Log out" | global (public Layout) |
| DashboardSidebar (client/src/components/dashboard-sidebar.tsx) | "Logout" | global |

## `add_stop` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| LocationMismatchDialog (client/src/components/location-mismatch-dialog.tsx) | "Add <city> as a stop" | /destinations \| /ready-made \| /events \| /services, /services/:id |
| CityGrid CityCard (client/src/components/travelpulse/CityGrid.tsx) | "<trip title> (Add to an existing trip)" | /destinations |

## `edit_queue` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| TripQueueIndicator (client/src/components/TripQueueIndicator.tsx) | "Remove city / Clear queue" | /destinations \| /ready-made \| /events \| /services |
| CityGrid CityCard (client/src/components/travelpulse/CityGrid.tsx) | "Add to / Remove from Multi-City Queue" | /destinations |

## `save_item` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| WishlistSection (client/src/components/dashboard/WishlistSection.tsx) | "Remove saved item" | /destinations |
| SaveToggle (client/src/components/SaveToggle.tsx) | "Save / Saved (heart)" | /discover/location/:city |

## `request_service` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| MatchedServiceStrip (client/src/components/city-feed-card.tsx) | "Request (matched service strip)" | /discover/location/:city |
| ServiceRequestDialog (client/src/components/service-request-dialog.tsx) | "Request a service (open/close)", "Submit request" | /discover/location/:city |

## `persist_draft` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ExperienceTemplatePage (client/src/pages/experience-template.tsx) | "externalCart sessionStorage sync" | /experiences/:slug \| /experiences/:slug/new |
| CartPage (client/src/pages/cart.tsx) | "ensure guest session id", "external items sessionStorage" | /cart |

## `remove_from_cart` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ExperienceTemplatePage (client/src/pages/experience-template.tsx) | "Remove" | /experiences/:slug \| /experiences/:slug/new |
| CartPage (client/src/pages/cart.tsx) | "Remove", "Remove saved (guest) service" | /cart |

## `compare_plans` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ExperienceTemplatePage (client/src/pages/experience-template.tsx) | "Compare AI Alternatives" | /experiences/:slug \| /experiences/:slug/new |
| StripeCheckout (client/src/components/booking/StripeCheckout.tsx) | "Optimization payment success" | /cart |

## `request_concierge` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| IntentForm (client/src/components/concierge/IntentForm.tsx) | "Intent form submit" | /concierge |
| EscalationCTA (client/src/components/plancard/EscalationCTA.tsx) | "Concierge quote (mount)" | /trip/:id |

## `checkout_pay` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| CartPage (client/src/pages/cart.tsx) | "?intent=buy", "Skip to payment", "Proceed to payment", "Complete booking" | /cart |
| StripeCheckout (client/src/components/booking/StripeCheckout.tsx) | "Payment success" | /cart |

## `view_booking_status` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| BookingConfirmationPage (client/src/pages/BookingConfirmationPage.tsx) | "?bookings=", "?redirect_status/payment_intent/payment…" | /booking/confirmation |
| ItineraryViewPage (client/src/pages/itinerary-view.tsx) | "Load share + set meta" | /itinerary-view/:token |

## `pay_coordination_fee` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| EngagementCard (client/src/pages/my-events.tsx) | "Pay coordination fee / Use a different …", "Pay with saved card" | /my-events |
| StripeCheckout (client/src/components/booking/StripeCheckout.tsx) | "Fee payment success" | /my-events |

## `block_user` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| MessagesTab (client/src/pages/inbox.tsx) | "Block" | /inbox |
| Chat (client/src/pages/chat.tsx) | "Unblock", "Block" | /chat |

## `mark_read` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| UpdatesTab (client/src/pages/inbox.tsx) | "Mark all read", "Open update / Mark read" | /inbox |
| Chat (client/src/pages/chat.tsx) | "mark conversation read" | /chat |

## `accept_terms` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| AcceptTermsPage (client/src/pages/accept-terms.tsx) | "Accept and continue" | /accept-terms |
| ProtectedRoute (client/src/App.tsx) | "Terms not accepted redirect" | global |

## `review_suggestion` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| WhileYouWereAway/SuggestionRow (client/src/components/dashboard/WhileYouWereAway.tsx) | "Accept", "Decline" | /dashboard |
| ExpertSuggestionsPanel (client/src/components/plancard/ExpertSuggestionsPanel.tsx) | "Approve suggestion", "Confirm reject", "Reject", "Reject dialog", "Cancel" | /plans/:tripId, /trip/:id |

## `view_log` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| TransitionLogFooter (client/src/components/plancard/SlipView.tsx) | "view full log" | /plans/:tripId |
| SectionTabs (client/src/components/plancard/SectionTabs.tsx) | "Changes" | /trip/:id |

## `create_event` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| SlipLogisticsSection (client/src/components/plancard/SlipLogisticsSection.tsx) | "Set up guest list" | /plans/:tripId |
| SlipOrganizeEvents (client/src/components/plancard/SlipOrganizeEvents.tsx) | "Organize into events", "Event chip", "Custom event (Enter)", "Cancel", "Create events" | /plans/:tripId |

## `apply_ai_proposal` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| AskAiDrawer (client/src/components/plancard/AskAiDrawer.tsx) | "Apply", "Pay sheet" | /plans/:tripId, /trip/:id |
| AskAiDrawer (client/src/components/plancard/AskAiDrawer.tsx:~455) | "AI-task payment success" | /plans/:tripId, /trip/:id |

## `download_pdf` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ShareCard (client/src/components/plancard/SlipRail.tsx) | "Download PDF" | /plans/:tripId |
| HeroSection (client/src/components/plancard/HeroSection.tsx) | "PDF" | /trip/:id |

## `reopen_plan` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| FinishCard (client/src/components/plancard/SlipRail.tsx) | "Back to planning" | /plans/:tripId |
| TripCardRail/BackToPlanningCard (client/src/components/plancard/TripCardRail.tsx) | "Back to planning" | /trip/:id |

## `set_transport_mode` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ActivitiesSection/TransportConnector (client/src/components/plancard/ActivitiesSection.tsx) | "Transport mode" | /trip/:id |
| TransportSection (client/src/components/plancard/TransportSection.tsx) | "Mode badge", "Transport mode option" | /trip/:id |

## `contact_vendor` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ActivitiesSection (client/src/components/plancard/ActivitiesSection.tsx) | "Call vendor" | /trip/:id |
| UpNextHero (client/src/components/plancard/UpNextHero.tsx) | "Call driver" | /trip/:id |

## `adopt_proposal` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ItineraryComparisonPage (client/src/pages/itinerary-comparison.tsx) | "?autoApply=1", "Sync selected variant", "Try again (apply)", "Apply confirm dialog", "Apply (confirm)", "Baseline card", "Variant card" | /itinerary-comparison/:id |
| ProposalColumn (client/src/components/plancard/ProposalColumn.tsx) | "Apply" | /itinerary-comparison/:id |

## `view_plan` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ItineraryComparisonPage (client/src/pages/itinerary-comparison.tsx) | "View Full Plan (baseline)", "View Full Plan", "Variant modal", "Close" | /itinerary-comparison/:id |
| VariantTransportLegs (client/src/pages/itinerary-comparison.tsx) | "Transport legs" | /itinerary-comparison/:id |

## `request_expert_booking` — 2 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| VariantActionButtons (delegated) (client/src/pages/itinerary-comparison.tsx) | "Expert / Save / Share (variant)" | /itinerary-comparison/:id |
| ItineraryComparisonPage (client/src/pages/itinerary-comparison.tsx) | "Talk to an expert", "Expert dialog", "Cancel", "Request expert booking" | /itinerary-comparison/:id |

## `show_maintenance` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| MaintenanceGate (client/src/components/maintenance-screen.tsx) | "(effect) MAINTENANCE_EVENT listener" | global |

## `reload_page` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| MaintenanceGate (client/src/components/maintenance-screen.tsx) | "Try again" | global |

## `persist_guest_state` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| GuestTripProvider (client/src/contexts/GuestTripContext.tsx) | "(effect) persist guestTrips" | global |

## `add_guest_trip` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| GuestTripProvider (client/src/contexts/GuestTripContext.tsx) | "addGuestTrip()" | global |

## `remove_guest_trip` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| GuestTripProvider (client/src/contexts/GuestTripContext.tsx) | "removeGuestTrip()" | global |

## `add_city` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| TripQueueProvider (client/src/contexts/TripQueueContext.tsx) | "addCity()" | global |

## `remove_city` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| TripQueueProvider (client/src/contexts/TripQueueContext.tsx) | "removeCity()" | global |

## `clear_queue` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| TripQueueProvider (client/src/contexts/TripQueueContext.tsx) | "clearQueue()" | global |

## `sync_console_role` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ActiveConsoleProvider (client/src/contexts/ActiveConsoleContext.tsx) | "(effect) user.role" | global |

## `checkout_membership` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlanningProvider (client/src/contexts/PlanningContext.tsx) | "runBranch('occasion')" | global |

## `dismiss_ai_planner` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| EnhancedPlanningModal (client/src/contexts/PlanningContext.tsx) | "EnhancedPlanningModal onClose" | global |

## `seed_form` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlanModal (client/src/components/trip/plan-modal.tsx) | "(effect) seed form on open", "(effect) resolve start step", "(effect) seed stops from bound trip", "(effect) home-city suggestion" | global |

## `navigate_step` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlanModal (client/src/components/trip/plan-modal.tsx) | "(effect) clamp step to visible", "change (occasion pill)", "step rail", "Back", "Next: {step}" | global |

## `select_occasion` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlanModal (client/src/components/trip/plan-modal.tsx) | "occasion tile" | global |

## `edit_plan_field` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlanModal (client/src/components/trip/plan-modal.tsx) | "destination", "stop name", "move stop up", "move stop down", "remove stop", "Add another stop", "date (day shape)", "main moment time (day)", "start date", "end date", "main moment date", "main moment time (range)", "party minus", "party count", "party plus", "budget approver name", "budget approver email", "accessibility note", "event chip", "Something else", "custom event text", "custom event (blur commit)", "custom event (Enter commit)", "event day", "event time", "event place", "Plan name (optional)" | global |

## `clear_plan` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlanModal (client/src/components/trip/plan-modal.tsx) | "Clear plan" | global |

## `save_plan_draft` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlanModal (client/src/components/trip/plan-modal.tsx) | "Save" | global |

## `open_notifications` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| Layout (client/src/components/layout.tsx) | "NotificationBell (untraced)" | global (public Layout) |

## `match_experts` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| AIMatchedExpertsSection (client/src/components/ai-matched-experts-section.tsx) | "AI-matched experts (auto-run on mount)", "Retry / Try again (×3), Show all, View …" | /destinations \| /ready-made \| /events \| /services (?showExperts=true) |

## `refetch` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| GlobalCalendar (client/src/components/travelpulse/GlobalCalendar.tsx) | "Retry" | /events |

## `pick_trip` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| CityGrid CityCard (client/src/components/travelpulse/CityGrid.tsx) | "Take me Here" | /destinations |

## `record_recently_viewed` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| DiscoverLocationPage (client/src/pages/discover-location.tsx) | "city view (mount)" | /discover/location/:city |

## `request_quote` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ServiceDetailPage (client/src/pages/service-detail.tsx) | "Request to book" | /services/:id |

## `discover_gems` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| HiddenGemsPage (client/src/pages/hidden-gems.tsx) | "Discover (+ Enter key)" | /hidden-gems |

## `set_trip_basics` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ExperienceTemplatePage (client/src/pages/experience-template.tsx) | "Persist search settings + reverse-sync …", "Destination prompt auto-open", "Confirm destination" | /experiences/:slug \| /experiences/:slug/new |

## `geocode` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ExperienceTemplatePage (client/src/pages/experience-template.tsx) | "Geocode destination" | /experiences/:slug \| /experiences/:slug/new |

## `choose_concierge_tier` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ConciergePage (client/src/pages/concierge/index.tsx) | "Plan modal finish (tier CTA)" | /concierge |

## `request_coordination` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| DoneForYouCard (client/src/components/concierge/DoneForYouCard.tsx) | "Done for you (full)" | /concierge |

## `buy_membership` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PricingPage (client/src/pages/pricing.tsx) | "Join Plus" | /pricing |

## `prepare_optimization` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| CartPage (client/src/pages/cart.tsx) | "cart optimize nudge preview", "Optimize / Continue" | /cart |

## `set_currency` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| CartPage (client/src/pages/cart.tsx) | "Currency" | /cart |

## `convert_cart_to_plan` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| CartPage (client/src/pages/cart.tsx) | "Start planning", "Add to trip itinerary" | /cart |

## `pay_optimization` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| CartPage (client/src/pages/cart.tsx) | "Pay with saved card", "Use a different card", "Unlock optimization" | /cart |

## `update_checklist` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| VisaStatusTimeline (client/src/pages/my-bookings.tsx) | "Checklist item" | /bookings |

## `raise_concern` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| MyBookingsPage (client/src/pages/my-bookings.tsx) | "Submit concern" | /bookings |

## `download_deliverable` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| BookingCard (client/src/pages/my-bookings.tsx) | "Download deliverable" | /bookings |

## `cancel_booking` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| CancelBookingDialog (client/src/components/booking/CancelBookingDialog.tsx) | "Cancel booking" | /bookings |

## `confirm_completion` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| BookingCard (client/src/pages/my-bookings.tsx) | "Confirm completion" | /bookings |

## `dispute_booking` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| BookingCard (client/src/pages/my-bookings.tsx) | "Submit dispute" | /bookings |

## `review_service` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ReviewDialog (client/src/pages/my-bookings.tsx) | "Submit review" | /bookings |

## `delete_notification` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| UpdatesTab (client/src/pages/inbox.tsx) | "Delete" | /inbox |

## `save_profile` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| Profile (client/src/pages/profile.tsx) | "Upload / Remove photo", "Save changes" | /profile |

## `set_home_city` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlusOccasionsPage (client/src/pages/plus-occasions.tsx) | "Home city" | /plus/occasions |

## `add_occasion` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlusOccasionsPage (client/src/pages/plus-occasions.tsx) | "Add occasion" | /plus/occasions |

## `delete_occasion` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlusOccasionsPage (client/src/pages/plus-occasions.tsx) | "Delete occasion" | /plus/occasions |

## `rsvp_invite` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| GuestInvitePage (client/src/pages/GuestInvitePage.tsx) | "Load invite", "Submit RSVP" | /invite/:token |

## `save_invite_origin` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| GuestInvitePage (client/src/pages/GuestInvitePage.tsx) | "Continue (origin)" | /invite/:token |

## `suggest_itinerary_edits` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ItineraryViewPage (client/src/pages/itinerary-view.tsx) | "Send suggestions" | /itinerary-view/:token |

## `acknowledge_itinerary_edits` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ItineraryViewPage (client/src/pages/itinerary-view.tsx) | "Accept / Reject (all or selected diffs)" | /itinerary-view/:token |

## `reset_password` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| SignInModal (client/src/components/SignInModal.tsx) | "Send reset link" | global |

## `sign_up` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| SignupPage (client/src/pages/Signup.tsx) | "Create account" | /signup |

## `toggle_sidebar` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| DashboardLayout/SidebarTrigger (client/src/components/dashboard-layout.tsx) | "Toggle sidebar" | global |

## `record_visit_marker` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| WhileYouWereAway (client/src/components/dashboard/WhileYouWereAway.tsx) | "Since you were here (mount)" | /dashboard |

## `edit_plan_dates` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| SetPlanDates (client/src/components/plancard/SetPlanDates.tsx) | "Set dates", "Dates dialog", "Start", "End", "Save dates" | /plans/:tripId |

## `edit_event_time` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| EventTimeAffordance (client/src/components/plancard/SlipView.tsx) | "Event time" | /plans/:tripId |

## `edit_event_budget` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| EventBudgetAffordance (client/src/components/plancard/SlipView.tsx) | "Event budget" | /plans/:tripId |

## `reorder_item` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| SlipItemTools (client/src/components/plancard/SlipItemTools.tsx) | "Move up", "Move down" | /plans/:tripId |

## `edit_item` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| SlipItemTools (client/src/components/plancard/SlipItemTools.tsx) | "Edit", "Save", "Cancel edit" | /plans/:tripId |

## `remove_item` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| SlipItemTools (client/src/components/plancard/SlipItemTools.tsx) | "Remove", "Remove (confirm)", "Keep" | /plans/:tripId |

## `comment_on_item` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ItemComments (client/src/components/plancard/ItemComments.tsx) | "Ask your expert (toggle)", "Comment (Enter)", "Send" | /plans/:tripId |

## `route_to_expert` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| RoutingActions (client/src/components/plancard/ActivitiesSection.tsx) | "Send to expert" | /plans/:tripId, /trip/:id |

## `recall_from_expert` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| RoutingActions (client/src/components/plancard/ActivitiesSection.tsx) | "Recall from expert" | /plans/:tripId, /trip/:id |

## `remove_from_checkout` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| RoutingActions (client/src/components/plancard/ActivitiesSection.tsx) | "Remove from checkout" | /plans/:tripId, /trip/:id |

## `return_to_planning` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| RoutingActions (client/src/components/plancard/ActivitiesSection.tsx) | "Return to planning (expert)" | /plans/:tripId, /trip/:id |

## `approve_plan` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlanApprovalBanner (client/src/components/plancard/PlanApprovalBanner.tsx) | "Approve plan", "Approve & book" | /plans/:tripId, /trip/:id |

## `request_changes` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlanApprovalBanner (client/src/components/plancard/PlanApprovalBanner.tsx) | "Send (request changes)", "Request changes", "Request-changes dialog", "Cancel" | /plans/:tripId, /trip/:id |

## `request_revision` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ConciergeCard (client/src/components/marketplace/concierge-card.tsx) | "Request revision" | /plans/:tripId |

## `draft_with_ai` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| BuildCard (client/src/components/plancard/SlipRail.tsx) | "Draft it with AI" | /plans/:tripId |

## `manage_party` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| SlipTravelingParty (client/src/components/plancard/SlipTravelingParty.tsx) | "Traveling party", "Add someone", "Edit member", "Cancel" | /plans/:tripId |

## `add_party_member` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| SlipTravelingParty (client/src/components/plancard/SlipTravelingParty.tsx) | "Save (add)" | /plans/:tripId |

## `edit_party_member` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| SlipTravelingParty (client/src/components/plancard/SlipTravelingParty.tsx) | "Save (edit)" | /plans/:tripId |

## `remove_party_member` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| SlipTravelingParty (client/src/components/plancard/SlipTravelingParty.tsx) | "Remove" | /plans/:tripId |

## `ask_ai` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| AskAiDrawer (client/src/components/plancard/AskAiDrawer.tsx) | "Ask", "Ask AI", "Ask AI drawer", "Re-ask" | /plans/:tripId, /trip/:id |

## `discard_ai_proposal` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| AskAiDrawer (client/src/components/plancard/AskAiDrawer.tsx) | "Discard" | /plans/:tripId, /trip/:id |

## `finalize_plan` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| FinishCard (client/src/components/plancard/SlipRail.tsx) | "Finalize Plan" | /plans/:tripId |

## `choose_booking_lane` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| FinalizeBookingModal (client/src/components/plancard/FinalizeBookingModal.tsx) | "Finalize chooser", "Book it myself", "Booking agent / expert / concierge", "Back", "Continue" | /plans/:tripId |

## `share_invite` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| GuestInviteManager (client/src/components/GuestInviteManager.tsx) | "Copy invite link" | /plans/:tripId/guests |

## `send_invites` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| GuestInviteManager (client/src/components/GuestInviteManager.tsx) | "Send all invites", "Send invite" | /plans/:tripId/guests |

## `delete_invite` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| GuestInviteManager (client/src/components/GuestInviteManager.tsx) | "Delete invite" | /plans/:tripId/guests |

## `retry_load` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| TripDetails (client/src/pages/trip-details.tsx) | "Retry" | /trip/:id |

## `delete_plan` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| PlanCard (client/src/components/plancard/PlanCard.tsx) | "Delete plan (click twice)" | /trip/:id |

## `mark_visited` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ActivitiesSection (client/src/components/plancard/ActivitiesSection.tsx) | "Visited toggle" | /trip/:id |

## `book_transport` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| TransportSection (client/src/components/plancard/TransportSection.tsx) | "Leg booking panel", "Book" | /trip/:id |

## `accept_transport_leg` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| TransportSection (client/src/components/plancard/TransportSection.tsx) | "Accept" | /trip/:id |

## `decline_transport_leg` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| TransportSection (client/src/components/plancard/TransportSection.tsx) | "Decline" | /trip/:id |

## `record_impression` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ItineraryComparisonPage (client/src/pages/itinerary-comparison.tsx) | "Upsell impressions" | /itinerary-comparison/:id |

## `regenerate_proposals` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ItineraryComparisonPage (client/src/pages/itinerary-comparison.tsx) | "Retry", "Re-run with feedback", "Feedback chip" | /itinerary-comparison/:id |

## `save_variant` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| VariantOptionsMenu (delegated) (client/src/pages/itinerary-comparison.tsx) | "Variant options menu" | /itinerary-comparison/:id |

## `apply_to_cart` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| ItineraryComparisonPage (client/src/pages/itinerary-comparison.tsx) | "Apply to cart" | /itinerary-comparison/:id |

## `escalate_to_team` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| AIAssistant (client/src/pages/ai-assistant.tsx) | "Get help from our team" | /ai-assistant |

## `send_ai_message` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| AIAssistant (client/src/pages/ai-assistant.tsx) | "New chat", "Suggested prompt", "Message input", "Message (Enter)", "Send" | /ai-assistant |

## `rename_conversation` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| AIAssistant (client/src/pages/ai-assistant.tsx) | "Rename", "Rename (Enter/blur)" | /ai-assistant |

## `delete_conversation` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| AIAssistant (client/src/pages/ai-assistant.tsx) | "Delete" | /ai-assistant |

## `extract_trip_context` — 1 component(s)

| Component (file) | Labels | Routes |
|---|---|---|
| AiPlannerDraftPanel (client/src/components/ai-planner-draft-panel.tsx) | "Trip-context extraction (after each rep…" | /ai-assistant |
