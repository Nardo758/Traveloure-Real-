# Spec: Traveler action engine — draft Nov 13, 2026 (rev 3)

> **Status — 2026-11-15.** Revision 3 (Nov 13, 2026), written before the code. Since then, on `main`: **engine PR 1** (#2016) — `client/src/lib/action-engine.ts`, pure, table-tested, **called by nothing**; the Ask wording is approved and shipped as constants (#2016, `ask-expert-copy.ts`); **LL-1** (#2014, #2004) makes a plan row's Details open the stop's in-app page. The remaining §10 steps (tags on a payload; events; service detail; storefront; sheets; Ask chooser and item-menu trim) are **not started**. `plan-actions.ts` still decides what draws.

Status: draft for Leon / Coding Bot. Grounded in existing rulings plus Leon's Nov 13 answers (t1893s7879, t1893s7885). Audit of main `9364da41a`. No DB migration expected.
Related: `/workspace/specs/live-links.md` (LL-1).

## Grounding (already ruled)

| Ruling | What it requires of this engine |
|---|---|
| **R755 / row 302b** (#1805, ledger `2026-10-31-row302b-one-tile-action`) | Every compact bento tile draws **exactly one** primary, marked `data-bento-primary-action`. No second action on the compact tile. No "More info" on `/discover/location/kyoto`. Implemented as `PlanActions` `layout="primary"` + `planActionsPrimary`: Book, else Add (save), else Hire, else browse (`plan-actions.ts` 178–184; `PlanActions.tsx` 56–59, 143). The Arashiyama wanted tile may keep two cleared lines; a signed-in traveler on that tile has one. |
| **Cut-list #1, Nov 10–11** (R893 slice C, R894 strip) | One add action and one vocabulary (`AddToPlanButton` / `ADD_COPY`) across the discover/location feed, `/experiences`, and the planning surface. The **TripStrip** is THE plan chrome (sticky under the nav): plan label, dates / "Add dates", party, events, the one cart chip, signed-in Edit. The toast's "View plan" stays. Do not invent a second header CTA set. |
| **4+1 item ⋯ menus (planning surface)** | The same set on both ItemRow ⋯ menus (slip and board looks share `ItemRowMenuButton`). Pinned as the first five `ITEM_MENU_LABELS`: **Details, Swap, Move up, Move down** + **Remove** alone as the destructive +1 (`ItemRow.tsx` 367–372; `surface-step1.test.ts` 74). Plan-level ⋯ menus (Trip Card header vs `SlipPlanMenu`) are a different set (R786) and are out of this engine's per-item list. |
| **LL, Nov 13** | "Details" = in-app Traveloure page. "Official site" = outside link with icon. Experts get the same plus "Open plan". LL-1 emits no outside links from the plan. |
| **CAP-1, Nov 3 (R821)** | `GET /api/trips/:tripId/capabilities` exists on main (`server/routes/trip-capabilities.routes.ts` 85; `shared/trip-capabilities.ts`). Its `actions` table (`optimize`, `ask`, `handoff`, `handoffBook`, `checkout`, `tripPass`, `concierge`) already restates the gates. Plan-context features consume it, fail-closed, and do not re-derive money, handoff, or waitlist (`client/src/lib/trip-capabilities.ts`). Note: `actions.ask` is the **paid AI task**, not human "Ask an expert". |
| **Book / Hire / priced** | Book and Hire are open-mode only (`planActionsVisible`). No priced or provider-submitting control on the guest path or in waitlist mode, including signed-in waitlist viewers (R5-4 for "Ask · $2.99"; the same bar applies to "Ask this expert · from $n"). |
| **Leon, Nov 13 (t1893)** | Compact primaries: **Add** for gems / events / activities; **Book** for bookable hotels / vendors (Add on the sheet); unpriced **Ask an expert** or **View profile** for expert cards; **Details** for plan stops. Heart = Saved places for signed-in only; waitlist guests get Add, not a heart. **Share** may appear on cards as a **secondary icon**, never a second primary (302b). Human Ask is one button, **"Ask an expert"**, everywhere; tap opens a chooser (local expert vs the other expert kind). Unpriced on the guest / waitlist path. |

---

## Problem

Add, Ask, Details, Book/Hire, Save (heart), Share, and Official site are decided in different places, so labels and guest/waitlist rules drift. A July 2026 central CTA map (`resolveContentCTA`) was meant to be the single button author, but later layers (`buy-action.ts`, `PlanActions`, `ADD_COPY`) only partly compose it, and many surfaces bypass it.

## Goal

One shared **ContentItem** is produced once in the central content layer and shipped on the payload. One pure **`resolveActions(item, ctx)`** is the only author of which traveler actions draw, which one is primary, and which approved string key they use. Pages pass handlers and styles.

---

## 0. Central content network — produce the tags once

Traveloure already has a shared content system. The engine extends it; it does not start a parallel item model.

**Pipeline today**

1. **Registry / origin.** `content_registry` rows plus listings, gems, events, hotels, activities, affiliate products. Origin is `platform | affiliate | sourced` from content type (`shared/content-origin.ts` 17–33). Sourced / DMO content is expert-only and is excluded from traveler feeds (`content-query.service.ts` 23–25, 41).
2. **Sources.** `content_sources` is the one registry of who a source is (`server/services/content-sources.service.ts`; `shared/schema.ts` ~12771). Official sources carry `public_ok` (R-p, migration 341).
3. **Facts.** Every fact about a place is one `place_facts` row. `shared/content-facts.ts` is the one vocabulary and the one `isPublishable` / `isOfficialPublicFact` predicate (286–318): a crawled official fact is public only when the source is `official` and `public_ok` and the type is in the public set. Attribution is `publicFactAttribution`. Official-source reuse defaults to `link_only` (`shared/content-tiers.ts` 52–55).
4. **Adapters / feeds.** Location feed, catalogue (`catalogue-search.service.ts` joins `public_ok`), place-facts service, partner/Viator, supply caches. Each currently maps to a card payload in its own shape.
5. **CTA / buy.** `shared/content-cta.ts` (`CtaResolvableItem`, `resolveContentCTA`, ratified 2026-07-24) claims to be the single content-type → button map. `shared/buy-action.ts` composes it for partner rows (18–21, 189–194, 408–411) and authors listing Book/Request/Hire/Add. Client `PlanActions` / `ADD_COPY` then re-label and mode-gate.

**Item shape today.** `CtaResolvableItem` (`content-cta.ts` 57–68) has only `contentType`, `type`, `bookingType`, `hasPrice`, `informational`. It has no PlanItemRef, no official URL, no `public_ok`, no expert flag, no detail href. Placeability lives only in `planItemRefFromFeedItem` (`shared/plan-item-ref.ts` 19, 79–114). Fact publishability lives only in `content-facts.ts`.

**What changes.** A single shared normalizer (same module family: extend `content-cta.ts` or a sibling `content-item.ts` imported by server adapters and the client) emits a **ContentItem** on every traveler payload (feed card, catalogue row, detail, plan stop). Tags are derived at read time from facts already stored or already computed: `placeable` from `planItemRefFromFeedItem`, `bookable` / `priced` from `resolveBookability` + `resolveBuyAction` / `bookingType`, `officialUrl` + `publicOk` from the official `public_ok` source (or null), `detailHref` from the surface map, `origin` from `contentOriginFor`, `partnerSource` from the adapter. `hasExpert` is not a stored column; attach it at compose time from the existing `GET /api/expert-availability` answer for the item's city (or leave it for ctx if the feed does not already batch that read).

`resolveContentCTA` remains the buy/partner classification half (its kinds still feed `buy-action.ts`). It does **not** author traveler labels anymore — those come from `resolveActions` and the approved string tables. Stale labels in `resolveContentCTA` ("Add to cart", "Book Now", "View details", "Start planning") are not shipped to the UI.

**Gaps, no migration.** The layer already has origin, `public_ok`, official facts, bookability, and PlanItemRef. It lacks a single traveler ContentItem on feed payloads, a placeable/bookable/priced/hasExpert/detailHref bundle, and a consistent official URL field on every card (facts carry source URLs; cards often unwrap them ad hoc). Filling that is a derived payload, not a new column. Do not reopen held content-tier migrations 361/362. Caching `hasExpert` on a row is unnecessary. LL-3 link-health (a status column) is a separate go and is the only likely later migration.

CN-1 (concierge "Hire for this trip") is a **commerce** network, not this content layer. Its visibility on a plan is `actions.concierge` from CAP-1, not a ContentItem tag.

---

## 1. ContentItem

Produced once by the normalizer above. Not stored.

```ts
type ContentItemType =
  | PlanItemKind // gem | event | city_event | listing | affiliate_product | hotel | activity
  | "expert" | "ready_made" | "deal" | "viator" | "recommendation" | "blog" | "curated";

interface ContentItem {
  type: ContentItemType;
  id: string;
  title: string;
  city: string | null;
  origin: "platform" | "affiliate" | "sourced"; // sourced never on a traveler surface
  placeable: boolean;          // PlanItemRef can be built
  bookable: boolean;
  priced: boolean;             // a charge, quote, hire fee, or "from $n" is in an action
  hasExpert: boolean;          // availability yes for this city / addressed expert
  detailHref: string | null;   // in-app path
  officialUrl: string | null;  // stored official/source URL (places and events)
  publicOk: boolean | null;    // source public_ok; null = not an official-source row
  partnerSource: "none" | "viator" | "fever" | "deal" | "other";
  ref?: PlanItemRef | null;    // present iff placeable
  buyAction?: BuyAction | null; // listing/partner descriptor already on the payload
  shareUrl?: string | null;    // in-app canonical URL for the card Share icon
}
```

A card that cannot name a row (recommendation category, live Viator) is not placeable (Nov 5 ruling). Official site requires `officialUrl` and `publicOk !== false` for official sources; never on priced items or provider listings (LL-2).

---

## 2. Context

```ts
type SignupMode = "waitlist" | "open";
type ActionSurface = "card" | "detail" | "sheet" | "map" | "plan";
// card compact (bento) vs card-row is ctx.density

interface ActionContext {
  mode: SignupMode;                 // useSignupMode, fail-closed (unread ⇒ waitlist)
  signedIn: boolean;
  role?: string | null;
  knownDay?: number | null;         // useFeedAddDay; null ⇒ no "Add to Day {n}"
  surface: ActionSurface;
  density?: "compact" | "full";     // compact bento = 302b (one primary, no second control)
  alreadyOnPlan?: boolean;
  planId?: string | null;
  planCapabilities?: TripCapabilities | null; // required for surface=plan; unread ⇒ all paid actions hidden
  llOfficialSiteEnabled?: boolean;  // false in LL-1
}
```

---

## 3. resolveActions — exactly one primary

```ts
interface ResolvedActions {
  primary: ResolvedAction | null;     // exactly one, or null if nothing draws
  secondary: ResolvedAction[];        // not drawn on compact bento tiles (they belong on sheet/detail)
  itemMenu?: ItemMenuEntry[];         // surface=plan only: the 4+1 set
}

interface ResolvedAction {
  key: "add" | "ask_expert" | "details" | "book" | "hire" | "save" | "share" | "official_site" | "open_plan";
  labelKey: string;
  label: string;
  href?: string;
  external?: boolean;  // official_site only, and never when surface=plan in LL-1
  priced: boolean;
  primary: boolean;
}
```

**Primary by content type** (Leon, Nov 13; compact cards keep exactly one, R755):

| Type | Compact / card primary (open mode) | Waitlist / not bookable | Where Add lives if not primary |
|---|---|---|---|
| Gem, event, activity | **Add** | **Add** | — |
| Bookable hotel / vendor listing | **Book** | **Add** | Sheet / detail, secondary |
| Expert card | Unpriced **Ask an expert**, or **View profile** | Same (never a price) | n/a (not placeable) |
| Catalogue / partner row | **Book on partner** when open+bookable, else **Details** | **Details** | Sheet if placeable |
| Plan stop | **Details** | **Details** | Hidden when `alreadyOnPlan` |

Hire stays in the #1805 fallback only when Book and Add do not draw. On `surface=plan`, **Details** is always the primary when `detailHref` exists (LL-1). Experts reviewing a hired plan may have **Open plan** as a secondary, not a second primary on the stop.

Compact bento (`surface=card`, `density=compact`): render **only** `primary`. Mark it `data-bento-primary-action`. Do not draw secondary on the tile (R755) — including Share, which is a secondary icon. The sheet or detail draws Add / Ask / Save / Share as secondaries.

Full card, detail, sheet: primary + secondaries in order **Add, Ask an expert, Details, Book/Hire, Save, Share (icon), Official site** (Official site only when LL-2 is on and the official-site rule passes). Start-plan CTAs ("Plan around it", "Get this trip") stay caller-owned and are not in this list.

---

## 4. Rules (visibility)

| Action | Shows when | Hidden when | Guest / waitlist | Label |
|---|---|---|---|---|
| Add | `placeable` | `alreadyOnPlan` on plan or a detail opened from a plan; Viator / rec / deal / expert / ready-made | Waitlist signed-out: `runGuestAdd`. Open signed-out: sign-in, then picker / ref add | `addLabel({ dayNumber, added })` |
| Ask an expert (human) | `hasExpert`; card / detail / sheet (and plan sheets, not the 4+1 menu) | availability no/loading; never the AI bar | Button may show, **always unpriced**; press opens the chooser, then sign-in if needed; never starts a chat and never shows a price | **"Ask an expert"** only. Tap opens the §5 chooser. |
| Details | `detailHref` | — | Always, in-app | “Details” |
| Book / Hire / Request / Book on partner / Stay here | `bookable` and `mode === "open"` | waitlist; guest path; `surface=plan` | Hidden in waitlist. Open-mode guest may see the control; any provider-submitting press still uses existing sign-in gates | `bookLabel` / `hireCta` |
| Save (heart) | signed-in and type ∈ {gem, hotel, activity, service} | waitlist guests (their write is Add); not a second Add | Open guest: sign-in. Signed-in: `/api/saved-items` only | “Save” / “Saved” — not ADD_COPY |
| Share | `shareUrl` (or the surface canonical URL) on full card / detail / sheet | compact bento (secondary, so 302b forbids it on the tile); not in the 4+1 menu | Allowed | Icon; aria **“Share”** (reuse the short plan-hero label). Plan-level “Share link” / “Share page” / “Share my plan” stay plan chrome. |
| Official site | `officialUrl` and place/event; not priced; not a listing; `publicOk !== false`; LL-2 flag | `surface=plan` in LL-1 | Allowed on detail in LL-2 only | “Official site” |
| Open plan | expert role, hired/reviewing this plan, `surface=plan` | travelers | n/a | “Open plan” |
| Ask · $2.99 (AI) | **Not an output of this function.** `AskAiDrawer` reads `askShown(planCapabilities)` and hides entirely when `mode === "waitlist"` (R5-4), including signed-in | | | existing ASK_AI_COPY |

### Guardrails

1. No priced or provider-submitting control (Book, Hire, Request, deals, Viator book, spontaneous partner book, “Ask · $2.99”, “Ask this expert · from $n”, “Book this for me”) on the guest path or in waitlist mode, including signed-in waitlist viewers.
2. Book / Hire / Viator / deals: open mode only.
3. Every successful add goes through `plan-add-runner` and `PlanAddFeedbackHost` at `PLAN_ADD_TOAST_MS` (8000), with Undo / Change day / View plan.
4. A start-plan CTA is not an add.
5. Clients never send title, coordinates, or a URL on a PlanItemRef (ruling 4).
6. Compact bento never draws a second action (R755). Do not “fix” compact vendor tiles by switching them to a two-button row; Add belongs on the sheet as a secondary. Share is never a second primary.

---

## 5. Ask chooser (human) — local vs the other expert kind

One traveler button, everywhere: **"Ask an expert"**. Tapping it opens a two-option chooser, then the chosen rail. This is not `actions.ask` (CAP-1 AI) and not "Ask · $2.99".

### Draft strings (stamp before ship)

| Slot | Draft | Source |
|---|---|---|
| Dialog title | Ask an expert | Reuse (feed / discover button) |
| Option A | Ask a local | Reuse (`ExpertDoor.tsx` 295 title) |
| Option B | Ask a trip planner | **NEW** — the accurate type name (`travel_expert` title in `travel-experts.tsx` 232–237 is "Trip Planner", but not yet an Ask verb). Alternative if Leon prefers his words: **Ask a regular expert** (also **NEW**). |

### What the types are in code today

Expert-family stored roles are `expert | local_expert | travel_expert | event_planner` (`shared/roles.ts` 6, 27). `executive_assistant` is not expert-family.

- **Local expert** is real: role `local_expert`; Local Expert Application at `/become-expert?type=local_expert`, title "Local Expert" (`client/src/pages/travel-experts.tsx` 222–237). City-scoped (`shared/models/auth.ts` 19).
- **"Regular expert" is not a string or a type.** Closest map: **`travel_expert`** (title "Trip Planner", default become-expert type) plus the **legacy** role `expert`, which "maps to travel_expert" (`shared/models/auth.ts` 23) and is folded into the Trip Planners browse lane when `GET /api/experts?role=travel_expert` (`server/routes.ts` 5617–5623). There is no generic-expert tab.
- **Event planner** (`event_planner`) is a third application track. It has no slot in a two-option chooser.
- **WL-B** (R741, ledger `2026-10-30-wlb-provider-signup-gate`): waitlist applicants use one role `"expert"` (`WAITLIST_ROLES` in `shared/launch-waitlist.ts` 9–12). That is a **waitlist row**, not a live `users.role`. Expert account sign-up is refused before launch; they apply on `/waitlist/kyoto#experts`. They are not directory-routable until a typed become-expert application is approved.

### Can both kinds be routed today?

Partly, with no traveler chooser.

- `GET /api/experts` already accepts `?role=` and `?location=` (`server/routes.ts` 5604–5624). `role=local_expert` vs `role=travel_expert` (the latter includes legacy `expert`) is enough to split the directory. **No migration.**
- `useAskExpert` (`client/src/lib/use-ask-expert.ts`) does not take a role preference. City fallback silently prefers `e.role === "local_expert"`, else the first city match (76–79). Addressed path (handle / serviceId / bookingId / tripId) starts a conversation with one person and should stay a skip-the-chooser path when the card already names that person.
- Plan "Ask a local about this" is a **different rail**: ExpertDoor / saved `expert_interest` question / advisor thread (`client/src/lib/item-row-menu.ts` 59–77; `SlipView.tsx` askLocal). Not a typed directory pick. Option A on a plan sheet may keep opening that rail; Option B should not.
- Blog "Ask the local" is byline-addressed (Lane C ruling 7) — an addressed path, not the chooser.
- Discover "Ask an expert" currently goes to `/services?showExperts=` (`discover.tsx` 717–720) and bypasses both rails.

**Gaps, no DB migration.** Teach `useAskExpert` a role preference and pass it to `?role=`. Hide or honestly empty an option when that kind is not live (reuse `ASK_LOCAL_WORDS` for a missing local; a trip-planner empty line would be NEW). Do not invent a `regular_expert` column. Leave event planners out of v1 unless Leon adds a third option. WL-B untyped waitlist rows are not chooser targets.

**Retired traveler labels** (stop shipping; keep internal `ASK_LOCAL_WORDS` prompts until restamped): “Ask this expert”; “Ask {name}”; “Ask the local”; “Ask a local about this” as a button or ⋯ entry (already out of the 4+1 menu). “Ask · $2.99” stays the AI bar.

---

## 6. Absorbing LL-1

- **Details** is `detailHref`, with plan state when opened from a stop (“On Day {n}” + back-to-plan — stamp if new; reuse if an approved string exists).
- **Official site** is defined so LL-2 can enable it. `resolveActions` must not emit it for `surface=plan` in LL-1.
- Collision: slip `ITEM_MENU_LABELS.details` currently opens `ItemSheet` (`ItemRow.tsx` 368, 414–415; `plancard/SlipView.tsx` 947, 1017). LL-1 retargets **Details** (menu and the stop's primary) to `detailHref`. ItemSheet stays behind **Edit** (already in the menu labels) or a metadata control. Do not invent a second “Details”.
- Experts: same Details links + “Open plan”. No Official site in LL-1.

---

## 7. Cut-list #1 alignment (feed, TripStrip, slip)

The engine does not put per-item buttons on the TripStrip. It guarantees the **same add vocabulary** wherever an item is added (feed, experiences, map, slip “+ Add to this day” toast), and the strip remains the one plan surface (R894): label, dates, Edit, cart. “View plan” lives on the add toast, not as a second nav chip. Plan-level Share stays on plan chrome; card Share is the §4 secondary icon only.

---

## 8. CAP-1 on the planning surface

For `surface=plan` (and plan-scoped sheets), `resolveActions` and plan chrome read `ctx.planCapabilities` and do not re-state gates:

- AI Ask door: `askShown` (`actions.ask` is free / pay / verify). Hidden on waitlist and when the payload is “no”.
- “Book this for me”: `handoffBookShown`.
- Optimize / Build-around: `optimizeShown`.
- Checkout / payment bar: `paidActionsShown` (`actions.checkout`).
- Concierge hire / task log: `conciergeShown`.
- Trip Pass face: `tripPassCardView`.

Unread, error, or `"waitlist"` / `"no"` ⇒ hide (fail-closed). `"verify"` keeps the control; the existing verify prompt runs on press.

Human “Ask an expert” is **not** `actions.ask`. It stays out of the item ⋯ menu (4+1). On a plan sheet it may appear as the §5 button; Option A may open the existing local-ask / ExpertDoor rail.

---

## 9. Planning-surface ⋯ menus (4+1)

Both ItemRow ⋯ menus (slip and board) render the same set, in this order:

1. Details (LL-1: `detailHref`)
2. Swap
3. Move up
4. Move down
5. **Remove** (destructive, alone — separator before it)

No Lock, Ask a local, Find a host, Build around, Set as stay, Share, or “Book this for me” in this overflow (those are either CAP-1 plan chrome, the sheet / card secondaries, or a later Leon decision). Today's slip wiring adds several of those (`plancard/SlipView.tsx` 953–968) and must be brought back to this set.

---

## 10. Migration (small PRs, Leon's go to merge)

1. **Normalizer + `resolveActions` + table tests only.** Ship ContentItem on one adapter (e.g. location feed or catalogue) without changing UI. tsc stays at 103.
2. **Events** (highest add gap): calendar, event detail, landing strip — Add beside “Plan around it”.
3. **Service detail:** waitlist guests use `runGuestAdd`; signed-in adds use `announceTripAdd`; swap `buy-action.ts` “Save to plan” to `ADD_COPY.addToPlan`.
4. **Storefront** offerings: wire Add when placeable.
5. **Sheets (not compact tiles):** gem/hotel/activity sheets get PlanActions Add, like the event sheet. Compact vendor tiles keep one primary (Book when bookable); Add and Share are on the sheet / full card.
6. **Ask chooser** after the Option B wording stamp: one “Ask an expert” label; `useAskExpert` role preference; retire the old Ask labels. Then slip toast / LL-1 Details retarget / 4+1 trim.

Do not enable Official site on plan stops until LL-2. Do not extend guest Book/Hire. No schema change for the chooser or for ContentItem tags.

---

## 11. Tests

Unit table over the normalizer and `resolveActions`: `{ item, ctx } → primary.key + secondary keys + priced flags + itemMenu`. Cover at least:

- Compact gem, waitlist guest: primary Add; no Book; no Share on the tile; no second compact control.
- Compact bookable hotel/vendor, open mode: primary Book; Add and Share are secondary, not on the tile.
- Same listing, waitlist: primary Add; no Book/Hire; no “from $n”.
- Compact expert: primary unpriced “Ask an expert” (or View profile); never “from $n”.
- Event detail with an existing plan: Add in secondaries; “Plan around it” is not in the list.
- Viator / recommendation: no Add.
- `alreadyOnPlan` from a plan: no Add; no priced actions; primary Details.
- `surface=plan`: primary Details; itemMenu is exactly the 4+1 set; no Official site in LL-1; no AI Ask and no Share in the overflow.
- R5-4: waitlist signed-in receives no `priced: true` action, including Ask.
- Official site: emitted only with `officialUrl`, `publicOk !== false`, LL-2, not on listings or plan stops.
- Share: present as secondary on a full card with `shareUrl`; absent on compact.

---

## 12. New strings that need “Wording approved — Leon”

Reuse: ADD_COPY; “Details”; “Official site”; “Open plan”; `PLAN_ACTIONS_COPY` book/hire; **“Ask an expert”** (the one button and the chooser title); **“Ask a local”** (chooser Option A); “View profile”; “Save” / “Saved”; “Share” (icon aria, from the plan hero); “Share page” / “Share my plan” / “Share link” (plan chrome only); “Message”; “Contact Provider”; “Navigate”; “Plan around it”; “Get this trip”; “Edit”; “Swap”; “Move up”; “Move down”; “Remove”.

**NEW — stamp before ship:**

- Chooser Option B: **“Ask a trip planner”** (recommended) or **“Ask a regular expert”** if Leon wants that wording.
- A trip-planner empty state if Option B is shown when none are live (the local empty copy already exists in `ASK_LOCAL_WORDS`).
- LL-1 “On Day {n}” and back-to-plan unless reused; “Directions” (today is “Navigate” or a bare maps link); catalogue HELD `searching` / `searchFailed`, and an explicit stamp if “Official site” replaces `[HELD for Leon]` on catalogue. Emit “Details”, not HELD “More info”.

**Retired** as traveler-facing Ask labels: “Ask this expert”; “Ask {name}”; “Ask the local”; “Ask a local about this” on buttons / menus.

---

## 13. Decisions recorded / still open

**Decided (Leon, Nov 13).** Primary per type as in §3. Heart = Saved places for signed-in only; waitlist guests get Add. Share on cards as a secondary icon, never a second primary. One “Ask an expert” button; tap opens the local vs other-kind chooser; unpriced on guest/waitlist.

**Still open.**

1. **Option B wording.** Recommendation: **“Ask a trip planner”**, because that is the live `travel_expert` title. “Regular expert” does not exist in code (see §5).
2. **Event planners** in the chooser? Recommendation: **not in v1** (no third option until Leon asks).
3. **Addressed expert cards / blog byline.** Recommendation: skip the chooser and start the addressed thread, still labelled “Ask an expert”.

---

## 14. Out of scope for v1

Navigate/Maps, start-plan CTAs, expert recruitment, admin/provider tools, LL-3 link-health, CN-1 product work beyond reading `actions.concierge`, a `regular_expert` role or waitlist-type backfill.
