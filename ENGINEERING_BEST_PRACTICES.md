# Engineering Best Practices

This document outlines the development workflow and engineering standards for the Poker Simulator project.

## Default Development Workflow

**IMPORTANT:** When asked to develop or fix something, unless explicitly told otherwise, I will follow this complete workflow:

1. **Develop** - Write or modify the code
2. **Test Locally** - Verify changes work in the sandbox/local environment
3. **Deploy** - Push to GitHub and deploy to Vercel
4. **E2E Verify** - Run the full E2E test suite against the live deployment
5. **Report** - Only report completion after all tests pass

If any step fails, I will fix the issue and repeat the workflow until everything passes.

---

## E2E Testing

### Reference Guide
See `/Users/DanDrasin/projects/smalltalk stuff/poker/E2E_TESTING_AND_DEPLOYMENT_GUIDE.md` for comprehensive documentation on:
- Why Playwright runs on the Mac (not in the sandbox)
- Background process + poll pattern for long-running tests
- Vercel/Render deployment setup
- Debugging with failure screenshots

### Running E2E Tests

```bash
# From the poker-simulator directory on Mac:
cd "/Users/DanDrasin/projects/smalltalk stuff/poker/poker-simulator"

# Run against live deployment
TEST_URL=https://poker-simulator-gamma.vercel.app LIVE_TEST=true npx playwright test

# Run specific test file
TEST_URL=https://poker-simulator-gamma.vercel.app LIVE_TEST=true npx playwright test e2e/app.spec.ts

# Run with specific browser
TEST_URL=https://poker-simulator-gamma.vercel.app LIVE_TEST=true npx playwright test --project=chromium
```

### Test Suite Location
All E2E tests are in: `e2e/app.spec.ts`

---

## Deployment Pipeline

```
Code Changes
    ↓
Local Verification (build passes)
    ↓
Git Commit & Push
    ↓
Vercel Auto-Deploy (~30-60 seconds)
    ↓
Verify Deployment:
    curl https://poker-simulator-gamma.vercel.app/api/health
    ↓
Run E2E Tests
    ↓
Report Success (only if all tests pass)
```

---

## Tiered Data Architecture

The project uses a 3-tier data system:

| Tier | Source | Speed | Use Case |
|------|--------|-------|----------|
| **Tier 1** | Bundled JSON (`/data/tier1/`) | Instant | Static reference data |
| **Tier 2** | Cloudflare R2 | ~100ms | Pre-computed 1M simulations |
| **Tier 3** | Live API (`/api/simulate`) | 1-5s | On-demand simulation |

### Updating Tier 2 Data

```bash
cd "/Users/DanDrasin/projects/smalltalk stuff/poker/poker-simulator"

# Generate new data (1M iterations per file)
npm run tier2:generate

# Upload to Cloudflare R2
export $(grep -v '^#' .env | xargs)
npm run tier2:upload
```

### Environment Variables for R2
Stored in `.env` (git-ignored):
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

---

## Key Commands

### Build & Deploy
```bash
# Build locally
npm run build

# Deploy to Vercel production
vercel --prod

# Or push to trigger auto-deploy
git push origin main
```

### Testing
```bash
# Run E2E tests against live
TEST_URL=https://poker-simulator-gamma.vercel.app LIVE_TEST=true npx playwright test

# View test report
npx playwright show-report
```

### Verification
```bash
# Check API health
curl https://poker-simulator-gamma.vercel.app/api/health

# Check Tier 2 data loading
curl "https://poker-simulator-gamma.vercel.app/api/data?game=omaha4&players=6"
```

---

## Desktop Commander Access

Desktop Commander MCP needs directory access to run commands on the Mac. The poker project is at:
```
/Users/DanDrasin/projects/smalltalk stuff/poker/poker-simulator
```

This is covered by the allowed directory `/Users/DanDrasin/projects`.

---

## Failure Debugging

When E2E tests fail, Playwright captures screenshots automatically. View them:
```bash
# List failure screenshots
ls test-results/*/test-failed-*.png

# Or open the HTML report
npx playwright show-report
```

Screenshots render inline when read via Desktop Commander, showing exactly what the page looked like when the test failed.
