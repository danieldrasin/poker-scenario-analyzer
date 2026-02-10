# Play Advisor Implementation Plan

**Created:** February 2026
**Status:** Planning Complete - Ready for Implementation
**Reference:** See `PLAY_ADVISOR_DESIGN.md` for detailed architecture

---

## Overview

Build a real-time play advisor API that provides actionable recommendations during live Omaha poker play. The system will leverage existing simulation data and hand evaluation code, extended with new equity and decision-making components.

---

## Phase 1: Foundation MVP

**Goal:** Validate the concept with instant analysis (no equity calculations yet)

**Timeline:** 2-3 days
**Model:** 🟢 **Sonnet** (straightforward integration of existing code)

### Tasks

| Task | Description | Files Involved |
|------|-------------|----------------|
| 1.1 | Create `/api/advise.js` endpoint scaffold | `api/advise.js` (new) |
| 1.2 | Build input parser for game state JSON | `api/advise.js` |
| 1.3 | Integrate HandEvaluator for current hand strength | `packages/core/src/evaluator/` |
| 1.4 | Integrate FlopTexture analyzer for board classification | `packages/core/src/analyzer/FlopTexture.ts` |
| 1.5 | Add threat lookup from probability matrix (Tier 1 data) | `packages/web/data/` |
| 1.6 | Build response formatter with analysis structure | `api/advise.js` |
| 1.7 | Add basic outs counter | `api/advise.js` or new utility |

### Deliverable

API returns:
- Current hand strength ("Nut flush", "Top set", etc.)
- Board texture category + danger level
- Threat probability ("15% chance opponent has better")
- Basic outs count

### Success Criteria

- API responds in <50ms
- Correct hand evaluation for all Omaha variants
- Accurate board texture classification

---

## Phase 2: Equity & Pot Odds

**Goal:** Add equity estimation and pot odds calculations

**Timeline:** ~1 week
**Model:** 🟠 **Opus** for equity algorithm design, 🟢 **Sonnet** for implementation

### Tasks

| Task | Model | Description |
|------|-------|-------------|
| 2.1 | 🟠 Opus | Design opponent range estimation heuristics |
| 2.2 | 🟠 Opus | Design lightweight equity calculator algorithm |
| 2.3 | 🟢 Sonnet | Implement range estimator based on position + action |
| 2.4 | 🟢 Sonnet | Implement Monte Carlo equity calc (1000 iterations) |
| 2.5 | 🟢 Sonnet | Add pot odds calculator |
| 2.6 | 🟢 Sonnet | Add implied odds estimator |
| 2.7 | 🟢 Sonnet | Build caching layer for common scenarios |
| 2.8 | 🟢 Sonnet | Optimize for <100ms latency target |

### Deliverable

API adds:
- Equity estimate vs opponent range
- Pot odds to call
- Implied odds assessment
- Break-even percentage

### Success Criteria

- Equity calculation <100ms
- Reasonable accuracy vs GTO solver (within 10%)
- Caching reduces repeat lookups to <10ms

---

## Phase 3: Action Recommendations

**Goal:** Provide full action recommendations with bet sizing

**Timeline:** ~2 weeks
**Model:** 🟠 **Opus** for strategy logic, 🟢 **Sonnet** for implementation

### Tasks

| Task | Model | Description |
|------|-------|-------------|
| 3.1 | 🟠 Opus | Design decision tree for action selection |
| 3.2 | 🟠 Opus | Design bet sizing algorithm (SPR-based) |
| 3.3 | 🟠 Opus | Define position-aware adjustments |
| 3.4 | 🟢 Sonnet | Implement action recommender |
| 3.5 | 🟢 Sonnet | Implement bet sizing engine |
| 3.6 | 🟢 Sonnet | Add multi-street planning hints |
| 3.7 | 🟢 Sonnet | Build reasoning generator (explain WHY) |
| 3.8 | 🟢 Sonnet | Add alternative lines with tradeoffs |
| 3.9 | 🟢 Sonnet | Add warnings for common mistakes |

### Deliverable

API adds:
- Action recommendation (fold/call/raise)
- Bet sizing (min/max/optimal)
- Confidence score
- Reasoning explanation
- Alternative lines
- Warnings

### Success Criteria

- Recommendations align with standard Omaha strategy
- Clear, understandable reasoning
- Sizing within reasonable ranges

---

## Phase 4: UI Integration

**Goal:** Add Play Advisor to the web UI

**Timeline:** ~1 week
**Model:** 🟢 **Sonnet** (UI work)

### Tasks

| Task | Description |
|------|-------------|
| 4.1 | Design Play Advisor UI panel |
| 4.2 | Add hand input interface (card selector) |
| 4.3 | Add board input interface |
| 4.4 | Add betting situation inputs (pot, bet to call, stacks) |
| 4.5 | Display recommendation with reasoning |
| 4.6 | Add "What if?" scenario exploration |
| 4.7 | Mobile-responsive layout |

### Deliverable

- New "Play Advisor" tab in the web app
- Full input interface for game state
- Real-time recommendations as inputs change

---

## Phase 5: Refinement & Learning

**Goal:** Improve accuracy based on feedback

**Timeline:** Ongoing
**Model:** 🟠 **Opus** for analysis, 🟢 **Sonnet** for implementation

### Tasks

| Task | Model | Description |
|------|-------|-------------|
| 5.1 | 🟢 Sonnet | Add feedback mechanism (👍/👎 on recommendations) |
| 5.2 | 🟢 Sonnet | Log recommendations for analysis |
| 5.3 | 🟠 Opus | Analyze feedback patterns |
| 5.4 | 🟠 Opus | Tune heuristics based on results |
| 5.5 | 🟠 Opus | Consider ML-based range estimation (optional) |

---

## Model Selection Rationale

### Use 🟠 Opus When:

- Designing new algorithms (equity calculation, range estimation)
- Making strategic decisions about poker theory
- Analyzing complex tradeoffs
- Debugging non-obvious issues
- Tuning heuristics that require poker expertise

### Use 🟢 Sonnet When:

- Implementing well-defined algorithms
- Building API endpoints
- UI development
- Integration work with existing code
- Standard CRUD and file operations
- Following established patterns

---

## API Specification Summary

### Endpoint: `POST /api/advise`

```typescript
// Request
interface PlayAdvisorRequest {
  gameVariant: 'omaha4' | 'omaha5' | 'omaha6';
  street: 'preflop' | 'flop' | 'turn' | 'river';
  holeCards: string[];        // ["As", "Ks", "Qs", "Js"]
  board: string[];            // ["Ts", "9s", "2h"]
  position: string;           // "BTN", "CO", "MP", etc.
  playersInHand: number;
  potSize: number;
  toCall: number;
  stackSize: number;
  villainActions?: string[];  // ["raise", "call"] - what opponents did
}

// Response
interface PlayAdvisorResponse {
  recommendation: {
    action: 'fold' | 'call' | 'raise';
    sizingMin?: number;
    sizingMax?: number;
    sizingOptimal?: number;
    confidence: number;       // 0-1
  };
  analysis: {
    currentHand: {
      madeHand: string;       // "Flush", "Set", etc.
      handStrength: string;   // "Nut flush (Ace-high)"
      isNuts: boolean;
    };
    boardTexture: {
      category: string;
      dangerLevel: string;
      description: string;
    };
    equity?: {
      estimated: number;
      vsRange: string;
      confidence: string;
    };
    outs?: {
      toImprove: number;
      draws: string[];
    };
    potOdds?: {
      toCall: number;
      impliedOdds: string;
      breakeven: number;
    };
    threats: string[];
  };
  reasoning: string[];
  alternativeLines?: Array<{
    action: string;
    reasoning: string;
    risk: string;
  }>;
  warnings: string[];
  latencyMs: number;
}
```

---

## File Structure (Planned)

```
poker-simulator/
├── api/
│   ├── advise.js                    # NEW - Main API endpoint
│   └── ...
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── advisor/             # NEW - Play advisor logic
│   │       │   ├── index.ts
│   │       │   ├── EquityCalculator.ts
│   │       │   ├── RangeEstimator.ts
│   │       │   ├── ActionRecommender.ts
│   │       │   ├── BetSizer.ts
│   │       │   └── types.ts
│   │       ├── analyzer/
│   │       │   ├── FlopTexture.ts   # EXISTS
│   │       │   ├── ProbabilityAnalyzer.ts  # EXISTS
│   │       │   └── OutsCounter.ts   # NEW
│   │       └── ...
│   └── web/
│       └── src/
│           └── public/
│               ├── play-advisor.js  # NEW - UI component
│               └── ...
└── PLAY_ADVISOR_DESIGN.md           # EXISTS - Detailed architecture
```

---

## Dependencies

### Existing (No Changes Needed)

- `packages/core/src/evaluator/` - Hand evaluation
- `packages/core/src/analyzer/FlopTexture.ts` - Board analysis
- `packages/core/src/analyzer/ProbabilityAnalyzer.ts` - Query scenarios
- `packages/web/data/` - Tier 1 bundled data

### New Dependencies

- None required for Phase 1-3
- Phase 5 (optional): TensorFlow.js if adding ML-based range estimation

---

## Testing Strategy

| Phase | Testing Approach |
|-------|------------------|
| Phase 1 | Unit tests for hand eval + board texture |
| Phase 2 | Compare equity estimates vs known solver outputs |
| Phase 3 | Manual testing with poker experts |
| Phase 4 | E2E tests for UI flow |
| Phase 5 | A/B testing of recommendation accuracy |

---

## Open Questions (For Phase 2+)

1. **Range estimation:** How conservative should we be? (affects equity)
2. **Bet sizing:** Use simplified GTO or exploitative sizing?
3. **Multi-way pots:** How to adjust equity for 3+ players?
4. **Stack depth:** At what SPR do we switch strategies?

*These questions should be addressed by Opus during Phase 2/3 design.*

---

## Next Steps

1. ✅ Complete design documentation (this file + PLAY_ADVISOR_DESIGN.md)
2. ⏳ **Start Phase 1** with Sonnet when ready
3. Review Phase 1 results before proceeding to Phase 2
