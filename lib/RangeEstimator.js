/**
 * Opponent Range Estimator
 *
 * Estimates opponent hand ranges based on position, actions, and board texture.
 * Returns a probability distribution over hand types (0-9) that can be used
 * for equity calculation.
 */

// Hand type constants
const HandType = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
  ROYAL_FLUSH: 9
};

// Position categories
const POSITIONS = {
  'UTG': 'EP', 'UTG+1': 'EP', 'EP': 'EP',
  'MP': 'MP', 'MP+1': 'MP', 'HJ': 'MP',
  'CO': 'CO',
  'BTN': 'BTN', 'BU': 'BTN', 'D': 'BTN',
  'SB': 'SB',
  'BB': 'BB',
  'unknown': 'MP'  // Default to middle position
};

/**
 * Default range profiles by tightness level
 */
const RANGE_PROFILES = {
  // Very tight (EP opens, 3-bet pots)
  tight: {
    handTypeDistribution: {
      0: 0.03,  // High card (rarely continues without something)
      1: 0.12,  // Pair
      2: 0.22,  // Two pair
      3: 0.18,  // Set
      4: 0.18,  // Straight
      5: 0.14,  // Flush
      6: 0.10,  // Full house
      7: 0.02,  // Quads
      8: 0.01,  // Straight flush
      9: 0.00   // Royal
    },
    nutBias: 0.75,
    drawHeavy: false,
    bluffFrequency: 0.05,
    description: 'tight range'
  },

  // Medium (CO/BTN opens, raised pots)
  medium: {
    handTypeDistribution: {
      0: 0.08,
      1: 0.18,
      2: 0.24,
      3: 0.14,
      4: 0.14,
      5: 0.11,
      6: 0.08,
      7: 0.02,
      8: 0.01,
      9: 0.00
    },
    nutBias: 0.55,
    drawHeavy: true,
    bluffFrequency: 0.12,
    description: 'medium range'
  },

  // Wide (BB defends, limped pots, loose players)
  wide: {
    handTypeDistribution: {
      0: 0.14,
      1: 0.24,
      2: 0.22,
      3: 0.11,
      4: 0.11,
      5: 0.08,
      6: 0.07,
      7: 0.02,
      8: 0.01,
      9: 0.00
    },
    nutBias: 0.35,
    drawHeavy: true,
    bluffFrequency: 0.18,
    description: 'wide range'
  },

  // Polarized (big bets, check-raises)
  polarized: {
    handTypeDistribution: {
      0: 0.12,  // Bluffs
      1: 0.05,
      2: 0.08,
      3: 0.15,
      4: 0.18,
      5: 0.18,
      6: 0.15,
      7: 0.05,
      8: 0.03,
      9: 0.01
    },
    nutBias: 0.80,
    drawHeavy: false,
    bluffFrequency: 0.25,
    description: 'polarized range'
  }
};

/**
 * Preflop range widths by position (percentage of hands played)
 */
const PREFLOP_RANGES = {
  EP: { open: 0.15, call: 0.10, threebet: 0.05 },
  MP: { open: 0.22, call: 0.15, threebet: 0.07 },
  CO: { open: 0.30, call: 0.20, threebet: 0.10 },
  BTN: { open: 0.45, call: 0.30, threebet: 0.12 },
  SB: { open: 0.30, call: 0.25, threebet: 0.08 },
  BB: { open: 0.00, call: 0.40, threebet: 0.10 }
};

/**
 * Action adjustments - how actions modify ranges
 */
const ACTION_ADJUSTMENTS = {
  // Betting actions
  bet_small: { strengthShift: 0.1, narrowing: 0.8, description: 'small bet' },
  bet_medium: { strengthShift: 0.2, narrowing: 0.7, description: 'medium bet' },
  bet_large: { strengthShift: 0.4, narrowing: 0.5, polarize: true, description: 'large bet' },

  // Raising actions
  raise: { strengthShift: 0.3, narrowing: 0.5, description: 'raise' },
  reraise: { strengthShift: 0.5, narrowing: 0.3, description: 're-raise' },

  // Passive actions
  check: { strengthShift: -0.1, narrowing: 0.9, capped: true, description: 'check' },
  call: { strengthShift: 0.0, narrowing: 0.7, description: 'call' },

  // Special actions
  check_raise: { strengthShift: 0.5, narrowing: 0.4, polarize: true, description: 'check-raise' },
  donk_bet: { strengthShift: 0.2, narrowing: 0.6, description: 'donk bet' }
};

/**
 * Categorize position into standard groups
 */
function categorizePosition(position) {
  if (!position) return 'MP';
  const normalized = position.toUpperCase().replace(/\s/g, '');
  return POSITIONS[normalized] || 'MP';
}

/**
 * Categorize bet size relative to pot
 */
function categorizeBetSize(betSize, potSize) {
  if (!betSize || !potSize) return 'medium';
  const ratio = betSize / potSize;
  if (ratio < 0.4) return 'small';
  if (ratio < 0.75) return 'medium';
  return 'large';
}

/**
 * Get base range profile from position and preflop action
 */
function getBaseRange(position, preflopAction) {
  const posCategory = categorizePosition(position);
  const rangeWidth = PREFLOP_RANGES[posCategory];

  if (!preflopAction || preflopAction === 'call') {
    // Caller - medium to wide range
    return rangeWidth.call > 0.25 ? 'wide' : 'medium';
  }

  if (preflopAction === 'raise' || preflopAction === 'open') {
    // Raiser - tighter range
    return rangeWidth.open > 0.30 ? 'medium' : 'tight';
  }

  if (preflopAction === '3bet' || preflopAction === 'reraise') {
    return 'tight';
  }

  return 'medium';
}

/**
 * Apply action adjustments to a range profile
 */
function applyActionAdjustment(range, action, betSize, potSize) {
  // Clone the range
  const adjusted = JSON.parse(JSON.stringify(range));

  // Determine action type
  let actionType;
  if (action === 'check') {
    actionType = 'check';
  } else if (action === 'call') {
    actionType = 'call';
  } else if (action === 'raise' || action === 'bet') {
    const sizeCategory = categorizeBetSize(betSize, potSize);
    actionType = `bet_${sizeCategory}`;
  } else if (action === 'check-raise' || action === 'checkraise') {
    actionType = 'check_raise';
  } else {
    actionType = 'bet_medium';  // Default
  }

  const adjustment = ACTION_ADJUSTMENTS[actionType];
  if (!adjustment) return adjusted;

  // Apply strength shift (move distribution toward stronger hands)
  const shift = adjustment.strengthShift;
  if (shift !== 0) {
    const dist = adjusted.handTypeDistribution;
    const newDist = {};

    for (let type = 0; type <= 9; type++) {
      const prob = dist[type] || 0;
      if (shift > 0) {
        // Shift toward stronger hands
        // Reduce weak hand probability, increase strong hand probability
        if (type <= 2) {
          newDist[type] = prob * (1 - shift);
        } else {
          newDist[type] = prob * (1 + shift * 0.5);
        }
      } else {
        // Shift toward weaker hands (checking/passive)
        if (type >= 4) {
          newDist[type] = prob * (1 + shift);  // shift is negative
        } else {
          newDist[type] = prob;
        }
      }
    }

    // Normalize
    const total = Object.values(newDist).reduce((a, b) => a + b, 0);
    for (let type = 0; type <= 9; type++) {
      adjusted.handTypeDistribution[type] = (newDist[type] || 0) / total;
    }
  }

  // Apply polarization
  if (adjustment.polarize) {
    const dist = adjusted.handTypeDistribution;
    // Increase strong hands and air, decrease medium
    dist[0] = (dist[0] || 0) * 1.5;  // Bluffs
    dist[1] = (dist[1] || 0) * 0.5;  // Weak
    dist[2] = (dist[2] || 0) * 0.6;  // Medium
    dist[5] = (dist[5] || 0) * 1.3;  // Strong
    dist[6] = (dist[6] || 0) * 1.3;  // Very strong

    // Normalize
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    for (let type = 0; type <= 9; type++) {
      adjusted.handTypeDistribution[type] = (dist[type] || 0) / total;
    }

    adjusted.description = 'polarized ' + adjusted.description;
  }

  // Apply capping (checking often caps range)
  if (adjustment.capped) {
    const dist = adjusted.handTypeDistribution;
    // Reduce very strong hands (they would bet)
    dist[6] = (dist[6] || 0) * 0.3;
    dist[7] = (dist[7] || 0) * 0.2;
    dist[8] = (dist[8] || 0) * 0.1;
    dist[9] = 0;

    // Normalize
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    for (let type = 0; type <= 9; type++) {
      adjusted.handTypeDistribution[type] = (dist[type] || 0) / total;
    }

    adjusted.description = 'capped ' + adjusted.description;
  }

  return adjusted;
}

/**
 * Apply board texture adjustments
 */
function applyBoardAdjustment(range, boardTexture) {
  if (!boardTexture) return range;

  const adjusted = JSON.parse(JSON.stringify(range));
  const dist = adjusted.handTypeDistribution;

  // Monotone board - flushes dominate
  if (boardTexture.flushMade || boardTexture.suitedness === 'monotone') {
    dist[5] = (dist[5] || 0) * 2.5;  // Flush
    dist[8] = (dist[8] || 0) * 3.0;  // Straight flush
    dist[0] = (dist[0] || 0) * 0.3;  // High card very unlikely
    dist[1] = (dist[1] || 0) * 0.4;  // Pair unlikely
    adjusted.description += ' (flush-heavy)';
  }

  // Connected board - straights more likely
  if (boardTexture.connectivity === 'connected') {
    dist[4] = (dist[4] || 0) * 1.6;  // Straight
    dist[8] = (dist[8] || 0) * 1.3;  // Straight flush
    adjusted.description += ' (straight-heavy)';
  }

  // Paired board - boats more likely
  if (boardTexture.isPaired) {
    dist[6] = (dist[6] || 0) * 2.0;  // Full house
    dist[7] = (dist[7] || 0) * 2.5;  // Quads
    dist[3] = (dist[3] || 0) * 1.5;  // Trips
    adjusted.description += ' (boat-heavy)';
  }

  // Normalize
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  for (let type = 0; type <= 9; type++) {
    adjusted.handTypeDistribution[type] = (dist[type] || 0) / total;
  }

  return adjusted;
}

/**
 * Adjust range for multi-way pots
 */
function adjustForMultiway(range, playersInHand) {
  if (playersInHand <= 2) return range;

  const adjusted = JSON.parse(JSON.stringify(range));
  const dist = adjusted.handTypeDistribution;

  // In multi-way pots, players need stronger hands
  const narrowingFactor = 1 + (playersInHand - 2) * 0.15;

  // Reduce weaker hands
  for (let type = 0; type <= 2; type++) {
    dist[type] = (dist[type] || 0) / narrowingFactor;
  }

  // Increase stronger hands
  for (let type = 3; type <= 9; type++) {
    dist[type] = (dist[type] || 0) * (1 + (narrowingFactor - 1) * 0.3);
  }

  // Normalize
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  for (let type = 0; type <= 9; type++) {
    adjusted.handTypeDistribution[type] = (dist[type] || 0) / total;
  }

  adjusted.description += ` (${playersInHand}-way)`;
  return adjusted;
}

/**
 * Main function: Estimate opponent range
 */
export function estimateOpponentRange(
  position,
  actions = [],
  boardTexture = null,
  street = 'flop',
  playersInHand = 2,
  potSize = 100
) {
  // Get base range from position
  const preflopAction = actions.find(a =>
    a.street === 'preflop' && (a.action === 'raise' || a.action === 'call' || a.action === '3bet')
  );
  const baseRangeType = getBaseRange(position, preflopAction?.action);
  let range = JSON.parse(JSON.stringify(RANGE_PROFILES[baseRangeType]));

  // Apply postflop action adjustments
  const streetActions = actions.filter(a => a.street === street);
  for (const actionInfo of streetActions) {
    range = applyActionAdjustment(
      range,
      actionInfo.action,
      actionInfo.amount,
      potSize
    );
  }

  // Apply board texture adjustments
  if (boardTexture) {
    range = applyBoardAdjustment(range, boardTexture);
  }

  // Adjust for multi-way pots
  range = adjustForMultiway(range, playersInHand);

  return range;
}

/**
 * Get a simple range description
 */
export function describeRange(range) {
  return range.description || 'unknown range';
}

/**
 * Assess confidence in range estimate
 */
export function assessRangeConfidence(actions) {
  if (!actions || actions.length === 0) return 'low';
  if (actions.length >= 3) return 'high';
  if (actions.length >= 1) return 'medium';
  return 'low';
}

export default {
  estimateOpponentRange,
  describeRange,
  assessRangeConfidence,
  RANGE_PROFILES,
  HandType
};
