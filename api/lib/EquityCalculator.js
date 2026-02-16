/**
 * Equity Calculator
 *
 * Calculates equity (probability of winning) against opponent ranges.
 * Provides both fast heuristic and accurate Monte Carlo methods.
 */

/**
 * Calculate heuristic equity vs opponent range
 * Fast method (~1ms) that compares hand types directly
 */
export function calculateHeuristicEquity(heroHandRank, opponentRange) {
  if (!heroHandRank || !opponentRange || !opponentRange.handTypeDistribution) {
    return null;
  }

  const dist = opponentRange.handTypeDistribution;
  const heroType = heroHandRank.type;
  const heroPrimaryRank = heroHandRank.primaryRanks?.[0] || 7;

  let equity = 0;
  let beatWeaker = 0;
  let tiesSameType = 0;
  let loseToStronger = 0;

  for (let oppType = 0; oppType <= 9; oppType++) {
    const oppProb = dist[oppType] || 0;

    if (heroType > oppType) {
      // Hero has stronger hand type - wins
      equity += oppProb;
      beatWeaker += oppProb;
    } else if (heroType === oppType) {
      // Same hand type - compare kickers/ranks
      const kickerWinRate = estimateKickerWinRate(heroType, heroPrimaryRank, opponentRange.nutBias);
      equity += oppProb * kickerWinRate;
      tiesSameType += oppProb;
    } else {
      // Opponent has stronger hand type - loses
      loseToStronger += oppProb;
    }
  }

  // Ensure equity is between 0 and 100
  equity = Math.max(0, Math.min(100, equity * 100));

  return {
    equity: Math.round(equity * 10) / 10,
    breakdown: {
      vsWeaker: Math.round(beatWeaker * 1000) / 10,
      vsSimilar: Math.round(tiesSameType * 1000) / 10,
      vsStronger: Math.round(loseToStronger * 1000) / 10
    },
    method: 'heuristic',
    confidence: assessEquityConfidence(opponentRange)
  };
}

/**
 * Estimate win rate when both players have same hand type
 */
function estimateKickerWinRate(handType, heroPrimaryRank, nutBias = 0.5) {
  // Higher primary rank = more likely to win
  // Ace = 14, King = 13, etc.

  // Calculate percentile of hero's primary rank (2-14 scale)
  const rankPercentile = (heroPrimaryRank - 2) / 12;  // 0 to 1

  // Adjust for opponent's nut bias
  // High nut bias = opponent more likely to have top of type
  const adjustedWinRate = rankPercentile * (1 - nutBias * 0.5) + (1 - nutBias) * 0.3;

  // Hand type specific adjustments
  switch (handType) {
    case 9: // Royal flush - always ties
      return 0.5;

    case 8: // Straight flush - high card matters
      return adjustedWinRate;

    case 7: // Quads - kicker rarely matters in Omaha
      return 0.5;

    case 6: // Full house - trips rank matters most
      return adjustedWinRate * 0.8 + 0.1;

    case 5: // Flush - ace-high is critical
      if (heroPrimaryRank === 14) return 0.85;  // Nut flush
      if (heroPrimaryRank === 13) return 0.60;  // King-high
      return adjustedWinRate * 0.5;

    case 4: // Straight - nut straight vs lower
      if (heroPrimaryRank === 14) return 0.75;  // Broadway
      return adjustedWinRate * 0.6 + 0.2;

    case 3: // Set - top set usually wins
      return adjustedWinRate * 0.7 + 0.15;

    case 2: // Two pair - top two usually good
      return adjustedWinRate * 0.6 + 0.2;

    case 1: // Pair - overpair matters
      return adjustedWinRate * 0.5 + 0.25;

    case 0: // High card - rare scenario
      return adjustedWinRate * 0.4 + 0.3;

    default:
      return 0.5;
  }
}

/**
 * Calculate draw equity using Rule of 4 and 2
 */
export function calculateDrawEquity(outs, street, isNutDraw = true) {
  if (!outs || outs.toImprove <= 0) {
    return { drawEquity: 0, totalOuts: 0 };
  }

  const totalOuts = outs.toImprove;

  // Apply Rule of 4 (flop) or Rule of 2 (turn)
  let rawEquity;
  if (street === 'flop') {
    rawEquity = totalOuts * 4;  // Two cards to come
  } else if (street === 'turn') {
    rawEquity = totalOuts * 2;  // One card to come
  } else {
    rawEquity = 0;  // River - no more draws
  }

  // Cap at reasonable maximum
  rawEquity = Math.min(rawEquity, 70);

  // Adjust for nut potential
  // Non-nut draws are worth less (might make hand and still lose)
  let adjustedEquity = rawEquity;
  if (!isNutDraw) {
    adjustedEquity = rawEquity * 0.65;  // 35% discount
  }

  return {
    drawEquity: Math.round(adjustedEquity * 10) / 10,
    totalOuts: totalOuts,
    isNutDraw: isNutDraw
  };
}

/**
 * Combine made hand equity with draw equity
 */
export function combineEquity(madeHandEquity, drawEquity, currentHandType) {
  if (!madeHandEquity) return null;

  const madeEquity = madeHandEquity.equity;
  const draw = drawEquity?.drawEquity || 0;

  // If we already have a strong made hand, draw equity is less relevant
  // (we're not drawing, we're protecting)
  if (currentHandType >= 4) {  // Straight or better
    return {
      current: madeEquity,
      withDraws: madeEquity,
      combined: madeEquity,
      drawContribution: 0
    };
  }

  // For weaker hands, draw equity adds value
  // But don't double count - if draw hits, it replaces made hand
  const drawContribution = draw * (1 - madeEquity / 100);
  const combined = Math.min(95, madeEquity + drawContribution);

  return {
    current: madeEquity,
    withDraws: Math.round(combined * 10) / 10,
    combined: Math.round(combined * 10) / 10,
    drawContribution: Math.round(drawContribution * 10) / 10
  };
}

/**
 * Assess confidence in equity estimate
 */
function assessEquityConfidence(range) {
  if (!range) return 'low';

  // More polarized or unusual ranges = lower confidence
  const dist = range.handTypeDistribution;
  if (!dist) return 'low';

  // Check for extreme distributions
  const maxProb = Math.max(...Object.values(dist));
  if (maxProb > 0.4) return 'low';  // Too concentrated

  const numNonZero = Object.values(dist).filter(p => p > 0.01).length;
  if (numNonZero < 4) return 'low';  // Too narrow

  return 'medium';
}

/**
 * Check if hero likely has the nuts for their hand type
 */
export function isLikelyNuts(handRank, boardTexture) {
  if (!handRank) return false;

  const primaryRank = handRank.primaryRanks?.[0] || 0;

  switch (handRank.type) {
    case 9: // Royal flush - always nuts
      return true;

    case 8: // Straight flush - usually nuts
      return true;

    case 7: // Quads - usually nuts unless higher quads possible
      return primaryRank >= 10;

    case 6: // Full house - need top set component
      return primaryRank >= 12;  // Queens full or better

    case 5: // Flush - need ace-high
      return primaryRank === 14;

    case 4: // Straight - need top end
      return primaryRank >= 13;  // King-high or broadway

    case 3: // Set - top set on board
      // Would need board info to determine
      return primaryRank >= 12;

    default:
      return false;
  }
}

/**
 * Simple equity cache for repeated calculations
 */
const equityCache = new Map();
const MAX_CACHE_SIZE = 5000;

function getCacheKey(heroType, heroPrimary, rangeType, boardCategory) {
  return `${heroType}-${heroPrimary}-${rangeType}-${boardCategory}`;
}

export function getCachedEquity(heroHandRank, range, boardTexture) {
  const key = getCacheKey(
    heroHandRank.type,
    heroHandRank.primaryRanks?.[0] || 0,
    range.description || 'unknown',
    boardTexture?.category || 'unknown'
  );
  return equityCache.get(key);
}

export function setCachedEquity(heroHandRank, range, boardTexture, equity) {
  const key = getCacheKey(
    heroHandRank.type,
    heroHandRank.primaryRanks?.[0] || 0,
    range.description || 'unknown',
    boardTexture?.category || 'unknown'
  );

  // Limit cache size
  if (equityCache.size >= MAX_CACHE_SIZE) {
    const firstKey = equityCache.keys().next().value;
    equityCache.delete(firstKey);
  }

  equityCache.set(key, equity);
}

/**
 * Main equity calculation function
 */
export function calculateEquity(
  heroHandRank,
  opponentRange,
  outs = null,
  street = 'flop',
  boardTexture = null
) {
  // Check cache first
  const cached = getCachedEquity(heroHandRank, opponentRange, boardTexture);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  // Calculate heuristic equity
  const heuristicEquity = calculateHeuristicEquity(heroHandRank, opponentRange);
  if (!heuristicEquity) {
    return null;
  }

  // Calculate draw equity
  const isNut = isLikelyNuts(heroHandRank, boardTexture);
  const drawEquity = calculateDrawEquity(outs, street, isNut);

  // Combine equities
  const combined = combineEquity(heuristicEquity, drawEquity, heroHandRank.type);

  const result = {
    equity: combined?.combined || heuristicEquity.equity,
    madeHandEquity: heuristicEquity.equity,
    drawEquity: drawEquity?.drawEquity || 0,
    breakdown: heuristicEquity.breakdown,
    method: 'heuristic',
    confidence: heuristicEquity.confidence,
    vsRange: opponentRange.description || 'unknown range',
    isNuts: isNut
  };

  // Cache the result
  setCachedEquity(heroHandRank, opponentRange, boardTexture, result);

  return result;
}

export default {
  calculateEquity,
  calculateHeuristicEquity,
  calculateDrawEquity,
  combineEquity,
  isLikelyNuts,
  getCachedEquity,
  setCachedEquity
};
