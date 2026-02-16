# Strategic Testing Approach - Collaboration Document

> **Purpose**: Validate the Play Advisor's guidance through multi-bot simulation
> **Status**: DRAFT - Open for ideas and feedback  
> **Contributors**: AI + Human

---

## Core Objective

**The whole point of testing is to VALIDATE THE EXISTING PLAY ADVISOR.**

The Play Advisor (`/api/advise`) already provides:
- Hand strength evaluation
- Board texture analysis
- Equity calculations
- Opponent range estimation  
- Action recommendations (fold/check/call/bet/raise)
- Bet sizing recommendations
- Reasoning explanations

**Testing Goal**: Run simulations to see if following the Play Advisor's guidance produces winning results over time.

---

## Current Play Advisor Capabilities

### What It Does Well ✅

| Component | Location | Function |
|-----------|----------|----------|
| Hand Evaluator | `packages/core/src/evaluator/` | Ranks any 5-card hand |
| Board Texture | `packages/core/src/analyzer/FlopTexture.ts` | Classifies boards |
| Action Recommender | `api/lib/ActionRecommender.js` | Decides fold/check/call/bet/raise |
| Bet Sizer | `api/lib/BetSizer.js` | Recommends sizing based on SPR |
| Equity Calculator | `api/lib/EquityCalculator.js` | Estimates win probability |
| Range Estimator | `api/lib/RangeEstimator.js` | Models opponent holdings |

### Decision Logic (from ActionRecommender.js)

The advisor uses these thresholds:
```javascript
EQUITY_THRESHOLDS = {
  CLEAR_FOLD_MARGIN: 10,      // Fold when equity < potOdds - 10%
  MARGINAL_ZONE: 5,           // Within ±5% of pot odds is marginal
  VALUE_RAISE_MARGIN: 15,     // Raise when equity > potOdds + 15%
  STRONG_VALUE_MARGIN: 30,    // Strong value when equity > potOdds + 30%
  SEMI_BLUFF_MIN: 30,         // Minimum equity for semi-bluff
  SEMI_BLUFF_MAX: 50          // Maximum equity (else value bet)
};
```

### Default Behavior

**When the advisor has no specific guidance, it defaults to FOLD.**
This is safe but potentially leaves money on the table. Testing should track when this happens.

---

## What We're Validating

### Question 1: Does following the advisor win money?
- Run 500+ hands with bots following advisor recommendations
- Compare final stack to starting stack
- Calculate BB/100 (big blinds won per 100 hands)

### Question 2: Are the equity thresholds correct?
- Track hands where advisor said "fold" but hand would have won
- Track hands where advisor said "call/raise" but lost
- Identify if thresholds need adjustment

### Question 3: What situations lack guidance?
- Log when advisor returns low confidence (<50%)
- Log when default fold is triggered  
- Identify patterns in "blind spots"

### Question 4: Does strategy setting affect outcomes?
- User mentioned 3 strategy settings (need to locate in UI)
- Test each setting with same hand distribution
- Compare win rates

---

## Testing Architecture

### Bot Types for Testing

**Bot A: Strict Advisor Follower**
- Always does exactly what Play Advisor recommends
- Never deviates regardless of confidence level
- Baseline for "does the advisor work?"

**Bot B: Confidence-Gated Follower**  
- Follows advisor when confidence > 60%
- Falls back to check/fold when confidence < 60%
- Tests if confidence is meaningful

**Bot C: Aggressive Deviation**
- Follows advisor but raises more often
- Adds 10% to aggression decisions
- Tests if advisor is too passive

**Bot D: Passive Deviation**
- Follows advisor but calls instead of raises
- Tests if advisor is too aggressive

---

## Data Collection Requirements

### Per-Hand Tracking

```javascript
{
  handId: 1,
  botName: "AdvisorFollower",
  
  // Game state when decision made
  street: "flop",
  holeCards: ["As", "Ks", "Qs", "Js"],
  board: ["Ts", "9s", "2h"],
  potSize: 100,
  toCall: 50,
  position: "BTN",
  
  // Advisor recommendation
  advisorAction: "raise",
  advisorConfidence: 0.85,
  advisorReasoning: "Strong value - nut flush",
  
  // Actual action taken
  actionTaken: "raise",
  amountBet: 150,
  
  // Outcome
  handWon: true,
  profit: 200,
  wentToShowdown: true,
  
  // Tracking gaps
  wasDefaultFold: false,
  confidenceLevel: "high"
}
```

### Session Summary

```javascript
{
  sessionId: "2025-02-14-001",
  botType: "StrictFollower",
  handsPlayed: 100,
  handsWon: 15,
  profit: 350,
  bb100: 17.5,
  
  // Advisor accuracy
  advisorCallsCorrect: 42,  // times advisor said call and we won
  advisorCallsWrong: 8,     // times advisor said call and we lost
  advisorFoldsCorrect: 35,  // times we folded losing hand
  advisorFoldsWrong: 5,     // times we folded winning hand
  
  // Gap analysis
  defaultFoldCount: 3,      // times no guidance, had to fold
  lowConfidenceCount: 12,   // times confidence < 60%
}
```

---

## Identifying Gaps in Play Advisor

### Scenarios to Watch For

1. **No board texture analysis** - Board patterns not covered
2. **Range estimation failure** - Can't model opponent's holdings
3. **Multi-way pot confusion** - Logic assumes heads-up
4. **Stack depth issues** - SPR calculations incorrect
5. **Position blindness** - Not adjusting for position enough

### How to Track Gaps

When advisor returns `confidence < 50%` or uses `defaultAction: 'fold'`:
1. Log the full game state
2. Record what hand type we had
3. Note the board texture
4. Track if fold was actually correct

This creates a dataset of "blind spots" to improve the advisor.

---

## Stack-Size Testing

### Why Different Starting Stacks Matter

The Play Advisor uses SPR (Stack-to-Pot Ratio) for decisions:
```javascript
SPR_ZONES = {
  MICRO: 2,    // Commitment territory
  SHORT: 4,    // Borderline commitment
  MEDIUM: 8,   // Standard decisions
  DEEP: 15     // Complex multi-street play
};
```

### Test Configurations

**Config 1: Even Stacks (50BB each)**
- All bots start with 1000 chips (50BB at 10/20)
- Tests "normal" play

**Config 2: Short Stack Test (10BB vs 100BB)**
- Some bots start with 200 chips (10BB)
- Tests short-stack strategy

**Config 3: Deep Stack Test (200BB each)**
- All bots start with 4000 chips
- Tests deep-stack play

### Questions to Answer

- Does the advisor adjust properly for stack depth?
- Which stack size produces best results?
- Do short stacks double up or bleed out?

---

## Implementation Priorities

### Phase 1: Basic Validation (Current)
- [x] Bot joining works
- [x] Play Advisor API exists and responds
- [ ] Bot can call Play Advisor and execute action
- [ ] Single session runs 50+ hands
- [ ] Basic outcome tracking

### Phase 2: Comparative Testing
- [ ] Multiple bot types running simultaneously
- [ ] Track advisor accuracy per bot type
- [ ] Identify systematic errors

### Phase 3: Gap Analysis
- [ ] Aggregate "low confidence" situations
- [ ] Build dataset of advisor blind spots
- [ ] Propose threshold adjustments

### Phase 4: Advisor Improvements
- [ ] Test adjusted thresholds
- [ ] Add coverage for blind spots
- [ ] Re-run validation

---

## Open Questions for Discussion

1. **Where are the 3 strategy settings?**
   - User mentioned these exist in the app
   - Need to locate in UI and understand what they change
   - May affect equity thresholds or risk tolerance

2. **How to handle multi-way pots?**
   - Current advisor may assume heads-up
   - Need to verify behavior with 3+ players

3. **What's acceptable variance?**
   - Poker has high variance
   - How many hands needed for statistical significance?
   - Probably 500+ minimum per configuration

4. **How to test different opponent types?**
   - Bots all follow advisor = homogeneous play
   - Need "chaos bot" that plays randomly?
   - Or deliberately exploitable bot?

---

## Your Ideas Here

*Add your thoughts, questions, and ideas below:*

### [2025-02-14] - Initial Framework
- Clarified: goal is to validate existing Play Advisor
- Default behavior is fold when no guidance
- Need to track when default fold occurs
- Testing should focus on advisor accuracy, not creating new strategies

