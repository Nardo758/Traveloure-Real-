# SERP API Implementation Guide

**Date:** February 1, 2025  
**Status:** ✅ Phase 1 MVP Complete  
**Focus:** Wedding Template Venue/Vendor Search

---

## 🎯 Implementation Summary

This implementation adds real-time venue and vendor search capabilities to the Traveloure Platform using Google Places API. Users can now discover and add real venues/vendors to their event planning cart.

### ✅ What's Been Implemented

1. **Backend Services**
   - `venue-search.service.ts` - Google Places API integration
   - API endpoints for venue search, details, and wedding vendors
   - Redis-based caching (24-hour TTL)
   - Graceful error handling

2. **Frontend Components**
   - `VenueCard` - Display venue information with photos, ratings, contact info
   - `VenueSearchPanel` - Search interface with filters and results
   - Integration with experience-template page

3. **Wedding Template Integration**
   - Venues tab: Wedding venues search
   - Vendors tab: Photographer, florist, caterer, DJ, etc.
   - Guest Accommodations tab: Hotels near venue
   - Rehearsal tab: Private dining venues

4. **Key Features**
   - Real-time search based on location
   - Minimum rating filter (3.5+, 4.0+, 4.5+)
   - Vendor type selector (8 types for wedding vendors)
   - Add to cart functionality
   - Cached results for performance
   - Mobile-responsive design

---

## 📋 Prerequisites

### Required
1. **Google Cloud Platform Account**
   - Create project at https://console.cloud.google.com/
   - Enable billing (free tier available)

2. **Enable Google APIs**
   - Places API (New)
   - Maps JavaScript API
   - Geocoding API

3. **Get API Key**
   - Go to: https://console.cloud.google.com/apis/credentials
   - Create credentials → API Key
   - Restrict key to only enabled APIs above
   - Copy the API key

---

## 🚀 Setup Instructions

### Step 1: Configure Environment Variables

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Add your Google Maps API key to `.env`:
```bash
GOOGLE_MAPS_API_KEY=AIzaSy... # Your actual API key
```

### Step 2: Install Dependencies (if needed)

```bash
npm install
```

All required dependencies are already in `package.json`:
- `@tanstack/react-query` (already installed)
- `lucide-react` (already installed)
- `drizzle-orm` (already installed)

### Step 3: Run Database Migrations (if needed)

The `serpCache` table should already exist from previous migrations. If not:

```bash
npm run db:push
```

### Step 4: Start the Development Server

```bash
npm run dev
```

The server should start on `http://localhost:5000`

### Step 5: Test the Implementation

1. Navigate to: http://localhost:5000/experience/wedding
2. Fill in "Wedding Location" (e.g., "New York")
3. Click the "Venues" tab
4. You should see real wedding venues from Google Places!

---

## 🧪 Testing the Integration

### Test Checklist

- [ ] **Venues Tab**
  - Enter location: "New York"
  - Verify venues appear with photos
  - Check ratings and reviews display correctly
  - Click "Add to Cart" - should add to cart
  - Click "Website" link - should open venue website

- [ ] **Vendors Tab**
  - Switch vendor type dropdown to each option
  - Verify results change based on vendor type
  - Test: Photographer, Florist, Caterer, DJ, etc.
  - Confirm different results for each vendor type

- [ ] **Filters**
  - Change "Minimum Rating" to 4.0+
  - Verify only highly-rated venues appear
  - Test with different locations

- [ ] **Edge Cases**
  - Empty location → Should show "Enter a Location" message
  - Invalid location → Should show "No venues found"
  - No internet → Should show error alert with retry button

- [ ] **Performance**
  - Second search for same location should be instant (cached)
  - Check browser Network tab - no duplicate requests

---

## 📁 Files Created/Modified

### New Files

1. **Backend**
   - `server/services/venue-search.service.ts` - Main service
   - `.env.example` - Environment variable template

2. **Frontend**
   - `client/src/components/venue-card.tsx` - Venue display card
   - `client/src/components/venue-search-panel.tsx` - Search interface

3. **Documentation**
   - `SERP_API_IMPLEMENTATION.md` (this file)

### Modified Files

1. **Backend**
   - `server/routes.ts` - Added 3 new API endpoints:
     - `GET /api/venues/search` - General venue search
     - `GET /api/venues/:placeId` - Venue details
     - `GET /api/venues/wedding-vendors` - Wedding vendor search

2. **Frontend**
   - `client/src/pages/experience-template.tsx` - Integrated VenueSearchPanel

---

## 🔌 API Endpoints

### 1. Search Venues
```http
GET /api/venues/search?location={city}&type={type}&keyword={keyword}&minRating={rating}
```

**Parameters:**
- `location` (required): City/location to search (e.g., "New York")
- `type` (optional): Venue type (`wedding_venue`, `hotel`, `restaurant`, `venue`)
- `keyword` (optional): Search keyword (e.g., "outdoor", "luxury")
- `minRating` (optional): Minimum rating (0, 3.5, 4.0, 4.5)
- `priceLevel` (optional): Price level filter ($, $$, $$$, $$$$)
- `radius` (optional): Search radius in meters (default: 50000)

**Response:**
```json
{
  "results": [
    {
      "id": "ChIJ...",
      "name": "The Plaza Hotel",
      "address": "768 5th Ave, New York, NY 10019",
      "rating": 4.5,
      "reviewCount": 12450,
      "priceLevel": 4,
      "photos": ["https://maps.googleapis.com/..."],
      "phone": "+1 212-759-3000",
      "website": "https://theplazany.com",
      "coordinates": { "lat": 40.7648, "lng": -73.9744 },
      "source": "google_places"
    }
  ],
  "count": 20,
  "source": "google_places"
}
```

### 2. Get Venue Details
```http
GET /api/venues/:placeId
```

**Parameters:**
- `placeId` (required): Google Place ID

**Response:** Same as venue object above with more details (opening hours, etc.)

### 3. Search Wedding Vendors
```http
GET /api/venues/wedding-vendors?location={city}&vendorType={type}
```

**Parameters:**
- `location` (required): City/location
- `vendorType` (required): One of:
  - `photographer`
  - `florist`
  - `caterer`
  - `dj`
  - `planner`
  - `videographer`
  - `makeup`
  - `baker`

**Response:**
```json
{
  "results": [...],
  "count": 15,
  "vendorType": "photographer",
  "location": "New York"
}
```

---

## 🎨 Component Usage

### VenueCard

```tsx
import { VenueCard } from "@/components/venue-card";

<VenueCard
  venue={{
    id: "place123",
    name: "The Plaza",
    address: "768 5th Ave, New York",
    rating: 4.5,
    reviewCount: 12450,
    priceLevel: 4,
    photos: ["https://..."],
    phone: "+1 212-759-3000",
    website: "https://theplazany.com",
    source: "google_places"
  }}
  onAddToCart={(venue) => {
    // Handle add to cart
  }}
  onViewDetails={(venue) => {
    // Handle view details
  }}
/>
```

### VenueSearchPanel

```tsx
import { VenueSearchPanel } from "@/components/venue-search-panel";

<VenueSearchPanel
  template="wedding"           // Template slug
  location="New York"          // Search location
  tabId="venues"               // Current tab ID
  onAddToCart={(item) => {
    // Add to cart handler
  }}
/>
```

---

## 🔧 Configuration

### Venue Type Configuration

The `VenueSearchPanel` automatically determines what to search based on template and tab:

```typescript
const VENUE_TYPE_CONFIG = {
  wedding: {
    venues: { 
      type: 'venue', 
      keyword: 'wedding venues', 
      label: 'Wedding Venues' 
    },
    vendors: { 
      type: 'venue', 
      keyword: 'wedding vendors', 
      label: 'Wedding Vendors' 
    },
    'guest-accommodations': { 
      type: 'hotel', 
      label: 'Hotels' 
    },
    rehearsal: { 
      type: 'restaurant', 
      keyword: 'private dining', 
      label: 'Rehearsal Dinner Venues' 
    }
  },
  'corporate-events': {
    venues: { 
      type: 'venue', 
      keyword: 'conference venues', 
      label: 'Conference Venues' 
    }
  }
  // ... more templates
};
```

### Cache Configuration

Caching is handled automatically in `venue-search.service.ts`:

```typescript
const CACHE_DURATION_HOURS = 24;  // Results cached for 24 hours
```

Cache keys: `venue-{location}-{type}-{keyword}`

### Rate Limiting

Google Places API limits:
- **Free Tier:** 0-100k requests/month free
- **Pricing:** $17 per 1k requests after free tier
- **Best Practice:** Cache aggressively (24h default)

---

## 🚀 Next Steps (Phase 2)

### Recommended Enhancements

1. **Yelp API Integration** (Vendor Reviews)
   - Add Yelp as secondary source for vendor ratings
   - Combine Google + Yelp data for richer profiles
   - Implementation: `server/services/yelp-fusion.service.ts`

2. **Booking.com API** (Hotels)
   - Replace basic hotel search with bookable options
   - Show real-time pricing and availability
   - Affiliate tracking for revenue

3. **Enhanced Filtering**
   - Price range slider ($-$$$$)
   - Distance from venue/city center
   - Availability calendar
   - Capacity filter (guest count)

4. **Vendor Comparison Tool**
   - Side-by-side comparison of 2-3 vendors
   - Quote request system
   - Saved favorites

5. **Template Expansion**
   - Bachelor/Bachelorette: Nightlife, activities
   - Corporate Events: Conference centers
   - Birthday: Party venues by age group

6. **Advanced Features**
   - Venue availability checking
   - Direct booking integration
   - Review aggregation (Google + Yelp + TripAdvisor)
   - Photo galleries with user uploads

---

## 🐛 Troubleshooting

### Issue: No venues showing up

**Check:**
1. Is `GOOGLE_MAPS_API_KEY` set in `.env`?
2. Is the API key valid? Test at: https://console.cloud.google.com/apis/credentials
3. Are the required APIs enabled?
   - Places API
   - Maps JavaScript API
   - Geocoding API
4. Check browser console for errors
5. Check server logs: `npm run dev` output

**Solution:**
```bash
# Verify API key is loaded
echo $GOOGLE_MAPS_API_KEY

# Restart server
npm run dev
```

### Issue: "Failed to fetch venues" error

**Possible causes:**
1. Invalid location name
2. API rate limit exceeded
3. Network connectivity issues
4. API key restrictions (IP/domain)

**Solution:**
1. Try a different location (e.g., "New York" instead of "NYC")
2. Check Google Cloud Console → Quotas
3. Check API key restrictions in GCP Console
4. Check browser Network tab for actual error

### Issue: Slow search results

**Causes:**
- First search after cache expiry
- Complex queries
- Network latency

**Solutions:**
1. Caching is automatic - second search is instant
2. Increase cache duration (currently 24h)
3. Consider preloading popular cities

### Issue: Photos not loading

**Causes:**
- Missing photo reference
- API key not authorized for Photos API

**Solution:**
1. Enable "Places API" in Google Cloud Console
2. Photos are optional - component handles missing photos gracefully

---

## 💰 Cost Estimation

### Google Places API Pricing

**Free Tier:**
- 0-100,000 requests/month: **FREE**

**After Free Tier:**
- Text Search: $32 per 1,000 requests
- Place Details: $17 per 1,000 requests
- Place Photos: $7 per 1,000 requests

### Projected Costs (Monthly)

**Scenario 1: Low Traffic (1,000 users/month)**
- Searches: ~5,000 (5 searches per user)
- Cache hit rate: 80% → 1,000 API calls
- **Cost: $0** (within free tier)

**Scenario 2: Medium Traffic (10,000 users/month)**
- Searches: ~50,000
- Cache hit rate: 80% → 10,000 API calls
- **Cost: $0** (within free tier)

**Scenario 3: High Traffic (50,000 users/month)**
- Searches: ~250,000
- Cache hit rate: 80% → 50,000 API calls
- **Cost: $0** (within free tier)

**Scenario 4: Very High Traffic (500,000 users/month)**
- Searches: ~2,500,000
- Cache hit rate: 90% → 250,000 API calls
- Above free tier: 150,000 calls
- **Cost: ~$4,800/month**

### Cost Optimization Tips

1. **Aggressive Caching** ✅ Already implemented (24h)
2. **Batch Requests** - Combine multiple queries
3. **Client-Side Filtering** - Reduce API calls
4. **Lazy Loading** - Load details on demand
5. **Popular Cities Cache** - Preload common searches

---

## 📊 Analytics & Monitoring

### Recommended Tracking

1. **Usage Metrics**
   - Venue searches per day/week/month
   - Most searched locations
   - Popular vendor types
   - Cache hit rate

2. **Performance Metrics**
   - API response time
   - Cache performance
   - Error rate

3. **Business Metrics**
   - Venues added to cart
   - Conversion rate (search → add → book)
   - Popular templates using venue search

### Implementation (Future)

```typescript
// Track venue search event
analytics.track('venue_search', {
  template: 'wedding',
  location: 'New York',
  venueType: 'wedding_venue',
  resultsCount: 20,
  cacheHit: true
});

// Track venue add to cart
analytics.track('venue_add_to_cart', {
  venueId: 'ChIJ...',
  venueName: 'The Plaza',
  template: 'wedding',
  location: 'New York',
  price: 0, // External venue
  source: 'google_places'
});
```

---

## 🎓 Best Practices

### API Usage

1. **Always cache results** - Reduce API costs
2. **Handle errors gracefully** - Show user-friendly messages
3. **Validate inputs** - Prevent invalid API calls
4. **Rate limiting** - Protect your quota
5. **Monitor usage** - Set up alerts for quota usage

### UX Considerations

1. **Show loading states** - Skeleton cards while loading
2. **Empty states** - Clear instructions when no results
3. **Error recovery** - Retry button on failures
4. **Progressive disclosure** - Load details on demand
5. **Mobile optimization** - Touch-friendly cards

### Security

1. **API key security**
   - Never commit `.env` file
   - Use environment variables
   - Restrict API key to specific domains
   - Rotate keys periodically

2. **Input validation**
   - Sanitize location inputs
   - Validate venue IDs
   - Prevent injection attacks

---

## 📚 Additional Resources

### Documentation Links

- **Google Places API:** https://developers.google.com/maps/documentation/places/web-service
- **API Key Best Practices:** https://cloud.google.com/docs/authentication/api-keys
- **React Query:** https://tanstack.com/query/latest/docs/react/overview

### Example Implementations

Check `SERP_API_QUERIES.json` for:
- Query patterns for all templates
- Filter configurations
- API endpoint specifications

### Support

For issues or questions:
1. Check server logs: `npm run dev`
2. Review browser console errors
3. Test API endpoints directly: `/api/venues/search?location=New York&type=venue`

---

## ✅ Phase 1 Completion Checklist

- [x] Backend venue search service implemented
- [x] API endpoints created and tested
- [x] Caching layer integrated
- [x] Frontend VenueCard component built
- [x] Frontend VenueSearchPanel component built
- [x] Integration with wedding template
- [x] Vendors tab with type selector
- [x] Error handling and graceful degradation
- [x] Mobile-responsive design
- [x] Documentation complete
- [x] .env.example with API key instructions

---

**Implementation completed:** February 1, 2025  
**Phase 2 target:** Add Yelp, Booking.com, and expand to all templates  

🎉 **The wedding template now has live venue and vendor search powered by Google Places API!**
