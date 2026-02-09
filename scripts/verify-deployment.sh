#!/bin/bash
# Verify deployment is live and serving expected content
# Usage: ./scripts/verify-deployment.sh https://your-app.vercel.app

DEPLOY_URL="${1:-https://poker-analyzer.vercel.app}"

echo "🔍 Verifying deployment at: $DEPLOY_URL"
echo ""

# Check if site is reachable
echo "1. Checking site reachability..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOY_URL")
if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Site returns HTTP 200"
else
    echo "   ❌ Site returned HTTP $HTTP_CODE"
    exit 1
fi

# Check for expected HTML content
echo "2. Checking for expected content..."
CONTENT=$(curl -s "$DEPLOY_URL")

if echo "$CONTENT" | grep -q "Poker Scenario Analyzer"; then
    echo "   ✅ Found 'Poker Scenario Analyzer' in page"
else
    echo "   ❌ Missing 'Poker Scenario Analyzer' in page"
    exit 1
fi

if echo "$CONTENT" | grep -q "data-manager.js"; then
    echo "   ✅ Found data-manager.js script reference"
else
    echo "   ⚠️  Missing data-manager.js reference (may be bundled)"
fi

# Check for Tier 1 data files
echo "3. Checking Tier 1 data availability..."
MANIFEST_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOY_URL/data/tier1/manifest.json")
if [ "$MANIFEST_CODE" = "200" ]; then
    echo "   ✅ Tier 1 manifest.json accessible"
else
    echo "   ⚠️  Tier 1 manifest.json returned HTTP $MANIFEST_CODE"
fi

# Check API health (if deployed)
echo "4. Checking API health..."
API_RESPONSE=$(curl -s "$DEPLOY_URL/api/health" 2>/dev/null)
if echo "$API_RESPONSE" | grep -q "ok"; then
    echo "   ✅ API health check passed"
else
    echo "   ℹ️  API not available (expected for static deployment)"
fi

echo ""
echo "✅ Deployment verification complete!"
echo "   URL: $DEPLOY_URL"
