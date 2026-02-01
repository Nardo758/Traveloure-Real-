# Traveloure Template Priorities: Visual Roadmap

## 🚨 THIS WEEK (Critical Path)

```
┌─────────────────────────────────────────────────────────────┐
│ 🔴 CRITICAL BUGS - Must Fix Immediately                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Wedding: Button State Bug                               │
│     ├─ File: client/src/pages/experience-template.tsx       │
│     ├─ Line: ~1800-1900 (Button disabled logic)            │
│     ├─ Fix: Remove detailsSubmitted dependency              │
│     └─ LOE: 30 minutes                                       │
│                                                              │
│  2. Wedding: Missing Wedding Date Field                     │
│     ├─ Add single date OR date range picker                 │
│     ├─ Update state management                              │
│     └─ LOE: 2 hours                                          │
│                                                              │
│  3. All Templates: Empty Venue/Vendor Tabs                  │
│     ├─ Root cause: No SERP API integration                  │
│     ├─ Quick fix: Show "Coming Soon" message                │
│     └─ LOE: 15 minutes                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📅 NEXT 2 WEEKS (MVP Launch)

### Week 1: Critical Fixes + SERP Setup

**Days 1-2: Bug Fixes**
```
✓ Fix wedding button state
✓ Add wedding date field  
✓ Test multi-mode switching
✓ Deploy to staging
```

**Days 3-5: SERP API Foundation**
```
✓ Set up Google Places API account
✓ Implement venue search endpoint
✓ Create venue card component
✓ Test with 5 destinations
```

### Week 2: SERP Integration (Weddings)

**Days 1-3: Venues Tab**
```
✓ Integrate Google Places API
✓ Display venue results (photos, ratings, price)
✓ Add "Request Quote" CTA
✓ Implement caching (1 hour TTL)
```

**Days 4-5: Vendors Tab**
```
✓ Integrate Yelp Fusion API
✓ Categories: Photographers, florists, caterers, DJs
✓ Display vendor cards with portfolios
✓ Test with 3 destinations
```

---

## 🗓️ MONTH 1 (Full Feature Set)

### Sprint 1: Critical Fixes (✅ Above)

### Sprint 2: Guest Personalization (Weeks 3-4)

**Database Layer**
```sql
CREATE TABLE guest_invites (
  id UUID PRIMARY KEY,
  event_id UUID,
  guest_email TEXT,
  unique_token TEXT,
  origin_city TEXT,
  origin_lat DECIMAL,
  origin_lng DECIMAL,
  rsvp_status TEXT,
  created_at TIMESTAMP
);
```

**API Endpoints**
```
POST   /api/invites               → Generate unique invite links
GET    /api/invites/:token        → Load guest invite page
POST   /api/invites/:token/rsvp   → Submit guest info
GET    /api/events/:id/guests     → Organizer dashboard
```

**UI Components**
```
1. GuestInviteGenerator (organizer view)
2. GuestInvitePage (guest view)
3. GuestDashboard (organizer view)
4. PersonalizedRecommendations (guest view)
```

**Success Criteria**
- ✅ Organizer can generate unique invite per guest
- ✅ Guest can input origin city
- ✅ System geocodes origin city
- ✅ Guest sees personalized flights (origin → destination)
- ✅ Organizer sees map of guest origins

---

## 📊 Template Priority Matrix

### Tier 1: Critical (Do First)

| Template | Why Critical | Status | Next Step |
|----------|--------------|--------|-----------|
| **Wedding** | 🔴 UX bugs blocking users | 🚧 Broken | Fix buttons + date field |
| **Bachelor/Bachelorette** | ✅ DB-driven but no data | 🟡 90% done | Populate tabs with SERP APIs |
| **Anniversary Trip** | ✅ DB-driven but no data | 🟡 90% done | Populate tabs with SERP APIs |

### Tier 2: High Priority (Next)

| Template | Why Important | Status | Next Step |
|----------|---------------|--------|-----------|
| **Corporate Events** | High revenue potential | ⚪ Static | Migrate to DB + SERP APIs |
| **Birthday** | High user demand | ⚪ Static | Migrate to DB + age-specific logic |
| **Travel (General)** | Broad appeal | ⚪ Static | Rename to "Leisure Travel" + SERP APIs |

### Tier 3: Medium Priority

| Template | Why Useful | Status | Next Step |
|----------|------------|--------|-----------|
| **Proposal** | Unique niche | ⚪ Static | Add surprise mode + weather |
| **Date Night** | High frequency | ⚪ Static | SERP APIs for local recs |
| **Reunions** | Group coordination | ⚪ Static | Add memory book feature |

### Tier 4: Low Priority (Later)

All party templates (baby shower, graduation, etc.) - Similar patterns, can batch migrate.

---

## 🔧 SERP API Implementation Order

### Phase 1: MVP (Weeks 1-2)
```
1. Google Places API      → Venues (all templates)
2. Yelp Fusion API        → Vendors (wedding, corporate)
```

### Phase 2: Full Feature (Weeks 3-4)
```
3. Booking.com API        → Hotels (guest accommodations)
4. Amadeus/Skyscanner API → Flights (guest travel)
5. Viator API             → Activities (bachelor, travel)
```

### Phase 3: Enhanced (Weeks 5-6)
```
6. OpenTable API          → Dining (all templates)
7. TripAdvisor API        → Reviews (aggregate ratings)
8. Weather APIs           → Outdoor event planning
```

---

## 🎯 Quick Reference: What Each Template Needs

### Wedding
- ✅ Dual mode (planning + guest activities)
- 🔴 **Fix button state bug**
- 🔴 **Add wedding date field**
- 🟡 Guest invite system (personalized travel)
- 🟡 SERP APIs: Google Places (venues), Yelp (vendors), Booking.com (hotels)

### Bachelor/Bachelorette
- ✅ Database-driven with rich filters
- 🟡 **Populate all 7 tabs with SERP APIs**
- 🟡 Guest invite system (group travel coordination)
- 🟢 Already excellent filter schema

### Anniversary Trip
- ✅ Database-driven with romance-focused filters
- 🟡 **Populate all 7 tabs with SERP APIs**
- 🟢 Surprise mode (hide from partner)
- 🟢 Milestone theming (1st = paper, 25th = silver)

### Corporate Events
- 🔴 **Migrate to database-driven**
- 🔴 **Add invoice management**
- 🟡 SERP APIs: Conference venues, team building activities
- 🟢 ADA compliance tracking

### Birthday
- 🔴 **Migrate to database-driven**
- 🔴 **Add age-specific logic** (kids vs teens vs adults vs milestone)
- 🟡 SERP APIs: Venues, activities (age-appropriate)
- 🟢 Theme idea generator

### Travel (General)
- 🔴 **Rename to "Leisure Travel"** for clarity
- 🔴 **Migrate to database-driven**
- 🟡 SERP APIs: Activities, hotels, flights
- 🟢 Pre-trip checklist (passport, visas)

### Proposal
- 🔴 **Add surprise mode** (hide from partner)
- 🔴 **Weather integration** (critical for outdoor)
- 🟡 SERP APIs: Scenic locations, photographers
- 🟢 Backup plan generator

### Date Night
- 🟡 SERP APIs: Local restaurants, activities, events
- 🟢 Relationship stage filter (first date vs anniversary)
- 🟢 Date idea generator

### Reunions
- 🔴 **Split by type** (family vs school vs friends)
- 🟡 SERP APIs: Event venues, catering
- 🟢 Memory book creator
- 🟢 Photo sharing

### All Party Templates
- 🔴 **Batch migrate to database-driven** (shared schema)
- 🟡 SERP APIs: Venues, catering, entertainment
- 🟢 Consistent UX across all party types

---

## 📈 Success Milestones

### Week 1
```
✓ Wedding template: 0 UX bugs
✓ Venues tab: Shows "Coming Soon" message
✓ Google Places API: Account set up
```

### Week 2
```
✓ Venues tab: 10+ results per destination (Google Places)
✓ Vendors tab: 5+ results per category (Yelp)
✓ Wedding template: Fully functional
```

### Week 4
```
✓ Guest invite system: Live for weddings
✓ 90% of guests submit origin city
✓ Personalized flights shown
```

### Week 6
```
✓ 3 templates fully SERP-integrated (Wedding, Bachelor, Corporate)
✓ 80% of tabs show real results
✓ Average 15+ results per tab
```

### Week 8
```
✓ 50% of templates database-driven
✓ Admin UI for template management
✓ 0 hardcoded templates
```

---

## 🚀 Developer Quick Start

### Fix Wedding Bugs (Today)

**1. Button State Bug**
```typescript
// File: client/src/pages/experience-template.tsx
// Line: ~1800-1900

// BEFORE (broken):
const [detailsSubmitted, setDetailsSubmitted] = useState(false);
<Button disabled={!detailsSubmitted} onClick={() => setWeddingMode("guest")}>
  Guest Activities
</Button>

// AFTER (fixed):
<Button onClick={() => setWeddingMode("guest")}>
  Guest Activities
</Button>

// Remove all detailsSubmitted references
```

**2. Wedding Date Field**
```typescript
// Add after destination field:

const [weddingDate, setWeddingDate] = useState<Date | undefined>();
const [isMultiDayWedding, setIsMultiDayWedding] = useState(false);

// Single date picker:
<FormField
  control={form.control}
  name="weddingDate"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Wedding Date</FormLabel>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">
            {weddingDate ? format(weddingDate, "PPP") : "Select date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <Calendar
            mode="single"
            selected={weddingDate}
            onSelect={setWeddingDate}
          />
        </PopoverContent>
      </Popover>
    </FormItem>
  )}
/>

// Toggle for multi-day:
<Checkbox 
  checked={isMultiDayWedding}
  onCheckedChange={setIsMultiDayWedding}
  label="Multi-day wedding weekend"
/>

{isMultiDayWedding && (
  // Show start/end date pickers
)}
```

---

## 🔍 Testing Checklist

### Before Launch (Wedding Template)

**Functionality:**
- [ ] "Planning Mode" button works without form submission
- [ ] "Guest Activities Mode" button works without form submission
- [ ] Mode switching persists on page refresh
- [ ] Wedding date field appears
- [ ] Single date selection works
- [ ] Multi-day toggle works
- [ ] Date range selection works (if multi-day)
- [ ] State persists in sessionStorage

**Data:**
- [ ] Venues tab shows "Coming Soon" (or live results if API ready)
- [ ] Vendors tab shows "Coming Soon" (or live results if API ready)
- [ ] No console errors
- [ ] Page load time < 2 seconds

**Cross-Browser:**
- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Mobile (iOS/Android)

---

## 📞 Need Help?

**Questions:**
- Architecture decisions → Ask product/tech lead
- API integration → Check `/server/services/` for patterns
- Database schema → See `/server/seeds/experience-template-tabs.seed.ts`
- UI components → Check `/client/src/components/ui/`

**Resources:**
- Full Report: `TEMPLATE_ANALYSIS_REPORT.md` (62 KB, comprehensive)
- Executive Summary: `TEMPLATE_ANALYSIS_EXECUTIVE_SUMMARY.md` (quick reference)
- This File: `TEMPLATE_PRIORITIES.md` (visual roadmap)

---

**Last Updated:** February 1, 2025  
**Next Review:** After Week 2 (Feb 15, 2025)
