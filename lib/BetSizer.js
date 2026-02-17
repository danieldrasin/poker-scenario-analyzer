/**
 * Bet Sizer
 *
 * Calculates optimal bet and raise sizes based on SPR, hand type,
 * board texture, position, street, and hero's playing style.
 *
 * Style-aware: Applies sizing multiplier from StyleProfiles.js
 * (e.g., LAG bets bigger for pressure, Nit bets smaller for value).
 */

import { getSizingMultiplier } from './StyleProfiles.js';

// =============================================================================
// CONSTANTS
// =============================================================================

export const SPR_THRESHOLDS = {
  MICRO: 2,
  SHORT: 4,
  MEDIUM: 8,
  DEEP: 15
};

// Base sizing as percentage of pot for each SPR zone
export const BASE_SIZING = {
  micro: {
    value: { min: 1.0, optimal: 1.0, max: 1.0 },      // All-in
    bluff: { min: 1.0, optimal: 1.0, max: 1.0 },
    semiBluff: { min: 1.0, optimal: 1.0, max: 1.0 },
    protection: { min: 1.0, optimal: 1.0, max: 1.0 }
  },
  short: {
    value: { min: 0.66, optimal: 0.75, max: 1.0 },
    bluff: { min: 0.50, optimal: 0.60, max: 0.75 },
    semiBluff: { min: 0.60, optimal: 0.70, max: 0.85 },
    protection: { min: 0.75, optimal: 0.85, max: 1.0 }
  },
  medium: {
    value: { min: 0.50, optimal: 0.60, max: 0.75 },
    bluff: { min: 0.33, optimal: 0.45, max: 0.55 },
    semiBluff: { min: 0.45, optimal: 0.55, max: 0.65 },
    protection: { min: 0.60, optimal: 0.70, max: 0.80 }
  },
  deep: {
    value: { min: 0.33, optimal: 0.45, max: 0.55 },
    bluff: { min: 0.25, optimal: 0.35, max: 0.45 },
    semiBluff: { min: 0.35, optimal: 0.45, max: 0.55 },
    protection: { min: 0.45, optimal: 0.55, max: 0.65 }
  },
  veryDeep: {
    value: { min: 0.25, optimal: 0.35, max: 0.45 },
    bluff: { min: 0.20, optimal: 0.30, max: 0.40 },
    semiBluff: { min: 0.30, optimal: 0.40, max: 0.50 },
    protection: { min: 0.35, optimal: 0.45, max: 0.55 }
  }
};

// Adjustments based on board texture
export const TEXTURE_ADJUSTMENTS = {
  wet: { value: 1.15, bluff: 1.0, semiBluff: 1.0, protection: 1.20 },
  dry: { value: 0.90, bluff: 1.1, semiBluff: 0.95, protection: 0.85 },
  monotone: { value: 1.20, bluff: 0.80, semiBluff: 1.10, protection: 1.25 },
  paired: { value: 1.0, bluff: 0.90, semiBluff: 0.90, protection: 1.15 }
};

// Street multipliers (later streets = larger bets)
export const STREET_MULTIPLIERS = {
  flop: 1.0,
  turn: 1.10,
  river: 1.20
};

// Position adjustments
export const POSITION_SIZING = {
  IP: { value: 1.0, bluff: 1.05 },   // Slightly more bluffs IP
  OOP: { value: 0.95, bluff: 0.90 }  // Smaller sizing OOP
};

// Raise multipliers
export const RAISE_MULTIPLIERS = {
  minRaise: 2.0,
  standard: 2.5,
  large: 3.0,
  polarized: 3.5
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Determine SPR zone
 */
function getSPRZone(spr) {
  if (spr < SPR_THRESHOLDS.MICRO) return 'micro';
  if (spr < SPR_THRESHOLDS.SHORT) return 'short';
  if (spr < SPR_THRESHOLDS.MEDIUM) return 'medium';
  if (spr < SPR_THRESHOLDS.DEEP) return 'deep';
  return 'veryDeep';
}

/**
 * Determine board texture category
 */
function getTextureCategory(boardTexture) {
  if (!boardTexture) return 'medium';

  if (boardTexture.suitedness === 'monotone' || boardTexture.flushMade) {
    return 'monotone';
  }
  if (boardTexture.isPaired) {
    return 'paired';
  }
  if (boardTexture.connectivity === 'connected' || boardTexture.flushDrawPossible) {
    return 'wet';
  }
  return 'dry';
}

/**
 * Calculate pot after a bet is called
 */
function potAfterCall(currentPot, betSize) {
  return currentPot + betSize * 2;
}

/**
 * Calculate SPR after a bet is called
 */
function sprAfterBet(currentPot, betSize, remainingStack) {
  const newPot = potAfterCall(currentPot, betSize);
  const newStack = remainingStack - betSize;
  return newStack / newPot;
}

// =============================================================================
// MAIN SIZING FUNCTIONS
// =============================================================================

/**
 * Calculate bet size
 */
export function calculateBetSize(params) {
  const {
    pot,
    effectiveStack,
    betType = 'value',
    boardTexture = null,
    position = 'IP',
    street = 'flop',
    handStrength = 50,   // 0-100 scale
    isNuts = false,
    heroStyle = 'reg'
  } = params;

  // Get style sizing multiplier (LAG=1.15, Nit=0.85, etc.)
  const styleMult = getSizingMultiplier(heroStyle);

  // Calculate SPR
  const spr = effectiveStack / pot;
  const sprZone = getSPRZone(spr);

  // Get base sizing
  const baseSizing = BASE_SIZING[sprZone]?.[betType] || BASE_SIZING.medium.value;

  // Micro SPR: commit fully (all-in)
  if (sprZone === 'micro') {
    const isAllIn = true;
    return {
      sizing: {
        min: effectiveStack,
        optimal: effectiveStack,
        max: effectiveStack,
        percentPot: pot > 0 ? Math.round((effectiveStack / pot) * 100) : 100
      },
      commitment: {
        currentSPR: Math.round(spr * 10) / 10,
        afterSPR: 0,
        percentCommitted: 100,
        isCommitting: true,
        isAllIn
      },
      metadata: {
        sprZone,
        textureCategory: getTextureCategory(boardTexture),
        adjustments: { texture: 1, street: 1, position: 1, nuts: 1, style: styleMult }
      }
    };
  }

  // Apply adjustments
  const textureCategory = getTextureCategory(boardTexture);
  const textureAdj = TEXTURE_ADJUSTMENTS[textureCategory]?.[betType] || 1.0;
  const streetMult = STREET_MULTIPLIERS[street] || 1.0;
  const positionAdj = POSITION_SIZING[position]?.[betType === 'bluff' ? 'bluff' : 'value'] || 1.0;

  // Nut hand adjustment - can bet smaller to keep them in
  const nutAdj = isNuts && betType === 'value' ? 0.85 : 1.0;

  // Calculate final sizing (includes style multiplier)
  const sizing = {
    min: baseSizing.min * textureAdj * streetMult * positionAdj * nutAdj * styleMult,
    optimal: baseSizing.optimal * textureAdj * streetMult * positionAdj * nutAdj * styleMult,
    max: baseSizing.max * textureAdj * streetMult * positionAdj * nutAdj * styleMult
  };

  // Convert to actual amounts
  const amount = {
    min: Math.round(pot * sizing.min),
    optimal: Math.round(pot * sizing.optimal),
    max: Math.round(pot * sizing.max)
  };

  // Cap at effective stack
  amount.min = Math.min(amount.min, effectiveStack);
  amount.optimal = Math.min(amount.optimal, effectiveStack);
  amount.max = Math.min(amount.max, effectiveStack);

  // Check if this is effectively all-in
  const isAllIn = amount.optimal >= effectiveStack * 0.9;

  // Calculate commitment after bet
  const newSpr = sprAfterBet(pot, amount.optimal, effectiveStack);
  const percentCommitted = (amount.optimal / effectiveStack) * 100;
  const isCommitting = newSpr < 2;

  return {
    sizing: {
      min: amount.min,
      optimal: amount.optimal,
      max: amount.max,
      percentPot: Math.round(sizing.optimal * 100)
    },
    commitment: {
      currentSPR: Math.round(spr * 10) / 10,
      afterSPR: Math.round(newSpr * 10) / 10,
      percentCommitted: Math.round(percentCommitted),
      isCommitting,
      isAllIn
    },
    metadata: {
      sprZone,
      textureCategory,
      adjustments: {
        texture: textureAdj,
        street: streetMult,
        position: positionAdj,
        nuts: nutAdj,
        style: styleMult
      }
    }
  };
}

/**
 * Calculate raise size
 */
export function calculateRaiseSize(params) {
  const {
    pot,
    facingBet,
    effectiveStack,
    raiseType = 'standard',
    betType = 'value',
    boardTexture = null,
    position = 'IP',
    street = 'flop',
    heroStyle = 'reg'
  } = params;

  // Get style sizing multiplier
  const styleMult = getSizingMultiplier(heroStyle);

  // Calculate base raise amount
  let raiseAmount;
  const multiplier = RAISE_MULTIPLIERS[raiseType] || 2.5;

  if (raiseType === 'pot') {
    // Pot raise = pot + call + call = pot + 2*facingBet
    raiseAmount = pot + facingBet + facingBet;
  } else {
    // Standard raise = multiplier * facingBet
    raiseAmount = Math.round(facingBet * multiplier);
  }

  // Apply texture adjustments
  const textureCategory = getTextureCategory(boardTexture);
  const textureAdj = TEXTURE_ADJUSTMENTS[textureCategory]?.[betType] || 1.0;
  const streetMult = STREET_MULTIPLIERS[street] || 1.0;

  raiseAmount = Math.round(raiseAmount * textureAdj * streetMult * styleMult);

  // Calculate min raise (PLO rules: previous bet + amount to call)
  const minRaise = facingBet * 2;

  // Calculate various sizes
  const sizing = {
    min: Math.max(minRaise, facingBet * 2),
    optimal: raiseAmount,
    max: Math.min(pot + facingBet * 2, effectiveStack), // Pot raise max
    allIn: effectiveStack
  };

  // Cap at effective stack
  sizing.min = Math.min(sizing.min, effectiveStack);
  sizing.optimal = Math.min(sizing.optimal, effectiveStack);

  // Calculate total cost (call + raise)
  const totalCost = sizing.optimal;
  const newPot = pot + totalCost * 2;  // If called
  const remainingStack = effectiveStack - totalCost;
  const newSpr = remainingStack / newPot;

  return {
    sizing: {
      min: Math.round(sizing.min),
      optimal: Math.round(sizing.optimal),
      max: Math.round(sizing.max),
      allIn: Math.round(sizing.allIn),
      percentPot: Math.round((sizing.optimal / pot) * 100)
    },
    commitment: {
      totalCost: Math.round(totalCost),
      afterSPR: Math.round(newSpr * 10) / 10,
      isCommitting: newSpr < 2,
      isAllIn: totalCost >= effectiveStack * 0.9
    },
    metadata: {
      raiseType,
      multiplier: raiseType === 'pot' ? 'pot' : multiplier
    }
  };
}

/**
 * Determine recommended raise type based on situation
 */
export function recommendRaiseType(params) {
  const {
    equity = 50,
    betType = 'value',
    spr = 10,
    isNuts = false,
    boardTexture = null
  } = params;

  const sprZone = getSPRZone(spr);

  // Micro SPR: all-in or pot
  if (sprZone === 'micro') {
    return 'pot';
  }

  // Nuts: can vary sizing
  if (isNuts) {
    return equity > 80 ? 'standard' : 'large';  // Smaller with nuts to keep them in
  }

  // Strong value: large raise
  if (betType === 'value' && equity > 70) {
    return 'large';
  }

  // Semi-bluff: standard or polarized
  if (betType === 'semiBluff') {
    return 'standard';
  }

  // Bluff: polarized (large to maximize fold equity)
  if (betType === 'bluff') {
    return 'polarized';
  }

  // Protection: large to deny odds
  if (betType === 'protection') {
    return 'large';
  }

  return 'standard';
}

/**
 * Generate sizing explanation
 */
export function explainSizing(sizing, commitment, betType) {
  const explanations = [];

  // SPR-based explanation
  if (commitment.isAllIn) {
    explanations.push('SPR is low enough that this bet commits your stack.');
  } else if (commitment.isCommitting) {
    explanations.push('This bet puts you in a commit-or-fold situation on future streets.');
  }

  // Bet type explanation
  switch (betType) {
    case 'value':
      explanations.push(`Sizing at ${sizing.percentPot}% pot to extract maximum value from worse hands.`);
      break;
    case 'protection':
      explanations.push(`Larger sizing (${sizing.percentPot}% pot) to deny equity to drawing hands.`);
      break;
    case 'semiBluff':
      explanations.push(`Mid-sized bet (${sizing.percentPot}% pot) balances fold equity with pot growth.`);
      break;
    case 'bluff':
      explanations.push(`Sizing needs to be credible - ${sizing.percentPot}% pot looks like value.`);
      break;
  }

  return explanations.join(' ');
}

/**
 * Get sizing recommendation with full context
 */
export function getSizingRecommendation(params) {
  const {
    action,        // 'bet' or 'raise'
    pot,
    facingBet = 0,
    effectiveStack,
    betType = 'value',
    boardTexture,
    position,
    street,
    equity = 50,
    isNuts = false,
    heroStyle = 'reg'
  } = params;

  if (action === 'bet') {
    const result = calculateBetSize({
      pot,
      effectiveStack,
      betType,
      boardTexture,
      position,
      street,
      isNuts,
      heroStyle
    });

    result.explanation = explainSizing(result.sizing, result.commitment, betType);
    return result;
  }

  if (action === 'raise') {
    const raiseType = recommendRaiseType({
      equity,
      betType,
      spr: effectiveStack / pot,
      isNuts,
      boardTexture
    });

    const result = calculateRaiseSize({
      pot,
      facingBet,
      effectiveStack,
      raiseType,
      betType,
      boardTexture,
      position,
      street,
      heroStyle
    });

    result.explanation = explainSizing(result.sizing, result.commitment, betType);
    result.raiseType = raiseType;
    return result;
  }

  return null;
}

export default {
  calculateBetSize,
  calculateRaiseSize,
  recommendRaiseType,
  getSizingRecommendation,
  explainSizing,
  SPR_THRESHOLDS,
  BASE_SIZING,
  RAISE_MULTIPLIERS
};
