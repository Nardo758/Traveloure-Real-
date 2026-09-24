# H7: Trip query-key fragmentation

**Verdict: PROVEN.** Trip data is cached under more than 3 key shapes. The single-trip row alone has **3 read shapes**,
and no write invalidates all three. At least one consequence is proven in the browser (J1 R5).

**Evidence standard (R-4).**
- The key inventory below is a structural claim. It is established by citing every read and invalidation site,
  and it was cross-checked by hand at `curated-content-section.tsx:105`, `StorefrontBookingPanel.tsx:97`,
  `add-to-experience-dialog.tsx:179` and `itinerary-comparison.tsx:1184-1191`.
- The **consequence** ("a user sees stale data") is behaviourally proven only where a journey ran it. Those rows are
  marked ✅J. Every other staleness row is **static**. It is listed in [NOT PROVEN](#not-proven) until a journey runs it.

## How the keys resolve

`client/src/lib/queryClient.ts:44-71` sets the default queryFn. It joins the key segments with `/`, and a plain
object in position 2 becomes a query string. Defaults are **`staleTime: Infinity`** and
**`refetchOnWindowFocus:false`** (`:95-99`), so a key with no override refetches only when it is invalidated.

`invalidateQueries({queryKey:["/api/trips"]})` does a prefix match on the first element.
- It **does** reach `["/api/trips", id, …]`.
- It **does not** reach `["/api/trips/:id", id]`, `` [`/api/trips/${id}`] `` or any `` [`/api/trips/${id}/…`] ``.

## A. Key shapes for trip resources

| # | Key shape | Readers | Invalidated by | Resolves to |
|---|---|---|---|---|
| 1 | `["/api/trips"]` | `hooks/use-trips.ts:13` (My Plans `pages/my-trips.tsx:244`, Home `pages/dashboard.tsx:70`, `TravelPulseTicker.tsx:90`, `PastExperiencesScroll.tsx:5`); `curated-content-section.tsx:91`; `add-to-experience-dialog.tsx:142`; `travelpulse/CityGrid.tsx:127`; `pages/cart.tsx:882` (1h staleTime) | `use-trips.ts:82` (create), `:121` (update), `:145` (delete); `CityGrid.tsx:152`; `use-location-mismatch-gate.ts:210`; `add-to-experience-dialog.tsx:179`; `SavedTripsSection.tsx:67`; `ready-made-detail.tsx:260` | GET `/api/trips` |
| 2 | `["/api/trips/:id", id]`, a **literal pattern string** | `use-trips.ts:27` (`useTrip`): `SlipLogisticsSection.tsx:132`, `use-occasion-switches.ts:94` (→ SlipView, SlipRail, SlipLogisticsSection, plan-guests), `plan-guests.tsx:147`, `trip-details.tsx:91`, `discover.tsx:860`, `chat.tsx:573` | `use-trips.ts:122` (PATCH trip via `SetPlanDates.tsx:87`). `use-trips.ts:170` is unreachable (`useGenerateItinerary` has no callers) | Works only through its custom queryFn. A prefix invalidation of `["/api/trips"]` never reaches it |
| 3 | `["/api/trips", id]` | `trip/plan-modal.tsx:604`; `use-location-mismatch-gate.ts:119` | `CityGrid.tsx:151`; `use-location-mismatch-gate.ts:209`; the `["/api/trips"]` prefix | GET `/api/trips/:id` |
| 4 | `` [`/api/trips/${id}`] `` | `storefront/StorefrontBookingPanel.tsx:97` | **none** | GET `/api/trips/:id` |
| 5 | `` [`/api/trips/${id}/plancard`] `` | `PlanCard.tsx:774`, `PlanSlipStrip.tsx:32`, `itinerary-comparison.tsx:899`, `my-trips.tsx:86`, `slip-view.tsx:21` (all 30s); `trip-details.tsx:101` (**Infinity**) | Item, route, proposal and apply writes; `commitPlan` (`plan-modal.tsx:1134`) | plancard DTO (this DTO also carries the trip fields) |
| 6 | `` [`/api/trips/${id}/itinerary-items`] `` | `SlipItemTools.tsx:251`; `expert/workspace.tsx:2956` | About 20 sites after item writes (e.g. `SlipItemTools.tsx:46`, `discover.tsx:1316`, `service-detail.tsx:647`) | GET items |
| 7 | `["/api/trips", id, "itinerary-items"]` | **no reader** | `curated-content-section.tsx:105` | **phantom**: a different first element from #6 |
| 8 | `["/api/trips", id, "transport-legs"]` | `pages/itinerary.tsx:164`, an **unmounted page** | prefix only | legs |
| 9 | `` [`/api/trips/${id}/transport-legs`, {includeProposed:1}] `` | `expert/workspace.tsx:1514, :1994, :3001` | `workspace.tsx:2012, :3072` | legs |
| 10 | `["/api/itinerary", id, "transport-hub"]` | `TransportHub.tsx:140` (dead, see A5), `DayTransportPanel.tsx:171` | `DayTransportPanel.tsx:344`, `InlineTransportSelector.tsx:162`, `TransportBookingCard.tsx:361` | hub view |
| 11 | `` [`/api/trips/${id}/expert-advisor`] `` | 9 readers (`TripCardRail.tsx:292`, `PlanCard.tsx:379/785`, `SlipRail.tsx:1281`, `SlipView.tsx:773/1320`, `AssignExpertDialog.tsx:78`, `StorefrontBookingPanel.tsx:86`, `my-trips.tsx:90`) | `HireExpertDialog.tsx:138`, `AssignExpertDialog.tsx:150`, `StorefrontBookingPanel.tsx:176` | advisors |
| 12 | `["/api/trips/mine/advisors"]` | `chat.tsx:526` | **none** | advisors across all the user's plans |
| 13 | `["/api/user-experiences"]` | `SlipLogisticsSection.tsx:134`, `trip-strip.tsx:106`, `service-detail.tsx:503`, `experience-template.tsx:792`, `discover.tsx:864` | Event writes; `commitPlan` | events |
| 14 | `["/api/trip-context"]` | **no reader** (the pen uses raw `fetch`) | `plan-modal.tsx:1251` removeQueries | phantom |
| 15 | `` [`/api/trips/${id}/commission`] `` | **no reader** | `service-picker-modal.tsx:121`, `my-services-picker.tsx:107`, `workspace.tsx:3313` | phantom |

The following use a single shape and are not fragmented: guests, participants, suggestions, proposals, trip-pass,
anchors, generated-itineraries, saved-trips and cart. Their keys are in the agent report archived with this lane.

## B. Fragmentation groups (one server resource, several shapes)

| Resource | Shapes | What goes wrong |
|---|---|---|
| **Single trip row** | #2, #3, #4 (and the trip fields inside #5) | No write reaches all four. `useUpdateTrip` reaches #2 and #3 but **not** #5, which the slip reads. PUT destinations reaches #3 only. Nothing reaches #4. |
| Itinerary items | #6 and phantom #7 | The curated "Add to plan" (`curated-content-section.tsx:98`) invalidates only #7, so the slip's items stay stale. |
| Transport legs | #8, #9, #10, plus the plancard | Plancard-side leg writes (`TransportSection.tsx:85,409,421`; `ActivitiesSection.tsx:389`) invalidate the plancard only. |
| Advisors | #11 and #12 | No advisor write invalidates #12. |

**Count: 4 fragmentation groups over 11 key shapes, plus 3 phantom keys (#7, #14, #15).**

## C. Reads that a mint or update never invalidates

| Write | Site | Invalidates | Stale reads | Proof |
|---|---|---|---|---|
| Modal mint `mintTripSlip` | `PlanningContext.tsx:286` → `lib/trip-slip.ts:154` | nothing (then `commitPlan`: events, plancard, guests) | **#1 My Plans / Home**, cart:882, CityGrid, add-to-experience picker | **✅J** J1 R5 step 13 |
| Concierge mint | `concierge/index.tsx:262` | nothing | #1, #11, #13 | static |
| Experience-template mint | `experience-template.tsx:1622` | nothing | #1, #11, #13 | static |
| Quick-start mint | `quick-start-itinerary.tsx:219` | nothing | #1 | page is unmounted (Phase 0 §1c), so this is moot |
| Cart `convert-to-itinerary` | `cart.tsx:916-920` | `["/api/cart"]` | #1 (new trip); #5 and #6 (existing trip) | static |
| Cart `resolve-trip` | `cart.tsx:1423` | nothing | #1 | static |
| AI generate (EnhancedPlanningModal) | `EnhancedPlanningModal.tsx:324` | nothing | #1 | static, and the success path is NOT PROVEN (J1 §5) |
| Comparison auto-apply | `itinerary-comparison.tsx:1184-1191` | **nothing** | #1, #2, #5, #6 | static |
| Comparison manual apply | `itinerary-comparison.tsx:926-935` | #5 and the comparison | #1, #2, #6 | static |
| Guest trip claim | `GuestTripContext.tsx:57` | nothing | #1 | static (note that anonymous mints are refused by the server, `server/routes.ts:1401-1406`, so no guest trip can exist to claim) |
| PATCH trip dates | `SetPlanDates.tsx:108` → `use-trips.ts:121-122` | #1, #2, #3 | **#5, the slip's own dates** | static |
| PATCH occasion | `plan-modal.tsx:974` (fire-and-forget) | nothing (commit invalidates #5 possibly **before** the PATCH lands; see the code comment at `:1124-1126`) | #2 (`useOccasionSwitches`) | static |
| PUT destinations (modal) | `plan-modal.tsx:1104` → `plan-stops-writer.ts:54` | #5, guests, #13 | **#3, which the same modal reads** (`:604`); #2; #1 | static |
| DELETE trip | `PlanCard.tsx:762` → `use-trips.ts:145` | #1 (and #3 by prefix) | #2, #5, #11; the page stays on the deleted `/trip/:id` | static |
| Add from the city feed / wishlist dialog | `add-to-experience-dialog.tsx:162` → `:179` | #1 only | #5, #6 | static |
| Slip AI draft | `SlipRail.tsx:442` → `:463` | #5 | #6 | static |
| Ask-AI apply | `AskAiDrawer.tsx:273-274` | proposals, #5 | #6 | static |
| POST expert-requests with tripId | 6 sites (`concierge/index.tsx:266` …) | not #11 | #11, #12 | static |

**Unreachable invalidations:** `use-trips.ts:170-177` belongs to `useGenerateItinerary`, which has no call sites.

## NOT PROVEN

Every row marked "static" in C is a code-reading claim. Proving each one takes one journey step: perform the write,
navigate (client-side) to the reader, and compare the DOM against the DB. J1 R5 did exactly this for the
modal-mint → My Plans row.

Candidates for the next harness pass:
- dates PATCH → slip header;
- comparison auto-apply → My Plans;
- curated "Add to plan" → slip items;
- DELETE → Trip Card.
