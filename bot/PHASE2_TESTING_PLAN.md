# Phase 2: Large-Scale Multi-Player Strategic Testing

> **Status**: ACTIVE  
> **Date**: February 15, 2026  
> **Prerequisite**: Phase 1 validation complete (Play Advisor working with PyPokerEngine)

---

## Objectives

### Primary Goals

1. **Multi-player simulation** - 6-7 players at the table, all controlled by intelligent strategies
2. **Large-scale testing** - 10,000+ hands per configuration for statistical significance
3. **Omaha variant coverage** - Test 4-card, 5-card, and 6-card Omaha
4. **Strategy comparison** - Identify which strategy combinations perform best

### Secondary Goals

5. **Operator-assisted real platform testing** - Use actual poker sites with human CAPTCHA assistance
6. **Performance metrics** - Track BB/100, variance, showdown win rate, etc.
7. **Advisor improvement data** - Identify blind spots and threshold adjustments

---

## Architecture

### Multi-Player Test Framework

```
┌─────────────────────────────────────────────────────────┐
│                   Game Engine                            │
│              (PyPokerEngine / Custom)                   │
└─────────────┬───────────────────────────┬───────────────┘
              │                           │
    ┌─────────▼─────────┐       ┌─────────▼─────────┐
    │   Seat 1 (Bot)    │       │   Seat 2 (Bot)    │
    │  Strategy: TAG    │       │  Strategy: LAG    │
    └─────────┬─────────┘       └─────────┬─────────┘
              │                           │
              ▼                           ▼
    ┌─────────────────────────────────────────────────────┐
    │                 Play Advisor API                     │
    │         localhost:3001/api/advise                   │
    │    Variants: omaha4, omaha5, omaha6                 │
    └─────────────────────────────────────────────────────┘
```

### Bot Strategy Types

| Strategy | Description | Aggression | Position Awareness |
|----------|-------------|------------|-------------------|
| **TAG** | Tight-Aggressive | High when engaged | Strong |
| **LAG** | Loose-Aggressive | Very high | Moderate |
| **NIT** | Ultra-tight | Low | Weak |
| **FISH** | Loose-Passive | Low | None |
| **MANIAC** | Hyper-aggressive | Maximum | None |
| **GTO** | Game Theory Optimal | Balanced | Strong |
| **EXPLOIT** | Exploitative | Adaptive | Strong |

### Omaha Variants

| Variant | Hole Cards | Play Advisor Config |
|---------|------------|---------------------|
| PLO4 | 4 cards | `gameVariant: "omaha4"` |
| PLO5 | 5 cards | `gameVariant: "omaha5"` |
| PLO6 | 6 cards | `gameVariant: "omaha6"` |

---

## Test Configurations

### Configuration 1: Full Ring (6-7 players)

```javascript
{
  players: 7,
  strategies: ["TAG", "TAG", "LAG", "NIT", "FISH", "MANIAC", "GTO"],
  variant: "omaha4",
  hands: 10000,
  initialStack: 10000,
  blinds: { small: 10, big: 20 }
}
```

### Configuration 2: Variant Comparison

Run same strategies across all three Omaha variants:
- 10,000 hands PLO4
- 10,000 hands PLO5  
- 10,000 hands PLO6

### Configuration 3: Strategy Tournament

Round-robin where each strategy plays against all others:
- 8 strategies × 7 opponents = 56 matchups
- 1,000 hands per matchup
- Track head-to-head win rates

---

## Data Collection

### Per-Hand Metrics

```javascript
{
  handId: number,
  variant: "omaha4" | "omaha5" | "omaha6",
  
  // Per player
  players: [{
    seat: number,
    strategy: string,
    holeCards: string[],
    
    // Decision tracking
    decisions: [{
      street: string,
      advisorAction: string,
      advisorConfidence: number,
      actionTaken: string,
      potOdds: number,
      equity: number
    }],
    
    // Outcome
    profit: number,
    wentToShowdown: boolean,
    wonAtShowdown: boolean
  }],
  
  // Hand outcome
  potSize: number,
  winner: string,
  winningHand: string
}
```

### Session Summary

```javascript
{
  sessionId: string,
  variant: string,
  handsPlayed: number,
  duration: number,
  
  // Per strategy results
  strategies: [{
    name: string,
    profit: number,
    bb100: number,
    vpip: number,  // Voluntarily Put In Pot
    pfr: number,   // Pre-Flop Raise
    wtsd: number,  // Went To ShowDown
    wsd: number,   // Won at ShowDown
    aggression: number
  }],
  
  // Advisor metrics
  advisorCalls: number,
  advisorErrors: number,
  lowConfidenceRate: number
}
```

---

## Operator-Assisted Real Platform Testing

### Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Operator   │     │    Agent     │     │   Platform   │
│   (Human)    │     │  (Claude)    │     │  (PokerNow)  │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │  1. Create game    │                    │
       │  2. Solve CAPTCHA  │                    │
       ├────────────────────┼────────────────────►
       │                    │                    │
       │  3. Hand off       │                    │
       │     control        │                    │
       ├───────────────────►│                    │
       │                    │                    │
       │                    │  4. Play hands     │
       │                    ├───────────────────►│
       │                    │                    │
       │  5. Intervention   │                    │
       │     if needed      │                    │
       │◄───────────────────┤                    │
```

### Operator Responsibilities

1. **Game Setup**
   - Navigate to poker platform
   - Complete CAPTCHA/verification
   - Create game with correct settings
   - Invite/approve bot players

2. **Monitoring**
   - Watch for disconnections
   - Handle platform-specific issues
   - Intervene if bots get stuck

3. **Session Management**
   - Start/stop test sessions
   - Export hand histories
   - Note any anomalies

### Agent Responsibilities

1. **Gameplay**
   - Read game state from browser
   - Consult Play Advisor for decisions
   - Execute actions (click buttons, input amounts)
   - Track results

2. **Error Handling**
   - Detect when stuck
   - Request operator intervention
   - Log issues for debugging

---

## Implementation Phases

### Phase 2A: Multi-Player PyPokerEngine Framework

**Timeline**: Immediate  
**Deliverables**:
- `MultiPlayerTestRunner.py` - Supports 2-7 players
- Multiple strategy implementations
- Omaha variant configuration
- Comprehensive data logging

### Phase 2B: Large-Scale Automated Testing

**Timeline**: After 2A complete  
**Deliverables**:
- Run 10,000+ hand sessions
- Statistical analysis scripts
- Performance reports per strategy
- Advisor accuracy metrics

### Phase 2C: Operator-Assisted Platform Testing

**Timeline**: After 2B proves strategies work  
**Deliverables**:
- Browser automation scripts (Playwright)
- Operator handoff protocol
- Real-money testing guidelines
- Platform-specific adapters

---

## Success Metrics

### Statistical Significance

- Minimum 5,000 hands per strategy per variant
- 95% confidence intervals on win rates
- Track variance (standard deviation)

### Performance Targets

| Metric | Target | Excellent |
|--------|--------|-----------|
| BB/100 vs Fish | > +5 | > +15 |
| Win rate vs Random | > 55% | > 65% |
| Advisor error rate | < 1% | < 0.1% |
| Low confidence rate | < 20% | < 10% |

---

## Next Steps

1. [ ] Build `MultiPlayerTestRunner.py`
2. [ ] Implement 7 strategy variants
3. [ ] Add proper Omaha card dealing
4. [ ] Run initial 1,000 hand test
5. [ ] Scale to 10,000 hands
6. [ ] Analyze results and iterate
