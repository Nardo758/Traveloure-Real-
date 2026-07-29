import { chromium } from "playwright";
import { execSync } from "node:child_process";

const BASE = "http://localhost:5050";
const EMAIL = "test-traveler-kyoto@traveloure.test";
const PASSWORD = "TestPass123!";

function psql(sql) {
  const out = execSync(
    `sudo -u postgres psql -d traveloure_b2 -t -A -c "${sql.replace(/"/g, '\\"')}"`,
    { encoding: "utf8" }
  );
  return out.trim();
}

function pad(n) { return String(n).padStart(2, "0"); }
function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function hhmm12(d) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${pad(m)} ${ap}`;
}
function addMinutes(d, mins) { return new Date(d.getTime() + mins * 60000); }
function addDays(d, days) { const c = new Date(d); c.setDate(c.getDate() + days); return c; }

const results = [];
function check(name, pass, extra) {
  results.push({ name, pass, extra });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${extra ? " :: " + extra : ""}`);
}

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const createdTripIds = [];

  try {
    // ---- Login ----
    const loginRes = await context.request.post(`${BASE}/api/auth/login`, {
      data: { email: EMAIL, password: PASSWORD },
    });
    if (!loginRes.ok()) throw new Error(`Login failed: ${loginRes.status()} ${await loginRes.text()}`);
    console.log("Logged in as", EMAIL);

    const now = new Date();

    // ==========================================================================
    // TRIP A — main 3-day command-center fixture, today = day 2 of 3
    // ==========================================================================
    const tripAStart = addDays(now, -1);
    const tripAEnd = addDays(now, 1);
    const tripARes = await context.request.post(`${BASE}/api/trips`, {
      data: {
        title: "Mobile Command Center Kyoto Trip",
        destination: "Kyoto, Japan",
        startDate: isoDate(tripAStart),
        endDate: isoDate(tripAEnd),
        numberOfTravelers: 1,
        adults: 1,
        kids: 0,
        eventType: "vacation",
      },
    });
    if (!tripARes.ok()) throw new Error(`Trip A create failed: ${tripARes.status()} ${await tripARes.text()}`);
    const tripA = await tripARes.json();
    createdTripIds.push(tripA.id);
    console.log("Trip A created:", tripA.id);

    const day1Date = isoDate(addDays(now, -1));
    const day2Date = isoDate(now);
    const day3Date = isoDate(addDays(now, 1));

    const upNextTime = addMinutes(now, 45);
    const pastTime1 = addMinutes(now, -240);
    const pastTime2 = addMinutes(now, -120);
    const futureTime = addMinutes(now, 240);

    const itineraryAData = {
      id: tripA.id,
      destination: tripA.destination,
      title: tripA.title,
      startDate: tripAStart.toISOString(),
      endDate: tripAEnd.toISOString(),
      travelers: 1,
      budget: "1500",
      days: [
        {
          day: 1,
          date: day1Date,
          activities: [
            { id: "a1-1", title: "Fushimi Inari Torii Gate Walk", time: "06:00", type: "attraction", location: "Fushimi Inari Taisha, South Gate", lat: 34.9671, lng: 135.7727, booked: true, price: 0 },
            { id: "a1-2", title: "Nishiki Market Lunch", time: "12:00", type: "dining", location: "Nishiki Market, Takoyaki Stall Row", lat: 35.0051, lng: 135.7649, booked: true, price: 18 },
          ],
        },
        {
          day: 2,
          date: day2Date,
          activities: [
            { id: "a2-1", title: "Kinkaku-ji Golden Pavilion", time: hhmm12(pastTime1), type: "attraction", location: "Kinkaku-ji, Kita-ku", lat: 35.0394, lng: 135.7292, booked: true, price: 5 },
            { id: "a2-2", title: "Arashiyama Bamboo Grove", time: hhmm12(pastTime2), type: "attraction", location: "Arashiyama Bamboo Grove", lat: 35.0170, lng: 135.6717, booked: true, price: 0 },
            {
              id: "a2-3", title: "Ikebana Workshop with Yuki", time: hhmm12(upNextTime), type: "attraction",
              location: "Kyoto Ikebana Studio entrance, Nakagyo-ku", lat: 35.0116, lng: 135.7681, booked: true, price: 45,
              notes: "Arrive 10 min early — the studio entrance is inside the machiya courtyard, not on the street. Aprons provided.",
            },
            { id: "a2-4", title: "Gion Evening Walk", time: hhmm12(futureTime), type: "attraction", location: "Tatsumi Bridge, Gion", lat: 35.0037, lng: 135.7756, booked: false, price: 0 },
          ],
          // Only ONE transportLeg BEFORE the up-next activity (a2-3) matters for the
          // mode-aware primary action — self-directed "metro" leg, real coords.
          transportLegs: [
            { id: "leg-a2-1", fromName: "Kinkaku-ji", toName: "Arashiyama Bamboo Grove", recommendedMode: "walk", estimatedDurationMinutes: 15, estimatedCostUsd: 0 },
            { id: "leg-a2-2", fromName: "Arashiyama", toName: "Kyoto Ikebana Studio", recommendedMode: "metro", estimatedDurationMinutes: 22, estimatedCostUsd: 3 },
            { id: "leg-a2-3", fromName: "Kyoto Ikebana Studio", toName: "Gion", recommendedMode: "walk", estimatedDurationMinutes: 18, estimatedCostUsd: 0 },
          ],
        },
        {
          day: 3,
          date: day3Date,
          activities: [
            { id: "a3-1", title: "Kiyomizu-dera Temple", time: "09:00", type: "attraction", location: "Kiyomizu-dera, Higashiyama", lat: 34.9949, lng: 135.7850, booked: false, price: 4 },
          ],
        },
      ],
    };

    const giARes = await context.request.post(`${BASE}/api/generated-itineraries`, {
      data: { tripId: tripA.id, itineraryData: itineraryAData, status: "generated" },
    });
    if (!giARes.ok()) throw new Error(`Trip A itinerary create failed: ${giARes.status()} ${await giARes.text()}`);
    console.log("Trip A itinerary created");

    // Trip-level expert note (direct DB — PATCH is expert-only; this is real column data,
    // not fabricated on the client). Also exercises the "delivered by Yuki" note itself.
    psql(`UPDATE trips SET expert_notes = 'Day 2 is your most scheduled day — I have kept the evening loose on purpose so you can linger in Gion if the light is good. Carry cash for Nishiki; most stalls do not take cards.' WHERE id = '${tripA.id}'`);

    // ==========================================================================
    // TRIP B — chauffeured + REAL booking data → "pickup" card
    // ==========================================================================
    const tripBRes = await context.request.post(`${BASE}/api/trips`, {
      data: {
        title: "Pickup Card Fixture",
        destination: "Kyoto, Japan",
        startDate: isoDate(now),
        endDate: isoDate(now),
        numberOfTravelers: 1,
        adults: 1,
        kids: 0,
      },
    });
    if (!tripBRes.ok()) throw new Error(`Trip B create failed: ${tripBRes.status()}`);
    const tripB = await tripBRes.json();
    createdTripIds.push(tripB.id);

    const bUpNext = addMinutes(now, 30);
    const itineraryBData = {
      id: tripB.id, destination: tripB.destination, title: tripB.title,
      startDate: now.toISOString(), endDate: now.toISOString(), travelers: 1, budget: "500",
      days: [{
        day: 1, date: isoDate(now),
        activities: [
          { id: "b1-1", title: "Kaiseki Dinner", time: hhmm12(bUpNext), type: "dining", location: "Nishiki Market east exit", lat: 35.0051, lng: 135.7649, booked: true, price: 90 },
        ],
        transportLegs: [
          { id: "leg-b1", fromName: "Hotel", toName: "Kaiseki Dinner", recommendedMode: "taxi", estimatedDurationMinutes: 11, estimatedCostUsd: 8, pickupPoint: "Nishiki Market east exit", pickupTime: hhmm12(addMinutes(bUpNext, -20)), driverPhone: "+81-90-1234-5678", rideDetails: "Toyota Alphard, plate KY-482" },
        ],
      }],
    };
    const giBRes = await context.request.post(`${BASE}/api/generated-itineraries`, {
      data: { tripId: tripB.id, itineraryData: itineraryBData, status: "generated" },
    });
    if (!giBRes.ok()) throw new Error(`Trip B itinerary create failed: ${giBRes.status()}`);

    // ==========================================================================
    // TRIP C — chauffeured, UNBOOKED, WITH bookingAffiliateUrl → "book_ride"
    // ==========================================================================
    const tripCRes = await context.request.post(`${BASE}/api/trips`, {
      data: {
        title: "Book Ride Fixture",
        destination: "Kyoto, Japan",
        startDate: isoDate(now),
        endDate: isoDate(now),
        numberOfTravelers: 1,
        adults: 1,
        kids: 0,
      },
    });
    if (!tripCRes.ok()) throw new Error(`Trip C create failed: ${tripCRes.status()}`);
    const tripC = await tripCRes.json();
    createdTripIds.push(tripC.id);

    const cUpNext = addMinutes(now, 30);
    const itineraryCData = {
      id: tripC.id, destination: tripC.destination, title: tripC.title,
      startDate: now.toISOString(), endDate: now.toISOString(), travelers: 1, budget: "500",
      days: [{
        day: 1, date: isoDate(now),
        activities: [
          { id: "c1-1", title: "Sunset Viewpoint", time: hhmm12(cUpNext), type: "attraction", location: "Kiyomizu-dera Viewpoint", lat: 34.9949, lng: 135.7850, booked: false, price: 0 },
        ],
        transportLegs: [
          { id: "leg-c1", fromName: "Hotel", toName: "Sunset Viewpoint", recommendedMode: "rideshare", estimatedDurationMinutes: 14, estimatedCostUsd: 10, bookingAffiliateUrl: "https://example-partner.test/booking/abc123" },
        ],
      }],
    };
    const giCRes = await context.request.post(`${BASE}/api/generated-itineraries`, {
      data: { tripId: tripC.id, itineraryData: itineraryCData, status: "generated" },
    });
    if (!giCRes.ok()) throw new Error(`Trip C itinerary create failed: ${giCRes.status()}`);

    // ==========================================================================
    // TRIP D — chauffeured, UNBOOKED, NO affiliate url → honest Navigate fallback
    // (this is the REALISTIC state for every trip today per the known data gap)
    // ==========================================================================
    const tripDRes = await context.request.post(`${BASE}/api/trips`, {
      data: {
        title: "Chauffeured Fallback Fixture",
        destination: "Kyoto, Japan",
        startDate: isoDate(now),
        endDate: isoDate(now),
        numberOfTravelers: 1,
        adults: 1,
        kids: 0,
      },
    });
    if (!tripDRes.ok()) throw new Error(`Trip D create failed: ${tripDRes.status()}`);
    const tripD = await tripDRes.json();
    createdTripIds.push(tripD.id);
    const dUpNext = addMinutes(now, 30);
    const itineraryDData = {
      id: tripD.id, destination: tripD.destination, title: tripD.title,
      startDate: now.toISOString(), endDate: now.toISOString(), travelers: 1, budget: "500",
      days: [{
        day: 1, date: isoDate(now),
        activities: [
          { id: "d1-1", title: "Ryokan Check-in", time: hhmm12(dUpNext), type: "accommodation", location: "Ryokan Sakura, Gion", lat: 35.0037, lng: 135.7756, booked: false, price: 0 },
        ],
        transportLegs: [
          { id: "leg-d1", fromName: "Station", toName: "Ryokan Sakura", recommendedMode: "taxi", estimatedDurationMinutes: 9, estimatedCostUsd: 7 },
        ],
      }],
    };
    const giDRes = await context.request.post(`${BASE}/api/generated-itineraries`, {
      data: { tripId: tripD.id, itineraryData: itineraryDData, status: "generated" },
    });
    if (!giDRes.ok()) throw new Error(`Trip D itinerary create failed: ${giDRes.status()}`);

    // ==========================================================================
    // Accepted advisor on Trip A (real local expert row: Yuki Nakamura, approved)
    // ==========================================================================
    const advisorId = psql(`INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status) VALUES (gen_random_uuid()::text, '${tripA.id}', '9c9e0354-cc0b-42b7-9ccd-8e157ac7298b', 'accepted') RETURNING id`);
    console.log("Advisor row inserted:", advisorId);

    // ==========================================================================
    // VERIFY 1: Trip C/D as a no-advisor trip — bottom bar "Get help" fallback
    // ==========================================================================
    await page.goto(`${BASE}/trip/${tripC.id}?tab=itinerary`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const helpBtn = page.getByTestId(`button-bottombar-help-${tripC.id}`);
    const msgBtnAbsent = page.getByTestId(`button-bottombar-message-${tripC.id}`);
    check("Bottom bar 'Get help' present on no-advisor trip", await helpBtn.isVisible().catch(() => false));
    check("Bottom bar 'Message expert' absent on no-advisor trip", (await msgBtnAbsent.count()) === 0);

    // book_ride CTA on Trip C's hero
    const heroC = page.getByTestId(`up-next-hero-${tripC.id}`);
    check("Up Next hero renders on Trip C (live day, upcoming activity)", await heroC.isVisible().catch(() => false));
    const bookRideBtn = page.getByTestId("button-hero-book-ride");
    check("Mode-aware CTA: chauffeured+unbooked+affiliateUrl renders 'Book this ride'", await bookRideBtn.isVisible().catch(() => false));
    const countdownC = page.getByTestId("text-hero-countdown");
    const countdownCText = await countdownC.textContent().catch(() => null);
    check("Hero countdown renders real derived text", !!countdownCText && /In \d+m|Now/.test(countdownCText), countdownCText ?? "missing");

    // ==========================================================================
    // VERIFY 2: Trip D — chauffeured, no booking, no affiliate → Navigate fallback
    // ==========================================================================
    await page.goto(`${BASE}/trip/${tripD.id}?tab=itinerary`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const navBtnD = page.getByTestId("button-hero-navigate");
    check("Mode-aware CTA: chauffeured+unbooked+no-affiliate falls back to Navigate (never a dead button)", await navBtnD.isVisible().catch(() => false));

    // ==========================================================================
    // VERIFY 3: Trip B — real pickup data → pickup card
    // ==========================================================================
    await page.goto(`${BASE}/trip/${tripB.id}?tab=itinerary`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const pickupCard = page.getByTestId("card-hero-pickup");
    check("Mode-aware CTA: chauffeured+real booking data renders pickup card", await pickupCard.isVisible().catch(() => false));
    const pickupPointText = await page.getByTestId("text-hero-pickup-point").textContent().catch(() => null);
    check("Pickup card shows real pickup point", !!pickupPointText && pickupPointText.includes("Nishiki Market"), pickupPointText ?? "missing");
    const callDriverLink = page.getByTestId("link-hero-call-driver");
    const callHref = await callDriverLink.getAttribute("href").catch(() => null);
    check("Call driver link uses tel: on real phone field", callHref === "tel:+81-90-1234-5678", callHref ?? "missing");

    // ==========================================================================
    // VERIFY 4 (main Trip A): sticky day switcher, hero, collapsed sections,
    // self-directed Navigate CTA, advisor-present bottom bar, past-day dimming.
    // ==========================================================================
    await page.goto(`${BASE}/trip/${tripA.id}?tab=itinerary`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // Auto-selected on today (Day 2)
    const day2Btn = page.getByTestId(`button-day-2-${tripA.id}`);
    const day2Class = await day2Btn.getAttribute("class").catch(() => "");
    check("Auto-opens on today's day (Day 2 selected on load)", (day2Class || "").includes("bg-primary/10"));

    // Today dot marker + past-day dimming
    const todayDot = page.getByTestId(`dot-today-2-${tripA.id}`);
    check("Today's chip carries the live 'today' marker", await todayDot.isVisible().catch(() => false));
    const day1Class = await page.getByTestId(`button-day-1-${tripA.id}`).getAttribute("class").catch(() => "");
    check("Past day (Day 1) chip is dimmed (opacity-60)", (day1Class || "").includes("opacity-60"));

    // Up Next hero content
    const heroTitle = await page.getByTestId("text-hero-title").textContent().catch(() => null);
    check("Hero shows the correct next activity name", heroTitle === "Ikebana Workshop with Yuki", heroTitle ?? "missing");
    const heroMeeting = await page.getByTestId("text-hero-meeting-point").textContent().catch(() => null);
    check("Hero shows real meeting point", !!heroMeeting && heroMeeting.includes("Kyoto Ikebana Studio"), heroMeeting ?? "missing");
    const heroNote = await page.getByTestId("text-hero-expert-note").textContent().catch(() => null);
    check("Hero shows the activity's expert_note when present", !!heroNote && heroNote.includes("machiya courtyard"), heroNote ?? "missing");
    const heroCountdown = await page.getByTestId("text-hero-countdown").textContent().catch(() => null);
    check("Hero countdown reflects real ~45min gap", !!heroCountdown && /In (2[5-9]|3[0-9]|4[0-9])m/.test(heroCountdown), heroCountdown ?? "missing");

    // Mode-aware CTA: self-directed (metro) leg → Navigate button
    const navBtnA = page.getByTestId("button-hero-navigate");
    check("Mode-aware CTA: self-directed (metro) leg renders Navigate", await navBtnA.isVisible().catch(() => false));

    // No hero on Day 3 (not started) — honest absence, §13
    await page.getByTestId(`button-day-3-${tripA.id}`).click();
    await page.waitForTimeout(500);
    const heroOnDay3 = await page.getByTestId(`up-next-hero-${tripA.id}`).isVisible().catch(() => false);
    check("No Up Next hero on a not-yet-started day (§13 honest absence)", !heroOnDay3);
    await page.getByTestId(`button-day-2-${tripA.id}`).click();
    await page.waitForTimeout(500);

    // Collapsed sections default-closed
    const changesBody = page.getByTestId(`collapsed-changes-${tripA.id}`);
    const changesTriggerAria = await page.getByTestId(`collapsed-changes-${tripA.id}-trigger`).getAttribute("aria-expanded").catch(() => null);
    check("Change history collapsed section is closed by default", changesTriggerAria === "false", changesTriggerAria ?? "missing");
    const expertNoteTriggerAria = await page.getByTestId(`collapsed-expert-note-${tripA.id}-trigger`).getAttribute("aria-expanded").catch(() => null);
    check("Trip-level 'Note from your expert' section present + closed by default", expertNoteTriggerAria === "false", expertNoteTriggerAria ?? "missing");

    // Open it and verify real content
    await page.getByTestId(`collapsed-expert-note-${tripA.id}-trigger`).click();
    await page.waitForTimeout(400);
    const expertNoteBody = await page.getByTestId(`text-collapsed-expert-note-${tripA.id}`).textContent().catch(() => null);
    check("Expert note section shows the trip's real expert_notes field", !!expertNoteBody && expertNoteBody.includes("Gion"), expertNoteBody ?? "missing");

    const transportTriggerAria = await page.getByTestId(`collapsed-transport-${tripA.id}-trigger`).getAttribute("aria-expanded").catch(() => null);
    check("Transport collapsed section present + closed by default", transportTriggerAria === "false", transportTriggerAria ?? "missing");
    const mapTriggerAria = await page.getByTestId(`collapsed-map-${tripA.id}-trigger`).getAttribute("aria-expanded").catch(() => null);
    check("Map preview collapsed section present + closed by default", mapTriggerAria === "false", mapTriggerAria ?? "missing");

    // Budget section — real numbers only (trip A has no totalCost metric from plancard API
    // since it's daysProp-driven; budget alone may or may not render — honest check)
    const budgetSectionCount = await page.getByTestId(`collapsed-budget-${tripA.id}`).count();
    console.log("Budget section present:", budgetSectionCount > 0, "(honest — only renders with real cost/budget data)");

    // Bottom bar: accepted advisor → "Message Yuki"
    const msgBtn = page.getByTestId(`button-bottombar-message-${tripA.id}`);
    const msgBtnText = await msgBtn.textContent().catch(() => null);
    check("Bottom bar shows 'Message Yuki' when an ACCEPTED advisor exists", !!msgBtnText && msgBtnText.includes("Yuki"), msgBtnText ?? "missing");
    const msgHref = await msgBtn.getAttribute("href").catch(() => null);
    check("Message button links to /chat", msgHref === "/chat", msgHref ?? "missing");

    // 44px touch targets
    for (const tid of [`button-bottombar-maps-${tripA.id}`, `button-bottombar-message-${tripA.id}`, `button-bottombar-share-${tripA.id}`]) {
      const box = await page.getByTestId(tid).boundingBox().catch(() => null);
      check(`Bottom bar '${tid}' meets 44px min-height`, !!box && box.height >= 44, box ? `${box.height}px` : "no box");
    }

    // Sticky day switcher stays pinned during scroll
    const daySelectorBefore = await page.getByTestId(`day-selector-${tripA.id}`).boundingBox();
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(400);
    const daySelectorAfter = await page.getByTestId(`day-selector-${tripA.id}`).boundingBox();
    check(
      "Sticky day switcher stays pinned near the top during scroll",
      !!daySelectorBefore && !!daySelectorAfter && Math.abs(daySelectorAfter.y - daySelectorBefore.y) < 5 && daySelectorAfter.y < 120,
      `before y=${daySelectorBefore?.y}, after y=${daySelectorAfter?.y}`
    );
    // Sanity: page actually scrolled (otherwise the sticky check above is meaningless)
    const scrollY = await page.evaluate(() => document.querySelector("main")?.scrollTop ?? window.scrollY);
    check("Page/main actually scrolled (sticky check is meaningful)", scrollY > 100, `scrollTop=${scrollY}`);

    // Desktop regression check: at a desktop viewport, day switcher should NOT be sticky
    // (reverts to static — CLAUDE.md §18 item 1's "must not regress desktop" requirement)
    const desktopPage = await context.newPage();
    await desktopPage.setViewportSize({ width: 1280, height: 900 });
    await desktopPage.goto(`${BASE}/trip/${tripA.id}?tab=itinerary`, { waitUntil: "networkidle" });
    await desktopPage.waitForTimeout(1500);
    const heroDesktopVisible = await desktopPage.getByTestId(`up-next-hero-${tripA.id}`).isVisible().catch(() => false);
    check("Up Next hero is hidden at desktop widths (mobile-only per brief)", !heroDesktopVisible);
    const bottomBarDesktopVisible = await desktopPage.getByTestId(`bottom-action-bar-${tripA.id}`).isVisible().catch(() => false);
    check("Bottom action bar is hidden at desktop widths (mobile-only per brief)", !bottomBarDesktopVisible);
    const daySelectorDesktop = await desktopPage.getByTestId(`day-selector-${tripA.id}`).evaluate((el) => getComputedStyle(el.parentElement).position);
    check("Day switcher wrapper reverts to static position at desktop widths", daySelectorDesktop === "static", daySelectorDesktop);
    const desktopMapsBtnVisible = await desktopPage.getByTestId(`button-open-maps-${tripA.id}`).isVisible().catch(() => false);
    check("Desktop still has its own Maps button (unchanged desktop affordance)", desktopMapsBtnVisible);
    await desktopPage.close();

    console.log("\n=== SUMMARY ===");
    const failed = results.filter((r) => !r.pass);
    console.log(`${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      console.log("FAILURES:");
      failed.forEach((f) => console.log(" -", f.name, f.extra ?? ""));
    }
  } finally {
    // ---- Cleanup ----
    for (const id of createdTripIds) {
      try {
        await context.request.delete(`${BASE}/api/trips/${id}`);
      } catch (e) {
        console.error("Cleanup failed for", id, e);
      }
    }
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
