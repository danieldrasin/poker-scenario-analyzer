# Play Advisor API - High-Level Design

## Executive Summary

**Question:** Can this framework support real-time play decisions?

**Answer:** **Partially yes, with extensions.** The existing codebase provides a solid foundation (~60% of what's needed), but real-time play requires additional computation layers that don't currently exist.

---

## Current Framework Capabilities

### What We Have ✅

| Component | Location | Capability | Real-Time Usable? |
|-----------|----------|------------|-------------------|
| **Hand Evaluator** | `packages/core/src/evaluator/` | Rank any 5-card hand, compare hands | ✅ Yes - instant |
| **Flop Texture Analyzer** | `packages/core/src/analyzer/FlopTexture.ts` | Classify boards into 12 strategic categories | ✅ Yes - instant |
| **Probability Matrix** | Pre-computed data (Tier 1/2) | P(opponent has hand type Y \| I have type X) | ✅ Yes - lookup |
| **Starting Hand Categorizer** | `packages/core/src/categorizer/` | Classify Omaha starting hands | ✅ Yes - instant |
| **Scenario Query API** | `packages/core/src/analyzer/ProbabilityAnalyzer.ts` | Query specific scenarios from simulation data | ✅ Yes - instant |
| **Monte Carlo Engine** | `packages/core/src/simulator/` | Run simulations for any scenario | ⚠️ Slow for real-time |

### What's Missing ❌

| Capability | Why Needed | Complexity |
|------------|-----------|------------|
| **Equity Calculator** | "What % do I win against range X?" | High - needs opponent range modeling |
| **Outs Counter** | "How many cards improve my hand?" | Medium - straightforward calculation |
| **Pot Odds Calculator** | "Is this call +EV?" | Low - simple math |
| **Street-by-Street Equity** | Update equity as board develops | Medium - can use existing evaluator |
| **Opponent Range Estimator** | Model likely holdings based on actions | High - needs heuristics/ML |
| **Bet Sizing Recommendations** | Optimal bet amounts | Medium - game theory based |

---

## Data Sufficiency Analysis

### The Core Question

Current system answers:
> "When I have a **FLUSH**, what % of opponents have a **FULL HOUSE or better**?"

Real-time play needs:
> "Given I have **A♠K♠Q♠J♠** on board **T♠9♠2♥** against 2 opponents who called, what is my equity and what should I do?"

### Gap Analysis

| Aspect | Current Data | Real-Time Need | Gap |
|--------|--------------|----------------|-----|
| Hand type distributions | ✅ Have | ✅ Sufficient | None |
| Specific card combinations | ❌ Aggregated | Need specific | **Large** |
| Board texture analysis | ✅ Have | ✅ Sufficient | None |
| Opponent range modeling | ❌ None | Critical for equity | **Large** |
| Position-based adjustments | ⚠️ Basic | Need more nuance | Medium |
| Stack/pot dynamics | ❌ None | Needed for sizing | **Large** |

### Latency Assessment

| Data Tier | Latency | Suitable for Live Play? |
|-----------|---------|------------------------|
| Tier 1 (Bundled JSON) | <10ms | ✅ Yes |
| Tier 2 (R2) | 100-500ms | ✅ Yes (with caching) |
| Tier 3 (Live Simulation) | 1-10s | ❌ No (pre-flop only) |
| New equity calc (client-side) | 50-200ms | ✅ Yes (if optimized) |

---

## Proposed Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Play Advisor API                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │   INPUT      │    │  PROCESSING  │    │   OUTPUT     │     │
│  │   Parser     │───▶│    Engine    │───▶│   Advisor    │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │ • Hole cards │    │ • Hand eval  │    │ • Action rec │     │
│  │ • Board      │    │ • Flop text  │    │ • Confidence │     │
│  │ • Position   │    │ • Equity est │    │ • Reasoning  │     │
│  │ • Pot size   │    │ • Outs count │    │ • Warnings   │     │
│  │ • Bet to call│    │ • Matrix     │    │ • Alt lines  │     │
│  │ • Players    │    │   lookup     │    │              │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐│
│  │                    DATA LAYER                              ││
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      ││
│  │  │ Tier 1  │  │ Tier 2  │  │ Flop    │  │ Hand    │      ││
│  │  │ Bundled │  │   R2    │  │ Texture │  │ Eval    │      ││
│  │  │  <10ms  │  │ ~200ms  │  │  <5ms   │  │  <1ms   │      ││
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘      ││
│  └────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### API Design

#### Endpoint: `POST /api/advise`

**Request:**
```json
{
  "gameVariant": "omaha4",
  "street": "flop",
  "holeCards": ["As", "Ks", "Qs", "Js"],
  "board": ["Ts", "9s", "2h"],
  "position": "BTN",
  "playersInHand": 3,
  "potSize": 150,
  "toCall": 50,
  "stackSize": 500,
  "action": {
    "preflop": ["raise", "call", "call"],
    "flop": ["check", "bet 50"]
  }
}
```

**Response:**
```json
{
  "recommendation": {
    "action": "raise",
    "sizingMin": 150,
    "sizingMax": 250,
    "sizingOptimal": 175,
    "confidence": 0.92
  },
  "analysis": {
    "currentHand": {
      "madeHand": "Flush",
      "handStrength": "Nut flush (Ace-high)",
      "isNuts": true
    },
    "boardTexture": {
      "category": "two-tone-connected",
      "dangerLevel": "very-high",
      "description": "Two-tone connected - flush and straight draws everywhere"
    },
    "equity": {
      "estimated": 78.5,
      "vsRange": "top 30% of continuing range",
      "confidence": "medium"
    },
    "outs": {
      "toImprove": 0,
      "note": "Already have the nuts"
    },
    "potOdds": {
      "toCall": 25.0,
      "impliedOdds": "excellent",
      "breakeven": 25.0
    },
    "threats": [
      "Board could pair (opponent boats up)",
      "4th flush card kills action",
      "Straight card might scare opponents"
    ]
  },
  "reasoning": [
    "You have the nut flush on a very wet board",
    "Multiple draws are present - opponents have equity",
    "Raise for value and protection against draws",
    "Sizing: 3x to deny correct odds to straight draws"
  ],
  "alternativeLines": [
    {
      "action": "call",
      "reasoning": "Trap line - let draws catch up",
      "risk": "Free cards can beat you"
    }
  ],
  "warnings": [
    "If board pairs on turn, reassess - boats beat flushes"
  ],
  "dataSource": {
    "handEval": "real-time",
    "boardTexture": "real-time",
    "threatMatrix": "tier1-bundled",
    "equityEstimate": "heuristic"
  },
  "latencyMs": 45
}
```

---

## Implementation Phases

### Phase 1: Foundation (Can build with existing code)
**Effort: ~2-3 days**

- [ ] API endpoint scaffolding
- [ ] Input parser for game state
- [ ] Integrate existing HandEvaluator
- [ ] Integrate existing FlopTexture analyzer
- [ ] Basic threat lookup from probability matrix
- [ ] Simple outs counter

**Deliverable:** API that gives board analysis + hand strength + threat levels

### Phase 2: Equity Estimation (New development needed)
**Effort: ~1 week**

- [ ] Opponent range estimator (heuristic-based)
- [ ] Monte Carlo equity calculator (client-side, 1000 iterations)
- [ ] Caching layer for common scenarios
- [ ] Pot odds calculator

**Deliverable:** API that adds equity estimates + pot odds analysis

### Phase 3: Action Recommendations (Requires strategy engine)
**Effort: ~2 weeks**

- [ ] Action decision tree
- [ ] Bet sizing engine
- [ ] Position-aware adjustments
- [ ] Stack-to-pot ratio considerations
- [ ] Multi-street planning

**Deliverable:** Full action recommendations with sizing

### Phase 4: Learning & Refinement
**Effort: Ongoing**

- [ ] Track recommendation accuracy
- [ ] Collect feedback on decisions
- [ ] Tune heuristics based on results
- [ ] Add ML-based range estimation (optional)

---

## Technical Considerations

### Latency Budget (for live play)

| Component | Target | Notes |
|-----------|--------|-------|
| Input parsing | <5ms | Trivial |
| Hand evaluation | <1ms | Existing code |
| Board texture | <5ms | Existing code |
| Matrix lookup | <10ms | Tier 1 data |
| Equity estimation | <100ms | New component - critical path |
| Decision engine | <20ms | New component |
| Response formatting | <5ms | Trivial |
| **Total** | **<150ms** | Acceptable for live play |

### Data Storage Strategy

```
Pre-computed (Tier 1/2):
├── Hand type distributions by player count ✅ EXISTS
├── Threat probability matrices ✅ EXISTS
├── Starting hand categories ✅ EXISTS
└── Common board texture patterns (NEW)

Real-time calculated:
├── Specific hand evaluation ✅ EXISTS
├── Board texture classification ✅ EXISTS
├── Outs counting (NEW)
├── Equity estimation (NEW)
└── Action recommendations (NEW)
```

### Client vs Server Split

| Computation | Where | Why |
|-------------|-------|-----|
| Hand evaluation | Client | Instant, no network |
| Board texture | Client | Instant, no network |
| Matrix lookup | Server (cached) | Data size |
| Equity calculation | Client | Latency-critical |
| Action recommendation | Either | Could be rules-based client-side |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Equity estimates too slow | Medium | High | Use heuristics, limit iterations |
| Recommendations too simplistic | High | Medium | Start with "standard" plays, iterate |
| Opponent modeling inaccurate | High | Medium | Use conservative assumptions |
| Users expect GTO solver quality | Medium | High | Set clear expectations in UI |

---

## Conclusion

### Can we build this? **YES**

The existing framework provides:
- ✅ Hand evaluation (instant)
- ✅ Board texture analysis (instant)
- ✅ Threat probabilities (pre-computed)
- ✅ Starting hand guidance (instant)

We need to add:
- 🔨 Equity calculator (~100ms target)
- 🔨 Outs counter (trivial)
- 🔨 Pot odds calculator (trivial)
- 🔨 Decision engine (rule-based initially)

### Recommended First Step

Build a **Phase 1 MVP** that provides:
1. "You have: Nut flush"
2. "Board is: Very wet (two-tone connected)"
3. "Threat level: 15% chance opponent has better"
4. "Pot odds: 25% to call"

This can be built in 2-3 days with existing code and validates the concept before investing in equity calculations.

---

## Appendix: Existing Code References

### Key Files to Leverage

```
packages/core/src/evaluator/HandEvaluator.ts  - Hand ranking
packages/core/src/evaluator/HandRank.ts       - Hand type definitions
packages/core/src/analyzer/FlopTexture.ts     - Board classification
packages/core/src/analyzer/ProbabilityAnalyzer.ts - Query simulation data
packages/core/src/categorizer/OmahaStartingHand.ts - Starting hands
packages/web/src/public/poker-stats.js        - Client-side calculations
```

### Existing Type Definitions

```typescript
// From packages/core/src/simulator/types.ts
interface ProbabilityMatrixEntry {
  playerHandType: HandType;
  opponentHandType: HandType;
  playerCount: number;
  opponentCount: number;
  probability: number;
}

// From packages/core/src/analyzer/FlopTexture.ts
interface FlopTextureAnalysis {
  category: FlopTextureCategory;
  suitedness: FlopSuitedness;
  connectivity: FlopConnectivity;
  nutDangerLevel: 'low' | 'medium' | 'high' | 'very-high' | 'extreme';
  straightDrawPossible: boolean;
  flushDrawPossible: boolean;
  // ... more
}
```
