#!/bin/bash

# Traveloure Platform - Route Testing Script
# This script tests all newly created routes and endpoints

echo "🧪 Traveloure Platform - Route Testing Script"
echo "=============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:5000"
API_URL="$BASE_URL/api"

# Counter for tests
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to test a route
test_route() {
    local route=$1
    local name=$2
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo -n "Testing $name ($route)... "
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$route" 2>/dev/null)
    
    if [ "$response" = "200" ] || [ "$response" = "302" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $response)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $response)"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# Function to test an API endpoint
test_api() {
    local endpoint=$1
    local name=$2
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo -n "Testing $name ($endpoint)... "
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL$endpoint" 2>/dev/null)
    
    if [ "$response" = "200" ] || [ "$response" = "401" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $response)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $response)"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

echo "📄 Testing New Pages"
echo "--------------------"
test_route "/careers" "Careers Page"
test_route "/blog" "Blog Page"
test_route "/press" "Press Page"
test_route "/help" "Help Center"
test_route "/support" "Support Page (alias)"
echo ""

echo "👥 Testing Expert Routes"
echo "------------------------"
test_route "/experts" "Experts List"
test_api "/experts" "Experts API"
# Note: Expert detail pages require actual expert IDs
echo -e "${YELLOW}⚠ Expert detail page /experts/:id requires valid expert ID${NC}"
echo ""

echo "🔍 Testing Discovery & Filter"
echo "------------------------------"
test_route "/discover" "Discover Page"
test_api "/discover" "Discover API"
test_api "/discover?location=Paris" "Discover with Location Filter"
echo ""

echo "📋 Testing Footer Links"
echo "-----------------------"
test_route "/about" "About Page"
test_route "/contact" "Contact Page"
test_route "/privacy" "Privacy Policy"
test_route "/terms" "Terms of Service"
test_route "/faq" "FAQ Page"
test_route "/partner-with-us" "Partner With Us"
echo ""

echo "🔌 Testing Backend Endpoints"
echo "----------------------------"
test_api "/service-categories" "Service Categories"
test_api "/experience-types" "Experience Types"
# Note: These require authentication
echo -e "${YELLOW}⚠ Authenticated endpoints will return 401 (expected)${NC}"
echo ""

echo "=============================================="
echo "📊 Test Results Summary"
echo "=============================================="
echo -e "Total Tests:  $TOTAL_TESTS"
echo -e "${GREEN}Passed:       $PASSED_TESTS${NC}"
echo -e "${RED}Failed:       $FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Please check the routes.${NC}"
    exit 1
fi
