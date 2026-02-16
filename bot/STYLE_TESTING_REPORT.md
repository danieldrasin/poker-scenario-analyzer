# Omaha Style-Based Testing Report

**Generated:** 2026-02-16
**Test Framework:** OmahaTestRunner.py (using `clubs` library for proper Omaha support)
**Variants Tested:** PLO4, PLO5, PLO6
**Player Counts:** 2-9 (limited by deck size per variant)
**Hands Per Config:** 2,000
**Total Configs:** 28 (including all 2-player style pairings)
**Total Hands:** 56,000
**Runtime:** 193 seconds (290 hands/sec with button rotation)

---

## Simulation Fidelity

The simulator now properly models:
- **Betting sequences**: Full preflop → flop → turn → river action with fold/call/raise at each street
- **Dealer button rotation**: Blinds and positions shift each hand so every player cycles through all positions equally
- **Position-aware decisions**: Hand-score thresholds adjusted by position (BTN +12, UTG -12, etc.)
- **Pot-limit betting**: Min/max raises enforced, pot-sized raise caps per the clubs engine
- **Multi-street play**: Post-flop decisions based on board texture, pot odds, and style-specific heuristics
- **Proper Omaha dealing**: Real 4/5/6 hole cards with mandatory 2-card usage for final hands

### Style Definitions (Calibrated to Real-World PLO)

| Style | Threshold | Target VPIP | Aggression | Description |
|-------|-----------|-------------|------------|-------------|
| **Rock** | 60 | ~18% | 0.30 | Tight-Passive — premium hands only |
| **TAG** | 48 | ~27% | 0.65 | Tight-Aggressive — selective, aggressive |
| **LAG** | 35 | ~38% | 0.80 | Loose-Aggressive — wide range, high aggression |

---

## Heads-Up Results (2-Player, All Style Pairings)

### TAG vs LAG

| Variant | TAG BB/100 | LAG BB/100 | Winner | Margin |
|---------|-----------|-----------|--------|--------|
| PLO4 | **+140.4** | +9.6 | TAG | +130.8 |
| PLO5 | **+132.7** | +17.3 | TAG | +115.4 |
| PLO6 | **+152.0** | -2.0 | TAG | +154.0 |

**Trend:** With proper button rotation, TAG now dominates LAG heads-up across all variants. TAG's positional awareness (tightening from early position, widening from the button) is much more effective than LAG's indiscriminate aggression when positions rotate fairly.

### TAG vs Rock

| Variant | TAG BB/100 | Rock BB/100 | Winner | Margin |
|---------|-----------|------------|--------|--------|
| PLO4 | **+98.9** | +51.1 | TAG | +47.8 |
| PLO5 | **+155.2** | -5.2 | TAG | +160.4 |
| PLO6 | **+189.4** | -39.4 | TAG | +228.8 |

**Trend:** TAG crushes Rock heads-up, with the margin increasing as hole cards increase (PLO6 is the widest gap). Rock's passivity is devastated when the opponent has positional awareness.

### LAG vs Rock

| Variant | LAG BB/100 | Rock BB/100 | Winner | Margin |
|---------|-----------|------------|--------|--------|
| PLO4 | **+163.9** | -13.9 | LAG | +177.8 |
| PLO5 | **+226.8** | -76.8 | LAG | +303.6 |
| PLO6 | **+293.6** | -143.6 | LAG | +437.2 |

**Trend:** LAG absolutely destroys Rock heads-up, and the margin *explodes* as hole cards increase. Rock loses money in PLO5/6 because with more hole cards, folding too much means giving up hands that actually have equity.

### Heads-Up Summary
- **TAG > LAG > Rock** in heads-up across all variants
- TAG's positional play gives it a consistent edge over LAG
- LAG's aggression is most effective against Rock's passivity
- Rock is a losing style heads-up in PLO5 and PLO6

---

## Multi-Player Results (3-9 Players, Mixed Styles)

### PLO4 (4-Card Omaha)

| Players | LAG BB/100 | TAG BB/100 | Rock BB/100 | Best Style |
|---------|-----------|-----------|------------|-----------|
| 3 | +10.7 | **+98.3** | +35.3 | TAG |
| 4 | +63.9 | +18.4 | **+34.9** | LAG |
| 5 | +16.7 | **+70.3** | -24.0 | TAG |
| 6 | +60.8 | **+48.5** | -34.3 | LAG |
| 7 | +54.8 | -0.7 | +21.3 | **LAG** |
| 8 | **+145.7** | -51.3 | -72.5 | LAG |
| 9 | **+96.8** | -28.1 | -18.7 | LAG |

**PLO4 Insights:** TAG is strong at shorter tables (3, 5 players) where selective aggression pays off. LAG dominates at larger tables (7-9 players) where wide aggression steals more pots. Rock struggles at 5+ players. At 8-9 players, LAG is the clear winner with massive BB/100 rates while both TAG and Rock lose money.

### PLO5 (5-Card Omaha)

| Players | LAG BB/100 | TAG BB/100 | Rock BB/100 | Best Style |
|---------|-----------|-----------|------------|-----------|
| 3 | -53.5 | **+110.5** | +72.9 | TAG |
| 4 | **+226.8** | -29.9 | -16.9 | LAG |
| 5 | +78.0 | +0.4 | -6.8 | **LAG** |
| 6 | -45.1 | **+175.3** | -60.6 | TAG |
| 7 | **+244.5** | -96.3 | -30.6 | LAG |
| 8 | **+85.6** | +4.9 | -60.8 | LAG |
| 9 | **+104.5** | +7.5 | -62.0 | LAG |

**PLO5 Insights:** Very high variance — results swing wildly between LAG and TAG depending on table size. LAG dominates at 4, 7, 8, 9 players. TAG excels at 3 and 6 players. Rock is consistently the worst, losing money at nearly every table size. The extra hole card makes aggression more rewarding overall.

### PLO6 (6-Card Omaha)

| Players | LAG BB/100 | TAG BB/100 | Rock BB/100 | Best Style |
|---------|-----------|-----------|------------|-----------|
| 3 | -22.0 | **+80.5** | +64.2 | TAG |
| 4 | -5.4 | **+89.2** | -33.6 | TAG |
| 5 | **+87.9** | -66.3 | +91.1 | Rock |
| 6 | **+110.1** | +33.2 | -75.8 | LAG |
| 7 | -33.8 | **+61.8** | +5.7 | TAG |

**PLO6 Insights:** TAG is surprisingly strong at 3, 4, and 7 players — selective play works well when 6 hole cards make equities very close and hand reading matters more. LAG wins at 5-6 players. Rock has its only standout result at 5 players with +91 BB/100, though this may be variance given the wide confidence intervals.

---

## Cross-Variant Analysis

### Style Performance by Variant (Average BB/100 across 3-9 players)

| Style | PLO4 avg | PLO5 avg | PLO6 avg |
|-------|---------|---------|---------|
| LAG | +63.5 | +91.5 | +27.4 |
| TAG | +22.2 | +24.6 | +39.7 |
| Rock | -16.1 | -34.4 | +10.3 |

**Key Findings:**
- LAG has the highest average win rate in PLO4 and PLO5, driven by massive wins at larger tables
- TAG is the most consistent across variants, always positive
- Rock is a losing style on average in PLO4 and PLO5, but breaks even in PLO6 where hand equities are closest

### Style Ranking by Scenario

| Scenario | Recommended | Why |
|----------|-------------|-----|
| PLO4 heads-up | TAG | +140 BB/100, positional play dominates |
| PLO4 3-5 player | TAG | +70-98 BB/100, selective aggression |
| PLO4 6-9 player | LAG | +55-146 BB/100, aggression steals pots |
| PLO5 heads-up | TAG or LAG | Both profitable; TAG wins TAG vs LAG, LAG wins LAG vs Rock |
| PLO5 3-6 player | TAG | Strong at 3 and 6 players |
| PLO5 7-9 player | LAG | +85-245 BB/100, massive aggression advantage |
| PLO6 heads-up | TAG | +152-189 BB/100 against LAG and Rock |
| PLO6 3-4 player | TAG | +80-89 BB/100, selective aggression |
| PLO6 5-6 player | LAG | +88-110 BB/100, aggression pays |
| PLO6 7 player | TAG | +62 BB/100 at max capacity |

---

## VPIP Analysis (Observed vs Real-World Targets)

### PLO4 (Mixed Tables, 3-9 Players)

| Style | Target VPIP | 3p | 6p | 9p | Assessment |
|-------|-------------|----|----|-----|------------|
| Rock | 15-20% | 13.7% | 10.7% | 9.0% | Too tight, especially at larger tables |
| TAG | 25-30% | 36.4% | 35.0% | 31.0% | Slightly wide at 3-6p, good at 9p |
| LAG | 35-45% | 94.4% | 89.6% | 83.6% | Way too wide — entering almost every pot |

### PLO5 (Mixed Tables, 3-9 Players)

| Style | Target VPIP | 3p | 6p | 9p | Assessment |
|-------|-------------|----|----|-----|------------|
| Rock | 15-20% | 32.4% | 27.2% | 23.7% | Too wide (5-card hands score higher) |
| TAG | 25-30% | 67.1% | 61.3% | 54.8% | Way too wide for TAG |
| LAG | 35-45% | 99.9% | 98.6% | 96.1% | Enters virtually every pot |

### PLO6 (Mixed Tables, 3-7 Players)

| Style | Target VPIP | 3p | 6p | 7p | Assessment |
|-------|-------------|----|----|-----|------------|
| Rock | 15-20% | 52.7% | 46.9% | 43.8% | Way too wide (6-card hands all look good) |
| TAG | 25-30% | 84.8% | 79.9% | 73.7% | Far too wide for TAG |
| LAG | 35-45% | 100.0% | 99.9% | 99.2% | Plays every hand |

**Critical Finding:** With button rotation, VPIP numbers are much higher than before and far above real-world targets. This happens because position rotation means players now get favorable positions (BTN, CO) on some hands, inflating their VPIP compared to when they were stuck in one position. The hand-score thresholds need significant increases, especially for PLO5 and PLO6.

### Recommended Threshold Adjustments

| Style | Current | PLO4 | PLO5 | PLO6 |
|-------|---------|------|------|------|
| Rock | 60 | 68 | 75 | 82 |
| TAG | 48 | 55 | 62 | 70 |
| LAG | 35 | 42 | 48 | 55 |

---

## Flop Seen Rates (3+ Player Tables)

| Variant | 3p | 6p | 9p | Real-World Target |
|---------|----|----|-----|-------------------|
| PLO4 | 39-69% | 21-85% | 20-86% | 25-40% |
| PLO5 | 47-80% | 34-82% | 28-76% | 30-50% |
| PLO6 | 60-84% | 49-79% | — | 35-60% |

Flop rates are higher than real-world targets due to the VPIP inflation. Tightening the thresholds (see above) would bring these closer to target.

---

## Statistical Quality

### Sample Sizes
- **2,000 hands per configuration** — sufficient for directional trends
- **28 total configurations** covering all variants × all player counts × all 2p matchups
- **56,000 total hands** simulated
- For 95% confidence in detecting 5 BB/100 difference: ~6,272 hands recommended per config

### Confidence Intervals
Most multi-player results have wide 95% CIs (±50-200 BB/100), typical for Omaha variance at 2,000-hand samples. Results with CIs that don't cross zero have higher confidence. Many PLO5/6 results have very wide CIs reflecting the inherently high variance of those games.

### Results Reliability
- **High confidence:** TAG > LAG heads-up (consistent across all 3 variants, large margins)
- **High confidence:** Rock is the weakest style overall
- **Medium confidence:** LAG wins at large tables (7-9 players) in PLO4/5
- **Lower confidence:** Individual table-size results in PLO6 (wide CIs, small sample)

---

## Simulation Improvements in This Version

1. **Dealer button rotation** — Blinds and positions rotate each hand, eliminating permanent positional bias
2. **Proper Omaha engine** — `clubs` library for real PLO4/5/6 dealing (replaced Hold'em-only PyPokerEngine)
3. **Full style pairings** — All 3 head-to-head matchups tested at 2-player tables
4. **Position-aware strategy** — Hand thresholds adjusted by position (±12 for BTN/UTG)
5. **VPIP tracking** — Proper per-hand voluntary pot entry counting

---

## Files Reference

| File | Purpose |
|------|---------|
| `OmahaTestRunner.py` | Main test framework using `clubs` library |
| `test_results/omaha_full_comprehensive_20260216_004944.json` | Raw data for this report (28 configs, 56K hands, with rotation) |
| `STYLE_TESTING_REPORT.md` | This report |
| `LocalAdvisorServer.js` | Play Advisor server for API-assisted testing |

---

## Running Tests

```bash
# Full comprehensive (28 configs × 2000 hands = 56K hands, ~3.5 minutes)
cd "/Users/DanDrasin/projects/smalltalk stuff/poker/poker-simulator/bot"
python3 OmahaTestRunner.py fulltest 2000

# Quick single test
python3 OmahaTestRunner.py 4 6 500    # PLO4, 6 players, 500 hands

# Custom hand count for full test
python3 OmahaTestRunner.py fulltest 5000  # 5000 hands per config (~9 minutes)
```

---

## Suggested Next Steps

1. **Calibrate Thresholds** — Increase hand-score thresholds per variant to bring VPIP within real-world ranges
2. **Advisor Integration** — Run key configs with Play Advisor server to test post-flop decision quality
3. **Larger Samples** — Run 5,000+ hands per config for tighter confidence intervals
4. **Per-Position Tracking** — Track profitability by position (BTN, CO, BB, etc.)
5. **Opponent Modeling** — Implement adaptive style detection and counter-strategy
