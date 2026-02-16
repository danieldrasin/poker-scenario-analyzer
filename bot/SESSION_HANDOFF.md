# Play Advisor Validation - Session Handoff

**Last Updated:** 2026-02-15
**Purpose:** Continuation prompt for new Cowork session
**Root Directory:** `/Users/DanDrasin/projects/smalltalk stuff/poker`

---

## Quick Start Prompt

Copy this entire section to start a new session:

```
I'm continuing work on the Poker Scenario Analyzer Play Advisor validation.

Please read the handoff document at:
poker-simulator/bot/SESSION_HANDOFF.md

Key context:
- Working directory: /Users/DanDrasin/projects/smalltalk stuff/poker
- Main app is in poker-simulator/ subdirectory
- Bot testing uses PyPokerEngine (local) + Play Advisor API (localhost:3001)
- Start advisor server: node poker-simulator/bot/LocalAdvisorServer.js
- Framework has 3 styles: rock (tight-passive), tag (tight-aggressive), lag (loose-aggressive)

Available tools:
- Use Bash/Desktop Commander for running Python tests and shell commands
- Use Claude in Chrome for operator-assisted PokerNow testing (browser automation)
- Use xlsx/docx/pdf skills for creating reports and spreadsheets

Current priorities:
1. Operator-assisted testing on PokerNow (requires manual CAPTCHA bypass, then agent controls browser)
2. Strategy tuning based on simulation results
3. UI improvements for the Scenario Builder

IMPORTANT: The agent should RUN tests directly, not provide instructions for me to run.
```

---

## Project Overview

### What This Is
A Poker Scenario Analyzer with:
- Monte Carlo simulation engine for Omaha (4/5/6-card)
- **Play Advisor API** - real-time hand analysis and recommendations
- Web UI for scenario building and probability matrix
- Bot testing framework for strategy validation

### Deployment
- **Live app:** https://poker-simulator-gamma.vercel.app
- **Local advisor:** http://localhost:3001/api/advise

---

## Critical Files Reference

All paths relative to `/Users/DanDrasin/projects/smalltalk stuff/poker`

### Design & Architecture
| File | Purpose |
|------|---------|
| `poker-simulator/PLAY_ADVISOR_DESIGN.md` | Technical architecture for Play Advisor |
| `poker-simulator/PLAY_ADVISOR_PLAN.md` | Feature roadmap and phases |
| `poker-simulator/CLAUDE.md` | AI assistant instructions (includes testing directive) |
| `Poker-Data-Architecture-Design.docx` | Overall data architecture |

### Core Implementation
| File | Purpose |
|------|---------|
| `poker-simulator/api/advise.js` | Play Advisor API endpoint |
| `poker-simulator/api/lib/ActionRecommender.js` | Decision logic (equity, pot odds, SPR) |
| `poker-simulator/api/lib/BetSizer.js` | Bet sizing calculations |
| `poker-simulator/packages/web/src/public/app.js` | Frontend with style definitions (lines 240-258) |
| `poker-simulator/packages/web/src/public/play-advisor.js` | Play Advisor UI tab |

### Bot Testing Framework
| File | Purpose |
|------|---------|
| `poker-simulator/bot/StyleBasedTestRunner.py` | **PRIMARY** - Tests using actual styles (rock/tag/lag) |
| `poker-simulator/bot/LocalAdvisorServer.js` | Local Play Advisor server for testing |
| `poker-simulator/bot/PyPokerEngineAdapter.py` | Adapter for PyPokerEngine integration |
| `poker-simulator/bot/STYLE_TESTING_REPORT.md` | Latest test results and analysis |
| `poker-simulator/bot/test_results/*.json` | Raw test data |

### Operator-Assisted Testing (Planned)
| File | Purpose |
|------|---------|
| `poker-simulator/bot/PokerNowAutomation.js` | Playwright automation for PokerNow |
| `poker-simulator/bot/OwnerAutomation.js` | Owner-assisted login with CAPTCHA handling |

---

## Framework Styles (From app.js)

```javascript
styleThreshold: { 'rock': 75, 'tag': 55, 'lag': 40 },
styleVPIP: { 'rock': '~15%', 'tag': '~25%', 'lag': '~38%' },
```

| Style | Threshold | VPIP | Description |
|-------|-----------|------|-------------|
| rock | 75 | ~15% | Tight-Passive - only premium hands |
| tag | 55 | ~25% | Tight-Aggressive - selective, aggressive |
| lag | 40 | ~38% | Loose-Aggressive - wide range, aggressive |

---

## Current Test Results

### Basic Style Performance (500 hands)
| Style | BB/100 | Win Rate | Notes |
|-------|--------|----------|-------|
| TAG | +10,736 | 41.4% | Best overall |
| Rock | +6,027 | 39.0% | Solid but passive |
| LAG | -32,305 | 19.6% | Too loose in test env |

### Table Composition Insights
- **TAG** performs best against LAG-heavy tables
- **LAG** dominates rock-heavy tables (+23,757 BB/100)
- **Rock** struggles against any aggression
- Strategy selection should be adaptive based on opponents

### Statistical Note
- ~6,272 hands needed per player for 95% confidence
- Current tests are 5-8% of recommended sample size

---

## Next Steps

### 1. Operator-Assisted Live Testing
**Goal:** Test Play Advisor against real opponents on PokerNow

**Challenge:** PokerNow has reCAPTCHA that blocks pure automation

**Solution:** Operator-assisted flow using Claude in Chrome:
1. Operator opens PokerNow in Chrome and manually logs in / bypasses CAPTCHA
2. Operator joins or creates a poker table
3. Agent uses `Claude in Chrome` MCP tools to:
   - `tabs_context_mcp` - Get the tab with PokerNow
   - `read_page` / `find` - Read game state (cards, pot, actions)
   - `computer` - Click buttons, enter bet amounts
   - `screenshot` - Capture game state for analysis
4. Agent calls Play Advisor API (localhost:3001) for recommendations
5. Agent executes recommended actions via browser automation
6. Operator monitors and can intervene if needed

**Claude in Chrome workflow:**
```
1. tabs_context_mcp → get tab ID for PokerNow
2. read_page(tabId) → extract game state (hole cards, board, pot)
3. POST to localhost:3001/api/advise with game state
4. Get recommendation (fold/call/raise + sizing)
5. find(tabId, "fold button") or find(tabId, "raise slider")
6. computer(action="left_click", ...) to execute action
7. Repeat for each decision point
```

**Files to review:**
- `poker-simulator/bot/PokerNowAutomation.js` - existing Playwright code (for reference)
- `poker-simulator/bot/OwnerAutomation.js` - owner-assisted login flow

### 2. Strategy Tuning
**Goal:** Improve style definitions based on test data

**Areas to explore:**
- Adjust Rock threshold (75 may be too tight)
- Calibrate LAG aggression factor
- Add opponent modeling
- Implement adaptive style switching

### 3. UI Improvements
**Goal:** Enhance Scenario Builder and Play Advisor tabs

**Potential improvements:**
- Show confidence intervals in results
- Add table composition selector
- Visualize strategy performance
- Better mobile responsiveness

---

## Running Tests (Agent Should Execute These)

```bash
# Start Play Advisor server
cd "/Users/DanDrasin/projects/smalltalk stuff/poker/poker-simulator/bot"
node LocalAdvisorServer.js &

# Run style-based tests (from poker-simulator/bot directory)
python3 StyleBasedTestRunner.py 1000

# Run table composition analysis
python3 -c "from StyleBasedTestRunner import run_table_composition_test; run_table_composition_test(num_hands=500)"
```

Or from the root poker directory:
```bash
# Start server
node poker-simulator/bot/LocalAdvisorServer.js &

# Run tests
cd poker-simulator/bot && python3 StyleBasedTestRunner.py 1000
```

---

## Important Directives

1. **Agent runs tests** - Do NOT tell operator to run commands
2. **Use actual styles** - rock, tag, lag (not made-up strategies)
3. **Track statistics** - Include confidence intervals, sample sizes
4. **Document changes** - Update STYLE_TESTING_REPORT.md with findings

---

## Dependencies

```bash
# Python (for bot testing)
pip3 install PyPokerEngine requests --break-system-packages

# Node (for Play Advisor server)
# Already installed in project
```

---

## Available Connectors (MCP Servers)

The following connectors are available in Cowork for this project:

### Browser Automation
| Connector | Purpose |
|-----------|---------|
| **Claude in Chrome** | Full browser automation - screenshots, clicking, typing, navigation, reading page content. **Essential for PokerNow testing.** |
| **Control Chrome** | Open URLs, list/switch tabs, execute JavaScript, get page content |

### File & System Access
| Connector | Purpose |
|-----------|---------|
| **Desktop Commander** | Execute shell commands, read/write files, search, process management. Use for running Python tests. |
| **Google Drive** | Search and fetch Google Docs (if needed for documentation) |
| **Apple Notes** | Read/write Apple Notes (if needed) |

### Research
| Connector | Purpose |
|-----------|---------|
| **PubMed** | Search biomedical literature (not relevant for poker, but available) |
| **WebSearch / WebFetch** | Search the web and fetch page content |

**Key for this project:**
- Use **Desktop Commander** or **Bash** for running Python tests and shell commands
- Use **Claude in Chrome** for operator-assisted PokerNow testing (browser automation)

---

## Available Skills

Skills provide specialized capabilities for document creation:

| Skill | Trigger | Use Case |
|-------|---------|----------|
| `xlsx` | Spreadsheets, Excel, .xlsx, data tables | Create test result spreadsheets, data analysis |
| `pdf` | PDF files, .pdf, forms, merge/split | Generate PDF reports |
| `pptx` | PowerPoint, presentations, slides, decks | Create strategy presentations |
| `docx` | Word documents, reports, .docx | Create documentation, reports |
| `skill-creator` | Create/improve skills | Build custom skills for poker analysis |

**Invoke skills with:** `skill: "xlsx"` or `skill: "pdf"` etc.

**Relevant for this project:**
- `xlsx` - Export test results to spreadsheets for analysis
- `docx` - Create formal reports and documentation
- `pdf` - Generate PDF summaries

---

## Contacts & Resources

- **Vercel Dashboard:** Check deployment status
- **GitHub:** Source control (if applicable)
- **PokerNow:** https://www.pokernow.club (live testing target)
