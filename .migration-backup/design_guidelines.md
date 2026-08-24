# Travel Planning Platform Design Guidelines

## Design Approach
**Reference-Based**: Drawing from Airbnb's visual storytelling, Booking.com's marketplace clarity, and Expedia's comparison tools. Travel platforms succeed through immersive imagery combined with streamlined booking flows.

## Core Design Elements

### Typography
- **Primary Font**: Inter (400, 500, 600, 700) via Google Fonts CDN
- **Display**: 48-64px bold for hero headlines
- **Headings**: 24-32px semibold for section titles
- **Body**: 16px regular, 18px for featured content
- **UI Labels**: 14px medium for buttons, tags, metadata

### Layout System
**Spacing Units**: Tailwind units of 2, 4, 6, 8, 12, 16, 24 (e.g., p-4, gap-8, mb-12)
- Desktop container: max-w-7xl with px-8
- Content sections: py-16 to py-24
- Component spacing: gap-6 to gap-8
- Card padding: p-6

### Component Library

**Navigation**
- Sticky header with glassmorphism effect (bg-white/80 backdrop-blur)
- Logo left, search bar center (expanded), cart icon + user menu right
- Secondary nav: Categories (Hotels, Activities, Dining, Experiences) with icon prefixes

**Hero Section**
- Full-width background image (1920x800px) with subtle gradient overlay
- Centered search interface with large input, location autocomplete, date pickers, guest selector
- Headline above search: "Plan Your Perfect Journey" (56px bold, white text with subtle shadow)
- CTA buttons on image use backdrop-blur-md with bg-white/20 treatment

**Marketplace Cards**
- Grid layout: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
- Card structure: Image (16:9 ratio), heart icon (top-right absolute), title, location pin, rating stars, price (bold), "Add to Cart" button
- Hover: Subtle lift (translate-y-1), shadow increase
- Images: 400x225px minimum

**Cart Panel**
- Slide-in sidebar (fixed right, w-96)
- Header: "Your Itinerary" with item count badge
- Cart items: Thumbnail (80x80), title, date/time, price, remove icon
- Sticky footer: Subtotal, "Optimize with AI" button (gradient primary), "Checkout" button

**AI Comparison View**
- Split-screen layout: 50/50 columns with vertical divider
- Each side: Itinerary timeline with day-by-day cards, total cost, duration, optimization score
- Top toggle: "Current Plan" vs "AI Optimized Plan"
- Highlight differences: Green badges for improvements, red for conflicts
- Bottom CTA: "Apply Optimized Itinerary"

**Search & Filters**
- Left sidebar (w-72): Collapsible filter groups with checkboxes/range sliders
- Price range, ratings, amenities, activity types, meal preferences
- Active filters as dismissible chips above results

**Booking Flow**
- Multi-step progress indicator (dots with labels)
- Forms: Generous spacing (gap-4), clear field labels above inputs
- Review section: Summary cards with edit icons
- Payment: Card mockup visual, secure badge indicators

**Featured Sections**
- "Trending Destinations": Large image cards (600x400) in 3-column grid
- "Top Activities": Horizontal scrollable carousel with 280x200 cards
- "Local Dining Experiences": Mixed layout with one large feature + 4 smaller tiles

**Footer**
- 4-column layout: Company (About, Careers), Support (Help, Contact), Discover (Blog, Guides), Connect (Social icons)
- Newsletter signup: Inline form with email input + subscribe button
- Trust indicators: Payment methods, certifications
- Bottom bar: Copyright, legal links, language/currency selectors

### Images
**Hero**: Stunning travel destination (mountain landscape, beach sunset, or city skyline) - 1920x800px
**Destination Cards**: High-quality location photography - 400x225px each
**Activity Cards**: Action shots (hiking, dining, cultural experiences) - 280x200px
**Hotel Listings**: Property exteriors and featured rooms - 400x225px
**Dining**: Food photography with ambiance shots - 400x225px

### Interaction Patterns
- Smooth scroll behavior for anchor navigation
- Loading skeletons for card grids (pulse animation)
- Toast notifications for cart additions (slide-in from top-right)
- Date pickers: Calendar overlay with range selection
- Autocomplete: Dropdown with location suggestions, icons for city/country
- Icon library: Heroicons via CDN

### Accessibility
- Focus states: 2px blue ring with offset
- All interactive elements minimum 44x44px touch target
- Form inputs with visible labels and error states
- ARIA labels for icon-only buttons
- Keyboard navigation through all interactive elements

**No animations** beyond functional micro-interactions (hover states, loading indicators). Focus on clarity and usability over decorative motion.