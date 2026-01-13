import { db } from "./db";
import { destinationEvents, destinationSeasons } from "@shared/schema";
import { eq } from "drizzle-orm";

const destinationData = [
  {
    country: "Japan",
    seasons: [
      { month: 1, rating: "good", averageTemp: "2-7°C", rainfall: "Low", crowdLevel: "Low", priceLevel: "Medium", weatherDescription: "Cold but clear winter days. Great for skiing and onsen visits." },
      { month: 2, rating: "good", averageTemp: "3-9°C", rainfall: "Low", crowdLevel: "Low", priceLevel: "Medium", weatherDescription: "Late winter with plum blossom season beginning." },
      { month: 3, rating: "best", averageTemp: "8-14°C", rainfall: "Medium", crowdLevel: "High", priceLevel: "High", weatherDescription: "Cherry blossom season begins in southern Japan." },
      { month: 4, rating: "best", averageTemp: "13-19°C", rainfall: "Medium", crowdLevel: "High", priceLevel: "High", weatherDescription: "Peak cherry blossom viewing. Perfect spring weather." },
      { month: 5, rating: "good", averageTemp: "17-23°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Pleasant late spring before rainy season." },
      { month: 6, rating: "avoid", averageTemp: "21-26°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Rainy season (tsuyu) with high humidity." },
      { month: 7, rating: "average", averageTemp: "25-30°C", rainfall: "Medium", crowdLevel: "High", priceLevel: "High", weatherDescription: "Hot and humid summer. Festival season begins." },
      { month: 8, rating: "average", averageTemp: "26-31°C", rainfall: "Medium", crowdLevel: "High", priceLevel: "High", weatherDescription: "Peak summer heat but vibrant festival atmosphere." },
      { month: 9, rating: "good", averageTemp: "22-27°C", rainfall: "High", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Typhoon season but autumn colors begin." },
      { month: 10, rating: "best", averageTemp: "16-22°C", rainfall: "Medium", crowdLevel: "High", priceLevel: "High", weatherDescription: "Beautiful autumn foliage season." },
      { month: 11, rating: "best", averageTemp: "11-17°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Peak autumn colors. Pleasant temperatures." },
      { month: 12, rating: "good", averageTemp: "5-12°C", rainfall: "Low", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Early winter. Holiday illuminations and festivities." },
    ],
    events: [
      { title: "Cherry Blossom Festival (Hanami)", eventType: "festival", startMonth: 3, endMonth: 4, description: "Japan's most celebrated seasonal event. Locals gather in parks to admire cherry blossoms.", tips: "Book hotels 3-6 months in advance. Ueno Park and Shinjuku Gyoen are popular spots." },
      { title: "Golden Week", eventType: "holiday", startMonth: 5, endMonth: 5, description: "Week-long national holiday when many Japanese travel domestically.", tips: "Avoid traveling during this period as prices spike and attractions are crowded." },
      { title: "Gion Matsuri", eventType: "festival", startMonth: 7, endMonth: 7, description: "Kyoto's famous month-long festival with spectacular float processions.", tips: "The main procession on July 17th draws massive crowds. Stay near Shijo Street." },
      { title: "Autumn Foliage Season (Koyo)", eventType: "season", startMonth: 10, endMonth: 11, description: "Brilliant red and orange autumn colors across Japan.", tips: "Kyoto's temples and Tokyo's gardens are spectacular during this time." },
    ]
  },
  {
    country: "Italy",
    seasons: [
      { month: 1, rating: "average", averageTemp: "3-10°C", rainfall: "Medium", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Cool winter. Good for indoor museums and winter sales." },
      { month: 2, rating: "average", averageTemp: "4-12°C", rainfall: "Medium", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Late winter with Carnival celebrations." },
      { month: 3, rating: "good", averageTemp: "8-16°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Spring begins. Easter celebrations in many cities." },
      { month: 4, rating: "best", averageTemp: "12-20°C", rainfall: "Medium", crowdLevel: "High", priceLevel: "High", weatherDescription: "Perfect spring weather. Gardens in bloom." },
      { month: 5, rating: "best", averageTemp: "16-24°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Ideal temperatures. Before summer crowds arrive." },
      { month: 6, rating: "good", averageTemp: "20-28°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Summer begins. Long daylight hours." },
      { month: 7, rating: "average", averageTemp: "23-32°C", rainfall: "Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Hot summer. Peak tourist season." },
      { month: 8, rating: "avoid", averageTemp: "23-32°C", rainfall: "Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Hottest month. Many locals on vacation, some shops closed." },
      { month: 9, rating: "best", averageTemp: "19-27°C", rainfall: "Medium", crowdLevel: "High", priceLevel: "High", weatherDescription: "Perfect autumn weather. Wine harvest season." },
      { month: 10, rating: "best", averageTemp: "14-21°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Beautiful autumn colors. Truffle season." },
      { month: 11, rating: "average", averageTemp: "9-15°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Late autumn. Olive harvest." },
      { month: 12, rating: "good", averageTemp: "5-11°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Christmas markets and festive atmosphere." },
    ],
    events: [
      { title: "Venice Carnival", eventType: "festival", startMonth: 2, endMonth: 2, description: "World-famous carnival with elaborate masks and costumes.", tips: "Book accommodation months in advance. Masks can be purchased throughout Venice." },
      { title: "Easter in Rome", eventType: "religious", startMonth: 4, endMonth: 4, description: "Papal mass and celebrations at the Vatican.", tips: "Arrive early for St. Peter's Square. Dress modestly for religious sites." },
      { title: "Palio di Siena", eventType: "sporting", startMonth: 7, endMonth: 8, description: "Historic horse race in Siena's main square.", tips: "Races on July 2nd and August 16th. Book hotels well in advance." },
      { title: "Wine Harvest Season", eventType: "cultural", startMonth: 9, endMonth: 10, description: "Grape harvest in Tuscany, Piedmont, and other wine regions.", tips: "Join vineyard tours and wine tastings. Book winery visits ahead." },
    ]
  },
  {
    country: "Thailand",
    seasons: [
      { month: 1, rating: "best", averageTemp: "26-32°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Peak dry season. Perfect beach weather." },
      { month: 2, rating: "best", averageTemp: "27-33°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Dry and sunny. Chinese New Year celebrations." },
      { month: 3, rating: "good", averageTemp: "28-34°C", rainfall: "Low", crowdLevel: "High", priceLevel: "Medium", weatherDescription: "Hot season begins. Still mostly dry." },
      { month: 4, rating: "average", averageTemp: "29-35°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Hottest month. Songkran water festival." },
      { month: 5, rating: "average", averageTemp: "28-33°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Rainy season begins. Fewer tourists." },
      { month: 6, rating: "average", averageTemp: "27-32°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Monsoon season. Green landscapes." },
      { month: 7, rating: "average", averageTemp: "27-32°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Rainy season continues. Good deals available." },
      { month: 8, rating: "average", averageTemp: "27-32°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Wet season. Morning sun often still available." },
      { month: 9, rating: "average", averageTemp: "27-31°C", rainfall: "Very High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Wettest month. Some flooding possible." },
      { month: 10, rating: "good", averageTemp: "26-31°C", rainfall: "High", crowdLevel: "Medium", priceLevel: "Low", weatherDescription: "Rainy season ending. Loy Krathong festival." },
      { month: 11, rating: "best", averageTemp: "26-31°C", rainfall: "Medium", crowdLevel: "High", priceLevel: "Medium", weatherDescription: "Cool season begins. Loy Krathong lantern festival." },
      { month: 12, rating: "best", averageTemp: "25-31°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Perfect weather. Holiday season." },
    ],
    events: [
      { title: "Songkran Water Festival", eventType: "festival", startMonth: 4, endMonth: 4, description: "Thai New Year celebrated with massive water fights nationwide.", tips: "Protect electronics with waterproof bags. Join the fun in Bangkok or Chiang Mai." },
      { title: "Loy Krathong", eventType: "festival", startMonth: 11, endMonth: 11, description: "Festival of lights with floating lanterns and offerings.", tips: "Chiang Mai's Yi Peng lantern release is spectacular. Book early." },
      { title: "Full Moon Party", eventType: "festival", startMonth: 1, endMonth: 12, description: "Monthly beach party on Koh Phangan.", tips: "Book accommodation on the island well in advance. Stay safe and hydrated." },
    ]
  },
  {
    country: "France",
    seasons: [
      { month: 1, rating: "average", averageTemp: "3-8°C", rainfall: "Medium", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Cold winter. Winter sales and fewer tourists." },
      { month: 2, rating: "average", averageTemp: "4-9°C", rainfall: "Medium", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Late winter. Nice Carnival celebrations." },
      { month: 3, rating: "good", averageTemp: "7-13°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Early spring. Parks start blooming." },
      { month: 4, rating: "best", averageTemp: "10-17°C", rainfall: "Medium", crowdLevel: "High", priceLevel: "High", weatherDescription: "Beautiful spring weather. Easter celebrations." },
      { month: 5, rating: "best", averageTemp: "14-21°C", rainfall: "Medium", crowdLevel: "High", priceLevel: "High", weatherDescription: "Perfect spring. Cannes Film Festival." },
      { month: 6, rating: "best", averageTemp: "17-25°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Early summer. Long days and festivals." },
      { month: 7, rating: "good", averageTemp: "19-27°C", rainfall: "Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Peak summer. Bastille Day celebrations." },
      { month: 8, rating: "average", averageTemp: "19-27°C", rainfall: "Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Hot summer. Many Parisians on vacation." },
      { month: 9, rating: "best", averageTemp: "16-23°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Perfect autumn. Grape harvest in wine regions." },
      { month: 10, rating: "good", averageTemp: "11-17°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Autumn colors. Wine harvest continues." },
      { month: 11, rating: "average", averageTemp: "7-12°C", rainfall: "Medium", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Late autumn. Beaujolais Nouveau release." },
      { month: 12, rating: "good", averageTemp: "4-8°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Christmas markets and festive atmosphere." },
    ],
    events: [
      { title: "Cannes Film Festival", eventType: "cultural", startMonth: 5, endMonth: 5, description: "World's most prestigious film festival on the French Riviera.", tips: "The red carpet is open to public viewing. Book Riviera hotels early." },
      { title: "Bastille Day", eventType: "holiday", startMonth: 7, endMonth: 7, description: "France's national day with fireworks and celebrations.", tips: "Watch the military parade on Champs-Élysées. Eiffel Tower fireworks are spectacular." },
      { title: "Tour de France Finale", eventType: "sporting", startMonth: 7, endMonth: 7, description: "The famous cycling race finale on Champs-Élysées.", tips: "Find a spot on the Champs-Élysées early for the final sprint." },
      { title: "Nice Carnival", eventType: "festival", startMonth: 2, endMonth: 2, description: "One of the world's largest carnivals with parades and flowers.", tips: "Buy tickets for grandstand seating or watch for free from the street." },
    ]
  },
  {
    country: "Morocco",
    seasons: [
      { month: 1, rating: "good", averageTemp: "8-17°C", rainfall: "Medium", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Cool winter. Great for city exploration." },
      { month: 2, rating: "good", averageTemp: "9-18°C", rainfall: "Medium", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Late winter. Almond blossom season." },
      { month: 3, rating: "best", averageTemp: "11-21°C", rainfall: "Low", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Spring begins. Perfect weather for hiking." },
      { month: 4, rating: "best", averageTemp: "13-24°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Beautiful spring. Rose harvest in valleys." },
      { month: 5, rating: "best", averageTemp: "17-28°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Warm and sunny. Before summer heat." },
      { month: 6, rating: "average", averageTemp: "20-32°C", rainfall: "Low", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Getting hot. Desert trips less comfortable." },
      { month: 7, rating: "avoid", averageTemp: "23-38°C", rainfall: "Very Low", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Very hot. Desert temperatures extreme." },
      { month: 8, rating: "avoid", averageTemp: "23-38°C", rainfall: "Very Low", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Peak heat. Coast and mountains preferred." },
      { month: 9, rating: "good", averageTemp: "20-32°C", rainfall: "Low", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Heat subsiding. Good for desert trips." },
      { month: 10, rating: "best", averageTemp: "16-27°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Perfect autumn weather. Date harvest." },
      { month: 11, rating: "good", averageTemp: "12-22°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Cool autumn. Great for trekking." },
      { month: 12, rating: "good", averageTemp: "9-18°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Cool winter. Festive season." },
    ],
    events: [
      { title: "Rose Festival", eventType: "festival", startMonth: 5, endMonth: 5, description: "Celebration of rose harvest in the Dades Valley.", tips: "Visit Kelaat M'Gouna for the main festivities. Book riads early." },
      { title: "Fes Festival of World Sacred Music", eventType: "cultural", startMonth: 6, endMonth: 6, description: "Nine days of spiritual music from around the world.", tips: "Book tickets early for popular performances. Stay in the medina." },
      { title: "Marrakech Popular Arts Festival", eventType: "cultural", startMonth: 7, endMonth: 7, description: "Traditional Moroccan arts, music, and dance.", tips: "Evening performances in El Badi Palace are magical." },
    ]
  }
];

export async function seedDestinationCalendar() {
  console.log("Seeding destination calendar data...");

  for (const destination of destinationData) {
    // Check if seasons already exist for this country
    const existingSeasons = await db.select().from(destinationSeasons).where(eq(destinationSeasons.country, destination.country));
    
    if (existingSeasons.length === 0) {
      // Seed seasons
      for (const season of destination.seasons) {
        await db.insert(destinationSeasons).values({
          country: destination.country,
          month: season.month,
          rating: season.rating,
          averageTemp: season.averageTemp,
          rainfall: season.rainfall,
          crowdLevel: season.crowdLevel,
          priceLevel: season.priceLevel,
          weatherDescription: season.weatherDescription,
          sourceType: "system",
        });
      }
      console.log(`  → Seeded ${destination.seasons.length} seasons for ${destination.country}`);
    } else {
      console.log(`  → Seasons for ${destination.country} already exist`);
    }

    // Check if events already exist for this country
    const existingEvents = await db.select().from(destinationEvents).where(eq(destinationEvents.country, destination.country));
    
    if (existingEvents.length === 0) {
      // Seed events
      for (const event of destination.events) {
        await db.insert(destinationEvents).values({
          country: destination.country,
          title: event.title,
          description: event.description,
          eventType: event.eventType,
          startMonth: event.startMonth,
          endMonth: event.endMonth,
          isRecurring: true,
          tips: event.tips,
          status: "approved",
          sourceType: "system",
        });
      }
      console.log(`  → Seeded ${destination.events.length} events for ${destination.country}`);
    } else {
      console.log(`  → Events for ${destination.country} already exist`);
    }
  }

  console.log("Destination calendar seeding complete.");
}
