/**
 * Action Recommender
 *
 * Determines optimal actions (fold/call/raise) based on equity, pot odds,
 * position, SPR, board texture, and hero's playing style.
 *
 * Style-aware: Adjusts equity thresholds and reasoning based on the
 * player's selected style (nit, rock, reg, tag, lag, fish).
 * See StyleProfiles.js for the authoritative style definitions.
 */

import { getStyleProfile, getAdjustedThresholds } from './StyleProfiles.js';

// =============================================================================
// CONSTANTS (baseline — adjusted per style at decision time)
// =============================================================================

export const EQUITY_THRESHOLDS = {
  CLEAR_FOLD_MARGIN: 10,      // Fold when equity < potOdds - 10%
  MARGINAL_ZONE: 5,           // Within ±5% of pot odds is marginal
  VALUE_RAISE_MARGIN: 15,     // Raise when equity > potOdds + 15%
  STRONG_VALUE_MARGIN: 30,    // Strong value when equity > potOdds + 30%
  SEMI_BLUFF_MIN: 30,         // Minimum equity for semi-bluff
  SEMI_BLUFF_MAX: 50          // Maximum equity (else value bet)
};

export const SPR_ZONES = {
  MICRO: 2,
  SHORT: 4,
  MEDIUM: 8,
  DEEP: 15
};

export const IMPLIED_ODDS_BOOST = {
  excellent: 15,   // Add 15% to effective odds
  good: 10,
  moderate: 5,
  poor: 0
};

export const POSITION_ADJUSTMENT = {
  IP: 1.05,    // 5% more aggressive in position
  OOP: 0.95    // 5% more conservative out of position
};

// Hand type vulnerability (higher = more vulnerable, needs protection)
const HAND_VULNERABILITY = {
  0: 0.9,   // High card - extremely vulnerable
  1: 0.85,  // Pair - very vulnerable in PLO
  2: 0.8,   // Two pair - vulnerable
  3: 0.5,   // Set - moderately vulnerable (can improve to boat)
  4: 0.4,   // Straight - somewhat vulnerable to flushes
  5: 0.2,   // Flush - only vulnerable to boats/better flush
  6: 0.1,   // Full house - rarely vulnerable
  7: 0.05,  // Quads - almost never vulnerable
  8: 0.02,  // Straight flush
  9: 0.0    // Royal flush - never vulnerable
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get SPR zone name
 */
function getSPRZone(spr) {
  if (spr < SPR_ZONES.MICRO) return 'micro';
  if (spr < SPR_ZONES.SHORT) return 'short';
  if (spr < SPR_ZONES.MEDIUM) return 'medium';
  if (spr < SPR_ZONES.DEEP) return 'deep';
  return 'veryDeep';
}

/**
 * Determine if hero is in position
 */
function isInPosition(heroPosition, villainPosition) {
  const positionOrder = ['SB', 'BB', 'UTG', 'UTG+1', 'EP', 'MP', 'HJ', 'CO', 'BTN'];
  const heroIdx = positionOrder.indexOf(heroPosition?.toUpperCase()) || 5;
  const villainIdx = positionOrder.indexOf(villainPosition?.toUpperCase()) || 3;
  return heroIdx > villainIdx;
}

/**
 * Calculate effective pot odds including implied odds
 */
function getEffectiveOdds(potOdds, impliedOdds, isDrawing) {
  if (!isDrawing) return potOdds;

  const boost = IMPLIED_ODDS_BOOST[impliedOdds] || 0;
  return Math.max(0, potOdds - boost);  // Lower effective odds = better for hero
}

/**
 * Determine bet type based on hand and equity
 */
function determineBetType(equity, handType, outs, isNuts) {
  // Strong made hand = value
  if (handType >= 4 && equity > 60) return 'value';

  // Drawing hand with good equity = semi-bluff
  if (outs?.toImprove > 6 && equity >= EQUITY_THRESHOLDS.SEMI_BLUFF_MIN
      && equity <= EQUITY_THRESHOLDS.SEMI_BLUFF_MAX) {
    return 'semiBluff';
  }

  // Vulnerable made hand = protection
  if (handType >= 3 && handType <= 5 && HAND_VULNERABILITY[handType] > 0.3) {
    return 'protection';
  }

  // Good made hand but not amazing = value
  if (equity > 55) return 'value';

  // Weak hand with some equity = potential bluff
  if (equity < 30 && handType <= 2) return 'bluff';

  return 'value';  // Default
}

// =============================================================================
// DECISION TREE
// =============================================================================

/**
 * Main decision function
 */
function makeDecision(params) {
  const {
    equity,
    potOdds,
    impliedOdds,
    handType,
    isNuts,
    outs,
    spr,
    position,
    boardTexture,
    street,
    facingBet,
    heroStyle = 'reg'
  } = params;

  // Get style-adjusted thresholds
  const thresholds = getAdjustedThresholds(heroStyle, EQUITY_THRESHOLDS);
  const profile = getStyleProfile(heroStyle);

  const sprZone = getSPRZone(spr);
  const inPosition = isInPosition(position, 'unknown');
  const positionMultiplier = inPosition ? POSITION_ADJUSTMENT.IP : POSITION_ADJUSTMENT.OOP;

  // Adjust equity for position
  const adjustedEquity = equity * positionMultiplier;

  // Calculate the gap between equity and pot odds
  const isDrawing = outs?.toImprove > 4;
  const effectiveOdds = getEffectiveOdds(potOdds, impliedOdds, isDrawing);
  const equityGap = adjustedEquity - effectiveOdds;

  // Determine vulnerability
  const vulnerability = HAND_VULNERABILITY[handType] || 0.5;

  // Style-aware aggression scaling
  const aggressionMult = thresholds.AGGRESSION_MULT;
  const bluffFreq = thresholds.BLUFF_FREQUENCY;

  // =================
  // DECISION LOGIC (style-adjusted thresholds)
  // =================

  // Case 1: Clear fold
  if (equityGap < -thresholds.CLEAR_FOLD_MARGIN && !isDrawing) {
    return {
      action: 'fold',
      confidence: Math.min(0.95, 0.7 + Math.abs(equityGap) / 100),
      reason: 'clear_fold',
      heroStyle
    };
  }

  // Case 2: Marginal fold (no implied odds to help)
  if (equityGap < -thresholds.MARGINAL_ZONE && impliedOdds === 'poor') {
    return {
      action: 'fold',
      confidence: 0.65,
      reason: 'marginal_fold',
      heroStyle
    };
  }

  // Case 3: Not facing a bet - check or bet decision
  if (!facingBet) {
    // Strong made hand: bet for value (need decent hand type, not just equity)
    if (equityGap > thresholds.VALUE_RAISE_MARGIN && handType >= 3) {
      const betType = determineBetType(adjustedEquity, handType, outs, isNuts);
      return {
        action: 'bet',
        confidence: Math.min(0.95, (0.6 + equityGap / 100) * aggressionMult),
        betType,
        reason: 'value_bet',
        heroStyle
      };
    }

    // Very strong equity with any hand (80%+)
    if (adjustedEquity >= 80) {
      return {
        action: 'bet',
        confidence: 0.85,
        betType: 'value',
        reason: 'value_bet',
        heroStyle
      };
    }

    // Vulnerable made hand: protection bet (aggressive styles bet more here)
    if (vulnerability > 0.4 && handType >= 3 && spr > 2) {
      return {
        action: 'bet',
        confidence: Math.min(0.9, 0.7 * aggressionMult),
        betType: 'protection',
        reason: 'protection_bet',
        heroStyle
      };
    }

    // Semi-bluff opportunity with draws (style affects frequency)
    if (isDrawing && adjustedEquity >= thresholds.SEMI_BLUFF_MIN) {
      // Only semi-bluff if style supports it (random check against bluff frequency)
      // In a deterministic advisor, we use bluffFreq to adjust confidence
      return {
        action: 'bet',
        confidence: Math.min(0.8, 0.6 * aggressionMult),
        betType: 'semiBluff',
        reason: 'semi_bluff',
        heroStyle
      };
    }

    // LAG/TAG: consider betting marginal hands as bluffs when in position
    if (inPosition && bluffFreq >= 0.12 && handType <= 1 && adjustedEquity > 20) {
      return {
        action: 'bet',
        confidence: Math.min(0.6, 0.4 * aggressionMult),
        betType: 'bluff',
        reason: 'positional_bluff',
        heroStyle
      };
    }

    // Default: check for pot control (marginal hands)
    return {
      action: 'check',
      confidence: 0.7,
      reason: 'pot_control',
      heroStyle
    };
  }

  // Case 4: Facing a bet - call, raise, or fold

  // Calculate raw equity gap without implied odds boost (for raise decisions)
  const rawEquityGap = adjustedEquity - potOdds;

  // Drawing hands facing a bet: check call first before raise
  // Implied odds help justify calls, not raises
  if (isDrawing) {
    // Call with proper pot odds or good implied odds
    if (equityGap >= -thresholds.MARGINAL_ZONE) {
      return {
        action: 'call',
        confidence: 0.65 + (equityGap + thresholds.MARGINAL_ZONE) / 50,
        reason: 'pot_odds_call',
        heroStyle
      };
    }
    if (impliedOdds !== 'poor') {
      return {
        action: 'call',
        confidence: 0.55,
        reason: 'implied_odds_call',
        heroStyle
      };
    }
    // Semi-bluff raise only when below pot odds and have fold equity
    if (adjustedEquity >= thresholds.SEMI_BLUFF_MIN
        && adjustedEquity <= thresholds.SEMI_BLUFF_MAX
        && sprZone !== 'micro') {
      return {
        action: 'raise',
        confidence: Math.min(0.7, 0.55 * aggressionMult),
        betType: 'semiBluff',
        reason: 'semi_bluff_raise',
        heroStyle
      };
    }
  }

  // Strong value raise (made hands only, use raw equity gap)
  if (!isDrawing && rawEquityGap > thresholds.STRONG_VALUE_MARGIN) {
    // Check SPR - micro SPR means all-in
    if (sprZone === 'micro') {
      return {
        action: 'raise',
        confidence: 0.9,
        betType: 'allIn',
        reason: 'strong_value_raise',
        heroStyle
      };
    }

    return {
      action: 'raise',
      confidence: Math.min(0.95, 0.75 + rawEquityGap / 200),
      betType: 'value',
      reason: 'value_raise',
      heroStyle
    };
  }

  // Standard value raise (made hands)
  if (!isDrawing && rawEquityGap > thresholds.VALUE_RAISE_MARGIN) {
    // Consider if we should just call to trap (passive styles prefer trapping)
    if (isNuts && inPosition && sprZone !== 'micro' && aggressionMult < 1.0) {
      return {
        action: 'call',
        confidence: 0.65,
        reason: 'slow_play',
        alternativeAction: 'raise',
        heroStyle
      };
    }

    return {
      action: 'raise',
      confidence: Math.min(0.85, 0.7 * aggressionMult),
      betType: 'value',
      reason: 'value_raise',
      heroStyle
    };
  }

  // Marginal call (at or near pot odds)
  if (equityGap >= -thresholds.MARGINAL_ZONE) {
    return {
      action: 'call',
      confidence: 0.6 + (equityGap + thresholds.MARGINAL_ZONE) / 50,
      reason: 'pot_odds_call',
      heroStyle
    };
  }

  // Default: fold marginal hands
  return {
    action: 'fold',
    confidence: 0.55,
    reason: 'marginal_fold',
    heroStyle
  };
}

// =============================================================================
// REASONING GENERATOR
// =============================================================================

const REASON_TEMPLATES = {
  clear_fold: {
    primary: 'Your {handStrength} doesn\'t have enough equity to continue.',
    math: 'Equity ({equity}%) is well below pot odds ({potOdds}%).',
    strategic: 'Folding saves money when you\'re a significant underdog.'
  },
  marginal_fold: {
    primary: 'Close decision, but without good implied odds, folding is correct.',
    math: 'Equity ({equity}%) is slightly below pot odds ({potOdds}%).',
    strategic: 'Poor implied odds mean you can\'t make up the difference on later streets.'
  },
  value_bet: {
    primary: 'Your {handStrength} is strong enough to bet for value.',
    math: 'With {equity}% equity, you want to build the pot.',
    strategic: '{positionNote} Betting also denies equity to drawing hands.'
  },
  protection_bet: {
    primary: 'Your {handStrength} is vulnerable and needs protection.',
    math: 'Multiple draws are possible - charge them to see the next card.',
    strategic: 'Don\'t give free cards with a hand that can be outdrawn.'
  },
  semi_bluff: {
    primary: 'You have a strong draw - semi-bluffing adds fold equity.',
    math: 'With {outs} outs ({drawEquity}% draw equity), aggression is profitable.',
    strategic: 'If called, you still have a good chance to improve. If they fold, you win immediately.'
  },
  pot_control: {
    primary: 'With a marginal hand, checking keeps the pot small.',
    math: 'Your equity ({equity}%) doesn\'t warrant building a big pot.',
    strategic: '{positionNote} See a cheap showdown if possible.'
  },
  strong_value_raise: {
    primary: 'Your {handStrength} is very strong - raise for maximum value!',
    math: 'With {equity}% equity, you\'re a big favorite.',
    strategic: 'Get as much money in as possible while you\'re ahead.'
  },
  value_raise: {
    primary: 'Your {handStrength} beats most of villain\'s range.',
    math: 'Equity ({equity}%) significantly exceeds pot odds ({potOdds}%).',
    strategic: 'Raising builds the pot and potentially gets worse hands to call.'
  },
  slow_play: {
    primary: 'Consider just calling to keep villain\'s bluffs in.',
    math: 'You have the nuts - raising might fold out worse hands.',
    strategic: 'In position, you can raise later streets if needed.'
  },
  pot_odds_call: {
    primary: 'The pot odds justify a call with your {handStrength}.',
    math: 'Your equity ({equity}%) meets the {potOdds}% pot odds.',
    strategic: 'You\'re getting the right price to continue.'
  },
  implied_odds_call: {
    primary: 'You\'re drawing to a strong hand with good implied odds.',
    math: 'Raw odds are thin, but you can win a big pot if you hit.',
    strategic: 'Deep stacks mean big payoffs when your draw comes in.'
  },
  semi_bluff_raise: {
    primary: 'Raise as a semi-bluff with your draw.',
    math: '{outs} outs give you {drawEquity}% equity, plus fold equity.',
    strategic: 'Aggression can win the pot now or build it for when you hit.'
  },
  positional_bluff: {
    primary: 'In position with a weak hand — betting as a bluff.',
    math: 'Only {equity}% equity, but fold equity makes this profitable.',
    strategic: 'Aggression in position is the hallmark of a winning style.'
  }
};

// Style-specific reasoning overlays — appended to the base reasoning
const STYLE_REASONING = {
  nit: {
    fold: 'As a Nit, preserving your stack for premium spots is key. Discipline pays off.',
    call: 'Even for a tight player, this spot offers enough value to continue.',
    raise: 'When a Nit raises, it sends a strong message. You have the goods here.',
    bet: 'Betting for value with your tight image — opponents will give you credit.',
    check: 'Pot control fits your tight approach. Wait for a better spot to commit chips.',
  },
  rock: {
    fold: 'Folding marginal spots preserves your stack. Let others make mistakes.',
    call: 'Calling is the preferred Rock approach — low-risk continuation.',
    raise: 'Raising is unusual for a passive style, but the equity here justifies it.',
    bet: 'Betting here extracts value from your premium hand.',
    check: 'Checking fits your passive approach. Control the pot and see what develops.',
  },
  reg: {
    fold: 'Standard fold based on fundamentals. Disciplined play.',
    call: 'Solid call — getting the right price to continue.',
    raise: 'Good raise opportunity — balanced aggression with equity edge.',
    bet: 'Standard value bet with a solid hand. Textbook play.',
    check: 'Checking for pot control. A balanced approach.',
  },
  tag: {
    fold: 'Even aggressive players fold bad spots. Selectivity is what makes TAG profitable.',
    call: 'Calling here sets up future street aggression with position.',
    raise: 'As a TAG, raising here applies maximum pressure with your equity advantage.',
    bet: 'Aggressive betting defines the TAG style. Put pressure on weaker ranges.',
    check: 'Sometimes even TAGs slow down. Deception has value here.',
  },
  lag: {
    fold: 'Even a LAG folds the worst spots. This one isn\'t worth fighting for.',
    call: 'Calling this marginal spot is +EV with your wide perceived range.',
    raise: 'LAG style means raising wider — maximum pressure and fold equity.',
    bet: 'Betting aggressively puts opponents in tough spots. Classic LAG pressure.',
    check: 'Mixing in checks as a LAG adds deception to your aggressive image.',
  },
  fish: {
    fold: 'This spot is too far behind to continue, even with wide calling standards.',
    call: 'Calling with a marginal hand — seeing more flops is the recreational approach.',
    raise: 'Raising is rare for this style, but the hand strength here demands it.',
    bet: 'Betting when you have a strong hand — straightforward value.',
    check: 'Checking to see what develops. No need to build a big pot here.',
  }
};

function generateReasoning(decision, params) {
  const template = REASON_TEMPLATES[decision.reason] || REASON_TEMPLATES.pot_control;
  const positionNote = params.inPosition
    ? 'Being in position gives you control.'
    : 'Out of position, be cautious.';

  const heroStyle = decision.heroStyle || 'reg';

  const replacements = {
    handStrength: params.handDescription || 'hand',
    equity: params.equity?.toFixed(1) || '?',
    potOdds: params.potOdds?.toFixed(1) || '?',
    outs: params.outs?.toImprove || 0,
    drawEquity: params.drawEquity?.toFixed(1) || '0',
    positionNote
  };

  const format = (str) => {
    let result = str;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  };

  // Get style-specific strategic overlay
  const styleOverlay = STYLE_REASONING[heroStyle]?.[decision.action] || '';

  return {
    primary: format(template.primary),
    math: format(template.math),
    strategic: styleOverlay || format(template.strategic)
  };
}

// =============================================================================
// ALTERNATIVE LINES
// =============================================================================

function generateAlternatives(decision, params) {
  const alternatives = [];
  const { equity, potOdds, isNuts, outs, spr, handType } = params;
  const equityGap = equity - potOdds;
  const heroStyle = decision.heroStyle || 'reg';
  const profile = getStyleProfile(heroStyle);
  const isAggressive = profile.equityAdjustments.aggressionMult >= 1.0;
  const isPassive = profile.equityAdjustments.aggressionMult < 0.7;

  // Only show alternatives for close decisions
  if (decision.confidence > 0.85) return [];

  switch (decision.action) {
    case 'fold':
      if (equityGap > -15) {
        alternatives.push({
          action: 'call',
          reasoning: isAggressive
            ? 'Your aggressive image makes calling +EV — villain may be bluffing into you'
            : 'Slightly +EV if villain is bluffing often',
          risk: 'Losing more when behind',
          suitableWhen: 'Against aggressive players who bluff too much'
        });
      }
      break;

    case 'call':
      if (equityGap > 10 && spr > 3) {
        alternatives.push({
          action: 'raise',
          reasoning: isAggressive
            ? 'Your style favors raising here — build the pot with equity edge'
            : 'Build pot with equity advantage',
          risk: 'Face a re-raise with medium strength hand',
          suitableWhen: 'Against players who call too wide'
        });
      }
      if (handType <= 2 && equityGap < 5) {
        alternatives.push({
          action: 'fold',
          reasoning: isPassive
            ? 'Your conservative style would fold this marginal spot'
            : 'Save money with marginal hand',
          risk: 'Missing value when ahead',
          suitableWhen: 'Against tight players who only bet strong hands'
        });
      }
      break;

    case 'raise':
      if (isNuts) {
        alternatives.push({
          action: 'call',
          reasoning: isPassive
            ? 'Trapping fits your style — let villain keep betting into you'
            : 'Keep villain\'s bluffs and weaker hands in',
          risk: 'Miss value from hands that would call a raise',
          suitableWhen: 'Villain is aggressive and will bet again'
        });
      }
      if (!isNuts && handType >= 4) {
        alternatives.push({
          action: 'call',
          reasoning: 'Control pot size with non-nut hand',
          risk: 'Don\'t build pot when you might be second best',
          suitableWhen: 'Board is scary and villain\'s range is strong'
        });
      }
      break;

    case 'bet':
      alternatives.push({
        action: 'check',
        reasoning: isPassive
          ? 'Checking is natural for your style — control the pot'
          : 'Pot control or induce bluffs',
        risk: 'Give free cards to drawing hands',
        suitableWhen: 'Villain is aggressive post-check'
      });
      break;

    case 'check':
      if (outs?.toImprove > 6) {
        alternatives.push({
          action: 'bet',
          reasoning: isAggressive
            ? 'Your style supports semi-bluffing this draw aggressively'
            : 'Semi-bluff with your draw',
          risk: 'Get raised off your equity',
          suitableWhen: 'Villain folds too often'
        });
      }
      break;
  }

  return alternatives;
}

// =============================================================================
// WARNINGS
// =============================================================================

function generateWarnings(params) {
  const warnings = [];
  const { handType, isNuts, boardTexture, spr, equity, outs } = params;

  // Non-nut warnings
  if (handType === 5 && !isNuts) {
    warnings.push('Non-nut flush - higher flush is possible. Proceed with caution.');
  }
  if (handType === 4 && !isNuts) {
    warnings.push('Non-nut straight - be aware of higher straights.');
  }

  // Board texture warnings
  if (boardTexture?.flushMade && handType < 5) {
    warnings.push('Flush possible on board - your hand may already be beaten.');
  }
  if (boardTexture?.isPaired && handType < 6) {
    warnings.push('Paired board - full house is possible.');
  }

  // SPR warnings
  if (spr < 2) {
    warnings.push('Micro SPR - any significant bet commits your stack.');
  }

  // Drawing warnings
  if (outs?.toImprove > 0 && !isNuts) {
    warnings.push('Drawing to non-nut hand - be cautious of reverse implied odds.');
  }

  // Bluff catcher warning
  if (equity < 40 && handType >= 1 && handType <= 2) {
    warnings.push('Your hand can only beat bluffs at this point.');
  }

  return warnings;
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Recommend an action based on the current game state
 *
 * @param {Object} params
 * @param {number} params.equity - Hero's equity (0-100)
 * @param {number} params.potOdds - Pot odds required to call (0-100)
 * @param {string} params.impliedOdds - 'excellent', 'good', 'moderate', 'poor'
 * @param {number} params.handType - Hand type (0-9)
 * @param {string} params.handDescription - Human readable hand description
 * @param {boolean} params.isNuts - Whether hero has the nuts
 * @param {Object} params.outs - Outs object { toImprove, draws }
 * @param {number} params.drawEquity - Draw equity percentage
 * @param {number} params.spr - Stack to pot ratio
 * @param {string} params.position - Hero's position
 * @param {Object} params.boardTexture - Board texture analysis
 * @param {string} params.street - 'flop', 'turn', 'river'
 * @param {boolean} params.facingBet - Whether hero is facing a bet
 * @param {number} params.toCall - Amount to call (if facing bet)
 * @param {number} params.potSize - Current pot size
 * @param {string} params.heroStyle - Player style ('nit', 'rock', 'reg', 'tag', 'lag', 'fish')
 *
 * @returns {Object} Action recommendation with reasoning
 */
export function recommendAction(params) {
  const {
    equity = 50,
    potOdds = 33,
    impliedOdds = 'moderate',
    handType = 0,
    handDescription = 'unknown hand',
    isNuts = false,
    outs = { toImprove: 0, draws: [] },
    drawEquity = 0,
    spr = 10,
    position = 'unknown',
    boardTexture = null,
    street = 'flop',
    facingBet = false,
    toCall = 0,
    potSize = 100,
    heroStyle = 'reg'
  } = params;

  const inPosition = isInPosition(position, 'unknown');

  // Make the core decision (style-aware)
  const decision = makeDecision({
    equity,
    potOdds,
    impliedOdds,
    handType,
    isNuts,
    outs,
    spr,
    position,
    boardTexture,
    street,
    facingBet,
    heroStyle
  });

  // Generate reasoning
  const reasoning = generateReasoning(decision, {
    ...params,
    inPosition,
    drawEquity
  });

  // Generate alternatives
  const alternatives = generateAlternatives(decision, params);

  // Generate warnings
  const warnings = generateWarnings(params);

  // Calculate commitment
  const sprZone = getSPRZone(spr);

  return {
    action: decision.action,
    confidence: Math.round(Math.min(0.95, Math.max(0.1, decision.confidence)) * 100) / 100,
    betType: decision.betType || null,
    reasoning,
    alternatives,
    warnings,
    metadata: {
      equityGap: Math.round((equity - potOdds) * 10) / 10,
      sprZone,
      inPosition,
      decisionReason: decision.reason,
      heroStyle
    }
  };
}

/**
 * Simple action classification
 */
export function classifyAction(equity, potOdds, hasDraws) {
  const gap = equity - potOdds;

  if (gap < -EQUITY_THRESHOLDS.CLEAR_FOLD_MARGIN && !hasDraws) return 'fold';
  if (gap > EQUITY_THRESHOLDS.VALUE_RAISE_MARGIN) return 'raise';
  if (gap > -EQUITY_THRESHOLDS.MARGINAL_ZONE) return 'call';
  if (hasDraws) return 'call';
  return 'fold';
}

export default {
  recommendAction,
  classifyAction,
  EQUITY_THRESHOLDS,
  SPR_ZONES
};
