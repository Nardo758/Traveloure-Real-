# Testing Checklist - Design System Update

## Quick Start Testing

### Start Development Server
```bash
cd /home/leon/Traveloure-Platform
npm run dev
```

Then navigate to `http://localhost:5000` (or your configured port)

---

## Visual Testing

### ✅ ExperienceCard Component

**Test URL:** Landing page → "Popular Experiences" section

#### Desktop (1024px+)
- [ ] Cards display in 3-column grid
- [ ] All 6 experience cards visible
- [ ] Images load and cover full height (192px)
- [ ] Gradient overlay visible on images
- [ ] Hot badge (red) appears on cards with trending ≥ 60
- [ ] Trending score badge (top-right) displays correctly
- [ ] Score colors: Red (90+), Orange (85-89), Amber (<85)
- [ ] Icon badge with category color displays
- [ ] Category tags (3 max + overflow) display
- [ ] Expert rates display
- [ ] Status indicator (Busy/Moderate/Quiet) shows with correct color
- [ ] Tip section (green) displays
- [ ] Stats footer shows: active count, trending, gems icons
- [ ] Hover effect: image scales to 110%
- [ ] Shadow elevates on hover
- [ ] Cards link to `/experiences/{slug}`

#### Tablet (768px-1024px)
- [ ] Cards display in 2-column grid
- [ ] All layout elements remain visible
- [ ] Text doesn't overflow or truncate incorrectly
- [ ] Touch targets are at least 44x44px

#### Mobile (320px-768px)
- [ ] Cards display in 1-column grid
- [ ] Cards stack vertically
- [ ] All elements remain readable
- [ ] Category tags wrap properly
- [ ] Image maintains aspect ratio
- [ ] Touch interactions work smoothly

#### Dark Mode
- [ ] Switch to dark mode (toggle in UI)
- [ ] Card backgrounds darken appropriately
- [ ] Text remains readable
- [ ] Category tag colors adapt
- [ ] Tip section adapts (green remains visible)
- [ ] Border colors adapt
- [ ] Shadows remain visible but appropriate

---

### ✅ TestimonialCard Component

**Test URL:** Landing page → "Success Stories" section

#### Desktop (1024px+)
- [ ] Cards display in 3-column grid
- [ ] All 3 testimonial cards visible
- [ ] Trip images load (128px height)
- [ ] Gradient overlay on images
- [ ] Trip type badge (top-left, white) visible
- [ ] Destination with map pin visible on image
- [ ] 5-star rating displays correctly (filled stars)
- [ ] Testimonial text line-clamps at 4 lines
- [ ] Expert info section has background
- [ ] Expert name displays
- [ ] Heat score badge (red) displays correctly
- [ ] Verified checkmark (green) shows
- [ ] Expert rate displays
- [ ] Value saved section (green background) displays
- [ ] Value amount is prominent
- [ ] Author avatar (gradient with initials) displays
- [ ] Author name and location display
- [ ] Hover effect: shadow elevates

#### Tablet & Mobile
- [ ] 2-column → 1-column responsive layout
- [ ] All elements remain visible and readable
- [ ] Text doesn't overflow
- [ ] Touch targets work

#### Dark Mode
- [ ] Card backgrounds adapt
- [ ] Text remains readable on images
- [ ] Expert info section background adapts
- [ ] Green accents remain visible
- [ ] Value saved section remains prominent

---

### ✅ StatCard Component

**Test URL:** Landing page → "Platform Intelligence" section

#### Desktop (1024px+)
- [ ] Cards display in 4-column grid
- [ ] All 4 stat cards visible
- [ ] Icon displays with color
- [ ] Icon has subtle glow effect
- [ ] Value displays large and color-coded
- [ ] Label displays below value
- [ ] Description displays
- [ ] Gradient bar at bottom visible
- [ ] **Hover:** Icon scales to 110%
- [ ] **Hover:** Glow effect intensifies
- [ ] **Hover:** Shadow elevates

#### Stats to Verify:
1. **8M+ Trips Planned** - Red icon (MapPin)
2. **500K+ Custom Itineraries** - Emerald icon (Calendar)
3. **$500+ Average Savings** - Violet icon (Zap)
4. **33K+ 5-Star Reviews** - Amber icon (Star)

#### Tablet & Mobile
- [ ] 2-column → 1-column responsive layout
- [ ] All elements remain visible
- [ ] Icons maintain size

#### Dark Mode
- [ ] Card backgrounds adapt
- [ ] Icons remain colored
- [ ] Text readable
- [ ] Gradient bar visible

---

## Functional Testing

### Links & Navigation
- [ ] Experience cards link to `/experiences/{slug}`
- [ ] Links are keyboard navigable (Tab key)
- [ ] Links have visible focus states
- [ ] Clicking cards navigates correctly

### Data Display
- [ ] Trending scores are numbers (no "NaN" or undefined)
- [ ] Expert rates display correctly
- [ ] Active counts display as numbers
- [ ] Hidden gems counts display
- [ ] All testimonial data populates correctly

---

## Animation Testing

### Page Load Animations
- [ ] Cards fade in from bottom (y: 30 → 0)
- [ ] Cards appear with staggered delay
- [ ] Experience cards: 0.05s delay per card
- [ ] Testimonials: 0.1s delay per card
- [ ] Stats: 0.1s delay per card
- [ ] Animations only play once (viewport: once: true)

### Hover Animations
- [ ] Experience cards: Image scales smoothly (700ms)
- [ ] All cards: Shadow elevates (300ms)
- [ ] Stat cards: Icon scales (300ms)
- [ ] Stat cards: Glow intensifies (300ms)
- [ ] No jank or stuttering

### Reduced Motion
- [ ] Open browser DevTools
- [ ] Emulate "prefers-reduced-motion: reduce"
- [ ] Verify animations are disabled/simplified

---

## Responsive Testing

### Breakpoints to Test
```
Mobile Small:  320px
Mobile Large:  480px
Tablet:        768px
Desktop Small: 1024px
Desktop Large: 1440px
Wide:          1920px
```

### Grid Layouts by Breakpoint
| Section | 320px | 768px | 1024px+ |
|---------|-------|-------|---------|
| Experiences | 1 col | 2 col | 3 col |
| Testimonials | 1 col | 2 col | 3 col |
| Stats | 1 col | 2 col | 4 col |

### Test Each Breakpoint:
- [ ] 320px: All content readable, no overflow
- [ ] 480px: Cards scale appropriately
- [ ] 768px: Grid switches to 2 columns
- [ ] 1024px: Grid switches to 3/4 columns
- [ ] 1440px: Cards maintain max-width
- [ ] 1920px: Content centered, reasonable max-width

---

## Browser Testing

### Chrome/Edge (Chromium)
- [ ] All features work
- [ ] Animations smooth
- [ ] Gradients render correctly
- [ ] Backdrop blur works

### Firefox
- [ ] All features work
- [ ] CSS Grid works
- [ ] Gradients render
- [ ] Animations smooth

### Safari (if available)
- [ ] iOS Safari: Touch interactions work
- [ ] Backdrop blur fallback (if unsupported)
- [ ] Gradients render
- [ ] Animations smooth

---

## Accessibility Testing

### Keyboard Navigation
- [ ] Tab through all cards in order
- [ ] Focus states visible (outline/ring)
- [ ] Enter key activates links
- [ ] Shift+Tab navigates backwards
- [ ] No keyboard traps

### Screen Reader Testing (if available)
- [ ] Cards announce as links
- [ ] Images have alt text
- [ ] Badges announce meaningful information
- [ ] Heading structure is logical (h2 → h3 → h4)
- [ ] Stats are announced correctly

### Color Contrast (use browser DevTools)
- [ ] Text on images passes WCAG AA (gradient ensures this)
- [ ] Badge text passes WCAG AA
- [ ] Heat scores on white background pass
- [ ] All text colors pass contrast ratio 4.5:1 (normal text)
- [ ] All text colors pass contrast ratio 3:1 (large text)

### Focus Management
- [ ] Focus visible on all interactive elements
- [ ] Focus order matches visual order
- [ ] No invisible focus states

---

## Performance Testing

### Page Load
- [ ] Initial load time < 3 seconds (on fast connection)
- [ ] Images lazy-load (check Network tab)
- [ ] No layout shift (CLS < 0.1)
- [ ] Smooth scrolling

### Animation Performance
- [ ] Open Chrome DevTools → Performance
- [ ] Record interaction (hover, scroll)
- [ ] Check for 60fps (green bars)
- [ ] No long tasks (>50ms)

### Memory
- [ ] No memory leaks on navigation
- [ ] Animations don't cause excessive repaints
- [ ] Images release memory when out of viewport

---

## Integration Testing

### Data Flow
- [ ] experienceCategories array loads correctly
- [ ] All 6 experience categories render
- [ ] testimonials array loads correctly
- [ ] All 3 testimonials render
- [ ] impactStats array loads correctly
- [ ] All 4 stats render

### Component Props
- [ ] All required props are passed
- [ ] Optional props (delay, isHot, etc.) work
- [ ] TypeScript types are correct (no type errors)
- [ ] Default values work (status defaults to "Moderate")

---

## Visual Regression Testing

### Before/After Screenshots
Take screenshots of:
1. **Full landing page** (light mode)
2. **Full landing page** (dark mode)
3. **Experience Categories section** (close-up)
4. **Testimonials section** (close-up)
5. **Stats section** (close-up)
6. **Mobile view** (320px width)
7. **Tablet view** (768px width)
8. **Hover states** (each card type)

Compare against reference design to ensure:
- [ ] Badge positioning matches
- [ ] Colors match reference
- [ ] Typography matches
- [ ] Spacing matches
- [ ] Shadows match

---

## Edge Cases

### Long Text
- [ ] Long experience names don't break layout
- [ ] Long testimonials truncate correctly (line-clamp-4)
- [ ] Long expert names don't overflow
- [ ] Long tips truncate or wrap properly (line-clamp-3)

### Missing Data
- [ ] Cards render if optional props are missing
- [ ] Default values display correctly
- [ ] No JavaScript errors in console

### Many Categories
- [ ] Only 3 categories show + "+X" overflow badge
- [ ] Overflow count calculates correctly

### Zero Values
- [ ] Zero active count: stat doesn't show or shows "0"
- [ ] Zero trending: displays "0"
- [ ] Zero gems: displays "0"

---

## Production Readiness

### Code Quality
- [ ] No console.log statements
- [ ] No TypeScript errors (`npm run check`)
- [ ] No ESLint warnings
- [ ] No unused imports
- [ ] Proper data-testid attributes present

### Documentation
- [ ] README.md updated (if needed)
- [ ] DESIGN_SYSTEM_UPDATE.md complete ✅
- [ ] DESIGN_COMPARISON.md complete ✅
- [ ] Component JSDoc comments (if required)

### Git
- [ ] Changes committed with descriptive message
- [ ] No merge conflicts
- [ ] Feature branch created (if using Git Flow)

---

## Sign-Off

### Developer Testing
- [ ] All visual tests pass
- [ ] All functional tests pass
- [ ] All responsive tests pass
- [ ] All accessibility tests pass
- [ ] Performance is acceptable
- [ ] Code reviewed (self or peer)

### Stakeholder Review
- [ ] Design team approves visual implementation
- [ ] Product team approves functionality
- [ ] UX team approves interactions

### Deployment
- [ ] Staging deploy successful
- [ ] Smoke tests on staging pass
- [ ] Ready for production deployment

---

## Quick Test Commands

```bash
# Start dev server
npm run dev

# TypeScript type check
npm run check

# Build for production (if tsx is installed)
npm run build

# Check bundle size
npm run build && ls -lh dist/
```

---

## Known Issues / Future Work

### To Address:
- [ ] Image optimization (consider next/image or similar)
- [ ] Loading states for cards
- [ ] Error states for failed image loads
- [ ] Skeleton loaders for initial render
- [ ] API integration for dynamic data

### Nice to Have:
- [ ] Filter by category
- [ ] Sort by trending/price
- [ ] Favorites system
- [ ] Compare experiences
- [ ] Print styles

---

**Testing Started:** [Date]  
**Testing Completed:** [Date]  
**Tester:** [Name]  
**Status:** [ ] Pass / [ ] Fail / [ ] Blocked
