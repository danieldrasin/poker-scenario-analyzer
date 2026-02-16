# Strategic Evaluation Test Framework

> **Test Type**: Long-running / Performance / Strategy Evaluation
> **Purpose**: Evaluate different bot strategies over extended play
> **Prerequisites**: Basic Multi-User Test passing
> **Duration**: Extended (100+ hands per session)

---

## Overview

This test suite evaluates how different poker strategies perform over time. Unlike the basic test (which verifies mechanics), this test measures **strategic effectiveness**.

### Key Metrics Tracked

1. **Stack Progression** - How chips change over time
2. **Win Rate** - Hands won / hands played
3. **BB/100** - Big blinds won per 100 hands (standard poker metric)
4. **VPIP** - Voluntarily Put $ In Pot (how often entering pots)
5. **PFR** - Pre-Flop Raise percentage
6. **Aggression Factor** - (Bets + Raises) / Calls

---

## Test Configurations

### Configuration A: Equal Starting Stacks
All bots start with identical stacks to measure pure strategy effectiveness.

```javascript
const configA = {
  bots: [
    { name: 'Conservative', stack: 1000, strategy: 'tight-passive' },
    { name: 'Aggressive', stack: 1000, strategy: 'loose-aggressive' },
    { name: 'Balanced', stack: 1000, strategy: 'gto-approximation' },
    { name: 'Adaptive', stack: 1000, strategy: 'exploitative' }
  ],
  blinds: { small: 10, big: 20 },
  targetHands: 100
};
```

### Configuration B: Short Stack Test
Test how strategies perform when starting short-stacked.

```javascript
const configB = {
  bots: [
    { name: 'ShortStack1', stack: 200, strategy: 'tight-passive' },
    { name: 'ShortStack2', stack: 200, strategy: 'loose-aggressive' },
    { name: 'BigStack1', stack: 2000, strategy: 'balanced' },
    { name: 'BigStack2', stack: 2000, strategy: 'balanced' }
  ],
  blinds: { small: 10, big: 20 },
  targetHands: 100
};
```

### Configuration C: Mixed Stack Depths
Realistic tournament-style stacks.

```javascript
const configC = {
  bots: [
    { name: 'ChipLeader', stack: 3000, strategy: 'aggressive' },
    { name: 'Average1', stack: 1000, strategy: 'balanced' },
    { name: 'Average2', stack: 800, strategy: 'balanced' },
    { name: 'ShortStack', stack: 300, strategy: 'survival' }
  ],
  blinds: { small: 10, big: 20 },
  targetHands: 200
};
```

---

## Strategy Definitions

Each bot can implement a different strategy profile:

### Tight-Passive
- Play few hands (low VPIP ~15-20%)
- Rarely raise, prefer calling
- Fold to aggression without strong hands

### Loose-Aggressive (LAG)
- Play many hands (high VPIP ~30-40%)
- Raise frequently, apply pressure
- Bluff often, semi-bluff draws

### Tight-Aggressive (TAG)
- Selective hand choice (VPIP ~20-25%)
- Aggressive when entering pots
- Value-bet strong hands, fold weak ones

### GTO-Approximation
- Mixed strategies based on hand strength
- Balanced ranges (hard to exploit)
- Uses Play Advisor recommendations

### Exploitative
- Adapts to opponent tendencies
- Exploits weak players
- Adjusts aggression based on table dynamics

---

## Data Collection Schema

### Hand Record
```javascript
{
  handId: 1,
  timestamp: "2025-02-14T10:30:00Z",
  blindLevel: { small: 10, big: 20 },
  players: [
    {
      name: "Bot1",
      position: "BTN",
      startStack: 1000,
      endStack: 1050,
      holeCards: ["As", "Kh", "Qd", "Jc"],
      actions: [
        { street: "preflop", action: "raise", amount: 60 },
        { street: "flop", action: "bet", amount: 80 },
        { street: "turn", action: "check" }
      ],
      result: "won",
      profit: 50
    },
    // ... other players
  ],
  board: ["Ks", "7d", "2c", "9h", "3s"],
  potSize: 200,
  winner: "Bot1",
  showdown: true
}
```

### Session Summary
```javascript
{
  sessionId: "2025-02-14-001",
  config: "configA",
  totalHands: 100,
  duration: "45 minutes",
  results: [
    {
      bot: "Conservative",
      startStack: 1000,
      endStack: 850,
      profit: -150,
      bb100: -7.5,
      vpip: 18,
      pfr: 12,
      handsWon: 8
    },
    // ... other bots
  ]
}
```

---

## Test Execution Plan

### Phase 1: Baseline Establishment
1. Run ConfigA 3 times (300 hands total per strategy)
2. Calculate average performance metrics
3. Establish baseline expectations

### Phase 2: Stack Depth Analysis
1. Run ConfigB 3 times
2. Compare short-stack vs big-stack performance
3. Identify which strategies work best when short

### Phase 3: Mixed Environment
1. Run ConfigC 5 times
2. Observe stack mobility
3. Track how often short stacks survive/double

### Phase 4: Strategy Optimization
1. Identify weakest-performing strategy
2. Adjust parameters
3. Re-run tests
4. Compare improvement

---

## Visualization Requirements

### Stack Progression Chart
```
Stack Size
   ^
3000|                    ╭──────────
2000|     ╭─────────────╯
1000|────╯        ╲
 500|              ╲
   0|───────────────╲────────────────> Hands
    0   20   40   60   80   100
```

### Win Rate Comparison
```
Bot          | BB/100 | VPIP | PFR | Hands Won
-------------|--------|------|-----|----------
Conservative | -7.5   | 18%  | 12% | 8
Aggressive   | +12.3  | 35%  | 28% | 15
Balanced     | +3.1   | 24%  | 18% | 11
Adaptive     | +8.7   | 27%  | 22% | 14
```

---

## Automated Test Runner

The strategic test should be implemented as an automated runner:

```javascript
// bot/tests/strategic-test-runner.js

class StrategicTestRunner {
  constructor(config) {
    this.config = config;
    this.handHistory = [];
    this.sessionStats = {};
  }

  async run() {
    await this.setupGame();
    await this.joinBots();
    
    while (this.handHistory.length < this.config.targetHands) {
      await this.playHand();
      this.recordStats();
    }
    
    return this.generateReport();
  }

  recordStats() {
    // Track all metrics after each hand
  }

  generateReport() {
    // Create final report with charts and analysis
  }
}
```

---

## Success Metrics

The strategic test provides insights, not pass/fail:

1. **Variance Analysis**: Do results match expected variance?
2. **Strategy Ranking**: Which strategies outperform?
3. **Situational Performance**: How do strategies perform in different contexts?
4. **Consistency**: How reliable are the results across runs?

---

## Database Schema (SQLite)

```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  config_name TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  total_hands INTEGER
);

CREATE TABLE hands (
  id INTEGER PRIMARY KEY,
  session_id INTEGER,
  hand_number INTEGER,
  board TEXT,  -- JSON array
  pot_size INTEGER,
  winner TEXT,
  showdown BOOLEAN,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE player_hands (
  id INTEGER PRIMARY KEY,
  hand_id INTEGER,
  player_name TEXT,
  position TEXT,
  hole_cards TEXT,  -- JSON array
  start_stack INTEGER,
  end_stack INTEGER,
  profit INTEGER,
  actions TEXT,  -- JSON array
  FOREIGN KEY (hand_id) REFERENCES hands(id)
);

CREATE TABLE player_stats (
  id INTEGER PRIMARY KEY,
  session_id INTEGER,
  player_name TEXT,
  hands_played INTEGER,
  hands_won INTEGER,
  total_profit INTEGER,
  vpip_count INTEGER,
  pfr_count INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

---

## Next Steps

See `STRATEGIC_TESTING_APPROACH.md` for collaboration on:
- Strategy parameter tuning
- New strategy ideas
- Analysis methodology
- Reporting format

