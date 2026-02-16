# Bet Sizer Design Document

**Phase 3 - Play Advisor**
**Created:** February 2026

---

## Overview

The Bet Sizer determines optimal bet and raise amounts based on:
- Stack-to-Pot Ratio (SPR)
- Hand strength and type (value vs bluff vs semi-bluff)
- Board texture (wet vs dry)
- Position
- Number of players
- Street (flop/turn/river)

---

## SPR Fundamentals

### Definition

```
SPR = Effective Stack / Current Pot Size

Effective Stack = min(Hero Stack, Villain Stack)
```

### Why SPR Matters

SPR determines how "deep" the stacks are relative to the pot. This affects:

1. **Commitment decisions** - Low SPR means bets commit you to the pot
2. **Hand value** - Speculative hands need high SPR, made hands want low SPR
3. **Bet sizing** - Deep stacks allow more streets of betting
4. **Fold equity** - Lower SPR = less fold equity

---

## SPR Zones and Strategies

### Zone 1: Micro SPR (< 2)

**Characteristics:**
- One bet commits the stack
- Binary decision: all-in or fold
- No room for multiple streets

**Sizing Strategy:**
```javascript
if (SPR < 2) {
  if (wantToCommit) {
    return { action: 'all-in', sizing: effectiveStack };
  } else {
    return { action: 'check' or 'fold' };
  }
}
```

**Hand Requirements:**
- Top pair+ for value
- Strong draws (12+ outs) for semi-bluff
- Air hands should just fold

---

### Zone 2: Short SPR (2-4)

**Characteristics:**
- One substantial bet commits
- Two streets of small betting possible
- Protection important

**Sizing Strategy:**
```javascript
// Value bet sizing
valueBet = {
  optimal: pot * 0.75,  // 75% pot
  min: pot * 0.66,      // 66% pot
  max: pot * 1.0        // Pot
};

// This sizing commits with one raise
// If villain raises, you're priced in
```

**Hand Requirements:**
- Two pair+ for value betting
- Sets should often just get it in
- Strong draws can semi-bluff

---

### Zone 3: Medium SPR (4-8)

**Characteristics:**
- Standard PLO stack depth
- Two-three streets of betting
- Most common scenario

**Sizing Strategy:**
```javascript
// Value bet sizing
valueBet = {
  flop: { optimal: pot * 0.60, min: pot * 0.50, max: pot * 0.75 },
  turn: { optimal: pot * 0.66, min: pot * 0.50, max: pot * 0.80 },
  river: { optimal: pot * 0.75, min: pot * 0.50, max: pot * 1.0 }
};

// Bluff sizing (smaller to maximize fold equity / bet ratio)
bluffBet = {
  flop: { optimal: pot * 0.40, min: pot * 0.33, max: pot * 0.50 },
  turn: { optimal: pot * 0.50, min: pot * 0.40, max: pot * 0.60 },
  river: { optimal: pot * 0.66, min: pot * 0.50, max: pot * 0.75 }
};
```

---

### Zone 4: Deep SPR (8-15)

**Characteristics:**
- Multiple streets of betting
- Speculative hands gain value
- Set mining profitable
- Pot control important

**Sizing Strategy:**
```javascript
// Smaller bets to build pot gradually
valueBet = {
  flop: { optimal: pot * 0.40, min: pot * 0.33, max: pot * 0.50 },
  turn: { optimal: pot * 0.50, min: pot * 0.40, max: pot * 0.66 },
  river: { optimal: pot * 0.66, min: pot * 0.50, max: pot * 0.80 }
};

// Even smaller bluffs
bluffBet = {
  flop: { optimal: pot * 0.33, min: pot * 0.25, max: pot * 0.40 },
  turn: { optimal: pot * 0.40, min: pot * 0.33, max: pot * 0.50 },
  river: { optimal: pot * 0.50, min: pot * 0.40, max: pot * 0.66 }
};
```

---

### Zone 5: Very Deep SPR (> 15)

**Characteristics:**
- Speculative hands shine
- Made hands need to be nutted
- Implied odds excellent for draws
- Multiple streets of maneuvering

**Sizing Strategy:**
```javascript
// Very small bets to control pot
valueBet = {
  flop: { optimal: pot * 0.33, min: pot * 0.25, max: pot * 0.40 },
  turn: { optimal: pot * 0.40, min: pot * 0.33, max: pot * 0.50 },
  river: { optimal: pot * 0.50, min: pot * 0.40, max: pot * 0.66 }
};
```

---

## Bet Type Categorization

### Value Bet

**Goal:** Get called by worse hands

**Sizing Considerations:**
- Size to maximize value from calling range
- Consider villain's calling tendencies
- Larger on wet boards (protection + value)
- Smaller with absolute nuts (keep them in)

```javascript
function valueBetSize(equity, boardTexture, SPR) {
  let base = getSPRBaseSizing(SPR, 'value');

  // Wet board adjustment: bet bigger for protection
  if (boardTexture.category === 'wet') {
    base.optimal *= 1.15;  // 15% larger
  }

  // Nut hand adjustment: can go smaller
  if (equity > 85) {
    base.optimal *= 0.85;  // 15% smaller to keep them in
  }

  return base;
}
```

---

### Semi-Bluff

**Goal:** Win pot now OR improve to best hand

**Requirements:**
- 30-50% equity (enough to continue if called)
- Nut draw preferred
- Fold equity exists (villain can fold)

**Sizing Considerations:**
- Size to maximize fold equity
- Consider future outs if called
- Position affects frequency (more IP)

```javascript
function semiBluffSize(drawEquity, foldEquity, SPR) {
  // Semi-bluffs should be sized to maximize EV
  // EV = (foldEquity * pot) + (1-foldEquity) * (equity * newPot - betSize)

  // Generally 40-60% pot works well
  let base = getSPRBaseSizing(SPR, 'bluff');

  // Strong draw: can size up
  if (drawEquity > 40) {
    base.optimal *= 1.1;
  }

  return base;
}
```

---

### Pure Bluff

**Goal:** Win pot through fold equity alone

**Requirements:**
- Little to no equity if called
- Believable story (board texture, previous actions)
- Villain capable of folding

**Sizing Considerations:**
- Minimum size to achieve folds
- River bluffs often need to be larger
- Story must be consistent

```javascript
function pureBluffSize(street, boardTexture, SPR) {
  let base = getSPRBaseSizing(SPR, 'bluff');

  // River bluffs often need to be polarized (large)
  if (street === 'river') {
    base.optimal *= 1.25;
  }

  return base;
}
```

---

### Protection Bet

**Goal:** Deny equity to drawing hands

**Requirements:**
- Vulnerable made hand (set on wet board)
- Multiple draws possible for opponent
- Not the stone cold nuts

**Sizing Considerations:**
- Size to give bad odds to draws
- Flush draws need 4:1, give them 2:1 (pot-sized)
- Consider all possible draws

```javascript
function protectionBetSize(handVulnerability, draws, SPR) {
  // More draws = larger bet
  const drawCount = draws.length;

  let multiplier = 1.0;
  if (drawCount >= 3) multiplier = 1.2;  // Multiple draws: bet big
  if (drawCount >= 5) multiplier = 1.4;  // Many draws: pot or more

  let base = getSPRBaseSizing(SPR, 'value');
  base.optimal *= multiplier;

  return base;
}
```

---

## Pot Geometry

### Understanding Pot Growth

```
Street 1: Pot = P
Bet 66%: New Pot = P + 0.66P + 0.66P = 2.32P

Street 2: Pot = 2.32P
Bet 66%: New Pot = 2.32P + 1.53P + 1.53P = 5.38P

Street 3: Pot = 5.38P
Bet 66%: New Pot = 5.38P + 3.55P + 3.55P = 12.48P
```

### Geometric Sizing

To build a specific final pot:

```javascript
function geometricSizing(currentPot, targetPot, streetsRemaining) {
  // What bet size on each street reaches target?
  // Assuming villain calls every bet

  const growthFactor = Math.pow(targetPot / currentPot, 1 / streetsRemaining);
  const betSizeRatio = (growthFactor - 1) / 2;

  return currentPot * betSizeRatio;
}

// Example: Pot = 100, want to get in 1000 over 2 streets
// geometricSizing(100, 1000, 2) = ~107 per street (107% pot bets)
```

---

## Multi-Street Planning

### Commitment Calculation

```javascript
function calculateCommitment(currentPot, betSize, stackRemaining) {
  const potAfterBet = currentPot + betSize * 2;  // Bet + call
  const stackAfterBet = stackRemaining - betSize;
  const sprAfterBet = stackAfterBet / potAfterBet;

  return {
    sprAfterBet,
    isCommitting: sprAfterBet < 2,
    percentCommitted: (stackRemaining - stackAfterBet) / stackRemaining
  };
}
```

### Street-by-Street Sizing

```javascript
const STREET_MULTIPLIERS = {
  // Flop sizing as base, multiply for later streets
  flop: 1.0,
  turn: 1.15,   // Slightly larger (pot is bigger)
  river: 1.25   // Largest (final street)
};

function adjustForStreet(baseSizing, street) {
  return {
    optimal: baseSizing.optimal * STREET_MULTIPLIERS[street],
    min: baseSizing.min * STREET_MULTIPLIERS[street],
    max: baseSizing.max * STREET_MULTIPLIERS[street]
  };
}
```

---

## Position Adjustments

### In Position (IP)

```javascript
const IP_ADJUSTMENTS = {
  canCheckBack: true,        // Pot control option
  bluffFrequency: 1.1,       // 10% more bluffs
  valueSizingMultiplier: 1.0, // Standard
  canDelayBet: true          // Check flop, bet turn
};
```

### Out of Position (OOP)

```javascript
const OOP_ADJUSTMENTS = {
  canCheckBack: false,
  bluffFrequency: 0.85,      // 15% fewer bluffs
  valueSizingMultiplier: 0.95, // Slightly smaller
  preferCheckRaise: true     // For strong hands
};

// OOP with strong hand: consider check-raise
function oopStrongHandSizing(pot, SPR, handStrength) {
  if (handStrength === 'nuts' && SPR > 4) {
    return {
      action: 'check-raise',
      sizing: {
        minRaise: pot * 3,     // 3x villain's bet
        optimal: pot * 3.5,
        max: pot * 4
      }
    };
  }
  // Else lead out
  return standardValueBet(pot, SPR);
}
```

---

## Raise Sizing

### Minimum Raise

```javascript
// PLO minimum raise = previous bet + amount to call
function minimumRaise(previousBet, amountToCall) {
  return previousBet + amountToCall;
}
```

### Standard Raise Sizes

```javascript
const RAISE_MULTIPLIERS = {
  minRaise: 2.0,     // 2x previous bet
  standard: 2.5,     // 2.5x (most common)
  large: 3.0,        // 3x
  polarized: 3.5,    // 3.5x (value or bluff)
  pot: 'pot'         // Full pot raise
};

function calculateRaiseSize(previousBet, pot, raiseType) {
  if (raiseType === 'pot') {
    // Pot raise = pot + call + call
    return pot + previousBet + previousBet;
  }
  return previousBet * RAISE_MULTIPLIERS[raiseType];
}
```

### When to Use Each Size

| Size | Use When |
|------|----------|
| Min raise | Pot control, drawing hand, inducing |
| Standard (2.5x) | Default value raise |
| Large (3x) | Strong value, protection needed |
| Polarized (3.5x+) | Nuts or bluff, fold equity important |
| Pot | Maximum pressure, willing to get all-in |

---

## Implementation

### Main BetSizer Function

```javascript
function calculateBetSize(params) {
  const {
    pot,
    effectiveStack,
    handStrength,      // 0-100 scale
    betType,           // 'value', 'semi-bluff', 'bluff', 'protection'
    boardTexture,
    position,          // 'IP' or 'OOP'
    street,
    villainTendency,   // 'calling-station', 'tight', 'balanced'
    previousBet        // For raise sizing
  } = params;

  const SPR = effectiveStack / pot;
  const sprZone = getSPRZone(SPR);

  // Get base sizing for SPR zone and bet type
  let sizing = getBaseSizing(sprZone, betType, street);

  // Apply adjustments
  sizing = adjustForBoardTexture(sizing, boardTexture, betType);
  sizing = adjustForPosition(sizing, position);
  sizing = adjustForVillain(sizing, villainTendency);

  // Calculate commitment
  const commitment = calculateCommitment(pot, sizing.optimal, effectiveStack);

  // Check if sizing makes sense
  if (sizing.optimal > effectiveStack) {
    sizing.optimal = effectiveStack;  // Cap at all-in
    sizing.isAllIn = true;
  }

  return {
    sizing: {
      min: Math.round(sizing.min),
      optimal: Math.round(sizing.optimal),
      max: Math.round(sizing.max),
      percentPot: Math.round((sizing.optimal / pot) * 100)
    },
    commitment,
    SPR,
    sprZone,
    reasoning: generateSizingReasoning(sizing, SPR, betType, commitment)
  };
}
```

---

## Constants

```javascript
export const SPR_THRESHOLDS = {
  MICRO: 2,
  SHORT: 4,
  MEDIUM: 8,
  DEEP: 15
};

export const BASE_SIZING = {
  micro: {
    value: { min: 1.0, optimal: 1.0, max: 1.0 },  // All-in
    bluff: { min: 1.0, optimal: 1.0, max: 1.0 }
  },
  short: {
    value: { min: 0.66, optimal: 0.75, max: 1.0 },
    bluff: { min: 0.50, optimal: 0.60, max: 0.75 }
  },
  medium: {
    value: { min: 0.50, optimal: 0.60, max: 0.75 },
    bluff: { min: 0.33, optimal: 0.45, max: 0.55 }
  },
  deep: {
    value: { min: 0.33, optimal: 0.45, max: 0.55 },
    bluff: { min: 0.25, optimal: 0.35, max: 0.45 }
  },
  veryDeep: {
    value: { min: 0.25, optimal: 0.35, max: 0.45 },
    bluff: { min: 0.20, optimal: 0.30, max: 0.40 }
  }
};

export const TEXTURE_ADJUSTMENTS = {
  wet: { value: 1.15, bluff: 1.0 },   // Bigger value bets
  dry: { value: 0.90, bluff: 1.1 },   // Smaller value, more bluffs
  monotone: { value: 1.20, bluff: 0.85 }  // Big protection, fewer bluffs
};
```
