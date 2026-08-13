# Provider console — the remaining tabs, assessed while running a business through them

**As-of SHA:** `f747d0a` (branch `lane/provider-batch-exercise`, = `d1671b1` + a merge of `origin/main@0f54f6d`
so the assessment runs against **current main** including the FP-1 defect pack; doc/asset commits only,
zero product-code changes). **Run date:** Aug 13, 2026. **Assets:** `docs/testing/assets/console-tabs/`.

This extends `docs/testing/PROVIDER_BATCH_EXERCISE.md` (as-of `127ffb5`), which built a twelve-listing Kyoto
catalog through the real console but assessed only the **authoring** surfaces. The eight tabs that exercise
never opened are assessed here — **Today, Calendar, Inbox, Customers, Performance (all four sub-tabs incl.
link analytics), Money, Settings (profile + storefront), Playbook** — plus the **notification affordances in
the shared console chrome**, which no exercise has ever assessed.

The batch catalog survived the container restart intact, so nothing was rebuilt. Real activity was generated
through real rails to light the tabs up: a traveler put the food walk through the actual cart and checkout, a
traveler sent a real inquiry, and two tracked short links were clicked. **No direct-DB fixture surgery of any
kind was performed** — every row below was created by driving the UI. DB reads are verification only.

---

## 0. Environment and identity

| Item | Value |
|---|---|
| Database | **`traveloure_batch`** (`postgres://postgres:postgres@localhost:5432/traveloure_batch`) — the batch exercise's DB, found intact after the restart: 50 `provider_services`, 71 `vendor_availability_slots`, the provider account and both short links all present. |
| Server | `PORT=5001`, `NODE_ENV=development`, `OBJECT_STORAGE_DRIVER=memory`, `RATE_LIMIT_LOOPBACK_SKIP=1`, `STRIPE_SECRET_KEY=sk_test_dummy`. Boot applied **1 new migration** (`208_fp1_console_defect_data_repairs.sql`) — `[Migrations] Done — 1 newly applied, 208 already recorded, 209/209 total`. |
| Provider | `batch-provider-1@traveloure.test` / `BatchPass123!` (Haruka Ishikawa, `82373a50-ccc4-453c-804b-5b93d886bb7a`) — **unchanged, no recreation needed**. |
| Traveler | `test-traveler-kyoto@traveloure.test` / `TestPass123!` (boot-seeded, `83287ec2-061d-4786-a134-bd8040b1a9e6`). |
| Browser | Chromium `/opt/pw-browsers/chromium-1194`, **1920×1080** desktop pass and **390×844** phone pass per tab. |

**Fixture recreation: none required.** The dispatch anticipated a wiped bench; the DB was found whole.

**FP-1 confirmed live in passing.** The storefront now renders the two machiya rooms as **"In-person"** and the
mixed bundle as **"Hybrid"** rather than "PDF guide" (batch finding B2), and no location chip reads "Unknown"
(B3). Those are closed, not re-investigated.

---

## 1. Activity-generation log — what was driven, and exactly where each rail stopped

| # | Rail | Driven through | Result | Stopped where |
|---|---|---|---|---|
| **1** | Tracked short links | anonymous `GET /r/4pe1tdjh`, `GET /r/5nwr6ub6` | **302 → `/services/…?ref=…`**, `short_links.clicks` **2 → 3** on both rows | **Completed.** Surfaced on Performance → Analytics and on Money → Link Performance (see P+4). |
| **2** | Add to cart | traveler on `/services/d950bbd2…` → **Add to Cart** | `POST /api/cart → 201`; cart holds 1 item | **Completed.** |
| **3** | Cart → payment step | `/cart` → **Proceed to Payment** | Order review renders **$95.00 subtotal · $11.40 platform fee · $106.40 total** (11.40/95 = 0.12 = the `limited` band on the DB row — the console arithmetic matches DB truth) | **Completed.** |
| **4** | **Checkout** | **Complete Booking** | **`POST /api/checkout → 503 payment_unavailable`** — `"We couldn't reach our payment provider, so nothing was charged and nothing was booked. Your cart is exactly as you left it — please try again."` | **Stopped at the Stripe boundary** (`sk_test_dummy`). This is the honest end of the rail on this bench — and the resulting §15b state is itself assessed below. |
| **5** | Traveler inquiry — **storefront CTA** | `/p/machiya-miyako-kyoto` → **Message** → `/chat?expertId=…&name=…` → composer → Send | `POST /api/chats → 201`, `user_and_expert_chats` row `0f5e568f…` (`TRV-202608-00010`) | **Completed.** Lands in provider Inbox → Messages (P+3). |
| **6** | Traveler inquiry — **service-detail CTA** | `/services/…` → **Contact Provider** | Lands on a generic expert directory with **no composer and no Haruka** | **Dead end — finding I3.** |
| **7** | Settings → storefront round-trip | Settings → Profile → **Edit About** → save → reload → public storefront | Edited bio persisted through reload and appears **verbatim** on `/p/machiya-miyako-kyoto` | **Completed** (P+5). |
| **8** | Settings → Settings save | 9 switches / 3 numeric inputs → **Save All Settings** | `PATCH /api/provider/settings → 200`; `provider_settings` row created, `instant_booking=t`, `minimum_payout_amount=250.00` | **Completed as a WRITE** — and nothing on the platform ever reads it (finding **S1**). |
| **9** | Payout request | Money → Payout Information | **Button disabled**, "Minimum payout is $10.00." | **Stopped honestly at zero balance.** A non-zero balance needs a *completed* booking, which needs a real charge — unreachable under the stub without DB surgery, which was declined. |
| **10** | Reviews | — | Not drivable: reviews hang off completed bookings | **Stopped**; the empty state was assessed instead (P+6). |

**The §15b claim left behind by #4 is the single most useful artifact of this run.** `POST /api/checkout` wrote its
provisional claim *before* calling Stripe, Stripe failed, and the row is still sitting there — a
`payment_pending` booking with `stripe_payment_intent_id IS NULL`, i.e. an **unauthorized claim by
construction**. Six console surfaces read that row and **five of them disagree about what it means**. That is
what §3–§6 below are mostly about.

---

## 2. Width inventory at 1920 (for the parallel width lane)

Viewport 1920; the sidebar takes 220px, so **`main` is 1700px wide** on every tab. "Stretches" = the page's
content container has no `max-w-*` and fills all 1700px.

| Tab | Route | Root container | Content width @1920 | Verdict | 1920 shot | 390 shot |
|---|---|---|---|---|---|---|
| **Today** | `/provider/dashboard` | `p-5 space-y-3` | **1700** | **STRETCHES** | `w-today-1920.png` | `w-today-390.png` |
| **Calendar** | `/provider/calendar` | `p-6 max-w-6xl mx-auto` | 1152 | contained, centred | `w-calendar-1920.png` | `w-calendar-390.png` |
| **Inbox** | `/provider/inbox` | `p-6 max-w-4xl mx-auto` | 896 | contained, centred | `w-inbox-1920.png` | `w-inbox-390.png` |
| **Customers** | `/provider/customers` | `p-6 max-w-4xl mx-auto` | 896 | contained, centred | `w-customers-1920.png` | `w-customers-390.png` |
| **Performance** (Overview) | `/provider/performance` | `p-6 space-y-6` | **1700** | **STRETCHES** | `w-performance-1920.png` | `w-performance-390.png` |
| **Performance** (Analytics) | `?tab=analytics` | same | **1700** | **STRETCHES** | `w-performance-analytics-1920.png` | `w-perf-analytics-390.png` |
| **Money** | `/provider/money` | `p-6 space-y-6` | **1700** | **STRETCHES** | `w-money-1920.png` | `w-money-390.png` |
| **Settings** | `/provider/settings` | `p-6 space-y-6 max-w-4xl` — **no `mx-auto`** | 896, **hugging the left edge** | contained but **off-centre**: ~800px of dead gutter on the right | `w-settings-1920.png` | `w-settings-390.png` |
| **Playbook** | `/provider/playbook` | `p-6 space-y-6` | **1700** | **STRETCHES** | `w-resources-1920.png` | `w-playbook-390.png` |

**Summary: 5 of 9 stretch unbounded** (Today, Performance ×2 tabs, Money, Playbook), **3 contain and centre**
(Calendar 1152, Inbox 896, Customers 896), **1 contains but does not centre** (Settings — the worst-looking of
the nine at 1920, because the eye reads the dead right gutter as a broken layout rather than a wide one).

**Outside this exercise's scope but sharing the same root container** (verified by reading the files, not by
measurement, so treat as a pointer not a measurement): **Catalog** (`/provider/services`), **Workstation** and
**Distribute** are all `p-6 space-y-6` with no `max-w-*` — i.e. the same STRETCHES class. That makes it 8 of the
12 provider routes.

**Note for the width lane:** a lane already in flight (FP-4, seen in a sibling working tree) has begun
normalising this — its `settings.tsx` already drops the bare `max-w-4xl` in favour of a shared centred
container, with a comment naming exactly the lopsided-gutter symptom recorded above. This inventory is the
map of what is left.

**Phone pass — clean sweep, no exceptions.** All nine tabs at 390×844 report
`documentElement.scrollWidth == clientWidth == 390` and `body.scrollWidth == 390`: **zero horizontal overflow
anywhere.** (`phone.log`; matches the batch exercise's P+9 for the traveler surfaces.) This is a genuine
strength and worth protecting through the width work.

---

## 3. Findings — severity ordered

FEATURE = is what I need here at all · LOGIC = does it behave correctly · WORKFLOW = does the sequence make
sense. Every row has a screenshot.

### P0

**None.** Nothing on these eight tabs makes a provider quit or lose money outright. The money-shaped findings
below are all **reporting** defects over a correct ledger — the actual escrow ledger, the payout gate and the
claim machine were right every time they were checked.

### P1

| # | Tab | Kind | Finding | Expected vs actual | Shot |
|---|---|---|---|---|---|
| **M1** | **Money** | **LOGIC** | **One page gives four different answers about the same never-charged booking.** The `payment_pending` claim (nothing charged, no PaymentIntent) is counted as earnings by two of the page's five aggregations because they carry **no status filter at all**: `revenueBreakdown` (`earnings.tsx:477`) sums `totalAmount`/`platformFee`/`providerEarnings` over **every** row, and `GET /api/me/earnings-by-source` (`short-links.routes.ts:446`) groups **every** row. So the page renders, simultaneously: headline **Total Earnings $0.00 / Pending $0.00 / Available $0.00**; **Revenue Share Breakdown — Gross Booking Value $95.00, Platform Fee (12%) −$11.40, Your Share (88%) $83.60 labelled "Your lifetime earnings", "Your net earnings" $83.60**; **Earnings by Source — Direct, 1 booking, $95.00**; **Recent Transactions — none**; **Earnings Ledger — Total earned $0.00**; **Payout History — none**. The rate itself is honestly derived (`share/gross`, no literal — §8-clean); it is the **amount** that is wrong. | Expected: a booking that has not been paid contributes $0 to anything labelled *earnings*, or is shown with the "pending payment" qualifier Customers already uses. Actual: $83.60 of "lifetime earnings" a provider could take to their accountant, beside a ledger that says $0.00. | `f-money-four-answers.png` |
| **M2** | **Money / Performance** | **LOGIC** | **Same missing predicate, latent in a second panel.** `GET /api/me/link-analytics` aggregates its `bookings`/`revenue` per share-link over `service_bookings` with **no status filter either** (`short-links.routes.ts:330`). It read $0 here only because this claim's `source` is `direct` and its `acquisition_ref` is NULL, so it landed in no link bucket. A checkout that fails the same way *after* a tracked-link click will report unpaid revenue against that link — which is the number a provider would use to decide where to spend. Filed beside M1 because it is one fix, not two. | Expected: attributed revenue counts money that exists. Actual: the predicate that would ensure that is absent. | code (`short-links.routes.ts:330–344`) |
| **I1** | **Inbox** | **LOGIC / WORKFLOW** | **The Inbox says "1 Pending" and "No bookings waiting" at the same time, and the row it is counting cannot be displayed anywhere on the page.** `StatsRow` deliberately folds `payment_pending` into the Pending tile (its L10b comment says so, so that Total = the sum of the tiles), but `QueueSection`'s list filters `status === "pending"` **only**, and History renders confirmed/completed only. The exclusion from the queue is *correct* — a provider must not be able to Accept an unauthorised claim (§18b) — so the tile is the half that is wrong. | Expected: the tile counts what the page can show, or the claim gets an honest "awaiting the traveler's payment — nothing for you to do" row. Actual: a number with no row behind it, on the page whose subtitle is *"Everything that needs your response"*. | `f-inbox-pending-1-but-none-waiting.png` |
| **X1** | **Today / Inbox / Customers** | **LOGIC** | **Three tabs, three different answers about one booking.** Today: **PENDING BOOKINGS 0** and **Action Items (0)** (`/api/provider/analytics/dashboard` and a `status === "pending"` client filter). Inbox: **1 Pending** (I1). Customers: **"1 booking (1 pending payment)"** — the only correct one. Each page picked its own predicate for the same `service_bookings` row. A provider comparing two tabs cannot tell which is lying. | Expected: one shared predicate, or three labels that each say which subset they mean. Actual: 0 / 1 / "1 pending payment". | `f-today-post-activity.png`, `f-inbox-pending-1-but-none-waiting.png`, `f-customers-expanded-payment-pending.png` |
| **N1** | **Chrome (all consoles)** | **FEATURE / LOGIC** | **The notification bell's red dot is hardcoded and always lit.** `backoffice-shell.tsx:90` renders `<span className="absolute … bg-[#E85D55] rounded-full" />` unconditionally — no count, no query, no condition. It is on for every provider on every page forever, including a brand-new account with nothing at all, so it carries **zero information** and can never signal a real event. Because it lives on the **shared** `BackofficeShell`, it is the provider, expert **and** EA consoles. The bell links to `/provider/inbox`, which has no updates lane — so it promises a notification centre and delivers a booking queue. | Expected: an indicator driven by something, or no indicator. Actual: a permanent alarm. | `f-inbox-pending-1-but-none-waiting.png` (top-right), every 1920 shot |
| **S1** | **Settings → Settings** | **FEATURE / LOGIC** | **Twelve controls that persist perfectly and are read by nothing.** Business Preferences (Instant Booking, Auto-Response, Minimum Lead Time, Target Response Time), Notification Preferences (6 toggles) and Payment Settings (Payout Frequency, Minimum Payout Amount) all round-trip correctly — I flipped Instant Booking on and set Minimum Payout to 250, saved, and `provider_settings` now holds `instant_booking=t, minimum_payout_amount=250.00`. But the whole table is a closed loop: `providerSettings` is touched **only** by `getProviderSettings`/`upsertProviderSettings` in `storage.ts`, which are called **only** by the GET and PATCH in `provider.routes.ts`, which are called **only** by `settings.tsx`. Nothing anywhere reads `autoResponse`, `minimumLeadTimeDays`, `targetResponseTimeHours`, `payoutFrequency`, `minimumPayoutAmount` or `notificationsJson`. Empirically confirmed on two of them in this run: **`autoResponse: true` produced no auto-response** to the real inquiry I sent (`user_and_expert_chats` holds exactly one row, the traveler's), and **`notificationsJson.messages: true` produced no notification of any kind**. `instantBooking` is worse than unread — a real consumer exists at `routes.ts:2288` but it reads a **different column**, `service_provider_forms.instantBooking`, so the toggle on this page writes the twin nobody looks at. This is the same page that explicitly **deleted** its Change-Password/2FA card because "the buttons had nothing behind them"; twelve controls with nothing behind them survived that audit. (Vacation Mode, on the same page, is **not** in this class — it writes `/api/me/vacation` and is genuinely enforced server-side.) | Expected: a saved preference changes platform behaviour, or is not offered. Actual: a faithful write to a table nothing reads. | `w-settings-1920.png`, `setsave.log` |
| **S2** | **Settings ↔ Money** | **LOGIC** | **Two different payout minimums, and the provider's own is the one ignored.** Settings offers **"Minimum Payout Amount $"** (default 100; I set 250 and it saved). Money hardcodes `stats.available < 10` and prints **"Minimum payout is $10.00."**; the server independently enforces `MIN_PAYOUT_CENTS = 1000` (`server/config/payout.config.ts:12`). The provider-set figure is consulted by neither. A provider who sets 250 to batch their payouts will be offered a payout at 10 and never learn why. | Expected: one minimum — either the platform floor, stated once, or the platform floor plus a provider preference that actually gates. Actual: a settable number with no effect and a second number that governs. | `w-settings-1920.png`, `f-money-four-answers.png` |
| **I3** | **Service detail → Inbox Messages** | **WORKFLOW** | **"Contact Provider" is a dead end — the only entry point on the listing a traveler is actually reading.** `service-detail.tsx:1123` links to `/chat?provider=<userId>`, but `chat.tsx` reads `expertId`, `clientId`, `about`, `name` and `avatar` — **never `provider`**. The traveler lands on "Expert Chat — Connect with local experts for your trips", a directory of four seeded experts in Lisbon, Tokyo, Rome and San Jose, **no Haruka, and no composer at all**. The rail itself works fine: the storefront's Message CTA passes `expertId` + `name` (the documented provider-role fallback) and delivered my inquiry in one pass. So one entry point works and the more prominent one is inert — which is why a provider's Inbox → Messages tab can look permanently empty while travelers are trying to reach them. | Expected: Contact Provider opens a composer addressed to that provider. Actual: an expert directory that does not contain them. | `f-contact-provider-dead-param.png` vs `a-storefront-message-composer.png` |

### P2

| # | Tab | Kind | Finding | Expected vs actual | Shot |
|---|---|---|---|---|---|
| **A1** | **Performance → Analytics** | **LOGIC** | **The revenue chart cannot draw a zero.** `analytics.tsx:160` computes `height: (month.revenue / Math.max(...allRevenues)) * 100%` with `minHeight: "20px"`. With every month at $0 that is `0/0` → **`NaN%`** (invalid, ignored) and the 20px floor paints **six identical visible blue bars** for six months of no revenue. Even with real data the floor makes an empty month look like a small one. The Overview tab shows the same series honestly as text ("Mar $0 · 0 bookings"). | Expected: a zero month renders as no bar. Actual: six bars that read as six months of trading. | `f-performance-analytics.png` |
| **A2** | **Performance → Analytics** | **LOGIC** | **"Market Opportunities: Create your first service to receive market opportunity recommendations."** — shown to a provider with **12 listings, 11 approved and active**. `GET /api/recommendations/provider` returns `{"recommendations":[],"location":"Unknown"}` with no `message`, so the client falls back to a hardcoded first-run string. The `location: "Unknown"` is the tell: the engine cannot place this provider, so it has nothing to say — and says something false instead of saying that. | Expected: "we can't place your business yet" / "no gaps found in Kyoto". Actual: a statement the provider can see is untrue, which discredits the panel. | `f-performance-analytics.png` |
| **P1w** | **Settings → Profile** | **LOGIC** | **The approved business name exists and no surface reads it.** `profile.tsx:116–123` builds `businessInfo` from `user.businessName / businessType / address / phone / website / amenities / capacities`; **`users` has none of those columns** — only `bio` and `profile_image_url` (verified against the live schema). *The **edit** half of this is deliberate and documented and should not be re-litigated*: the file's own header records that six Edit/Manage buttons were removed precisely because those fields have no backing rail ("honest absence beats dead chrome"). What survived is the **display** half — the header renders the fallback, the person's name **"Haruka Ishikawa"**, under `data-testid="text-business-name"`, and the type as the generic **"Service Provider"** — while the real, admin-approved values sit one table over in `service_provider_forms` (**"Machiya & Miyako Experiences" / "Sole Proprietorship"**) and are read by neither the console nor the **public storefront**, which shows the person's name too. Reading one existing column would fix both surfaces without inventing a field. | Expected: the approved business name on the profile and the storefront. Actual: it appears nowhere the owner or a traveler can see. | `f-settings-profile-person-not-business.png`, `a-storefront-after-edit.png` |
| **CAL1** | **Calendar** | **WORKFLOW** | **Opens on the current month and gives no hint that everything is one click away.** The whole catalog's availability is September (71 slots); the Calendar opens on **August** and renders a completely empty grid under the legend "Availability you've opened". One click forward and all 71 chips appear correctly. This is the owner-side twin of batch finding **C1** (the traveler calendar) and should be fixed with it. | Expected: land on the first month with activity, or say "next activity: September". Actual: a provider with a full September looks at an empty month. | `w-calendar-1920.png` vs `f-calendar-september.png` |
| **CAL2** | **Calendar** | **FEATURE** | **Every chip is truncated to uselessness.** Chips read "Garden-View Tatami Do…", "Loom-Room Twin (Stree…", "Nishiki & Gion Evening …" — the capacity the event actually carries (`· 6 open`, `· 1 open`) is cut off in every single one, and the two similarly-named rooms are indistinguishable at a glance. The full string is in the `title` attribute only, i.e. hover-only, i.e. absent on the phone. | Expected: the number of open places visible without hovering. Actual: 71 chips and not one legible capacity. | `f-calendar-september.png` |
| **A3** | **Performance** | **FEATURE** | **Overview and Analytics open with the same four numbers.** Total Revenue / Total Bookings / Average Rating / Active Services appear at the top of both tabs (both from `/api/provider/analytics/dashboard`), with the labels alone differing ("Average Rating" vs "Avg Rating"). Two of the four tabs start identically. | Expected: a tab earns its place with something the neighbouring tab doesn't show. Actual: a duplicated header. | `f-performance-overview.png`, `f-performance-analytics.png` |
| **MSG1** | **Inbox → Messages** | **FEATURE** | **A thread carries no read/unread state at all.** The real inquiry arrived and renders as an ordinary card — no bold, no dot, no timestamp emphasis, nothing distinguishing it from a thread answered last month. Combined with N1 (a bell that is always red) and the absence of any count on the Messages tab or on Today's "Messages" button, a provider has **no working signal that a traveler has written to them**; the only way to find out is to open Inbox → Messages and read. *The **badge** half is **confirmed as known, ref punch list** ("Chat unread-messages badge" [future lane] — wire real mark-read into `chat.tsx` first).* The half filed new here is that the thread list itself expresses no read state, so there is nothing for a badge to count yet. | Expected: an unread thread looks unread. Actual: identical to a read one. | `f-inbox-messages.png` |

### P3

| # | Tab | Kind | Finding | Shot |
|---|---|---|---|---|
| **PR1** | Settings → Profile | LOGIC | The two remaining fabricated defaults on a page that otherwise removed its dead chrome deliberately: the bio falls back to **"Welcome to our business profile"** (`profile.tsx:119`) and Amenities falls back to **`["Service Available"]`** (`:135`) — a meaningless chip rendered as if the provider had entered it. Both are one-line deletions in the spirit of the same audit. | `f-settings-profile-person-not-business.png` |
| **CU1** | Customers | LOGIC | The footnote reads *"Booked value is what your customers **paid** across bookings"* — but this row's $95 was never paid. The row itself says "(1 pending payment)" and the expanded detail says "Payment pending", so the disclosure is right there; only the word "paid" is wrong. | `f-customers-list.png` |
| **SH1** | Chrome | LOGIC | The header's star pill is a hardcoded `t("shell.ratingNew")` → **"New"** in `ProviderLayout` — never data-driven. A provider with 200 reviews and a 4.9 average will still be badged "New" in their own chrome. Honest today only because this account genuinely has no reviews. | any 1920 shot |
| **CAL3** | Calendar | WORKFLOW | The **Bookings** chip filters the grid to zero events and renders a silent empty month — no "no bookings this month" line. Correct data (the claim has no date, so it cannot be placed), silent presentation. | `f-calendar-bookings-chip-empty.png` |
| **PB1** | Playbook | — | **Verified, no defect.** `/provider/resources` correctly redirects to `/provider/playbook`; the sidebar points at the new path; the page title is "Playbook". Recorded because the file header describes a rename that could easily have been left half-done. | `w-resources-1920.png` |

### Positives — what genuinely works

| # | What | Evidence |
|---|---|---|
| **P+1** | **The checkout failure is the most honest thing in the run.** With Stripe unreachable, `/api/checkout` returned **503 `payment_unavailable`** and told the traveler *"nothing was charged and nothing was booked. Your cart is exactly as you left it — please try again."* — and every clause of that was **true**: the cart still held the item, no slot inventory was consumed (`booked_count` still 0 across all five food-walk slots), and the claim row was left in exactly the state §15b prescribes, `status='payment_pending' AND stripe_payment_intent_id IS NULL` with the pre-flight `bookingDetails.stripeAttemptAt` marker already stamped so a sweep can never void it blindly. The money machinery behaved perfectly under a failure it was never going to be tested against on this bench. | `a-checkout-503-cart-intact.png`, DB block §4 |
| **P+2** | **Customers is the model surface for the claim, and every other tab should copy it.** It is the only page that shows the row at all, and it labels it three ways without being asked: the summary line reads **"1 booking (1 pending payment) · $95 booked value"**, the expanded detail shows the booking with a **"Payment pending"** status badge, and the footnote separates booked value from earnings and points at Money. The `pendingPaymentBookings` field exists on the endpoint precisely so pages can disagree *legibly*. The idiom M1/I1/X1 need already exists here. | `f-customers-expanded-payment-pending.png` |
| **P+3** | **The message rail works end to end and lands where it should.** Storefront Message → composer → `POST /api/chats 201` → the provider's Inbox → Messages shows **"RECENT CONVERSATIONS (1)"** with the traveler's name, the message preview and the date, deep-linking to `/chat?clientId=…`. | `a-message-sent.png`, `f-inbox-messages.png` |
| **P+4** | **Share-link analytics reflects real clicks, and labels its own limits precisely.** The six clicks I generated appear as **Clicks (lifetime) 6**, split `/r/4pe1tdjh` 3 and `/r/5nwr6ub6` 3, on both Performance → Analytics and Money → Link Performance, with a **By Frame** rollup that names the honest `Untagged` bucket rather than folding it into a real frame. The caption states *"Clicks are lifetime totals (no per-day click history is tracked yet). Bookings and revenue reflect the last {N} days"* and the `{N}` tracks the range selector. Money's card adds *"Stats count tracked share links only — a raw URL texted or pasted outside Traveloure isn't visible to this dashboard."* That is a dashboard telling you what it cannot see. | `f-performance-analytics.png`, `f-money-four-answers.png` |
| **P+5** | **Settings → public storefront is immediate and verbatim.** The About edit saved, survived a reload, and appeared on `/p/machiya-miyako-kyoto` character-for-character on the next load — no cache staleness, no truncation, no re-approval gate. | `a-settings-about-saved.png`, `a-storefront-after-edit.png` |
| **P+6** | **Every empty state that has no data says so instead of inventing.** Benchmarks: *"Not enough comparable listings in your market yet"* with three explicit "No data yet" tiles. Cross-sell: *"No cross-sell data yet — data populates as travellers view the 'Users also book' strip."* Demand: *"Not enough signal yet"*, *"No seasonality data on record for Kyoto yet"*, *"No upcoming events on record for Kyoto yet"*. Reviews: *"No reviews yet — they appear after completed bookings."* Statements: *"Statements appear after your first booking month."* Today's Trending rail: *"Not enough signal yet."* Six surfaces, six honest silences — the §13 posture is real and consistent. (A2 is the one panel that breaks the pattern.) | `f-performance-*.png`, `f-money-four-answers.png` |
| **P+7** | **The payout rail is correct on both sides.** Client: the button is **disabled** at a zero balance with *"Minimum payout is $10.00."* Server (`payments.routes.ts:1986`): amount **server-derived** from the earner's own cleared balance (§14, annotated `money-derive-ok`), a **one-open-request** guard (§15), and a Stripe-not-connected **pre-check** with actionable copy explicitly added so an earner isn't told "requested" for a request that could never be fulfilled. | `f-money-four-answers.png`, code |
| **P+8** | **Calendar September is right in every detail.** All **71** availability chips render on the correct days, the **All / Bookings / Availability** chips filter correctly (71 → 0 → 71), each event deep-links to its owning module (`/provider/services`, the ratified home of slot editing), the legend names only the two lanes a provider can actually populate, and the grid is Monday-start with today marked. The Playbook's claim that published slots "show up on your Calendar" checks out. | `f-calendar-september.png`, `f-calendar-bookings-chip-empty.png` |
| **P+9** | **`PATCH /api/provider/settings` is the §19 allowlist shape done right** — a `z.object({...}).partial()` naming exactly seven fields, with the comment *"Allow-list only — never spread raw req.body (ownership/identity columns stay server-owned)."* Given ruling 46 recorded **zero** `.pick()`-based insert schemas, a hand-written allowlist on a settings body is the posture `#PS18` is asking for. (Its problem is S1 — nothing reads it — not its safety.) | `provider.routes.ts:60–119` |
| **P+10** | **The Playbook is the rarest thing in a console: documentation that is true.** Its §13 rebuild note records that the previous version was entirely fabricated (invented reading times, videos with no files, downloads with no downloads) and that all of it was deleted rather than stubbed. What replaced it is four accurate sections — the born-`submitted` lifecycle including the bundle re-review rule, the four real bookability factors, Stripe Connect payouts with an explicit refusal to quote a fee percentage ("your exact rate … always shown on your Money page, which is the source of truth for your real numbers, not this page"), and availability with correct deep links. I checked its claims against behaviour and found no false statement. | `w-resources-1920.png` |
| **P+11** | **Phone width is flawless across all nine tabs** — zero horizontal overflow at 390×844, including the 71-chip September calendar (which scrolls inside its own container, exactly as `overflow-x-auto` + `min-w-[660px]` intends). | `w-*-390.png`, `phone.log` |

---

## 4. DB verification block

All reads against `traveloure_batch`; provider `82373a50-ccc4-453c-804b-5b93d886bb7a`, traveler
`83287ec2-061d-4786-a134-bd8040b1a9e6`.

**The claim left by the failed checkout** — the row every §3 money finding is about:

```
        id        | a58c500f-4fbc-425a-9283-0a7e0d2f7252
 tracking_number  | TRV-202608-00009
 service_id       | d950bbd2-… (Nishiki & Gion Evening Food Walk)
 status           | payment_pending
 total_amount     | 95.00
 platform_fee     | 11.40
 provider_earnings| 83.60
 stripe_payment_intent_id | (null)          ← §15b: an unauthorized claim by construction
 idempotency_key  | c393f98f-0423-4bd9-90c4-e91f8b89c64f
 bookingDetails->>'stripeAttemptAt' | 2026-08-13T02:16:19Z   ← pre-flight marker written BEFORE the call
 source           | direct        acquisition_ref | (null)
```

**Console values checked against that row:**

| Surface | Shows | DB truth | Verdict |
|---|---|---|---|
| Cart order review | subtotal $95.00 · platform fee $11.40 · total $106.40 | `total_amount 95.00`, `platform_fee 11.40`; 11.40/95 = **0.1200** = the `limited` band on the service | **matches** |
| Money → headline tiles | Total/This Month/Pending/Available **$0.00** | claim excluded (`completed`/`confirmed`/`pending` only) | **matches** |
| Money → Earnings Ledger | Available $0.00, escrow $0.00, paid out $0.00, total earned $0.00 | `provider_earnings` table: **0 rows**; `GET /api/provider/earnings/summary` → all zeros | **matches** |
| Money → Revenue Share Breakdown | Gross **$95.00**, fee −$11.40, share **$83.60** "Your lifetime earnings" | the claim's own columns, **no status filter** | **M1 — counts unpaid money** |
| Money → Earnings by Source | Direct, 1 booking, **$95.00** | `GET /api/me/earnings-by-source` → `{"source":"direct","count":1,"revenue":95}`, **no status filter** | **M1 — counts unpaid money** |
| Inbox → Pending tile | **1** | 1 row, and it is `payment_pending` | **I1 — counted but unshowable** |
| Inbox → Queue list | "No bookings waiting" | 0 rows at `status='pending'` | correct-but-contradictory |
| Today → Pending Bookings / Action Items | **0** / **0** | `/api/provider/analytics/dashboard` → `pendingBookings: 0, totalBookings: 0` | **X1 — third answer** |
| Customers | "1 booking (1 pending payment) · $95 booked value", detail badge "Payment pending" | `GET /api/me/customers` → `bookings:1, pendingPaymentBookings:1, bookedValue:95` | **matches, and discloses** |
| Performance → Active Services | **11** | 11 rows `approval_status='approved' AND status='active'`; the 12th (S8) correctly listed separately as `draft` | **matches** |

**Inventory untouched by the failed checkout** (the §15b/§18b thing that would have been destroyed if the
claim had been mishandled):

```
 vendor_availability_slots  service_id = d950bbd2-…  (Nishiki & Gion Evening Food Walk)
 2026-09-01  capacity 6  booked_count 0
 2026-09-03  capacity 6  booked_count 0
 2026-09-05  capacity 6  booked_count 0
 2026-09-08  capacity 6  booked_count 0
 2026-09-10  capacity 6  booked_count 0
```

**Cart preserved** (the 503's promise): `cart_items` still holds `29539793-…` → `d950bbd2-…`, quantity 1.

**Short links** (Performance/Money input; 2 → 3 each, exactly the two clicks driven):

```
 code=4pe1tdjh  target=service  clicks=3  frame=NULL
 code=5nwr6ub6  target=service  clicks=3  frame=NULL
```

**Message rail:** `user_and_expert_chats` — exactly **one** row, `0f5e568f-1063-4b43-bc7c-8d5b75e570f5`
(`TRV-202608-00010`), traveler → provider. **No auto-response row exists**, with `provider_settings.auto_response = true` — the empirical half of S1.

**Settings write-through:** `provider_settings` had **0 rows** before the save and one after —
`instant_booking=t`, `auto_response=t`, `minimum_lead_time_days=7`, `target_response_time_hours=2`,
`payout_frequency=monthly`, **`minimum_payout_amount=250.00`** — while Money continues to gate on
`stats.available < 10` and the server on `MIN_PAYOUT_CENTS = 1000` (S2).

**Profile columns that do not exist** (P1w) — of the seven `businessInfo` reads, `users` has only two:

```
 SELECT column_name FROM information_schema.columns WHERE table_name='users'
   AND column_name IN ('business_name','business_type','address','phone','website',
                       'amenities','capacities','bio','profile_image_url');
 → bio, profile_image_url          (business_name/business_type/address/phone/website/amenities/capacities: ABSENT)

 SELECT business_name, business_type, status FROM service_provider_forms WHERE user_id = '82373a50-…';
 → Machiya & Miyako Experiences | Sole Proprietorship | approved
```

---

## 5. Handoff — additions to the batch exercise's fixture inventory

Everything in `PROVIDER_BATCH_EXERCISE.md` §5 still stands and was found intact. **New rows created by this
run** (all through the UI; nothing deleted, nothing hand-written):

| Item | Value |
|---|---|
| Traveler account used | `test-traveler-kyoto@traveloure.test` / `TestPass123!` — id `83287ec2-061d-4786-a134-bd8040b1a9e6` (boot-seeded, not created here) |
| **Unpromoted checkout claim** | `service_bookings.a58c500f-4fbc-425a-9283-0a7e0d2f7252` — `TRV-202608-00009`, `payment_pending`, PI NULL, `stripeAttemptAt` stamped. **Deliberately left in place**: it is the fixture that makes M1/I1/X1 reproducible, and it is the only unauthorized-claim row on this bench. |
| Cart item | `cart_items.29539793-8203-48a0-ae2f-0153f278501e` (food walk ×1), left intact by the 503 |
| **Traveler → provider message** | `user_and_expert_chats.0f5e568f-1063-4b43-bc7c-8d5b75e570f5` — `TRV-202608-00010` |
| **Provider settings row** | `provider_settings.bfc0caf4-71a7-4d2d-8055-d8c7e44b9394` — `instant_booking=t`, `minimum_payout_amount=250.00` (the S1/S2 fixture) |
| Profile bio | edited to `"Nishijin machiya kitchens and back-lane markets since 2011 — small groups only. [console-tabs round-trip Aug 13 2026]"` — the marker string proving the storefront round-trip; safe to overwrite |
| Short-link clicks | `4pe1tdjh` and `5nwr6ub6` now at **3** each (were 2) |

**Bench limits that shaped this run, stated plainly.** `STRIPE_SECRET_KEY=sk_test_dummy`, so no charge can
complete: everything downstream of authorization — a `confirmed` booking, a completed service, an
`expert_earnings`/`provider_earnings` row, a non-zero payout balance, a review, an inbound booking event on
the Calendar, a Money statement — is **unreachable on this bench without DB surgery, which was declined**.
Those surfaces were assessed on their empty states instead (P+6), which is what the empty states are for. No
`ANTHROPIC_API_KEY`, so Performance's Business Advisor returns `502 {"message":"Advice unavailable right
now"}` — an honest typed failure, out of scope. No Maps key (unchanged from the batch run).

---

## 6. Can a provider run their business from these tabs, or only set it up?

**Set it up: yes. Run it: not yet — and the gap is not features, it is that the tabs do not agree with each
other about what happened.**

Haruka's catalog is built and live, and the surfaces that describe *her own configuration* are in good shape.
Her Calendar shows all seventy-one September dates on the right days and links each one back to the module
that owns it. Her Playbook tells her the truth about approval, bookability and payouts, and refuses to quote a
fee percentage it isn't the source of. Her storefront edit reaches the public page before she can switch tabs.
Her share links count real clicks and tell her, unprompted, that a URL she pasted into a WhatsApp group is
invisible to the dashboard. When a panel has nothing to say — benchmarks, cross-sell, demand, reviews,
statements — it says so plainly instead of drawing a shape. That restraint is consistent enough across six
different panels to read as a house style rather than an accident, and it is the thing most worth protecting.

Then one traveler tried to buy something, and the console stopped agreeing with itself.

The purchase failed for an honest reason and the platform said so beautifully — the traveler was told nothing
was charged and nothing was booked, and every word of that was verifiable in the database ten minutes later:
cart intact, inventory untouched, the claim parked in exactly the reclaimable state the ruling prescribes.
The money machinery is not the problem. The problem is that the row it correctly parked is then described
five different ways by five different pages. Today says she has nothing pending. Inbox says she has one
pending — then shows her an empty list and tells her nothing is waiting. Customers, alone, gets it exactly
right and even labels the money as booked value rather than earnings. And Money, on a single scroll, tells her
her available balance is $0.00, her lifetime earnings are $83.60, her revenue by source is $95.00, her ledger
total is $0.00, and she has no transactions. Each of those numbers is individually defensible; together they
are unusable. A provider cannot run a business from a console where the answer to "did I make a sale" depends
on which tab is open, and where the one number labelled *lifetime earnings* is the one counting money that
does not exist.

The second gap is that nothing ever tells her anything. A real traveler asked a real question about a real
September date. Nothing announced it. The bell in the corner was already red — it is always red, on every page,
for every earner, hardcoded — so it could not have announced it. The Messages tab shows no unread state, so
the thread looked like any other. Her Notification Preferences say messages are on; nothing reads that column.
Her Auto-Response is on; nothing reads that either, and no reply was sent. Eleven controls on her Settings page
save perfectly to a table the server never queries — on the same page that once deleted a Change Password
button on the grounds that it had nothing behind it. And the most prominent way a traveler can reach her, the
Contact Provider button on the listing they are actually reading, sends them to a directory of experts in
Lisbon and Rome with no way to type a message at all. From her side, that failure is indistinguishable from
nobody being interested.

None of this is far from working, which is the encouraging part. The honest idiom for the unpaid claim already
exists — Customers wrote it, three ways, without being asked; the other five surfaces need to adopt it rather
than invent one. The status predicate missing from two money aggregations is a `WHERE` clause. The bell needs
a query or a deletion. `?provider=` needs to be `?expertId=`. The eleven dead settings need consumers or the
same deletion the 2FA card got. What is *not* small is the decision underneath all of it: this console has
nine modules that each read `service_bookings` with their own idea of what counts, and until one predicate is
shared, every new tab will add a sixth answer. Fix that, wire the bell, and Haruka can run her business here —
because everything else she needs is already built, and most of it is already honest.

---

*Assessment captured while using each surface. Every finding above has a screenshot in
`docs/testing/assets/console-tabs/` taken at the moment of finding. Known punch-list items are cited, never
re-investigated.*
