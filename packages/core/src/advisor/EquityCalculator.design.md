# Equity Calculator - Design Document

## Overview

Calculate equity (probability of winning) against opponent ranges in Omaha poker.
Must achieve <100ms latency for real-time play advice.

---

## Calculation Strategies

### Strategy 1: Heuristic Equity (Fast, ~1ms)

Compare hero's hand type against opponent's range distribution:

```
Equity = Σ P(opp has hand type i) × P(hero beats hand type i)
```

**Pros:**
- Instant calculation
- No randomness
- Consistent results

**Cons:**
- Doesn't account for board runout
- Misses draw equity
- Approximation only

### Strategy 2: Monte Carlo Sampling (Accurate, ~50-100ms)

Sample random opponent hands and board runouts:

```
1. For each iteration (N = 1000):
   a. Sample opponent hole cards from range
   b. Sample remaining board cards
   c. Evaluate both hands
   d. Count wins/ties/losses
2. Equity = (wins + ties/2) / N
```

**Pros:**
- Accurate equity estimation
- Captures draw equity
- Handles complex scenarios

**Cons:**
- Slower (~50-100ms for 1000 iterations)
- Results vary slightly each call

### Strategy 3: Hybrid Approach (Recommended)

Use heuristic for quick estimate, Monte Carlo for precision when needed:

```
1. Calculate heuristic equity (instant)
2. If user requests OR situation is complex:
   a. Run Monte Carlo (1000 iterations)
   b. Blend results for final estimate
```

---

## Implementation Design

### 1. Heuristic Calculator

```typescript
interface HeuristicEquity {
  equity: number;           // 0-100
  breakdown: {
    beatHigherTypes: number;
    beatSameType: number;
    beatLowerTypes: number;
  };
  confidence: 'low' | 'medium' | 'high';
}

function calculateHeuristicEquity(
  heroHand: HandRank,
  boardTexture: FlopTextureAnalysis,
  opponentRange: RangeProfile,
  street: Street
): HeuristicEquity {

  let equity = 0;

  // Base equity from hand type comparison
  for (let oppType = 0; oppType <= 9; oppType++) {
    const oppProb = opponentRange.handTypeDistribution[oppType] || 0;

    if (heroHand.type > oppType) {
      equity += oppProb;  // Hero wins
    } else if (heroHand.type === oppType) {
      // Same type - estimate based on primary rank
      equity += oppProb * estimateKickerWinRate(heroHand, oppType);
    }
    // Lower types contribute 0
  }

  // Adjust for draws if not on river
  if (street !== 'river') {
    const drawAdjustment = calculateDrawEquity(heroHand, boardTexture, street);
    equity = blendEquity(equity, drawAdjustment);
  }

  return {
    equity: equity * 100,
    breakdown: computeBreakdown(heroHand, opponentRange),
    confidence: assessConfidence(opponentRange)
  };
}
```

### 2. Monte Carlo Calculator

```typescript
interface MonteCarloEquity {
  equity: number;
  samples: number;
  wins: number;
  ties: number;
  losses: number;
  standardError: number;
}

function calculateMonteCarloEquity(
  heroHoleCards: Card[],
  board: Card[],
  opponentRange: RangeProfile,
  gameRules: GameRules,
  iterations: number = 1000
): MonteCarloEquity {

  const deck = createDeck();
  removeCards(deck, [...heroHoleCards, ...board]);

  let wins = 0, ties = 0, losses = 0;

  for (let i = 0; i < iterations; i++) {
    // Sample opponent hand from range
    const oppHand = sampleHandFromRange(deck, opponentRange, gameRules);

    // Sample remaining board
    const remainingDeck = removeCards(deck.slice(), oppHand);
    const fullBoard = [...board, ...sampleCards(remainingDeck, 5 - board.length)];

    // Evaluate both hands
    const heroRank = evaluateBestHand(heroHoleCards, fullBoard, gameRules);
    const oppRank = evaluateBestHand(oppHand, fullBoard, gameRules);

    // Compare
    const result = compareHandRanks(heroRank.rank, oppRank.rank);
    if (result > 0) wins++;
    else if (result < 0) losses++;
    else ties++;
  }

  return {
    equity: ((wins + ties / 2) / iterations) * 100,
    samples: iterations,
    wins,
    ties,
    losses,
    standardError: calculateStandardError(wins, ties, losses, iterations)
  };
}
```

### 3. Hand Sampling from Range

Key challenge: how to sample hands that match a range profile?

```typescript
function sampleHandFromRange(
  deck: Card[],
  range: RangeProfile,
  rules: GameRules
): Card[] {

  // Rejection sampling approach:
  // 1. Generate random hand
  // 2. Check if it fits range profile
  // 3. Accept with probability based on range

  const maxAttempts = 100;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Deal random hole cards
    const shuffled = shuffle(deck);
    const holeCards = shuffled.slice(0, rules.holeCardCount);

    // Estimate hand strength (preflop categories)
    const preflopStrength = categorizePreflopHand(holeCards);

    // Accept based on range width
    const acceptProbability = getAcceptProbability(preflopStrength, range);

    if (Math.random() < acceptProbability) {
      return holeCards;
    }
  }

  // Fallback: return random hand
  return shuffle(deck).slice(0, rules.holeCardCount);
}
```

---

## Draw Equity Calculation

Omaha has significant draw equity due to multiple outs.

### Rule of 4 and 2

Quick estimate:
- **Two cards to come (flop):** Outs × 4 = approximate equity
- **One card to come (turn):** Outs × 2 = approximate equity

### Outs Table for Common Draws

| Draw Type              | Outs | Flop→River | Turn→River |
|------------------------|------|------------|------------|
| Nut flush draw         | 9    | 36%        | 18%        |
| Open-ended straight    | 8    | 32%        | 16%        |
| Gutshot straight       | 4    | 16%        | 8%         |
| Wrap (13 outs)         | 13   | 52%        | 26%        |
| Big wrap (17 outs)     | 17   | 68%        | 34%        |
| Combo draw (flush+wrap)| 20+  | 70%+       | 40%+       |

### Draw Equity Implementation

```typescript
function calculateDrawEquity(
  heroHand: HandRank,
  boardTexture: FlopTextureAnalysis,
  outs: OutsInfo,
  street: Street
): number {

  if (street === 'river') return 0;

  const cardsTocome = street === 'flop' ? 2 : 1;
  const multiplier = cardsTocome === 2 ? 4 : 2;

  // Base draw equity from outs
  let drawEquity = outs.toImprove * multiplier;

  // Cap at reasonable maximum
  drawEquity = Math.min(drawEquity, 70);

  // Adjust for nut potential
  // Non-nut draws are worth less
  if (!outs.draws.some(d => d.includes('nut') || d.includes('Nut'))) {
    drawEquity *= 0.7;  // 30% discount for non-nut draws
  }

  return drawEquity / 100;  // Return as decimal
}
```

---

## Latency Optimization

### Target: <100ms total API response

| Component | Target | Technique |
|-----------|--------|-----------|
| Hand evaluation | <1ms | Existing code |
| Board texture | <1ms | Existing code |
| Range estimation | <5ms | Precomputed profiles |
| Heuristic equity | <1ms | Direct calculation |
| Monte Carlo (if used) | <80ms | 1000 iterations, optimized |
| Response formatting | <5ms | Simple JSON |

### Monte Carlo Optimization

```typescript
// Optimization techniques:

// 1. Precompute deck arrays
const FULL_DECK = precomputeDeck();

// 2. Use typed arrays for speed
const deckBuffer = new Uint8Array(52);

// 3. Inline evaluation for hot path
function fastEvaluate(cards: Uint8Array): number {
  // Optimized bit manipulation
}

// 4. Early termination when equity converges
function monteCarloWithEarlyStop(
  ...args,
  convergenceThreshold: number = 0.01
): MonteCarloEquity {
  let prevEquity = 0;

  for (let batch = 0; batch < 10; batch++) {
    runBatch(100);  // 100 iterations per batch

    const currentEquity = (wins + ties/2) / totalSamples;

    if (Math.abs(currentEquity - prevEquity) < convergenceThreshold) {
      break;  // Converged, stop early
    }
    prevEquity = currentEquity;
  }
}

// 5. Web Worker for parallel computation (client-side)
// Offload Monte Carlo to background thread
```

---

## Caching Strategy

Cache common scenarios to avoid recalculation:

```typescript
interface EquityCacheKey {
  heroHandType: number;
  boardCategory: string;
  opponentRangeType: string;
  street: string;
}

const equityCache = new Map<string, number>();

function getCachedEquity(key: EquityCacheKey): number | undefined {
  const keyString = JSON.stringify(key);
  return equityCache.get(keyString);
}

function setCachedEquity(key: EquityCacheKey, equity: number): void {
  const keyString = JSON.stringify(key);
  equityCache.set(keyString, equity);

  // Limit cache size
  if (equityCache.size > 10000) {
    // Remove oldest entries (LRU)
    const firstKey = equityCache.keys().next().value;
    equityCache.delete(firstKey);
  }
}
```

---

## Response Format

```typescript
interface EquityResponse {
  equity: {
    estimated: number;      // 0-100 percentage
    vsRange: string;        // "vs tight range", "vs wide range"
    confidence: string;     // "low", "medium", "high"
    method: string;         // "heuristic" or "monte-carlo"
  };
  breakdown?: {
    vsWeaker: number;       // % opponent range we beat
    vsSimilar: number;      // % where kickers matter
    vsStronger: number;     // % opponent range that beats us
  };
  drawEquity?: {
    current: number;        // Current made hand equity
    withDraws: number;      // Including draw potential
    outs: number;
  };
}
```

---

## Implementation Priority

1. **First:** Heuristic equity (instant, good enough for MVP)
2. **Second:** Draw equity adjustment (improves accuracy)
3. **Third:** Monte Carlo option (for precision mode)
4. **Fourth:** Caching layer (reduces repeated calculations)
5. **Fifth:** Client-side Web Worker (for heavy computation)
