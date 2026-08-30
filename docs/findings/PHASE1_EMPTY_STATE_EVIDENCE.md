# Phase 1 empty-state verification (API evidence)

Captured 2026-08-17 signed in as expert@traveloure-test.com (local_expert), post-#500 restart.
UI screenshots aren't capturable headlessly for authenticated pages; the API responses below are what the Performance/Market pages render from.

## /api/expert/analytics/dashboard (funnel + benchmarks + CLV)
```json
{
    "expertProfile": {
        "selectedServices": [],
        "specializations": [],
        "destinations": [
            "Tokyo",
            "Paris"
        ],
        "city": "Tokyo",
        "country": "Japan"
    },
    "serviceAlignment": [],
    "summary": {
        "totalRevenue": 0,
        "totalBookings": 1,
        "avgRating": 0,
        "activeServices": 4,
        "publishedTemplates": 0,
        "templateRevenue": 0,
        "pendingBookings": 0,
        "completedBookings": 0
    },
    "keyMetrics": {
        "conversionRate": {
            "value": "0%",
            "status": "no_data"
        },
        "avgRating": {
            "value": "0.0",
            "status": "no_data"
        },
        "avgBookingValue": {
            "value": "$0",
            "status": "no_benchmark"
        }
    },
    "conversionFunnel": [
        {
            "stage": "Inquiries",
            "count": 1,
            "percent": 100
        },
        {
            "stage": "Booked",
            "count": 0,
            "percent": 0
        },
        {
            "stage": "Completed",
            "count": 0,
            "percent": 0
        }
    ],
    "revenueByService": [],
    "clientLifetimeValue": {
        "status": "no_data"
    },
    "earnings": []
}
```

## /api/expert/market-intelligence (seasonal + trending)
```json
{
    "expertMarkets": {
        "destinations": [
            "Tokyo",
            "Paris"
        ],
        "city": "Tokyo",
        "country": "Japan"
    },
    "trending": [
        {
            "destination": "Yanaka Neighborhood",
            "score": 620,
            "reason": "Influencer photo series on Instagram showcasing vintage shops",
            "category": "neighborhood"
        },
        {
            "destination": "Kagurazaka Ishikawa",
            "score": 780,
            "reason": "Featured in a viral TikTok video by a food critic",
            "category": "restaurant"
        },
        {
            "destination": "TeamLab Borderless Reopening",
            "score": 910,
            "reason": "News of reopening at new Azabudai Hills location in early 2024",
            "category": "attraction"
        },
        {
            "destination": "Shimokitazawa",
            "score": 720,
            "reason": "Influencer vlogs highlighting vintage shopping",
            "category": "neighborhood"
        },
        {
            "destination": "Kagurazaka Ishikawa",
            "score": 650,
            "reason": "Recent Michelin star renewal buzz",
            "category": "restaurant"
        },
        {
            "destination": "Yanaka Ginza",
            "score": 580,
            "reason": "Travel blogs praising old Tokyo charm",
            "category": "neighborhood"
        },
        {
            "destination": "TeamLab Borderless",
            "score": 850,
            "reason": "Reopening buzz after temporary closure",
            "category": "attraction"
        },
        {
            "destination": "Omoide Yokocho",
            "score": 700,
            "reason": "Social media posts about nostalgic dining",
            "category": "attraction"
        },
        {
            "destination": "Nezu Museum Garden",
            "score": 550,
            "reason": "Seasonal posts about autumn foliage",
            "category": "attraction"
        },
        {
            "destination": "Yanaka Neighborhood",
            "score": 620,
            "reason": "Influencer posts about 'old Tokyo' charm",
            "category": "neighborhood"
        }
    ],
    "cities": [
        {
            "name": "Paris",
            "country": "France",
            "bestTimeToVisit": "April-June and September-October for mild weather and fewer crowds",
            "summary": [
                "Greet with 'Bonjour' before any request",
                "Validate metro tickets before boarding",
                "Book timed entries for major museums"
```
