# TRAVELPULSE - COMPLETE TECHNICAL SPECIFICATION
## Real-Time Collective Intelligence Platform for Travel

**Version:** 1.0  
**Date:** January 2026  
**Product Vision:** "The Truth Layer for Travel"

---

## TABLE OF CONTENTS

### PART I: SYSTEM ARCHITECTURE
1. [High-Level Architecture](#high-level-architecture)
2. [Data Flow Diagrams](#data-flow-diagrams)
3. [Technology Stack](#technology-stack)
4. [Infrastructure Requirements](#infrastructure-requirements)

### PART II: DATABASE DESIGN
5. [Core Schema](#core-schema)
6. [Indexing Strategy](#indexing-strategy)
7. [Data Retention Policies](#data-retention-policies)

### PART III: BACKEND IMPLEMENTATION
8. [LiveScore Engine](#livescore-engine)
9. [Truth Verification System](#truth-verification-system)
10. [Emerging Experience Detector](#emerging-experience-detector)
11. [Local vs Tourist Consensus](#local-vs-tourist-consensus)
12. [Crowd Prediction Engine](#crowd-prediction-engine)
13. [Decision Analysis Engine](#decision-analysis-engine)

### PART IV: REAL-TIME PROCESSING
14. [Data Ingestion Pipeline](#data-ingestion-pipeline)
15. [Stream Processing Architecture](#stream-processing-architecture)
16. [Event-Driven Updates](#event-driven-updates)

### PART V: FRONTEND IMPLEMENTATION
17. [TravelPulse Live Dashboard](#travelpulse-live-dashboard)
18. [Mobile Components](#mobile-components)
19. [Real-Time Widgets](#real-time-widgets)

### PART VI: DEPLOYMENT & OPERATIONS
20. [Implementation Roadmap](#implementation-roadmap)
21. [Monitoring & Alerting](#monitoring-and-alerting)
22. [Cost Analysis](#cost-analysis)
23. [Performance Optimization](#performance-optimization)

---

## PART I: SYSTEM ARCHITECTURE

### 1. HIGH-LEVEL ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TRAVELPULSE ARCHITECTURE                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  CLIENT LAYER                                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Web App              Mobile App           Browser Extension        │
│  ─────────            ──────────           ──────────────          │
│  • Dashboard          • Live View          • Quick Lookup          │
│  • Widgets            • Push Alerts        • Context Menu          │
│  • Analytics          • Voice Query        • Page Overlay          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ WebSocket + REST
┌─────────────────────────────────────────────────────────────────────┐
│  API GATEWAY                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  • Rate Limiting (1000 req/min per user)                           │
│  • Authentication (JWT + API Keys)                                  │
│  • Request Routing                                                  │
│  • WebSocket Manager (real-time updates)                            │
│  • Response Caching (Redis)                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  TRAVELPULSE CORE SERVICES                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │  LiveScore       │  │  Truth Engine    │  │  Crowd Predictor │ │
│  │  Service         │  │  Service         │  │  Service         │ │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘ │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │  Emerging Trends │  │  Decision Engine │  │  Consensus       │ │
│  │  Detector        │  │  Service         │  │  Analyzer        │ │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  DATA PROCESSING LAYER                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  REAL-TIME INGESTION PIPELINE                               │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │                                                             │   │
│  │  Grok X Search → Kafka Queue → Stream Processor → DB       │   │
│  │       ↓              ↓             ↓              ↓        │   │
│  │   Raw Posts    Deduplication  Enrichment    Storage        │   │
│  │                 Filtering      Sentiment     Indexing       │   │
│  │                                Analysis                     │   │
│  │                                Geolocation                  │   │
│  │                                Entity Extract               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  BACKGROUND JOBS (Scheduled)                                │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │  • Market Intelligence Update (every 15 min)                │   │
│  │  • Trend Detection (every 30 min)                           │   │
│  │  • Crowd Forecast Recalculation (every 1 hour)              │   │
│  │  • Historical Analysis (nightly)                            │   │
│  │  • Model Training (weekly)                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  DATA LAYER                                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PostgreSQL (Primary)      Redis (Cache)        ClickHouse (Analytics)│
│  ──────────────────        ────────────         ─────────────────  │
│  • Social mentions         • Live scores        • Time-series data │
│  • Truth scores            • Hot trends         • Historical trends│
│  • Crowd forecasts         • User sessions      • Analytics queries│
│  • Entity profiles         • Rate limits        • Aggregations     │
│                                                                     │
│  Elasticsearch (Search)    S3 (Archive)                             │
│  ───────────────────       ──────────                              │
│  • Full-text search        • Raw data backup                        │
│  • Faceted queries         • Audit logs                             │
│  • Geo search              • Compliance                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  EXTERNAL INTEGRATIONS                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Grok API               Weather APIs          Maps APIs             │
│  ─────────             ────────────          ─────────             │
│  • X Search            • Forecasts           • Geocoding           │
│  • Web Search          • Conditions          • Directions          │
│  • Sentiment           • Alerts              • Places              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 2. DATA FLOW DIAGRAMS

**Flow 1: Real-Time Social Mention Processing**

```
┌─────────────────────────────────────────────────────────────────┐
│  SOCIAL MENTION INGESTION & PROCESSING                         │
└─────────────────────────────────────────────────────────────────┘

1. INGESTION (Every 15 minutes for each market)
   ↓
   Grok X Search API
   └─ Query: "(Kyoto) (restaurant OR temple OR hotel OR tour)"
      └─ Last 15 minutes
      └─ Returns: ~100-500 posts per query
   ↓
2. DEDUPLICATION
   ↓
   Check Redis cache: "processed:post:{post_id}"
   ├─ EXISTS → Skip
   └─ NOT EXISTS → Continue
   ↓
3. ENRICHMENT
   ↓
   Parallel Processing:
   ├─ Sentiment Analysis (Grok)
   │  └─ Score: -1.0 to +1.0
   ├─ Entity Extraction
   │  └─ Identify: restaurants, hotels, attractions
   ├─ Geolocation
   │  └─ Extract: coordinates, neighborhood
   ├─ User Classification
   │  └─ Detect: local vs tourist
   └─ Timestamp Normalization
      └─ Convert to UTC, extract local hour
   ↓
4. AGGREGATION
   ↓
   Update aggregated metrics:
   ├─ LiveScore (rolling 24h window)
   ├─ Trend scores (velocity calculation)
   ├─ Crowd density (location clustering)
   └─ Sentiment trends (moving average)
   ↓
5. STORAGE
   ↓
   Write to:
   ├─ PostgreSQL (structured data)
   ├─ ClickHouse (time-series analytics)
   └─ Elasticsearch (searchable index)
   ↓
6. REAL-TIME BROADCAST
   ↓
   WebSocket push to connected clients:
   └─ Dashboard updates
   └─ Alert triggers
   └─ Widget refreshes
```

**Flow 2: User Query Processing**

```
User searches: "Is Bamboo Forest worth it?"
   ↓
API Gateway receives request
   ↓
Check Redis cache: "truth_check:bamboo_forest_kyoto"
   ├─ HIT (< 1 hour old) → Return cached result
   └─ MISS → Continue
   ↓
Truth Verification Service
   ↓
   ├─ Query Grok X Search
   │  └─ "Bamboo Forest Arashiyama" (last 7 days)
   │  └─ Returns: ~200 mentions
   ↓
   ├─ Sentiment Analysis
   │  └─ Positive: 62%
   │  └─ Neutral: 28%
   │  └─ Negative: 10%
   ↓
   ├─ Extract Tips
   │  └─ Pattern detection: "best time", "avoid", "tip"
   │  └─ Frequency counting: "6am" (23 mentions)
   ↓
   ├─ Calculate Photo vs Reality
   │  └─ Instagram posts vs recent experiences
   │  └─ Complaint pattern analysis
   ↓
   └─ Generate Response
      └─ Format structured result
      └─ Cache for 1 hour
      └─ Return to user
```

---

### 3. TECHNOLOGY STACK

```yaml
Backend:
  Runtime: Node.js 20 LTS
  Framework: Express.js + TypeScript
  API: RESTful + WebSocket (Socket.io)
  
Data Processing:
  Message Queue: Apache Kafka
  Stream Processing: Apache Flink
  Job Scheduler: Bull (Redis-based)
  
Databases:
  Primary: PostgreSQL 15 (with TimescaleDB extension)
  Cache: Redis 7 (Cluster mode)
  Analytics: ClickHouse 23.x
  Search: Elasticsearch 8.x
  
Frontend:
  Framework: Next.js 14 (App Router)
  State: Zustand + React Query
  UI: Shadcn/UI + Tailwind
  Charts: Recharts + D3.js
  Real-time: Socket.io-client
  
AI/ML:
  LLM: Grok 4.1 Fast (xAI API)
  Sentiment: Custom model on Grok
  Embeddings: OpenAI Ada-002 (for search)
  
Infrastructure:
  Hosting: AWS / Cloudflare
  CDN: Cloudflare
  Monitoring: DataDog + Sentry
  Logging: Elasticsearch + Kibana
  
DevOps:
  CI/CD: GitHub Actions
  Containers: Docker + Kubernetes
  IaC: Terraform
```

---

### 4. INFRASTRUCTURE REQUIREMENTS

**Compute:**
```
API Servers:
├─ Production: 4x c6i.2xlarge (8 vCPU, 16GB RAM)
├─ Staging: 2x c6i.xlarge (4 vCPU, 8GB RAM)
└─ Auto-scaling: 2-10 instances based on load

Worker Servers (Data Processing):
├─ Stream Processors: 3x c6i.4xlarge (16 vCPU, 32GB RAM)
├─ Background Jobs: 2x c6i.2xlarge (8 vCPU, 16GB RAM)
└─ Always-on for real-time processing

Total Compute Cost: ~$2,500/month
```

**Storage:**
```
PostgreSQL (RDS):
├─ Instance: db.r6g.2xlarge (8 vCPU, 64GB RAM)
├─ Storage: 500GB SSD (expandable to 2TB)
└─ Cost: ~$650/month

Redis (ElastiCache):
├─ Cluster: 3x cache.r6g.xlarge (4 vCPU, 26GB RAM)
├─ Replication: 1 primary + 2 replicas
└─ Cost: ~$540/month

ClickHouse (Self-hosted):
├─ Cluster: 2x c6i.2xlarge (8 vCPU, 16GB RAM)
├─ Storage: 1TB SSD each
└─ Cost: ~$500/month

Elasticsearch (AWS OpenSearch):
├─ Cluster: 3x r6g.large.search (2 vCPU, 16GB RAM)
├─ Storage: 500GB per node
└─ Cost: ~$450/month

Total Storage Cost: ~$2,140/month
```

**Bandwidth:**
```
Data Transfer:
├─ API responses: ~500GB/month
├─ WebSocket updates: ~200GB/month
├─ CDN (static assets): ~1TB/month
└─ Cost: ~$150/month
```

**Total Infrastructure: ~$4,790/month**

---

## PART II: DATABASE DESIGN

### 5. CORE SCHEMA

```sql
-- ============================================
-- SOCIAL MENTIONS (Primary data source)
-- ============================================
CREATE TABLE social_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source metadata
  platform VARCHAR(50) NOT NULL, -- 'x' (twitter), 'instagram', 'tiktok'
  post_id VARCHAR(255) UNIQUE NOT NULL,
  post_url TEXT,
  author_id VARCHAR(255),
  author_username VARCHAR(255),
  
  -- Content
  content TEXT NOT NULL,
  language VARCHAR(10),
  media_urls TEXT[],
  hashtags TEXT[],
  
  -- Temporal
  posted_at TIMESTAMP NOT NULL,
  posted_at_local TIMESTAMP, -- Local time at location
  day_of_week INTEGER, -- 0-6 (Sun-Sat)
  hour_of_day INTEGER, -- 0-23
  
  -- Geospatial
  location GEOGRAPHY(POINT, 4326), -- PostGIS
  location_name VARCHAR(255),
  neighborhood VARCHAR(255),
  city VARCHAR(100),
  country VARCHAR(100),
  
  -- Entities (extracted)
  mentioned_places TEXT[], -- ["Fushimi Inari", "Kiyomizu Temple"]
  mentioned_types TEXT[], -- ["restaurant", "hotel", "attraction"]
  
  -- Analysis
  sentiment_score DECIMAL(3, 2), -- -1.00 to +1.00
  sentiment_label VARCHAR(20), -- 'positive', 'neutral', 'negative'
  is_recommendation BOOLEAN DEFAULT FALSE,
  is_complaint BOOLEAN DEFAULT FALSE,
  
  -- User classification
  user_type VARCHAR(20), -- 'local', 'tourist', 'influencer', 'unknown'
  user_follower_count INTEGER,
  user_verification_status BOOLEAN,
  
  -- Engagement metrics
  likes_count INTEGER DEFAULT 0,
  retweets_count INTEGER DEFAULT 0,
  replies_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5, 2), -- Percentage
  
  -- Processing metadata
  processed_at TIMESTAMP DEFAULT NOW(),
  enrichment_version VARCHAR(20),
  
  -- Indexes
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_mentions_posted_at ON social_mentions(posted_at DESC);
CREATE INDEX idx_mentions_location ON social_mentions USING GIST(location);
CREATE INDEX idx_mentions_city ON social_mentions(city, posted_at DESC);
CREATE INDEX idx_mentions_entities ON social_mentions USING GIN(mentioned_places);
CREATE INDEX idx_mentions_sentiment ON social_mentions(sentiment_label, posted_at DESC);
CREATE INDEX idx_mentions_user_type ON social_mentions(user_type, city);

-- Partitioning by month for performance
CREATE TABLE social_mentions_2026_01 PARTITION OF social_mentions
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
-- Create partitions for each month

-- ============================================
-- LIVE SCORES (Aggregated real-time ratings)
-- ============================================
CREATE TABLE live_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Entity identification
  entity_type VARCHAR(50) NOT NULL, -- 'restaurant', 'hotel', 'attraction', 'tour'
  entity_name VARCHAR(255) NOT NULL,
  entity_id VARCHAR(255), -- Link to our places database if exists
  
  -- Location
  city VARCHAR(100) NOT NULL,
  neighborhood VARCHAR(255),
  location GEOGRAPHY(POINT, 4326),
  
  -- Time windows
  window_period VARCHAR(20) NOT NULL, -- '24h', '7d', '30d'
  
  -- Metrics
  mention_count INTEGER DEFAULT 0,
  unique_users_count INTEGER DEFAULT 0,
  
  -- Sentiment
  avg_sentiment DECIMAL(3, 2), -- -1.00 to +1.00
  positive_count INTEGER DEFAULT 0,
  neutral_count INTEGER DEFAULT 0,
  negative_count INTEGER DEFAULT 0,
  sentiment_trend VARCHAR(10), -- 'up', 'down', 'stable'
  
  -- LiveScore calculation
  live_score DECIMAL(3, 2), -- 1.00 to 5.00 (star rating equivalent)
  score_change_24h DECIMAL(3, 2), -- Change from 24h ago
  score_change_7d DECIMAL(3, 2), -- Change from 7d ago
  
  -- Comparison to baseline
  traditional_rating DECIMAL(3, 2), -- From Google/TripAdvisor if available
  traditional_review_count INTEGER,
  rating_divergence DECIMAL(3, 2), -- LiveScore - Traditional
  
  -- Trending
  is_trending BOOLEAN DEFAULT FALSE,
  trend_velocity INTEGER, -- Rate of mention increase
  
  -- Most mentioned aspects
  top_positive_keywords TEXT[], -- ["amazing omakase", "worth the wait"]
  top_negative_keywords TEXT[], -- ["too crowded", "overpriced"]
  
  -- Temporal
  calculated_at TIMESTAMP DEFAULT NOW(),
  valid_until TIMESTAMP,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(entity_name, city, window_period)
);

CREATE INDEX idx_livescores_city ON live_scores(city, live_score DESC);
CREATE INDEX idx_livescores_trending ON live_scores(is_trending, city);
CREATE INDEX idx_livescores_entity ON live_scores(entity_type, city);
CREATE INDEX idx_livescores_valid ON live_scores(valid_until);

-- ============================================
-- CROWD FORECASTS (Predicted crowd levels)
-- ============================================
CREATE TABLE crowd_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Location
  place_name VARCHAR(255) NOT NULL,
  place_id VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  location GEOGRAPHY(POINT, 4326),
  
  -- Forecast period
  forecast_date DATE NOT NULL,
  hour_of_day INTEGER NOT NULL, -- 0-23
  
  -- Crowd prediction
  crowd_level_percent INTEGER, -- 0-100
  crowd_level_label VARCHAR(20), -- 'quiet', 'moderate', 'busy', 'packed'
  confidence_score DECIMAL(3, 2), -- 0.00 to 1.00
  
  -- Based on
  historical_data_points INTEGER, -- How many past observations
  similar_conditions TEXT[], -- ["saturday", "cherry_blossom_season", "sunny"]
  
  -- Context factors
  weather_forecast VARCHAR(50),
  special_events TEXT[], -- ["festival", "holiday"]
  tour_bus_schedule BOOLEAN,
  
  -- Recommendations
  optimal_visit_window BOOLEAN DEFAULT FALSE,
  avoid_window BOOLEAN DEFAULT FALSE,
  
  -- Actual data (filled in after the fact)
  actual_crowd_level INTEGER,
  forecast_accuracy DECIMAL(3, 2),
  
  -- Metadata
  generated_at TIMESTAMP DEFAULT NOW(),
  model_version VARCHAR(20),
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(place_name, city, forecast_date, hour_of_day)
);

CREATE INDEX idx_forecasts_place_date ON crowd_forecasts(place_name, forecast_date, hour_of_day);
CREATE INDEX idx_forecasts_city_date ON crowd_forecasts(city, forecast_date);
CREATE INDEX idx_forecasts_optimal ON crowd_forecasts(optimal_visit_window, city);

-- ============================================
-- TRUTH CHECKS (Cached verification results)
-- ============================================
CREATE TABLE truth_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Query
  query_text TEXT NOT NULL,
  query_normalized TEXT NOT NULL, -- Lowercase, cleaned
  query_hash VARCHAR(64) UNIQUE NOT NULL, -- MD5 of normalized query
  
  -- Subject
  subject_type VARCHAR(50), -- 'place', 'experience', 'claim'
  subject_name VARCHAR(255),
  city VARCHAR(100),
  
  -- Analysis window
  analysis_start_date DATE,
  analysis_end_date DATE,
  posts_analyzed INTEGER,
  
  -- Results
  worth_it_percent INTEGER, -- 0-100
  meh_percent INTEGER,
  avoid_percent INTEGER,
  
  overall_verdict VARCHAR(20), -- 'highly_recommended', 'recommended', 'mixed', 'skip'
  
  -- Detailed insights
  positive_mentions JSONB, -- [{"text": "...", "count": 5}]
  negative_mentions JSONB,
  crowdsourced_tips JSONB, -- [{"tip": "visit at 6am", "mentions": 23}]
  
  -- Photo vs Reality
  instagram_posts_count INTEGER,
  reality_score INTEGER, -- 1-10
  expectation_gap INTEGER, -- Positive or negative
  
  -- Evidence
  supporting_post_ids TEXT[],
  
  -- Cache metadata
  cache_ttl INTEGER DEFAULT 3600, -- 1 hour default
  hit_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  last_accessed TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_truth_checks_hash ON truth_checks(query_hash);
CREATE INDEX idx_truth_checks_subject ON truth_checks(subject_name, city);
CREATE INDEX idx_truth_checks_expires ON truth_checks(expires_at);

-- ============================================
-- EMERGING TRENDS (Rising experiences)
-- ============================================
CREATE TABLE emerging_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Trend identification
  trend_type VARCHAR(50), -- 'place', 'activity', 'food', 'neighborhood'
  trend_name VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  
  -- Metrics
  baseline_mentions_per_week INTEGER, -- Historical average
  current_mentions_per_week INTEGER,
  growth_rate_percent INTEGER, -- (current - baseline) / baseline * 100
  
  velocity_score INTEGER, -- 0-1000 (rate of acceleration)
  
  -- Status
  trend_status VARCHAR(20), -- 'emerging', 'viral', 'mainstream', 'declining'
  days_since_detected INTEGER,
  
  -- Trigger
  trigger_event VARCHAR(255), -- "Influencer @user posted", "Mentioned on news"
  trigger_post_id VARCHAR(255),
  
  -- Predictions
  predicted_peak_date DATE,
  predicted_mainstream_date DATE,
  recommendation VARCHAR(50), -- 'visit_now', 'visit_soon', 'wait', 'too_late'
  
  -- Supporting data
  mention_timeline JSONB, -- Daily mention counts
  sentiment_trajectory JSONB, -- Daily sentiment scores
  
  -- Metadata
  detected_at TIMESTAMP DEFAULT NOW(),
  last_updated TIMESTAMP DEFAULT NOW(),
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(trend_name, city)
);

CREATE INDEX idx_trends_city ON emerging_trends(city, velocity_score DESC);
CREATE INDEX idx_trends_status ON emerging_trends(trend_status, city);
CREATE INDEX idx_trends_detected ON emerging_trends(detected_at DESC);

-- ============================================
-- LOCAL VS TOURIST CONSENSUS
-- ============================================
CREATE TABLE consensus_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Location
  place_name VARCHAR(255),
  place_type VARCHAR(50), -- 'restaurant', 'attraction', 'neighborhood'
  city VARCHAR(100) NOT NULL,
  neighborhood VARCHAR(255),
  
  -- Local perspective
  local_mentions INTEGER DEFAULT 0,
  local_sentiment DECIMAL(3, 2),
  local_top_reasons TEXT[], -- ["authentic", "good value", "hidden gem"]
  local_recommendations TEXT[], -- Specific tips
  local_avoids TEXT[], -- What locals avoid
  
  -- Tourist perspective
  tourist_mentions INTEGER DEFAULT 0,
  tourist_sentiment DECIMAL(3, 2),
  tourist_top_reasons TEXT[], -- ["instagram worthy", "must see", "bucket list"]
  tourist_recommendations TEXT[],
  tourist_avoids TEXT[],
  
  -- Overlap analysis
  consensus_items TEXT[], -- Both groups agree on these
  divergence_score DECIMAL(3, 2), -- 0.00 (perfect agreement) to 1.00 (complete disagreement)
  
  -- Strategic recommendation
  hybrid_strategy TEXT, -- How to experience both perspectives
  optimal_timing_tourists VARCHAR(100),
  optimal_timing_locals VARCHAR(100),
  
  -- Data quality
  confidence_local DECIMAL(3, 2), -- Based on sample size
  confidence_tourist DECIMAL(3, 2),
  
  calculated_at TIMESTAMP DEFAULT NOW(),
  valid_until TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(place_name, city)
);

CREATE INDEX idx_consensus_city ON consensus_data(city, divergence_score DESC);
CREATE INDEX idx_consensus_place ON consensus_data(place_name, city);

-- ============================================
-- DECISION SCORES (Booking recommendations)
-- ============================================
CREATE TABLE decision_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Entity being evaluated
  entity_type VARCHAR(50), -- 'tour', 'restaurant', 'hotel', 'experience'
  entity_name VARCHAR(255) NOT NULL,
  entity_id VARCHAR(255),
  provider VARCHAR(100),
  city VARCHAR(100),
  
  -- Price context
  price_usd DECIMAL(10, 2),
  competitor_avg_price DECIMAL(10, 2),
  price_premium_percent INTEGER,
  
  -- Social proof
  social_mentions_30d INTEGER,
  positive_sentiment_percent INTEGER,
  negative_sentiment_percent INTEGER,
  
  -- Verification
  verified_real_travelers BOOLEAN,
  bot_detection_passed BOOLEAN,
  diverse_sources BOOLEAN,
  influencer_promotion_detected BOOLEAN,
  
  -- Standout mentions
  top_praise_quotes TEXT[],
  top_concern_quotes TEXT[],
  
  -- Comparative analysis
  similar_alternatives JSONB, -- [{name, price, score}]
  unique_value_proposition TEXT,
  
  -- Decision metrics
  satisfaction_probability INTEGER, -- 0-100
  value_score INTEGER, -- 0-100 (quality vs price)
  risk_level VARCHAR(20), -- 'low', 'medium', 'high'
  
  -- Recommendation
  recommendation VARCHAR(20), -- 'highly_recommend', 'recommend', 'neutral', 'caution', 'avoid'
  confidence_score DECIMAL(3, 2), -- 0.00 to 1.00
  reasoning TEXT,
  
  -- Target audience fit
  best_for TEXT[], -- ["foodies", "photographers", "budget travelers"]
  not_ideal_for TEXT[],
  
  calculated_at TIMESTAMP DEFAULT NOW(),
  valid_until TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(entity_name, entity_id, city)
);

CREATE INDEX idx_decisions_entity ON decision_scores(entity_name, city);
CREATE INDEX idx_decisions_recommendation ON decision_scores(recommendation, city);

-- ============================================
-- REAL-TIME ACTIVITY (Current location heat map)
-- ============================================
CREATE TABLE real_time_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Location
  place_name VARCHAR(255),
  place_id VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  neighborhood VARCHAR(255),
  location GEOGRAPHY(POINT, 4326),
  
  -- Time window (5-minute buckets)
  activity_timestamp TIMESTAMP NOT NULL,
  
  -- Activity metrics
  post_count INTEGER DEFAULT 0,
  unique_user_count INTEGER DEFAULT 0,
  avg_sentiment DECIMAL(3, 2),
  
  -- Crowd indicators
  crowd_level VARCHAR(20), -- 'quiet', 'moderate', 'busy', 'packed'
  crowd_change_trend VARCHAR(10), -- 'increasing', 'stable', 'decreasing'
  
  -- Context
  weather_condition VARCHAR(50),
  is_peak_hour BOOLEAN,
  special_event_ongoing BOOLEAN,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Hypertable for time-series (TimescaleDB)
SELECT create_hypertable('real_time_activity', 'activity_timestamp');

CREATE INDEX idx_activity_city_time ON real_time_activity(city, activity_timestamp DESC);
CREATE INDEX idx_activity_place ON real_time_activity(place_name, city);
CREATE INDEX idx_activity_location ON real_time_activity USING GIST(location);

-- Retention policy (keep only last 7 days for real-time)
SELECT add_retention_policy('real_time_activity', INTERVAL '7 days');

-- ============================================
-- USER QUERIES (Track what people search for)
-- ============================================
CREATE TABLE user_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID REFERENCES users(id),
  session_id VARCHAR(255),
  
  -- Query details
  query_text TEXT NOT NULL,
  query_type VARCHAR(50), -- 'truth_check', 'live_score', 'crowd_forecast', 'decision'
  
  -- Context
  city VARCHAR(100),
  entity_name VARCHAR(255),
  
  -- Response
  cache_hit BOOLEAN,
  response_time_ms INTEGER,
  
  -- User interaction
  was_helpful BOOLEAN,
  user_feedback TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_queries_user ON user_queries(user_id, created_at DESC);
CREATE INDEX idx_queries_type ON user_queries(query_type, created_at DESC);
CREATE INDEX idx_queries_entity ON user_queries(entity_name, city);
```

---

### 6. INDEXING STRATEGY

**PostgreSQL Indexes:**

```sql
-- Composite indexes for common queries
CREATE INDEX idx_mentions_city_sentiment_time 
  ON social_mentions(city, sentiment_label, posted_at DESC);

CREATE INDEX idx_mentions_entities_city_time
  ON social_mentions USING GIN(mentioned_places) 
  WHERE city IS NOT NULL;

CREATE INDEX idx_livescores_trending_city
  ON live_scores(city, is_trending, live_score DESC)
  WHERE is_trending = true;

-- Partial indexes for active data
CREATE INDEX idx_forecasts_future
  ON crowd_forecasts(place_name, forecast_date, hour_of_day)
  WHERE forecast_date >= CURRENT_DATE;

CREATE INDEX idx_truth_checks_valid
  ON truth_checks(query_hash)
  WHERE expires_at > NOW();

-- Covering indexes (include frequently accessed columns)
CREATE INDEX idx_mentions_analysis
  ON social_mentions(city, posted_at DESC)
  INCLUDE (sentiment_score, user_type, mentioned_places);
```

**Elasticsearch Mappings:**

```json
{
  "mappings": {
    "properties": {
      "content": {
        "type": "text",
        "analyzer": "standard",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "posted_at": { "type": "date" },
      "location": { "type": "geo_point" },
      "city": { 
        "type": "keyword",
        "fields": {
          "text": { "type": "text" }
        }
      },
      "sentiment_score": { "type": "float" },
      "mentioned_places": { 
        "type": "keyword",
        "fields": {
          "text": { "type": "text", "analyzer": "standard" }
        }
      },
      "user_type": { "type": "keyword" }
    }
  }
}
```

---

### 7. DATA RETENTION POLICIES

```sql
-- Retention strategy to manage storage costs

-- Raw social mentions: Keep 90 days full detail
CREATE OR REPLACE FUNCTION archive_old_mentions() 
RETURNS void AS $$
BEGIN
  -- Move to cold storage (S3)
  COPY (
    SELECT * FROM social_mentions 
    WHERE posted_at < NOW() - INTERVAL '90 days'
  ) TO PROGRAM 'aws s3 cp - s3://traveloure-archive/mentions/$(date +%Y-%m-%d).csv';
  
  -- Delete from hot storage
  DELETE FROM social_mentions 
  WHERE posted_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule daily at 2am
SELECT cron.schedule('archive-mentions', '0 2 * * *', 'SELECT archive_old_mentions()');

-- Live scores: Keep 30 days, aggregate older data
CREATE OR REPLACE FUNCTION aggregate_old_live_scores()
RETURNS void AS $$
BEGIN
  -- Create monthly aggregates
  INSERT INTO live_scores_monthly_archive
  SELECT 
    entity_name,
    city,
    DATE_TRUNC('month', calculated_at) as month,
    AVG(live_score) as avg_score,
    STDDEV(live_score) as score_volatility,
    COUNT(*) as data_points
  FROM live_scores
  WHERE calculated_at < NOW() - INTERVAL '30 days'
  GROUP BY entity_name, city, DATE_TRUNC('month', calculated_at);
  
  DELETE FROM live_scores
  WHERE calculated_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Crowd forecasts: Delete after date passes + 7 days
DELETE FROM crowd_forecasts
WHERE forecast_date < CURRENT_DATE - INTERVAL '7 days';

-- Truth checks: Auto-expire based on TTL
DELETE FROM truth_checks
WHERE expires_at < NOW();

-- Real-time activity: Keep only 7 days (handled by TimescaleDB retention policy)
SELECT add_retention_policy('real_time_activity', INTERVAL '7 days');
```

---

## PART III: BACKEND IMPLEMENTATION

### 8. LIVESCORE ENGINE

```typescript
// LiveScore Service - Real-time rating aggregation
// Location: /server/services/travelpulse/livescore.service.ts

import { grokClient } from '@/config/grok.config';
import { db } from '@/db';
import { socialMentions, liveScores } from '@/db/schema';
import { and, gte, eq, sql } from 'drizzle-orm';

export class LiveScoreService {
  /**
   * Calculate LiveScore for an entity (restaurant, hotel, attraction)
   */
  async calculateLiveScore(
    entityName: string,
    city: string,
    windowHours: number = 24
  ): Promise<LiveScore> {
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    
    // Get mentions from database (already ingested)
    const mentions = await db.query.socialMentions.findMany({
      where: and(
        sql`${socialMentions.mentioned_places} @> ARRAY[${entityName}]::text[]`,
        eq(socialMentions.city, city),
        gte(socialMentions.posted_at, windowStart)
      )
    });
    
    if (mentions.length === 0) {
      return this.getDefaultScore(entityName, city);
    }
    
    // Calculate metrics
    const sentimentCounts = {
      positive: mentions.filter(m => m.sentiment_label === 'positive').length,
      neutral: mentions.filter(m => m.sentiment_label === 'neutral').length,
      negative: mentions.filter(m => m.sentiment_label === 'negative').length
    };
    
    const avgSentiment = mentions.reduce((sum, m) => 
      sum + (m.sentiment_score || 0), 0
    ) / mentions.length;
    
    // Calculate LiveScore (1.0 to 5.0 scale)
    // Formula: base score + sentiment adjustment + volume boost
    const baseScore = 3.0;
    const sentimentAdjustment = avgSentiment * 1.5; // -1.5 to +1.5
    const volumeBoost = Math.min(mentions.length / 20, 0.5); // Max 0.5 boost
    
    const liveScore = Math.max(1.0, Math.min(5.0, 
      baseScore + sentimentAdjustment + volumeBoost
    ));
    
    // Compare to baseline (7 days ago)
    const baselineScore = await this.getBaselineScore(
      entityName, 
      city, 
      windowHours
    );
    const scoreChange24h = liveScore - baselineScore;
    
    // Detect trending
    const isTrending = this.detectTrending(mentions, baselineScore);
    const trendVelocity = this.calculateVelocity(mentions);
    
    // Extract keywords
    const keywords = await this.extractKeywords(mentions);
    
    // Save to database
    const scoreData = {
      entity_name: entityName,
      entity_type: this.detectEntityType(entityName, mentions),
      city,
      window_period: `${windowHours}h`,
      
      mention_count: mentions.length,
      unique_users_count: new Set(mentions.map(m => m.author_id)).size,
      
      avg_sentiment: avgSentiment,
      positive_count: sentimentCounts.positive,
      neutral_count: sentimentCounts.neutral,
      negative_count: sentimentCounts.negative,
      sentiment_trend: this.calculateTrend(mentions),
      
      live_score: liveScore,
      score_change_24h: scoreChange24h,
      
      is_trending: isTrending,
      trend_velocity: trendVelocity,
      
      top_positive_keywords: keywords.positive.slice(0, 5),
      top_negative_keywords: keywords.negative.slice(0, 5),
      
      calculated_at: new Date(),
      valid_until: new Date(Date.now() + 15 * 60 * 1000) // Valid 15 min
    };
    
    await db.insert(liveScores)
      .values(scoreData)
      .onConflictDoUpdate({
        target: [liveScores.entity_name, liveScores.city, liveScores.window_period],
        set: scoreData
      });
    
    // Broadcast update via WebSocket
    await this.broadcastScoreUpdate(scoreData);
    
    return scoreData;
  }
  
  /**
   * Get historical baseline for comparison
   */
  private async getBaselineScore(
    entityName: string,
    city: string,
    windowHours: number
  ): Promise<number> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoEnd = new Date(weekAgo.getTime() + windowHours * 60 * 60 * 1000);
    
    const baselineMentions = await db.query.socialMentions.findMany({
      where: and(
        sql`${socialMentions.mentioned_places} @> ARRAY[${entityName}]::text[]`,
        eq(socialMentions.city, city),
        gte(socialMentions.posted_at, weekAgo),
        sql`${socialMentions.posted_at} < ${weekAgoEnd}`
      )
    });
    
    if (baselineMentions.length === 0) return 3.0;
    
    const avgSentiment = baselineMentions.reduce((sum, m) => 
      sum + (m.sentiment_score || 0), 0
    ) / baselineMentions.length;
    
    return 3.0 + (avgSentiment * 1.5);
  }
  
  /**
   * Detect if entity is trending
   */
  private detectTrending(
    mentions: any[],
    baselineScore: number
  ): boolean {
    if (mentions.length < 10) return false; // Need minimum volume
    
    // Check mention velocity (last 6h vs previous 6h)
    const now = Date.now();
    const sixHoursAgo = now - 6 * 60 * 60 * 1000;
    const twelveHoursAgo = now - 12 * 60 * 60 * 1000;
    
    const recentMentions = mentions.filter(m => 
      m.posted_at.getTime() > sixHoursAgo
    ).length;
    
    const previousMentions = mentions.filter(m => 
      m.posted_at.getTime() > twelveHoursAgo && 
      m.posted_at.getTime() <= sixHoursAgo
    ).length;
    
    // Trending if 2x+ increase and positive sentiment
    const velocityIncrease = previousMentions > 0 
      ? recentMentions / previousMentions 
      : recentMentions;
    
    const avgSentiment = mentions.reduce((sum, m) => 
      sum + (m.sentiment_score || 0), 0
    ) / mentions.length;
    
    return velocityIncrease >= 2.0 && avgSentiment > 0.3;
  }
  
  /**
   * Calculate trend velocity score
   */
  private calculateVelocity(mentions: any[]): number {
    // Group by hour
    const hourCounts = new Map<number, number>();
    const now = Date.now();
    
    mentions.forEach(m => {
      const hoursAgo = Math.floor((now - m.posted_at.getTime()) / (60 * 60 * 1000));
      hourCounts.set(hoursAgo, (hourCounts.get(hoursAgo) || 0) + 1);
    });
    
    // Calculate acceleration (are mentions increasing?)
    const hours = Array.from(hourCounts.keys()).sort((a, b) => a - b);
    if (hours.length < 3) return 0;
    
    const recent = hours.slice(0, Math.ceil(hours.length / 2));
    const older = hours.slice(Math.ceil(hours.length / 2));
    
    const recentAvg = recent.reduce((sum, h) => sum + (hourCounts.get(h) || 0), 0) / recent.length;
    const olderAvg = older.reduce((sum, h) => sum + (hourCounts.get(h) || 0), 0) / older.length;
    
    if (olderAvg === 0) return recentAvg * 10;
    
    return Math.round((recentAvg / olderAvg - 1) * 100);
  }
  
  /**
   * Extract top keywords from mentions
   */
  private async extractKeywords(mentions: any[]): Promise<{
    positive: string[];
    negative: string[];
  }> {
    const positiveMentions = mentions.filter(m => m.sentiment_label === 'positive');
    const negativeMentions = mentions.filter(m => m.sentiment_label === 'negative');
    
    // Use Grok to extract key phrases
    const chat = grokClient.chat.create({
      model: 'grok-4-1-fast'
    });
    
    chat.append({
      role: 'system',
      content: `Extract the most commonly mentioned positive and negative aspects.
      Return JSON: { "positive": ["phrase1", "phrase2"], "negative": ["phrase1"] }`
    });
    
    chat.append({
      role: 'user',
      content: `
        Positive mentions (${positiveMentions.length}):
        ${positiveMentions.slice(0, 20).map(m => m.content).join('\n')}
        
        Negative mentions (${negativeMentions.length}):
        ${negativeMentions.slice(0, 20).map(m => m.content).join('\n')}
      `
    });
    
    const response = await chat.sample();
    const result = JSON.parse(
      response.content.find(c => c.type === 'text')?.text || '{"positive":[],"negative":[]}'
    );
    
    return result;
  }
  
  /**
   * Broadcast score update to connected clients
   */
  private async broadcastScoreUpdate(score: any) {
    // Emit via Socket.io
    global.io?.to(`city:${score.city}`).emit('livescore:update', {
      entity_name: score.entity_name,
      live_score: score.live_score,
      score_change: score.score_change_24h,
      is_trending: score.is_trending
    });
  }
  
  /**
   * Batch calculate scores for entire city
   */
  async calculateCityScores(city: string): Promise<void> {
    // Get all unique entities mentioned in last 24h
    const entities = await db.execute(sql`
      SELECT DISTINCT UNNEST(mentioned_places) as entity_name
      FROM social_mentions
      WHERE city = ${city}
        AND posted_at > NOW() - INTERVAL '24 hours'
        AND array_length(mentioned_places, 1) > 0
    `);
    
    // Calculate scores in parallel (batch of 10 at a time)
    const batchSize = 10;
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);
      await Promise.all(
        batch.map(e => this.calculateLiveScore(e.entity_name, city))
      );
    }
  }
  
  /**
   * Get current LiveScore for display
   */
  async getLiveScore(
    entityName: string,
    city: string
  ): Promise<LiveScore | null> {
    // Check cache first
    const cached = await db.query.liveScores.findFirst({
      where: and(
        eq(liveScores.entity_name, entityName),
        eq(liveScores.city, city),
        eq(liveScores.window_period, '24h'),
        sql`${liveScores.valid_until} > NOW()`
      )
    });
    
    if (cached) return cached;
    
    // Calculate fresh if not cached
    return await this.calculateLiveScore(entityName, city);
  }
}

// Types
interface LiveScore {
  entity_name: string;
  entity_type: string;
  city: string;
  live_score: number;
  score_change_24h: number;
  mention_count: number;
  sentiment_trend: string;
  is_trending: boolean;
  trend_velocity: number;
  top_positive_keywords: string[];
  top_negative_keywords: string[];
  calculated_at: Date;
}
```

---

### 9. TRUTH VERIFICATION SYSTEM

```typescript
// Truth Verification Service
// Location: /server/services/travelpulse/truth-verification.service.ts

import { grokClient } from '@/config/grok.config';
import { db } from '@/db';
import { truthChecks } from '@/db/schema';
import { web_search, x_search } from 'xai-sdk/tools';
import crypto from 'crypto';

export class TruthVerificationService {
  /**
   * Verify a travel claim or question
   */
  async verifyTruth(
    query: string,
    city?: string,
    userId?: string
  ): Promise<TruthCheckResult> {
    // Normalize and hash query for caching
    const normalized = this.normalizeQuery(query);
    const queryHash = crypto.createHash('md5').update(normalized).digest('hex');
    
    // Check cache
    const cached = await db.query.truthChecks.findFirst({
      where: and(
        eq(truthChecks.query_hash, queryHash),
        sql`${truthChecks.expires_at} > NOW()`
      )
    });
    
    if (cached) {
      // Update hit count and access time
      await db.update(truthChecks)
        .set({
          hit_count: cached.hit_count + 1,
          last_accessed: new Date()
        })
        .where(eq(truthChecks.id, cached.id));
      
      return this.formatResult(cached);
    }
    
    // Perform fresh analysis
    const result = await this.performTruthAnalysis(query, city);
    
    // Cache result
    await db.insert(truthChecks).values({
      query_text: query,
      query_normalized: normalized,
      query_hash: queryHash,
      subject_name: result.subject_name,
      city: result.city,
      ...result,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    });
    
    // Log query for analytics
    if (userId) {
      await this.logUserQuery(userId, query, 'truth_check', result);
    }
    
    return result;
  }
  
  /**
   * Perform fresh truth analysis using Grok
   */
  private async performTruthAnalysis(
    query: string,
    city?: string
  ): Promise<TruthCheckResult> {
    const chat = grokClient.chat.create({
      model: 'grok-4-1-fast',
      tools: [
        x_search({
          dateRange: {
            start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            end: new Date()
          }
        }),
        web_search()
      ]
    });
    
    chat.append({
      role: 'system',
      content: `You are a travel truth verification assistant.
      
      Your task:
      1. Search X (Twitter) for recent mentions about the query
      2. Analyze sentiment and extract insights
      3. Calculate "worth it" percentages based on traveler feedback
      4. Extract crowdsourced tips and warnings
      5. Compare Instagram/social media hype to reality
      
      Output strict JSON format:
      {
        "subject_name": "Place/Experience name",
        "city": "City",
        "posts_analyzed": 0,
        "analysis_start_date": "YYYY-MM-DD",
        "analysis_end_date": "YYYY-MM-DD",
        
        "worth_it_percent": 0-100,
        "meh_percent": 0-100,
        "avoid_percent": 0-100,
        
        "overall_verdict": "highly_recommended|recommended|mixed|skip",
        
        "positive_mentions": [
          {"text": "specific positive", "count": 5}
        ],
        "negative_mentions": [
          {"text": "specific complaint", "count": 2}
        ],
        "crowdsourced_tips": [
          {"tip": "Visit at 6am", "mentions": 23, "context": "avoid crowds"}
        ],
        
        "instagram_posts_count": 0,
        "reality_score": 1-10,
        "expectation_gap": -5 to +5,
        "reality_explanation": "...",
        
        "supporting_post_ids": ["post_id_1", "post_id_2"]
      }`
    });
    
    const cityContext = city ? ` in ${city}` : '';
    chat.append({
      role: 'user',
      content: `
        Verify this travel query${cityContext}: "${query}"
        
        Search X for recent mentions from actual travelers (not promotional accounts).
        Analyze at least 50 posts if available.
        Focus on authentic experiences, not marketing.
      `
    });
    
    const response = await chat.sample();
    const analysis = JSON.parse(
      response.content.find(c => c.type === 'text')?.text || '{}'
    );
    
    return analysis;
  }
  
  /**
   * Normalize query for consistent caching
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');
  }
  
  /**
   * Format result for client
   */
  private formatResult(cached: any): TruthCheckResult {
    return {
      subject_name: cached.subject_name,
      city: cached.city,
      posts_analyzed: cached.posts_analyzed,
      
      worth_it_percent: cached.worth_it_percent,
      meh_percent: cached.meh_percent,
      avoid_percent: cached.avoid_percent,
      
      overall_verdict: cached.overall_verdict,
      
      positive_mentions: cached.positive_mentions,
      negative_mentions: cached.negative_mentions,
      crowdsourced_tips: cached.crowdsourced_tips,
      
      instagram_posts_count: cached.instagram_posts_count,
      reality_score: cached.reality_score,
      expectation_gap: cached.expectation_gap,
      
      from_cache: true,
      last_updated: cached.calculated_at
    };
  }
}

// Types
interface TruthCheckResult {
  subject_name: string;
  city: string;
  posts_analyzed: number;
  
  worth_it_percent: number;
  meh_percent: number;
  avoid_percent: number;
  
  overall_verdict: 'highly_recommended' | 'recommended' | 'mixed' | 'skip';
  
  positive_mentions: Array<{ text: string; count: number }>;
  negative_mentions: Array<{ text: string; count: number }>;
  crowdsourced_tips: Array<{ tip: string; mentions: number; context: string }>;
  
  instagram_posts_count: number;
  reality_score: number; // 1-10
  expectation_gap: number; // -5 to +5
  
  from_cache?: boolean;
  last_updated?: Date;
}
```

---

*[This is Part 1 of the implementation. Due to length, I'll continue with the remaining services in the next file...]*

Would you like me to continue with:
- Emerging Experience Detector
- Crowd Prediction Engine
- Decision Analysis Engine
- Real-time Processing Pipeline
- Frontend Components
- Complete API Endpoints
- Deployment Specifications

Or would you prefer I focus on specific sections first?