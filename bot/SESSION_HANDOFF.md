# Play Advisor Validation - Session Handoff

**Last Updated:** 2026-02-16
**Purpose:** Continuation prompt for new Cowork session
**Root Directory:** `/Users/DanDrasin/projects/smalltalk stuff/poker`

---

## Quick Start Prompt

Copy everything between the triple-backtick fences to start a new session:

```
I'm continuing work on the Poker Scenario Analyzer Play Advisor validation.

Please read the handoff document first:
poker-simulator/bot/SESSION_HANDOFF.md

Working directory: /Users/DanDrasin/projects/smalltalk stuff/poker
Main app lives in poker-simulator/ subdirectory.

Key context:
- Bot testing uses `clubs` Python library for proper PLO4/5/6 dealing + Play Advisor API (localhost:3001)
- Start advisor server: node poker-simulator/bot/LocalAdvisorServer.js
- Framework has 6 styles defined in poker-simulator/api/lib/StyleProfiles.js:
  nit, rock, reg, tag, lag, fish — each with variant-specific thresholds
- The single source of truth for style behavior is StyleProfiles.js
- Test runner: poker-simulator/bot/OmahaTestRunner.py (uses `clubs`)
- Previous test runner (StyleBasedTestRunner.py) is superseded

Available tools:
- Bash — for running Python tests and local shell commands inside the sandbox
- **Desktop Commander** — REQUIRED for git push and vercel deploy (runs on host Mac where credentials live via macOS Keychain). Use `mcp__desktop-commander__start_process` for these.
- Claude in Chrome — for operator-assisted PokerNow browser automation
- xlsx / docx / pdf skills — for creating reports and spreadsheets

Current priorities:
1. Operator-assisted testing on PokerNow (operator handles CAPTCHA, agent controls browser gameplay via Claude in Chrome)
2. Strategy tuning — threshold calibration per variant to hit real-world VPIP targets
3. UI improvements for the Scenario Builder and Play Advisor tabs

IMPORTANT directives:
- The agent should RUN tests directly, never provide instructions for the operator to run.
- Use absolute paths with /Users/DanDrasin/ (not ~) per user preference.
```

---

## Project Overview

### What This Is
A Poker Scenario Analyzer for Omaha (PLO4/5/6) with:
- Monte Carlo simulation engine (TypeScript)
- **Play Advisor API** — real-time hand analysis and action recommendations
- Web UI — Scenario Builder, Play Advisor, Probability Matrix, Saved Analysis tabs
- Bot testing framework — multi-style simulation for strategy validation
- AI coaching with BYOK (Anthropic / OpenAI / Gemini / Groq)
- Tiered data storage: Tier 1 (bundled JSON), Tier 2 (Cloudflare R2), Tier 3 (live API)

### Deployment
- **Live app:** https://poker-simulator-gamma.vercel.app
- **GitHub:** https://github.com/danieldrasin/poker-scenario-analyzer.git
- **Local advisor:** http://localhost:3001/api/advise

### Deploy Credentials
**CRITICAL — Deploy via Desktop Commander, NOT Bash:**
Git and Vercel credentials are on the host Mac (macOS Keychain + Vercel CLI auth).
The Cowork sandbox (Bash tool) CANNOT access these credentials.
You MUST use the **Desktop Commander MCP tools** (`mcp__desktop-commander__start_process`)
to run git and vercel commands — this executes on the actual Mac where auth works.

Example git push:
```
mcp__desktop-commander__start_process:
  command: cd "/Users/DanDrasin/projects/smalltalk stuff/poker/poker-simulator" && git add -A && git commit -m "message" && git push
  timeout_ms: 30000
```

Example vercel deploy:
```
mcp__desktop-commander__start_process:
  command: cd "/Users/DanDrasin/projects/smalltalk stuff/poker/poker-simulator" && vercel --prod
  timeout_ms: 120000
```

- Git credential helper: `osxkeychain` (configured in git config)
- Vercel CLI: `/opt/homebrew/bin/vercel`, logged in as `danieldrasin`
- GitHub remote: `https://github.com/danieldrasin/poker-scenario-analyzer.git`
- See `poker-simulator/CLAUDE.md` for full deploy workflow

---

## Critical Files Reference

All paths relative to `/Users/DanDrasin/projects/smalltalk stuff/poker`

### Design & Architecture
| File | Purpose |
|------|---------|
| `poker-simulator/PLAY_ADVISOR_DESIGN.md` | Technical architecture for Play Advisor |
| `poker-simulator/PLAY_ADVISOR_PLAN.md` | Feature roadmap and phases |
| `poker-simulator/CLAUDE.md` | AI assistant instructions (includes testing directive, deploy workflow) |
| `Poker-Data-Architecture-Design.docx` | Overall data architecture |

### Style System (Single Source of Truth)
| File | Purpose |
|------|---------|
| `poker-simulator/api/lib/StyleProfiles.js` | **AUTHORITATIVE** — 6 style definitions with variant-specific thresholds, equity adjustments, sizing multipliers |
| `poker-simulator/api/lib/ActionRecommender.js` | Style-aware decision logic (imports StyleProfiles, adjusts equity thresholds per style) |
| `poker-simulator/api/lib/BetSizer.js` | Bet sizing (uses style sizing multipliers) |

### Core Implementation
| File | Purpose |
|------|---------|
| `poker-simulator/api/advise.js` | Play Advisor API endpoint |
| `poker-simulator/packages/web/src/public/app.js` | Main frontend JS |
| `poker-simulator/packages/web/src/public/play-advisor.js` | Play Advisor UI tab |
| `poker-simulator/packages/web/src/public/index.html` | Main HTML (Style dropdown on Play Advisor tab) |
| `poker-simulator/packages/web/src/public/poker-stats.js` | Statistics calculations |

### Bot Testing Framework
| File | Purpose |
|------|---------|
| `poker-simulator/bot/OmahaTestRunner.py` | **PRIMARY** — Tests using `clubs` library, proper PLO4/5/6, button rotation, full betting sequences |
| `poker-simulator/bot/StyleBasedTestRunner.py` | **SUPERSEDED** — earlier runner using PyPokerEngine (Hold'em engine, not real Omaha) |
| `poker-simulator/bot/LocalAdvisorServer.js` | Local Play Advisor server for testing |
| `poker-simulator/bot/STYLE_TESTING_REPORT.md` | Latest comprehensive test results (56K hands) |
| `poker-simulator/bot/test_results/*.json` | Raw test data (JSON) |

### Operator-Assisted Testing (Planned)
| File | Purpose |
|------|---------|
| `poker-simulator/bot/PokerNowAutomation.js` | Playwright automation for PokerNow (reference) |
| `poker-simulator/bot/OwnerAutomation.js` | Owner-assisted login with CAPTCHA handling |

---

## Style System (6 Styles)

The style system was expanded from the original 3 (rock/tag/lag) to 6 archetypes.
**StyleProfiles.js** is the single source of truth used by both the API and the test runner.

| Style | VPIP Target | PFR Ratio | Aggression | Description |
|-------|-------------|-----------|------------|-------------|
| **nit** | ~20% | 70% | 0.70x | Ultra-tight, folds most marginal spots |
| **rock** | ~20% | 45% | 0.50x | Same tight selection, but passive postflop |
| **reg** | ~25% | 75% | 1.00x | Baseline solid player, balanced |
| **tag** | ~28% | 72% | 1.10x | Selective + aggressive, classic winning style |
| **lag** | ~35% | 65% | 1.25x | Wide range, high aggression, high variance |
| **fish** | ~50% | 25% | 0.40x | Too many hands, too passive, recreational |

### Variant-Specific Thresholds (from StyleProfiles.js)

| Style | PLO4 | PLO5 | PLO6 |
|-------|------|------|------|
| nit | 55.0 | 65.5 | 73.0 |
| rock | 55.0 | 65.5 | 73.0 |
| reg | 53.6 | 63.9 | 71.3 |
| tag | 52.0 | 62.0 | 69.5 |
| lag | 50.5 | 61.0 | 68.5 |
| fish | 46.5 | 56.7 | 64.3 |

---

## Current Test Results (56K Hands)

### Key Findings (from STYLE_TESTING_REPORT.md)

**Heads-Up Rankings:** TAG > LAG > Rock across all variants

**Multi-player Insights:**
- **TAG** dominates shorter tables (3-5 players)
- **LAG** dominates larger tables (7-9 players) — aggression steals more pots
- **Rock** is consistently the weakest style, especially in PLO5/6
- **TAG is the most consistent overall** — always positive average

### VPIP Calibration Issue
Current thresholds produce VPIPs well above real-world targets, especially in PLO5/6.
Recommended threshold increases are documented in STYLE_TESTING_REPORT.md.

### Statistical Quality
- 2,000 hands per configuration, 28 configurations, 56,000 total hands
- For 95% confidence detecting 5 BB/100 difference: ~6,272 hands per config recommended
- Confidence intervals are wide (±50-200 BB/100) — typical for Omaha variance

---

## Next Steps

### 1. Operator-Assisted Live Testing on PokerNow
**Goal:** Test Play Advisor against real opponents

**Challenge:** PokerNow has reCAPTCHA that blocks pure automation

**Solution:** Operator-assisted flow using Claude in Chrome:
1. Operator opens PokerNow in Chrome and manually logs in / bypasses CAPTCHA
2. Operator joins or creates a poker table
3. Agent uses `Claude in Chrome` MCP tools to:
   - `tabs_context_mcp` — get the tab with PokerNow
   - `read_page` / `find` — read game state (cards, pot, actions)
   - `computer` — click buttons, enter bet amounts
   - `screenshot` — capture game state for analysis
4. Agent calls Play Advisor API (localhost:3001) for recommendations
5. Agent executes recommended actions via browser automation
6. Operator monitors and can intervene if needed

**Files to review:**
- `poker-simulator/bot/PokerNowAutomation.js` — existing Playwright code (for reference)
- `poker-simulator/bot/OwnerAutomation.js` — owner-assisted login flow

### 2. Strategy Tuning
**Goal:** Calibrate style thresholds to match real-world VPIP targets

**Known issues (from testing):**
- PLO5/6 thresholds too low → all styles play too many hands
- Rock/Nit need higher thresholds to achieve 15-20% VPIP
- LAG enters nearly every pot in PLO5/6 (observed ~95-100% VPIP vs target ~35%)

**Approach:**
- Adjust thresholds in `StyleProfiles.js` (the single source of truth)
- Run `OmahaTestRunner.py` to validate
- Iterate until observed VPIP matches targets

### 3. UI Improvements
**Goal:** Enhance Scenario Builder and Play Advisor tabs

**Potential improvements:**
- Show confidence intervals in results
- Visualize strategy performance across compositions
- Better mobile responsiveness
- The Play Advisor tab now includes a Style dropdown (nit/rock/reg/tag/lag/fish)

---

## Running Tests (Agent Should Execute These)

```bash
# Start Play Advisor server (if needed for API-assisted tests)
cd "/Users/DanDrasin/projects/smalltalk stuff/poker/poker-simulator/bot"
node LocalAdvisorServer.js &

# Full comprehensive test (28 configs × 2000 hands = 56K hands, ~3.5 min)
python3 OmahaTestRunner.py fulltest 2000

# Quick single test
python3 OmahaTestRunner.py 4 6 500    # PLO4, 6 players, 500 hands

# Custom hand count
python3 OmahaTestRunner.py fulltest 5000  # 5000 hands per config (~9 min)
```

### Dependencies

```bash
# Python (for bot testing)
pip3 install clubs numpy requests --break-system-packages

# Node (for Play Advisor server)
# Already installed in poker-simulator/
```

---

## Important Directives

1. **Agent runs tests** — Do NOT tell the operator to run commands
2. **Use actual styles from StyleProfiles.js** — nit, rock, reg, tag, lag, fish (never invent new ones)
3. **Track statistics** — Include confidence intervals, observed VPIP, sample sizes
4. **StyleProfiles.js is the single source of truth** — update it for threshold changes
5. **Use absolute paths** with `/Users/DanDrasin/` (not `~`) per user preference
6. **Document changes** — Update STYLE_TESTING_REPORT.md with new findings

---

## Available Connectors (MCP Servers)

### Browser Automation
| Connector | Purpose |
|-----------|---------|
| **Claude in Chrome** | Full browser automation — screenshots, clicking, typing, navigation, reading page accessibility tree. **Essential for PokerNow testing.** |
| **Control Chrome** | Open URLs, list/switch tabs, execute JavaScript, get page content |

### File & System Access
| Connector | Purpose |
|-----------|---------|
| **Desktop Commander** | Execute shell commands, read/write files, search, process management. Use for running Python tests, installing packages, managing processes. |
| **Google Drive** | Search and fetch Google Docs |
| **Apple Notes** | Read/write Apple Notes |

### Research
| Connector | Purpose |
|-----------|---------|
| **WebSearch / WebFetch** | Search the web and fetch page content |
| **PubMed** | Biomedical literature (not relevant for poker) |

**Key for this project:**
- **Desktop Commander** or **Bash** — for running Python tests and shell commands
- **Claude in Chrome** — for operator-assisted PokerNow testing (browser automation)

---

## Available Skills

Skills provide specialized capabilities for document creation. Invoke with the Skill tool.

| Skill | Trigger | Use Case |
|-------|---------|----------|
| `xlsx` | Spreadsheets, Excel, .xlsx | Export test results to spreadsheets |
| `pdf` | PDF files, .pdf | Generate PDF reports |
| `pptx` | PowerPoint, presentations | Create strategy presentations |
| `docx` | Word documents, reports | Create documentation |
| `skill-creator` | Create/improve skills | Build custom skills for poker analysis |

---

## Contacts & Resources

- **Live app:** https://poker-simulator-gamma.vercel.app
- **GitHub:** https://github.com/danieldrasin/poker-scenario-analyzer.git
- **PokerNow:** https://www.pokernow.club (live testing target)
- **Groq API Key:** see `poker-simulator/CLAUDE.md` (stored credentials section)
