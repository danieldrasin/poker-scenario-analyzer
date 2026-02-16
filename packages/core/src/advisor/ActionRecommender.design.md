# Action Recommender Design Document

**Phase 3 - Play Advisor**
**Created:** February 2026

---

## Overview

The Action Recommender determines optimal actions (fold/call/raise) based on:
- Equity vs estimated opponent range
- Pot odds and implied odds
- Stack-to-pot ratio (SPR)
- Position (in position vs out of position)
- Board texture and vulnerability
- Hand type (made hand vs draw)

---

## Core Decision Framework

### Primary Decision Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| Equity vs Pot Odds | 40% | Mathematical foundation |
| Hand Strength | 25% | Nut potential, vulnerability |
| Position | 15% | IP vs OOP adjustments |
| SPR | 10% | Stack depth considerations |
| Board Texture | 10% | Draw-heavy vs static |

### Decision Tree

```
                    ┌─────────────────┐
                    │  Start Decision │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Calculate Equity │
                    │   vs Range (E)   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Calculate Pot    │
                    │   Odds (PO)      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼─────────┐    │    ┌─────────▼─────────┐
    │   E < PO - 10%    │    │    │   E > PO + 15%    │
    │   (Clear Fold)    │    │    │   (Value Range)   │
    └─────────┬─────────┘    │    └─────────┬─────────┘
              │              │              │
              ▼              │              ▼
           FOLD              │    ┌─────────────────┐
                             │    │  Check for      │
                             │    │  Raise/Bet      │
                             │    └────────┬────────┘
                             │             │
                    ┌────────▼────────┐    │
                    │   E ≈ PO        │    │
                    │ (Marginal)      │    │
                    └────────┬────────┘    │
                             │             │
              ┌──────────────┼─────────────┘
              │              │
    ┌─────────▼─────────┐    │
    │  Check Implied    │    │
    │     Odds          │    │
    └─────────┬─────────┘    │
              │              │
    Yes ──────┼────── No     │
              │              │
           CALL           FOLD
                             │
                    ┌────────▼────────┐
                    │ Determine Size  │
                    │  & Reasoning    │
                    └─────────────────┘
```

---

## Action Thresholds

### Fold Thresholds

| Scenario | Fold When |
|----------|-----------|
| Clear fold | Equity < (PotOdds - 10%) AND no draws |
| Marginal fold | Equity < PotOdds AND ImpliedOdds = "poor" |
| Trap avoidance | Made hand < Set AND board allows higher made hands |

### Call Thresholds

| Scenario | Call When |
|----------|-----------|
| Direct odds | Equity ≥ PotOdds AND Equity < (PotOdds + 15%) |
| Implied odds call | Equity < PotOdds BUT ImpliedOdds ≥ "good" AND nut draw |
| Set mining | Pair preflop AND SPR > 15 AND pot odds reasonable |
| Trapping | Equity > 70% AND villain likely to bluff more |

### Raise/Bet Thresholds

| Scenario | Raise When |
|----------|------------|
| Clear value | Equity > 65% AND can get called by worse |
| Semi-bluff | Equity 35-50% AND strong draw AND fold equity possible |
| Protection | Made hand vulnerable AND SPR allows fold equity |
| Pot control | Never (we call/check instead) |

---

## SPR-Based Sizing Strategy

### SPR Zones

```
SPR = EffectiveStack / PotSize

┌────────────────┬─────────────┬────────────────────────────────┐
│ SPR Zone       │ Value       │ Strategy                       │
├────────────────┼─────────────┼────────────────────────────────┤
│ Micro          │ < 2         │ Commit/fold. All-in or fold.   │
│ Short          │ 2-4         │ One street of betting commits. │
│ Medium         │ 4-8         │ Standard value/bluff sizing.   │
│ Deep           │ 8-15        │ Multi-street planning needed.  │
│ Very Deep      │ > 15        │ Set-mining, speculative hands. │
└────────────────┴─────────────┴────────────────────────────────┘
```

### Sizing by SPR

| SPR Zone | Value Sizing | Bluff Sizing | Notes |
|----------|--------------|--------------|-------|
| Micro (<2) | All-in | All-in | Binary decision |
| Short (2-4) | 75-100% pot | N/A | Commit with value |
| Medium (4-8) | 50-75% pot | 33-50% pot | Standard play |
| Deep (8-15) | 33-50% pot | 25-33% pot | Build pot gradually |
| Very Deep (>15) | 25-40% pot | 20-25% pot | Pot control important |

---

## Position Adjustments

### In Position (IP) Advantages

| Advantage | Adjustment |
|-----------|------------|
| Information edge | +5% aggression threshold |
| Pot control option | Can check back for pot control |
| Bluff opportunity | Higher bluff frequency viable |
| Implied odds | Better realization of draws |

### Out of Position (OOP) Adjustments

| Factor | Adjustment |
|--------|------------|
| Information deficit | -5% aggression threshold |
| Check-raise option | Use for value and semi-bluffs |
| Lead (donk) betting | Rarely; only with specific reads |
| Pot size management | Prefer smaller pots OOP |

### Position Matrix

```
                        ┌─────────────────────────────┐
                        │       Hero Position         │
                        ├──────────┬──────────────────┤
                        │    IP    │       OOP        │
┌───────────────────────┼──────────┼──────────────────┤
│ Strong Made Hand      │ Value bet│ Check-raise or   │
│ (Set+)                │ 60-75%   │ lead 50-66%      │
├───────────────────────┼──────────┼──────────────────┤
│ Medium Made Hand      │ Value bet│ Check-call or    │
│ (Top pair good kick)  │ 40-60%   │ small lead 33-50%│
├───────────────────────┼──────────┼──────────────────┤
│ Weak Made Hand        │ Check or │ Check-fold or    │
│ (Bottom pair)         │ small bet│ check-call       │
├───────────────────────┼──────────┼──────────────────┤
│ Strong Draw           │ Semi-blf │ Check-raise or   │
│ (Nut flush draw)      │ 50-75%   │ lead 40-60%      │
├───────────────────────┼──────────┼──────────────────┤
│ Weak Draw             │ Check or │ Check-fold       │
│ (Gutshot only)        │ small    │                  │
└───────────────────────┴──────────┴──────────────────┘
```

---

## Omaha-Specific Considerations

### Hand Vulnerability in PLO

| Made Hand | Vulnerability | Action Bias |
|-----------|---------------|-------------|
| Top set | Medium | Bet for value + protection |
| Middle/bottom set | High | Bet for protection |
| Nut flush | Low | Slow play possible on static boards |
| Non-nut flush | Very High | Proceed with extreme caution |
| Nut straight | Medium | Board texture dependent |
| Non-nut straight | Very High | Often a fold vs aggression |
| Two pair | Very High | Usually just a bluff catcher |
| Overpair | Extremely High | Rarely strong in PLO |

### The Nuts Principle

In Omaha, players often have very strong hands due to 4-6 hole cards.

**Key Rules:**
1. Non-nut hands are worth much less than in Hold'em
2. Drawing to the nuts is critical
3. Made hands need to be protected or they get outdrawn
4. Aggression with non-nut hands is often punished

---

## Multi-Street Planning

### Street-by-Street Strategy

| Street | Goal | Key Consideration |
|--------|------|-------------------|
| Flop | Assess hand strength, set up future streets | SPR after flop bet |
| Turn | Realize equity or protect made hand | Card changed texture? |
| River | Value bet or bluff-catch | Did draws complete? |

### Commitment Threshold

```
If current pot bet would commit > 33% of remaining stack:
  → Consider if hand is strong enough to commit fully
  → If yes: Plan to get all-in
  → If no: Consider checking/pot control
```

---

## Reasoning Generator Structure

### Reasoning Categories

1. **Mathematical** - Equity vs odds justification
2. **Strategic** - Position, board texture factors
3. **Protective** - Vulnerability considerations
4. **Exploitative** - Opponent-specific adjustments

### Reasoning Template

```javascript
{
  primary: "Your {handStrength} has {equity}% equity vs villain's {rangeDescription}",
  mathReasoning: "Pot odds require {breakeven}%, you have {equity}%",
  strategicReasoning: "{positionAdvantage}. {boardTextureConsideration}",
  actionReasoning: "{actionVerb} because {primaryReason}",
  warnings: ["Consider {risk}"]
}
```

### Example Reasonings

**Value Raise:**
> "Your nut flush has 81% equity vs villain's medium range. You're getting 33% pot odds but have massive edge - raise for value. Being in position lets you control the size. Raise to 75% pot to maximize value while keeping worse hands calling."

**Marginal Call:**
> "Your flush draw has 35% equity vs villain's tight range. Pot odds require 33% to call. With good implied odds (deep stacks), calling is profitable. Don't raise - you want to see the turn cheaply."

**Clear Fold:**
> "Your two pair has only 22% equity vs villain's range after the check-raise. Pot odds require 40%. Folding saves money. Two pair is rarely good in Omaha when facing aggression."

---

## Alternative Lines

### Structure

```javascript
{
  alternatives: [
    {
      action: "call",
      reasoning: "Keep villain's bluffs in",
      risk: "Miss value from worse hands",
      ev: "+0.3 BB"
    },
    {
      action: "raise small",
      reasoning: "Build pot with equity advantage",
      risk: "Face re-raise with medium hand",
      ev: "+0.5 BB"
    }
  ]
}
```

### When to Show Alternatives

- Equity within ±10% of threshold
- Multiple viable strategic approaches
- Opponent-specific considerations might change action
- Educational value for user

---

## Warning System

### Warning Categories

| Category | Trigger | Message Template |
|----------|---------|------------------|
| Nut Risk | Non-nut flush/straight | "Higher {hand} possible" |
| Draw Heavy | Wet board + made hand | "Many draws available for opponent" |
| Reverse Implied | Drawing to 2nd best | "Be cautious - not drawing to nuts" |
| Commitment | Bet commits stack | "This bet commits you to the pot" |
| Bluff Catcher | Can only beat bluffs | "You can only beat a bluff here" |
| Cooler Alert | Very strong vs very strong | "If raised, you may be coolered" |

---

## Implementation Constants

```javascript
// Equity thresholds (percentages)
const THRESHOLDS = {
  CLEAR_FOLD: -10,        // Below pot odds by this margin
  MARGINAL_CALL: 0,       // At pot odds
  VALUE_RAISE: 15,        // Above pot odds by this margin
  STRONG_VALUE: 30,       // Way above pot odds
  SEMI_BLUFF_MIN: 30,     // Minimum equity for semi-bluff
  SEMI_BLUFF_MAX: 50      // Maximum equity (else value bet)
};

// SPR zones
const SPR_ZONES = {
  MICRO: 2,
  SHORT: 4,
  MEDIUM: 8,
  DEEP: 15
};

// Sizing percentages (of pot)
const SIZING = {
  SMALL: { min: 25, max: 40 },
  MEDIUM: { min: 50, max: 66 },
  LARGE: { min: 75, max: 100 },
  OVERBET: { min: 100, max: 150 }
};

// Position multipliers
const POSITION_ADJUSTMENT = {
  IP: 1.05,   // 5% more aggressive
  OOP: 0.95   // 5% more conservative
};
```

---

## API Response Extension

```typescript
interface ActionRecommendation {
  action: 'fold' | 'call' | 'raise' | 'check' | 'bet';
  confidence: number;           // 0-1
  sizing?: {
    min: number;
    optimal: number;
    max: number;
    unit: 'percent_pot' | 'bb' | 'dollars';
  };
  reasoning: {
    primary: string;
    math: string;
    strategic: string;
    warnings: string[];
  };
  alternatives?: Array<{
    action: string;
    reasoning: string;
    risk: string;
    evDifference?: string;
  }>;
  commitment?: {
    currentCommitment: number;   // % of stack in pot
    afterAction: number;         // % after recommended action
    isCommitting: boolean;       // True if > 33% stack
  };
}
```

---

## Next Steps

1. Implement `ActionRecommender.js` with decision tree
2. Implement `BetSizer.js` with SPR-based sizing
3. Integrate into `/api/advise` endpoint
4. Write unit tests for thresholds and sizing
5. Add golden tests for known scenarios
