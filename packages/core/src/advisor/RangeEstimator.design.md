# Opponent Range Estimation - Design Document

## Overview

Estimate opponent hand ranges for equity calculation without requiring real-time simulation.
Uses heuristic-based range profiling based on position, action, and street.

---

## Design Philosophy

### Omaha-Specific Considerations

Unlike Hold'em where ranges are card-specific (e.g., "AK, QQ+"), Omaha ranges are better
modeled as **hand category distributions** because:

1. Too many starting combinations (270,725 in PLO4)
2. Hand strength is highly board-dependent
3. Post-flop hand types matter more than specific holdings

### Approach: Category-Based Ranges

Instead of tracking specific cards, we model ranges as probability distributions over
**hand categories** (the same categories used in our existing probability matrix):

- High Card (0)
- Pair (1)
- Two Pair (2)
- Three of a Kind (3)
- Straight (4)
- Flush (5)
- Full House (6)
- Four of a Kind (7)
- Straight Flush (8)
- Royal Flush (9)

---

## Range Profiles

### Preflop Ranges by Position

```typescript
interface PreflopRange {
  position: 'EP' | 'MP' | 'CO' | 'BTN' | 'SB' | 'BB';
  action: 'fold' | 'limp' | 'call' | 'raise' | '3bet';
  rangeWidth: number;  // 0-1, how wide the range is
  handStrengthBias: 'premium' | 'balanced' | 'speculative';
}
```

| Position | Open Range | 3-Bet Range | Call Range |
|----------|------------|-------------|------------|
| EP       | 15%        | 5%          | 10%        |
| MP       | 22%        | 7%          | 15%        |
| CO       | 30%        | 10%         | 20%        |
| BTN      | 45%        | 12%         | 30%        |
| SB       | 30%        | 8%          | 25%        |
| BB       | -          | 10%         | 40%        |

### Postflop Ranges by Action

Actions narrow ranges significantly. Key heuristics:

**Bet/Raise Actions:**
- Large bet (>75% pot): Polarized (monsters or bluffs)
- Medium bet (40-75% pot): Value-heavy
- Small bet (<40% pot): Merged range, thin value + draws

**Check/Call Actions:**
- Check-call: Medium strength (pair+, draws)
- Check-raise: Very strong or semi-bluff
- Call multiple streets: Usually made hand or strong draw

---

## Implementation Design

### 1. RangeProfile Class

```typescript
interface RangeProfile {
  // Distribution over hand types (sums to 1.0)
  handTypeDistribution: {
    [handType: number]: number;  // handType 0-9 -> probability
  };

  // Adjustments
  nutBias: number;          // 0-1, how likely to have the nuts within type
  drawHeavy: boolean;       // true if range includes many draws
  bluffFrequency: number;   // 0-1, how often betting with air
}
```

### 2. Range Estimation Algorithm

```typescript
function estimateOpponentRange(
  position: string,
  actions: Action[],
  board: Card[],
  street: 'preflop' | 'flop' | 'turn' | 'river',
  playersRemaining: number
): RangeProfile {

  // Start with position-based preflop range
  let range = getPreflopRange(position);

  // Apply action adjustments for each street
  for (const action of actions) {
    range = applyActionAdjustment(range, action, street);
  }

  // Apply board texture adjustments
  range = applyBoardAdjustment(range, board);

  // Apply multi-way pot narrowing
  if (playersRemaining > 2) {
    range = narrowForMultiway(range, playersRemaining);
  }

  return range;
}
```

### 3. Action Adjustments

```typescript
const ACTION_ADJUSTMENTS = {
  // Flop actions
  'flop_bet_large': {
    // Shift distribution toward strong hands and bluffs
    shiftStrong: 0.3,
    bluffComponent: 0.15,
    removeWeak: true
  },
  'flop_check_call': {
    // Keep medium strength hands
    shiftMedium: 0.2,
    removeMonsters: 0.5,  // Some monsters slow-play
    removeAir: true
  },
  'flop_check_raise': {
    // Very polarized
    shiftStrong: 0.5,
    bluffComponent: 0.25,
    removeMiddle: true
  },
  // ... similar for turn and river
};
```

### 4. Board Texture Adjustments

Use existing FlopTexture analyzer to adjust ranges:

```typescript
function applyBoardAdjustment(range: RangeProfile, board: Card[]): RangeProfile {
  const texture = analyzeFlopTexture(board.slice(0, 3));

  if (texture.flushMade) {
    // On monotone boards, continuing ranges are flush-heavy
    range.handTypeDistribution[5] *= 2.5;  // Flush
    range.handTypeDistribution[8] *= 3.0;  // Straight flush
    normalizeDistribution(range);
  }

  if (texture.connectivity === 'connected') {
    // Connected boards have more straights
    range.handTypeDistribution[4] *= 1.5;  // Straight
  }

  if (texture.isPaired) {
    // Paired boards have more boats
    range.handTypeDistribution[6] *= 1.8;  // Full house
  }

  return range;
}
```

---

## Equity Calculation Using Ranges

Once we have a RangeProfile, equity calculation becomes:

```typescript
function calculateEquityVsRange(
  heroHand: HandRank,
  opponentRange: RangeProfile
): number {
  let equity = 0;

  for (const [handType, probability] of Object.entries(opponentRange.handTypeDistribution)) {
    if (heroHand.type > parseInt(handType)) {
      // Hero beats this hand type
      equity += probability * 1.0;
    } else if (heroHand.type === parseInt(handType)) {
      // Same type - need to compare kickers (estimate 50% for now)
      equity += probability * 0.5;
    }
    // Hero loses to higher hand types - adds 0
  }

  return equity * 100;  // Return as percentage
}
```

This is a **simplified equity estimate** that avoids Monte Carlo simulation for the
initial implementation. It can be refined later with:

1. Kicker comparison within hand types
2. Draw equity (outs × 2 for turn, outs × 4 for two cards)
3. Monte Carlo sampling for more precision

---

## Default Range Profiles

### Tight Range (EP open, 3-bet pots)
```javascript
{
  handTypeDistribution: {
    0: 0.05,  // High card (rare, usually has something)
    1: 0.15,  // Pair
    2: 0.25,  // Two pair
    3: 0.15,  // Set
    4: 0.15,  // Straight
    5: 0.12,  // Flush
    6: 0.10,  // Full house
    7: 0.02,  // Quads
    8: 0.01,  // Straight flush
    9: 0.00   // Royal
  },
  nutBias: 0.7,
  drawHeavy: false,
  bluffFrequency: 0.05
}
```

### Medium Range (CO/BTN open, single raised pot)
```javascript
{
  handTypeDistribution: {
    0: 0.10,
    1: 0.20,
    2: 0.25,
    3: 0.12,
    4: 0.12,
    5: 0.10,
    6: 0.08,
    7: 0.02,
    8: 0.01,
    9: 0.00
  },
  nutBias: 0.5,
  drawHeavy: true,
  bluffFrequency: 0.10
}
```

### Wide Range (BB defend, limped pots)
```javascript
{
  handTypeDistribution: {
    0: 0.15,
    1: 0.25,
    2: 0.22,
    3: 0.10,
    4: 0.10,
    5: 0.08,
    6: 0.07,
    7: 0.02,
    8: 0.01,
    9: 0.00
  },
  nutBias: 0.3,
  drawHeavy: true,
  bluffFrequency: 0.15
}
```

---

## Integration with Play Advisor API

The range estimator will be called from `/api/advise`:

```typescript
// In advise.js
const opponentRange = estimateOpponentRange(
  villainPosition,
  villainActions,
  parsedBoard,
  street,
  playersInHand
);

const equityEstimate = calculateEquityVsRange(handRank, opponentRange);

// Add to response
response.analysis.equity = {
  estimated: equityEstimate,
  vsRange: describeRange(opponentRange),  // "Tight range", "Wide range", etc.
  confidence: assessConfidence(villainActions)  // More actions = higher confidence
};
```

---

## Future Improvements

1. **Monte Carlo refinement**: Sample actual hands from range for precision
2. **Action history weighting**: Weight recent actions more heavily
3. **Player type modeling**: Adjust ranges for known tight/loose players
4. **Bet sizing tells**: Extract information from specific bet sizes
5. **ML-based ranges**: Train model on hand histories for better estimation
