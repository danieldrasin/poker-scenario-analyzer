# Style Testing Requirements — VISUAL_REPORT.html

## Overview
The style differentiation visual report requires a **full game simulation**, not just unit tests of the decision engine. The simulation must be statistically significant and cover all meaningful matchup combinations.

## Requirements

### Simulation Scale
- **Minimum 2,000 hands per configuration** for statistical significance
- **Total hands: 50,000+** across all configurations
- Each configuration = one unique combination of (variant × table size × style matchup)

### Game Simulation (not unit tests)
- **Real card dealing** — shuffle deck, deal hole cards per variant (4/5/6 cards)
- **Blind rotation** — button moves each hand, SB/BB follow
- **Deal rotation** — proper positional play through full orbits
- **Full street progression** — preflop → flop → turn → river → showdown
- **Stack tracking** — each player starts with a stack, wins/loses per hand
- **Pot management** — proper pot building across streets

### Coverage Matrix
- **Variants**: PLO4, PLO5, PLO6
- **Table sizes**: 2 through 9 players
- **All 6 styles**: Nit, Rock, Reg, TAG, LAG, Fish
- **Style matchups**: At smaller table sizes (2-4p), need multiple games to cover all style combinations
  - 2p: C(6,2) = 15 unique matchups
  - 3p: C(6,3) = 20 unique matchups
  - 4p: C(6,4) = 15 unique matchups
  - 5p: C(6,5) = 6 unique matchups
  - 6p+: one game can include all 6 styles

### Decision Pipeline
Each player decision must go through the full Play Advisor pipeline:
1. Hand evaluation (HandEvaluator)
2. Board texture analysis (FlopTexture)
3. Opponent range estimation (RangeEstimator)
4. Equity calculation (EquityCalculator) with multiway discount
5. Action recommendation (ActionRecommender) with style-adjusted thresholds
6. Bet sizing (BetSizer) with style multipliers

### Metrics to Track Per Configuration
- **BB/100** (big blinds won per 100 hands) — primary win-rate metric
- **VPIP** (voluntarily put $ in pot) — should match style profile targets
- **PFR** (preflop raise %) — should match style pfrRatio
- **Aggression factor** — (bets + raises) / calls
- **Fold rate** per street
- **Average pot size**
- **Showdown win rate**
- **Action distribution** (fold/check/call/bet/raise counts)

### Visual Report (VISUAL_REPORT.html)
The report must include Chart.js visualizations:
- Cross-variant overview (BB/100 by style per variant)
- Heads-up results (all 15 pairwise matchups)
- Multi-way results (3-9 player tables)
- Style performance by position
- Aggression and fold rate comparisons
- Bet sizing distributions
- Key divergence scenarios
- Player count impact on strategy

### Infrastructure
- **Simulation runner**: `lib/test_style_large_scale.js` or `bot/ComprehensiveTestRunner.py`
- **Existing bot infrastructure**: `bot/` directory has PyPokerEngine adapters, game loops, data capture
- **Local advisor server**: `bot/LocalAdvisorServer.js` (port 3001) for API calls during simulation
- **Results storage**: JSON files in `bot/test_results/`
- **Core poker engine**: `packages/core/dist/` — Card, Deck, HandEvaluator, RankHand

### Configuration Example
```
PLO4 × 2p × 15 matchups × 2000 hands = 30,000 hands
PLO4 × 3p × 20 matchups × 2000 hands = 40,000 hands
PLO4 × 6p × 1 config   × 2000 hands =  2,000 hands
...repeat for PLO5, PLO6...
Total: 50,000-200,000+ hands depending on table sizes covered
```

### Key Principles
1. **Statistical significance** requires ≥2,000 hands per config
2. **Style coverage** requires all C(6,k) combinations at small tables
3. **The simulation must use the actual decision pipeline** (not synthetic/static params)
4. **Blind/deal rotation** must be realistic (not fixed positions)
5. **Results should be comparable** across variants and table sizes
