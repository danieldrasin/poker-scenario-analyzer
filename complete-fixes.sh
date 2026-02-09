#!/bin/bash
# Complete the E2E test fixes and probabilityMatrix data regeneration
# Run this from your terminal in the poker-simulator directory

set -e

echo "🔧 Completing E2E and Matrix fixes..."

# Step 1: Remove git lock file if exists
if [ -f .git/index.lock ]; then
    echo "Removing git lock file..."
    rm -f .git/index.lock
fi

# Step 2: Commit the changes
echo "📝 Committing changes..."
git add e2e/app.spec.ts scripts/generate-tier2-data.js data/tier2/
git commit -m "Fix E2E tests and probabilityMatrix generation

- E2E tests: Update button text patterns to match tiered loading
  messages (Checking/Loading/Analyzing instead of just Analyzing)
- Matrix generation: Track actual hero vs opponent matchups instead
  of using placeholder data
- Regenerate all 21 Tier 2 data files with 1M iterations each

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

# Step 3: Push to origin
echo "⬆️  Pushing to GitHub..."
git push origin main

# Step 4: Upload Tier 2 data to R2
echo "☁️  Uploading Tier 2 data to R2..."
export $(grep -v '^#' .env | xargs)
npm run tier2:upload

# Step 5: Deploy to Vercel
echo "🚀 Deploying to Vercel..."
vercel --prod

echo ""
echo "✅ All done! Now you can run E2E tests:"
echo "   TEST_URL=https://poker-simulator-gamma.vercel.app LIVE_TEST=true npx playwright test"
