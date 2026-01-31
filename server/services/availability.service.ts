/**
 * Availability Service
 * Manages real-time inventory and booking capacity
 */

import { db } from '../db';

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
      // Get provider's availability settings
      const provider = await db.execute(
        `SELECT capacity_per_day, instant_booking_enabled
        FROM service_providers WHERE id = ?`,
        [providerId]
      );

      if (!provider.rows || provider.rows.length === 0) {
        return false;
      }

      const { capacity_per_day, instant_booking_enabled } = provider.rows[0];

      if (!instant_booking_enabled) {
        return false;
      }

      // Check existing bookings for this date
      const bookings = await db.execute(
        `SELECT SUM(travelers) as total_booked
        FROM bookings
        WHERE provider_id = ?
          AND booking_date = ?
          AND status NOT IN ('canceled', 'refunded')`,
        [providerId, date]
      );

      const totalBooked = bookings.rows?.[0]?.total_booked || 0;
      const remainingCapacity = capacity_per_day - totalBooked;

      return remainingCapacity >= quantity;
    } catch (error) {
      console.error('Availability check error:', error);
      return false;
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
      const provider = await db.execute(
        `SELECT capacity_per_day FROM service_providers WHERE id = ?`,
        [providerId]
      );

      if (!provider.rows || provider.rows.length === 0) {
        return [];
      }

      const capacityPerDay = provider.rows[0].capacity_per_day;

      // Get bookings in date range
      const bookings = await db.execute(
        `SELECT booking_date, SUM(travelers) as total_booked
        FROM bookings
        WHERE provider_id = ?
          AND booking_date BETWEEN ? AND ?
          AND status NOT IN ('canceled', 'refunded')
        GROUP BY booking_date`,
        [providerId, startDate, endDate]
      );

      // Build calendar
      const calendar = [];
      const start = new Date(startDate);
      const end = new Date(endDate);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const booking = bookings.rows?.find((b: any) => b.booking_date === dateStr);
        const booked = booking?.total_booked || 0;

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

      const result = await db.execute(
        `INSERT INTO capacity_reservations (
          provider_id, user_id, date, time, quantity,
          expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          providerId,
          userId,
          date,
          time,
          quantity,
          expiresAt.toISOString(),
        ]
      );

      return {
        success: true,
        reservationId: result.lastInsertRowid,
        expiresAt: expiresAt.toISOString(),
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
      await db.execute(
        `DELETE FROM capacity_reservations
        WHERE expires_at < datetime('now')
          AND status = 'active'`
      );
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
      await db.execute(
        `UPDATE capacity_reservations
        SET status = 'consumed'
        WHERE provider_id = ?
          AND date = ?
          AND status = 'active'
        LIMIT 1`,
        [providerId, date]
      );

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
      const booking = await db.execute(
        `SELECT provider_id, booking_date, travelers
        FROM bookings WHERE id = ?`,
        [bookingId]
      );

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
      await db.execute(
        `INSERT INTO blocked_dates (
          provider_id, start_date, end_date, reason, created_at
        ) VALUES (?, ?, ?, ?, datetime('now'))`,
        [providerId, startDate, endDate, reason]
      );

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
      const blocked = await db.execute(
        `SELECT id FROM blocked_dates
        WHERE provider_id = ?
          AND ? BETWEEN start_date AND end_date`,
        [providerId, date]
      );

      return (blocked.rows?.length || 0) > 0;
    } catch (error) {
      console.error('Check blocked date error:', error);
      return false;
    }
  }
}

export const availabilityService = new AvailabilityService();
