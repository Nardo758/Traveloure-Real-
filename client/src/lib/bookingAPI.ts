/**
 * Booking API Client
 * Handles all booking-related API calls
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

export interface CartItem {
  id: string;
  tripId: string;
  providerId?: string;
  title: string;
  itemType: string;
  bookingType: 'instant' | 'request' | 'external';
  date: string;
  time?: string;
  price: number;
  location: string;
  metadata?: any;
}

export interface ProcessCartResponse {
  success: boolean;
  instantBookings: any[];
  pendingRequests: any[];
  externalLinks: any[];
  paymentRequired: number;
  paymentIntent?: {
    clientSecret: string;
    paymentIntentId: string;
    amount: number;
  };
  errors: string[];
}

export const bookingAPI = {
  /**
   * Process cart and create bookings
   */
  async processCart(
    userId: string,
    cartItems: CartItem[],
    paymentMethod: 'full' | 'deposit' = 'full'
  ): Promise<ProcessCartResponse> {
    const response = await fetch(`${API_BASE}/api/bookings/process-cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, cartItems, paymentMethod }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to process cart');
    }

    return response.json();
  },

  /**
   * Confirm booking after payment
   */
  async confirmPayment(bookingId: string, paymentIntentId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/api/bookings/confirm-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, paymentIntentId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to confirm payment');
    }

    return response.json();
  },

  /**
   * Check availability
   */
  async checkAvailability(
    providerId: string,
    date: string,
    time: string,
    quantity: number = 1
  ): Promise<{ available: boolean }> {
    const params = new URLSearchParams({ date, time, quantity: quantity.toString() });
    const response = await fetch(`${API_BASE}/api/bookings/availability/${providerId}?${params}`);

    if (!response.ok) {
      throw new Error('Failed to check availability');
    }

    return response.json();
  },

  /**
   * Get availability calendar
   */
  async getAvailabilityCalendar(
    providerId: string,
    startDate: string,
    endDate: string
  ): Promise<{ success: boolean; calendar: any[] }> {
    const params = new URLSearchParams({ startDate, endDate });
    const response = await fetch(
      `${API_BASE}/api/bookings/availability-calendar/${providerId}?${params}`
    );

    if (!response.ok) {
      throw new Error('Failed to get availability calendar');
    }

    return response.json();
  },

  /**
   * Get price estimate
   */
  async estimateCost(tripItems: any[]): Promise<{
    success: boolean;
    breakdown: any[];
    subtotal: number;
    depositAmount: number;
    balanceAmount: number;
    totalAmount: number;
  }> {
    const response = await fetch(`${API_BASE}/api/bookings/estimate-cost`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripItems }),
    });

    if (!response.ok) {
      throw new Error('Failed to estimate cost');
    }

    return response.json();
  },

  /**
   * Apply promo code
   */
  async applyPromoCode(
    code: string,
    amount: number,
    userId: string
  ): Promise<{
    success: boolean;
    valid: boolean;
    discount?: number;
    finalAmount?: number;
    promoCodeId?: string;
    error?: string;
  }> {
    const response = await fetch(`${API_BASE}/api/bookings/apply-promo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, amount, userId }),
    });

    return response.json();
  },

  /**
   * Create refund
   */
  async createRefund(
    bookingId: string,
    amount?: number,
    reason?: string
  ): Promise<{
    success: boolean;
    refundId: string;
    amount: number;
    status: string;
  }> {
    const response = await fetch(`${API_BASE}/api/bookings/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, amount, reason }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create refund');
    }

    return response.json();
  },
};
