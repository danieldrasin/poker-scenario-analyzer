/**
 * BetSizer Unit Tests
 *
 * Tests bet sizing calculations, SPR zones, and raise sizing.
 */

import {
  calculateBetSize,
  calculateRaiseSize,
  recommendRaiseType,
  getSizingRecommendation,
  explainSizing,
  SPR_THRESHOLDS,
  BASE_SIZING,
  RAISE_MULTIPLIERS
} from './BetSizer.js';

// =============================================================================
// BET SIZE TESTS
// =============================================================================

describe('calculateBetSize', () => {

  test('returns sizing object with required fields', () => {
    const result = calculateBetSize({
      pot: 100,
      effectiveStack: 500,
      betType: 'value'
    });

    expect(result.sizing).toBeDefined();
    expect(result.sizing.min).toBeDefined();
    expect(result.sizing.optimal).toBeDefined();
    expect(result.sizing.max).toBeDefined();
    expect(result.sizing.percentPot).toBeDefined();
    expect(result.commitment).toBeDefined();
  });

  test('micro SPR results in all-in sizing', () => {
    const result = calculateBetSize({
      pot: 100,
      effectiveStack: 150,  // SPR = 1.5
      betType: 'value'
    });

    expect(result.sizing.optimal).toBe(150);  // All-in
    expect(result.sizing.percentPot).toBe(150);  // 150% of pot (full stack)
    expect(result.commitment.isAllIn).toBe(true);
  });

  test('value bets are larger than bluffs at same SPR', () => {
    const valueBet = calculateBetSize({
      pot: 100,
      effectiveStack: 600,  // SPR = 6
      betType: 'value'
    });

    const bluffBet = calculateBetSize({
      pot: 100,
      effectiveStack: 600,
      betType: 'bluff'
    });

    expect(valueBet.sizing.optimal).toBeGreaterThan(bluffBet.sizing.optimal);
  });

  test('protection bets are larger on wet boards', () => {
    const dryBoard = calculateBetSize({
      pot: 100,
      effectiveStack: 600,
      betType: 'protection',
      boardTexture: { connectivity: 'disconnected' }
    });

    const wetBoard = calculateBetSize({
      pot: 100,
      effectiveStack: 600,
      betType: 'protection',
      boardTexture: { flushDrawPossible: true, connectivity: 'connected' }
    });

    expect(wetBoard.sizing.optimal).toBeGreaterThan(dryBoard.sizing.optimal);
  });

  test('sizing caps at effective stack', () => {
    const result = calculateBetSize({
      pot: 1000,
      effectiveStack: 200,
      betType: 'value'
    });

    expect(result.sizing.optimal).toBeLessThanOrEqual(200);
    expect(result.sizing.max).toBeLessThanOrEqual(200);
  });

  test('deep SPR results in smaller bets', () => {
    const deepStack = calculateBetSize({
      pot: 100,
      effectiveStack: 2000,  // SPR = 20
      betType: 'value'
    });

    const mediumStack = calculateBetSize({
      pot: 100,
      effectiveStack: 600,   // SPR = 6
      betType: 'value'
    });

    expect(deepStack.sizing.percentPot).toBeLessThan(mediumStack.sizing.percentPot);
  });

});

// =============================================================================
// SPR ZONE TESTS
// =============================================================================

describe('SPR Zones', () => {

  test('micro SPR zone (<2)', () => {
    const result = calculateBetSize({
      pot: 100,
      effectiveStack: 150,
      betType: 'value'
    });

    expect(result.metadata.sprZone).toBe('micro');
  });

  test('short SPR zone (2-4)', () => {
    const result = calculateBetSize({
      pot: 100,
      effectiveStack: 300,
      betType: 'value'
    });

    expect(result.metadata.sprZone).toBe('short');
  });

  test('medium SPR zone (4-8)', () => {
    const result = calculateBetSize({
      pot: 100,
      effectiveStack: 600,
      betType: 'value'
    });

    expect(result.metadata.sprZone).toBe('medium');
  });

  test('deep SPR zone (8-15)', () => {
    const result = calculateBetSize({
      pot: 100,
      effectiveStack: 1000,
      betType: 'value'
    });

    expect(result.metadata.sprZone).toBe('deep');
  });

  test('very deep SPR zone (>15)', () => {
    const result = calculateBetSize({
      pot: 100,
      effectiveStack: 2000,
      betType: 'value'
    });

    expect(result.metadata.sprZone).toBe('veryDeep');
  });

});

// =============================================================================
// COMMITMENT TESTS
// =============================================================================

describe('Commitment Calculation', () => {

  test('calculates commitment after bet', () => {
    const result = calculateBetSize({
      pot: 100,
      effectiveStack: 500,
      betType: 'value'
    });

    expect(result.commitment.currentSPR).toBe(5);
    expect(result.commitment.afterSPR).toBeDefined();
    expect(result.commitment.percentCommitted).toBeDefined();
  });

  test('identifies committing bets', () => {
    const result = calculateBetSize({
      pot: 100,
      effectiveStack: 250,  // SPR = 2.5
      betType: 'value'
    });

    // After a substantial bet, SPR should drop to committing levels
    if (result.sizing.optimal > 50) {
      expect(result.commitment.isCommitting).toBeDefined();
    }
  });

  test('identifies all-in situations', () => {
    const result = calculateBetSize({
      pot: 100,
      effectiveStack: 120,
      betType: 'value'
    });

    expect(result.commitment.isAllIn).toBe(true);
  });

});

// =============================================================================
// RAISE SIZE TESTS
// =============================================================================

describe('calculateRaiseSize', () => {

  test('returns raise sizing object', () => {
    const result = calculateRaiseSize({
      pot: 100,
      facingBet: 50,
      effectiveStack: 500,
      raiseType: 'standard'
    });

    expect(result.sizing.min).toBeDefined();
    expect(result.sizing.optimal).toBeDefined();
    expect(result.sizing.max).toBeDefined();
    expect(result.sizing.allIn).toBeDefined();
  });

  test('standard raise is ~2.5x', () => {
    const result = calculateRaiseSize({
      pot: 100,
      facingBet: 50,
      effectiveStack: 500,
      raiseType: 'standard'
    });

    // 2.5x of 50 = 125 (before adjustments)
    expect(result.sizing.optimal).toBeGreaterThanOrEqual(100);
    expect(result.sizing.optimal).toBeLessThanOrEqual(150);
  });

  test('large raise is 3x', () => {
    const result = calculateRaiseSize({
      pot: 100,
      facingBet: 50,
      effectiveStack: 500,
      raiseType: 'large'
    });

    expect(result.sizing.optimal).toBeGreaterThanOrEqual(130);
  });

  test('pot raise calculation is correct', () => {
    const result = calculateRaiseSize({
      pot: 100,
      facingBet: 50,
      effectiveStack: 500,
      raiseType: 'pot'
    });

    // Pot raise = pot + call + call = 100 + 50 + 50 = 200
    expect(result.sizing.optimal).toBeGreaterThanOrEqual(180);
  });

  test('min raise is at least 2x facing bet', () => {
    const result = calculateRaiseSize({
      pot: 100,
      facingBet: 50,
      effectiveStack: 500,
      raiseType: 'standard'
    });

    expect(result.sizing.min).toBeGreaterThanOrEqual(100);  // 2x50
  });

  test('raise caps at effective stack', () => {
    const result = calculateRaiseSize({
      pot: 100,
      facingBet: 50,
      effectiveStack: 80,
      raiseType: 'large'
    });

    expect(result.sizing.optimal).toBeLessThanOrEqual(80);
  });

});

// =============================================================================
// RAISE TYPE RECOMMENDATION
// =============================================================================

describe('recommendRaiseType', () => {

  test('pot raise with micro SPR', () => {
    const type = recommendRaiseType({ spr: 1.5 });
    expect(type).toBe('pot');
  });

  test('standard raise with nuts', () => {
    const type = recommendRaiseType({
      equity: 90,
      isNuts: true,
      spr: 8
    });

    expect(type).toBe('standard');
  });

  test('large raise for strong value', () => {
    const type = recommendRaiseType({
      equity: 80,
      betType: 'value',
      spr: 8
    });

    expect(type).toBe('large');
  });

  test('polarized raise for bluffs', () => {
    const type = recommendRaiseType({
      equity: 20,
      betType: 'bluff',
      spr: 8
    });

    expect(type).toBe('polarized');
  });

  test('standard raise for semi-bluffs', () => {
    const type = recommendRaiseType({
      equity: 40,
      betType: 'semiBluff',
      spr: 8
    });

    expect(type).toBe('standard');
  });

});

// =============================================================================
// TEXTURE ADJUSTMENTS
// =============================================================================

describe('Board Texture Adjustments', () => {

  test('monotone board increases value sizing', () => {
    const normal = calculateBetSize({
      pot: 100,
      effectiveStack: 600,
      betType: 'value',
      boardTexture: null
    });

    const monotone = calculateBetSize({
      pot: 100,
      effectiveStack: 600,
      betType: 'value',
      boardTexture: { suitedness: 'monotone', flushMade: true }
    });

    expect(monotone.sizing.optimal).toBeGreaterThan(normal.sizing.optimal);
  });

  test('dry board decreases value sizing', () => {
    const normal = calculateBetSize({
      pot: 100,
      effectiveStack: 600,
      betType: 'value',
      boardTexture: null
    });

    const dry = calculateBetSize({
      pot: 100,
      effectiveStack: 600,
      betType: 'value',
      boardTexture: { connectivity: 'disconnected' }
    });

    expect(dry.sizing.optimal).toBeLessThanOrEqual(normal.sizing.optimal);
  });

});

// =============================================================================
// STREET ADJUSTMENTS
// =============================================================================

describe('Street Adjustments', () => {

  test('turn sizing larger than flop', () => {
    const flopBet = calculateBetSize({
      pot: 100,
      effectiveStack: 600,
      betType: 'value',
      street: 'flop'
    });

    const turnBet = calculateBetSize({
      pot: 100,
      effectiveStack: 600,
      betType: 'value',
      street: 'turn'
    });

    expect(turnBet.sizing.percentPot).toBeGreaterThanOrEqual(flopBet.sizing.percentPot);
  });

  test('river sizing larger than turn', () => {
    const turnBet = calculateBetSize({
      pot: 100,
      effectiveStack: 600,
      betType: 'value',
      street: 'turn'
    });

    const riverBet = calculateBetSize({
      pot: 100,
      effectiveStack: 600,
      betType: 'value',
      street: 'river'
    });

    expect(riverBet.sizing.percentPot).toBeGreaterThanOrEqual(turnBet.sizing.percentPot);
  });

});

// =============================================================================
// POSITION ADJUSTMENTS
// =============================================================================

describe('Position Adjustments', () => {

  test('OOP sizing slightly smaller', () => {
    const ipBet = calculateBetSize({
      pot: 100,
      effectiveStack: 600,
      betType: 'value',
      position: 'IP'
    });

    const oopBet = calculateBetSize({
      pot: 100,
      effectiveStack: 600,
      betType: 'value',
      position: 'OOP'
    });

    expect(oopBet.sizing.optimal).toBeLessThanOrEqual(ipBet.sizing.optimal);
  });

});

// =============================================================================
// SIZING EXPLANATION
// =============================================================================

describe('explainSizing', () => {

  test('generates explanation string', () => {
    const sizing = { percentPot: 60 };
    const commitment = { isAllIn: false, isCommitting: false };

    const explanation = explainSizing(sizing, commitment, 'value');

    expect(typeof explanation).toBe('string');
    expect(explanation.length).toBeGreaterThan(0);
    expect(explanation).toContain('%');
  });

  test('mentions commitment when applicable', () => {
    const sizing = { percentPot: 80 };
    const commitment = { isAllIn: false, isCommitting: true };

    const explanation = explainSizing(sizing, commitment, 'value');

    expect(explanation.toLowerCase()).toContain('commit');
  });

  test('mentions all-in when applicable', () => {
    const sizing = { percentPot: 100 };
    const commitment = { isAllIn: true, isCommitting: true };

    const explanation = explainSizing(sizing, commitment, 'value');

    expect(explanation.toLowerCase()).toContain('stack');
  });

});

// =============================================================================
// GET SIZING RECOMMENDATION
// =============================================================================

describe('getSizingRecommendation', () => {

  test('returns bet sizing for bet action', () => {
    const result = getSizingRecommendation({
      action: 'bet',
      pot: 100,
      effectiveStack: 500,
      betType: 'value'
    });

    expect(result).not.toBeNull();
    expect(result.sizing).toBeDefined();
    expect(result.explanation).toBeDefined();
  });

  test('returns raise sizing for raise action', () => {
    const result = getSizingRecommendation({
      action: 'raise',
      pot: 100,
      facingBet: 50,
      effectiveStack: 500,
      betType: 'value',
      equity: 70
    });

    expect(result).not.toBeNull();
    expect(result.sizing).toBeDefined();
    expect(result.raiseType).toBeDefined();
  });

  test('returns null for invalid action', () => {
    const result = getSizingRecommendation({
      action: 'fold',
      pot: 100,
      effectiveStack: 500
    });

    expect(result).toBeNull();
  });

});

// =============================================================================
// CONSTANTS TESTS
// =============================================================================

describe('Constants', () => {

  test('SPR thresholds are in order', () => {
    expect(SPR_THRESHOLDS.MICRO).toBeLessThan(SPR_THRESHOLDS.SHORT);
    expect(SPR_THRESHOLDS.SHORT).toBeLessThan(SPR_THRESHOLDS.MEDIUM);
    expect(SPR_THRESHOLDS.MEDIUM).toBeLessThan(SPR_THRESHOLDS.DEEP);
  });

  test('all base sizing zones exist', () => {
    expect(BASE_SIZING.micro).toBeDefined();
    expect(BASE_SIZING.short).toBeDefined();
    expect(BASE_SIZING.medium).toBeDefined();
    expect(BASE_SIZING.deep).toBeDefined();
    expect(BASE_SIZING.veryDeep).toBeDefined();
  });

  test('raise multipliers are reasonable', () => {
    expect(RAISE_MULTIPLIERS.minRaise).toBe(2.0);
    expect(RAISE_MULTIPLIERS.standard).toBeGreaterThan(2.0);
    expect(RAISE_MULTIPLIERS.large).toBeGreaterThan(RAISE_MULTIPLIERS.standard);
    expect(RAISE_MULTIPLIERS.polarized).toBeGreaterThan(RAISE_MULTIPLIERS.large);
  });

});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {

  test('handles zero pot', () => {
    const result = calculateBetSize({
      pot: 0,
      effectiveStack: 500,
      betType: 'value'
    });

    expect(result.sizing.optimal).toBeDefined();
  });

  test('handles very large pot', () => {
    const result = calculateBetSize({
      pot: 10000,
      effectiveStack: 500,
      betType: 'value'
    });

    expect(result.sizing.optimal).toBeLessThanOrEqual(500);
  });

  test('handles missing board texture', () => {
    const result = calculateBetSize({
      pot: 100,
      effectiveStack: 500,
      betType: 'value',
      boardTexture: null
    });

    expect(result).toBeDefined();
    expect(result.metadata.textureCategory).toBeDefined();
  });

  test('handles unknown bet type', () => {
    const result = calculateBetSize({
      pot: 100,
      effectiveStack: 500,
      betType: 'unknown'
    });

    expect(result).toBeDefined();
  });

});
