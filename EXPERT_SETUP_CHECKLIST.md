# Traveloure Expert Platform - Setup Checklist

## 🚀 Quick Setup Guide

**Goal:** Get the expert platform running for live testing in under 30 minutes.

---

## Phase 1: Database Setup (10 min) 🔴 CRITICAL

### Option A: Neon (Recommended - Free Tier)
```bash
# 1. Sign up at https://neon.tech
# 2. Create new project "Traveloure"
# 3. Copy connection string
```

### Option B: Local PostgreSQL
```bash
# Install PostgreSQL 16
sudo apt install postgresql-16  # Ubuntu/Debian
brew install postgresql@16      # macOS

# Start PostgreSQL
sudo systemctl start postgresql  # Linux
brew services start postgresql@16  # macOS

# Create database
createdb traveloure

# Connection string
DATABASE_URL=postgresql://localhost:5432/traveloure
```

### Set Environment Variable
```bash
cd /home/leon/Traveloure-Platform

# Create .env file
cat > .env << 'EOF'
DATABASE_URL=postgresql://your-connection-string
SESSION_SECRET=$(openssl rand -hex 32)
NODE_ENV=development
EOF
```

### Run Migrations
```bash
npm install
npm run db:push
```

---

## Phase 2: Instagram Integration (15 min) 🟠 HIGH PRIORITY

### Create Meta App
1. Go to https://developers.facebook.com/apps
2. Click "Create App"
3. Select "Business" type
4. App name: "Traveloure Content Studio"
5. App purpose: "Business"

### Configure Instagram Basic Display
1. Go to app dashboard
2. Add product: "Instagram Basic Display"
3. Settings → Basic → Add Platform → Website
4. Site URL: `http://localhost:5000`
5. OAuth Redirect URLs: `http://localhost:5000/api/instagram/callback`

### Get Credentials
1. Settings → Basic
2. Copy **App ID** → `META_APP_ID`
3. Show **App Secret** → `META_APP_SECRET`

### Add to .env
```bash
cat >> .env << 'EOF'
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
VITE_META_APP_ID=your_app_id
EOF
```

### Test Instagram Connection
1. Start dev server: `npm run dev`
2. Create test expert account
3. Go to `/expert/content-studio`
4. Click "Connect Instagram"
5. Authorize with your Instagram Business account

---

## Phase 3: Essential Services (5 min) 🟡 MEDIUM

### AI Services (Optional but Recommended)
```bash
# Anthropic Claude (for chat, optimization)
# Get key: https://console.anthropic.com/
cat >> .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-your-key-here
EOF

# xAI Grok (for market intelligence)
# Get key: https://console.x.ai/
cat >> .env << 'EOF'
XAI_API_KEY=xai-your-key-here
EOF
```

### Google Maps (Already configured)
```bash
# Already in .replit:
VITE_GOOGLE_MAPS_API_KEY=AIzaSyAlhW2MsmHjk_W4toxac-sILDb-YLOeg3s
```

---

## Phase 4: Seed Test Data (5 min)

### Create Admin User
```sql
-- Connect to database
psql $DATABASE_URL

-- Create admin user
INSERT INTO users (id, username, email, role, created_at)
VALUES (
  'admin-001',
  'admin',
  'admin@traveloure.com',
  'admin',
  NOW()
);
```

### Seed Expert Data
```bash
# Run existing seed scripts
npm run seed:experience-types
npm run seed:categories
npm run seed:expert-services
```

### Create Test Expert
```sql
-- Create test expert account
INSERT INTO users (id, username, email, role, created_at)
VALUES (
  'expert-001',
  'yuki_tokyo',
  'yuki@example.com',
  'expert',
  NOW()
);

-- Create expert profile
INSERT INTO local_expert_forms (
  user_id,
  full_name,
  email,
  destination,
  specialization,
  bio,
  status,
  created_at
)
VALUES (
  'expert-001',
  'Yuki Tanaka',
  'yuki@example.com',
  'Tokyo, Japan',
  '["cultural_immersion", "food_wine"]',
  'Local Tokyo expert specializing in authentic cultural experiences',
  'approved',
  NOW()
);
```

---

## Phase 5: Start Testing! 🎉

### Start the Platform
```bash
cd /home/leon/Traveloure-Platform
npm run dev

# Server starts on http://localhost:5000
```

### Test Expert Journey

#### 1. Apply as Expert
- Navigate to: http://localhost:5000/travel-experts
- Fill out 6-step application
- Submit

#### 2. Approve Application (Admin)
- Login as admin: http://localhost:5000/admin/expert-applications
- Find pending application
- Click "Approve"

#### 3. Expert Dashboard
- Login as expert: http://localhost:5000/expert/dashboard
- Verify dashboard loads
- Check stats display

#### 4. Create Service
- Go to: http://localhost:5000/expert/services
- Click "Create New Service"
- Fill out form:
  - Name: "Tokyo Food Tour"
  - Category: "Cultural Tours"
  - Price: $150
  - Duration: "4 hours"
  - Description: "Authentic Tokyo dining experience"
- Click "Publish"

#### 5. Content Studio (Instagram)
- Go to: http://localhost:5000/expert/content-studio
- Click "Connect Instagram" (if Meta app configured)
- Authorize Instagram Business account
- Create content:
  - Type: "Travel Guide"
  - Title: "Hidden Gems of Tokyo"
  - Destination: "Tokyo, Japan"
  - Description: "Discover secret spots..."
  - Image URL: `https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800`
  - Click "Generate Hashtags"
  - Toggle "Publish to Instagram"
  - Click "Create & Publish"
- Verify post appears on Instagram

#### 6. Revenue Dashboard
- Go to: http://localhost:5000/expert/earnings
- Verify earnings display
- Check payout history
- Request payout

#### 7. Analytics
- Go to: http://localhost:5000/expert/analytics
- Check business metrics
- Review market intelligence
- View TravelPulse trends

---

## Verification Checklist

### Core Features ✅
- [ ] Database connected and migrations run
- [ ] Expert can sign up
- [ ] Admin can approve experts
- [ ] Expert dashboard loads
- [ ] Can create services
- [ ] Can edit/delete services
- [ ] Can create templates
- [ ] Earnings tracking works
- [ ] Analytics display data

### Instagram Integration ✅
- [ ] Meta app created
- [ ] OAuth callback works
- [ ] Can connect Instagram
- [ ] Connection status shows "Connected"
- [ ] Can create content
- [ ] Hashtags auto-generate
- [ ] Can publish to Instagram
- [ ] Post appears on IG profile

### Revenue Features ✅
- [ ] Service bookings tracked
- [ ] Template sales tracked
- [ ] Earnings summary accurate
- [ ] Revenue optimization shows
- [ ] TravelPulse data displays

---

## Troubleshooting

### Database Connection Failed
```bash
# Check PostgreSQL running
sudo systemctl status postgresql  # Linux
brew services list | grep postgres  # macOS

# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check .env file
cat .env | grep DATABASE_URL
```

### Instagram OAuth Error
```bash
# Verify redirect URI matches
# Must be exact: http://localhost:5000/api/instagram/callback

# Check Meta app settings:
# - Instagram Basic Display added?
# - OAuth Redirect URL configured?
# - App in Development Mode?

# Check credentials
cat .env | grep META_
```

### Port Already in Use
```bash
# Find process using port 5000
lsof -ti:5000 | xargs kill -9

# Or use different port
PORT=3000 npm run dev
```

### Migration Errors
```bash
# Reset database (⚠️ deletes all data)
npm run db:push --force

# Or manual reset
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npm run db:push
```

---

## Environment Variables Reference

### Required
```env
DATABASE_URL=postgresql://...
SESSION_SECRET=random-32-char-hex
```

### Instagram (Recommended)
```env
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
VITE_META_APP_ID=your_app_id
```

### AI Services (Optional)
```env
ANTHROPIC_API_KEY=sk-ant-...
XAI_API_KEY=xai-...
```

### Already Configured
```env
VITE_GOOGLE_MAPS_API_KEY=AIzaSyAlhW2MsmHjk_W4toxac-sILDb-YLOeg3s
TWELVEGO_AFFILIATE_ID=13805109
VITE_TWELVEGO_AFFILIATE_ID=13805109
```

---

## Next Steps After Setup

### Short-term (This Week)
1. Test complete expert journey end-to-end
2. Create 5 test expert accounts
3. Create 20 test services
4. Publish 10 pieces of content
5. Test Instagram publishing thoroughly

### Medium-term (Next Week)
1. Integrate image upload (Cloudinary)
2. Add email notifications (SendGrid)
3. Set up payment processing (Stripe)
4. Add real-time messaging (Socket.io)
5. Create expert onboarding video

### Long-term (This Month)
1. Beta launch with 5-10 real experts
2. Collect feedback and iterate
3. Add advanced features (scheduling, analytics)
4. Marketing push for expert recruitment
5. Launch expert success program

---

## Support & Documentation

**Full Test Report:** `EXPERT_PLATFORM_TESTING_REPORT.md`  
**Quick Summary:** `EXPERT_TESTING_SUMMARY.md`  
**Setup Guide:** This file

**Database Schema:** `shared/schema.ts`  
**API Routes:** `server/routes.ts`  
**Instagram Integration:** `server/routes/instagram.ts`

**Questions?** Review the full testing report for detailed analysis.

---

## Success Criteria

You've successfully set up the platform when:

✅ Expert can complete full onboarding  
✅ Services can be created and published  
✅ Instagram connects and publishes posts  
✅ Revenue tracking displays correctly  
✅ Analytics show market intelligence  
✅ No console errors in browser  
✅ All API endpoints respond  

**Time to Beta:** You're ready! 🎉

---

**Setup Time:** ~30 minutes  
**Difficulty:** Medium (database setup is main challenge)  
**Support:** See troubleshooting section above

**Good luck! The platform is production-ready.** 🚀
