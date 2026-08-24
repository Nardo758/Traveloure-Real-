# Traveloure Platform Architecture: Coordination Hub System

## 🎯 CORE CONCEPT

Traveloure operates as a **logistical coordination hub** that orchestrates inputs from multiple stakeholders and data sources to produce seamless, curated plans and itineraries.

**Think of Traveloure as:**
- **Air Traffic Control** for life experiences
- **Operating System** that coordinates all moving parts
- **Conductor** orchestrating multiple musicians (users, experts, vendors)
- **Smart Logistics Platform** (like Flexport for experiences)

---

## 🏗️ SYSTEM ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                    TRAVELOURE COORDINATION HUB                  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │              ORCHESTRATION ENGINE                         │ │
│  │                                                           │ │
│  │  • Matching Logic                                         │ │
│  │  • Booking Coordination                                   │ │
│  │  • Itinerary Generation                                   │ │
│  │  • State Management                                       │ │
│  │  • Conflict Resolution                                    │ │
│  │  • Optimization Algorithms                                │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐      ┌──────────────┐
│   INPUTS     │    │ PLATFORM DATA│      │ EXTERNAL DATA│
│              │    │              │      │              │
│ • Users      │    │ • Bookings   │      │ • Hotel APIs │
│ • Experts    │    │ • Reviews    │      │ • Tour APIs  │
│ • Vendors    │    │ • Profiles   │      │ • Maps       │
│              │    │ • History    │      │ • Weather    │
└──────────────┘    └──────────────┘      └──────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │    OUTPUTS       │
                    │                  │
                    │ • Curated Plans  │
                    │ • Itineraries    │
                    │ • Bookings       │
                    │ • Confirmations  │
                    └──────────────────┘
```

---

## 📊 DATA FLOW ARCHITECTURE

### 1. INPUT SOURCES (What Flows INTO the Hub)

#### **A. User Inputs**
```javascript
{
  // Travel Example
  userRequest: {
    experienceType: "travel",
    destination: "Tokyo",
    dates: { start: "2026-03-15", end: "2026-03-22" },
    travelers: { adults: 2, children: 0 },
    budget: { min: 3000, max: 5000, currency: "USD" },
    preferences: {
      interests: ["food", "culture", "photography"],
      pace: "moderate",
      accommodation: "mid-range",
      dietaryRestrictions: ["vegetarian"]
    },
    path: "expert" // or "browse"
  }
}
```

#### **B. Expert Inputs**
```javascript
{
  expertData: {
    expertId: "expert_123",
    specializations: ["tokyo", "food-tours", "cultural-immersion"],
    availability: {
      consultationSlots: ["2026-02-01T10:00Z", "2026-02-01T14:00Z"],
      bookingCapacity: { current: 3, max: 8 }
    },
    recommendations: {
      itinerary: [
        {
          day: 1,
          activities: [
            { 
              time: "09:00",
              activity: "Tsukiji Outer Market Tour",
              providerId: "vendor_456",
              reasoning: "Best morning experience for foodies",
              bookingRequired: true
            }
          ]
        }
      ],
      restaurants: [
        {
          name: "Sushi Saito",
          reasoning: "Best sushi experience, vegetarian options available",
          reservationDifficulty: "high",
          expertCanSecure: true
        }
      ],
      insiderTips: ["Avoid Golden Week", "Get Suica card at airport"]
    },
    coordination: {
      bookingPreference: "handle_all", // or "advise_only"
      communicationChannel: "whatsapp",
      responseTime: "< 4 hours"
    }
  }
}
```

#### **C. Service Provider/Vendor Inputs**
```javascript
{
  vendorData: {
    providerId: "vendor_456",
    serviceType: "tour",
    availability: {
      date: "2026-03-16",
      slots: ["09:00", "14:00"],
      capacity: { available: 6, total: 12 }
    },
    pricing: {
      basePrice: 85,
      currency: "USD",
      discounts: [
        { condition: "book_7_days_advance", amount: 10, type: "percentage" }
      ]
    },
    requirements: {
      minimumNotice: "24 hours",
      cancellationPolicy: "full_refund_48hrs",
      specialRequirements: ["comfortable_walking_shoes"]
    },
    confirmation: {
      method: "instant", // or "manual_review"
      bookingReference: "TOKYO-TSU-20260316-001"
    }
  }
}
```

### 2. PLATFORM DATA (What the Hub Knows)

```javascript
{
  platformIntelligence: {
    // Historical Performance
    historicalData: {
      popularItineraries: [
        {
          destination: "Tokyo",
          duration: 7,
          avgRating: 4.8,
          components: ["hotel_abc", "tour_xyz", "restaurant_def"]
        }
      ],
      seasonalTrends: {
        destination: "Tokyo",
        month: "March",
        crowdLevel: "moderate",
        weatherExpectation: "mild",
        priceMultiplier: 1.2
      }
    },
    
    // User History
    userProfile: {
      userId: "user_789",
      pastBookings: [
        { destination: "Paris", rating: 5, preferredStyle: "foodie" }
      ],
      preferences: { learnedFromBehavior: ["prefers_morning_activities"] },
      trustScore: 0.95, // affects pricing, vendor access
      expertAffinity: ["expert_123"] // worked well together before
    },
    
    // Expert Performance
    expertMetrics: {
      expertId: "expert_123",
      avgClientSatisfaction: 4.9,
      bookingSuccessRate: 0.97,
      specialties: ["last_minute_reservations", "hidden_gems"],
      responseTime: { avg: "2.5 hours", percentile95: "6 hours" }
    },
    
    // Vendor Reliability
    vendorMetrics: {
      providerId: "vendor_456",
      confirmationSpeed: "instant",
      cancellationRate: 0.02, // very reliable
      qualityScore: 4.7,
      priceCompetitiveness: "moderate"
    }
  }
}
```

### 3. EXTERNAL DATA (What the Hub Queries)

```javascript
{
  externalSources: {
    // Booking APIs
    hotelAvailability: {
      source: "booking.com",
      query: { destination: "Tokyo", dates: "2026-03-15/22", guests: 2 },
      results: [
        { 
          hotelId: "hotel_abc",
          name: "Park Hyatt Tokyo",
          availability: true,
          price: 450,
          rating: 4.5
        }
      ]
    },
    
    // Activity APIs
    tourAvailability: {
      source: "viator",
      query: { destination: "Tokyo", date: "2026-03-16" },
      results: [/* tour options */]
    },
    
    // Contextual Data
    maps: {
      source: "google_maps",
      travelTimes: {
        from: "Park Hyatt Tokyo",
        to: "Tsukiji Market",
        duration: "25 minutes",
        method: "subway"
      },
      walkingDistances: {/* distances */}
    },
    
    weather: {
      source: "openweather",
      forecast: {
        date: "2026-03-16",
        temp: { high: 15, low: 8, unit: "celsius" },
        conditions: "partly_cloudy",
        precipitation: "10%"
      }
    },
    
    events: {
      source: "eventbrite",
      localEvents: [
        { name: "Cherry Blossom Festival", date: "2026-03-20", impact: "high_crowds" }
      ]
    },
    
    pricing: {
      source: "currency_api",
      exchangeRate: { from: "JPY", to: "USD", rate: 0.0067 }
    }
  }
}
```

---

## ⚙️ COORDINATION ENGINE (How the Hub Processes)

### ORCHESTRATION LOGIC

```javascript
class CoordinationEngine {
  
  // Main orchestration flow
  async coordinateExperience(userRequest) {
    
    // 1. INTAKE & ROUTING
    const coordinationPlan = await this.createCoordinationPlan(userRequest);
    
    // 2. EXPERT MATCHING (if expert path)
    if (userRequest.path === 'expert') {
      const experts = await this.matchExperts(userRequest, coordinationPlan);
      const selectedExpert = await this.facilitateExpertSelection(experts);
      coordinationPlan.expert = selectedExpert;
    }
    
    // 3. VENDOR DISCOVERY & AVAILABILITY
    const availableVendors = await this.queryVendorAvailability(
      coordinationPlan.requirements
    );
    
    // 4. ITINERARY GENERATION
    const itinerary = await this.generateItinerary({
      userRequest,
      expert: coordinationPlan.expert,
      vendors: availableVendors,
      platformData: await this.getPlatformIntelligence(userRequest),
      externalData: await this.getExternalContext(userRequest)
    });
    
    // 5. OPTIMIZATION
    const optimizedItinerary = await this.optimizeItinerary(itinerary, {
      budget: userRequest.budget,
      preferences: userRequest.preferences,
      constraints: coordinationPlan.constraints
    });
    
    // 6. BOOKING COORDINATION
    const bookings = await this.coordinateBookings(optimizedItinerary, {
      bookingStrategy: coordinationPlan.expert 
        ? 'expert_managed' 
        : 'user_self_service'
    });
    
    // 7. STATE MANAGEMENT
    await this.persistCoordinationState({
      userRequest,
      itinerary: optimizedItinerary,
      bookings,
      timeline: this.generateTimeline(bookings)
    });
    
    // 8. OUTPUT GENERATION
    return await this.generateCuratedOutput({
      itinerary: optimizedItinerary,
      bookings,
      confirmations: await this.generateConfirmations(bookings),
      supportChannels: this.setupSupportChannels(coordinationPlan)
    });
  }
  
  // Expert Matching Algorithm
  async matchExperts(userRequest, plan) {
    const candidateExperts = await db.experts.find({
      specializations: { $in: [userRequest.destination, ...userRequest.preferences.interests] },
      availability: { $gt: 0 },
      rating: { $gte: 4.5 }
    });
    
    // Score each expert
    const scoredExperts = candidateExperts.map(expert => ({
      ...expert,
      matchScore: this.calculateExpertMatch(expert, userRequest),
      platformScore: this.getPlatformScore(expert),
      availabilityScore: this.getAvailabilityScore(expert, userRequest.dates)
    }));
    
    // Return top 3
    return scoredExperts
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 3);
  }
  
  // Itinerary Generation with Multi-Source Intelligence
  async generateItinerary(inputs) {
    const { userRequest, expert, vendors, platformData, externalData } = inputs;
    
    const itinerary = {
      meta: {
        destination: userRequest.destination,
        dates: userRequest.dates,
        generatedBy: expert ? expert.id : 'platform_ai',
        generatedAt: new Date()
      },
      days: []
    };
    
    // Generate day-by-day plan
    for (let day = 0; day < userRequest.duration; day++) {
      const dayPlan = {
        date: this.addDays(userRequest.dates.start, day),
        activities: [],
        meals: [],
        accommodation: null,
        transportation: [],
        notes: []
      };
      
      // COORDINATION LOGIC: Combine multiple intelligence sources
      
      // 1. Expert recommendations (if expert path)
      if (expert && expert.recommendations) {
        const expertDayPlan = expert.recommendations.itinerary[day];
        dayPlan.activities.push(...expertDayPlan.activities);
      }
      
      // 2. Platform intelligence (popular combos)
      const platformSuggestions = await this.getPlatformSuggestions({
        destination: userRequest.destination,
        day: day,
        userProfile: platformData.userProfile
      });
      
      // 3. Vendor availability
      const availableActivities = vendors.filter(v => 
        v.availability.dates.includes(dayPlan.date) &&
        v.matchesInterests(userRequest.preferences.interests)
      );
      
      // 4. External context (weather, events, crowds)
      const dayContext = externalData.weather.forecast[day];
      if (dayContext.conditions === 'rain') {
        dayPlan.activities = this.prioritizeIndoorActivities(dayPlan.activities);
      }
      
      // 5. Optimization (travel times, logical flow)
      dayPlan.activities = await this.optimizeDailyFlow({
        activities: dayPlan.activities,
        startLocation: dayPlan.accommodation,
        travelTimes: externalData.maps.travelTimes
      });
      
      itinerary.days.push(dayPlan);
    }
    
    return itinerary;
  }
  
  // Booking Coordination
  async coordinateBookings(itinerary, options) {
    const bookings = [];
    
    for (const day of itinerary.days) {
      for (const activity of day.activities) {
        if (activity.bookingRequired) {
          
          // Coordination decision: Who handles booking?
          let bookingResult;
          
          if (options.bookingStrategy === 'expert_managed') {
            // Expert coordinates with vendor
            bookingResult = await this.expertManagedBooking({
              activity,
              expert: options.expert,
              user: options.user
            });
          } else {
            // User books directly through platform
            bookingResult = await this.directBooking({
              activity,
              user: options.user
            });
          }
          
          // Track coordination state
          await this.updateCoordinationState({
            bookingId: bookingResult.id,
            status: bookingResult.status,
            stakeholders: {
              user: options.user.id,
              expert: options.expert?.id,
              vendor: activity.providerId
            }
          });
          
          bookings.push(bookingResult);
        }
      }
    }
    
    return bookings;
  }
  
  // State Management - CRITICAL for coordination
  async updateCoordinationState(update) {
    await db.coordinationStates.upsert({
      bookingId: update.bookingId,
      status: update.status,
      stakeholders: update.stakeholders,
      timeline: {
        created: new Date(),
        lastUpdated: new Date(),
        events: [
          {
            timestamp: new Date(),
            type: update.status,
            actor: update.actor || 'system'
          }
        ]
      },
      
      // Real-time sync
      syncStatus: {
        userNotified: false,
        expertNotified: false,
        vendorNotified: false
      }
    });
    
    // Trigger notifications to all stakeholders
    await this.notifyStakeholders(update);
  }
  
  // Output Generation - Curated Plan/Itinerary
  async generateCuratedOutput(data) {
    const { itinerary, bookings, confirmations, supportChannels } = data;
    
    return {
      // Structured Itinerary
      itinerary: {
        format: 'day_by_day',
        days: itinerary.days.map(day => ({
          date: day.date,
          overview: this.generateDayOverview(day),
          timeline: this.generateDayTimeline(day),
          activities: day.activities.map(a => ({
            time: a.time,
            name: a.activity,
            location: a.location,
            bookingReference: this.getBookingRef(a, bookings),
            confirmationStatus: this.getConfirmationStatus(a, confirmations),
            directions: this.getDirections(a),
            contactInfo: this.getContactInfo(a),
            whatToBring: a.requirements,
            insiderTips: a.tips
          })),
          meals: day.meals,
          notes: day.notes
        })),
        
        // Supporting Info
        budget: this.generateBudgetBreakdown(bookings),
        map: this.generateMapView(itinerary),
        emergencyContacts: this.getEmergencyContacts(),
        
        // Expert support (if applicable)
        expertSupport: supportChannels.expert ? {
          name: supportChannels.expert.name,
          contact: supportChannels.expert.contact,
          availability: supportChannels.expert.availability,
          supportLevel: supportChannels.expert.supportLevel
        } : null
      },
      
      // Confirmations Package
      confirmations: {
        accommodation: confirmations.hotels,
        activities: confirmations.activities,
        dining: confirmations.restaurants,
        transportation: confirmations.transport
      },
      
      // Downloadable Formats
      downloads: {
        pdf: await this.generatePDF(itinerary),
        mobile: await this.generateMobileItinerary(itinerary),
        calendar: await this.generateCalendarFile(itinerary)
      },
      
      // Live Coordination
      coordination: {
        trackingUrl: this.generateTrackingUrl(itinerary.id),
        supportChannels: supportChannels,
        modificationPolicy: this.getModificationPolicy()
      }
    };
  }
}
```

---

## 🗄️ DATABASE SCHEMA (Coordination State)

```javascript
// Core Coordination Schema
const coordinationSchema = {
  
  // User Requests
  experienceRequests: {
    id: ObjectId,
    userId: ObjectId,
    experienceType: String, // 'travel', 'wedding', etc.
    path: String, // 'browse' or 'expert'
    requirements: {
      destination: String,
      dates: { start: Date, end: Date },
      budget: { min: Number, max: Number },
      preferences: Object
    },
    status: String, // 'initiated', 'matched', 'planning', 'booked', 'completed'
    createdAt: Date,
    updatedAt: Date
  },
  
  // Coordination States (THE HEART OF THE SYSTEM)
  coordinationStates: {
    id: ObjectId,
    experienceRequestId: ObjectId,
    
    // Stakeholders
    stakeholders: {
      user: { id: ObjectId, role: 'requester' },
      expert: { id: ObjectId, role: 'coordinator', status: 'active' },
      vendors: [
        { id: ObjectId, role: 'service_provider', type: 'hotel', status: 'confirmed' },
        { id: ObjectId, role: 'service_provider', type: 'tour', status: 'pending' }
      ]
    },
    
    // Coordination Timeline
    timeline: {
      initiated: Date,
      expertMatched: Date,
      itineraryCreated: Date,
      bookingsStarted: Date,
      bookingsCompleted: Date,
      experienceStarted: Date,
      experienceCompleted: Date
    },
    
    // Current State
    currentPhase: String, // 'matching', 'planning', 'booking', 'confirmed', 'in_progress', 'completed'
    
    // Itinerary (evolving)
    itinerary: {
      version: Number, // tracks changes
      days: [/* day plans */],
      lastModified: Date,
      modifiedBy: String // 'expert', 'user', 'system'
    },
    
    // Bookings State
    bookings: [
      {
        bookingId: ObjectId,
        vendorId: ObjectId,
        type: String, // 'accommodation', 'activity', 'dining', 'transport'
        status: String, // 'pending', 'confirmed', 'cancelled', 'completed'
        confirmedBy: String, // 'expert', 'user', 'vendor', 'system'
        confirmationReference: String,
        date: Date,
        price: Number
      }
    ],
    
    // Communication Threads
    communications: [
      {
        threadId: ObjectId,
        participants: [ObjectId],
        channel: String, // 'platform_chat', 'email', 'whatsapp'
        lastMessage: Date
      }
    ],
    
    // Sync Status (for real-time coordination)
    syncStatus: {
      lastUserSync: Date,
      lastExpertSync: Date,
      lastVendorSync: Date,
      pendingNotifications: [String]
    }
  },
  
  // Expert Recommendations (living document)
  expertRecommendations: {
    id: ObjectId,
    experienceRequestId: ObjectId,
    expertId: ObjectId,
    version: Number,
    
    recommendations: {
      itinerary: Object,
      vendors: [ObjectId],
      insiderTips: [String],
      alternatives: [Object], // backup options
      reasoning: Object // why these choices
    },
    
    userFeedback: {
      approved: [String], // which recommendations accepted
      rejected: [String], // which rejected
      modified: [Object] // what changes user made
    },
    
    createdAt: Date,
    updatedAt: Date
  },
  
  // Vendor Coordination
  vendorBookings: {
    id: ObjectId,
    coordinationStateId: ObjectId,
    vendorId: ObjectId,
    
    request: {
      from: String, // 'expert', 'user', 'system'
      serviceType: String,
      date: Date,
      details: Object
    },
    
    vendor Response: {
      status: String, // 'available', 'unavailable', 'pending'
      price: Number,
      confirmationReference: String,
      alternativeOffered: Boolean,
      responseTime: Number // milliseconds
    },
    
    coordination: {
      managedBy: String, // 'expert' or 'platform'
      communicationChannel: String,
      notes: [String]
    }
  }
};
```

---

## 🔄 REAL-TIME COORDINATION FLOWS

### Example: Travel Booking Coordination

```javascript
// User initiates travel request
→ System creates coordinationState
→ Matches with expert
→ Expert creates recommendations
→ System queries vendor availability
→ User approves itinerary
→ Expert/System coordinates bookings with vendors
→ Vendors confirm (async)
→ System updates coordinationState
→ Notifications sent to all stakeholders
→ User receives curated itinerary
→ Live coordination begins
→ Expert provides real-time support
→ System tracks completion
→ Post-experience feedback loop
```

### Example: Wedding Coordination

```javascript
// Couple initiates wedding request
→ System creates coordinationState
→ Matches with wedding planner expert
→ Consultation scheduled
→ Expert creates vendor shortlist
→ System queries vendor availability
→ Couple reviews options
→ Expert negotiates with vendors
→ Bookings confirmed one-by-one
→ System tracks payment schedules
→ Timeline management begins
→ Regular check-ins coordinated
→ Day-of coordination
→ System tracks vendor arrivals
→ Expert manages real-time issues
→ Post-wedding wrap-up
```

---

## 🎯 CRITICAL COORDINATION PRINCIPLES

### 1. **Single Source of Truth**
All stakeholders reference the same coordinationState
```javascript
// Bad: Multiple disconnected data points
userView = getItineraryFromCache()
expertView = getItineraryFromExpertDB()
vendorView = getBookingFromVendorSystem()

// Good: Single coordination state
const state = await coordinationStates.findById(experienceId)
userView = state.itinerary
expertView = state.itinerary
vendorView = state.bookings.filter(b => b.vendorId === currentVendor.id)
```

### 2. **Event-Driven Updates**
Changes propagate to all stakeholders automatically
```javascript
// When any change occurs
await coordinationEngine.emit('state_changed', {
  experienceId,
  changedBy: 'expert',
  changeType: 'itinerary_updated',
  affectedStakeholders: ['user', 'vendor_123']
});

// Auto-triggers
→ User notification
→ Vendor notification
→ Database update
→ Real-time sync
→ Audit log
```

### 3. **Async but Coordinated**
Handle different response times gracefully
```javascript
// Vendor might respond in 5 minutes or 24 hours
const booking = await vendorBooking.create({
  status: 'pending',
  requestedAt: Date.now(),
  deadline: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
});

// Meanwhile, continue coordination
await coordinationEngine.proceedWithOtherBookings(experienceId);

// When vendor responds (async)
await coordinationEngine.handleVendorResponse({
  bookingId,
  response: vendorResponse,
  notifyStakeholders: true
});
```

### 4. **Conflict Resolution**
Handle competing requirements
```javascript
// Expert recommends 09:00 AM tour
// Weather forecast shows rain until 11:00 AM
// Vendor only has 09:00 and 15:00 slots

const resolved = await coordinationEngine.resolveConflict({
  expertPreference: { time: '09:00', priority: 'high' },
  externalConstraint: { weather: 'rain', until: '11:00' },
  vendorAvailability: ['09:00', '15:00'],
  
  resolution: 'suggest_alternative',
  suggestedOption: {
    time: '15:00',
    reasoning: 'Better weather, more enjoyable experience'
  }
});
```

### 5. **Graceful Degradation**
Handle failures without breaking coordination
```javascript
// If expert unavailable
→ Fall back to platform AI recommendations
→ Offer browse path
→ Queue for next available expert

// If vendor API down
→ Use cached availability
→ Manual confirmation flow
→ Notify expert to call vendor
→ Continue with available vendors

// If user changes mind
→ Unbook confirmed items
→ Restart coordination with new requirements
→ Preserve what's still valid
```

---

## 📱 IMPLEMENTATION CHECKLIST

### Phase 1: Core Coordination
- [ ] Coordination state database schema
- [ ] Basic orchestration engine
- [ ] User request intake
- [ ] Expert matching logic
- [ ] Vendor availability queries
- [ ] Simple itinerary generation
- [ ] Booking coordination (manual)
- [ ] State persistence

### Phase 2: Intelligence Layer
- [ ] Platform data integration
- [ ] Historical patterns analysis
- [ ] User profiling
- [ ] Expert performance tracking
- [ ] Vendor reliability scoring
- [ ] Optimization algorithms
- [ ] AI recommendations

### Phase 3: External Integration
- [ ] Hotel API integration
- [ ] Tour/activity APIs
- [ ] Restaurant reservations
- [ ] Maps & directions
- [ ] Weather data
- [ ] Currency conversion
- [ ] Event calendars

### Phase 4: Real-Time Coordination
- [ ] WebSocket connections
- [ ] Real-time state sync
- [ ] Push notifications
- [ ] Live chat integration
- [ ] Expert coordination dashboard
- [ ] User tracking app
- [ ] Vendor portal

### Phase 5: Output Generation
- [ ] PDF itinerary generation
- [ ] Mobile-optimized views
- [ ] Calendar exports
- [ ] Confirmation packages
- [ ] Booking reference management
- [ ] Support channel setup

---

## 💡 FOR REPLIT AI: KEY IMPLEMENTATION NOTES

When building this system, always remember:

1. **Every feature should consider coordination**
   - Who needs to be notified?
   - What state needs updating?
   - How do we keep everyone in sync?

2. **Data flows in multiple directions**
   - Users → Platform → Experts → Vendors
   - Vendors → Platform → Users
   - Experts → Platform → Vendors

3. **State is paramount**
   - coordinationState is the source of truth
   - Update atomically
   - Propagate changes immediately

4. **Think in terms of orchestration**
   - Not just "book a hotel"
   - But "coordinate hotel booking with expert, considering user preferences, vendor availability, and itinerary flow"

5. **Build for asynchronous reality**
   - Experts respond in hours
   - Vendors respond in minutes to days
   - Users make decisions sporadically
   - System must handle all timelines gracefully

6. **The output is a curated plan**
   - Not just a list of bookings
   - But a cohesive, coordinated experience
   - With all details managed
   - All stakeholders aligned

This is not a booking platform. This is a **coordination platform** that produces **curated experiences**.
