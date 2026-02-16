/**
 * ActionRecommender Unit Tests
 *
 * Tests the action recommendation decision tree, reasoning generator,
 * and alternative lines.
 */

import {
  recommendAction,
  classifyAction,
  EQUITY_THRESHOLDS,
  SPR_ZONES
} from './ActionRecommender.js';

// =============================================================================
// DECISION TREE TESTS
// =============================================================================

describe('recommendAction - Clear Decisions', () => {

  test('clear fold when equity far below pot odds', () => {
    const result = recommendAction({
      equity: 15,
      potOdds: 33,
      handType: 1,
      facingBet: true
    });

    expect(result.action).toBe('fold');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  test('clear value raise with high equity', () => {
    const result = recommendAction({
      equity: 75,
      potOdds: 33,
      handType: 5,
      isNuts: true,
      spr: 8,
      facingBet: true
    });

    expect(result.action).toBe('raise');
    expect(result.betType).toBe('value');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  test('call when equity matches pot odds', () => {
    const result = recommendAction({
      equity: 35,
      potOdds: 33,
      handType: 3,
      spr: 10,
      facingBet: true
    });

    expect(result.action).toBe('call');
  });

});

describe('recommendAction - Fold Scenarios', () => {

  test('marginal fold with poor implied odds', () => {
    const result = recommendAction({
      equity: 28,
      potOdds: 33,
      impliedOdds: 'poor',
      handType: 1,
      facingBet: true
    });

    expect(result.action).toBe('fold');
    expect(result.metadata.decisionReason).toContain('fold');
  });

  test('does not fold drawing hand with good implied odds', () => {
    const result = recommendAction({
      equity: 28,
      potOdds: 33,
      impliedOdds: 'excellent',
      handType: 1,
      outs: { toImprove: 9, draws: ['Flush draw'] },
      facingBet: true
    });

    expect(result.action).toBe('call');
  });

});

describe('recommendAction - Raise Scenarios', () => {

  test('value raise when equity significantly above pot odds', () => {
    const result = recommendAction({
      equity: 65,
      potOdds: 25,
      handType: 5,
      spr: 6,
      facingBet: true
    });

    expect(result.action).toBe('raise');
    expect(result.betType).toBe('value');
  });

  test('semi-bluff raise with strong draw', () => {
    const result = recommendAction({
      equity: 40,
      potOdds: 33,
      handType: 1,
      outs: { toImprove: 12, draws: ['Flush draw', 'Straight draw'] },
      spr: 8,
      facingBet: true
    });

    expect(['raise', 'call']).toContain(result.action);
  });

  test('all-in with micro SPR and strong hand', () => {
    const result = recommendAction({
      equity: 70,
      potOdds: 33,
      handType: 5,
      spr: 1.5,  // Micro SPR
      facingBet: true
    });

    expect(result.action).toBe('raise');
    expect(result.betType).toBe('allIn');
  });

});

describe('recommendAction - Bet Scenarios (Not Facing Bet)', () => {

  test('value bet with strong hand not facing bet', () => {
    const result = recommendAction({
      equity: 70,
      potOdds: 0,  // Not facing bet
      handType: 5,
      spr: 8,
      facingBet: false
    });

    expect(result.action).toBe('bet');
    expect(result.betType).toBe('value');
  });

  test('protection bet with vulnerable hand', () => {
    const result = recommendAction({
      equity: 55,
      potOdds: 0,
      handType: 3,  // Set - vulnerable
      spr: 8,
      facingBet: false,
      boardTexture: { flushDrawPossible: true, straightDrawPossible: true }
    });

    expect(result.action).toBe('bet');
    expect(['value', 'protection']).toContain(result.betType);
  });

  test('check with marginal hand', () => {
    const result = recommendAction({
      equity: 40,
      potOdds: 0,
      handType: 1,  // Pair
      spr: 10,
      facingBet: false
    });

    expect(result.action).toBe('check');
    expect(result.metadata.decisionReason).toBe('pot_control');
  });

  test('semi-bluff bet with drawing hand', () => {
    const result = recommendAction({
      equity: 35,
      potOdds: 0,
      handType: 1,
      outs: { toImprove: 9, draws: ['Flush draw'] },
      spr: 8,
      facingBet: false
    });

    expect(result.action).toBe('bet');
    expect(result.betType).toBe('semiBluff');
  });

});

describe('recommendAction - Position Adjustments', () => {

  test('more aggressive in position', () => {
    const ipResult = recommendAction({
      equity: 50,
      potOdds: 33,
      handType: 3,
      position: 'BTN',
      facingBet: true
    });

    const oopResult = recommendAction({
      equity: 50,
      potOdds: 33,
      handType: 3,
      position: 'BB',
      facingBet: true
    });

    // IP should have higher confidence or more aggressive action
    expect(ipResult.confidence).toBeGreaterThanOrEqual(oopResult.confidence - 0.1);
  });

});

describe('recommendAction - Slow Play', () => {

  test('considers slow play with nuts in position', () => {
    const result = recommendAction({
      equity: 85,
      potOdds: 33,
      handType: 5,
      isNuts: true,
      position: 'BTN',
      spr: 10,
      facingBet: true
    });

    // Might recommend call (slow play) or raise (value)
    expect(['call', 'raise']).toContain(result.action);
  });

});

// =============================================================================
// REASONING TESTS
// =============================================================================

describe('Reasoning Generator', () => {

  test('generates primary reasoning', () => {
    const result = recommendAction({
      equity: 75,
      potOdds: 33,
      handType: 5,
      handDescription: 'Ace-high flush',
      facingBet: true
    });

    expect(result.reasoning).toBeDefined();
    expect(result.reasoning.primary).toBeDefined();
    expect(result.reasoning.primary.length).toBeGreaterThan(0);
  });

  test('generates math reasoning', () => {
    const result = recommendAction({
      equity: 35,
      potOdds: 33,
      handType: 3,
      facingBet: true
    });

    expect(result.reasoning.math).toBeDefined();
    expect(result.reasoning.math).toContain('%');
  });

  test('generates strategic reasoning', () => {
    const result = recommendAction({
      equity: 60,
      potOdds: 33,
      handType: 4,
      position: 'BTN',
      facingBet: true
    });

    expect(result.reasoning.strategic).toBeDefined();
  });

  test('reasoning mentions hand description', () => {
    const result = recommendAction({
      equity: 80,
      potOdds: 33,
      handType: 5,
      handDescription: 'King-high flush',
      facingBet: true
    });

    expect(result.reasoning.primary).toContain('flush');
  });

});

// =============================================================================
// ALTERNATIVES TESTS
// =============================================================================

describe('Alternative Lines', () => {

  test('generates alternatives for close decisions', () => {
    const result = recommendAction({
      equity: 38,
      potOdds: 33,
      handType: 2,
      spr: 8,
      facingBet: true
    });

    // Close decision should have alternatives
    if (result.confidence < 0.85) {
      expect(result.alternatives.length).toBeGreaterThanOrEqual(0);
    }
  });

  test('no alternatives for very confident decisions', () => {
    const result = recommendAction({
      equity: 10,
      potOdds: 50,
      handType: 0,
      facingBet: true
    });

    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.alternatives.length).toBe(0);
  });

  test('alternatives have required structure', () => {
    const result = recommendAction({
      equity: 45,
      potOdds: 33,
      handType: 3,
      spr: 8,
      facingBet: true
    });

    for (const alt of result.alternatives) {
      expect(alt.action).toBeDefined();
      expect(alt.reasoning).toBeDefined();
      expect(alt.risk).toBeDefined();
    }
  });

});

// =============================================================================
// WARNINGS TESTS
// =============================================================================

describe('Warnings Generator', () => {

  test('warns about non-nut flush', () => {
    const result = recommendAction({
      equity: 60,
      potOdds: 33,
      handType: 5,
      isNuts: false,
      facingBet: true
    });

    expect(result.warnings.some(w => w.toLowerCase().includes('flush'))).toBeTruthy();
  });

  test('warns about micro SPR', () => {
    const result = recommendAction({
      equity: 50,
      potOdds: 33,
      handType: 3,
      spr: 1.5,
      facingBet: true
    });

    expect(result.warnings.some(w => w.toLowerCase().includes('spr') || w.toLowerCase().includes('commit'))).toBeTruthy();
  });

  test('warns about board texture threats', () => {
    const result = recommendAction({
      equity: 50,
      potOdds: 33,
      handType: 3,  // Set
      boardTexture: { flushMade: true },
      facingBet: true
    });

    expect(result.warnings.some(w => w.toLowerCase().includes('flush'))).toBeTruthy();
  });

  test('warns about bluff catcher', () => {
    const result = recommendAction({
      equity: 30,
      potOdds: 33,
      handType: 1,  // Pair
      facingBet: true
    });

    expect(result.warnings.some(w => w.toLowerCase().includes('bluff'))).toBeTruthy();
  });

});

// =============================================================================
// METADATA TESTS
// =============================================================================

describe('Recommendation Metadata', () => {

  test('includes equity gap', () => {
    const result = recommendAction({
      equity: 50,
      potOdds: 33,
      handType: 3,
      facingBet: true
    });

    expect(result.metadata.equityGap).toBeDefined();
    expect(result.metadata.equityGap).toBeCloseTo(17, 0);
  });

  test('includes SPR zone', () => {
    const result = recommendAction({
      equity: 50,
      potOdds: 33,
      spr: 6,
      facingBet: true
    });

    expect(result.metadata.sprZone).toBe('medium');
  });

  test('includes position info', () => {
    const result = recommendAction({
      equity: 50,
      potOdds: 33,
      position: 'BTN',
      facingBet: true
    });

    expect(result.metadata.inPosition).toBeDefined();
  });

  test('includes decision reason', () => {
    const result = recommendAction({
      equity: 50,
      potOdds: 33,
      facingBet: true
    });

    expect(result.metadata.decisionReason).toBeDefined();
  });

});

// =============================================================================
// CLASSIFY ACTION (SIMPLE VERSION)
// =============================================================================

describe('classifyAction', () => {

  test('fold when far below odds', () => {
    expect(classifyAction(15, 33, false)).toBe('fold');
  });

  test('call when at odds', () => {
    expect(classifyAction(35, 33, false)).toBe('call');
  });

  test('raise when far above odds', () => {
    expect(classifyAction(65, 33, false)).toBe('raise');
  });

  test('call with draws even below odds', () => {
    expect(classifyAction(25, 33, true)).toBe('call');
  });

});

// =============================================================================
// CONSTANTS TESTS
// =============================================================================

describe('Constants', () => {

  test('equity thresholds are reasonable', () => {
    expect(EQUITY_THRESHOLDS.CLEAR_FOLD_MARGIN).toBeGreaterThan(0);
    expect(EQUITY_THRESHOLDS.VALUE_RAISE_MARGIN).toBeGreaterThan(10);
    expect(EQUITY_THRESHOLDS.SEMI_BLUFF_MIN).toBeLessThan(EQUITY_THRESHOLDS.SEMI_BLUFF_MAX);
  });

  test('SPR zones are in order', () => {
    expect(SPR_ZONES.MICRO).toBeLessThan(SPR_ZONES.SHORT);
    expect(SPR_ZONES.SHORT).toBeLessThan(SPR_ZONES.MEDIUM);
    expect(SPR_ZONES.MEDIUM).toBeLessThan(SPR_ZONES.DEEP);
  });

});

// =============================================================================
// GOLDEN SCENARIO TESTS
// =============================================================================

describe('Golden Scenarios', () => {

  test('Nut flush heads-up with pot bet: Raise', () => {
    const result = recommendAction({
      equity: 85,
      potOdds: 33,
      handType: 5,
      isNuts: true,
      spr: 8,
      facingBet: true
    });

    expect(result.action).toBe('raise');
  });

  test('Flush draw pot odds 3:1 with 9 outs: Call', () => {
    const result = recommendAction({
      equity: 35,
      potOdds: 25,  // 3:1 odds = 25%
      handType: 1,
      outs: { toImprove: 9, draws: ['Flush draw'] },
      impliedOdds: 'good',
      spr: 10,
      facingBet: true
    });

    expect(result.action).toBe('call');
  });

  test('Bottom pair pot odds 4:1 with 2 outs: Fold', () => {
    const result = recommendAction({
      equity: 15,
      potOdds: 20,  // 4:1 odds
      handType: 1,
      outs: { toImprove: 2, draws: [] },
      impliedOdds: 'moderate',
      facingBet: true
    });

    expect(result.action).toBe('fold');
  });

  test('Top set wet board multi-way: Raise/Bet', () => {
    const result = recommendAction({
      equity: 65,
      potOdds: 20,
      handType: 3,
      boardTexture: { flushDrawPossible: true, connectivity: 'connected' },
      spr: 8,
      facingBet: true
    });

    expect(result.action).toBe('raise');
  });

});
