/**
 * Style Profiles — Single Source of Truth
 *
 * Defines 6 player archetypes with calibrated parameters for:
 * - Preflop hand selection (variant-specific thresholds)
 * - Postflop aggression and continuation betting
 * - Equity threshold adjustments for ActionRecommender
 * - Bet sizing adjustments for BetSizer
 *
 * These profiles are calibrated against real-world PLO statistics:
 *   Sources: pokercopilot.com, pokerstrategy.com, runitonce.com
 *   Nit:     VPIP ~18%, PFR ~14%, AF 1.5
 *   TAG/Reg: VPIP ~25-28%, PFR ~18-22%, AF 2.5
 *   LAG:     VPIP ~33-38%, PFR ~22-28%, AF 3.0
 *   Fish:    VPIP ~50-65%, PFR ~10-15%, AF 0.8
 *
 * Preflop thresholds were calibrated via Monte Carlo simulation:
 *   - 5000 random hands per variant
 *   - Binary search for threshold producing target VPIP
 *   - Averaged across all 6-max positions with position adjustments
 *   - Adjusted for marginal-hand calling in multi-way pots (+8-15%)
 *   - Validated across 128,000 hands (64 configurations)
 */

// =============================================================================
// STYLE PROFILES
// =============================================================================

export const STYLE_PROFILES = {
  nit: {
    id: 'nit',
    name: 'Nit (Ultra-Tight)',
    shortName: 'Nit',
    description: 'Plays very few hands — only premium holdings. Folds most marginal spots. When they bet, they almost always have it.',
    vpipTarget: 0.20,
    pfrRatio: 0.70,         // Of hands played, 70% are raised (rest called)

    // Variant-specific preflop thresholds (hand score must exceed to play)
    thresholds: {
      omaha4: 55.0,
      omaha5: 65.5,
      omaha6: 73.0,
    },

    // Postflop behavior frequencies
    cbet: 0.50,             // Continuation bet frequency (first to act after raising pre)
    foldToCbet: 0.55,       // Fold to opponent's c-bet
    postflopAgg: 0.35,      // Raise frequency when facing a bet postflop
    barrelTurn: 0.40,       // Continue betting turn after flop c-bet
    barrelRiver: 0.30,      // Continue betting river after turn barrel
    raiseSizing: 0.50,      // Fraction of pot for preflop raise sizing

    // ActionRecommender equity threshold adjustments
    equityAdjustments: {
      foldMarginDelta: +5,    // Needs 5% MORE equity above baseline to continue
      raiseMarginDelta: +5,   // Needs 5% MORE equity to raise
      bluffFrequency: 0.05,   // Almost never bluffs (5%)
      aggressionMult: 0.70,   // 30% less aggressive than baseline
    },

    // BetSizer adjustment
    sizingMult: 0.85,        // Smaller bets (value-focused)
  },

  rock: {
    id: 'rock',
    name: 'Rock (Tight-Passive)',
    shortName: 'Rock',
    description: 'Same tight hand selection as a Nit, but passive postflop. Prefers calling over raising, rarely bluffs. Predictable and exploitable.',
    vpipTarget: 0.20,
    pfrRatio: 0.45,         // Only raises 45% of hands played (lots of limping/calling)

    thresholds: {
      omaha4: 55.0,
      omaha5: 65.5,
      omaha6: 73.0,
    },

    cbet: 0.45,
    foldToCbet: 0.55,
    postflopAgg: 0.15,      // Very rarely raises postflop
    barrelTurn: 0.35,
    barrelRiver: 0.25,
    raiseSizing: 0.50,

    equityAdjustments: {
      foldMarginDelta: +5,
      raiseMarginDelta: +5,
      bluffFrequency: 0.03,
      aggressionMult: 0.50,   // Very passive — half the baseline aggression
    },

    sizingMult: 0.85,
  },

  reg: {
    id: 'reg',
    name: 'Reg (Solid Regular)',
    shortName: 'Reg',
    description: 'A fundamentally sound player. Good hand selection, mostly raises preflop, balanced aggression postflop. The baseline "correct" style.',
    vpipTarget: 0.25,
    pfrRatio: 0.75,

    thresholds: {
      omaha4: 53.6,
      omaha5: 63.9,
      omaha6: 71.3,
    },

    cbet: 0.58,
    foldToCbet: 0.42,
    postflopAgg: 0.30,
    barrelTurn: 0.50,
    barrelRiver: 0.40,
    raiseSizing: 0.75,

    equityAdjustments: {
      foldMarginDelta: 0,     // Baseline — no adjustment
      raiseMarginDelta: 0,
      bluffFrequency: 0.10,
      aggressionMult: 1.00,
    },

    sizingMult: 1.00,         // Baseline sizing
  },

  tag: {
    id: 'tag',
    name: 'TAG (Tight-Aggressive)',
    shortName: 'TAG',
    description: 'Selective hand choices with aggressive play. Raises more than calls, applies pressure with c-bets and barrels. The classic winning style.',
    vpipTarget: 0.28,
    pfrRatio: 0.72,

    thresholds: {
      omaha4: 52.0,
      omaha5: 62.0,
      omaha6: 69.5,
    },

    cbet: 0.62,
    foldToCbet: 0.38,
    postflopAgg: 0.35,
    barrelTurn: 0.55,
    barrelRiver: 0.42,
    raiseSizing: 0.75,

    equityAdjustments: {
      foldMarginDelta: -2,    // Slightly more willing to continue
      raiseMarginDelta: -2,   // Slightly more willing to raise
      bluffFrequency: 0.12,
      aggressionMult: 1.10,   // 10% more aggressive
    },

    sizingMult: 1.05,         // Slightly larger for value extraction
  },

  lag: {
    id: 'lag',
    name: 'LAG (Loose-Aggressive)',
    shortName: 'LAG',
    description: 'Wide hand selection with high aggression. Sees more flops, bluffs more often, puts maximum pressure on opponents. High-variance but profitable when executed well.',
    vpipTarget: 0.35,
    pfrRatio: 0.65,

    thresholds: {
      omaha4: 50.5,
      omaha5: 61.0,
      omaha6: 68.5,
    },

    cbet: 0.65,
    foldToCbet: 0.30,
    postflopAgg: 0.40,
    barrelTurn: 0.60,
    barrelRiver: 0.50,
    raiseSizing: 1.00,        // Full pot raises

    equityAdjustments: {
      foldMarginDelta: -5,    // Continues with much less equity
      raiseMarginDelta: -5,   // Raises with less equity edge
      bluffFrequency: 0.20,   // Bluffs 20% of the time
      aggressionMult: 1.25,   // 25% more aggressive
    },

    sizingMult: 1.15,         // Bigger bets for maximum pressure
  },

  fish: {
    id: 'fish',
    name: 'Fish (Loose-Passive)',
    shortName: 'Fish',
    description: 'Plays too many hands and plays them passively. Calls too wide, rarely raises. The recreational player style — fun to play but consistently loses to competent opponents.',
    vpipTarget: 0.50,
    pfrRatio: 0.25,           // Rarely raises (mostly calling)

    thresholds: {
      omaha4: 46.5,
      omaha5: 56.7,
      omaha6: 64.3,
    },

    cbet: 0.40,
    foldToCbet: 0.25,         // Almost never folds to c-bets
    postflopAgg: 0.10,        // Rarely raises postflop
    barrelTurn: 0.30,
    barrelRiver: 0.20,
    raiseSizing: 0.50,

    equityAdjustments: {
      foldMarginDelta: -8,    // Calls with almost anything
      raiseMarginDelta: +5,   // But rarely raises (needs big edge)
      bluffFrequency: 0.03,   // Almost never bluffs
      aggressionMult: 0.40,   // Very passive
    },

    sizingMult: 0.90,
  },
};

// =============================================================================
// POSITION ADJUSTMENTS (shared between app and tests)
// =============================================================================

export const POSITION_ADJUSTMENTS = {
  BTN: 12,
  CO: 6,
  HJ: 2,
  MP: -3,
  EP: -8,
  UTG: -12,
  SB: -5,
  BB: 0,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get style profile by ID, with fallback to 'reg' for unknown styles.
 */
export function getStyleProfile(styleId) {
  return STYLE_PROFILES[styleId] || STYLE_PROFILES.reg;
}

/**
 * Get the equity-adjusted thresholds for ActionRecommender.
 * Applies style adjustments on top of the base thresholds.
 */
export function getAdjustedThresholds(styleId, baseThresholds) {
  const profile = getStyleProfile(styleId);
  const adj = profile.equityAdjustments;

  // FOLD margin: subtract delta → Nit(+5): 10-5=5 → folds when gap < -5 (folds easily)
  // RAISE margin: add delta → Nit(+5): 15+5=20 → raises when gap > 20 (raises reluctantly)
  //                           LAG(-5): 15+(-5)=10 → raises when gap > 10 (raises eagerly)
  return {
    CLEAR_FOLD_MARGIN: baseThresholds.CLEAR_FOLD_MARGIN - adj.foldMarginDelta,
    MARGINAL_ZONE: baseThresholds.MARGINAL_ZONE,
    VALUE_RAISE_MARGIN: baseThresholds.VALUE_RAISE_MARGIN + adj.raiseMarginDelta,
    STRONG_VALUE_MARGIN: baseThresholds.STRONG_VALUE_MARGIN + adj.raiseMarginDelta,
    SEMI_BLUFF_MIN: baseThresholds.SEMI_BLUFF_MIN,
    SEMI_BLUFF_MAX: baseThresholds.SEMI_BLUFF_MAX,
    BLUFF_FREQUENCY: adj.bluffFrequency,
    AGGRESSION_MULT: adj.aggressionMult,
  };
}

/**
 * Get the sizing multiplier for BetSizer.
 */
export function getSizingMultiplier(styleId) {
  const profile = getStyleProfile(styleId);
  return profile.sizingMult;
}

/**
 * Get all style IDs for iteration.
 */
export function getStyleIds() {
  return Object.keys(STYLE_PROFILES);
}

/**
 * Get style options formatted for a UI dropdown.
 */
export function getStyleOptions() {
  return Object.values(STYLE_PROFILES).map(p => ({
    value: p.id,
    label: `${p.shortName} — ${Math.round(p.vpipTarget * 100)}% VPIP`,
    description: p.description,
  }));
}
