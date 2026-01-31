/**
 * Wrapper component that adds "Book This Trip" functionality to itinerary comparison
 * Integrates BookingFlowModal with the comparison page
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShoppingCart, CreditCard } from 'lucide-react';
import BookingFlowModal from './booking/BookingFlowModal';

interface VariantItem {
  id: string;
  dayNumber: number;
  timeSlot: string;
  startTime: string;
  endTime: string;
  name: string;
  description: string;
  serviceType: string;
  price: string;
  rating: string;
  location: string;
  duration: number;
  travelTimeFromPrevious: number;
  isReplacement: boolean;
  replacementReason: string | null;
}

interface Variant {
  id: string;
  name: string;
  description: string;
  source: string;
  status: string;
  totalCost: string;
  totalTravelTime: number;
  averageRating: string;
  freeTimeMinutes: number;
  optimizationScore: number;
  aiReasoning: string;
  sortOrder: number;
  items: VariantItem[];
}

interface BookingButtonProps {
  variant: Variant;
  comparison: any;
  userId: string;
  userEmail?: string;
  className?: string;
}

export function BookThisTripButton({ variant, comparison, userId, userEmail, className }: BookingButtonProps) {
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  // Convert variant items to cart items format
  const convertToCartItems = (items: VariantItem[]) => {
    return items.map((item, index) => ({
      id: item.id || `item-${index}`,
      tripId: comparison.id,
      providerId: undefined, // Will be populated by availability check
      title: item.name,
      itemType: item.serviceType || 'activities',
      bookingType: (item.serviceType?.toLowerCase().includes('transport') ||
                   item.serviceType?.toLowerCase().includes('accommodation'))
        ? ('external' as const)
        : ('instant' as const),
      date: calculateItemDate(comparison.startDate, item.dayNumber),
      time: item.startTime || '09:00',
      price: parseFloat(item.price || '0'),
      location: item.location || comparison.destination,
      metadata: {
        description: item.description,
        duration: item.duration,
        dayNumber: item.dayNumber,
        timeSlot: item.timeSlot,
        rating: parseFloat(item.rating || '0'),
      },
    }));
  };

  // Calculate date based on start date and day number
  const calculateItemDate = (startDateStr: string, dayNumber: number): string => {
    const startDate = new Date(startDateStr);
    const itemDate = new Date(startDate);
    itemDate.setDate(startDate.getDate() + (dayNumber - 1));
    return itemDate.toISOString().split('T')[0];
  };

  const handleBookClick = () => {
    setIsBookingOpen(true);
  };

  const cartItems = convertToCartItems(variant.items);

  return (
    <>
      <Button
        onClick={handleBookClick}
        className={className}
        size="lg"
      >
        <CreditCard className="mr-2 h-4 w-4" />
        Book This Trip
      </Button>

      <BookingFlowModal
        isOpen={isBookingOpen}
        onClose={() => setIsBookingOpen(false)}
        cartItems={cartItems}
        tripData={{
          destinations: [{ city: comparison.destination, country: '', cityId: comparison.destination }],
          startDate: comparison.startDate,
          endDate: comparison.endDate,
          travelers: comparison.travelers || 1,
          experienceType: 'travel',
        }}
        userId={userId}
        userEmail={userEmail}
      />
    </>
  );
}

// Export helper functions for use in itinerary-comparison.tsx
export { convertToCartItems, calculateItemDate } from './booking/BookingFlowModal';
