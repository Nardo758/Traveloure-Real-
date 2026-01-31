/**
 * Traveloure Smart Sequencing Service
 * 
 * Intelligent activity sequencing based on wellness methodology,
 * physical intensity, timing optimization, and user preferences.
 */

// Activity categories for sequencing logic
export type ActivityCategory = 
  | 'adventure' | 'hiking' | 'water_sports' | 'skiing' | 'climbing'
  | 'spa' | 'wellness' | 'massage' | 'yoga' | 'meditation'
  | 'dining_light' | 'dining_heavy' | 'breakfast' | 'lunch' | 'dinner' | 'snack'
  | 'walking' | 'strolling' | 'sightseeing' | 'museum' | 'cultural'
  | 'nightlife' | 'entertainment' | 'show' | 'concert'
  | 'beach' | 'relaxation' | 'pool'
  | 'shopping' | 'market'
  | 'transport' | 'flight' | 'train' | 'transfer';

// Physical intensity levels (1-10)
export type IntensityLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

// Sequencing rule definition
interface SequencingRule {
  id: string;
  name: string;
  description: string;
  methodology: string;
  triggerActivity: ActivityCategory[];
  suggestedFollowUp: ActivityCategory[];
  avoidFollowUp: ActivityCategory[];
  timeGapMinutes?: { min: number; max: number };
  priority: number; // Higher = more important
  category: 'wellness' | 'energy' | 'timing' | 'logistics' | 'experience';
}

// The 10+ intelligent sequencing rules
export const SEQUENCING_RULES: SequencingRule[] = [
  // Wellness Rules
  {
    id: 'spa-after-adventure',
    name: 'Recovery Spa',
    description: 'Schedule spa or massage after high-intensity adventure activities',
    methodology: 'Muscle recovery is optimal 2-4 hours after physical exertion. Spa treatments help reduce lactic acid buildup and prevent next-day soreness.',
    triggerActivity: ['adventure', 'hiking', 'water_sports', 'skiing', 'climbing'],
    suggestedFollowUp: ['spa', 'wellness', 'massage'],
    avoidFollowUp: ['adventure', 'hiking'],
    timeGapMinutes: { min: 60, max: 240 },
    priority: 9,
    category: 'wellness'
  },
  {
    id: 'walk-after-heavy-meal',
    name: 'Digestive Stroll',
    description: 'Light walk after heavy dining improves digestion',
    methodology: 'A 15-30 minute gentle walk after meals aids digestion, regulates blood sugar, and prevents post-meal fatigue. Traditional practice in many cultures.',
    triggerActivity: ['dining_heavy', 'dinner', 'lunch'],
    suggestedFollowUp: ['walking', 'strolling', 'sightseeing'],
    avoidFollowUp: ['spa', 'pool', 'beach', 'relaxation'],
    timeGapMinutes: { min: 15, max: 45 },
    priority: 8,
    category: 'wellness'
  },
  {
    id: 'light-breakfast-after-late-dinner',
    name: 'Balanced Morning',
    description: 'Light breakfast recommended after late evening dining',
    methodology: 'When dinner ends after 9 PM, the digestive system benefits from a lighter morning meal. Allows proper rest and reset of metabolic processes.',
    triggerActivity: ['dinner', 'nightlife'],
    suggestedFollowUp: ['breakfast'],
    avoidFollowUp: ['dining_heavy'],
    timeGapMinutes: { min: 480, max: 720 }, // Next morning
    priority: 7,
    category: 'wellness'
  },
  {
    id: 'rest-before-adventure',
    name: 'Pre-Adventure Rest',
    description: 'Ensure adequate rest period before high-intensity activities',
    methodology: 'Physical activities are safer and more enjoyable when well-rested. Schedule adventure activities in the morning or after relaxation periods.',
    triggerActivity: ['relaxation', 'beach', 'pool', 'meditation'],
    suggestedFollowUp: ['adventure', 'hiking', 'water_sports'],
    avoidFollowUp: [],
    timeGapMinutes: { min: 60, max: 180 },
    priority: 7,
    category: 'energy'
  },
  {
    id: 'no-swimming-after-meal',
    name: 'Meal Digestion Buffer',
    description: 'Wait before water activities after eating',
    methodology: 'Allow 60-90 minutes after meals before swimming or water sports. Blood flow prioritizes digestion; physical activity can cause discomfort.',
    triggerActivity: ['breakfast', 'lunch', 'dinner', 'dining_heavy', 'dining_light'],
    suggestedFollowUp: ['walking', 'sightseeing', 'shopping'],
    avoidFollowUp: ['water_sports', 'pool', 'beach'],
    timeGapMinutes: { min: 60, max: 90 },
    priority: 8,
    category: 'wellness'
  },
  {
    id: 'cultural-morning',
    name: 'Morning Culture',
    description: 'Schedule museums and cultural sites in cooler morning hours',
    methodology: 'Cultural venues are less crowded in mornings. Mental focus is higher, and you avoid afternoon heat for outdoor portions.',
    triggerActivity: ['breakfast'],
    suggestedFollowUp: ['museum', 'cultural', 'sightseeing'],
    avoidFollowUp: ['beach', 'pool', 'relaxation'],
    timeGapMinutes: { min: 30, max: 90 },
    priority: 6,
    category: 'timing'
  },
  {
    id: 'sunset-activities',
    name: 'Golden Hour Experience',
    description: 'Schedule scenic activities during golden hour',
    methodology: 'Late afternoon light (4-7 PM) offers the best photography and most pleasant outdoor temperatures. Plan scenic viewpoints accordingly.',
    triggerActivity: ['museum', 'shopping', 'cultural'],
    suggestedFollowUp: ['sightseeing', 'strolling', 'beach'],
    avoidFollowUp: ['museum', 'shopping'],
    timeGapMinutes: { min: 120, max: 240 },
    priority: 5,
    category: 'experience'
  },
  {
    id: 'nightlife-sequence',
    name: 'Evening Progression',
    description: 'Build evening from dinner to entertainment to nightlife',
    methodology: 'The natural evening flow: dinner around 7-8 PM, show/entertainment 9-10 PM, nightlife 10 PM+. Allows proper pacing without rushed transitions.',
    triggerActivity: ['dinner'],
    suggestedFollowUp: ['show', 'concert', 'entertainment'],
    avoidFollowUp: ['museum', 'cultural', 'hiking'],
    timeGapMinutes: { min: 60, max: 120 },
    priority: 6,
    category: 'timing'
  },
  {
    id: 'transport-buffer',
    name: 'Transit Buffer',
    description: 'Add buffer time around transport for stress-free travel',
    methodology: 'Allow 30-60 minutes buffer before flights/trains. Post-transport, schedule light activities to acclimate, especially after long journeys.',
    triggerActivity: ['flight', 'train', 'transport'],
    suggestedFollowUp: ['strolling', 'relaxation', 'dining_light'],
    avoidFollowUp: ['adventure', 'hiking', 'water_sports'],
    timeGapMinutes: { min: 30, max: 90 },
    priority: 9,
    category: 'logistics'
  },
  {
    id: 'intensity-balance',
    name: 'Energy Wave',
    description: 'Alternate high and low intensity activities',
    methodology: 'Prevents burnout by alternating intensity levels. After 2+ high-intensity activities, schedule restorative time before the next adventure.',
    triggerActivity: ['adventure', 'hiking', 'water_sports', 'skiing'],
    suggestedFollowUp: ['relaxation', 'spa', 'beach', 'strolling'],
    avoidFollowUp: ['adventure', 'hiking', 'water_sports'],
    timeGapMinutes: { min: 120, max: 300 },
    priority: 8,
    category: 'energy'
  },
  {
    id: 'hydration-reminder',
    name: 'Hydration Break',
    description: 'Schedule cafe/hydration stops after outdoor activities',
    methodology: 'Outdoor activities in warm climates require hydration. Plan cafe stops or snack breaks every 2-3 hours during active days.',
    triggerActivity: ['sightseeing', 'walking', 'strolling', 'market'],
    suggestedFollowUp: ['snack', 'dining_light'],
    avoidFollowUp: [],
    timeGapMinutes: { min: 90, max: 180 },
    priority: 5,
    category: 'wellness'
  },
  {
    id: 'yoga-morning',
    name: 'Sunrise Wellness',
    description: 'Yoga and meditation optimal in early morning',
    methodology: 'Traditional practice timing. Morning yoga aligns with circadian rhythms, improves focus for the day, and prepares the body for activities.',
    triggerActivity: [],
    suggestedFollowUp: ['yoga', 'meditation'],
    avoidFollowUp: ['nightlife', 'entertainment'],
    priority: 4,
    category: 'wellness'
  }
];

// Intensity mapping for common activity types
export const ACTIVITY_INTENSITY: Record<string, IntensityLevel> = {
  // High Intensity (7-10)
  'hiking': 8,
  'trekking': 9,
  'climbing': 9,
  'water_sports': 7,
  'skiing': 8,
  'adventure': 8,
  'cycling': 7,
  'diving': 7,
  
  // Medium Intensity (4-6)
  'walking': 4,
  'sightseeing': 4,
  'strolling': 3,
  'museum': 3,
  'cultural': 3,
  'shopping': 4,
  'market': 4,
  'beach': 3,
  'pool': 3,
  
  // Low Intensity (1-3)
  'spa': 1,
  'massage': 1,
  'wellness': 2,
  'yoga': 3,
  'meditation': 1,
  'relaxation': 1,
  'dining_light': 1,
  'dining_heavy': 1,
  'breakfast': 1,
  'lunch': 1,
  'dinner': 1,
  'show': 2,
  'concert': 2,
  'entertainment': 2,
  'nightlife': 3,
  
  // Transport (varies)
  'transport': 2,
  'flight': 2,
  'train': 2,
  'transfer': 2
};

// Service type to category mapping
export function mapServiceTypeToCategory(serviceType: string): ActivityCategory {
  const type = serviceType.toLowerCase();
  
  if (type.includes('hik') || type.includes('trek')) return 'hiking';
  if (type.includes('spa') || type.includes('wellness')) return 'spa';
  if (type.includes('massage')) return 'massage';
  if (type.includes('yoga')) return 'yoga';
  if (type.includes('meditation')) return 'meditation';
  if (type.includes('adventure') || type.includes('zip') || type.includes('raft')) return 'adventure';
  if (type.includes('water') || type.includes('surf') || type.includes('kayak') || type.includes('snorkel') || type.includes('dive')) return 'water_sports';
  if (type.includes('ski') || type.includes('snow')) return 'skiing';
  if (type.includes('climb') || type.includes('boulder')) return 'climbing';
  if (type.includes('museum') || type.includes('gallery')) return 'museum';
  if (type.includes('tour') || type.includes('walk') || type.includes('stroll')) return 'walking';
  if (type.includes('sightse') || type.includes('view')) return 'sightseeing';
  if (type.includes('cultural') || type.includes('temple') || type.includes('church') || type.includes('monument')) return 'cultural';
  if (type.includes('beach')) return 'beach';
  if (type.includes('pool') || type.includes('swim')) return 'pool';
  if (type.includes('shop') || type.includes('market')) return 'shopping';
  if (type.includes('breakfast')) return 'breakfast';
  if (type.includes('lunch')) return 'lunch';
  if (type.includes('dinner') || type.includes('fine dining')) return 'dinner';
  if (type.includes('restaurant') || type.includes('cafe') || type.includes('meal')) return 'dining_light';
  if (type.includes('bar') || type.includes('club') || type.includes('night')) return 'nightlife';
  if (type.includes('show') || type.includes('theater') || type.includes('theatre') || type.includes('performance')) return 'show';
  if (type.includes('concert') || type.includes('music')) return 'concert';
  if (type.includes('flight') || type.includes('air')) return 'flight';
  if (type.includes('train') || type.includes('rail')) return 'train';
  if (type.includes('transport') || type.includes('transfer') || type.includes('taxi') || type.includes('bus')) return 'transport';
  
  return 'sightseeing'; // Default
}

// Get intensity level for an activity
export function getActivityIntensity(serviceType: string): IntensityLevel {
  const category = mapServiceTypeToCategory(serviceType);
  return ACTIVITY_INTENSITY[category] || 4;
}

// Methodology note for an activity based on context
export interface MethodologyNote {
  type: 'activity' | 'day' | 'itinerary';
  ruleId: string;
  ruleName: string;
  note: string;
  methodology: string;
  category: string;
  priority: number;
}

export function generateActivityNote(
  currentActivity: { name: string; serviceType: string; startTime?: string },
  previousActivity?: { name: string; serviceType: string; endTime?: string },
  nextActivity?: { name: string; serviceType: string; startTime?: string }
): MethodologyNote | null {
  const currentCategory = mapServiceTypeToCategory(currentActivity.serviceType);
  
  // Check if this activity follows a rule
  for (const rule of SEQUENCING_RULES) {
    // Check if previous activity triggers this rule and current is the suggested follow-up
    if (previousActivity) {
      const prevCategory = mapServiceTypeToCategory(previousActivity.serviceType);
      if (rule.triggerActivity.includes(prevCategory) && rule.suggestedFollowUp.includes(currentCategory)) {
        return {
          type: 'activity',
          ruleId: rule.id,
          ruleName: rule.name,
          note: generateNoteText(rule, previousActivity, currentActivity),
          methodology: rule.methodology,
          category: rule.category,
          priority: rule.priority
        };
      }
    }
  }
  
  return null;
}

function generateNoteText(
  rule: SequencingRule, 
  trigger: { name: string; serviceType: string },
  followUp: { name: string; serviceType: string }
): string {
  switch (rule.id) {
    case 'spa-after-adventure':
      return `Recommended after ${trigger.name} - helps with muscle recovery and relaxation`;
    case 'walk-after-heavy-meal':
      return `Light stroll after ${trigger.name} aids digestion and prevents fatigue`;
    case 'light-breakfast-after-late-dinner':
      return `Light option recommended after yesterday's late dining`;
    case 'rest-before-adventure':
      return `Well-rested start ensures better enjoyment and safety`;
    case 'no-swimming-after-meal':
      return `Properly timed after your meal for comfortable activity`;
    case 'cultural-morning':
      return `Morning timing for fewer crowds and better focus`;
    case 'sunset-activities':
      return `Timed for golden hour - optimal lighting and temperature`;
    case 'nightlife-sequence':
      return `Natural evening progression from dinner to entertainment`;
    case 'transport-buffer':
      return `Allows comfortable transition after travel`;
    case 'intensity-balance':
      return `Balanced with lighter activity after earlier exertion`;
    case 'hydration-reminder':
      return `Perfect timing for refreshment break`;
    default:
      return rule.description;
  }
}

// Generate day-level methodology notes
export function generateDayNotes(
  activities: Array<{ name: string; serviceType: string; startTime?: string; endTime?: string }>
): MethodologyNote[] {
  const notes: MethodologyNote[] = [];
  
  // Calculate day intensity
  let totalIntensity = 0;
  let highIntensityCount = 0;
  let relaxationCount = 0;
  
  for (const activity of activities) {
    const intensity = getActivityIntensity(activity.serviceType);
    totalIntensity += intensity;
    if (intensity >= 7) highIntensityCount++;
    if (intensity <= 2) relaxationCount++;
  }
  
  const avgIntensity = activities.length > 0 ? totalIntensity / activities.length : 0;
  
  // High intensity day note
  if (avgIntensity > 6) {
    notes.push({
      type: 'day',
      ruleId: 'high-intensity-day',
      ruleName: 'Active Day',
      note: 'High-energy day with significant physical activities. Stay hydrated and pace yourself.',
      methodology: 'Days with average intensity above 6 require extra attention to hydration, rest breaks, and recovery time.',
      category: 'energy',
      priority: 7
    });
  }
  
  // Good balance note
  if (highIntensityCount > 0 && relaxationCount > 0) {
    notes.push({
      type: 'day',
      ruleId: 'balanced-day',
      ruleName: 'Well-Balanced Day',
      note: 'Great mix of active adventures and restorative experiences.',
      methodology: 'Optimal days include both stimulating activities and recovery time. This balance prevents burnout and maximizes enjoyment.',
      category: 'wellness',
      priority: 5
    });
  }
  
  // All relaxation note
  if (avgIntensity < 3 && activities.length >= 3) {
    notes.push({
      type: 'day',
      ruleId: 'recovery-day',
      ruleName: 'Recovery Day',
      note: 'Restorative day focused on relaxation and gentle experiences.',
      methodology: 'Rest days are essential during multi-day trips. They prevent fatigue accumulation and enhance overall trip enjoyment.',
      category: 'wellness',
      priority: 5
    });
  }
  
  return notes;
}

// Generate itinerary-level strategy notes
export function generateItineraryNotes(
  days: Array<{
    dayNumber: number;
    activities: Array<{ name: string; serviceType: string; startTime?: string; endTime?: string }>
  }>
): MethodologyNote[] {
  const notes: MethodologyNote[] = [];
  
  // Calculate overall trip stats
  let totalActivities = 0;
  let totalIntensity = 0;
  let adventureDays = 0;
  let relaxDays = 0;
  
  for (const day of days) {
    totalActivities += day.activities.length;
    let dayIntensity = 0;
    for (const activity of day.activities) {
      const intensity = getActivityIntensity(activity.serviceType);
      totalIntensity += intensity;
      dayIntensity += intensity;
    }
    const avgDayIntensity = day.activities.length > 0 ? dayIntensity / day.activities.length : 0;
    if (avgDayIntensity >= 6) adventureDays++;
    if (avgDayIntensity <= 3) relaxDays++;
  }
  
  const avgIntensity = totalActivities > 0 ? totalIntensity / totalActivities : 0;
  
  // Overall trip strategy
  if (days.length >= 5) {
    if (adventureDays >= days.length * 0.6) {
      notes.push({
        type: 'itinerary',
        ruleId: 'adventure-trip',
        ruleName: 'Adventure-Focused Trip',
        note: 'This itinerary is designed for active travelers who thrive on physical experiences.',
        methodology: 'Adventure-heavy trips work best with built-in recovery days. We\'ve optimized activity placement for sustainable energy throughout your journey.',
        category: 'experience',
        priority: 6
      });
    } else if (relaxDays >= days.length * 0.5) {
      notes.push({
        type: 'itinerary',
        ruleId: 'relaxation-trip',
        ruleName: 'Relaxation-Focused Trip',
        note: 'A restorative journey designed to recharge and rejuvenate.',
        methodology: 'Wellness-focused itineraries prioritize quality over quantity. Strategic pacing allows for deep relaxation and meaningful experiences.',
        category: 'wellness',
        priority: 6
      });
    } else {
      notes.push({
        type: 'itinerary',
        ruleId: 'balanced-trip',
        ruleName: 'Balanced Experience',
        note: 'A well-rounded itinerary mixing adventure, culture, and relaxation.',
        methodology: 'Balanced trips offer the best of all worlds. We\'ve sequenced activities to maintain energy while maximizing diverse experiences.',
        category: 'experience',
        priority: 6
      });
    }
  }
  
  // Intensity wave pattern
  notes.push({
    type: 'itinerary',
    ruleId: 'intensity-wave',
    ruleName: 'Energy Wave Design',
    note: 'Activities follow an intensity wave pattern - building up and cooling down throughout each day.',
    methodology: 'The intensity wave principle prevents exhaustion by alternating high and low energy activities, creating natural rest points.',
    category: 'energy',
    priority: 5
  });
  
  return notes;
}

// Calculate rich metrics for a variant/itinerary
export interface ItineraryMetrics {
  // Cost Breakdown
  costByCategory: Record<string, number>;
  totalCost: number;
  avgCostPerDay: number;
  avgCostPerPerson: number;
  
  // Time Allocation
  activeMinutes: number;
  relaxationMinutes: number;
  travelMinutes: number;
  diningMinutes: number;
  freeMinutes: number;
  timeAllocationPercent: Record<string, number>;
  
  // Intensity Tracking
  avgIntensity: number;
  peakIntensity: number;
  intensityVariance: number;
  intensityByDay: number[];
  
  // Activity Balance
  adventureCount: number;
  culturalCount: number;
  diningCount: number;
  relaxationCount: number;
  balanceScore: number; // 0-100, how well-balanced the activities are
  
  // Experience Score
  diversityScore: number; // Variety of activity types
  paceScore: number; // How well-paced (not too rushed, not too slow)
  wellnessScore: number; // Adherence to wellness principles
  overallScore: number; // Weighted combination
}

export function calculateItineraryMetrics(
  items: Array<{
    serviceType: string;
    price?: string | number;
    duration?: number;
    dayNumber: number;
  }>,
  travelers: number = 1
): ItineraryMetrics {
  const costByCategory: Record<string, number> = {};
  let totalCost = 0;
  let activeMinutes = 0;
  let relaxationMinutes = 0;
  let travelMinutes = 0;
  let diningMinutes = 0;
  let totalIntensity = 0;
  let peakIntensity = 0;
  const intensityByDay: Record<number, number[]> = {};
  let adventureCount = 0;
  let culturalCount = 0;
  let diningCount = 0;
  let relaxationCountNum = 0;
  const categorySet = new Set<string>();
  
  for (const item of items) {
    const category = mapServiceTypeToCategory(item.serviceType);
    const intensity = getActivityIntensity(item.serviceType);
    const price = typeof item.price === 'string' ? parseFloat(item.price) || 0 : (item.price || 0);
    const duration = item.duration || 60;
    
    // Cost tracking
    const categoryKey = getCostCategory(category);
    costByCategory[categoryKey] = (costByCategory[categoryKey] || 0) + price;
    totalCost += price;
    
    // Time allocation
    if (['adventure', 'hiking', 'water_sports', 'skiing', 'climbing', 'walking', 'sightseeing'].includes(category)) {
      activeMinutes += duration;
    } else if (['spa', 'wellness', 'massage', 'yoga', 'meditation', 'relaxation', 'beach', 'pool'].includes(category)) {
      relaxationMinutes += duration;
    } else if (['transport', 'flight', 'train', 'transfer'].includes(category)) {
      travelMinutes += duration;
    } else if (['breakfast', 'lunch', 'dinner', 'dining_light', 'dining_heavy', 'snack'].includes(category)) {
      diningMinutes += duration;
    }
    
    // Intensity tracking
    totalIntensity += intensity;
    if (intensity > peakIntensity) peakIntensity = intensity;
    if (!intensityByDay[item.dayNumber]) intensityByDay[item.dayNumber] = [];
    intensityByDay[item.dayNumber].push(intensity);
    
    // Activity counts
    if (['adventure', 'hiking', 'water_sports', 'skiing', 'climbing'].includes(category)) adventureCount++;
    if (['museum', 'cultural', 'sightseeing'].includes(category)) culturalCount++;
    if (['breakfast', 'lunch', 'dinner', 'dining_light', 'dining_heavy'].includes(category)) diningCount++;
    if (['spa', 'wellness', 'relaxation', 'beach', 'pool'].includes(category)) relaxationCountNum++;
    
    categorySet.add(category);
  }
  
  const numDays = Object.keys(intensityByDay).length || 1;
  const avgIntensity = items.length > 0 ? totalIntensity / items.length : 0;
  const dailyIntensities = Object.values(intensityByDay).map(
    dayIntensities => dayIntensities.reduce((a, b) => a + b, 0) / dayIntensities.length
  );
  
  // Calculate variance
  const mean = dailyIntensities.length > 0 ? dailyIntensities.reduce((a, b) => a + b, 0) / dailyIntensities.length : 0;
  const variance = dailyIntensities.length > 0 
    ? dailyIntensities.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / dailyIntensities.length 
    : 0;
  
  // Time allocation percentages
  const totalMinutes = activeMinutes + relaxationMinutes + travelMinutes + diningMinutes;
  const freeMinutes = Math.max(0, (numDays * 14 * 60) - totalMinutes); // Assuming 14 hours awake per day
  
  // Balance score (0-100)
  const totalActivities = adventureCount + culturalCount + diningCount + relaxationCountNum;
  const idealBalance = totalActivities / 4;
  const balanceDeviation = totalActivities > 0 ? 
    (Math.abs(adventureCount - idealBalance) + Math.abs(culturalCount - idealBalance) + 
     Math.abs(diningCount - idealBalance) + Math.abs(relaxationCountNum - idealBalance)) / totalActivities : 0;
  const balanceScore = Math.max(0, 100 - (balanceDeviation * 50));
  
  // Diversity score (variety of activity types)
  const diversityScore = Math.min(100, (categorySet.size / 8) * 100); // Max 8 different categories = 100%
  
  // Pace score (activities per day, optimal is 4-6)
  const activitiesPerDay = items.length / numDays;
  const paceScore = activitiesPerDay >= 4 && activitiesPerDay <= 6 ? 100 :
    activitiesPerDay < 4 ? Math.max(0, activitiesPerDay * 25) :
    Math.max(0, 100 - ((activitiesPerDay - 6) * 15));
  
  // Wellness score (relaxation ratio)
  const wellnessRatio = totalActivities > 0 ? relaxationCountNum / totalActivities : 0;
  const wellnessScore = wellnessRatio >= 0.2 && wellnessRatio <= 0.4 ? 100 :
    wellnessRatio < 0.2 ? wellnessRatio * 500 :
    Math.max(0, 100 - ((wellnessRatio - 0.4) * 150));
  
  // Overall score
  const overallScore = (balanceScore * 0.25 + diversityScore * 0.2 + paceScore * 0.25 + wellnessScore * 0.3);
  
  return {
    costByCategory,
    totalCost,
    avgCostPerDay: totalCost / numDays,
    avgCostPerPerson: totalCost / travelers,
    
    activeMinutes,
    relaxationMinutes,
    travelMinutes,
    diningMinutes,
    freeMinutes,
    timeAllocationPercent: {
      active: totalMinutes > 0 ? (activeMinutes / totalMinutes) * 100 : 0,
      relaxation: totalMinutes > 0 ? (relaxationMinutes / totalMinutes) * 100 : 0,
      travel: totalMinutes > 0 ? (travelMinutes / totalMinutes) * 100 : 0,
      dining: totalMinutes > 0 ? (diningMinutes / totalMinutes) * 100 : 0
    },
    
    avgIntensity,
    peakIntensity,
    intensityVariance: variance,
    intensityByDay: dailyIntensities,
    
    adventureCount,
    culturalCount,
    diningCount,
    relaxationCount: relaxationCountNum,
    balanceScore,
    
    diversityScore,
    paceScore,
    wellnessScore,
    overallScore
  };
}

function getCostCategory(activityCategory: ActivityCategory): string {
  if (['breakfast', 'lunch', 'dinner', 'dining_light', 'dining_heavy', 'snack'].includes(activityCategory)) {
    return 'Dining';
  }
  if (['transport', 'flight', 'train', 'transfer'].includes(activityCategory)) {
    return 'Transport';
  }
  if (['spa', 'wellness', 'massage', 'yoga', 'meditation', 'relaxation', 'beach', 'pool'].includes(activityCategory)) {
    return 'Wellness';
  }
  if (['museum', 'cultural', 'sightseeing', 'show', 'concert', 'entertainment'].includes(activityCategory)) {
    return 'Culture & Entertainment';
  }
  if (['adventure', 'hiking', 'water_sports', 'skiing', 'climbing'].includes(activityCategory)) {
    return 'Adventure';
  }
  if (['shopping', 'market'].includes(activityCategory)) {
    return 'Shopping';
  }
  return 'Activities';
}

// Export all rules for display
export function getSequencingRulesDisplay() {
  return SEQUENCING_RULES.map(rule => ({
    id: rule.id,
    name: rule.name,
    description: rule.description,
    methodology: rule.methodology,
    category: rule.category
  }));
}

// Activity with sequencing metadata
export interface SequencedActivity {
  id?: string;
  name: string;
  serviceType: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  price?: number | string;
  rating?: number | string;
  location?: string;
  dayNumber: number;
  timeSlot?: string;
  description?: string;
  travelTimeFromPrevious?: number;
  isReplacement?: boolean;
  replacementReason?: string;
}

// Result of sequencing with methodology notes
export interface SequencingResult {
  activities: SequencedActivity[];
  appliedRules: string[];
  methodologyNotes: MethodologyNote[];
  sequencingScore: number;
}

// Check if activity should come before another based on rules
function shouldComeBefore(
  activity1: SequencedActivity, 
  activity2: SequencedActivity
): { shouldSwap: boolean; ruleId?: string; reason?: string } {
  const cat1 = mapServiceTypeToCategory(activity1.serviceType);
  const cat2 = mapServiceTypeToCategory(activity2.serviceType);
  const intensity1 = getActivityIntensity(activity1.serviceType);
  const intensity2 = getActivityIntensity(activity2.serviceType);
  
  // Rule: Cultural activities in the morning (fresher mind, fewer crowds)
  const culturalRule = SEQUENCING_RULES.find(r => r.id === 'cultural-morning');
  if (culturalRule) {
    const isCultural1 = culturalRule.triggerActivity.includes(cat1);
    const isCultural2 = culturalRule.triggerActivity.includes(cat2);
    if (isCultural2 && !isCultural1) {
      return { shouldSwap: true, ruleId: 'cultural-morning', reason: 'Cultural activities perform better in morning hours' };
    }
  }
  
  // Rule: High intensity activities after rest/relaxation
  const restBeforeAdventure = SEQUENCING_RULES.find(r => r.id === 'rest-before-adventure');
  if (restBeforeAdventure) {
    const isRelax1 = restBeforeAdventure.triggerActivity.includes(cat1);
    const isAdventure2 = restBeforeAdventure.suggestedFollowUp.includes(cat2);
    if (isRelax1 && isAdventure2) {
      return { shouldSwap: false }; // Already in good order
    }
    const isRelax2 = restBeforeAdventure.triggerActivity.includes(cat1);
    const isAdventure1 = restBeforeAdventure.suggestedFollowUp.includes(cat1);
    if (isAdventure1 && isRelax2 && intensity1 >= 7) {
      return { shouldSwap: true, ruleId: 'rest-before-adventure', reason: 'Rest before high-intensity adventure improves safety and enjoyment' };
    }
  }
  
  // Rule: Breakfast first
  if (cat2 === 'breakfast' && cat1 !== 'breakfast') {
    return { shouldSwap: true, ruleId: 'breakfast-first', reason: 'Start the day with breakfast' };
  }
  
  // Rule: Dinner later, nightlife last
  if (cat1 === 'dinner' && !['nightlife', 'entertainment', 'show', 'concert'].includes(cat2)) {
    const time1 = activity1.startTime ? parseInt(activity1.startTime.split(':')[0]) : 12;
    if (time1 < 18) {
      return { shouldSwap: true, ruleId: 'dinner-timing', reason: 'Dinner scheduled for evening hours' };
    }
  }
  if (cat1 === 'nightlife' && cat2 !== 'nightlife') {
    return { shouldSwap: true, ruleId: 'nightlife-last', reason: 'Nightlife activities end the day' };
  }
  
  // Rule: Spa/massage after adventure (recovery)
  const spaRule = SEQUENCING_RULES.find(r => r.id === 'spa-after-adventure');
  if (spaRule) {
    const isAdventure1 = spaRule.triggerActivity.includes(cat1);
    const isSpa2 = spaRule.suggestedFollowUp.includes(cat2);
    if (isAdventure1 && isSpa2) {
      return { shouldSwap: false }; // Good order: adventure then spa
    }
    const isAdventure2 = spaRule.triggerActivity.includes(cat2);
    const isSpa1 = spaRule.suggestedFollowUp.includes(cat1);
    if (isSpa1 && isAdventure2) {
      return { shouldSwap: true, ruleId: 'spa-after-adventure', reason: 'Spa treatment more beneficial after physical exertion' };
    }
  }
  
  // Rule: Walking/sightseeing after meals
  const walkAfterMeal = SEQUENCING_RULES.find(r => r.id === 'walk-after-heavy-meal');
  if (walkAfterMeal) {
    const isMeal1 = walkAfterMeal.triggerActivity.includes(cat1);
    const isWalk2 = walkAfterMeal.suggestedFollowUp.includes(cat2);
    if (isMeal1 && isWalk2) {
      return { shouldSwap: false }; // Good order
    }
  }
  
  // Rule: Balance intensity throughout the day (alternate high/low)
  if (intensity1 >= 7 && intensity2 >= 7) {
    // Two high-intensity activities in a row - check if there's a pattern issue
    return { shouldSwap: false }; // Let intensity balancing handle this
  }
  
  return { shouldSwap: false };
}

// Calculate optimal time slots based on activity type
function getOptimalTimeSlot(activity: SequencedActivity): { slot: string; startHour: number } {
  const category = mapServiceTypeToCategory(activity.serviceType);
  
  // Breakfast: 7-9 AM
  if (category === 'breakfast') return { slot: 'morning', startHour: 8 };
  
  // Cultural/Museum: Morning (9-12)
  if (['museum', 'cultural', 'sightseeing'].includes(category)) return { slot: 'morning', startHour: 9 };
  
  // Lunch: 12-14
  if (category === 'lunch') return { slot: 'afternoon', startHour: 12 };
  
  // Adventure: Late morning or early afternoon
  if (['adventure', 'hiking', 'water_sports', 'climbing', 'skiing'].includes(category)) return { slot: 'morning', startHour: 10 };
  
  // Spa/Wellness: Afternoon
  if (['spa', 'wellness', 'massage', 'yoga', 'meditation'].includes(category)) return { slot: 'afternoon', startHour: 14 };
  
  // Beach/Pool: Afternoon (avoid midday sun)
  if (['beach', 'pool', 'relaxation'].includes(category)) return { slot: 'afternoon', startHour: 15 };
  
  // Shopping: Afternoon
  if (['shopping', 'market'].includes(category)) return { slot: 'afternoon', startHour: 16 };
  
  // Dinner: Evening
  if (['dinner', 'dining_heavy'].includes(category)) return { slot: 'evening', startHour: 19 };
  
  // Entertainment/Shows: Evening
  if (['show', 'concert', 'entertainment'].includes(category)) return { slot: 'evening', startHour: 20 };
  
  // Nightlife: Night
  if (category === 'nightlife') return { slot: 'evening', startHour: 22 };
  
  // Default: Use existing or midday
  return { slot: activity.timeSlot || 'afternoon', startHour: 14 };
}

// Reorder activities within a day using smart sequencing rules
export function reorderDayActivities(
  activities: SequencedActivity[]
): SequencingResult {
  if (activities.length <= 1) {
    return {
      activities,
      appliedRules: [],
      methodologyNotes: [],
      sequencingScore: 100
    };
  }
  
  const appliedRules: string[] = [];
  let sequencedActivities = [...activities];
  
  // Step 1: Assign optimal time slots first
  sequencedActivities = sequencedActivities.map(activity => {
    const { slot, startHour } = getOptimalTimeSlot(activity);
    const duration = activity.duration || 60;
    const endHour = startHour + Math.ceil(duration / 60);
    return {
      ...activity,
      timeSlot: slot,
      startTime: activity.startTime || `${startHour.toString().padStart(2, '0')}:00`,
      endTime: activity.endTime || `${endHour.toString().padStart(2, '0')}:00`
    };
  });
  
  // Step 2: Sort by optimal start time
  sequencedActivities.sort((a, b) => {
    const timeA = a.startTime ? parseInt(a.startTime.replace(':', '')) : 1200;
    const timeB = b.startTime ? parseInt(b.startTime.replace(':', '')) : 1200;
    return timeA - timeB;
  });
  
  // Step 3: Apply pairwise sequencing rules (bubble sort style with rules)
  let swapped = true;
  let passes = 0;
  const maxPasses = activities.length * 2; // Prevent infinite loops
  
  while (swapped && passes < maxPasses) {
    swapped = false;
    passes++;
    
    for (let i = 0; i < sequencedActivities.length - 1; i++) {
      const result = shouldComeBefore(sequencedActivities[i], sequencedActivities[i + 1]);
      if (result.shouldSwap && result.ruleId) {
        // Swap activities
        const temp = sequencedActivities[i];
        sequencedActivities[i] = sequencedActivities[i + 1];
        sequencedActivities[i + 1] = temp;
        swapped = true;
        
        if (!appliedRules.includes(result.ruleId)) {
          appliedRules.push(result.ruleId);
        }
      }
    }
  }
  
  // Step 4: Recalculate times with proper spacing
  let currentTime = 8 * 60; // Start at 8 AM in minutes
  sequencedActivities = sequencedActivities.map((activity, index) => {
    const duration = activity.duration || 60;
    const startHour = Math.floor(currentTime / 60);
    const startMin = currentTime % 60;
    const endMinutes = currentTime + duration;
    const endHour = Math.floor(endMinutes / 60);
    const endMin = endMinutes % 60;
    
    // Update current time with buffer
    const buffer = index < sequencedActivities.length - 1 ? 30 : 0; // 30 min buffer between activities
    currentTime = endMinutes + buffer;
    
    // Determine time slot based on start hour
    let timeSlot = 'morning';
    if (startHour >= 12 && startHour < 17) timeSlot = 'afternoon';
    else if (startHour >= 17) timeSlot = 'evening';
    
    return {
      ...activity,
      startTime: `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`,
      endTime: `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`,
      timeSlot
    };
  });
  
  // Step 5: Generate methodology notes
  const methodologyNotes: MethodologyNote[] = [];
  
  for (let i = 0; i < sequencedActivities.length; i++) {
    const prev = i > 0 ? sequencedActivities[i - 1] : undefined;
    const current = sequencedActivities[i];
    const next = i < sequencedActivities.length - 1 ? sequencedActivities[i + 1] : undefined;
    
    const note = generateActivityNote(
      { name: current.name, serviceType: current.serviceType, startTime: current.startTime },
      prev ? { name: prev.name, serviceType: prev.serviceType, endTime: prev.endTime } : undefined,
      next ? { name: next.name, serviceType: next.serviceType, startTime: next.startTime } : undefined
    );
    
    if (note) {
      methodologyNotes.push(note);
    }
  }
  
  // Add day-level notes
  const dayNotes = generateDayNotes(sequencedActivities.map(a => ({
    name: a.name,
    serviceType: a.serviceType,
    startTime: a.startTime,
    endTime: a.endTime
  })));
  methodologyNotes.push(...dayNotes);
  
  // Calculate sequencing score
  const rulesApplied = appliedRules.length;
  const totalPossibleRules = SEQUENCING_RULES.length;
  const intensityVariance = calculateIntensityVariance(sequencedActivities);
  const sequencingScore = Math.min(100, 70 + (rulesApplied * 5) - (intensityVariance * 2));
  
  return {
    activities: sequencedActivities,
    appliedRules,
    methodologyNotes,
    sequencingScore: Math.max(0, Math.round(sequencingScore))
  };
}

// Helper: Calculate variance in intensity (lower is better for pacing)
function calculateIntensityVariance(activities: SequencedActivity[]): number {
  if (activities.length < 2) return 0;
  
  const intensities = activities.map(a => getActivityIntensity(a.serviceType));
  const mean = intensities.reduce((a, b) => a + b, 0) / intensities.length;
  const variance = intensities.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intensities.length;
  
  return Math.sqrt(variance);
}

// Reorder entire itinerary (all days)
export function reorderItinerary(
  items: SequencedActivity[]
): { 
  reorderedItems: SequencedActivity[]; 
  allMethodologyNotes: MethodologyNote[]; 
  overallScore: number;
  appliedRulesCount: number;
} {
  // Group by day
  const dayGroups: Record<number, SequencedActivity[]> = {};
  for (const item of items) {
    const day = item.dayNumber || 1;
    if (!dayGroups[day]) dayGroups[day] = [];
    dayGroups[day].push(item);
  }
  
  // Reorder each day
  const reorderedItems: SequencedActivity[] = [];
  const allMethodologyNotes: MethodologyNote[] = [];
  let totalScore = 0;
  let totalAppliedRules = 0;
  
  const sortedDays = Object.keys(dayGroups).map(Number).sort((a, b) => a - b);
  
  for (const dayNum of sortedDays) {
    const result = reorderDayActivities(dayGroups[dayNum]);
    reorderedItems.push(...result.activities);
    allMethodologyNotes.push(...result.methodologyNotes);
    totalScore += result.sequencingScore;
    totalAppliedRules += result.appliedRules.length;
  }
  
  // Generate itinerary-level notes
  const days = sortedDays.map(dayNum => ({
    dayNumber: dayNum,
    activities: dayGroups[dayNum].map(a => ({
      name: a.name,
      serviceType: a.serviceType,
      startTime: a.startTime,
      endTime: a.endTime
    }))
  }));
  
  const itineraryNotes = generateItineraryNotes(days);
  allMethodologyNotes.push(...itineraryNotes);
  
  const overallScore = sortedDays.length > 0 ? Math.round(totalScore / sortedDays.length) : 100;
  
  return {
    reorderedItems,
    allMethodologyNotes,
    overallScore,
    appliedRulesCount: totalAppliedRules
  };
}
