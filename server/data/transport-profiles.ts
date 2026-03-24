export interface TransportModeConfig {
  mode: string;
  available: boolean;
  baseCostPerKm: number;
  flagFall: number;
  averageSpeedKmh: number;
  waitTimeMinutes: number;
  energyCostPerKm: number;
  comfortScore: number;
  scenicScore: number;
  accessibilityScore: number;
  availableHours: { start: number; end: number };
  seasonalRestrictions?: string[];
  localName?: string;
}

export interface DestinationTransportProfile {
  destinationSlug: string;
  availableModes: TransportModeConfig[];
  defaultCurrency: string;
  walkabilityScore: number;
  publicTransitQuality: number;
  trafficSeverity: number;
  cyclingInfrastructure: number;
  specialNotes: string[];
}

export const TRANSPORT_PROFILES: Record<string, DestinationTransportProfile> = {
  kyoto: {
    destinationSlug: "kyoto",
    defaultCurrency: "USD",
    walkabilityScore: 75,
    publicTransitQuality: 90,
    trafficSeverity: 30,
    cyclingInfrastructure: 85,
    specialNotes: [
      "Trains are extremely punctual",
      "Last trains around 23:30",
      "Cycling is a popular local transport mode",
      "Bus system covers areas trains don't",
      "Taxis are expensive but very safe",
    ],
    availableModes: [
      {
        mode: "walk",
        available: true,
        baseCostPerKm: 0,
        flagFall: 0,
        averageSpeedKmh: 4.5,
        waitTimeMinutes: 0,
        energyCostPerKm: 3,
        comfortScore: 60,
        scenicScore: 90,
        accessibilityScore: 40,
        availableHours: { start: 0, end: 24 },
      },
      {
        mode: "train",
        available: true,
        baseCostPerKm: 0.6,
        flagFall: 1.5,
        averageSpeedKmh: 35,
        waitTimeMinutes: 5,
        energyCostPerKm: 0.5,
        comfortScore: 85,
        scenicScore: 50,
        accessibilityScore: 80,
        availableHours: { start: 5, end: 24 },
        localName: "JR / Hankyu / Keihan",
      },
      {
        mode: "bus",
        available: true,
        baseCostPerKm: 0,
        flagFall: 2.0,
        averageSpeedKmh: 15,
        waitTimeMinutes: 10,
        energyCostPerKm: 0.5,
        comfortScore: 60,
        scenicScore: 70,
        accessibilityScore: 70,
        availableHours: { start: 6, end: 22 },
      },
      {
        mode: "bike",
        available: true,
        baseCostPerKm: 0.3,
        flagFall: 1.0,
        averageSpeedKmh: 12,
        waitTimeMinutes: 3,
        energyCostPerKm: 2,
        comfortScore: 70,
        scenicScore: 95,
        accessibilityScore: 10,
        availableHours: { start: 6, end: 22 },
        localName: "Rental bicycle / Pippa Cycle",
      },
      {
        mode: "taxi",
        available: true,
        baseCostPerKm: 3.5,
        flagFall: 6.0,
        averageSpeedKmh: 25,
        waitTimeMinutes: 5,
        energyCostPerKm: 0.2,
        comfortScore: 95,
        scenicScore: 40,
        accessibilityScore: 60,
        availableHours: { start: 0, end: 24 },
      },
      {
        mode: "rental_car",
        available: true,
        baseCostPerKm: 1.2,
        flagFall: 35.0,
        averageSpeedKmh: 20,
        waitTimeMinutes: 0,
        energyCostPerKm: 0.3,
        comfortScore: 80,
        scenicScore: 60,
        accessibilityScore: 70,
        availableHours: { start: 0, end: 24 },
      },
    ],
  },

  mumbai: {
    destinationSlug: "mumbai",
    defaultCurrency: "USD",
    walkabilityScore: 40,
    publicTransitQuality: 60,
    trafficSeverity: 95,
    cyclingInfrastructure: 10,
    specialNotes: [
      "Traffic is extreme — always prefer trains over taxis during rush hour",
      "Auto-rickshaws are the fastest short-distance option",
      "Mumbai local trains are fast but extremely crowded during peak hours",
      "AC taxis and Uber/Ola are comfortable but slow in traffic",
      "Walking can be challenging due to sidewalk conditions",
    ],
    availableModes: [
      {
        mode: "walk",
        available: true,
        baseCostPerKm: 0,
        flagFall: 0,
        averageSpeedKmh: 3.5,
        waitTimeMinutes: 0,
        energyCostPerKm: 4,
        comfortScore: 30,
        scenicScore: 60,
        accessibilityScore: 20,
        availableHours: { start: 6, end: 22 },
      },
      {
        mode: "train",
        available: true,
        baseCostPerKm: 0.05,
        flagFall: 0.1,
        averageSpeedKmh: 30,
        waitTimeMinutes: 8,
        energyCostPerKm: 1,
        comfortScore: 30,
        scenicScore: 40,
        accessibilityScore: 20,
        availableHours: { start: 4, end: 24 },
        localName: "Mumbai Local",
      },
      {
        mode: "auto_rickshaw",
        available: true,
        baseCostPerKm: 0.2,
        flagFall: 0.3,
        averageSpeedKmh: 18,
        waitTimeMinutes: 3,
        energyCostPerKm: 1,
        comfortScore: 50,
        scenicScore: 75,
        accessibilityScore: 15,
        availableHours: { start: 6, end: 24 },
        localName: "Auto-rickshaw",
      },
      {
        mode: "taxi",
        available: true,
        baseCostPerKm: 0.4,
        flagFall: 1.5,
        averageSpeedKmh: 12,
        waitTimeMinutes: 5,
        energyCostPerKm: 0.3,
        comfortScore: 75,
        scenicScore: 50,
        accessibilityScore: 50,
        availableHours: { start: 0, end: 24 },
        localName: "Kaali-Peeli / Uber / Ola",
      },
      {
        mode: "rideshare",
        available: true,
        baseCostPerKm: 0.3,
        flagFall: 1.0,
        averageSpeedKmh: 12,
        waitTimeMinutes: 7,
        energyCostPerKm: 0.3,
        comfortScore: 80,
        scenicScore: 50,
        accessibilityScore: 50,
        availableHours: { start: 0, end: 24 },
        localName: "Uber / Ola (AC)",
      },
      {
        mode: "ferry",
        available: true,
        baseCostPerKm: 0.15,
        flagFall: 0.5,
        averageSpeedKmh: 20,
        waitTimeMinutes: 15,
        energyCostPerKm: 0.5,
        comfortScore: 70,
        scenicScore: 95,
        accessibilityScore: 30,
        availableHours: { start: 6, end: 20 },
        localName: "Mumbai Ferry",
      },
    ],
  },

  bogota: {
    destinationSlug: "bogota",
    defaultCurrency: "USD",
    walkabilityScore: 55,
    publicTransitQuality: 65,
    trafficSeverity: 80,
    cyclingInfrastructure: 60,
    specialNotes: [
      "TransMilenio BRT is fast on main corridors but crowded",
      "Ciclovía on Sundays closes major roads to cars",
      "Altitude (2,600m) increases walking energy cost",
      "Uber operates here but legally ambiguous",
    ],
    availableModes: [
      { mode: "walk", available: true, baseCostPerKm: 0, flagFall: 0, averageSpeedKmh: 4, waitTimeMinutes: 0, energyCostPerKm: 5, comfortScore: 50, scenicScore: 70, accessibilityScore: 40, availableHours: { start: 6, end: 22 } },
      { mode: "transit", available: true, baseCostPerKm: 0, flagFall: 0.7, averageSpeedKmh: 22, waitTimeMinutes: 8, energyCostPerKm: 0.5, comfortScore: 55, scenicScore: 40, accessibilityScore: 60, availableHours: { start: 5, end: 23 }, localName: "TransMilenio" },
      { mode: "taxi", available: true, baseCostPerKm: 0.5, flagFall: 1.2, averageSpeedKmh: 18, waitTimeMinutes: 5, energyCostPerKm: 0.2, comfortScore: 70, scenicScore: 50, accessibilityScore: 55, availableHours: { start: 0, end: 24 } },
      { mode: "rideshare", available: true, baseCostPerKm: 0.45, flagFall: 1.0, averageSpeedKmh: 18, waitTimeMinutes: 6, energyCostPerKm: 0.2, comfortScore: 75, scenicScore: 50, accessibilityScore: 55, availableHours: { start: 0, end: 24 }, localName: "InDriver / Cabify" },
      { mode: "bike", available: true, baseCostPerKm: 0.1, flagFall: 0.5, averageSpeedKmh: 14, waitTimeMinutes: 2, energyCostPerKm: 4, comfortScore: 60, scenicScore: 85, accessibilityScore: 10, availableHours: { start: 6, end: 20 }, localName: "Cicla / Tembici" },
    ],
  },

  goa: {
    destinationSlug: "goa",
    defaultCurrency: "USD",
    walkabilityScore: 50,
    publicTransitQuality: 35,
    trafficSeverity: 40,
    cyclingInfrastructure: 30,
    specialNotes: [
      "Scooter rental is the most popular tourist transport",
      "Taxis are the most comfortable but expensive",
      "Limited public bus coverage",
      "Monsoon season (Jun-Sep) limits outdoor transport options",
    ],
    availableModes: [
      { mode: "walk", available: true, baseCostPerKm: 0, flagFall: 0, averageSpeedKmh: 4, waitTimeMinutes: 0, energyCostPerKm: 4, comfortScore: 50, scenicScore: 85, accessibilityScore: 30, availableHours: { start: 6, end: 22 } },
      { mode: "bike", available: true, baseCostPerKm: 0.2, flagFall: 5.0, averageSpeedKmh: 25, waitTimeMinutes: 5, energyCostPerKm: 2, comfortScore: 70, scenicScore: 90, accessibilityScore: 5, availableHours: { start: 6, end: 22 }, localName: "Scooter rental" },
      { mode: "taxi", available: true, baseCostPerKm: 0.8, flagFall: 3.0, averageSpeedKmh: 30, waitTimeMinutes: 10, energyCostPerKm: 0.2, comfortScore: 85, scenicScore: 60, accessibilityScore: 55, availableHours: { start: 0, end: 24 } },
      { mode: "rideshare", available: true, baseCostPerKm: 0.5, flagFall: 1.5, averageSpeedKmh: 28, waitTimeMinutes: 8, energyCostPerKm: 0.2, comfortScore: 80, scenicScore: 55, accessibilityScore: 50, availableHours: { start: 6, end: 23 }, localName: "Rapido / Ola" },
      { mode: "auto_rickshaw", available: true, baseCostPerKm: 0.25, flagFall: 0.5, averageSpeedKmh: 20, waitTimeMinutes: 5, energyCostPerKm: 1, comfortScore: 55, scenicScore: 75, accessibilityScore: 15, availableHours: { start: 7, end: 22 } },
    ],
  },

  edinburgh: {
    destinationSlug: "edinburgh",
    defaultCurrency: "USD",
    walkabilityScore: 85,
    publicTransitQuality: 75,
    trafficSeverity: 35,
    cyclingInfrastructure: 55,
    specialNotes: [
      "Old Town and New Town are very walkable",
      "Lothian Buses cover the city comprehensively",
      "Edinburgh Trams connect airport to city centre",
      "Taxis (black cabs) are reliable and metered",
    ],
    availableModes: [
      { mode: "walk", available: true, baseCostPerKm: 0, flagFall: 0, averageSpeedKmh: 4.5, waitTimeMinutes: 0, energyCostPerKm: 2, comfortScore: 70, scenicScore: 95, accessibilityScore: 55, availableHours: { start: 0, end: 24 } },
      { mode: "transit", available: true, baseCostPerKm: 0, flagFall: 1.8, averageSpeedKmh: 18, waitTimeMinutes: 8, energyCostPerKm: 0.5, comfortScore: 70, scenicScore: 55, accessibilityScore: 75, availableHours: { start: 5, end: 24 }, localName: "Lothian Bus / Tram" },
      { mode: "taxi", available: true, baseCostPerKm: 2.5, flagFall: 4.0, averageSpeedKmh: 25, waitTimeMinutes: 5, energyCostPerKm: 0.2, comfortScore: 90, scenicScore: 45, accessibilityScore: 75, availableHours: { start: 0, end: 24 }, localName: "Black Cab" },
      { mode: "rideshare", available: true, baseCostPerKm: 1.8, flagFall: 2.5, averageSpeedKmh: 25, waitTimeMinutes: 4, energyCostPerKm: 0.2, comfortScore: 80, scenicScore: 45, accessibilityScore: 60, availableHours: { start: 0, end: 24 }, localName: "Uber / Bolt" },
      { mode: "bike", available: true, baseCostPerKm: 0.15, flagFall: 1.0, averageSpeedKmh: 13, waitTimeMinutes: 3, energyCostPerKm: 2.5, comfortScore: 60, scenicScore: 88, accessibilityScore: 10, availableHours: { start: 6, end: 22 }, localName: "Just Eat Cycles" },
    ],
  },

  cartagena: {
    destinationSlug: "cartagena",
    defaultCurrency: "USD",
    walkabilityScore: 70,
    publicTransitQuality: 40,
    trafficSeverity: 55,
    cyclingInfrastructure: 30,
    specialNotes: [
      "Old Walled City is best explored on foot",
      "Tuk-tuks are popular for short city hops",
      "Boat taxis connect to Bocagrande and islands",
      "Heat can be intense — plan morning/evening walks",
    ],
    availableModes: [
      { mode: "walk", available: true, baseCostPerKm: 0, flagFall: 0, averageSpeedKmh: 3.8, waitTimeMinutes: 0, energyCostPerKm: 5, comfortScore: 55, scenicScore: 95, accessibilityScore: 45, availableHours: { start: 6, end: 22 } },
      { mode: "tuk_tuk", available: true, baseCostPerKm: 0.3, flagFall: 1.0, averageSpeedKmh: 15, waitTimeMinutes: 3, energyCostPerKm: 1, comfortScore: 65, scenicScore: 85, accessibilityScore: 20, availableHours: { start: 7, end: 23 }, localName: "Tuk-tuk / Mototaxi" },
      { mode: "taxi", available: true, baseCostPerKm: 0.6, flagFall: 2.0, averageSpeedKmh: 20, waitTimeMinutes: 5, energyCostPerKm: 0.2, comfortScore: 75, scenicScore: 50, accessibilityScore: 50, availableHours: { start: 0, end: 24 } },
      { mode: "rideshare", available: true, baseCostPerKm: 0.5, flagFall: 1.5, averageSpeedKmh: 20, waitTimeMinutes: 6, energyCostPerKm: 0.2, comfortScore: 78, scenicScore: 50, accessibilityScore: 50, availableHours: { start: 6, end: 23 }, localName: "InDriver / Uber" },
      { mode: "ferry", available: true, baseCostPerKm: 0.2, flagFall: 2.0, averageSpeedKmh: 25, waitTimeMinutes: 20, energyCostPerKm: 0.5, comfortScore: 75, scenicScore: 98, accessibilityScore: 25, availableHours: { start: 7, end: 18 }, localName: "Lancha / Water taxi" },
    ],
  },

  jaipur: {
    destinationSlug: "jaipur",
    defaultCurrency: "USD",
    walkabilityScore: 45,
    publicTransitQuality: 45,
    trafficSeverity: 70,
    cyclingInfrastructure: 15,
    specialNotes: [
      "Auto-rickshaws are the backbone of local transport",
      "Cycle rickshaws are available in the old city",
      "Tuk-tuks are prevalent and cheap for short distances",
      "Heat in summer (Apr-Jun) makes walking challenging",
    ],
    availableModes: [
      { mode: "walk", available: true, baseCostPerKm: 0, flagFall: 0, averageSpeedKmh: 3.5, waitTimeMinutes: 0, energyCostPerKm: 5, comfortScore: 35, scenicScore: 70, accessibilityScore: 25, availableHours: { start: 6, end: 21 } },
      { mode: "auto_rickshaw", available: true, baseCostPerKm: 0.15, flagFall: 0.25, averageSpeedKmh: 20, waitTimeMinutes: 3, energyCostPerKm: 1, comfortScore: 50, scenicScore: 80, accessibilityScore: 15, availableHours: { start: 6, end: 24 }, localName: "Auto-rickshaw" },
      { mode: "tuk_tuk", available: true, baseCostPerKm: 0.12, flagFall: 0.2, averageSpeedKmh: 15, waitTimeMinutes: 2, energyCostPerKm: 1, comfortScore: 55, scenicScore: 85, accessibilityScore: 20, availableHours: { start: 6, end: 22 }, localName: "Cycle rickshaw" },
      { mode: "taxi", available: true, baseCostPerKm: 0.35, flagFall: 1.0, averageSpeedKmh: 22, waitTimeMinutes: 8, energyCostPerKm: 0.2, comfortScore: 80, scenicScore: 50, accessibilityScore: 55, availableHours: { start: 0, end: 24 } },
      { mode: "rideshare", available: true, baseCostPerKm: 0.28, flagFall: 0.8, averageSpeedKmh: 22, waitTimeMinutes: 6, energyCostPerKm: 0.2, comfortScore: 82, scenicScore: 50, accessibilityScore: 55, availableHours: { start: 0, end: 24 }, localName: "Uber / Ola" },
    ],
  },

  porto: {
    destinationSlug: "porto",
    defaultCurrency: "USD",
    walkabilityScore: 80,
    publicTransitQuality: 70,
    trafficSeverity: 30,
    cyclingInfrastructure: 50,
    specialNotes: [
      "Historic centre is very walkable but hilly",
      "Trams are iconic and scenic (especially Tram 22E)",
      "Metro connects airport and main districts",
      "Cable car (Funicular) connects riverside to upper city",
    ],
    availableModes: [
      { mode: "walk", available: true, baseCostPerKm: 0, flagFall: 0, averageSpeedKmh: 4, waitTimeMinutes: 0, energyCostPerKm: 3, comfortScore: 65, scenicScore: 95, accessibilityScore: 40, availableHours: { start: 0, end: 24 } },
      { mode: "transit", available: true, baseCostPerKm: 0, flagFall: 1.5, averageSpeedKmh: 22, waitTimeMinutes: 8, energyCostPerKm: 0.5, comfortScore: 70, scenicScore: 65, accessibilityScore: 70, availableHours: { start: 6, end: 24 }, localName: "Metro / Bus / Tram" },
      { mode: "tram", available: true, baseCostPerKm: 0, flagFall: 4.0, averageSpeedKmh: 10, waitTimeMinutes: 15, energyCostPerKm: 0.5, comfortScore: 75, scenicScore: 98, accessibilityScore: 45, availableHours: { start: 8, end: 22 }, localName: "Tram 22E (historic)" },
      { mode: "taxi", available: true, baseCostPerKm: 1.8, flagFall: 3.5, averageSpeedKmh: 28, waitTimeMinutes: 4, energyCostPerKm: 0.2, comfortScore: 88, scenicScore: 45, accessibilityScore: 65, availableHours: { start: 0, end: 24 } },
      { mode: "rideshare", available: true, baseCostPerKm: 1.4, flagFall: 2.5, averageSpeedKmh: 28, waitTimeMinutes: 4, energyCostPerKm: 0.2, comfortScore: 82, scenicScore: 45, accessibilityScore: 60, availableHours: { start: 0, end: 24 }, localName: "Uber / Bolt" },
      { mode: "bike", available: true, baseCostPerKm: 0.2, flagFall: 1.0, averageSpeedKmh: 11, waitTimeMinutes: 3, energyCostPerKm: 3, comfortScore: 60, scenicScore: 90, accessibilityScore: 10, availableHours: { start: 7, end: 21 }, localName: "Gira (city bikes)" },
      { mode: "cable_car", available: true, baseCostPerKm: 0, flagFall: 6.0, averageSpeedKmh: 5, waitTimeMinutes: 10, energyCostPerKm: 0.1, comfortScore: 85, scenicScore: 99, accessibilityScore: 50, availableHours: { start: 8, end: 20 }, localName: "Funicular dos Guindais" },
    ],
  },
};

export function getDestinationProfile(destination: string): DestinationTransportProfile {
  const normalized = destination.toLowerCase().trim();

  for (const [key, profile] of Object.entries(TRANSPORT_PROFILES)) {
    if (normalized.includes(key)) {
      return profile;
    }
  }

  return getDefaultProfile(destination);
}

function getDefaultProfile(destination: string): DestinationTransportProfile {
  return {
    destinationSlug: "default",
    defaultCurrency: "USD",
    walkabilityScore: 60,
    publicTransitQuality: 60,
    trafficSeverity: 50,
    cyclingInfrastructure: 40,
    specialNotes: [],
    availableModes: [
      { mode: "walk", available: true, baseCostPerKm: 0, flagFall: 0, averageSpeedKmh: 4.5, waitTimeMinutes: 0, energyCostPerKm: 3, comfortScore: 60, scenicScore: 75, accessibilityScore: 50, availableHours: { start: 0, end: 24 } },
      { mode: "transit", available: true, baseCostPerKm: 0, flagFall: 2.0, averageSpeedKmh: 20, waitTimeMinutes: 8, energyCostPerKm: 0.5, comfortScore: 65, scenicScore: 50, accessibilityScore: 65, availableHours: { start: 5, end: 24 } },
      { mode: "taxi", available: true, baseCostPerKm: 1.5, flagFall: 3.0, averageSpeedKmh: 25, waitTimeMinutes: 5, energyCostPerKm: 0.2, comfortScore: 85, scenicScore: 40, accessibilityScore: 60, availableHours: { start: 0, end: 24 } },
      { mode: "rideshare", available: true, baseCostPerKm: 1.2, flagFall: 2.0, averageSpeedKmh: 25, waitTimeMinutes: 6, energyCostPerKm: 0.2, comfortScore: 80, scenicScore: 40, accessibilityScore: 55, availableHours: { start: 0, end: 24 } },
    ],
  };
}
