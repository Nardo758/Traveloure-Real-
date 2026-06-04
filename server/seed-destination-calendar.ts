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
  },
  {
    country: "Costa Rica",
    seasons: [
      { month: 1, rating: "best", averageTemp: "18-28°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Dry season. Perfect for outdoor adventures and wildlife spotting." },
      { month: 2, rating: "best", averageTemp: "18-29°C", rainfall: "Very Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Peak dry season. Warmest and sunniest month." },
      { month: 3, rating: "best", averageTemp: "19-30°C", rainfall: "Very Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Dry and warm. Perfect for beaches and hiking." },
      { month: 4, rating: "good", averageTemp: "20-31°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Late dry season. Brief afternoon rains begin." },
      { month: 5, rating: "average", averageTemp: "21-31°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Rainy season starts. Lush green landscapes. Fewer tourists." },
      { month: 6, rating: "average", averageTemp: "21-31°C", rainfall: "Very High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Heavy rains. Green season beauty. Low prices." },
      { month: 7, rating: "average", averageTemp: "21-30°C", rainfall: "High", crowdLevel: "Medium", priceLevel: "Low", weatherDescription: "Rainy season. Often sunny mornings." },
      { month: 8, rating: "average", averageTemp: "21-30°C", rainfall: "High", crowdLevel: "Medium", priceLevel: "Low", weatherDescription: "Green season. Afternoon rains common." },
      { month: 9, rating: "average", averageTemp: "21-30°C", rainfall: "Very High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Wettest month. Rainforests at peak lushness." },
      { month: 10, rating: "good", averageTemp: "20-29°C", rainfall: "High", crowdLevel: "Medium", priceLevel: "Low", weatherDescription: "Rainy season ending. Mornings often clear." },
      { month: 11, rating: "best", averageTemp: "19-28°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Transition to dry. Weather improving." },
      { month: 12, rating: "best", averageTemp: "18-27°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Dry season begins. Perfect weather. Holiday season." },
    ],
    events: [
      { title: "Fiestas de Zapote", eventType: "festival", startMonth: 12, endMonth: 1, description: "Year-end carnival with bullfights, parades, and live music in San José.", tips: "Book accommodation early. Avoid driving during festivities. Great street food." },
      { title: "Carnival in Puerto Limón", eventType: "festival", startMonth: 10, endMonth: 10, description: "Colorful Caribbean celebration with parades and Caribbean culture.", tips: "Visit early October for best atmosphere. Enjoy Creole cuisine." },
      { title: "Green Season (May-November)", eventType: "season", startMonth: 5, endMonth: 11, description: "Lush rainforests, fewer tourists, wildlife viewing opportunities.", tips: "Great for bird watching and waterfall hikes. Pack waterproof gear." },
    ]
  },
  {
    country: "Greece",
    seasons: [
      { month: 1, rating: "average", averageTemp: "8-13°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Cool and rainy. Good for exploring Athens. Fewer tourists." },
      { month: 2, rating: "average", averageTemp: "8-14°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Late winter. Occasional snow in mountains. Carnival celebrations." },
      { month: 3, rating: "good", averageTemp: "10-17°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Spring begins. Easter preparations. Wildflowers blooming." },
      { month: 4, rating: "best", averageTemp: "14-22°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Perfect spring weather. Easter holidays. Everything blooming." },
      { month: 5, rating: "best", averageTemp: "18-27°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Ideal temperatures. Long sunny days. Perfect island hopping." },
      { month: 6, rating: "best", averageTemp: "22-31°C", rainfall: "Very Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Hot and dry. Peak summer season. Whitewashed villages stunning." },
      { month: 7, rating: "average", averageTemp: "24-33°C", rainfall: "Very Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Hottest month. Extreme crowds on islands." },
      { month: 8, rating: "average", averageTemp: "24-33°C", rainfall: "Very Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Peak heat. August holidays. Crowded. Consider mountain escape." },
      { month: 9, rating: "best", averageTemp: "21-29°C", rainfall: "Low", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Perfect weather. Crowds decreasing. Sea still warm." },
      { month: 10, rating: "good", averageTemp: "16-24°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Warm autumn. Grapes and olives harvested." },
      { month: 11, rating: "average", averageTemp: "12-19°C", rainfall: "Medium", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Late autumn. Increasing rain." },
      { month: 12, rating: "average", averageTemp: "9-15°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Cool and rainy. Christmas festivities begin." },
    ],
    events: [
      { title: "Easter (Pascha)", eventType: "religious", startMonth: 4, endMonth: 4, description: "Greek Orthodox Easter with candlelight processions and family feasts.", tips: "Book early. Join locals at midnight services. Try Easter lamb feasts." },
      { title: "Summer Wine Festival", eventType: "cultural", startMonth: 8, endMonth: 8, description: "Retsina wine festival in Athens suburbs with traditional music.", tips: "Affordable wines and street food. Great local experience." },
      { title: "Rockwave Festival", eventType: "cultural", startMonth: 7, endMonth: 7, description: "International rock and pop music festival near Athens.", tips: "Book hotels early. Most shows are evening performances." },
    ]
  },
  {
    country: "Iceland",
    seasons: [
      { month: 1, rating: "average", averageTemp: "-3-1°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Medium", weatherDescription: "Dark winter. Northern lights possible. Snowy landscapes." },
      { month: 2, rating: "average", averageTemp: "-3-1°C", rainfall: "Medium", crowdLevel: "Low", priceLevel: "Medium", weatherDescription: "Still dark but longer days starting. Aurora borealis season." },
      { month: 3, rating: "average", averageTemp: "-1-3°C", rainfall: "Medium", crowdLevel: "Low", priceLevel: "Medium", weatherDescription: "Improving light. More aurora opportunities." },
      { month: 4, rating: "good", averageTemp: "1-7°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "High", weatherDescription: "Spring light. Puffins return. Melting snow reveals landscapes." },
      { month: 5, rating: "best", averageTemp: "5-12°C", rainfall: "Medium", crowdLevel: "High", priceLevel: "High", weatherDescription: "Nearly 24-hour daylight. Perfect for hiking. Whales visible." },
      { month: 6, rating: "best", averageTemp: "9-15°C", rainfall: "Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Midnight sun. Peak season. All roads open. Puffins at pufferies." },
      { month: 7, rating: "best", averageTemp: "10-16°C", rainfall: "Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Warmest month. Endless daylight. All nature activities available." },
      { month: 8, rating: "best", averageTemp: "9-15°C", rainfall: "Medium", crowdLevel: "High", priceLevel: "High", weatherDescription: "Great weather. Peak summer tourism. Less crowded than June/July." },
      { month: 9, rating: "good", averageTemp: "6-11°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Autumn colors. Aurora season begins. Fewer tourists." },
      { month: 10, rating: "average", averageTemp: "3-7°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Dark nights. Aurora hunting season." },
      { month: 11, rating: "average", averageTemp: "0-4°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Mostly dark. Best aurora probability. Snow falling." },
      { month: 12, rating: "average", averageTemp: "-2-1°C", rainfall: "High", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Darkest month. Northern lights season. Christmas activities." },
    ],
    events: [
      { title: "Reykjavík Marathon", eventType: "sporting", startMonth: 8, endMonth: 8, description: "Marathon held in summer midnight sun conditions on scenic routes.", tips: "Register early. Great for runners. After-party in downtown Reykjavík." },
      { title: "Puffin Season", eventType: "season", startMonth: 4, endMonth: 8, description: "Breeding season for puffins. Best viewing April-August.", tips: "Visit pufferies early morning. Dress warm even in summer." },
      { title: "Northern Lights (Aurora Borealis)", eventType: "season", startMonth: 9, endMonth: 3, description: "Magical green lights dancing across winter skies.", tips: "Best in dark months. Clear skies required. Tour guides helpful." },
    ]
  },
  {
    country: "Indonesia",
    seasons: [
      { month: 1, rating: "average", averageTemp: "25-31°C", rainfall: "Very High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Rainy season. Wet and humid. Fewer tourists. Great for rice terraces." },
      { month: 2, rating: "average", averageTemp: "25-31°C", rainfall: "Very High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Rainy season continues. Green landscapes lush." },
      { month: 3, rating: "average", averageTemp: "25-32°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Rain decreasing. Still green but improving weather." },
      { month: 4, rating: "good", averageTemp: "26-32°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Transition to dry. Weather improving rapidly." },
      { month: 5, rating: "best", averageTemp: "25-31°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Dry season begins. Perfect weather. Best scuba diving." },
      { month: 6, rating: "best", averageTemp: "24-30°C", rainfall: "Very Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Peak dry season. Ideal for all islands." },
      { month: 7, rating: "best", averageTemp: "23-29°C", rainfall: "Very Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Coolest and driest. Peak tourist season." },
      { month: 8, rating: "best", averageTemp: "23-30°C", rainfall: "Very Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Dry season peak. Clear skies. Perfect island hopping." },
      { month: 9, rating: "good", averageTemp: "24-31°C", rainfall: "Low", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Still dry but warming. Crowds starting to decrease." },
      { month: 10, rating: "average", averageTemp: "25-32°C", rainfall: "Medium", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Transition month. Rains beginning." },
      { month: 11, rating: "average", averageTemp: "26-32°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Rainy season returns. Wet and humid." },
      { month: 12, rating: "average", averageTemp: "25-31°C", rainfall: "Very High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Rainy season. Hottest and wettest." },
    ],
    events: [
      { title: "Nyepi (Balinese New Year)", eventType: "religious", startMonth: 3, endMonth: 3, description: "Silent Day in Bali. The entire island shuts down for 24 hours of silence and reflection.", tips: "Must return to accommodation before sunset. Respect local customs. Interesting to observe." },
      { title: "Balian Festival (Seminyak)", eventType: "festival", startMonth: 6, endMonth: 6, description: "Beach festival celebrating Balinese culture and art.", tips: "Music, food stalls, and cultural performances. Great photo ops." },
      { title: "Ikat Weaving Festival", eventType: "cultural", startMonth: 8, endMonth: 8, description: "Traditional textile weaving demonstrations and sales in Flores.", tips: "Support local weavers by purchasing traditional textiles." },
    ]
  },
  {
    country: "Mexico",
    seasons: [
      { month: 1, rating: "best", averageTemp: "18-28°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Dry season. Perfect weather everywhere. Winter escape." },
      { month: 2, rating: "best", averageTemp: "19-29°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Warm and dry. Ideal for beaches and ruins." },
      { month: 3, rating: "best", averageTemp: "20-30°C", rainfall: "Very Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Hot dry season. Spring break season." },
      { month: 4, rating: "good", averageTemp: "22-32°C", rainfall: "Low", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Hot and dry. Easter holidays busy." },
      { month: 5, rating: "average", averageTemp: "24-33°C", rainfall: "Medium", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Hot season. Afternoon rains begin." },
      { month: 6, rating: "average", averageTemp: "24-33°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Rainy season. Hot and humid." },
      { month: 7, rating: "average", averageTemp: "24-32°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Rainy season. Afternoon showers common." },
      { month: 8, rating: "average", averageTemp: "24-32°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Humid rainy season. Green landscapes." },
      { month: 9, rating: "average", averageTemp: "23-31°C", rainfall: "Very High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Peak rainy season. Hurricane season possible." },
      { month: 10, rating: "good", averageTemp: "22-30°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Rain subsiding. Weather improving." },
      { month: 11, rating: "best", averageTemp: "20-28°C", rainfall: "Low", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Dry season returns. Perfect weather." },
      { month: 12, rating: "best", averageTemp: "18-27°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Dry and cool. Holiday season. Excellent." },
    ],
    events: [
      { title: "Día de Muertos (Day of Dead)", eventType: "cultural", startMonth: 11, endMonth: 11, description: "UNESCO cultural heritage celebration. Ofrendas, sugar skulls, and parades honoring deceased loved ones.", tips: "Visit Mexico City, Oaxaca, or Pátzcuaro. Book ahead. Respectfully observe traditions." },
      { title: "Carnival in Veracruz", eventType: "festival", startMonth: 2, endMonth: 2, description: "Mexico's largest carnival with parades, costumes, and street parties.", tips: "Book accommodation months early. Amazing street food and music." },
      { title: "Fiestas de Guanajuato", eventType: "festival", startMonth: 10, endMonth: 10, description: "Month-long festival with concerts, street performances, and celebrations.", tips: "Explore colonial architecture during festivities. Very festive atmosphere." },
    ]
  },
  {
    country: "Peru",
    seasons: [
      { month: 1, rating: "average", averageTemp: "10-20°C (highlands) / 24-28°C (jungle)", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Rainy season. Green highlands. Jungle wet. Fewer tourists." },
      { month: 2, rating: "average", averageTemp: "10-20°C (highlands) / 24-28°C (jungle)", rainfall: "Very High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Peak rainy season. Landslide risks. Lush landscapes." },
      { month: 3, rating: "average", averageTemp: "11-21°C (highlands) / 24-29°C (jungle)", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Rain decreasing. Weather improving." },
      { month: 4, rating: "good", averageTemp: "12-22°C (highlands) / 24-29°C (jungle)", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Transition to dry. Clouds clearing." },
      { month: 5, rating: "best", averageTemp: "12-22°C (highlands) / 24-29°C (jungle)", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Dry season begins. Perfect for Machu Picchu." },
      { month: 6, rating: "best", averageTemp: "10-21°C (highlands) / 23-28°C (jungle)", rainfall: "Very Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Peak dry season. Cool in highlands. Clearest Machu Picchu views." },
      { month: 7, rating: "best", averageTemp: "9-20°C (highlands) / 23-28°C (jungle)", rainfall: "Very Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Dry and cool. Best trekking weather." },
      { month: 8, rating: "best", averageTemp: "10-21°C (highlands) / 23-28°C (jungle)", rainfall: "Very Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Coolest month. Clear skies. Peak season continues." },
      { month: 9, rating: "good", averageTemp: "12-22°C (highlands) / 24-29°C (jungle)", rainfall: "Low", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Still dry. Crowds decreasing. Warming up." },
      { month: 10, rating: "average", averageTemp: "14-23°C (highlands) / 24-29°C (jungle)", rainfall: "Medium", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Transition to wet. Occasional afternoon showers." },
      { month: 11, rating: "average", averageTemp: "15-24°C (highlands) / 24-29°C (jungle)", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Rainy season approaching. More clouds." },
      { month: 12, rating: "average", averageTemp: "15-24°C (highlands) / 25-29°C (jungle)", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Rainy season begins. Jungle most lush." },
    ],
    events: [
      { title: "Inti Raymi (Festival of the Sun)", eventType: "cultural", startMonth: 6, endMonth: 6, description: "Inca solstice festival with traditional ceremonies reenacted at Sacsayhuamán.", tips: "Book accommodation early. Authentic indigenous celebration. Wear layers." },
      { title: "Corpus Christi", eventType: "religious", startMonth: 6, endMonth: 6, description: "Catholic festival blending indigenous and Spanish traditions with processions.", tips: "Celebrated throughout Peru. Lima and Cusco have major celebrations." },
      { title: "Feast of San Juan", eventType: "cultural", startMonth: 6, endMonth: 6, description: "Amazon celebration with traditional music, jungle products, and bonfires.", tips: "Experience authentic rainforest culture. Travel to Iquitos." },
    ]
  },
  {
    country: "United Kingdom",
    seasons: [
      { month: 1, rating: "average", averageTemp: "2-8°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Cold and grey. Winter sales. Cozy pubs and museums." },
      { month: 2, rating: "average", averageTemp: "2-9°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Still cold. Half-term holidays busy." },
      { month: 3, rating: "good", averageTemp: "4-11°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Spring emerging. Easter holidays. Daffodils blooming." },
      { month: 4, rating: "best", averageTemp: "7-15°C", rainfall: "Medium", crowdLevel: "High", priceLevel: "High", weatherDescription: "Spring flowers. Easter holidays. Bank holidays. Perfect." },
      { month: 5, rating: "best", averageTemp: "10-18°C", rainfall: "Low", crowdLevel: "High", priceLevel: "High", weatherDescription: "Ideal weather. May bank holidays. Gardens beautiful." },
      { month: 6, rating: "best", averageTemp: "13-21°C", rainfall: "Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Long days. School holidays start. Chelsea Flower Show." },
      { month: 7, rating: "good", averageTemp: "14-23°C", rainfall: "Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Warmest month. Peak tourist season. School holidays." },
      { month: 8, rating: "good", averageTemp: "14-23°C", rainfall: "Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Summer holidays. Long daylight. August bank holiday." },
      { month: 9, rating: "best", averageTemp: "12-19°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Early autumn. Back to school. Perfect weather." },
      { month: 10, rating: "good", averageTemp: "9-15°C", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Autumn colors. Half-term holidays. Cooler." },
      { month: 11, rating: "average", averageTemp: "5-11°C", rainfall: "High", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Late autumn. Wet and dark." },
      { month: 12, rating: "average", averageTemp: "3-9°C", rainfall: "High", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Cold and grey. Christmas markets. Festive atmosphere." },
    ],
    events: [
      { title: "Chelsea Flower Show", eventType: "cultural", startMonth: 5, endMonth: 5, description: "World's most prestigious flower show with garden displays and horticulture.", tips: "Tickets sell out quickly. RHS members get advance booking. Day out only." },
      { title: "Wimbledon Championship", eventType: "sporting", startMonth: 7, endMonth: 7, description: "World's oldest tennis tournament on grass courts.", tips: "Book early. Queue camping for day tickets. Strawberries and cream traditions." },
      { title: "Edinburgh Festival Fringe", eventType: "cultural", startMonth: 8, endMonth: 8, description: "World's largest performing arts festival with thousands of shows.", tips: "Book accommodation in advance. Incredible energy. Street performances everywhere." },
    ]
  },
  {
    country: "United States",
    seasons: [
      { month: 1, rating: "average", averageTemp: "-5-5°C (north) / 15-25°C (south)", rainfall: "Variable", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Winter. Snow in north, mild in south. Winter sports and Miami beaches." },
      { month: 2, rating: "average", averageTemp: "-3-7°C (north) / 16-26°C (south)", rainfall: "Variable", crowdLevel: "Low", priceLevel: "Low", weatherDescription: "Winter continues. Presidents Day holidays. Mountain skiing peak." },
      { month: 3, rating: "good", averageTemp: "2-12°C (north) / 18-27°C (south)", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Spring awakening. Spring break period. Weather improving." },
      { month: 4, rating: "best", averageTemp: "8-18°C (north) / 20-29°C (south)", rainfall: "Medium", crowdLevel: "High", priceLevel: "High", weatherDescription: "Perfect spring. Easter holidays. Cherry blossoms in DC." },
      { month: 5, rating: "best", averageTemp: "13-23°C (north) / 23-32°C (south)", rainfall: "Medium", crowdLevel: "High", priceLevel: "High", weatherDescription: "Ideal weather. Memorial Day. Warm and sunny." },
      { month: 6, rating: "best", averageTemp: "18-28°C (north) / 26-34°C (south)", rainfall: "Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Early summer. School ends. National parks crowded." },
      { month: 7, rating: "average", averageTemp: "20-30°C (north) / 28-36°C (south)", rainfall: "Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Hot summer. Independence Day. Beach season. Peak crowds." },
      { month: 8, rating: "average", averageTemp: "19-29°C (north) / 27-36°C (south)", rainfall: "Low", crowdLevel: "Very High", priceLevel: "High", weatherDescription: "Peak heat and crowds. Summer vacation period." },
      { month: 9, rating: "best", averageTemp: "16-26°C (north) / 25-33°C (south)", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Perfect weather. Labor Day. Back to school. Crowds decrease." },
      { month: 10, rating: "best", averageTemp: "10-20°C (north) / 22-30°C (south)", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Ideal fall weather. Fall foliage in northeast. Halloween." },
      { month: 11, rating: "good", averageTemp: "5-15°C (north) / 19-27°C (south)", rainfall: "Medium", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Autumn colors peak. Thanksgiving week busy. Cooling down." },
      { month: 12, rating: "average", averageTemp: "-1-8°C (north) / 16-25°C (south)", rainfall: "Variable", crowdLevel: "Medium", priceLevel: "Medium", weatherDescription: "Winter arrives. Christmas holidays. Festive season." },
    ],
    events: [
      { title: "Mardi Gras", eventType: "festival", startMonth: 2, endMonth: 2, description: "New Orleans legendary carnival with parades, floats, and celebrations.", tips: "Book 6+ months early. Respect local customs. Beads and costumes central." },
      { title: "Coachella Music Festival", eventType: "festival", startMonth: 4, endMonth: 4, description: "Major music festival in California desert with world-class artists.", tips: "Book tickets early (sell out). Glamping or camping. Fashion-forward crowd." },
      { title: "Thanksgiving", eventType: "holiday", startMonth: 11, endMonth: 11, description: "National holiday with family gatherings and traditional meals.", tips: "Book flights months in advance. Hotels full. Experience authentic American culture." },
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
