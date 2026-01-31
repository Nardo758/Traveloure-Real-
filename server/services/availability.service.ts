/**
 * Availability Service
 * Manages real-time inventory and booking capacity
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

class AvailabilityService {
  /**
   * Check if a service is available for booking
   */
  async checkAvailability(
    providerId: string,
    date: string,
    time: string,
    quantity: number = 1
  ): Promise<boolean> {
    try {
      // For AI-generated items (non-UUID providerId), always return true
      // These don't have real providers in the database
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(providerId)) {
        return true;
      }

      // Get provider's availability settings
      const provider = await db.execute(sql`
        SELECT capacity_per_day, instant_booking_enabled
        FROM service_providers WHERE id = ${providerId}
      `);

      if (!provider.rows || provider.rows.length === 0) {
        // Provider not found - for AI items this is expected, return true
        return true;
      }

      const row = provider.rows[0] as { capacity_per_day: number; instant_booking_enabled: boolean };
      const { capacity_per_day, instant_booking_enabled } = row;

      if (!instant_booking_enabled) {
        return false;
      }

      // Check existing bookings for this date
      const bookings = await db.execute(sql`
        SELECT SUM(travelers) as total_booked
        FROM bookings
        WHERE provider_id = ${providerId}
          AND booking_date = ${date}
          AND status NOT IN ('canceled', 'refunded')
      `);

      const bookingRow = bookings.rows?.[0] as { total_booked: number } | undefined;
      const totalBooked = bookingRow?.total_booked || 0;
      const remainingCapacity = capacity_per_day - totalBooked;

      return remainingCapacity >= quantity;
    } catch (error) {
      console.error('Availability check error:', error);
      // Return true on error to allow payment to proceed
      return true;
    }
  }

  /**
   * Get available capacity for a date range
   */
  async getAvailabilityCalendar(
    providerId: string,
    startDate: string,
    endDate: string
  ) {
    try {
      const provider = await db.execute(sql`
        SELECT capacity_per_day FROM service_providers WHERE id = ${providerId}
      `);

      if (!provider.rows || provider.rows.length === 0) {
        return [];
      }

      const providerRow = provider.rows[0] as { capacity_per_day: number };
      const capacityPerDay = providerRow.capacity_per_day;

      // Get bookings in date range
      const bookings = await db.execute(sql`
        SELECT booking_date, SUM(travelers) as total_booked
        FROM bookings
        WHERE provider_id = ${providerId}
          AND booking_date BETWEEN ${startDate} AND ${endDate}
          AND status NOT IN ('canceled', 'refunded')
        GROUP BY booking_date
      `);

      // Build calendar
      const calendar = [];
      const start = new Date(startDate);
      const end = new Date(endDate);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const booking = bookings.rows?.find((b: any) => b.booking_date === dateStr);
        const booked = (booking as any)?.total_booked || 0;

        calendar.push({
          date: dateStr,
          capacity: capacityPerDay,
          booked,
          available: capacityPerDay - booked,
          isAvailable: (capacityPerDay - booked) > 0,
        });
      }

      return calendar;
    } catch (error) {
      console.error('Calendar generation error:', error);
      return [];
    }
  }

  /**
   * Reserve capacity (soft hold before payment)
   */
  async reserveCapacity(
    providerId: string,
    date: string,
    time: string,
    quantity: number,
    userId: string,
    expiresInMinutes: number = 15
  ) {
    try {
      // Check availability first
      const available = await this.checkAvailability(providerId, date, time, quantity);
      if (!available) {
        return { success: false, error: 'Not available' };
      }

      // Create reservation
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);
      const expiresAtStr = expiresAt.toISOString();

      const result = await db.execute(sql`
        INSERT INTO capacity_reservations (
          provider_id, user_id, date, time, quantity,
          expires_at, created_at
        ) VALUES (${providerId}, ${userId}, ${date}, ${time}, ${quantity}, ${expiresAtStr}, NOW())
        RETURNING id
      `);

      const insertedRow = result.rows?.[0] as { id: string } | undefined;

      return {
        success: true,
        reservationId: insertedRow?.id,
        expiresAt: expiresAtStr,
      };
    } catch (error: any) {
      console.error('Reservation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Release expired reservations
   */
  async releaseExpiredReservations() {
    try {
      await db.execute(sql`
        DELETE FROM capacity_reservations
        WHERE expires_at < NOW()
          AND status = 'active'
      `);
    } catch (error) {
      console.error('Reservation cleanup error:', error);
    }
  }

  /**
   * Decrease availability after confirmed booking
   */
  async decreaseAvailability(
    providerId: string,
    date: string,
    quantity: number
  ) {
    try {
      // Mark reservation as consumed
      await db.execute(sql`
        UPDATE capacity_reservations
        SET status = 'consumed'
        WHERE id = (
          SELECT id FROM capacity_reservations
          WHERE provider_id = ${providerId}
            AND date = ${date}
            AND status = 'active'
          LIMIT 1
        )
      `);

      return true;
    } catch (error) {
      console.error('Decrease availability error:', error);
      return false;
    }
  }

  /**
   * Restore availability after cancellation/refund
   */
  async restoreAvailability(bookingId: string) {
    try {
      const booking = await db.execute(sql`
        SELECT provider_id, booking_date, travelers
        FROM bookings WHERE id = ${bookingId}
      `);

      if (!booking.rows || booking.rows.length === 0) {
        return false;
      }

      // No specific action needed - availability is calculated dynamically
      // based on active bookings
      return true;
    } catch (error) {
      console.error('Restore availability error:', error);
      return false;
    }
  }

  /**
   * Block dates for provider (maintenance, holidays, etc.)
   */
  async blockDates(
    providerId: string,
    startDate: string,
    endDate: string,
    reason: string
  ) {
    try {
      await db.execute(sql`
        INSERT INTO blocked_dates (
          provider_id, start_date, end_date, reason, created_at
        ) VALUES (${providerId}, ${startDate}, ${endDate}, ${reason}, NOW())
      `);

      return true;
    } catch (error) {
      console.error('Block dates error:', error);
      return false;
    }
  }

  /**
   * Check if date is blocked
   */
  async isDateBlocked(providerId: string, date: string): Promise<boolean> {
    try {
      const blocked = await db.execute(sql`
        SELECT id FROM blocked_dates
        WHERE provider_id = ${providerId}
          AND ${date} BETWEEN start_date AND end_date
      `);

      return (blocked.rows?.length || 0) > 0;
    } catch (error) {
      console.error('Check blocked date error:', error);
      return false;
    }
  }
}

export const availabilityService = new AvailabilityService();
