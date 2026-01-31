# Step 2: Frontend Integration - Add "Book This Trip" Button

## 🎯 Goal
Add "Book This Trip" button to each variant on the comparison page.

---

## 📝 Part A: Add Imports

Open `client/src/pages/itinerary-comparison.tsx`

**At the top, add these imports:**

```typescript
// Add these two imports near the other imports (around line 5-10)
import { BookThisTripButton } from '@/components/ItineraryComparisonWithBooking';
import { useAuth } from '@/hooks/use-auth';
```

---

## 📝 Part B: Get User Info

Inside the main component function (around line 115), **add after the route params:**

```typescript
export default function ItineraryComparisonPage() {
  const params = useParams();
  const id = params.id as string;
  const [, setLocation] = useLocation();
  
  // ADD THIS:
  const { user } = useAuth();
  const userId = user?.id || 'guest';
  const userEmail = user?.email;
  
  // ... rest of component
```

---

## 📝 Part C: Add Button to Variant Cards

Find the `<CardFooter>` section (around line 783). It currently looks like:

```typescript
<CardFooter>
  <Button
    variant={selectedVariantId === variant.id ? "default" : "outline"}
    className="w-full"
    onClick={(e) => {
      e.stopPropagation();
      selectMutation.mutate(variant.id);
    }}
    disabled={selectMutation.isPending}
  >
    {selectedVariantId === variant.id ? "Selected" : "Select This Plan"}
  </Button>
</CardFooter>
```

**Replace with:**

```typescript
<CardFooter className="flex gap-2">
  <Button
    variant={selectedVariantId === variant.id ? "default" : "outline"}
    className="flex-1"
    onClick={(e) => {
      e.stopPropagation();
      selectMutation.mutate(variant.id);
    }}
    disabled={selectMutation.isPending}
  >
    {selectedVariantId === variant.id ? "Selected" : "Select This Plan"}
  </Button>
  
  {/* NEW: Book This Trip button */}
  <BookThisTripButton
    variant={variant}
    comparison={data.comparison}
    userId={userId}
    userEmail={userEmail}
    className="flex-1"
  />
</CardFooter>
```

---

## 📝 Part D: Add Button to Selected Plan Section

Find the "Plan Selected" card (around line 819). It looks like:

```typescript
{data?.comparison?.selectedVariantId && (
  <Card className="border-primary bg-primary/5">
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Check className="h-8 w-8 text-primary" />
          <div>
            <h3 className="font-semibold">Plan Selected</h3>
            <p className="text-sm text-muted-foreground">
              Ready to proceed with your{" "}
              {data.variants.find((v) => v.id === data.comparison.selectedVariantId)?.name || "selected"}{" "}
              plan
            </p>
          </div>
        </div>
        <Button
          onClick={() => applyToCartMutation.mutate()}
          disabled={applyToCartMutation.isPending}
        >
          {applyToCartMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ShoppingCart className="mr-2 h-4 w-4" />
          )}
          Apply to Cart & Checkout
        </Button>
      </div>
    </CardContent>
  </Card>
)}
```

**Replace the Button with:**

```typescript
<BookThisTripButton
  variant={data.variants.find((v) => v.id === data.comparison.selectedVariantId)!}
  comparison={data.comparison}
  userId={userId}
  userEmail={userEmail}
/>
```

---

## 📍 Quick Search Method

If you can't find the exact lines:

1. **Search for:** `<CardFooter>` (Part C)
2. **Search for:** `Plan Selected` (Part D)
3. Add the BookThisTripButton component where indicated

---

## ✅ What This Does

- Adds "Book This Trip" button to **all 3 variant cards**
- Adds "Book This Trip" button to the **selected plan section**
- Clicking opens the booking modal with items from that variant
- User can immediately book their chosen itinerary

---

## 🧪 Test It

1. Save the file
2. Go to `/itinerary-comparison/:comparisonId` (or generate a new itinerary)
3. You should see "Book This Trip" buttons on each variant
4. Click one → Booking modal opens
5. Complete checkout with test card: `4242 4242 4242 4242`

---

**If everything works, you're DONE!** 🎉
