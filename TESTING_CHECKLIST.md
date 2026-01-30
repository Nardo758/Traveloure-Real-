# Testing Checklist for Discover Page Updates

**Date:** January 29, 2025  
**Task:** Verify Discover page card design and data flows  
**Status:** Ready for Testing

---

## 🎨 Visual Testing Checklist

### ServiceCard Component Design

#### Image Header (Height: 192px)
- [ ] Image loads for each service
- [ ] Gradient overlay visible (black 70% bottom → transparent top)
- [ ] Hover effect scales image to 1.1x smoothly (700ms transition)
- [ ] Image doesn't overflow rounded corners

#### Badges - Top Right (Heat Score)
- [ ] White rounded square badge (11x11, rounded-xl)
- [ ] Score displays correctly (rating * 20)
- [ ] Color coding works:
  - [ ] Score ≥90: Red (#FF385C)
  - [ ] Score 80-89: Orange
  - [ ] Score <80: Amber
- [ ] Badge has shadow and 95% opacity

#### Badges - Top Left (Hot/Trending)
- [ ] "Hot" badge shows for services with rating ≥4.7 AND reviews ≥10
  - [ ] Red background (#FF385C)
  - [ ] White text and lightning icon (Zap)
- [ ] "Top Expert" badge shows for rating ≥4.8 AND reviews ≥5 (if not "Hot")
  - [ ] Amber background
  - [ ] Trophy icon visible
- [ ] Review count badge shows when reviews > 0
  - [ ] White/90 background
  - [ ] Gray text
  - [ ] Users icon visible

#### Title & Icon - Bottom of Image
- [ ] Service name displays in white, bold, 20px font
- [ ] Service name truncates properly (line-clamp-1)
- [ ] Location shows with map pin icon
- [ ] Location text is white/80 opacity
- [ ] Verified checkmark shows for services with ≥3 reviews
- [ ] Category icon displays in colored rounded square (48x48)
- [ ] Icon container has shadow

#### Card Body (Padding: 16px)
- [ ] Description text displays (muted color)
- [ ] Description limited to 2 lines (line-clamp-2)
- [ ] 12px bottom margin after description

#### Category Tags
- [ ] Category name shows in purple pill badge
- [ ] Delivery timeframe shows in blue pill badge with clock icon
- [ ] Tags wrap properly on mobile
- [ ] 6px gap between tags

#### Pricing & Status Section
- [ ] Price displays large and bold ($XX)
- [ ] "per service" helper text in green
- [ ] Status badge shows with correct color:
  - [ ] Rating ≥4.5: Orange "Busy"
  - [ ] Rating 4.0-4.4: Yellow "Moderate"
  - [ ] Rating <4.0: Green "Available"
- [ ] Section wraps properly on mobile

#### Service Tips (Shows when rating ≥4.5)
- [ ] Emerald green background panel
- [ ] Sparkles icon visible in green
- [ ] Tip text displays correctly
- [ ] Text limited to 2 lines (line-clamp-2)
- [ ] Different tip for Top Expert vs regular high-rated

#### Bottom Stats Row
- [ ] Border separator at top
- [ ] Star rating with filled amber star icon
- [ ] Review count with Users icon
- [ ] Delivery method with Compass icon (if present)
- [ ] Stats spaced evenly
- [ ] Text color is muted

#### Add to Cart Button
- [ ] Full width button
- [ ] Shopping cart icon when not added
- [ ] Check icon when added
- [ ] Green background when added
- [ ] Button disabled when adding
- [ ] "Adding..." text shows during add
- [ ] "Added" text shows after success

---

## 📱 Responsive Grid Testing

### Grid Layout Breakpoints
- [ ] **Mobile (< 768px):** 1 column
- [ ] **Tablet (768-1024px):** 2 columns
- [ ] **Laptop (1024-1280px):** 3 columns
- [ ] **Desktop (> 1280px):** 4 columns
- [ ] Gap between cards: 24px (1.5rem)
- [ ] Cards maintain aspect ratio at all sizes
- [ ] Cards don't stretch or squish

### Card Sizing
- [ ] Cards have equal height in same row
- [ ] Flex column layout works (content at top, button at bottom)
- [ ] No horizontal scrolling on any screen size
- [ ] Padding consistent at all sizes

---

## 🌗 Dark Mode Testing

### Background Colors
- [ ] Card background: `bg-card dark:bg-card`
- [ ] Border: `border border-border`
- [ ] Shadows adjust for dark mode

### Text Colors
- [ ] Service name: White (stays white in dark mode)
- [ ] Description: Muted (adjusts for dark mode)
- [ ] Price: Foreground (adjusts for dark mode)
- [ ] Category tags: Proper dark variants
- [ ] Tips background: `dark:bg-emerald-900/20`
- [ ] Tips text: `dark:text-emerald-300`

### Badge Colors (Dark Mode)
- [ ] Heat score badge: `dark:bg-white/90`
- [ ] Status badges: Dark variants (e.g., `dark:bg-orange-900/20`)
- [ ] Category tags: Dark variants (e.g., `dark:bg-purple-900/30`)

### Hover Effects
- [ ] Shadow increases on hover
- [ ] Image scales smoothly
- [ ] No color flickering

---

## 🔌 API & Data Flow Testing

### GET `/api/discover`
1. **Basic Fetch**
   - [ ] Navigate to `/discover`
   - [ ] Services load and display
   - [ ] No console errors

2. **Search Query**
   - [ ] Type in search box
   - [ ] Wait for debounce (300ms)
   - [ ] API called with `?q=...` parameter
   - [ ] Results update

3. **Category Filter**
   - [ ] Select category from dropdown
   - [ ] API called with `?categoryId=...` parameter
   - [ ] Results filtered correctly

4. **Location Filter**
   - [ ] Type in location field
   - [ ] API called with `?location=...` parameter
   - [ ] Results filtered correctly

5. **Price Range Filter**
   - [ ] Set min price
   - [ ] API called with `?minPrice=...` parameter
   - [ ] Set max price
   - [ ] API called with `?maxPrice=...` parameter
   - [ ] Results filtered correctly

6. **Rating Filter**
   - [ ] Adjust rating slider
   - [ ] API called with `?minRating=...` parameter
   - [ ] Results filtered correctly

7. **Sort Options**
   - [ ] Select "Top Rated"
   - [ ] Results re-order by rating descending
   - [ ] Select "Price: Low to High"
   - [ ] Results re-order by price ascending
   - [ ] Select "Price: High to Low"
   - [ ] Results re-order by price descending
   - [ ] Select "Most Reviews"
   - [ ] Results re-order by review count descending

8. **Pagination**
   - [ ] More than 12 results triggers pagination
   - [ ] "Page X of Y" displays correctly
   - [ ] Previous button disabled on page 1
   - [ ] Next button disabled on last page
   - [ ] Page navigation works
   - [ ] API called with `?offset=...` parameter

9. **No Results**
   - [ ] Filter to impossible criteria
   - [ ] "No services found" message displays
   - [ ] Building icon shows
   - [ ] "Clear Filters" button appears
   - [ ] Clicking clears filters and shows results

### POST `/api/discover/recommendations`
1. **AI Recommendations**
   - [ ] Click "AI Suggestions" button
   - [ ] Button shows loading state (Loader2 icon spinning)
   - [ ] API called with current search context
   - [ ] Recommendations panel appears
   - [ ] Recommended categories display as clickable badges
   - [ ] Clicking category badge filters to that category
   - [ ] Suggestions text displays
   - [ ] Close button hides panel

2. **Error Handling**
   - [ ] If API key missing, shows error toast
   - [ ] If invalid request, shows error message
   - [ ] If network error, graceful degradation

### GET `/api/service-categories`
1. **Category Dropdown**
   - [ ] Categories load on page mount
   - [ ] "All categories" option present
   - [ ] All categories listed
   - [ ] Selecting category works

2. **Active Filters Display**
   - [ ] Selected category shows as badge
   - [ ] Clicking X on badge removes filter
   - [ ] "Clear all" button removes all filters

### GET `/api/cart`
1. **Cart Summary Bar**
   - [ ] Only shows when cart has items
   - [ ] Item count displays correctly
   - [ ] Total price displays
   - [ ] "View Cart" button links to `/cart`
   - [ ] "Compare AI Alternatives" button present

### POST `/api/cart`
1. **Add to Cart**
   - [ ] Click "Add to Cart" button
   - [ ] Button shows "Adding..." during request
   - [ ] Button changes to green "Added" after success
   - [ ] Check icon replaces shopping cart icon
   - [ ] Success toast notification appears
   - [ ] Cart summary bar updates
   - [ ] Item count increments
   - [ ] Total updates

2. **Add to Cart (No Auth)**
   - [ ] Log out
   - [ ] Click "Add to Cart"
   - [ ] Error toast: "Sign in required"
   - [ ] Redirect to login (optional)

3. **Add to Cart Error**
   - [ ] Simulate server error
   - [ ] Error toast displays with message
   - [ ] Button returns to "Add to Cart" state
   - [ ] Cart state doesn't change

### GET `/api/expert-templates`
1. **Templates Tab**
   - [ ] Switch to "Trip Packages" tab
   - [ ] Expert templates section displays (if any exist)
   - [ ] Template cards show:
     - [ ] Cover image or placeholder
     - [ ] Featured badge (if applicable)
     - [ ] Price
     - [ ] Destination with map pin
     - [ ] Title
     - [ ] Description (truncated)
     - [ ] Duration
     - [ ] Rating and review count (if > 0)
     - [ ] Sales count (if > 0)
     - [ ] Highlights (first 2, +X more)
     - [ ] "View & Purchase" button
   - [ ] Clicking card navigates to template detail
   - [ ] "View All X Templates" button shows if > 6 templates

---

## 🧪 Expert & Experience Endpoints Testing

### GET `/api/experts`
- [ ] Expert cards display on experts page
- [ ] Filtering by experience type works

### GET `/api/experts/:id`
- [ ] Clicking expert card navigates to detail page
- [ ] Expert profile loads
- [ ] 404 page shows for invalid expert ID

### GET `/api/experts/:id/services`
- [ ] Expert services tab displays
- [ ] Services list loads
- [ ] Empty state if no services

### GET `/api/experts/:id/reviews`
- [ ] Reviews tab displays
- [ ] Currently shows empty state (placeholder)
- [ ] No errors in console

### GET `/api/experience-types`
- [ ] Experience type cards display on landing
- [ ] All templates load

### GET `/api/experience-types/:slug`
- [ ] Clicking experience card navigates to template page
- [ ] Template detail loads by slug
- [ ] 404 page shows for invalid slug

---

## ⚡ Performance Testing

### Page Load
- [ ] Initial page load < 3 seconds
- [ ] Services render progressively (skeletons first)
- [ ] Images lazy load
- [ ] No layout shift during load

### Interactions
- [ ] Search debounce prevents excessive API calls
- [ ] Filter changes trigger single API call
- [ ] Add to cart responds immediately
- [ ] Pagination smooth (no flash)

### Images
- [ ] Images optimized (WebP where supported)
- [ ] Placeholder shows while loading
- [ ] No broken image icons
- [ ] Alt text present for accessibility

---

## ♿ Accessibility Testing

### Keyboard Navigation
- [ ] Tab through all cards
- [ ] Focus visible on all interactive elements
- [ ] Enter key activates links and buttons
- [ ] Escape closes filter panel (mobile)

### Screen Reader
- [ ] Card titles announced
- [ ] Prices announced
- [ ] Rating announced as "X out of 5 stars"
- [ ] Button states announced (disabled, loading)
- [ ] Live region updates for search results

### Color Contrast
- [ ] Text readable on all backgrounds (WCAG AA)
- [ ] Badge text readable (WCAG AA)
- [ ] Focus indicators visible
- [ ] Status indicators have sufficient contrast

### ARIA Labels
- [ ] Buttons have proper labels
- [ ] Test IDs present for testing
- [ ] Loading states announced
- [ ] Error messages announced

---

## 🐛 Error Scenarios

### Network Errors
- [ ] Service down: Shows error message
- [ ] Timeout: Shows timeout message
- [ ] 500 error: Shows generic error
- [ ] Graceful degradation (partial data still displays)

### Data Edge Cases
- [ ] Service with no description: Shows placeholder
- [ ] Service with no reviews: Hides rating section
- [ ] Service with no category: Uses default icon
- [ ] Service with no location: Shows "Remote"
- [ ] Service with $0 price: Displays correctly
- [ ] Service with very long name: Truncates properly

### User Edge Cases
- [ ] Empty search results: Shows helpful message
- [ ] No services in database: Shows empty state
- [ ] Logged out user: Cart features prompt login
- [ ] Network offline: Shows offline message

---

## 📊 Browser Compatibility

### Desktop Browsers
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

### Mobile Browsers
- [ ] iOS Safari
- [ ] Android Chrome
- [ ] Samsung Internet

### Features to Test
- [ ] CSS Grid layout
- [ ] Flexbox layout
- [ ] CSS animations (motion.div)
- [ ] Image object-fit
- [ ] Backdrop blur (filter panel)
- [ ] CSS gradients

---

## 🚀 Pre-Production Checklist

### Code Quality
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] No console warnings
- [ ] Proper error boundaries
- [ ] Loading states everywhere
- [ ] Proper null checks

### Performance
- [ ] Lighthouse score > 90
- [ ] First Contentful Paint < 2s
- [ ] Largest Contentful Paint < 3s
- [ ] No memory leaks (test with DevTools)

### Security
- [ ] No API keys exposed in client code
- [ ] CSRF tokens for mutations
- [ ] Input sanitization
- [ ] SQL injection prevention (server-side)

### Documentation
- [ ] API endpoints documented ✅ (See API_ENDPOINTS_VERIFICATION.md)
- [ ] Component props documented
- [ ] README updated
- [ ] Changelog updated

---

## 🎯 Success Criteria

### Must Have (P0)
- ✅ All ServiceCard visual elements match landing page design
- ✅ 4-column responsive grid layout
- ✅ All API endpoints working
- ✅ Dark mode fully functional
- ✅ Mobile responsive
- ✅ Add to cart working
- ✅ Search and filters working
- ✅ AI recommendations working

### Should Have (P1)
- ✅ Smooth animations
- ✅ Proper error handling
- ✅ Loading states
- ✅ Accessibility features
- ✅ Performance optimizations

### Nice to Have (P2)
- Real service images (currently using stock images)
- Expert reviews implementation (currently placeholder)
- Blog/Careers/Press endpoints
- Real-time trending data

---

## 📝 Testing Notes

### To Run Tests:
```bash
# 1. Start the development server
cd /home/leon/Traveloure-Platform
npm install
npm run dev

# 2. Open in browser
# Navigate to: http://localhost:5000/discover

# 3. Test with different user states
# - Logged out
# - Logged in as regular user
# - Logged in as expert

# 4. Test API endpoints directly
curl http://localhost:5000/api/discover
curl http://localhost:5000/api/service-categories
curl http://localhost:5000/api/experts

# 5. Test AI recommendations
curl -X POST http://localhost:5000/api/discover/recommendations \
  -H "Content-Type: application/json" \
  -d '{"query":"wedding planning","destination":"Paris"}'
```

### Testing Tools:
- **Browser DevTools:** Network tab, Console, Elements
- **React DevTools:** Component tree, Props inspection
- **Lighthouse:** Performance audit
- **axe DevTools:** Accessibility audit
- **Postman/Insomnia:** API testing

---

**Checklist Created:** January 29, 2025  
**Ready for Testing:** YES ✅  
**Estimated Testing Time:** 2-3 hours for complete test coverage
