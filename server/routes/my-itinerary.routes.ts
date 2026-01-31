/**
 * My Itinerary Routes
 * 
 * Endpoints for the final itinerary view with smart sequencing,
 * methodology notes, and calendar/PDF export.
 */

import { Router } from "express";
import { db } from "../db";
import { 
  itineraryComparisons, 
  itineraryVariants, 
  itineraryVariantItems, 
  itineraryVariantMetrics 
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { 
  generateActivityNote, 
  generateDayNotes, 
  generateItineraryNotes,
  calculateItineraryMetrics,
  mapServiceTypeToCategory
} from "../services/smart-sequencing.service";

const router = Router();

// Get full itinerary with smart sequencing notes and metrics
router.get("/api/my-itinerary/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get comparison data
    const comparison = await db.query.itineraryComparisons.findFirst({
      where: eq(itineraryComparisons.id, id),
    });
    
    if (!comparison) {
      return res.status(404).json({ error: "Itinerary not found" });
    }
    
    // Get the selected variant or the first one
    const variantId = comparison.selectedVariantId;
    let variant;
    
    if (variantId) {
      variant = await db.query.itineraryVariants.findFirst({
        where: eq(itineraryVariants.id, variantId),
      });
    }
    
    if (!variant) {
      // Get the first variant (user's original)
      const variants = await db.query.itineraryVariants.findMany({
        where: eq(itineraryVariants.comparisonId, comparison.id),
        orderBy: (v, { asc }) => [asc(v.sortOrder)],
        limit: 1,
      });
      variant = variants[0];
    }
    
    if (!variant) {
      return res.status(404).json({ error: "No itinerary variant found" });
    }
    
    // Get all items for the variant
    const items = await db.query.itineraryVariantItems.findMany({
      where: eq(itineraryVariantItems.variantId, variant.id),
      orderBy: (item, { asc }) => [asc(item.dayNumber), asc(item.sortOrder)],
    });
    
    // Generate methodology notes for each activity
    const itemsWithNotes = items.map((item, idx) => {
      const prevItem = idx > 0 ? items[idx - 1] : undefined;
      const nextItem = idx < items.length - 1 ? items[idx + 1] : undefined;
      
      const note = generateActivityNote(
        { name: item.name, serviceType: item.serviceType || '', startTime: item.startTime || undefined },
        prevItem ? { name: prevItem.name, serviceType: prevItem.serviceType || '', endTime: prevItem.endTime || undefined } : undefined,
        nextItem ? { name: nextItem.name, serviceType: nextItem.serviceType || '', startTime: nextItem.startTime || undefined } : undefined
      );
      
      return {
        id: item.id,
        dayNumber: item.dayNumber,
        timeSlot: item.timeSlot || '',
        startTime: item.startTime || '',
        endTime: item.endTime || '',
        name: item.name,
        description: item.description || '',
        serviceType: item.serviceType || 'activity',
        price: item.price?.toString() || '0',
        rating: item.rating?.toString() || '0',
        location: item.location || '',
        duration: item.duration || 60,
        travelTimeFromPrevious: item.travelTimeFromPrevious || 0,
        methodologyNote: note?.note,
        methodologyReason: note?.methodology,
        bookingStatus: (item.metadata as any)?.bookingStatus || 'not_required',
        bookingReference: (item.metadata as any)?.bookingReference,
      };
    });
    
    // Group items by day for day-level notes
    const itemsByDay: Record<number, typeof itemsWithNotes> = {};
    for (const item of itemsWithNotes) {
      if (!itemsByDay[item.dayNumber]) itemsByDay[item.dayNumber] = [];
      itemsByDay[item.dayNumber].push(item);
    }
    
    // Generate day-level notes
    const dayNotes: Array<{ dayNumber: number; note: string; methodology: string }> = [];
    for (const [dayNum, dayItems] of Object.entries(itemsByDay)) {
      const notes = generateDayNotes(dayItems);
      for (const note of notes) {
        dayNotes.push({
          dayNumber: parseInt(dayNum),
          note: note.note,
          methodology: note.methodology,
        });
      }
    }
    
    // Generate itinerary-level notes
    const daysData = Object.entries(itemsByDay).map(([dayNum, activities]) => ({
      dayNumber: parseInt(dayNum),
      activities,
    }));
    const itineraryNotes = generateItineraryNotes(daysData);
    
    // Calculate metrics
    const metrics = calculateItineraryMetrics(
      items.map(i => ({
        serviceType: i.serviceType || 'activity',
        price: i.price?.toString(),
        duration: i.duration || 60,
        dayNumber: i.dayNumber,
      })),
      comparison.travelers || 1
    );
    
    // Mock transport and accommodation packages (would come from actual bookings)
    const transportPackage = extractTransportPackage(itemsWithNotes);
    const accommodations = extractAccommodations(itemsWithNotes, comparison);
    
    const response = {
      id: comparison.id,
      title: comparison.title || `${comparison.destination} Trip`,
      destination: comparison.destination,
      startDate: comparison.startDate,
      endDate: comparison.endDate,
      travelers: comparison.travelers || 1,
      status: comparison.status,
      items: itemsWithNotes,
      transportPackage,
      accommodations,
      metrics,
      dayNotes,
      itineraryNotes: itineraryNotes.map(n => ({
        note: n.note,
        methodology: n.methodology,
        category: n.category,
      })),
      aiReasoning: variant.aiReasoning,
    };
    
    res.json(response);
  } catch (error) {
    console.error("Error fetching itinerary:", error);
    res.status(500).json({ error: "Failed to fetch itinerary" });
  }
});

// Generate .ics calendar file
router.get("/api/my-itinerary/:id/calendar", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get comparison data
    const comparison = await db.query.itineraryComparisons.findFirst({
      where: eq(itineraryComparisons.id, id),
    });
    
    if (!comparison) {
      return res.status(404).json({ error: "Itinerary not found" });
    }
    
    // Get the selected variant
    const variantId = comparison.selectedVariantId;
    let variant;
    
    if (variantId) {
      variant = await db.query.itineraryVariants.findFirst({
        where: eq(itineraryVariants.id, variantId),
      });
    }
    
    if (!variant) {
      const variants = await db.query.itineraryVariants.findMany({
        where: eq(itineraryVariants.comparisonId, comparison.id),
        orderBy: (v, { asc }) => [asc(v.sortOrder)],
        limit: 1,
      });
      variant = variants[0];
    }
    
    if (!variant) {
      return res.status(404).json({ error: "No itinerary variant found" });
    }
    
    // Get all items
    const items = await db.query.itineraryVariantItems.findMany({
      where: eq(itineraryVariantItems.variantId, variant.id),
      orderBy: (item, { asc }) => [asc(item.dayNumber), asc(item.sortOrder)],
    });
    
    // Generate .ics content
    const icsContent = generateICSContent(comparison, items);
    
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="traveloure-${id}.ics"`);
    res.send(icsContent);
  } catch (error) {
    console.error("Error generating calendar:", error);
    res.status(500).json({ error: "Failed to generate calendar file" });
  }
});

// Helper: Extract transport items from itinerary
function extractTransportPackage(items: any[]) {
  const transportItems = items.filter(item => {
    const category = mapServiceTypeToCategory(item.serviceType);
    return ['transport', 'flight', 'train', 'transfer'].includes(category);
  });
  
  // Create package items from transport activities
  const packages: any[] = [];
  
  // Group by type
  const flights = transportItems.filter(i => mapServiceTypeToCategory(i.serviceType) === 'flight');
  const trains = transportItems.filter(i => mapServiceTypeToCategory(i.serviceType) === 'train');
  const transfers = transportItems.filter(i => ['transport', 'transfer'].includes(mapServiceTypeToCategory(i.serviceType)));
  
  if (flights.length > 0) {
    packages.push({
      type: 'flight',
      name: 'Flights',
      description: `${flights.length} flight(s) included`,
      details: flights.map(f => f.name).join(', '),
      price: flights.reduce((sum, f) => sum + parseFloat(f.price || '0'), 0),
      included: true,
    });
  }
  
  if (trains.length > 0) {
    packages.push({
      type: 'train',
      name: 'Train Journeys',
      description: `${trains.length} train journey(s)`,
      details: trains.map(t => t.name).join(', '),
      price: trains.reduce((sum, t) => sum + parseFloat(t.price || '0'), 0),
      included: true,
    });
  }
  
  if (transfers.length > 0) {
    packages.push({
      type: 'transfer',
      name: 'Airport/Hotel Transfers',
      description: `${transfers.length} transfer(s)`,
      details: transfers.map(t => t.name).join(', '),
      price: transfers.reduce((sum, t) => sum + parseFloat(t.price || '0'), 0),
      included: true,
    });
  }
  
  // Add suggested metro pass if there are multiple days
  const uniqueDays = new Set(items.map(i => i.dayNumber));
  if (uniqueDays.size >= 3) {
    packages.push({
      type: 'metro_pass',
      name: 'City Metro Pass',
      description: `${uniqueDays.size}-day unlimited metro pass`,
      details: 'Unlimited rides on metro, bus, and tram',
      price: uniqueDays.size * 8, // ~$8 per day estimate
      included: false,
      bookingUrl: 'https://12go.co',
    });
  }
  
  return packages;
}

// Helper: Extract accommodation info
function extractAccommodations(items: any[], comparison: any) {
  // Look for hotel/accommodation type items
  const hotelItems = items.filter(item => {
    const type = item.serviceType?.toLowerCase() || '';
    return type.includes('hotel') || type.includes('accommodation') || type.includes('stay') || type.includes('resort');
  });
  
  if (hotelItems.length > 0) {
    // Group by location/name for multi-stay trips
    return hotelItems.map((hotel, idx) => ({
      id: hotel.id || `acc-${idx}`,
      name: hotel.name,
      type: 'Hotel',
      checkIn: comparison.startDate,
      checkOut: comparison.endDate,
      nights: getDaysBetween(comparison.startDate, comparison.endDate),
      rating: parseFloat(hotel.rating || '4.0'),
      price: parseFloat(hotel.price || '0'),
      amenities: ['WiFi', 'Breakfast', 'Air Conditioning'],
      location: hotel.location || comparison.destination,
      bookingStatus: hotel.bookingStatus === 'confirmed' ? 'confirmed' : 'pending',
    }));
  }
  
  // Return a placeholder if no accommodations found
  return [{
    id: 'acc-placeholder',
    name: `Hotel in ${comparison.destination}`,
    type: 'Recommended',
    checkIn: comparison.startDate,
    checkOut: comparison.endDate,
    nights: getDaysBetween(comparison.startDate, comparison.endDate),
    rating: 4.2,
    price: getDaysBetween(comparison.startDate, comparison.endDate) * 120, // ~$120/night estimate
    amenities: ['WiFi', 'Central Location'],
    location: comparison.destination,
    bookingStatus: 'pending',
  }];
}

function getDaysBetween(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Generate ICS calendar content
function generateICSContent(comparison: any, items: any[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Traveloure//Travel Itinerary//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${comparison.title || comparison.destination} Trip`,
  ];
  
  const startDate = new Date(comparison.startDate);
  
  for (const item of items) {
    const eventDate = new Date(startDate);
    eventDate.setDate(eventDate.getDate() + item.dayNumber - 1);
    
    // Parse start time (format: "09:00" or "9:00 AM")
    let hours = 9, minutes = 0;
    if (item.startTime) {
      const timeParts = item.startTime.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
      if (timeParts) {
        hours = parseInt(timeParts[1]);
        minutes = parseInt(timeParts[2] || '0');
        if (timeParts[3]?.toUpperCase() === 'PM' && hours < 12) hours += 12;
        if (timeParts[3]?.toUpperCase() === 'AM' && hours === 12) hours = 0;
      }
    }
    
    const eventStart = new Date(eventDate);
    eventStart.setHours(hours, minutes, 0, 0);
    
    const duration = item.duration || 60;
    const eventEnd = new Date(eventStart.getTime() + duration * 60 * 1000);
    
    const uid = `${item.id || crypto.randomUUID()}@traveloure.com`;
    
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${formatICSDate(new Date())}`);
    lines.push(`DTSTART:${formatICSDate(eventStart)}`);
    lines.push(`DTEND:${formatICSDate(eventEnd)}`);
    lines.push(`SUMMARY:${escapeICS(item.name)}`);
    if (item.description) {
      lines.push(`DESCRIPTION:${escapeICS(item.description)}`);
    }
    if (item.location) {
      lines.push(`LOCATION:${escapeICS(item.location)}`);
    }
    lines.push(`CATEGORIES:${item.serviceType || 'Activity'}`);
    lines.push('END:VEVENT');
  }
  
  lines.push('END:VCALENDAR');
  
  return lines.join('\r\n');
}

function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export default router;
