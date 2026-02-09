# Strategic Hand Evaluation Frameworks

This document outlines the distinct strategic evaluation dimensions for Hold'em and Omaha poker, which should inform how we display and analyze hand data in the simulator.

---

## Hold'em Strategic Dimensions

### 1. Raw Win Rate
**What it measures:** How often this hand wins at showdown
**Why it matters:** Basic equity against random hands
**Simulation metric:** `winRate`

### 2. Implied Odds Potential (IOP)
**What it measures:** Ability to win large pots when you hit
**Why it matters:** Small pairs and suited connectors rarely win, but win big when they do
**Key hands:** 22-66, suited connectors (76s, 87s), suited aces
**Characteristic:** Win small pots rarely → Win big pots occasionally

**How to compute:**
- High IOP: Hands that make hidden monsters (sets, flushes, straights)
- Track: Average pot size when winning vs. when losing

### 3. Reverse Implied Odds Risk (RIO)
**What it measures:** Danger of losing large pots with second-best hands
**Why it matters:** Dominated hands (KJ vs KQ, A5 vs AK) lose maximum when they connect
**Key hands:** Weak kickers, dominated pairs, non-nut flush draws
**Characteristic:** Win small pots → Lose big pots

**How to compute:**
- High RIO: Hands that make second-best often
- Track: How often you have best hand vs 2nd best when you "connect"

### 4. Showdown Value (SDV)
**What it measures:** Strength without improvement
**Why it matters:** Premium pairs can win unimproved; speculative hands cannot
**Key hands:** AA, KK, QQ, AK (high SDV); 76s, 22 (low SDV)

**How to compute:**
- Track: Win rate when hand doesn't improve from preflop

### 5. Volatility Index
**What it measures:** Variance in outcomes
**Why it matters:** Bankroll management, game selection
**Low volatility:** Premium pairs (consistent small-medium wins)
**High volatility:** Suited connectors (mostly small losses, occasional big wins)

**How to compute:**
- Standard deviation of pot sizes won/lost
- Ratio of big pot wins to total wins

### 6. Stack Depth Sensitivity
**What it measures:** How performance changes with deeper stacks
**Why it matters:** Tournament vs cash game strategy
**Deep stack favored:** Speculative hands (more implied odds)
**Short stack favored:** Premium hands (less post-flop play)

---

## Omaha Strategic Dimensions

### 1. Raw Win Rate
**What it measures:** How often this hand wins at showdown
**Caveat:** Less meaningful in Omaha due to closer equities preflop
**Simulation metric:** `winRate`

### 2. Nuttiness (Nut Potential)
**What it measures:** How often the hand makes the absolute nuts
**Why it matters:** In multiway pots, second-best hands lose stacks
**Key concept:** "If you're not drawing to the nuts, you're drawing dead"

**High nuttiness hands:**
- Double-suited to the Ace (can make nut flush in two suits)
- Big rundowns (AKQJ, KQJT) - make nut straights
- AAxx with suited ace

**Low nuttiness hands:**
- Kxxx suited (second-nut flush risk)
- Low rundowns (6543) - make low-end straights
- Middle pairs without nut redraws

**How to compute:**
- Track: % of time final hand is the nuts vs 2nd/3rd nuts
- Count "nut outs" vs "fake outs"

### 3. Reverse Nut Implied Odds (RNIO)
**What it measures:** Risk of making strong-but-second-best hands
**Why it matters:** The most expensive PLO mistake is stacking off with 2nd nuts
**Classic RNIO situation:** Flopping a set on a monotone board without flush redraw

**High RNIO hands:**
- Kxxx suited (second-nut flush)
- Low rundowns (make dummy end of straights)
- Unpaired hands on paired boards

**How to compute:**
- Track: Times you make 2nd/3rd best vs times you make nuts
- "Cooler frequency"

### 4. Post-Flop Vulnerability (Equity Swing)
**What it measures:** How much the flop changes your position
**Why it matters:** Strong preflop ≠ strong postflop in Omaha
**Key insight:** "You might be strong before the flop but a complete underdog after"

**How to compute:**
- Variance in equity from preflop to flop
- % of flops where you go from favorite to underdog

### 5. Multiway Playability
**What it measures:** Performance with 3+ players in the pot
**Why it matters:** Omaha is often multiway; strategies differ from heads-up
**Good multiway:** Nutty hands, double-suited, big cards
**Poor multiway:** Middle rundowns, single-suited non-nuts

**How to compute:**
- Compare win rate in 2-way vs 4-way vs 6-way pots
- How much does win rate degrade with more players?

### 6. Blocker Value
**What it measures:** Ability to block opponents' nut hands
**Why it matters:** Holding the Ace of a suit is valuable even without the flush
**Key insight:** Blockers enable effective bluffing and reduce opponent nut frequency

**How to compute:**
- Track: When you hold nut blockers, how often does opponent have nuts?
- Bluffing success rate with blocker hands

### 7. Equity Realization
**What it measures:** How much theoretical equity you actually capture
**Why it matters:** Some hands play well; others are hard to navigate post-flop
**High realization:** In-position, nutty draws, clear decisions
**Low realization:** Out of position, marginal hands, tough decisions

**How to compute:**
- Actual win rate vs theoretical preflop equity
- Compare same hand in position vs out of position

---

## Comparison Matrix

| Dimension | Hold'em Importance | Omaha Importance |
|-----------|-------------------|------------------|
| Raw Win Rate | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Implied Odds Potential | ⭐⭐⭐⭐ | ⭐⭐ |
| Reverse Implied Odds | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Nuttiness | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Post-Flop Vulnerability | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Multiway Playability | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Blocker Value | ⭐⭐ | ⭐⭐⭐⭐ |
| Showdown Value | ⭐⭐⭐⭐ | ⭐⭐ |
| Stack Depth Sensitivity | ⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## Proposed UI Views

### View 1: Strategy Selector
Allow users to choose which strategic lens to evaluate hands through:
- "Tournament Short Stack" → emphasize showdown value, de-emphasize implied odds
- "Cash Game Deep Stack" → emphasize implied odds, multiway play
- "Heads-Up" → raw equity matters more
- "6-Max Multiway" → nuttiness critical

### View 2: Hand Category Scoring
For each starting hand category, show multiple scores:
```
┌─────────────────────────────────────────────────────────────┐
│ AAxx Double-Suited                                          │
├─────────────────────────────────────────────────────────────┤
│ Win Rate: ████████░░ 31%    Nuttiness: █████████░ 92%      │
│ RNIO Risk: ██░░░░░░░░ 15%   Multiway:  ████████░░ 85%      │
│ Volatility: ███░░░░░░░ 28%  Blocker:   ████████░░ 78%      │
└─────────────────────────────────────────────────────────────┘
```

### View 3: Situational Recommendations
Based on game context, highlight which hands to play:
- "High nuttiness required" → filter to nutty hands
- "Implied odds available" → show speculative hands
- "Showdown-focused" → show premium made hands

### View 4: "What Beats What" Expanded
Not just "when I have X, opponent has Y" but:
- "When I have X and opponent has Y, how often is mine best?"
- "When I make a flush, how often is it the nut flush?"

---

## Implementation Notes

To compute these metrics, the simulator needs to track:

1. **Nut tracking:** For each showdown, was the winner's hand the nuts?
2. **Hand improvement:** Track if hand improved from preflop
3. **Pot size correlation:** Track pot size with outcome
4. **Blocker presence:** Track when blockers are held
5. **Equity at each street:** Snapshot equity preflop/flop/turn/river

Some metrics require new simulation modes:
- "Situational simulation" - fix board textures, vary hands
- "Equity swing analysis" - compute equity changes street by street
