# PokerNow Bot Integration Plan

**Created:** February 2026
**Goal:** Enable the Play Advisor to play Omaha on PokerNow.club

---

## Platform Overview

**PokerNow.club** is a free, play-money poker platform that:
- Supports Texas Hold'em AND **Omaha variants** ✓
- Explicitly allows third-party tools (HUDs, bots)
- No registration required, no rake
- Supports up to 10 players per table

---

## Architecture Options

### Option A: Chrome Extension (TypeScript)
**Pros:** Lightweight, runs in browser, real-time
**Cons:** Requires Chrome, harder to automate headlessly
**Reference:** [Jackaljkdan/pokernow-bot](https://github.com/Jackaljkdan/pokernow-bot)

### Option B: Selenium (Python)
**Pros:** Full automation, session persistence, comprehensive
**Cons:** Different language than our codebase, heavier
**Reference:** [Zehmosu/PokerNow](https://github.com/Zehmosu/PokerNow)

### Option C: Puppeteer (Node.js) ⭐ RECOMMENDED
**Pros:** Same language as Play Advisor, can run headless, good for integration
**Cons:** Requires browser instance
**Reference:** [csong2022/pokernow-gpt](https://github.com/csong2022/pokernow-gpt)

**Decision:** Option C (Puppeteer/Node.js) aligns best with our existing JavaScript codebase.

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PokerNow Bot System                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │  Puppeteer   │───▶│ Game State   │───▶│ Play Advisor │   │
│  │  Browser     │    │ Parser       │    │ API          │   │
│  │  Controller  │    │              │    │              │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│         │                                       │            │
│         │                                       ▼            │
│         │            ┌──────────────┐    ┌──────────────┐   │
│         │            │  Opponent    │◀───│ Action       │   │
│         └───────────▶│  Tracker     │    │ Recommender  │   │
│                      │  (SQLite)    │    │              │   │
│                      └──────────────┘    └──────────────┘   │
│                                                │             │
│                      ┌──────────────┐          │             │
│                      │  Action      │◀─────────┘             │
│                      │  Executor    │                        │
│                      │ (Click/Type) │                        │
│                      └──────────────┘                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Browser Controller (1 day)
**Files:** `bot/BrowserController.js`

```javascript
// Core capabilities
- launchBrowser()           // Start Puppeteer with PokerNow
- navigateToTable(url)      // Join a specific table
- waitForTurn()             // Detect when it's our turn
- getPageState()            // Raw DOM snapshot
- closeBrowser()            // Cleanup
```

**Tasks:**
- [ ] Set up Puppeteer dependency
- [ ] Implement browser launch with appropriate flags
- [ ] Handle PokerNow authentication (if needed)
- [ ] Implement turn detection loop

---

### Phase 2: Game State Parser (1-2 days)
**Files:** `bot/GameStateParser.js`

```javascript
// Parse PokerNow DOM into our format
{
  gameVariant: 'omaha4' | 'omaha5',
  street: 'preflop' | 'flop' | 'turn' | 'river',
  holeCards: ['As', 'Ks', 'Qs', 'Js'],
  board: ['Ts', '9s', '2h'],
  position: 'BTN',
  playersInHand: 4,
  potSize: 150,
  toCall: 50,
  stackSize: 1000,
  villainActions: ['raise', 'call']
}
```

**DOM Elements to Parse (VERIFIED):**
- Hole cards: `.you-player .card` with `.value` and `.suit` children
- Board cards: `.table-cards .card`
- Pot size: `.table-pot-size .main-value .chips-value` + `.table-pot-size .add-on .chips-value`
- Stack sizes: `.table-player-stack .chips-value`
- Current bet: `.table-player-bet .chips-value`
- Player positions: `.table-player:not(.table-player-seat)` with `.dealer-button-ctn`
- Action buttons: `button.fold`, `button.check`, `button.call`, `button.raise`
- Turn indicator: `.action-signal`

**Tasks:**
- [ ] Map PokerNow card notation to our format
- [ ] Parse pot size from formatted text (e.g., "1,500" → 1500)
- [ ] Detect game variant (4-card vs 5-card Omaha)
- [ ] Calculate position from seat arrangement
- [ ] Track villain actions from log or DOM changes

---

### Phase 3: Action Executor (1 day)
**Files:** `bot/ActionExecutor.js`

```javascript
// Convert Play Advisor output to PokerNow clicks
async execute(recommendation) {
  switch(recommendation.action) {
    case 'fold': await clickFold();
    case 'call': await clickCall();
    case 'check': await clickCheck();
    case 'raise': await enterRaise(recommendation.sizing.optimal);
    case 'bet': await enterBet(recommendation.sizing.optimal);
  }
}
```

**Tasks:**
- [ ] Implement click actions for each button type
- [ ] Handle bet/raise amount input
- [ ] Add confirmation handling
- [ ] Implement retry logic for failed clicks

---

### Phase 4: Play Advisor Integration (1 day)
**Files:** `bot/AdvisorClient.js`

```javascript
// Bridge between parsed state and Play Advisor API
async getRecommendation(gameState) {
  const response = await fetch('/api/advise', {
    method: 'POST',
    body: JSON.stringify(gameState)
  });
  return response.json();
}
```

**Tasks:**
- [ ] Format game state for API
- [ ] Handle API errors gracefully
- [ ] Log recommendations for analysis
- [ ] Add confidence threshold (skip low-confidence decisions?)

---

### Phase 5: Opponent Tracking (2 days)
**Files:** `bot/OpponentTracker.js`, `bot/db/opponents.sqlite`

```javascript
// Track opponent tendencies across sessions
{
  playerId: 'player_hash',
  stats: {
    vpip: 0.35,      // Voluntarily Put In Pot
    pfr: 0.22,       // Pre-Flop Raise
    aggression: 1.2, // Bet+Raise / Call ratio
    handsPlayed: 150
  }
}
```

**Future Enhancement:** Feed opponent stats to Play Advisor for exploitative adjustments.

---

### Phase 6: Game Loop & Session Management (1 day)
**Files:** `bot/GameLoop.js`, `bot/index.js`

```javascript
// Main bot entry point
async function runBot(tableUrl) {
  const browser = await launchBrowser();
  await navigateToTable(tableUrl);

  while (running) {
    await waitForTurn();
    const state = await parseGameState();
    const recommendation = await getRecommendation(state);
    await executeAction(recommendation);
    await trackResult();
  }
}
```

---

## File Structure

```
poker-simulator/
├── bot/
│   ├── index.js                 # Entry point
│   ├── BrowserController.js     # Puppeteer management
│   ├── GameStateParser.js       # DOM → game state
│   ├── ActionExecutor.js        # Recommendations → clicks
│   ├── AdvisorClient.js         # Play Advisor API client
│   ├── OpponentTracker.js       # Stats tracking
│   ├── GameLoop.js              # Main game loop
│   ├── config.js                # Configuration
│   └── db/
│       └── opponents.sqlite     # Opponent history
├── bot.test.js                  # Bot tests
└── package.json                 # Add puppeteer dependency
```

---

## Dependencies to Add

```json
{
  "dependencies": {
    "puppeteer": "^21.0.0",
    "better-sqlite3": "^9.0.0"
  }
}
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| DOM changes break parser | Use stable selectors, add fallbacks |
| Rate limiting | Add delays between actions |
| Detection as bot | Randomize timing, human-like behavior |
| Session timeouts | Auto-reconnect logic |
| Parse errors | Default to check/fold, log for debugging |

---

## Success Criteria

1. **Bot joins table** and waits for turn ✓
2. **Parses game state** correctly for all Omaha variants ✓
3. **Gets recommendation** from Play Advisor ✓
4. **Executes action** on PokerNow ✓
5. **Tracks results** for analysis ✓
6. **Runs for 100+ hands** without crashing ✓

---

## Next Steps

1. [ ] Install Puppeteer: `npm install puppeteer`
2. [ ] Create `bot/` directory structure
3. [ ] Implement BrowserController
4. [ ] Test basic navigation to PokerNow
5. [ ] Implement GameStateParser
6. [ ] Connect to Play Advisor API

---

## Appendix: PokerNow DOM Reference

**Verified selectors from existing PokerNow bot implementations:**
- Sources: [pokernow-bot](https://github.com/Jackaljkdan/pokernow-bot), [PokernowHUD](https://github.com/EthanLebowitz/PokernowHUD)

### Card Elements
```css
.you-player .card              /* Player's hole cards */
.table-cards .card             /* Community/board cards */
.value                         /* Card rank (child of .card) */
.suit                          /* Card suit (child of .card) */
```

### Player Information
```css
.table-player                  /* Individual player containers */
.table-player:not(.table-player-seat)  /* Active players only */
.table-player.you-player       /* Current player (us) */
.table-player-name             /* Player name display */
.table-player-stack .chips-value  /* Player's chip stack */
.table-player-bet .chips-value /* Player's current bet */
```

### Dealer & Position
```css
.dealer-button-ctn             /* Dealer button container */
```

### Turn Detection
```css
.action-signal                 /* Indicates it's a player's turn */
.you-player .action-signal     /* Specifically when it's OUR turn */
```

### Action Buttons
```css
button.fold                    /* Fold action */
button.check                   /* Check action */
button.call                    /* Call action */
button.raise                   /* Raise action */
.default-bet-buttons button    /* Preset bet amount buttons (1/2 pot, pot, etc.) */
.raise-controller-form input[type="submit"]  /* Confirm raise */
```

### Pot & Betting
```css
.table-pot-size                       /* Pot container */
.table-pot-size .main-value .chips-value  /* Previous streets pot */
.table-pot-size .add-on .chips-value      /* Current street additions */
.blind-value .chips-value             /* Blind amounts */
```

### Game State
```css
.player-hand-message           /* Hand rank display at showdown */
button.show-your-hand          /* Button to reveal cards */
```

### Notes
- Card rank in `.value` may be "10" which should be converted to "T"
- Suit symbols (♠♥♦♣) should be converted to letters (s,h,d,c)
- Board card count determines street: 0=preflop, 3=flop, 4=turn, 5=river
- The `.table-player-seat` class marks empty seats (filter these out)
