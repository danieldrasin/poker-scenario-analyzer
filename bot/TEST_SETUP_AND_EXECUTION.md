# PokerNow Multi-Bot Test Setup and Execution Guide

> **⚠️ IMPORTANT: This document must be kept current with any changes to the testing infrastructure.**
> Last updated: 2025-02-15
> Maintainer: AI + Human collaboration

---

## Overview

This document describes how to set up and execute multi-bot testing on PokerNow for the Poker Simulator with Play Advisor. It is designed to be readable and actionable by both humans and AI agents.

### Purpose
- Test the Play Advisor's decision-making across multiple bot instances
- Validate game state parsing and action execution
- Evaluate different poker strategies over time
- Ensure all mechanical operations work correctly

---

## Architecture

### Key Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     PokerNow.com (Browser)                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Poker Table                            │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │  │
│  │  │  Bot1   │ │  Bot2   │ │  Bot3   │ │ Owner   │        │  │
│  │  │(Playw.)│ │(Playw.)│ │(Playw.)│ │(Claude)│         │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  Playwright │ │  Playwright │ │  Playwright │ │Claude Chrome│
│  Context 1  │ │  Context 2  │ │  Context 3  │ │     MCP     │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
         │              │              │              │
         └──────────────┴──────────────┴──────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Play Advisor API   │
                    │  (Decision Engine)   │
                    └─────────────────────┘
```

### Multi-Session Isolation

Each bot runs in an **isolated Playwright browser context**, providing:
- Separate cookies (distinct player identity)
- Separate local storage
- No session cross-contamination
- No need for Docker containers

This is achieved via `browser.newContext()` which creates a fresh, isolated session for each bot.

---

## Files and Their Purposes

| File | Purpose |
|------|---------|
| `PlaywrightBotJoiner.js` | Main class for joining bots to a PokerNow game |
| `BotGameLoop.js` | **Automated game loop with Play Advisor integration** |
| `ValidationTestRunner.js` | **Integrated validation test runner** |
| `GameStateParser.js` | Extracts game state (cards, pot, players) from DOM |
| `ActionExecutor.js` | Executes poker actions (fold, check, call, raise) |
| `AdvisorClient.js` | Connects to Play Advisor API for decisions |
| `GameLoop.js` | Legacy game loop (replaced by BotGameLoop) |
| `run-bots.js` | Simple script to launch multiple bots |
| `config.js` | Configuration settings |

---

## Setup Instructions

### Prerequisites

1. **Node.js** (v18+)
2. **Playwright** installed:
   ```bash
   npm install playwright
   npx playwright install chromium
   ```

3. **PokerNow Account** (optional, for game ownership)

### Step 1: Create a PokerNow Game

1. Go to https://www.pokernow.com
2. Click "Create Private Game"
3. Select game type (PLO Hi recommended for testing)
4. Set blinds (e.g., 10/20)
5. Copy the game URL (e.g., `https://www.pokernow.com/games/pgl2wy20QIsPBt_NSZ5zQfL4X`)

### Step 2: Configure the Bots

Edit `config.js` or set environment variables:

```javascript
export const config = {
  gameUrl: 'YOUR_GAME_URL_HERE',
  bots: {
    count: 3,
    stackSize: 1000,
    headless: false  // Set true for CI/automated runs
  },
  advisor: {
    apiUrl: 'http://localhost:3001/api/play-advisor'
  }
};
```

### Step 3: Run the Bots

```bash
cd /Users/DanDrasin/projects/smalltalk\ stuff/poker/poker-simulator/bot
node run-bots.js
```

---

## Join Flow (Verified)

The bot join process follows this workflow:

```
1. Navigate to game URL
2. Dismiss any overlays (cookie notices, alerts)
3. Click an empty seat
4. Fill form:
   - Nickname (e.g., "Bot1")
   - Stack size (e.g., 1000)
5. Click "REQUEST THE SEAT"
6. Handle email dialog → Click "CANCEL" (bypasses verification)
7. Wait for owner approval
8. Bot is seated!
```

### Important Discoveries

- **Email verification is optional**: Clicking CANCEL bypasses it. Email is only for voice/video chat.
- **Owner approval required**: The game owner must approve each seat request (can enable auto-approve with "do not show this again" checkbox).
- **reCAPTCHA only blocks game creation**, not player joins.
- **Playwright works without stealth plugins** for PokerNow.

---

## Game State Parsing

The `GameStateParser.js` extracts:

| Data | CSS Selector | Notes |
|------|-------------|-------|
| Hole cards | `.you-player .card` | Our cards |
| Board cards | `.table-cards .card` | Community cards |
| Pot size | `.table-pot-size .chips-value` | Total pot |
| Player stacks | `.table-player-stack .chips-value` | Each player |
| Dealer button | `.dealer-button-ctn` | Position |
| Action buttons | `button.fold`, `button.check`, etc. | Available actions |

### Card Format

Cards are parsed into standard notation: `As` (Ace of spades), `Kh` (King of hearts), etc.

---

## Action Execution

Actions are executed by clicking the appropriate buttons:

| Action | Selector | Notes |
|--------|----------|-------|
| Fold | `button.fold` or `button:has-text("FOLD")` | |
| Check | `button.check` or `button:has-text("CHECK")` | |
| Call | `button.call` or `button:has-text("CALL")` | |
| Raise | `button.raise` or `button:has-text("RAISE")` | Requires amount |
| Bet | `button:has-text("BET")` | First bet in round |

### Force Click

Use `{ force: true }` when clicking to bypass overlay interference.

---

## Validation Test Runner (NEW)

The `ValidationTestRunner.js` provides an integrated way to test the Play Advisor:

### Key Features
- Joins multiple bots automatically
- Attaches BotGameLoop with Play Advisor integration to each bot
- Tracks **default-fold events** (when advisor has no guidance)
- Tracks **low-confidence actions** (confidence < 60%)
- Outputs comprehensive statistics
- Saves results to JSON file

### Usage

```bash
# From poker-simulator directory
npm run bot:validate

# Or with custom parameters
node bot/ValidationTestRunner.js [gameUrl] [numBots] [targetHands]
node bot/ValidationTestRunner.js https://pokernow.com/games/xxx 3 50
```

### Output Statistics
The test tracks:
- **Hands played** per bot
- **Profit/Loss** and BB/100 rate
- **Default Fold Rate** - how often the advisor has no guidance
- **Low Confidence Rate** - how often decisions are marginal

### BotGameLoop Integration

The `BotGameLoop.js` module handles:
1. Turn detection via DOM observation
2. Game state parsing (cards, pot, stack)
3. Play Advisor API calls with proper format
4. Action execution (fold, check, call, raise)
5. Statistics tracking

### Strategy Styles

Three play styles are supported (from `poker-stats.js`):
- **rock** - Tight-Passive: Conservative play, fewer hands
- **tag** - Tight-Aggressive: Selective but aggressive
- **lag** - Loose-Aggressive: Wide range, high aggression

---

## Current Status

### Completed
- ✅ Bot joining with email bypass
- ✅ Isolated browser contexts per bot
- ✅ Game state parsing from DOM
- ✅ Action execution
- ✅ Play Advisor API integration
- ✅ Default fold tracking
- ✅ ValidationTestRunner

### Remaining
- Owner approval still required (manual step)
- Need to run validation tests to collect baseline data

---

## Troubleshooting

### Bot Can't Click Seat
- Check for overlay/alert blocking clicks
- Use `force: true` on click
- Dismiss overlays first with "Got it" button clicks

### Email Dialog Appears
- Click CANCEL button to bypass
- This is for video/voice chat, not required for play

### Bot Stuck on "Waiting for approval"
- Approve the bot from the owner's browser
- Check the Players panel in the game

### Playwright Download Fails
- Run `npx playwright install chromium` manually
- Ensure network access for browser download

---

## For AI Agents

When running these tests as an AI agent:

1. **Read this document first** to understand the setup
2. **Check game URL** in `GAME_URL.txt` or `config.js`
3. **Use Desktop Commander** to run Node.js scripts
4. **Use Claude in Chrome** to control the owner browser and approve bots
5. **Monitor screenshots** in `debug-screenshots/` for troubleshooting

### Key Commands

```bash
# Run bots
node /Users/DanDrasin/projects/smalltalk\ stuff/poker/poker-simulator/bot/run-bots.js

# Run with specific URL
node PlaywrightBotJoiner.js "https://www.pokernow.com/games/YOUR_GAME_ID" 3
```

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-02-15 | Added ValidationTestRunner, BotGameLoop, strategy styles | Claude AI |
| 2025-02-14 | Initial document creation | Claude AI |
| | Documented join flow, architecture, selectors | |

