#!/bin/bash
# Deploy and Test Script for Poker Scenario Analyzer
# Run this from your local machine after authenticating with GitHub/Vercel

set -e

echo "=== Step 1: Remove stale git lock file ==="
rm -f .git/HEAD.lock .git/index.lock
echo "Done."

echo ""
echo "=== Step 2: Stage and commit test updates ==="
git add e2e/api.spec.ts e2e/play-advisor.spec.ts packages/web/dist/server.js bot/VISUAL_REPORT.html
git commit -m "Add style differentiation e2e tests, heatmap fix, local API routes

- 10 new API tests for heroStyle echo, reasoning text, sizing variation
- 6 new UI tests for style dropdown visibility, selection, re-analysis
- Fixed heatmap to include PLO5 and PLO6 data
- Added local /api/advise route for dev server testing

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
echo "Done."

echo ""
echo "=== Step 3: Push to GitHub (triggers Vercel deploy) ==="
git push origin main
echo "Done. Vercel deployment will start automatically."

echo ""
echo "=== Step 4: Wait for Vercel deployment ==="
echo "Waiting 60 seconds for Vercel to build..."
sleep 60

echo ""
echo "=== Step 5: Run tests against Vercel ==="
VERCEL_URL="https://poker-scenario-analyzer.vercel.app"
echo "Testing against: $VERCEL_URL"

# Run style API tests against Vercel
TEST_URL=$VERCEL_URL LIVE_TEST=true npx playwright test e2e/api.spec.ts \
  --grep "Style Differentiation" \
  --project chromium \
  --reporter list

echo ""
echo "=== Step 6: Run UI tests against Vercel ==="
TEST_URL=$VERCEL_URL LIVE_TEST=true npx playwright test e2e/play-advisor.spec.ts \
  --grep "Style Selector" \
  --project chromium \
  --reporter list

echo ""
echo "=== All done! ==="
echo "Style-aware tests completed against Vercel deployment."
