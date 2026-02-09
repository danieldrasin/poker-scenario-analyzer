# Project Instructions for AI Assistants

This file provides instructions for any AI model (Opus or Sonnet) working on this project.

## ⚠️ Default Development Workflow

**When asked to develop or fix something, ALWAYS follow this workflow unless told otherwise:**

1. **Develop** - Write or modify the code
2. **Test Locally** - Verify build passes and changes work
3. **Deploy** - Commit, push, and deploy to Vercel
4. **E2E Verify** - Run the full E2E test suite against live deployment
5. **Report** - Only report completion after all tests pass

If any step fails, fix the issue and repeat until everything passes.

**Reference:** See `ENGINEERING_BEST_PRACTICES.md` for detailed workflow documentation.

---

## Before Starting Any Task

1. **Check the task breakdown**: Read `TASK-BREAKDOWN.md` in the parent poker directory
2. **Identify the current task** in the breakdown
3. **Proceed with the task** - model recommendations are for reference only

## After Completing Any Task

1. **Run E2E tests** against the live deployment
2. **Update the task breakdown** (`TASK-BREAKDOWN.md`):
   - Mark completed tasks with ✅
   - Add any new tasks discovered during work
3. **Update the todo list** using the TodoWrite tool
4. **Report results** including E2E test status

---

## Key Documentation

| Document | Purpose |
|----------|---------|
| `ENGINEERING_BEST_PRACTICES.md` | Development workflow, testing, deployment |
| `../E2E_TESTING_AND_DEPLOYMENT_GUIDE.md` | Comprehensive E2E testing guide |
| `../TASK-BREAKDOWN.md` | Task tracking and prioritization |
| `../Poker-Data-Architecture-Design.docx` | Architecture documentation |

---

## Quick Reference: E2E Testing

```bash
# Run full E2E suite against live deployment
cd "/Users/DanDrasin/projects/smalltalk stuff/poker/poker-simulator"
TEST_URL=https://poker-simulator-gamma.vercel.app LIVE_TEST=true npx playwright test
```

E2E tests use **Desktop Commander MCP** to run Playwright on the Mac (sandbox can't run browsers).

---

## Quick Reference: Deployment

```bash
# Deploy to Vercel
vercel --prod

# Or auto-deploy via git push
git push origin main
```

---

## When to Suggest Switching to Opus

Suggest switching to Opus when:
- Task involves new algorithm design (not just using existing code)
- Task requires deep poker strategy knowledge
- Debugging is complex and root cause isn't obvious after 2-3 attempts
- Architectural decisions with significant tradeoffs

## When Sonnet is Fine

Stay with Sonnet for:
- Running existing scripts
- Configuration file creation
- UI changes with clear requirements
- Integrating well-documented modules
- File operations and standard CRUD
- Following established patterns in the codebase

---

## Key Project Files

| File | Purpose |
|------|---------|
| `packages/web/src/public/app.js` | Main frontend JavaScript |
| `packages/web/src/public/data-manager.js` | Data loading and caching |
| `packages/web/src/public/poker-stats.js` | Statistics calculations |
| `api/simulate.js` | Tier 3 simulation API |
| `api/data.js` | Tier 2 R2 data API |
| `scripts/generate-tier2-data.js` | Generate Tier 2 data |
| `e2e/app.spec.ts` | E2E test suite |

---

## Project Context

This is a Poker Scenario Analyzer with:
- Monte Carlo simulation engine (TypeScript)
- Web UI for scenario building and analysis
- AI coaching with BYOK (Anthropic/OpenAI/Gemini/Groq)
- Tiered data storage:
  - **Tier 1:** Bundled JSON (instant)
  - **Tier 2:** Cloudflare R2 (1M pre-computed simulations)
  - **Tier 3:** Live API (on-demand simulation)
- Support for 4/5/6-card Omaha variants
- Deployed at: https://poker-simulator-gamma.vercel.app
