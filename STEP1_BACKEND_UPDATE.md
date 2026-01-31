# Step 1: Backend Integration - Add Optimization

## 🎯 Goal
Update `/api/ai/generate-itinerary` to create a comparison with 2 optimized variants.

---

## 📝 What to Do

Find this section in `server/routes.ts` (around line 3500):

```typescript
res.json({
  id: savedItinerary.id,
  ...result,
  createdAt: savedItinerary.createdAt,
  status: savedItinerary.status
});
```

**Replace it with this:**

```typescript
// NEW: Create comparison and trigger optimization
const [comparison] = await db.insert(itineraryComparisons).values({
  userId,
  title: `${destination} Trip`,
  destination,
  startDate: dates.start,
  endDate: dates.end,
  budget: budget?.toString() || null,
  travelers: travelers || 1,
  status: 'generating',
}).returning();

// Convert generated itinerary to baseline items
const baselineItems = result.dailyItinerary.flatMap((day: any, dayIndex: number) => {
  return day.activities.map((activity: any) => ({
    id: activity.id || `${day.day}-${activity.time}`,
    name: activity.name || activity.title,
    description: activity.description,
    serviceType: activity.type || 'activities',
    price: activity.estimatedCost || 0,
    rating: 4.5, // Default rating
    location: activity.location || destination,
    duration: activity.duration || 60,
    dayNumber: dayIndex + 1,
    timeSlot: activity.time?.includes('morning') ? 'morning' 
            : activity.time?.includes('afternoon') ? 'afternoon' 
            : 'evening',
  }));
});

// Get available services for optimization
const availableServices = await db
  .select()
  .from(providerServices)
  .where(eq(providerServices.status, 'active'))
  .limit(100);

// Import optimizer
const { generateOptimizedItineraries } = await import('./itinerary-optimizer');

// Trigger optimization in background (don't await - respond immediately)
generateOptimizedItineraries(
  comparison.id,
  userId,
  baselineItems,
  availableServices,
  destination,
  dates.start,
  dates.end,
  budget,
  travelers
).catch(err => {
  console.error('Optimization error:', err);
  // Update comparison status to error
  db.update(itineraryComparisons)
    .set({ status: 'error' })
    .where(eq(itineraryComparisons.id, comparison.id))
    .catch(console.error);
});

// Return comparison ID immediately (optimization happens in background)
res.json({
  success: true,
  comparisonId: comparison.id,
  itineraryId: savedItinerary.id,
  message: 'Itinerary generated! Creating optimized variants...',
  ...result,
  createdAt: savedItinerary.createdAt,
  status: savedItinerary.status
});
```

---

## 📍 Where to Find It

1. Open `server/routes.ts`
2. Search for: `app.post("/api/ai/generate-itinerary"`
3. Scroll down to the `res.json({` at the end
4. Replace that entire response section with the code above

---

## ✅ What This Does

1. **Creates a comparison** with status "generating"
2. **Converts AI itinerary** to baseline items (day-by-day activities)
3. **Triggers optimization** to create 2 better variants
4. **Returns comparisonId** immediately (optimization runs in background)
5. Frontend redirects to `/itinerary-comparison/:comparisonId`

---

## 🧪 Test It

After making this change:

```bash
# Restart the server (in Replit, just save the file)

# Test the endpoint
curl -X POST http://localhost:5000/api/ai/generate-itinerary \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "Paris, France",
    "dates": {"start": "2026-03-15", "end": "2026-03-20"},
    "travelers": 2,
    "interests": ["museums", "food"]
  }'
```

Should return:
```json
{
  "success": true,
  "comparisonId": "abc123...",
  "message": "Itinerary generated! Creating optimized variants..."
}
```

---

**Once this works, move to Step 2!** 🚀
