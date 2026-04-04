import { db } from "../server/db";
import { generatedItineraries } from "../shared/schema";
import { eq } from "drizzle-orm";

const TRIP_ID = 'eb5f3e68-8689-4c07-89c4-b07f53bbb87c';

const itineraryData = {
  days: [
    {
      day: 1, title: "Arrival in San Francisco",
      activities: [
        { id: "d1a1", name: "Check in at Hotel Zephyr", type: "accommodation", time: "14:00", location: "Fisherman's Wharf, San Francisco", lat: 37.8080, lng: -122.4177, estimatedCost: 280, description: "Boutique hotel with bay views and a playful nautical vibe." },
        { id: "d1a2", name: "Explore Fisherman's Wharf", type: "attraction", time: "16:00", location: "Pier 39, San Francisco", lat: 37.8087, lng: -122.4098, estimatedCost: 0, description: "Walk the waterfront, spot sea lions, grab fresh clam chowder." },
        { id: "d1a3", name: "Dinner at Scoma's Restaurant", type: "dining", time: "19:00", location: "Pier 47, San Francisco", lat: 37.8076, lng: -122.4181, estimatedCost: 95, description: "Classic SF seafood with bay views — try the Dungeness crab." }
      ]
    },
    {
      day: 2, title: "Golden Gate & Alcatraz",
      activities: [
        { id: "d2a1", name: "Golden Gate Bridge Walk", type: "attraction", time: "09:00", location: "Golden Gate Bridge, San Francisco", lat: 37.8199, lng: -122.4783, estimatedCost: 0, description: "Walk or cycle across the iconic bridge — morning fog views." },
        { id: "d2a2", name: "Alcatraz Island Tour", type: "attraction", time: "12:00", location: "Alcatraz Island", lat: 37.8267, lng: -122.4230, estimatedCost: 45, description: "Audio tour of the famous federal penitentiary." },
        { id: "d2a3", name: "Exploratorium", type: "attraction", time: "16:00", location: "Pier 15, San Francisco", lat: 37.8016, lng: -122.3975, estimatedCost: 35, description: "Hands-on science museum on the Embarcadero." },
        { id: "d2a4", name: "Dinner at The Slanted Door", type: "dining", time: "19:30", location: "Ferry Building, San Francisco", lat: 37.7956, lng: -122.3937, estimatedCost: 85, description: "Modern Vietnamese cuisine in the Ferry Building." }
      ]
    },
    {
      day: 3, title: "Drive to Monterey",
      activities: [
        { id: "d3a1", name: "Half Moon Bay Stop", type: "attraction", time: "09:30", location: "Half Moon Bay, CA", lat: 37.4636, lng: -122.4286, estimatedCost: 0, description: "Scenic cliffside stop with ocean views." },
        { id: "d3a2", name: "Monterey Bay Aquarium", type: "attraction", time: "13:00", location: "Monterey, CA", lat: 36.6181, lng: -121.9022, estimatedCost: 55, description: "World-class aquarium featuring the famous kelp forest exhibit." },
        { id: "d3a3", name: "Cannery Row Stroll", type: "attraction", time: "16:30", location: "Cannery Row, Monterey", lat: 36.6167, lng: -121.8987, estimatedCost: 0, description: "Walk the historic waterfront district from Steinbeck's novels." },
        { id: "d3a4", name: "Dinner at Domenico's on the Wharf", type: "dining", time: "19:00", location: "Fisherman's Wharf, Monterey", lat: 36.6061, lng: -121.8936, estimatedCost: 75, description: "Fresh local seafood with harbor views." }
      ]
    },
    {
      day: 4, title: "Big Sur Coastal Drive",
      activities: [
        { id: "d4a1", name: "Carmel-by-the-Sea", type: "attraction", time: "09:00", location: "Carmel-by-the-Sea, CA", lat: 36.5552, lng: -121.9233, estimatedCost: 0, description: "Fairy-tale village with white sand beach and art galleries." },
        { id: "d4a2", name: "Bixby Creek Bridge", type: "attraction", time: "11:30", location: "Big Sur, CA", lat: 36.3720, lng: -121.9018, estimatedCost: 0, description: "One of California's most photographed landmarks." },
        { id: "d4a3", name: "McWay Falls", type: "attraction", time: "13:00", location: "Julia Pfeiffer Burns State Park", lat: 36.1570, lng: -121.6720, estimatedCost: 10, description: "80-ft waterfall cascading onto the beach." },
        { id: "d4a4", name: "Nepenthe Restaurant", type: "dining", time: "16:00", location: "Big Sur, CA", lat: 36.2394, lng: -121.7776, estimatedCost: 65, description: "Iconic cliffside restaurant with sweeping Pacific views." },
        { id: "d4a5", name: "Post Ranch Inn Check-in", type: "accommodation", time: "18:00", location: "Big Sur, CA", lat: 36.2296, lng: -121.7709, estimatedCost: 450, description: "Luxury cliff-top eco-resort." }
      ]
    },
    {
      day: 5, title: "Santa Barbara Wine Country",
      activities: [
        { id: "d5a1", name: "Paso Robles Wine Tasting", type: "event", time: "10:00", location: "Paso Robles, CA", lat: 35.6268, lng: -120.6909, estimatedCost: 40, description: "Stop at Justin Winery — known for its bold Cabernets." },
        { id: "d5a2", name: "Hearst Castle Tour", type: "attraction", time: "13:00", location: "San Simeon, CA", lat: 35.6850, lng: -121.1684, estimatedCost: 30, description: "Guided tour of William Randolph Hearst's legendary mansion." },
        { id: "d5a3", name: "Hotel Santa Barbara Check-in", type: "accommodation", time: "17:00", location: "Santa Barbara, CA", lat: 34.4208, lng: -119.6982, estimatedCost: 220, description: "Stylish hotel on State Street." },
        { id: "d5a4", name: "State Street Dinner at Lure Fish House", type: "dining", time: "19:30", location: "Santa Barbara, CA", lat: 34.4181, lng: -119.6973, estimatedCost: 80, description: "Fresh California coastal cuisine." }
      ]
    },
    {
      day: 6, title: "Santa Barbara & Malibu",
      activities: [
        { id: "d6a1", name: "Santa Barbara Mission", type: "attraction", time: "09:00", location: "Santa Barbara Mission, CA", lat: 34.4405, lng: -119.7138, estimatedCost: 15, description: "Historic 1786 mission — the Queen of the Missions." },
        { id: "d6a2", name: "East Beach Kayaking", type: "activity", time: "11:00", location: "East Beach, Santa Barbara", lat: 34.4064, lng: -119.6708, estimatedCost: 60, description: "Rent kayaks and explore the harbor." },
        { id: "d6a3", name: "Nobu Malibu Lunch", type: "dining", time: "14:30", location: "Malibu, CA", lat: 34.0259, lng: -118.7798, estimatedCost: 55, description: "Celebrity-favorite Japanese restaurant on PCH." },
        { id: "d6a4", name: "Venice Beach Boardwalk", type: "attraction", time: "17:00", location: "Venice Beach, Los Angeles", lat: 33.9850, lng: -118.4695, estimatedCost: 0, description: "Street performers, muscle beach, and iconic LA culture." }
      ]
    },
    {
      day: 7, title: "Los Angeles Highlights",
      activities: [
        { id: "d7a1", name: "Griffith Observatory", type: "attraction", time: "09:00", location: "Griffith Park, Los Angeles", lat: 34.1184, lng: -118.3004, estimatedCost: 0, description: "Panoramic views of the Hollywood Sign and LA basin." },
        { id: "d7a2", name: "Getty Center", type: "attraction", time: "11:30", location: "Los Angeles, CA", lat: 34.0780, lng: -118.4741, estimatedCost: 0, description: "World-class art museum with stunning architecture." },
        { id: "d7a3", name: "Santa Monica Pier", type: "attraction", time: "15:00", location: "Santa Monica, CA", lat: 34.0089, lng: -118.4983, estimatedCost: 25, description: "Roller coaster, arcade games, and ocean views at sunset." },
        { id: "d7a4", name: "Farewell Dinner at Catch LA", type: "dining", time: "19:00", location: "West Hollywood, CA", lat: 34.0900, lng: -118.3617, estimatedCost: 120, description: "Rooftop celebration dinner with city views." }
      ]
    },
    {
      day: 8, title: "Departure Day",
      activities: [
        { id: "d8a1", name: "Breakfast at LAX", type: "dining", time: "08:00", location: "Los Angeles International Airport", lat: 33.9425, lng: -118.4081, estimatedCost: 20, description: "Grab breakfast before heading to your gate." },
        { id: "d8a2", name: "Souvenir Shopping at LAX", type: "shopping", time: "09:30", location: "LAX Terminal", lat: 33.9425, lng: -118.4081, estimatedCost: 50, description: "Last-minute California gifts and snacks for the flight home." }
      ]
    }
  ]
};

async function main() {
  const existing = await db.select({ id: generatedItineraries.id }).from(generatedItineraries).where(eq(generatedItineraries.tripId, TRIP_ID));
  if (existing.length > 0) {
    await db.update(generatedItineraries).set({ itineraryData, status: 'completed', updatedAt: new Date() }).where(eq(generatedItineraries.tripId, TRIP_ID));
    console.log('✅ Updated existing generated itinerary with 8-day California Coastal Road Trip');
  } else {
    await db.insert(generatedItineraries).values({ tripId: TRIP_ID, trackingNumber: 'TRK-CA-2026-001', itineraryData, status: 'completed' });
    console.log('✅ Inserted new 8-day California Coastal Road Trip itinerary');
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
