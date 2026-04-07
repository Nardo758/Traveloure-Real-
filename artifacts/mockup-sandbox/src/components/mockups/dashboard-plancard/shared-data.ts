export interface Activity {
  id: string;
  name: string;
  type: string;
  status: "confirmed" | "pending" | "suggested";
  time: string;
  location: string;
  lat: number;
  lng: number;
  cost: number;
  comments: number;
  expertNote?: string;
  description?: string;
  bookingRef?: string;
  rating?: number;
  imageUrl?: string;
  phone?: string;
  website?: string;
  duration?: number;
}

export interface Transport {
  id: string;
  mode: string;
  from: string;
  to: string;
  duration: number;
  cost: number;
  status: "confirmed" | "pending" | "suggested";
  line?: string;
  suggestedBy?: string;
  bookingRef?: string;
  operator?: string;
  departureTime?: string;
  arrivalTime?: string;
  distance?: string;
  alternatives?: { mode: string; duration: number; cost: number }[];
}

export interface DayData {
  dayNum: number;
  date: string;
  label: string;
  activities: Activity[];
  transports: Transport[];
}

export interface ExpertNote {
  id: string;
  who: string;
  initials: string;
  message: string;
  when: string;
  dayRef?: number;
  topicTag?: string;
}

export interface ChangeEntry {
  id: string;
  who: string;
  role: "expert" | "ai" | "owner";
  type: string;
  what: string;
  when: string;
}

export interface ExpertChange {
  id: string;
  type: "replace" | "time" | "add" | "remove";
  title: string;
  removeLine: string | null;
  addLine: string;
  reason: string;
  dayNum?: number;
  status?: "pending" | "accepted" | "rejected";
}

export interface ServiceBooking {
  id: string;
  name: string;
  type: "hotel" | "tour" | "restaurant" | "transport" | "insurance";
  provider: string;
  status: "confirmed" | "pending" | "cancelled";
  confirmationCode?: string;
  checkIn?: string;
  checkOut?: string;
  date?: string;
  cost: number;
  contact?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export const TRIP = {
  id: "9e435bca-45d9-44b8-8a68-393531cf7ad1",
  title: "California Road Trip",
  destination: "San Francisco, CA",
  startDate: "2026-05-20",
  endDate: "2026-05-27",
  numberOfTravelers: 4,
  budget: 4200,
  spent: 3820,
  status: "active" as const,
  score: 87,
  savings: 380,
  wellnessMinutes: 45,
  imageUrl: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=800&h=400&fit=crop",
};

export const DAYS: DayData[] = [
  {
    dayNum: 1, date: "2026-05-20", label: "Arrival Day",
    activities: [
      { id: "a1", name: "Golden Gate Bridge Walk", type: "attraction", status: "confirmed", time: "09:00", location: "Golden Gate Bridge, SF", lat: 37.8199, lng: -122.4783, cost: 0, comments: 2, expertNote: "Best visited early morning for the fog effect — truly magical views.", description: "Walk across the iconic Golden Gate Bridge. The 1.7-mile span offers breathtaking views of the Bay, Alcatraz, and the city skyline. Bring layers — it's windy!", rating: 4.8, imageUrl: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=600&h=300&fit=crop", duration: 90, phone: "+1 (415) 921-5858", website: "https://www.goldengate.org" },
      { id: "a2", name: "Fisherman's Wharf Lunch", type: "dining", status: "confirmed", time: "11:30", location: "Pier 39, SF", lat: 37.8087, lng: -122.4098, cost: 45, comments: 0, description: "Fresh seafood at Pier 39 with waterfront views. Try the clam chowder in a sourdough bread bowl.", rating: 4.2, imageUrl: "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=600&h=300&fit=crop", duration: 75, bookingRef: "FW-2026-0520-A", phone: "+1 (415) 705-5500" },
      { id: "a3", name: "Alcatraz Island Tour", type: "attraction", status: "pending", time: "14:00", location: "Alcatraz Island, SF Bay", lat: 37.8267, lng: -122.4230, cost: 42, comments: 1, description: "Guided audio tour of the infamous federal penitentiary. Includes ferry ride. Book early — sells out weeks in advance.", rating: 4.7, imageUrl: "https://images.unsplash.com/photo-1547429464-57c93f625e30?w=600&h=300&fit=crop", duration: 180, bookingRef: "ALC-78432", phone: "+1 (415) 561-4900", website: "https://www.alcatrazcruises.com" },
      { id: "a4", name: "Chinatown Dinner", type: "dining", status: "confirmed", time: "18:30", location: "Grant Ave, Chinatown", lat: 37.7941, lng: -122.4078, cost: 55, comments: 0, expertNote: "Ask for the upstairs room — better ambiance and sunset views.", description: "Authentic Cantonese cuisine in the oldest Chinatown in North America. Family-style dining recommended.", rating: 4.5, imageUrl: "https://images.unsplash.com/photo-1526234362653-3b75a0c07438?w=600&h=300&fit=crop", duration: 90, bookingRef: "CT-DINNER-0520" },
      { id: "a5", name: "North Beach Gelato", type: "dining", status: "suggested", time: "20:30", location: "Columbus Ave, North Beach", lat: 37.7998, lng: -122.4083, cost: 12, comments: 0, description: "Artisan gelato in San Francisco's Little Italy. Try the pistachio and stracciatella.", rating: 4.6, duration: 30 },
    ],
    transports: [
      { id: "t1", mode: "walk", from: "Hotel Bohème", to: "Golden Gate Bridge", duration: 15, cost: 0, status: "confirmed", distance: "0.8 mi", departureTime: "08:45", arrivalTime: "09:00" },
      { id: "t2", mode: "taxi", from: "Golden Gate Bridge", to: "Pier 39", duration: 20, cost: 18, status: "confirmed", operator: "Uber", distance: "4.2 mi", departureTime: "10:30", arrivalTime: "10:50", alternatives: [{ mode: "bus", duration: 35, cost: 3 }, { mode: "walk", duration: 55, cost: 0 }] },
      { id: "t3", mode: "ferry", from: "Pier 33", to: "Alcatraz Island", duration: 15, cost: 0, status: "confirmed", line: "Alcatraz Cruises", operator: "Alcatraz Cruises", bookingRef: "ALC-FERRY-78432", departureTime: "13:40", arrivalTime: "13:55" },
      { id: "t4", mode: "bus", from: "Pier 39", to: "Chinatown", duration: 12, cost: 3, status: "suggested", suggestedBy: "expert", line: "Muni Line 30", operator: "SFMTA", distance: "2.1 mi", departureTime: "18:00", arrivalTime: "18:12", alternatives: [{ mode: "taxi", duration: 8, cost: 12 }, { mode: "walk", duration: 25, cost: 0 }] },
    ],
  },
  {
    dayNum: 2, date: "2026-05-21", label: "Coastal Drive",
    activities: [
      { id: "a6", name: "Baker Beach Yoga", type: "attraction", status: "suggested", time: "08:00", location: "Baker Beach, SF", lat: 37.7936, lng: -122.4835, cost: 0, comments: 0, expertNote: "Great way to start the day — bring your own mat.", description: "Morning yoga session on the sand with views of the Golden Gate Bridge.", duration: 60, rating: 4.4 },
      { id: "a7", name: "Highway 1 Drive Start", type: "attraction", status: "confirmed", time: "10:00", location: "Pacifica, CA", lat: 37.6138, lng: -122.4869, cost: 0, comments: 0, description: "Begin the scenic Pacific Coast Highway drive southward.", duration: 120, rating: 4.9 },
      { id: "a8", name: "Half Moon Bay Lunch", type: "dining", status: "confirmed", time: "12:30", location: "Half Moon Bay, CA", lat: 37.4636, lng: -122.4286, cost: 35, comments: 0, description: "Coastal seafood at Sam's Chowder House.", duration: 75, rating: 4.3, bookingRef: "HMB-LUNCH-0521" },
    ],
    transports: [
      { id: "t5", mode: "car", from: "Hotel Bohème", to: "Baker Beach", duration: 10, cost: 0, status: "confirmed", distance: "3.5 mi" },
      { id: "t6", mode: "car", from: "Baker Beach", to: "Pacifica", duration: 25, cost: 0, status: "confirmed", distance: "12 mi" },
    ],
  },
  {
    dayNum: 3, date: "2026-05-22", label: "Big Sur",
    activities: [
      { id: "a9", name: "Bixby Bridge Viewpoint", type: "attraction", status: "confirmed", time: "10:00", location: "Bixby Creek Bridge, Big Sur", lat: 36.3714, lng: -121.9026, cost: 0, comments: 1, description: "One of the most photographed bridges in California. Stop at the pullout on the north side.", duration: 30, rating: 4.8, imageUrl: "https://images.unsplash.com/photo-1449034446853-66c86144b0ad?w=600&h=300&fit=crop" },
      { id: "a10", name: "McWay Falls Trail", type: "attraction", status: "confirmed", time: "13:00", location: "Julia Pfeiffer Burns SP", lat: 36.1579, lng: -121.6722, cost: 10, comments: 0, description: "Short trail to an overlook of the 80-foot waterfall cascading onto the beach.", duration: 60, rating: 4.7 },
    ],
    transports: [
      { id: "t7", mode: "car", from: "Half Moon Bay", to: "Bixby Bridge", duration: 150, cost: 0, status: "confirmed", distance: "120 mi" },
    ],
  },
  {
    dayNum: 4, date: "2026-05-23", label: "Monterey",
    activities: [
      { id: "a11", name: "Monterey Bay Aquarium", type: "attraction", status: "confirmed", time: "10:00", location: "886 Cannery Row, Monterey", lat: 36.6185, lng: -121.9018, cost: 50, comments: 0, description: "World-class aquarium with stunning kelp forest and sea otter exhibits.", duration: 240, rating: 4.9, bookingRef: "MBA-TIX-0523", imageUrl: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600&h=300&fit=crop" },
    ],
    transports: [],
  },
  {
    dayNum: 5, date: "2026-05-24", label: "Santa Cruz",
    activities: [
      { id: "a12", name: "Santa Cruz Boardwalk", type: "attraction", status: "confirmed", time: "11:00", location: "400 Beach St, Santa Cruz", lat: 36.9642, lng: -122.0177, cost: 30, comments: 0, description: "Classic beachside amusement park. Ride the Giant Dipper — a 1924 wooden roller coaster.", duration: 180, rating: 4.3 },
    ],
    transports: [],
  },
  {
    dayNum: 6, date: "2026-05-25", label: "Napa Valley",
    activities: [
      { id: "a13", name: "Wine Tasting Tour", type: "attraction", status: "confirmed", time: "10:00", location: "Napa Valley, CA", lat: 38.5025, lng: -122.2654, cost: 85, comments: 0, description: "Visit 3 premier wineries with guided tastings. Includes transport between estates.", duration: 360, rating: 4.6, bookingRef: "NAPA-WINE-0525" },
    ],
    transports: [],
  },
  {
    dayNum: 7, date: "2026-05-26", label: "Wine Country",
    activities: [
      { id: "a14", name: "Hot Air Balloon Ride", type: "attraction", status: "pending", time: "06:30", location: "Yountville, Napa", lat: 38.4013, lng: -122.3608, cost: 280, comments: 0, description: "Sunrise balloon ride over Napa Valley vineyards. Includes champagne brunch on landing.", duration: 180, rating: 4.9, bookingRef: "BALLOON-0526" },
    ],
    transports: [],
  },
  {
    dayNum: 8, date: "2026-05-27", label: "Departure",
    activities: [
      { id: "a15", name: "Airport Transfer", type: "attraction", status: "confirmed", time: "14:00", location: "SFO Airport", lat: 37.6213, lng: -122.3790, cost: 0, comments: 0, description: "Transfer to San Francisco International Airport for departure.", duration: 60 },
    ],
    transports: [],
  },
];

export const CHANGELOG: ChangeEntry[] = [
  { id: "c1", who: "Sofia Chen", role: "expert", type: "suggest", what: "Replaced Holiday Inn with Hotel Bohème — better location", when: "2h ago" },
  { id: "c2", who: "AI Optimizer", role: "ai", type: "optimize", what: "Optimized Day 1 transit — saved 25 min", when: "5h ago" },
  { id: "c3", who: "You", role: "owner", type: "edit", what: "Added Chinatown dinner reservation", when: "Yesterday" },
  { id: "c4", who: "Sofia Chen", role: "expert", type: "suggest", what: "Added Baker Beach yoga — Day 2", when: "Yesterday" },
  { id: "c5", who: "AI Optimizer", role: "ai", type: "optimize", what: "Found $45 cheaper alternative for Alcatraz tickets", when: "2 days ago" },
  { id: "c6", who: "You", role: "owner", type: "edit", what: "Confirmed Monterey Bay Aquarium booking", when: "3 days ago" },
];

export const EXPERT_NOTES: ExpertNote[] = [
  { id: "en1", who: "Sofia Chen", initials: "SC", message: "I'd recommend the boutique hotel on Lombard St instead — better location, same price range. Also moved dinner to 6:30 PM for sunset views from the upstairs room.", when: "2h ago", dayRef: 1, topicTag: "Accommodation" },
  { id: "en2", who: "Sofia Chen", initials: "SC", message: "Added the Golden Gate walk — it's a must-do. Best in the early morning when the fog rolls in. Aim for before 9 AM.", when: "Yesterday", dayRef: 1, topicTag: "Activities" },
  { id: "en3", who: "Sofia Chen", initials: "SC", message: "For Big Sur, make sure to fill up gas before leaving. There are very few stations along Highway 1. Also, the Bixby Bridge pullout can get crowded — arrive early.", when: "Yesterday", dayRef: 3, topicTag: "Logistics" },
  { id: "en4", who: "Sofia Chen", initials: "SC", message: "The balloon ride in Napa is weather-dependent. I'd recommend having a backup plan — maybe a vineyard bike tour? I can suggest one if you'd like.", when: "2 days ago", dayRef: 7, topicTag: "Activities" },
  { id: "en5", who: "Sofia Chen", initials: "SC", message: "Great choice on Monterey Bay Aquarium! Pro tip: visit the kelp forest exhibit right when they open — fewer crowds and the morning light is spectacular.", when: "3 days ago", dayRef: 4, topicTag: "Activities" },
];

export const EXPERT_CHANGES: ExpertChange[] = [
  {
    id: "ec1", type: "replace", title: "Hotel Swap", dayNum: 1,
    removeLine: "Holiday Inn Express · $189/night · 3★ · 0.8mi",
    addLine: "Hotel Bohème, North Beach · $175/night · 4★ · 0.3mi",
    reason: "Better location, boutique vibe, $14/night savings",
  },
  {
    id: "ec2", type: "time", title: "Dinner time — Day 1", dayNum: 1,
    removeLine: "Chinatown Dinner @ 6:00 PM",
    addLine: "Chinatown Dinner @ 6:30 PM",
    reason: "Better sunset views from the upstairs room",
  },
  {
    id: "ec3", type: "add", title: "New activity — Day 2", dayNum: 2,
    removeLine: null,
    addLine: "Morning yoga at Baker Beach · 08:00 AM · Free · Wellness",
    reason: "Great way to start the day before the coastal drive",
  },
  {
    id: "ec4", type: "replace", title: "Transport — Day 1 evening", dayNum: 1,
    removeLine: "Taxi from Pier 39 → Chinatown · $12 · 8 min",
    addLine: "Muni Bus Line 30 · $3 · 12 min",
    reason: "Much cheaper, only 4 min longer, and scenic route through North Beach",
  },
];

export const SERVICE_BOOKINGS: ServiceBooking[] = [
  { id: "sb1", name: "Hotel Bohème", type: "hotel", provider: "Booking.com", status: "confirmed", confirmationCode: "BK-2026-SF-7842", checkIn: "2026-05-20", checkOut: "2026-05-27", cost: 1225, contact: "Hotel Bohème Front Desk", phone: "+1 (415) 433-9111", address: "444 Columbus Ave, San Francisco, CA 94133", notes: "Boutique hotel in North Beach. Free Wi-Fi, no parking on-site." },
  { id: "sb2", name: "Alcatraz Island Tour", type: "tour", provider: "Alcatraz Cruises", status: "pending", confirmationCode: "ALC-78432", date: "2026-05-20", cost: 168, contact: "Alcatraz Cruises", phone: "+1 (415) 561-4900", address: "Pier 33, San Francisco", notes: "4 tickets @ $42 each. Night tour option available for +$10/ticket." },
  { id: "sb3", name: "Napa Wine Tour", type: "tour", provider: "Napa Valley Wine Train", status: "confirmed", confirmationCode: "NAPA-WINE-0525", date: "2026-05-25", cost: 340, contact: "Napa Valley Wine Train", phone: "+1 (707) 253-2111", address: "1275 McKinstry St, Napa, CA", notes: "Includes 3 winery visits + lunch. Pick-up at hotel." },
  { id: "sb4", name: "Hot Air Balloon Ride", type: "tour", provider: "Napa Valley Balloons", status: "pending", confirmationCode: "BALLOON-0526", date: "2026-05-26", cost: 1120, contact: "Napa Valley Balloons", phone: "+1 (707) 944-0228", address: "Yountville, CA", notes: "4 tickets @ $280 each. Weather-dependent — 24h cancellation." },
  { id: "sb5", name: "Rental Car", type: "transport", provider: "Enterprise", status: "confirmed", confirmationCode: "ENT-SF-2026-0520", checkIn: "2026-05-20", checkOut: "2026-05-27", cost: 490, contact: "Enterprise SFO", phone: "+1 (650) 737-1800", address: "SFO Airport Rental Center", notes: "Mid-size SUV. Unlimited mileage. Return at SFO." },
  { id: "sb6", name: "Travel Insurance", type: "insurance", provider: "World Nomads", status: "confirmed", confirmationCode: "WN-POL-284756", date: "2026-05-20", cost: 156, contact: "World Nomads Claims", phone: "+1 (888) 908-8433", notes: "Covers trip cancellation, medical, luggage. 4 travelers." },
];

export const EXPERT_PROFILE = {
  name: "Sofia Chen",
  initials: "SC",
  title: "Bay Area Travel Specialist",
  rating: 4.9,
  reviews: 127,
  trips: 84,
  specialties: ["California", "Wine Country", "Coastal Routes", "City Exploration"],
  bio: "Born and raised in San Francisco. I specialize in creating unforgettable California road trip experiences, from hidden coastal gems to the best local dining spots. 8 years of expert travel advisory.",
  responseTime: "< 2 hours",
  languages: ["English", "Mandarin"],
};

export const CHAT_MESSAGES = [
  { id: "m1", sender: "expert", message: "Hi! I've reviewed your California Road Trip itinerary and have some suggestions to make it even better.", when: "3 days ago" },
  { id: "m2", sender: "user", message: "Great, looking forward to hearing your thoughts!", when: "3 days ago" },
  { id: "m3", sender: "expert", message: "First, I'd recommend switching your hotel from the Holiday Inn to Hotel Bohème in North Beach. It's a boutique spot right on Columbus Ave — way better location for walking to restaurants and attractions. And it's actually $14/night cheaper!", when: "3 days ago" },
  { id: "m4", sender: "user", message: "That sounds perfect. What about activities?", when: "2 days ago" },
  { id: "m5", sender: "expert", message: "I've added a Golden Gate Bridge walk for Day 1 morning — it's a must-do, especially before 9 AM when the fog creates an incredible atmosphere. Also added Baker Beach yoga for Day 2 to start the coastal drive relaxed.", when: "2 days ago" },
  { id: "m6", sender: "expert", message: "One more thing — I shifted your Chinatown dinner from 6:00 to 6:30 PM. The upstairs room at the restaurant has sunset views, and 6:30 hits that sweet spot perfectly.", when: "2 days ago" },
  { id: "m7", sender: "user", message: "Love all of these changes. What about transport?", when: "Yesterday" },
  { id: "m8", sender: "expert", message: "For the evening transit from Pier 39 to Chinatown, I'd suggest taking the Muni Line 30 bus instead of a taxi. It's $3 vs $12, only 4 minutes longer, and the route goes through North Beach — great views. I've added it as a suggestion in your plan.", when: "Yesterday" },
  { id: "m9", sender: "user", message: "Makes sense. Any tips for Big Sur?", when: "Yesterday" },
  { id: "m10", sender: "expert", message: "Definitely fill up on gas before leaving! There are very few stations along Highway 1. The Bixby Bridge pullout can get crowded, so try to arrive early. Also, the McWay Falls trail is short but the overlook is breathtaking.", when: "2h ago" },
];

export const TYPE_COLORS: Record<string, { bg: string; fg: string; dot: string }> = {
  dining: { bg: "bg-amber-100", fg: "text-amber-800", dot: "#f59e0b" },
  attraction: { bg: "bg-blue-100", fg: "text-blue-800", dot: "#3b82f6" },
  shopping: { bg: "bg-pink-100", fg: "text-pink-800", dot: "#ec4899" },
};

export const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  confirmed: { bg: "bg-green-100", fg: "text-green-800", label: "Confirmed" },
  pending: { bg: "bg-yellow-100", fg: "text-yellow-800", label: "Pending" },
  suggested: { bg: "bg-indigo-100", fg: "text-indigo-800", label: "Suggested" },
  cancelled: { bg: "bg-red-100", fg: "text-red-800", label: "Cancelled" },
};

export const MODE_COLORS: Record<string, string> = {
  walk: "#22c55e", taxi: "#f59e0b", ferry: "#06b6d4", bus: "#8b5cf6", car: "#3b82f6",
};

export const DAY_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

export function formatDuration(mins: number) {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function buildMapsUrl(location: string, lat?: number, lng?: number) {
  if (lat && lng) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location)}`;
}

export function buildAppleMapsUrl(location: string, lat?: number, lng?: number) {
  if (lat && lng) return `https://maps.apple.com/?daddr=${lat},${lng}`;
  return `https://maps.apple.com/?daddr=${encodeURIComponent(location)}`;
}
