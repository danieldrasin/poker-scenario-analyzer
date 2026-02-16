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

### Testing Deliverables (Phase 1)

| Deliverable | Description |
|-------------|-------------|
| `api/advise.test.js` | Unit tests for input validation, response formatting |
| `e2e/api.spec.ts` | New file - API-specific test suite |
| API tests | `/api/advise` endpoint tests in e2e suite |

**Test Cases:**
- Input validation (missing cards, invalid street, bad card format)
- Hand evaluation accuracy (all 9 hand types)
- Board texture classification (wet, dry, paired)
- Response latency (<50ms target)
- Error responses (proper status codes, messages)

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

### Testing Deliverables (Phase 2)

| Deliverable | Description |
|-------------|-------------|
| `api/lib/RangeEstimator.test.js` | Unit tests for range estimation |
| `api/lib/EquityCalculator.test.js` | Unit tests for equity calculation |
| API tests | Equity validation in e2e suite |

**Test Cases - RangeEstimator:**
- Position-based range selection (EP tight, BTN wide)
- Action adjustments (3-bet = narrow, limp = wide)
- Board texture narrowing (flush board removes non-flush combos)
- Multi-way pot adjustments

**Test Cases - EquityCalculator:**
- Heuristic equity vs known scenarios (e.g., nut flush vs medium range)
- Draw equity calculation (flush draw = 9 outs * rule of 4)
- Nut detection (isNuts flag accuracy)
- Caching hit/miss behavior
- Edge cases (0 outs, max outs)

**Golden Tests (Known Scenarios):**
| Scenario | Expected Equity Range |
|----------|----------------------|
| Nut flush vs random range | 75-85% |
| Overpair vs medium range | 55-65% |
| Flush draw vs top pair | 35-45% |
| Set vs two pair range | 70-80% |

---

## Phase 2.5: Test Backfill (NEW)

**Goal:** Write comprehensive tests for Phase 1 and Phase 2 modules that were implemented without tests

**Timeline:** 1-2 days
**Model:** 🟢 **Sonnet** (test implementation is straightforward)

### Tasks

| Task | Description | Files |
|------|-------------|-------|
| 2.5.1 | Create API test suite structure | `e2e/api.spec.ts` (new) |
| 2.5.2 | Write `/api/advise` endpoint tests | `e2e/api.spec.ts` |
| 2.5.3 | Write RangeEstimator unit tests | `api/lib/RangeEstimator.test.js` (new) |
| 2.5.4 | Write EquityCalculator unit tests | `api/lib/EquityCalculator.test.js` (new) |
| 2.5.5 | Add golden scenario tests (known outcomes) | `e2e/api.spec.ts` |
| 2.5.6 | Add latency benchmarks | `e2e/api.spec.ts` |
| 2.5.7 | Set up test runner for unit tests | `package.json` scripts |

### Test Framework Setup

```
poker-simulator/
├── api/
│   ├── advise.js
│   └── lib/
│       ├── RangeEstimator.js
│       ├── RangeEstimator.test.js    # NEW
│       ├── EquityCalculator.js
│       └── EquityCalculator.test.js  # NEW
├── e2e/
│   ├── app.spec.ts                   # EXISTS - UI tests
│   └── api.spec.ts                   # NEW - API test suite
└── package.json                      # Add test:unit script
```

### Deliverables

- Unit tests with >80% coverage for Phase 1-2 modules
- API test suite with 20+ test cases
- Golden scenario tests (5+ known poker scenarios)
- Latency benchmark tests (p50/p99 assertions)
- CI-compatible test scripts

### Success Criteria

- All tests pass locally and in CI
- Unit test coverage >80% for RangeEstimator, EquityCalculator
- API tests cover all documented response fields
- Golden tests validate accuracy within ±10%

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

### Testing Deliverables (Phase 3)

| Deliverable | Description |
|-------------|-------------|
| `api/lib/ActionRecommender.test.js` | Unit tests for decision logic |
| `api/lib/BetSizer.test.js` | Unit tests for bet sizing |
| API tests | Recommendation validation in e2e suite |

**Test Cases - ActionRecommender:**
- Fold threshold (equity < pot odds → fold)
- Call threshold (equity close to pot odds, implied odds positive)
- Raise threshold (equity well above pot odds, value hands)
- Position adjustments (IP more aggressive than OOP)
- Multi-street planning hints

**Test Cases - BetSizer:**
- SPR-based sizing (high SPR = smaller bets, low SPR = commit/fold)
- Pot geometry (bet size relative to pot)
- Min/max/optimal sizing calculations
- Protection sizing vs value sizing

**Golden Tests (Decision Scenarios):**
| Scenario | Expected Action | Notes |
|----------|-----------------|-------|
| Nut flush, heads-up, 50% pot bet | Raise | Clear value |
| Flush draw, pot odds 3:1, 9 outs | Call | Odds justify |
| Bottom pair, pot odds 4:1, 2 outs | Fold | Not enough equity |
| Top set, wet board, multi-way | Raise | Protection + value |

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

### Testing Deliverables (Phase 4)

| Deliverable | Description |
|-------------|-------------|
| E2E UI tests | Play Advisor tab tests in `e2e/app.spec.ts` |
| Mobile tests | Responsive layout verification |
| Accessibility | Keyboard navigation, ARIA labels |

**Test Cases - E2E UI:**
- Tab navigation to Play Advisor
- Card selector functionality (click to select/deselect)
- Board input (flop, turn, river progression)
- Betting inputs (pot, stack, to-call)
- Recommendation display (action, sizing, confidence)
- Reasoning panel expansion
- "What if?" scenario exploration
- Error states (incomplete input, API failure)

**Test Cases - Responsive:**
- Mobile viewport (375px) - all inputs accessible
- Tablet viewport (768px) - proper layout
- Desktop viewport (1280px) - full feature display

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

### Testing Principles

1. **Each phase must be tested before moving to the next**
2. **Unit tests live alongside their modules** (`*.test.js` files)
3. **API tests extend the existing e2e suite** (Playwright request API)
4. **E2E UI tests expand as Phase 4 progresses**

---

### Unit Test Requirements by Module

| Module | Test File | Key Tests |
|--------|-----------|-----------|
| `api/advise.js` | `api/advise.test.js` | Input validation, hand eval integration, response format |
| `api/lib/RangeEstimator.js` | `api/lib/RangeEstimator.test.js` | Position ranges, action adjustments, board texture narrowing |
| `api/lib/EquityCalculator.js` | `api/lib/EquityCalculator.test.js` | Heuristic equity, draw equity, nut detection, caching |
| `api/lib/ActionRecommender.js` | `api/lib/ActionRecommender.test.js` | Decision tree, fold/call/raise thresholds |
| `api/lib/BetSizer.js` | `api/lib/BetSizer.test.js` | SPR-based sizing, pot geometry |

### API Test Suite (`e2e/api.spec.ts`)

| Category | Tests |
|----------|-------|
| **Input Validation** | Missing fields, invalid card formats, out-of-range values |
| **Response Structure** | All required fields present, correct types |
| **Hand Evaluation** | Correct hand identification across all Omaha variants |
| **Board Texture** | Flush-heavy, straight-heavy, paired boards |
| **Equity Calculation** | Known scenarios vs expected ranges (±10% tolerance) |
| **Latency** | p50 < 50ms, p99 < 200ms |
| **Error Handling** | Graceful failures, meaningful error messages |

### E2E Test Extensions (`e2e/app.spec.ts`)

| Phase | Tests to Add |
|-------|--------------|
| Phase 1 | API advise endpoint basic tests |
| Phase 2 | Equity response validation |
| Phase 3 | Action recommendation tests |
| Phase 4 | UI Play Advisor tab, card selection, results display |

---

### Phase-by-Phase Testing Requirements

**Phase 1: Foundation MVP**
- [ ] Unit tests: `advise.test.js` (input parsing, hand eval, board texture)
- [ ] API tests: Add `/api/advise` tests to e2e suite
- [ ] Integration: Verify hand evaluator produces correct output

**Phase 2: Equity & Pot Odds**
- [ ] Unit tests: `RangeEstimator.test.js`, `EquityCalculator.test.js`
- [ ] API tests: Equity response validation, known scenarios
- [ ] Benchmarks: Latency under 100ms with caching

**Phase 3: Action Recommendations**
- [ ] Unit tests: `ActionRecommender.test.js`, `BetSizer.test.js`
- [ ] API tests: Recommendation accuracy, sizing validation
- [ ] Golden tests: Known scenarios with expected outcomes

**Phase 4: UI Integration**
- [ ] E2E UI tests: Tab navigation, card input, results display
- [ ] Accessibility: Keyboard navigation, screen reader compatibility
- [ ] Mobile: Touch interactions, responsive layout

**Phase 5: Refinement**
- [ ] Analytics: Track recommendation accuracy over time
- [ ] A/B framework: Compare heuristic versions

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
2. ✅ **Phase 1 Complete** (February 2026)
   - API endpoint: `POST /api/advise`
   - HandEvaluator integration ✓
   - FlopTexture analyzer integration ✓
   - Threat probability lookup from Tier 1 data ✓
   - Basic outs counter ✓
   - Pot odds calculator ✓
   - Response latency: <50ms target achieved (~1-5ms actual)
3. ✅ **Phase 2 Complete** (February 2026)
   - RangeEstimator: Position-based opponent range estimation ✓
   - EquityCalculator: Heuristic equity with draw equity ✓
   - Caching layer for repeat scenarios ✓
   - Latency: <100ms target achieved (~1-40ms actual)
4. ✅ **Phase 2.5 Complete** (February 2026)
   - Unit tests: RangeEstimator.test.js (33 tests) ✓
   - Unit tests: EquityCalculator.test.js (55 tests) ✓
   - API test suite: e2e/api.spec.ts (60+ test cases) ✓
   - Golden scenario tests included ✓
   - Latency benchmarks included ✓
   - Jest configuration with ESM support ✓
5. ✅ **Phase 3 Complete** (February 2026)
   - Design docs: ActionRecommender.design.md, BetSizer.design.md ✓
   - ActionRecommender module: Decision tree, reasoning, alternatives, warnings ✓
   - BetSizer module: SPR-based sizing with 5 zones ✓
   - Unit tests: ActionRecommender.test.js (38 tests) ✓
   - Unit tests: BetSizer.test.js (44 tests) ✓
   - Golden scenarios: Nut flush raise, flush draw call, weak fold ✓
   - API integration: Full recommendation with sizing in /api/advise ✓
   - Total tests: 170 passing ✓
6. ✅ **Phase 4 Complete** (February 2026)
   - Play Advisor tab added to web UI ✓
   - Card selector component (52 cards, mode switching) ✓
   - Board card input with street detection ✓
   - Betting inputs (pot, to call, stack) ✓
   - Situation inputs (game variant, position, players) ✓
   - Villain action tracking ✓
   - Auto-analyze on card selection ✓
   - Recommendation display with reasoning cards ✓
   - Mobile-responsive layout ✓
   - E2E tests: play-advisor.spec.ts (40+ test cases) ✓
7. ✅ **Phase 5 Complete** (February 2026)
   - Feedback mechanism: 👍/👎 buttons added to UI ✓
   - FeedbackStore module: File-based storage with analytics ✓
   - Feedback API: POST/GET /api/feedback endpoints ✓
   - Recommendation logging: All recommendations logged for analysis ✓
   - Analytics dashboard: Collapsible section with approval rate, action breakdown ✓
   - Negative feedback patterns: Pattern detection for tuning ✓
   - Unit tests: FeedbackStore.test.js (30 tests) ✓
   - Total tests: 200 passing ✓
