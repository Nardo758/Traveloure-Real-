# TRAVELPULSE - COMPLETE TECHNICAL SPECIFICATION
## Real-Time Collective Intelligence Platform for Travel

**Version:** 1.0  
**Date:** January 2026  
**Status:** Production Implementation Spec

---

## TABLE OF CONTENTS

### PART I: SYSTEM ARCHITECTURE
1. [Overview & Philosophy](#overview-and-philosophy)
2. [System Architecture Diagram](#system-architecture-diagram)
3. [Data Flow & Processing Pipeline](#data-flow-and-processing-pipeline)
4. [Technology Stack](#technology-stack)

### PART II: DATABASE DESIGN
5. [Core Tables Schema](#core-tables-schema)
6. [Indexes & Optimization](#indexes-and-optimization)
7. [Data Retention Policies](#data-retention-policies)

### PART III: BACKEND IMPLEMENTATION
8. [LiveScore Engine](#livescore-engine)
9. [Truth Verification Engine](#truth-verification-engine)
10. [Emerging Experience Detector](#emerging-experience-detector)
11. [Local vs Tourist Consensus](#local-vs-tourist-consensus)
12. [Crowd Prediction Engine](#crowd-prediction-engine)
13. [Decision Analysis Engine](#decision-analysis-engine)

### PART IV: REAL-TIME PROCESSING
14. [Data Collection Workers](#data-collection-workers)
15. [Stream Processing Pipeline](#stream-processing-pipeline)
16. [Cache Strategy](#cache-strategy)
17. [WebSocket Real-Time Updates](#websocket-real-time-updates)

### PART V: FRONTEND IMPLEMENTATION
18. [TravelPulse Dashboard UI](#travelpulse-dashboard-ui)
19. [Mobile Experience](#mobile-experience)
20. [Widget Components](#widget-components)

### PART VI: API DOCUMENTATION
21. [REST API Endpoints](#rest-api-endpoints)
22. [WebSocket Events](#websocket-events)
23. [Rate Limiting & Authentication](#rate-limiting-and-authentication)

### PART VII: DEPLOYMENT & OPERATIONS
24. [Infrastructure Setup](#infrastructure-setup)
25. [Monitoring & Alerts](#monitoring-and-alerts)
26. [Cost Analysis & Optimization](#cost-analysis-and-optimization)
27. [Implementation Roadmap](#implementation-roadmap)

---

## PART I: SYSTEM ARCHITECTURE

### 1. OVERVIEW AND PHILOSOPHY

**Core Principle:** Transform static travel information into a living intelligence layer by continuously analyzing social signals, crowd patterns, and real experiences to provide travelers with truth, not marketing.

**Key Differentiators:**
1. **Real-Time** - Data refreshes every 2-30 minutes, not months
2. **Crowd-Sourced Truth** - Aggregates 1000s of real experiences, not paid reviews
3. **Predictive** - Forecasts trends, crowds, and quality changes before they happen
4. **Verified** - Bot detection, sentiment analysis, anomaly detection
5. **Actionable** - Every insight comes with specific recommendations

**Data Sources:**
- Primary: X (Twitter) via Grok's native integration
- Secondary: Web scraping (TripAdvisor, Google Maps for validation)
- Tertiary: User-generated (Traveloure platform activity)

---

### 2. SYSTEM ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRAVELPULSE ARCHITECTURE                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  DATA COLLECTION LAYER (Real-Time Ingestion)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐│
│  │  X Stream         │  │  Web Scrapers    │  │  User Events  ││
│  │  (Grok API)       │  │  (Puppeteer)     │  │  (Platform)   ││
│  ├──────────────────┤  ├──────────────────┤  ├───────────────┤│
│  │ • Location tags   │  │ • TripAdvisor    │  │ • Bookings    ││
│  │ • Hashtags        │  │ • Google Maps    │  │ • Check-ins   ││
│  │ • Mentions        │  │ • Yelp           │  │ • Reviews     ││
│  │ • Images          │  │ • Blog posts     │  │ • Searches    ││
│  │ • Sentiment       │  │ • News sites     │  │               ││
│  └──────────────────┘  └──────────────────┘  └───────────────┘│
│            ↓                    ↓                     ↓         │
│  ┌─────────────────────────────────────────────────────────────┤
│  │  MESSAGE QUEUE (Bull + Redis)                               │
│  │  ├─ x_posts_queue (1000+ msgs/min)                          │
│  │  ├─ web_scrape_queue (100 msgs/min)                         │
│  │  └─ user_events_queue (50 msgs/min)                         │
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PROCESSING LAYER (Stream Analytics)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  GROK AI PROCESSING WORKERS (Parallel)                   │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  Worker 1: Sentiment Analysis (500 posts/min)            │  │
│  │  Worker 2: Entity Extraction (locations, businesses)     │  │
│  │  Worker 3: Bot Detection & Fraud Filtering               │  │
│  │  Worker 4: Trend Detection (velocity, spikes)            │  │
│  │  Worker 5: Local vs Tourist Classification               │  │
│  │  Worker 6: Crowd Pattern Analysis                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  AGGREGATION ENGINE (Time-Series)                        │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  • 5-minute rolling windows                              │  │
│  │  • Hourly aggregations                                   │  │
│  │  • Daily/weekly trend calculations                       │  │
│  │  • Anomaly detection                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  DATA STORAGE LAYER                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │  PostgreSQL     │  │  Redis Cache    │  │  TimescaleDB   │ │
│  │  (Drizzle ORM)  │  │  (Hot Data)     │  │  (Time-Series) │ │
│  ├─────────────────┤  ├─────────────────┤  ├────────────────┤ │
│  │ • Social posts  │  │ • Live scores   │  │ • Crowd trends │ │
│  │ • Experiences   │  │ • Active users  │  │ • Hourly data  │ │
│  │ • Locations     │  │ • Real-time     │  │ • Predictions  │ │
│  │ • Users         │  │   alerts        │  │ • Historical   │ │
│  │ • Predictions   │  │ • Dashboard     │  │   patterns     │ │
│  │                 │  │   state         │  │                │ │
│  └─────────────────┘  └─────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  API & BUSINESS LOGIC LAYER                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  CORE SERVICES (Express.js TypeScript)                   │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  • LiveScoreService - Real-time experience ratings       │  │
│  │  • TruthVerificationService - Claim validation           │  │
│  │  • EmergingDetectorService - Trend spotting              │  │
│  │  • ConsensusService - Local vs Tourist analysis          │  │
│  │  • CrowdPredictionService - Forecast crowds              │  │
│  │  • DecisionEngineService - Should I book this?           │  │
│  │  • TravelPulseDashboardService - Main intelligence hub   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  REST API + WebSocket Server                             │  │
│  │  ├─ GET /api/pulse/live/:destination                     │  │
│  │  ├─ GET /api/pulse/livescore/:placeId                    │  │
│  │  ├─ GET /api/pulse/verify-truth                          │  │
│  │  ├─ GET /api/pulse/emerging/:destination                 │  │
│  │  ├─ GET /api/pulse/crowd-forecast/:placeId               │  │
│  │  ├─ POST /api/pulse/should-i-book                        │  │
│  │  └─ WS /api/pulse/live-updates (real-time push)          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │  Web Dashboard  │  │  Mobile App     │  │  Embeddable    │ │
│  │  (Next.js)      │  │  (React Native) │  │  Widgets       │ │
│  ├─────────────────┤  ├─────────────────┤  ├────────────────┤ │
│  │ • Live map      │  │ • Push alerts   │  │ • LiveScore    │ │
│  │ • Trend charts  │  │ • AR overlay    │  │   badge        │ │
│  │ • Predictions   │  │ • Voice search  │  │ • Crowd meter  │ │
│  │ • Alerts feed   │  │ • Live updates  │  │ • Truth check  │ │
│  └─────────────────┘  └─────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

### 3. DATA FLOW & PROCESSING PIPELINE

**Real-Time Data Flow (< 5 minute latency):**

```
1. DATA INGESTION (Continuous)
   ↓
   X Post Published: "Just had the best ramen at Ichiran Kyoto!"
   ↓
2. COLLECTION (30-second polling)
   ↓
   Grok X Search detects post via hashtags/location
   ↓
3. QUEUE (Instant)
   ↓
   Message pushed to x_posts_queue via Bull
   ↓
4. PROCESSING (Parallel, 10-30 seconds)
   ↓
   Worker 1: Extract entities → "Ichiran", "Kyoto", "ramen"
   Worker 2: Sentiment analysis → 0.92 positive (high confidence)
   Worker 3: Bot detection → Real user (verified account, history)
   Worker 4: Classification → Tourist (posting from abroad, first visit)
   Worker 5: Timestamp extraction → 2:34 PM local time
   ↓
5. AGGREGATION (5-minute windows)
   ↓
   Combine with other "Ichiran" mentions in last 5 min
   Update LiveScore: 4.7 → 4.73 (+0.03)
   Detect trend: +12 mentions vs usual 8 (activity spike)
   ↓
6. STORAGE (Immediate)
   ↓
   PostgreSQL: Raw post data
   Redis: Updated LiveScore cache
   TimescaleDB: Time-series entry for hourly aggregation
   ↓
7. NOTIFICATION (If threshold met)
   ↓
   WebSocket push: "Ichiran Kyoto trending up! +50% mentions"
   ↓
8. USER SEES (< 5 min from original post)
   ↓
   Dashboard updates: LiveScore badge shows 4.73 with trend indicator
```

**Batch Processing (Daily/Weekly):**

```
1. NIGHTLY AGGREGATION (2:00 AM server time)
   ↓
   • Calculate daily averages for all locations
   • Generate trend reports (daily/weekly/monthly)
   • Update crowd prediction models with new data
   • Identify emerging experiences (velocity analysis)
   • Recalculate local vs tourist patterns
   ↓
2. MACHINE LEARNING UPDATES (Weekly)
   ↓
   • Retrain crowd prediction models
   • Update sentiment analysis thresholds
   • Refine bot detection patterns
   • Optimize anomaly detection
   ↓
3. DATA CLEANUP (Daily)
   ↓
   • Archive posts older than 90 days
   • Prune expired predictions
   • Compress time-series data
```

---

### 4. TECHNOLOGY STACK

**Backend:**
```yaml
Runtime: Node.js 20.x LTS
Framework: Express.js 4.x (TypeScript)
ORM: Drizzle ORM
AI: Grok 4.1 Fast via xAI SDK
Job Queue: Bull 4.x
WebSocket: Socket.io 4.x
```

**Databases:**
```yaml
Primary: PostgreSQL 16 (Neon/Supabase)
Cache: Redis 7.x (Upstash)
Time-Series: TimescaleDB (PostgreSQL extension)
Search: PostgreSQL Full-Text Search (pg_trgm)
```

**Frontend:**
```yaml
Framework: Next.js 14 (App Router)
UI: Shadcn/UI + Tailwind CSS
Charts: Recharts / Chart.js
Maps: Mapbox GL JS
Real-Time: Socket.io Client
```

**Infrastructure:**
```yaml
Hosting: 
  - Frontend: Cloudflare Pages
  - Backend: Railway / Render
  - Workers: Railway (separate service)
CDN: Cloudflare
Monitoring: Sentry + LogRocket
Analytics: PostHog
```

**External Services:**
```yaml
AI: xAI (Grok API)
Social: X API (via Grok)
Notifications: Twilio (SMS), SendGrid (Email)
Push: OneSignal
```

---

## PART II: DATABASE DESIGN

### 5. CORE TABLES SCHEMA

```sql
-- ============================================
-- SOCIAL POSTS TABLE
-- ============================================
CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source Information
  platform VARCHAR(50) NOT NULL, -- 'x' | 'instagram' | 'tiktok'
  post_id VARCHAR(255) UNIQUE NOT NULL,
  post_url TEXT,
  author_handle VARCHAR(255),
  author_name VARCHAR(255),
  author_verified BOOLEAN DEFAULT FALSE,
  
  -- Content
  content TEXT,
  language VARCHAR(10),
  media_urls TEXT[], -- Array of image/video URLs
  hashtags TEXT[],
  mentions TEXT[],
  
  -- Location Data
  location_text VARCHAR(500), -- Raw location string
  location_coords POINT, -- PostGIS point (lat, lng)
  destination VARCHAR(255), -- Normalized: "Kyoto", "Mumbai", etc.
  
  -- Extracted Entities
  places_mentioned TEXT[], -- ["Ichiran", "Fushimi Inari"]
  experiences_mentioned TEXT[], -- ["ramen", "temple visit"]
  
  -- Analysis Results
  sentiment_score DECIMAL(4, 3), -- -1.000 to 1.000
  sentiment_label VARCHAR(20), -- 'positive' | 'neutral' | 'negative'
  confidence_score DECIMAL(4, 3), -- 0.000 to 1.000
  is_bot BOOLEAN DEFAULT FALSE,
  is_spam BOOLEAN DEFAULT FALSE,
  user_type VARCHAR(50), -- 'local' | 'tourist' | 'influencer' | 'unknown'
  
  -- Engagement Metrics
  likes_count INTEGER DEFAULT 0,
  retweets_count INTEGER DEFAULT 0,
  replies_count INTEGER DEFAULT 0,
  views_count INTEGER,
  
  -- Timestamps
  posted_at TIMESTAMP NOT NULL,
  collected_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  
  -- Metadata
  processing_version VARCHAR(50), -- Track which AI version processed
  raw_data JSONB, -- Store complete original data
  
  -- Indexes
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_social_posts_destination ON social_posts(destination);
CREATE INDEX idx_social_posts_posted_at ON social_posts(posted_at DESC);
CREATE INDEX idx_social_posts_platform ON social_posts(platform);
CREATE INDEX idx_social_posts_places ON social_posts USING GIN(places_mentioned);
CREATE INDEX idx_social_posts_sentiment ON social_posts(sentiment_score);
CREATE INDEX idx_social_posts_location ON social_posts USING GIST(location_coords);
CREATE INDEX idx_social_posts_user_type ON social_posts(user_type);

-- Full-text search on content
CREATE INDEX idx_social_posts_content_fts ON social_posts 
  USING GIN(to_tsvector('english', content));

-- ============================================
-- PLACES TABLE (Restaurants, Attractions, etc)
-- ============================================
CREATE TABLE places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic Info
  name VARCHAR(500) NOT NULL,
  name_local VARCHAR(500), -- Local language name
  slug VARCHAR(500) UNIQUE, -- URL-friendly: "ichiran-ramen-kyoto"
  category VARCHAR(100), -- 'restaurant' | 'attraction' | 'hotel' | 'activity'
  subcategory VARCHAR(100), -- 'ramen' | 'temple' | 'boutique_hotel'
  
  -- Location
  destination VARCHAR(255) NOT NULL, -- "Kyoto", "Mumbai"
  address TEXT,
  neighborhood VARCHAR(255),
  coords POINT, -- Lat/lng
  
  -- External IDs (for cross-referencing)
  google_place_id VARCHAR(255),
  tripadvisor_id VARCHAR(255),
  yelp_id VARCHAR(255),
  
  -- Static Ratings (baseline)
  google_rating DECIMAL(2, 1),
  google_review_count INTEGER,
  tripadvisor_rating DECIMAL(2, 1),
  tripadvisor_review_count INTEGER,
  
  -- LiveScore Data (updated frequently)
  livescore_current DECIMAL(3, 2), -- 0.00 to 5.00
  livescore_trend VARCHAR(20), -- 'up' | 'down' | 'stable'
  livescore_last_updated TIMESTAMP,
  livescore_24h JSONB, -- Hourly scores for last 24 hours
  
  -- Social Metrics
  total_mentions INTEGER DEFAULT 0,
  mentions_last_24h INTEGER DEFAULT 0,
  mentions_last_7d INTEGER DEFAULT 0,
  mentions_last_30d INTEGER DEFAULT 0,
  sentiment_avg DECIMAL(4, 3),
  
  -- Crowd Patterns
  crowd_pattern JSONB, -- {hourly: {...}, daily: {...}, seasonal: {...}}
  optimal_visit_times TEXT[], -- ["6-8am", "5-7pm"]
  
  -- Classification
  tourist_magnet BOOLEAN DEFAULT FALSE, -- Heavy tourist traffic
  local_favorite BOOLEAN DEFAULT FALSE, -- Locals love it
  emerging BOOLEAN DEFAULT FALSE, -- Trending up fast
  overrated BOOLEAN DEFAULT FALSE, -- Photo > reality
  
  -- Metadata
  description TEXT,
  price_level VARCHAR(10), -- '$' | '$$' | '$$$' | '$$$$'
  tags TEXT[], -- ["instagram-worthy", "authentic", "hidden-gem"]
  
  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active' | 'closed' | 'temp_closed'
  verified BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  first_mentioned TIMESTAMP,
  last_mentioned TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_places_destination ON places(destination);
CREATE INDEX idx_places_category ON places(category);
CREATE INDEX idx_places_livescore ON places(livescore_current DESC);
CREATE INDEX idx_places_mentions ON places(mentions_last_24h DESC);
CREATE INDEX idx_places_coords ON places USING GIST(coords);
CREATE INDEX idx_places_emerging ON places(emerging) WHERE emerging = TRUE;
CREATE INDEX idx_places_slug ON places(slug);

-- Full-text search
CREATE INDEX idx_places_name_fts ON places 
  USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- ============================================
-- LIVE SCORES (Time-Series)
-- ============================================
CREATE TABLE live_scores (
  id BIGSERIAL PRIMARY KEY,
  
  place_id UUID REFERENCES places(id) ON DELETE CASCADE,
  
  -- Score Data
  score DECIMAL(3, 2) NOT NULL, -- 0.00 to 5.00
  mentions_count INTEGER DEFAULT 0,
  positive_count INTEGER DEFAULT 0,
  neutral_count INTEGER DEFAULT 0,
  negative_count INTEGER DEFAULT 0,
  
  -- Sentiment Breakdown
  avg_sentiment DECIMAL(4, 3),
  sentiment_distribution JSONB, -- Histogram
  
  -- Activity Metrics
  unique_users INTEGER DEFAULT 0,
  total_engagement INTEGER DEFAULT 0, -- Likes + retweets + replies
  
  -- Flags
  is_anomaly BOOLEAN DEFAULT FALSE, -- Unusual spike/drop
  anomaly_reason TEXT,
  
  -- Time Window
  window_start TIMESTAMP NOT NULL,
  window_end TIMESTAMP NOT NULL,
  window_size VARCHAR(20), -- '5min' | '1hour' | '1day'
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Convert to TimescaleDB hypertable (time-series optimization)
SELECT create_hypertable('live_scores', 'window_start', 
  chunk_time_interval => INTERVAL '1 day');

-- Indexes
CREATE INDEX idx_live_scores_place ON live_scores(place_id, window_start DESC);
CREATE INDEX idx_live_scores_anomaly ON live_scores(is_anomaly) 
  WHERE is_anomaly = TRUE;

-- Retention policy (auto-delete data older than 90 days)
SELECT add_retention_policy('live_scores', INTERVAL '90 days');

-- ============================================
-- CROWD PATTERNS (Time-Series)
-- ============================================
CREATE TABLE crowd_patterns (
  id BIGSERIAL PRIMARY KEY,
  
  place_id UUID REFERENCES places(id) ON DELETE CASCADE,
  
  -- Crowd Level
  crowd_level DECIMAL(4, 2), -- 0.00 to 100.00 (percentage of max capacity)
  crowd_label VARCHAR(20), -- 'empty' | 'quiet' | 'moderate' | 'busy' | 'packed'
  
  -- Data Sources
  posts_count INTEGER DEFAULT 0, -- Posts timestamped during this window
  check_ins_count INTEGER DEFAULT 0, -- Traveloure platform check-ins
  
  -- Context
  day_of_week INTEGER, -- 0-6 (Sunday-Saturday)
  hour_of_day INTEGER, -- 0-23
  is_holiday BOOLEAN DEFAULT FALSE,
  weather_condition VARCHAR(50), -- 'sunny' | 'rainy' | 'cloudy'
  
  -- Special Events
  event_happening VARCHAR(255), -- "Cherry Blossom Festival", null
  
  -- Timestamp
  timestamp TIMESTAMP NOT NULL,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Convert to hypertable
SELECT create_hypertable('crowd_patterns', 'timestamp',
  chunk_time_interval => INTERVAL '1 week');

-- Indexes
CREATE INDEX idx_crowd_patterns_place ON crowd_patterns(place_id, timestamp DESC);
CREATE INDEX idx_crowd_patterns_hour ON crowd_patterns(place_id, day_of_week, hour_of_day);

-- ============================================
-- EMERGING EXPERIENCES
-- ============================================
CREATE TABLE emerging_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Experience Details
  name VARCHAR(500) NOT NULL,
  destination VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  description TEXT,
  
  -- Trend Metrics
  trend_score INTEGER DEFAULT 0, -- Velocity of mentions
  velocity_change DECIMAL(5, 2), -- +250.5% growth rate
  baseline_mentions INTEGER DEFAULT 0, -- Before trend started
  current_mentions INTEGER DEFAULT 0, -- Current rate
  
  -- Timeline
  first_detected TIMESTAMP,
  trend_started TIMESTAMP,
  peak_predicted TIMESTAMP, -- When will it peak?
  mainstream_predicted TIMESTAMP, -- When will it be overcrowded?
  
  -- Classification
  trend_stage VARCHAR(50), -- 'emerging' | 'rising' | 'viral' | 'mainstream' | 'declining'
  confidence DECIMAL(4, 3), -- How confident are we this is real?
  
  -- Trigger Analysis
  trigger_type VARCHAR(100), -- 'influencer_post' | 'organic' | 'event' | 'seasonal'
  trigger_details JSONB,
  
  -- Recommendations
  visit_window VARCHAR(100), -- "Visit in next 2-4 weeks before it blows up"
  
  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active' | 'archived' | 'false_alarm'
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_emerging_destination ON emerging_experiences(destination);
CREATE INDEX idx_emerging_score ON emerging_experiences(trend_score DESC);
CREATE INDEX idx_emerging_stage ON emerging_experiences(trend_stage);
CREATE INDEX idx_emerging_detected ON emerging_experiences(first_detected DESC);

-- ============================================
-- TRUTH VERIFICATIONS
-- ============================================
CREATE TABLE truth_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Query
  query_text TEXT NOT NULL,
  query_hash VARCHAR(64) UNIQUE, -- MD5 hash for caching
  
  -- Results
  verdict VARCHAR(50), -- 'true' | 'mostly_true' | 'mixed' | 'mostly_false' | 'false'
  confidence DECIMAL(4, 3),
  
  -- Evidence
  supporting_posts TEXT[], -- Post IDs that support claim
  contradicting_posts TEXT[], -- Post IDs that contradict
  neutral_posts TEXT[],
  
  -- Analysis
  total_mentions INTEGER,
  sentiment_breakdown JSONB,
  common_themes TEXT[],
  warnings TEXT[], -- ["Overcrowded during peak season"]
  tips TEXT[], -- ["Visit early morning"]
  
  -- Photo vs Reality
  photo_reality_gap INTEGER, -- -100 to +100 (negative = reality better)
  
  -- Metadata
  destination VARCHAR(255),
  related_places UUID[], -- Reference to places table
  
  -- Cache Control
  expires_at TIMESTAMP, -- When to re-verify
  view_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_truth_query_hash ON truth_verifications(query_hash);
CREATE INDEX idx_truth_destination ON truth_verifications(destination);
CREATE INDEX idx_truth_expires ON truth_verifications(expires_at);

-- ============================================
-- CONSENSUS DATA (Local vs Tourist)
-- ============================================
CREATE TABLE consensus_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  place_id UUID REFERENCES places(id) ON DELETE CASCADE,
  
  -- Local Perspective
  local_rating DECIMAL(3, 2),
  local_mentions INTEGER DEFAULT 0,
  local_favorite_aspects TEXT[], -- What locals love
  local_avoid TEXT[], -- What locals warn about
  
  -- Tourist Perspective
  tourist_rating DECIMAL(3, 2),
  tourist_mentions INTEGER DEFAULT 0,
  tourist_favorite_aspects TEXT[],
  tourist_complaints TEXT[],
  
  -- Consensus
  consensus_score DECIMAL(4, 3), -- 0-1, how much they agree
  divergence_points TEXT[], -- Where opinions differ
  universal_praise TEXT[], -- What everyone loves
  
  -- Recommendations
  local_tips TEXT[],
  best_for_tourists TEXT[], -- Time of day, what to order, etc.
  
  -- Time Period
  period_start DATE,
  period_end DATE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_consensus_place ON consensus_data(place_id);
CREATE INDEX idx_consensus_period ON consensus_data(period_end DESC);

-- ============================================
-- DECISION ANALYSES
-- ============================================
CREATE TABLE decision_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Query
  item_type VARCHAR(100), -- 'tour' | 'restaurant' | 'hotel' | 'activity'
  item_id UUID, -- Reference to places or services
  item_name VARCHAR(500),
  item_url TEXT,
  
  -- Analysis Results
  recommendation VARCHAR(50), -- 'highly_recommend' | 'recommend' | 'neutral' | 'avoid'
  confidence DECIMAL(4, 3),
  probability_satisfaction DECIMAL(4, 3), -- 0.00 to 1.00
  
  -- Social Proof
  mentions_30d INTEGER,
  sentiment_avg DECIMAL(4, 3),
  positive_rate DECIMAL(4, 3),
  
  -- Verification
  verified_users INTEGER, -- Real, non-bot users
  bot_rate DECIMAL(4, 3), -- Percentage of suspected bots
  spam_detected BOOLEAN DEFAULT FALSE,
  
  -- Highlights
  standout_mentions TEXT[], -- Best quotes
  concerns TEXT[], -- Warnings or issues
  
  -- Value Analysis
  price_reported DECIMAL(10, 2),
  competitor_avg_price DECIMAL(10, 2),
  value_verdict VARCHAR(100), -- "Worth the premium" | "Overpriced"
  
  -- User Context
  user_id UUID REFERENCES users(id),
  user_profile JSONB, -- Interests, preferences for matching
  
  -- Metadata
  destination VARCHAR(255),
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_decision_item ON decision_analyses(item_id);
CREATE INDEX idx_decision_user ON decision_analyses(user_id);
CREATE INDEX idx_decision_created ON decision_analyses(created_at DESC);

-- ============================================
-- TRAVEL PULSE ALERTS
-- ============================================
CREATE TABLE pulse_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Alert Details
  type VARCHAR(100), -- 'emerging' | 'crowd_spike' | 'quality_drop' | 'event'
  severity VARCHAR(50), -- 'info' | 'warning' | 'critical'
  title VARCHAR(500) NOT NULL,
  message TEXT NOT NULL,
  
  -- Target
  destination VARCHAR(255),
  place_id UUID REFERENCES places(id),
  
  -- Trigger Conditions
  trigger_data JSONB,
  threshold_exceeded BOOLEAN DEFAULT FALSE,
  
  -- Actions
  action_url TEXT, -- Link to details or booking
  action_text VARCHAR(255), -- "Book now" | "View details"
  
  -- Delivery
  sent_to_users UUID[], -- Which users received this
  delivery_method VARCHAR(50), -- 'push' | 'email' | 'sms' | 'in_app'
  
  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active' | 'resolved' | 'expired'
  expires_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_alerts_destination ON pulse_alerts(destination);
CREATE INDEX idx_alerts_type ON pulse_alerts(type);
CREATE INDEX idx_alerts_created ON pulse_alerts(created_at DESC);
CREATE INDEX idx_alerts_status ON pulse_alerts(status) WHERE status = 'active';

-- ============================================
-- USER SUBSCRIPTIONS (What alerts to receive)
-- ============================================
CREATE TABLE pulse_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Subscription Preferences
  destinations TEXT[], -- ["Kyoto", "Mumbai"] - interests
  alert_types TEXT[], -- Types they want to receive
  
  -- Delivery Preferences
  push_enabled BOOLEAN DEFAULT TRUE,
  email_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT FALSE,
  
  -- Thresholds
  min_severity VARCHAR(50) DEFAULT 'info', -- Minimum severity to notify
  
  -- Frequency
  frequency VARCHAR(50) DEFAULT 'realtime', -- 'realtime' | 'daily_digest' | 'weekly'
  
  -- Status
  active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_subscriptions_user ON pulse_subscriptions(user_id);
CREATE INDEX idx_subscriptions_destinations ON pulse_subscriptions 
  USING GIN(destinations);
```

---

### 6. INDEXES & OPTIMIZATION

**Critical Performance Indexes:**

```sql
-- Composite index for common query patterns
CREATE INDEX idx_social_posts_dest_time ON social_posts(destination, posted_at DESC);
CREATE INDEX idx_social_posts_place_time ON social_posts(places_mentioned, posted_at DESC) 
  WHERE places_mentioned IS NOT NULL;

-- Partial indexes for active data
CREATE INDEX idx_places_active_livescore ON places(destination, livescore_current DESC)
  WHERE status = 'active';

-- GIN index for array searches
CREATE INDEX idx_places_tags_gin ON places USING GIN(tags);

-- Spatial indexes for location queries
CREATE INDEX idx_places_coords_gist ON places USING GIST(coords);
CREATE INDEX idx_social_posts_coords_gist ON social_posts USING GIST(location_coords)
  WHERE location_coords IS NOT NULL;
```

**Query Optimization:**

```sql
-- Materialized view for expensive aggregations
CREATE MATERIALIZED VIEW daily_place_stats AS
SELECT 
  place_id,
  DATE(window_start) as date,
  AVG(score) as avg_score,
  SUM(mentions_count) as total_mentions,
  AVG(avg_sentiment) as avg_sentiment
FROM live_scores
WHERE window_size = '1hour'
GROUP BY place_id, DATE(window_start);

CREATE UNIQUE INDEX ON daily_place_stats(place_id, date);

-- Refresh nightly via cron job
```

---

### 7. DATA RETENTION POLICIES

```sql
-- Auto-archive old social posts (keep raw data for 90 days)
CREATE TABLE social_posts_archive (
  LIKE social_posts INCLUDING ALL
);

-- Scheduled job: Move posts older than 90 days to archive
-- Run daily at 3:00 AM

-- Delete archived data older than 1 year
DELETE FROM social_posts_archive 
WHERE posted_at < NOW() - INTERVAL '1 year';

-- TimescaleDB automatic retention (already configured above)
-- live_scores: 90 days
-- crowd_patterns: Continuous aggregation, no deletion
```

---

## PART III: BACKEND IMPLEMENTATION

### 8. LIVESCORE ENGINE

```typescript
// LiveScore Service
// Location: /server/services/pulse/livescore.service.ts

import { db } from '@/server/db';
import { grokClient } from '@/server/config/grok.config';
import { web_search, x_search } from 'xai-sdk/tools';
import { subHours, subDays } from 'date-fns';

export class LiveScoreService {
  /**
   * Get current LiveScore for a place
   */
  async getLiveScore(placeId: string): Promise<LiveScoreData> {
    // Check cache first
    const cached = await this.getCachedScore(placeId);
    if (cached && cached.age < 300) { // Less than 5 minutes old
      return cached.data;
    }
    
    // Get place details
    const place = await db.query.places.findFirst({
      where: eq(places.id, placeId)
    });
    
    if (!place) throw new Error('Place not found');
    
    // Calculate LiveScore based on recent social activity
    const score = await this.calculateLiveScore(place);
    
    // Update database
    await db.update(places)
      .set({
        livescore_current: score.current,
        livescore_trend: score.trend,
        livescore_last_updated: new Date(),
        livescore_24h: score.hourly_breakdown
      })
      .where(eq(places.id, placeId));
    
    // Cache result
    await this.cacheScore(placeId, score);
    
    return score;
  }
  
  /**
   * Calculate LiveScore from social signals
   */
  private async calculateLiveScore(place: Place): Promise<LiveScoreData> {
    // Get posts from last 24 hours mentioning this place
    const recentPosts = await db.query.socialPosts.findMany({
      where: and(
        arrayContains(socialPosts.places_mentioned, [place.name]),
        gte(socialPosts.posted_at, subHours(new Date(), 24))
      ),
      orderBy: desc(socialPosts.posted_at)
    });
    
    if (recentPosts.length === 0) {
      // No recent data, return baseline
      return {
        current: place.google_rating || 0,
        trend: 'stable',
        mentions: 0,
        sentiment_avg: 0,
        confidence: 0.3,
        hourly_breakdown: [],
        insights: ['No recent social activity detected'],
        last_updated: new Date()
      };
    }
    
    // Calculate weighted average sentiment score
    const sentimentScores = recentPosts.map(p => ({
      score: p.sentiment_score,
      weight: this.calculatePostWeight(p),
      timestamp: p.posted_at
    }));
    
    const totalWeight = sentimentScores.reduce((sum, s) => sum + s.weight, 0);
    const weightedSentiment = sentimentScores.reduce(
      (sum, s) => sum + (s.score * s.weight), 
      0
    ) / totalWeight;
    
    // Convert sentiment (-1 to 1) to star rating (0 to 5)
    // Formula: rating = 3 + (sentiment * 2)
    // -1.0 sentiment → 1.0 stars
    //  0.0 sentiment → 3.0 stars
    //  1.0 sentiment → 5.0 stars
    const currentScore = Math.max(0, Math.min(5, 3 + (weightedSentiment * 2)));
    
    // Calculate trend by comparing to previous period
    const previousPosts = await db.query.socialPosts.findMany({
      where: and(
        arrayContains(socialPosts.places_mentioned, [place.name]),
        gte(socialPosts.posted_at, subDays(new Date(), 7)),
        lt(socialPosts.posted_at, subHours(new Date(), 24))
      )
    });
    
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (previousPosts.length > 0) {
      const prevAvg = previousPosts.reduce((sum, p) => sum + p.sentiment_score, 0) 
        / previousPosts.length;
      const prevScore = 3 + (prevAvg * 2);
      
      const delta = currentScore - prevScore;
      if (delta > 0.2) trend = 'up';
      else if (delta < -0.2) trend = 'down';
    }
    
    // Break down by hour for chart
    const hourlyBreakdown = this.calculateHourlyBreakdown(recentPosts);
    
    // Extract insights from posts
    const insights = await this.extractInsights(recentPosts, place);
    
    // Detect anomalies
    const anomaly = this.detectAnomaly(recentPosts, place);
    
    return {
      current: parseFloat(currentScore.toFixed(2)),
      trend,
      mentions: recentPosts.length,
      sentiment_avg: weightedSentiment,
      confidence: this.calculateConfidence(recentPosts),
      hourly_breakdown: hourlyBreakdown,
      insights,
      anomaly,
      last_updated: new Date()
    };
  }
  
  /**
   * Calculate weight for a post based on recency and engagement
   */
  private calculatePostWeight(post: SocialPost): number {
    // Base weight = 1.0
    let weight = 1.0;
    
    // Recency multiplier (more recent = higher weight)
    const hoursAgo = (Date.now() - post.posted_at.getTime()) / (1000 * 60 * 60);
    const recencyMultiplier = Math.exp(-hoursAgo / 24); // Exponential decay
    weight *= recencyMultiplier;
    
    // Engagement multiplier (more engagement = higher weight)
    const totalEngagement = post.likes_count + post.retweets_count + post.replies_count;
    const engagementMultiplier = 1 + Math.log10(totalEngagement + 1);
    weight *= engagementMultiplier;
    
    // Verified users get higher weight
    if (post.author_verified) weight *= 1.5;
    
    // Locals get higher weight than tourists
    if (post.user_type === 'local') weight *= 1.3;
    
    // Penalize suspected bots
    if (post.is_bot) weight *= 0.1;
    
    return weight;
  }
  
  /**
   * Calculate hourly breakdown for last 24 hours
   */
  private calculateHourlyBreakdown(posts: SocialPost[]): HourlyScore[] {
    const hours: HourlyScore[] = [];
    
    for (let i = 0; i < 24; i++) {
      const hourStart = subHours(new Date(), 24 - i);
      const hourEnd = subHours(new Date(), 23 - i);
      
      const hourPosts = posts.filter(p => 
        p.posted_at >= hourStart && p.posted_at < hourEnd
      );
      
      if (hourPosts.length > 0) {
        const avgSentiment = hourPosts.reduce((sum, p) => sum + p.sentiment_score, 0) 
          / hourPosts.length;
        const score = 3 + (avgSentiment * 2);
        
        hours.push({
          hour: hourStart,
          score: parseFloat(score.toFixed(2)),
          mentions: hourPosts.length,
          sentiment: avgSentiment
        });
      } else {
        hours.push({
          hour: hourStart,
          score: null,
          mentions: 0,
          sentiment: 0
        });
      }
    }
    
    return hours;
  }
  
  /**
   * Extract key insights from posts using Grok
   */
  private async extractInsights(
    posts: SocialPost[], 
    place: Place
  ): Promise<string[]> {
    if (posts.length < 5) return []; // Need minimum data
    
    const chat = grokClient.chat.create({
      model: 'grok-4-1-fast'
    });
    
    chat.append(system(`
      Analyze social media posts about a place and extract key insights.
      
      Focus on:
      - Common praise or complaints
      - Specific recommendations (what to order, when to visit)
      - Warnings or tips
      - Recent changes noticed
      
      Return 3-5 concise bullet points (one sentence each).
    `));
    
    const postSample = posts.slice(0, 20).map(p => ({
      text: p.content,
      sentiment: p.sentiment_score,
      user_type: p.user_type,
      posted_at: p.posted_at
    }));
    
    chat.append(user(`
      Place: ${place.name} (${place.category})
      Location: ${place.destination}
      
      Recent posts (${posts.length} total, showing sample):
      ${JSON.stringify(postSample, null, 2)}
      
      Extract key insights travelers should know RIGHT NOW.
    `));
    
    const response = await chat.sample();
    const text = response.content.find(c => c.type === 'text')?.text || '';
    
    // Parse bullet points
    const insights = text
      .split('\n')
      .filter(line => line.trim().startsWith('•') || line.trim().startsWith('-'))
      .map(line => line.replace(/^[•\-]\s*/, '').trim())
      .filter(line => line.length > 10);
    
    return insights.slice(0, 5);
  }
  
  /**
   * Detect anomalies (sudden quality changes)
   */
  private detectAnomaly(posts: SocialPost[], place: Place): AnomalyData | null {
    // Compare recent sentiment to historical baseline
    const recentAvg = posts.reduce((sum, p) => sum + p.sentiment_score, 0) / posts.length;
    const baseline = place.sentiment_avg || 0;
    
    const delta = recentAvg - baseline;
    const threshold = 0.3; // 30% change
    
    if (Math.abs(delta) > threshold) {
      return {
        detected: true,
        type: delta > 0 ? 'quality_improvement' : 'quality_decline',
        severity: Math.abs(delta) > 0.5 ? 'high' : 'medium',
        delta: parseFloat(delta.toFixed(3)),
        reason: this.analyzeAnomalyReason(posts, delta)
      };
    }
    
    return null;
  }
  
  /**
   * Analyze why there's an anomaly
   */
  private analyzeAnomalyReason(posts: SocialPost[], delta: number): string {
    // Look for common themes in recent posts
    const keywords = {
      positive: ['amazing', 'best', 'excellent', 'perfect', 'worth', 'recommend'],
      negative: ['disappointed', 'avoid', 'bad', 'terrible', 'overrated', 'closed']
    };
    
    const isPositive = delta > 0;
    const targetKeywords = isPositive ? keywords.positive : keywords.negative;
    
    const mentions: Record<string, number> = {};
    
    posts.forEach(post => {
      const content = post.content.toLowerCase();
      targetKeywords.forEach(keyword => {
        if (content.includes(keyword)) {
          mentions[keyword] = (mentions[keyword] || 0) + 1;
        }
      });
    });
    
    const topKeywords = Object.entries(mentions)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([word]) => word);
    
    if (topKeywords.length > 0) {
      return `${isPositive ? 'Positive' : 'Negative'} mentions spike: "${topKeywords.join('", "')}"`;
    }
    
    return isPositive ? 'Sudden increase in positive sentiment' : 'Sudden decrease in quality mentioned';
  }
  
  /**
   * Calculate confidence score (0-1)
   */
  private calculateConfidence(posts: SocialPost[]): number {
    // Confidence based on:
    // 1. Number of posts (more = higher confidence)
    // 2. Diversity of users (not all from same person)
    // 3. Low bot rate
    // 4. Recent data (not stale)
    
    let confidence = 0;
    
    // Volume component (0-0.4)
    const volumeScore = Math.min(0.4, posts.length / 50);
    confidence += volumeScore;
    
    // Diversity component (0-0.3)
    const uniqueUsers = new Set(posts.map(p => p.author_handle)).size;
    const diversityScore = Math.min(0.3, uniqueUsers / 20);
    confidence += diversityScore;
    
    // Quality component (0-0.2)
    const botRate = posts.filter(p => p.is_bot).length / posts.length;
    const qualityScore = 0.2 * (1 - botRate);
    confidence += qualityScore;
    
    // Recency component (0-0.1)
    const avgAge = posts.reduce((sum, p) => 
      sum + (Date.now() - p.posted_at.getTime()), 0
    ) / posts.length;
    const hoursOld = avgAge / (1000 * 60 * 60);
    const recencyScore = 0.1 * Math.exp(-hoursOld / 24);
    confidence += recencyScore;
    
    return parseFloat(confidence.toFixed(3));
  }
  
  /**
   * Cache score in Redis
   */
  private async cacheScore(placeId: string, score: LiveScoreData) {
    await redis.setex(
      `livescore:${placeId}`,
      300, // 5 minutes TTL
      JSON.stringify(score)
    );
  }
  
  /**
   * Get cached score
   */
  private async getCachedScore(placeId: string): Promise<{ data: LiveScoreData, age: number } | null> {
    const cached = await redis.get(`livescore:${placeId}`);
    if (!cached) return null;
    
    const data = JSON.parse(cached);
    const age = (Date.now() - new Date(data.last_updated).getTime()) / 1000;
    
    return { data, age };
  }
}

// Types
interface LiveScoreData {
  current: number; // 0-5
  trend: 'up' | 'down' | 'stable';
  mentions: number;
  sentiment_avg: number;
  confidence: number;
  hourly_breakdown: HourlyScore[];
  insights: string[];
  anomaly?: AnomalyData | null;
  last_updated: Date;
}

interface HourlyScore {
  hour: Date;
  score: number | null;
  mentions: number;
  sentiment: number;
}

interface AnomalyData {
  detected: boolean;
  type: 'quality_improvement' | 'quality_decline';
  severity: 'low' | 'medium' | 'high';
  delta: number;
  reason: string;
}
```

**API Endpoint:**

```typescript
// LiveScore API Route
// Location: /server/routes/pulse/livescore.route.ts

import { Router } from 'express';
import { LiveScoreService } from '@/server/services/pulse/livescore.service';
import { authenticateUser } from '@/server/middleware/auth.middleware';
import { rateLimitPulse } from '@/server/middleware/rate-limit.middleware';

const router = Router();
const liveScoreService = new LiveScoreService();

/**
 * GET /api/pulse/livescore/:placeId
 * Get current LiveScore for a place
 */
router.get(
  '/livescore/:placeId',
  rateLimitPulse, // 60 requests per minute
  async (req, res) => {
    try {
      const { placeId } = req.params;
      
      const liveScore = await liveScoreService.getLiveScore(placeId);
      
      res.json({
        success: true,
        data: liveScore
      });
    } catch (error) {
      console.error('LiveScore error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate LiveScore'
      });
    }
  }
);

/**
 * GET /api/pulse/livescore/destination/:destination
 * Get LiveScores for top places in a destination
 */
router.get(
  '/livescore/destination/:destination',
  rateLimitPulse,
  async (req, res) => {
    try {
      const { destination } = req.params;
      const { category, limit = 20 } = req.query;
      
      // Get top places in destination
      const places = await db.query.places.findMany({
        where: category 
          ? and(
              eq(places.destination, destination),
              eq(places.category, category as string)
            )
          : eq(places.destination, destination),
        orderBy: [
          desc(places.livescore_current),
          desc(places.mentions_last_24h)
        ],
        limit: parseInt(limit as string)
      });
      
      // Get LiveScore for each
      const scores = await Promise.all(
        places.map(async (place) => ({
          place_id: place.id,
          name: place.name,
          category: place.category,
          livescore: await liveScoreService.getLiveScore(place.id)
        }))
      );
      
      res.json({
        success: true,
        data: {
          destination,
          category,
          places: scores
        }
      });
    } catch (error) {
      console.error('Destination LiveScore error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch destination LiveScores'
      });
    }
  }
);

export default router;
```

---

### 9. TRUTH VERIFICATION ENGINE

```typescript
// Truth Verification Service
// Location: /server/services/pulse/truth-verification.service.ts

import { createHash } from 'crypto';

export class TruthVerificationService {
  /**
   * Verify a travel claim/question
   */
  async verifyTruth(query: string, destination?: string): Promise<TruthVerificationData> {
    // Check cache first
    const queryHash = this.hashQuery(query);
    const cached = await this.getCachedVerification(queryHash);
    
    if (cached && !this.isExpired(cached)) {
      await this.incrementViewCount(cached.id);
      return cached;
    }
    
    // Perform verification using Grok
    const verification = await this.performVerification(query, destination);
    
    // Store in database
    const saved = await db.insert(truthVerifications).values({
      query_text: query,
      query_hash: queryHash,
      verdict: verification.verdict,
      confidence: verification.confidence,
      supporting_posts: verification.supporting_posts,
      contradicting_posts: verification.contradicting_posts,
      neutral_posts: verification.neutral_posts,
      total_mentions: verification.total_mentions,
      sentiment_breakdown: verification.sentiment_breakdown,
      common_themes: verification.common_themes,
      warnings: verification.warnings,
      tips: verification.tips,
      photo_reality_gap: verification.photo_reality_gap,
      destination,
      related_places: verification.related_places,
      expires_at: verification.expires_at
    }).returning();
    
    return { ...verification, id: saved[0].id };
  }
  
  /**
   * Perform actual verification using Grok
   */
  private async performVerification(
    query: string,
    destination?: string
  ): Promise<TruthVerificationData> {
    const chat = grokClient.chat.create({
      model: 'grok-4-1-fast-reasoning',
      tools: [
        x_search(),
        web_search()
      ]
    });
    
    chat.append(system(`
      You are a travel truth verification system. Your job is to verify claims 
      about travel experiences using real social media evidence.
      
      Process:
      1. Search X and web for mentions of the claim/question
      2. Analyze sentiment and patterns
      3. Categorize posts as supporting, contradicting, or neutral
      4. Calculate confidence based on evidence quality
      5. Provide verdict with specific tips and warnings
      
      Verdict Categories:
      - true: 80%+ supporting evidence, high confidence
      - mostly_true: 60-79% supporting, medium-high confidence
      - mixed: Evidence split or inconclusive
      - mostly_false: 60-79% contradicting
      - false: 80%+ contradicting evidence
      
      Output Format (JSON):
      {
        "verdict": "mostly_true",
        "confidence": 0.75,
        "total_mentions": 147,
        "supporting_evidence": ["post_id_1", "post_id_2"],
        "contradicting_evidence": ["post_id_3"],
        "sentiment_breakdown": {
          "positive": 73,
          "neutral": 52,
          "negative": 22
        },
        "common_themes": [
          "Overcrowded during peak season",
          "Beautiful early morning",
          "Worth visiting despite crowds"
        ],
        "warnings": [
          "Expect large crowds 10am-3pm",
          "Bring cash - some vendors don't accept cards"
        ],
        "tips": [
          "Visit 6-7am for best experience",
          "Skip weekends if possible",
          "Alternative: nearby Okochi Sanso villa"
        ],
        "photo_reality_gap": -15,
        "explanation": "Photos slightly oversell the experience but most visitors 
                        still find it worthwhile, especially with proper timing."
      }
    `));
    
    chat.append(user(`
      Verify this travel claim/question:
      "${query}"
      ${destination ? `\nDestination: ${destination}` : ''}
      
      Find real traveler experiences from the past 6 months.
      Focus on actionable insights, not generic info.
    `));
    
    const response = await chat.sample();
    const result = JSON.parse(
      response.content.find(c => c.type === 'text')?.text || '{}'
    );
    
    // Process and structure result
    return {
      verdict: result.verdict,
      confidence: result.confidence,
      supporting_posts: result.supporting_evidence || [],
      contradicting_posts: result.contradicting_evidence || [],
      neutral_posts: [],
      total_mentions: result.total_mentions,
      sentiment_breakdown: result.sentiment_breakdown,
      common_themes: result.common_themes || [],
      warnings: result.warnings || [],
      tips: result.tips || [],
      photo_reality_gap: result.photo_reality_gap || 0,
      explanation: result.explanation,
      related_places: [], // Would be extracted from post entities
      expires_at: this.calculateExpiryDate(result.total_mentions)
    };
  }
  
  /**
   * Calculate when verification expires (more mentions = longer cache)
   */
  private calculateExpiryDate(mentions: number): Date {
    // Few mentions = shorter cache (volatile)
    // Many mentions = longer cache (stable)
    const baseHours = 24;
    const bonusHours = Math.min(168, Math.log10(mentions + 1) * 24); // Max 1 week
    const totalHours = baseHours + bonusHours;
    
    return new Date(Date.now() + totalHours * 60 * 60 * 1000);
  }
  
  /**
   * Hash query for caching
   */
  private hashQuery(query: string): string {
    return createHash('md5')
      .update(query.toLowerCase().trim())
      .digest('hex');
  }
  
  /**
   * Get cached verification
   */
  private async getCachedVerification(queryHash: string) {
    return await db.query.truthVerifications.findFirst({
      where: eq(truthVerifications.query_hash, queryHash)
    });
  }
  
  /**
   * Check if cached verification is expired
   */
  private isExpired(verification: TruthVerification): boolean {
    return verification.expires_at < new Date();
  }
  
  /**
   * Increment view count
   */
  private async incrementViewCount(id: string) {
    await db.update(truthVerifications)
      .set({ view_count: sql`${truthVerifications.view_count} + 1` })
      .where(eq(truthVerifications.id, id));
  }
}
```

*[Continuing in next file due to length...]*

This is the first half of the complete TravelPulse implementation. Should I continue with the remaining services (Emerging Experience Detector, Crowd Prediction, etc.) and the frontend implementation?

