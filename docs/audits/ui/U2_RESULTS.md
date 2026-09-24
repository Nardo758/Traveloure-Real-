# U2 — UI-class P1/P2 rows, re-run with screenshots

Every P1/P2 gap in a UI class (FALSE_PROMISE, INVISIBLE_RESULT, INCONSISTENT_AFFORDANCE, SILENT_FAILURE_UI, SILENT_SUCCESS) was re-run in the browser against the local production build of `858d28f`. The harness is `docs/audits/journeys/harness/u2-ui-probes.mjs` plus `u2b-ui-probes.mjs` (second pass, with local test data: `u2-seed.sql` and a nulled `dates_confirmed_at` on the probe's own trip) and `u2c-chat-first-message.mjs`. Failure paths were **forced with Playwright request interception** (`page.route` → 500). No app code was touched.

Each directory below holds `before.png`, `after.png` (plus extra frames where useful), `network.json` and `result.json`.

**Tally at closeout: CONFIRMED 28 · REFUTED 2 · NOT PROVEN 1 · BLOCKED 0** (31 gap entries: the 30 UI-class P1/P2 gaps plus one NEW P1 found while probing). The first pass had 3 BLOCKED. At closeout, the two `services:unified-request-booking` entries were re-run and CONFIRMED, and `deals:book` was moved to NOT PROVEN.

| Row id | Gap(s) | Verdict | Observed | Evidence |
|---|---|---|---|---|
| `planning-provider:run-branch-ai` | P2 INCONSISTENT_AFFORDANCE | **CONFIRMED** | after Escape + client-side navigation to /services the AI modal is STILL visible over the page | [dir](planning-provider__run-branch-ai/) |
| `planning-provider:ai-modal-on-close` | P2 INCONSISTENT_AFFORDANCE | **CONFIRMED** | backdrop click + Escape: AI modal remains open (only its own Cancel/✕ close it) | [dir](planning-provider__ai-modal-on-close/) |
| `plan-modal:dialog-on-open-change` | P2 SILENT_FAILURE_UI | **CONFIRMED** | Escape: toasts=[], writes=0; reopened at step 1 empty=true | [dir](plan-modal__dialog-on-open-change/) |
| `plan-modal:button-etp-save` | P2 SILENT_SUCCESS | **CONFIRMED** | after Save: toasts=[] (the only visible change is the trip strip) | [dir](plan-modal__button-etp-save/) |
| `discover-shared:mismatch-add-anyway` | P2 INVISIBLE_RESULT | **CONFIRMED** | added to /api/trips/1f6cc6d9-6bd2-47dc-beaa-853bb16423fd/itinerary-items; toast ["Added to your plan Find it on your plan.","Notification Added to your planFind it on your plan."]; names the target plan=false | [dir](discover-shared__mismatch-add-anyway/) |
| `discover-shared:mismatch-add-as-stop` | P2 SILENT_FAILURE_UI | **CONFIRMED** | PUT destinations forced 500 → toasts ["Added to your plan Find it on your plan.","Notification Added to your planFind it on your plan."] | [dir](discover-shared__mismatch-add-as-stop/) |
| `services:add-to-plan` | P1 FALSE_PROMISE | **CONFIRMED** | label "Add to Plan" → POST /api/cart 201; toast ["Added to cart! Service has been added to your cart.","Notification Added to cart!Service has been added to your cart."] | [dir](services__add-to-plan#false-promise-cart/) |
| `services:add-to-plan` | P2 INVISIBLE_RESULT | **CONFIRMED** | item written to /api/trips/ccd05d30-9e9b-42b1-a137-b27c04a43843/itinerary-items (trip ccd05d30-9e9b-42b1-a137-b27c04a43843); target banner visible=false; toast ["Added to your plan Find it on your plan.","Notification Added to your planFind it on your plan."]  | [dir](services__add-to-plan#invisible-target/) |
| `services:add-to-plan` | P2 FALSE_PROMISE | **CONFIRMED** | guest toast ["Saved! Sign in to checkout and save your selection.","Notification Saved!Sign in to checkout and save your selection."]; server writes=0 (localStorage only) | [dir](services__add-to-plan#guest-saved/) |
| `services:add-to-plan` | P2 INVISIBLE_RESULT | **CONFIRMED** | item written to /api/trips/ccd05d30-9e9b-42b1-a137-b27c04a43843/itinerary-items (trip ccd05d30-9e9b-42b1-a137-b27c04a43843); target banner visible=false; toast ["Added to your plan Find it on your plan.","Notification Added to your planFind it on your plan."]  | [dir](services__add-to-plan#invisible-target/) |
| `services:curated-pick-trip` | P2 INCONSISTENT_AFFORDANCE | **CONFIRMED** | curated label "Add to Plan" opened a trip picker=true; ServiceCard label on the same page "Add to Plan" adds directly to the pen target (J1 R3) | [dir](services__curated-pick-trip/) |
| `services:unified-request-booking` | P2 SILENT_FAILURE_UI | **CONFIRMED** (closeout re-run) | Signed in (GET /api/auth/user 200), POST /api/affiliate-booking-requests forced to 500 → toast "Sign in required · Please sign in to request a booking." | [dir](services__unified-request-booking-failure/) |
| `services:unified-request-booking` | P2 INVISIBLE_RESULT | **CONFIRMED** (closeout re-run) | POST 200, toast "Booking requested!", one `affiliate_booking_requests` row with `trip_id` NULL. After reload the card still reads "Request booking" with no requested or pending state. | [dir](services__unified-request-booking/) |
| `destinations:ade-primary` | P2 INVISIBLE_RESULT | **CONFIRMED** | dialog primary button reads "Add to my trip plan  Plan & optimize whenever you're ready — nothing to set up now" — it does not name the plan it will write to | [dir](destinations__ade-primary/) |
| `discover-location:addon-agent` | P2 INVISIBLE_RESULT | **CONFIRMED** | request → 200 {"id":"84476780-6cb5-41fb-be2d-187be4279641","userId":"6ac1907e-1d29-40d1-8e07-3b9e995969d2","expertId":null,"tripId":nu; 'Request sent' badge survives reload=false; request carries no tripId (body {"itemName":"Airport transfer — Kyoto","itemDesc | [dir](discover-location__addon-agent/) |
| `discover-location:ade-primary` | P2 INVISIBLE_RESULT | **CONFIRMED** | dialog primary button reads "Add to my trip plan  Plan & optimize whenever you're ready — nothing to set up now" | [dir](discover-location__ade-primary/) |
| `service-detail:add-to-plan` | P2 INVISIBLE_RESULT | **CONFIRMED** | banner "Booking for your trip." · toast ["Added to your plan Find it on your plan — check out when you're ready.","Notification Added to your planFind it on your plan — check out when you're ready."] — plan named=false | [dir](service-detail__add-to-plan/) |
| `service-detail:mismatch-add-as-stop` | P2 SILENT_FAILURE_UI | **CONFIRMED** | PUT destinations forced 500 → toasts ["Added to your plan Find it on your plan — check out when you're ready.","Notification Added to your planFind it on your plan — check out when you're ready."] | [dir](service-detail__mismatch-add-as-stop/) |
| `deals:book` | P2 INVISIBLE_RESULT | **NOT PROVEN** (closeout) | GET /api/deals → 200 {"deals":[],"total":0}. There is no feed data, so no deal card to act on. | [dir](deals__book/) |
| `transportation:twelvego-deeplink-book` | P2 FALSE_PROMISE | **CONFIRMED** | card text "Bangkok → Chiang Mai View schedules & prices" → POST /api/affiliate-booking-requests 200 | [dir](transportation__twelvego-deeplink-book/) |
| `experiences:button-intake-create` | P2 SILENT_FAILURE_UI | **REFUTED** | POST /api/trips forced 500 → toasts ["Error Failed to create trip","Notification ErrorFailed to create trip"] | [dir](experiences__button-intake-create/) |
| `experience-template:effect-persist-settings` | P2 FALSE_PROMISE | **CONFIRMED** | PUT /api/trip-context carried travelers:2 with no user input: {"context":{"experienceSlug":"travel","destination":"Kyoto, Japan","travelers":2,"experienceType":"Travel"}} | [dir](experience-template__effect-persist-settings/) |
| `experience-template:review-sheet-send` | P2 FALSE_PROMISE | **CONFIRMED** | sheet basics "Destination Kyoto, Japan Dates Not set Travelers 2 travelers", Send enabled=true; after Send toast ["Your plan needs a few basics first Pick your dates — the plan needs a start and an end.","Notification Your plan needs a few basics firstPick you | [dir](experience-template__review-sheet-send/) |
| `experience-template:add-to-cart` | P2 INCONSISTENT_AFFORDANCE | **CONFIRMED** | SPA path, pen bound to 21e5e3a9-4888-470e-9194-f5de1850c8fb: button "Add to Cart" → POST itinerary-items 201, landed on /plans/21e5e3a9-4888-470e-9194-f5de1850c8fb. (First-pass full-load variant: the pen was unbound (H8 D6) and the same button went to /cart —  | [dir](experience-template__add-to-cart/) |
| `storefront:storefront-panel-share` | P2 SILENT_FAILURE_UI | **REFUTED** | POST advisors forced 500 → toasts [], inline error (storefront-panel-share-error) visible=true | [dir](storefront__storefront-panel-share/) |
| `inbox:button-report-thread` | P2 SILENT_FAILURE_UI | **CONFIRMED** | report forced 500 → toasts []; dialog still open=true | [dir](inbox__button-report-thread/) |
| `chat:send-message` | P1 DEAD_TRIGGER | **CONFIRMED** | NEW (U2): a first message from a storefront always 404s — resolvePublicConversationId (server/services/messages.service.ts:378-389) only matches threads that already have messages, so a started-but-empty conversation never resolves; toast "Message failed", tex | [dir](chat__first-message/) |
| `profile:button-save-profile` | P1 FALSE_PROMISE | **CONFIRMED** | toasts ["Photo updated Your profile photo has been updated.","Notification Photo updatedYour profile photo has been updated.","Profile updated Your profile has been saved successfully."]; image sent to server=false; after reload see after.png | [dir](profile__button-save-profile/) |
| `slip:button-slip-dates-save` | P2 SILENT_FAILURE_UI | **CONFIRMED** | PATCH trip forced 500 → toasts []; dialog still open=true | [dir](slip__button-slip-dates-save/) |
| `trip-card:button-delete-plan-x` | P2 INVISIBLE_RESULT | **CONFIRMED** | after delete the page is /trip/05623304-bcf0-4611-9663-c411c54e5b34 | [dir](trip-card__button-delete-plan-x/) |
| `ai-assistant:button-send-message` | P2 SILENT_FAILURE_UI | **CONFIRMED** | after a 500 from the provider: toasts [], inline error visible=false | [dir](ai-assistant__button-send-message/) |

## REFUTED (the static claim was wrong)

- **experiences:button-intake-create**, SILENT_FAILURE_UI: a forced-500 create shows "Error · Failed to create trip" through `useCreateTrip`'s own `onError` (`client/src/hooks/use-trips.ts:88-94`). The tracing pass read only the call site.
- **storefront:storefront-panel-share**, SILENT_FAILURE_UI: a forced-500 share renders the inline `storefront-panel-share-error` (`role="alert"`, `StorefrontBookingPanel.tsx:328-331`). The tracing pass missed the inline error.

## Closeout: the BLOCKED entries resolved

- **services:unified-request-booking** (INVISIBLE_RESULT P2, SILENT_FAILURE_UI P2): **CONFIRMED**. The first pass died on `page.goto(..., {waitUntil: "networkidle"})` after 30 s. The re-run (`u2d-closeout-probes.mjs`) uses `domcontentloaded` and a 90 s goto timeout. The partner catalog feed (`/api/catalog/activities-gyg`) is still empty with stub keys, so the re-run works as follows:
  - One card is rendered from a **fixture feed response** (`page.route`).
  - The card carries a **real vault token**, seeded into the table the vault reads (`travelpayouts_cache`, brand `affiliate-url-vault`, 1 h TTL).
  - The submit goes to the **real** booking-agent rail.

  Only the feed is simulated; the rail, the DB row and the toasts are real.
- **deals:book** (INVISIBLE_RESULT P2): **NOT PROVEN**. `GET /api/deals` returns `{"deals":[],"total":0}` locally, so there is no feed data and no card. The gap stays a static claim (see `ACTION_EFFECT_AUDIT.md` §NOT PROVEN #16). *Needs:* partner deal feeds.

## NEW finding surfaced by U2

- **chat:send-message**, DEAD_TRIGGER **P1**: storefront "Message" → `/chat` → the first send answers **404 "Conversation not found"**, and the UI shows "Message failed" with the text kept. `resolvePublicConversationId` (`server/services/messages.service.ts:378-389`) matches only threads that already have messages, so a conversation that was started but is still empty can never be addressed. A traveler cannot open contact with an earner from the storefront. Evidence: [chat__first-message](chat__first-message/).
