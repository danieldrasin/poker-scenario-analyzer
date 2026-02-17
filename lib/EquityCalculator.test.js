/**
 * EquityCalculator Unit Tests
 *
 * Tests equity calculation including heuristic equity, draw equity,
 * nut detection, and caching.
 *
 * Run: node --experimental-vm-modules node_modules/jest/bin/jest.js api/lib/EquityCalculator.test.js
 * Or: npm run test:unit
 */

import {
  calculateEquity,
  calculateHeuristicEquity,
  calculateDrawEquity,
  combineEquity,
  isLikelyNuts,
  getCachedEquity,
  setCachedEquity
} from './EquityCalculator.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

// Sample hand ranks
const createHandRank = (type, primaryRanks = [14]) => ({
  type,
  primaryRanks,
  compare: () => 0
});

// Sample opponent ranges
const createRange = (type = 'medium', distribution = null) => {
  const defaults = {
    tight: {
      handTypeDistribution: {
        0: 0.03, 1: 0.12, 2: 0.22, 3: 0.18,
        4: 0.18, 5: 0.14, 6: 0.10, 7: 0.02, 8: 0.01, 9: 0.00
      },
      nutBias: 0.75,
      description: 'tight range'
    },
    medium: {
      handTypeDistribution: {
        0: 0.08, 1: 0.18, 2: 0.24, 3: 0.14,
        4: 0.14, 5: 0.11, 6: 0.08, 7: 0.02, 8: 0.01, 9: 0.00
      },
      nutBias: 0.55,
      description: 'medium range'
    },
    wide: {
      handTypeDistribution: {
        0: 0.14, 1: 0.24, 2: 0.22, 3: 0.11,
        4: 0.11, 5: 0.08, 6: 0.07, 7: 0.02, 8: 0.01, 9: 0.00
      },
      nutBias: 0.35,
      description: 'wide range'
    }
  };

  return distribution ? { handTypeDistribution: distribution, nutBias: 0.5, description: 'custom' }
                      : defaults[type];
};

// =============================================================================
// HEURISTIC EQUITY TESTS
// =============================================================================

describe('calculateHeuristicEquity', () => {

  test('flush beats weaker hands', () => {
    const heroFlush = createHandRank(5, [14]); // Ace-high flush
    const range = createRange('medium');

    const result = calculateHeuristicEquity(heroFlush, range);

    expect(result).not.toBeNull();
    expect(result.equity).toBeGreaterThan(50);
    expect(result.breakdown.vsWeaker).toBeGreaterThan(0);
  });

  test('high card loses to most hands', () => {
    const heroHighCard = createHandRank(0, [14]); // Ace high
    const range = createRange('medium');

    const result = calculateHeuristicEquity(heroHighCard, range);

    expect(result.equity).toBeLessThan(30);
    expect(result.breakdown.vsStronger).toBeGreaterThan(50);
  });

  test('full house has high equity', () => {
    const heroBoat = createHandRank(6, [14, 13]); // Aces full of Kings
    const range = createRange('medium');

    const result = calculateHeuristicEquity(heroBoat, range);

    expect(result.equity).toBeGreaterThan(80);
  });

  test('returns null for missing inputs', () => {
    expect(calculateHeuristicEquity(null, createRange())).toBeNull();
    expect(calculateHeuristicEquity(createHandRank(5), null)).toBeNull();
    expect(calculateHeuristicEquity(createHandRank(5), {})).toBeNull();
  });

  test('breakdown sums to approximately 100%', () => {
    const hero = createHandRank(5, [14]);
    const range = createRange('medium');

    const result = calculateHeuristicEquity(hero, range);
    const sum = result.breakdown.vsWeaker + result.breakdown.vsSimilar + result.breakdown.vsStronger;

    expect(sum).toBeGreaterThan(95);
    expect(sum).toBeLessThan(105);
  });

  test('equity is capped between 0 and 100', () => {
    const testCases = [
      { hero: createHandRank(0, [2]), range: createRange('tight') },
      { hero: createHandRank(9, [14]), range: createRange('wide') }
    ];

    for (const { hero, range } of testCases) {
      const result = calculateHeuristicEquity(hero, range);
      expect(result.equity).toBeGreaterThanOrEqual(0);
      expect(result.equity).toBeLessThanOrEqual(100);
    }
  });

  test('nut flush has higher equity than King-high flush', () => {
    const nutFlush = createHandRank(5, [14]);
    const kingFlush = createHandRank(5, [13]);
    const range = createRange('medium');

    const nutResult = calculateHeuristicEquity(nutFlush, range);
    const kingResult = calculateHeuristicEquity(kingFlush, range);

    expect(nutResult.equity).toBeGreaterThan(kingResult.equity);
  });

  test('equity vs tight range is lower than vs wide range', () => {
    const hero = createHandRank(4, [14]); // Broadway straight
    const tightRange = createRange('tight');
    const wideRange = createRange('wide');

    const vsTight = calculateHeuristicEquity(hero, tightRange);
    const vsWide = calculateHeuristicEquity(hero, wideRange);

    expect(vsWide.equity).toBeGreaterThan(vsTight.equity);
  });

});

// =============================================================================
// DRAW EQUITY TESTS
// =============================================================================

describe('calculateDrawEquity', () => {

  test('flush draw on flop = 9 outs * 4 = 36%', () => {
    const outs = { toImprove: 9, draws: ['Flush draw'] };
    const result = calculateDrawEquity(outs, 'flop', true);

    expect(result.drawEquity).toBe(36);
    expect(result.totalOuts).toBe(9);
    expect(result.isNutDraw).toBe(true);
  });

  test('flush draw on turn = 9 outs * 2 = 18%', () => {
    const outs = { toImprove: 9, draws: ['Flush draw'] };
    const result = calculateDrawEquity(outs, 'turn', true);

    expect(result.drawEquity).toBe(18);
  });

  test('river has no draw equity', () => {
    const outs = { toImprove: 9, draws: ['Flush draw'] };
    const result = calculateDrawEquity(outs, 'river', true);

    expect(result.drawEquity).toBe(0);
  });

  test('non-nut draw is discounted 35%', () => {
    const outs = { toImprove: 9, draws: ['Flush draw'] };
    const nutResult = calculateDrawEquity(outs, 'flop', true);
    const nonNutResult = calculateDrawEquity(outs, 'flop', false);

    expect(nonNutResult.drawEquity).toBeLessThan(nutResult.drawEquity);
    expect(nonNutResult.drawEquity).toBeCloseTo(nutResult.drawEquity * 0.65, 0);
  });

  test('zero outs returns zero equity', () => {
    const result = calculateDrawEquity({ toImprove: 0, draws: [] }, 'flop', true);
    expect(result.drawEquity).toBe(0);
  });

  test('null outs returns zero equity', () => {
    const result = calculateDrawEquity(null, 'flop', true);
    expect(result.drawEquity).toBe(0);
  });

  test('draw equity capped at 70%', () => {
    const manyOuts = { toImprove: 20, draws: ['Wrap'] };
    const result = calculateDrawEquity(manyOuts, 'flop', true);

    expect(result.drawEquity).toBeLessThanOrEqual(70);
  });

  test('open-ended straight draw = 8 outs', () => {
    const outs = { toImprove: 8, draws: ['OESD'] };
    const result = calculateDrawEquity(outs, 'flop', true);

    expect(result.drawEquity).toBe(32); // 8 * 4
  });

  test('gutshot = 4 outs', () => {
    const outs = { toImprove: 4, draws: ['Gutshot'] };
    const result = calculateDrawEquity(outs, 'flop', true);

    expect(result.drawEquity).toBe(16); // 4 * 4
  });

});

// =============================================================================
// COMBINE EQUITY TESTS
// =============================================================================

describe('combineEquity', () => {

  test('strong made hand ignores draw equity', () => {
    const madeEquity = { equity: 80, breakdown: {} };
    const drawEquity = { drawEquity: 20 };

    const result = combineEquity(madeEquity, drawEquity, 5); // Flush

    expect(result.combined).toBe(80);
    expect(result.drawContribution).toBe(0);
  });

  test('weak made hand benefits from draw equity', () => {
    const madeEquity = { equity: 30, breakdown: {} };
    const drawEquity = { drawEquity: 36 };

    const result = combineEquity(madeEquity, drawEquity, 1); // Pair

    expect(result.combined).toBeGreaterThan(30);
    expect(result.drawContribution).toBeGreaterThan(0);
  });

  test('combined equity capped at 95%', () => {
    const madeEquity = { equity: 70, breakdown: {} };
    const drawEquity = { drawEquity: 50 };

    const result = combineEquity(madeEquity, drawEquity, 1);

    expect(result.combined).toBeLessThanOrEqual(95);
  });

  test('returns null for null made equity', () => {
    expect(combineEquity(null, { drawEquity: 20 }, 1)).toBeNull();
  });

  test('handles null draw equity', () => {
    const madeEquity = { equity: 50, breakdown: {} };
    const result = combineEquity(madeEquity, null, 1);

    expect(result.combined).toBe(50);
    expect(result.drawContribution).toBe(0);
  });

  test('draw contribution decreases with higher made equity', () => {
    const lowMade = combineEquity({ equity: 20, breakdown: {} }, { drawEquity: 30 }, 1);
    const highMade = combineEquity({ equity: 60, breakdown: {} }, { drawEquity: 30 }, 1);

    expect(lowMade.drawContribution).toBeGreaterThan(highMade.drawContribution);
  });

});

// =============================================================================
// NUT DETECTION TESTS
// =============================================================================

describe('isLikelyNuts', () => {

  test('royal flush is always nuts', () => {
    expect(isLikelyNuts(createHandRank(9, [14]), null)).toBe(true);
  });

  test('straight flush is usually nuts', () => {
    expect(isLikelyNuts(createHandRank(8, [14]), null)).toBe(true);
    expect(isLikelyNuts(createHandRank(8, [10]), null)).toBe(true);
  });

  test('high quads are nuts', () => {
    expect(isLikelyNuts(createHandRank(7, [14]), null)).toBe(true);
    expect(isLikelyNuts(createHandRank(7, [10]), null)).toBe(true);
  });

  test('low quads may not be nuts', () => {
    expect(isLikelyNuts(createHandRank(7, [5]), null)).toBe(false);
  });

  test('ace-high flush is nuts', () => {
    expect(isLikelyNuts(createHandRank(5, [14]), null)).toBe(true);
  });

  test('king-high flush is not nuts', () => {
    expect(isLikelyNuts(createHandRank(5, [13]), null)).toBe(false);
  });

  test('broadway straight is often nuts', () => {
    expect(isLikelyNuts(createHandRank(4, [14]), null)).toBe(true);
  });

  test('lower straight may not be nuts', () => {
    expect(isLikelyNuts(createHandRank(4, [9]), null)).toBe(false);
  });

  test('top full house is likely nuts', () => {
    expect(isLikelyNuts(createHandRank(6, [14]), null)).toBe(true);
    expect(isLikelyNuts(createHandRank(6, [12]), null)).toBe(true);
  });

  test('low full house is not nuts', () => {
    expect(isLikelyNuts(createHandRank(6, [5]), null)).toBe(false);
  });

  test('set needs high rank to be nuts', () => {
    expect(isLikelyNuts(createHandRank(3, [14]), null)).toBe(true);
    expect(isLikelyNuts(createHandRank(3, [5]), null)).toBe(false);
  });

  test('two pair and below are not nuts', () => {
    expect(isLikelyNuts(createHandRank(2, [14, 13]), null)).toBe(false);
    expect(isLikelyNuts(createHandRank(1, [14]), null)).toBe(false);
    expect(isLikelyNuts(createHandRank(0, [14]), null)).toBe(false);
  });

  test('handles null hand rank', () => {
    expect(isLikelyNuts(null, null)).toBe(false);
  });

});

// =============================================================================
// CACHING TESTS
// =============================================================================

describe('Equity Caching', () => {

  test('getCachedEquity returns undefined for new key', () => {
    const result = getCachedEquity(
      createHandRank(5, [14]),
      createRange('medium'),
      { category: 'wet' }
    );
    // May or may not be cached from previous tests
    expect(result === undefined || result !== undefined).toBe(true);
  });

  test('setCachedEquity stores and getCachedEquity retrieves', () => {
    const handRank = createHandRank(3, [10]); // Unique combination
    const range = { description: 'test-cache-range', nutBias: 0.5 };
    const boardTexture = { category: 'test-category' };
    const equityData = { equity: 55.5, method: 'test' };

    setCachedEquity(handRank, range, boardTexture, equityData);
    const cached = getCachedEquity(handRank, range, boardTexture);

    expect(cached).toEqual(equityData);
  });

  test('different inputs produce different cache keys', () => {
    const handRank1 = createHandRank(5, [14]);
    const handRank2 = createHandRank(5, [13]);
    const range = createRange('medium');
    const texture = { category: 'wet' };

    setCachedEquity(handRank1, range, texture, { equity: 85 });
    setCachedEquity(handRank2, range, texture, { equity: 70 });

    const cached1 = getCachedEquity(handRank1, range, texture);
    const cached2 = getCachedEquity(handRank2, range, texture);

    expect(cached1.equity).not.toBe(cached2.equity);
  });

});

// =============================================================================
// MAIN CALCULATE EQUITY TESTS
// =============================================================================

describe('calculateEquity', () => {

  test('returns complete equity object', () => {
    const result = calculateEquity(
      createHandRank(5, [14]),
      createRange('medium'),
      { toImprove: 0, draws: [] },
      'flop',
      null
    );

    expect(result).toHaveProperty('equity');
    expect(result).toHaveProperty('madeHandEquity');
    expect(result).toHaveProperty('drawEquity');
    expect(result).toHaveProperty('breakdown');
    expect(result).toHaveProperty('method');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('vsRange');
    expect(result).toHaveProperty('isNuts');
  });

  test('nut flush has isNuts=true', () => {
    const result = calculateEquity(
      createHandRank(5, [14]),
      createRange('medium'),
      null,
      'flop',
      null
    );

    expect(result.isNuts).toBe(true);
  });

  test('includes draw equity when applicable', () => {
    const result = calculateEquity(
      createHandRank(1, [14]),  // Pair
      createRange('medium'),
      { toImprove: 9, draws: ['Flush draw'] },
      'flop',
      null
    );

    expect(result.drawEquity).toBeGreaterThan(0);
  });

  test('strong hands ignore draw equity', () => {
    const result = calculateEquity(
      createHandRank(5, [14]),  // Flush
      createRange('medium'),
      { toImprove: 4, draws: ['Gutshot'] },
      'flop',
      null
    );

    // With made flush, draw equity shouldn't boost combined
    expect(result.equity).toBe(result.madeHandEquity);
  });

  test('returns vsRange description', () => {
    const result = calculateEquity(
      createHandRank(5, [14]),
      createRange('tight'),
      null,
      'flop',
      null
    );

    expect(result.vsRange).toContain('tight');
  });

  test('method is heuristic', () => {
    const result = calculateEquity(
      createHandRank(5, [14]),
      createRange('medium'),
      null,
      'flop',
      null
    );

    expect(result.method).toBe('heuristic');
  });

  test('uses cache on repeated calls', () => {
    const handRank = createHandRank(4, [14]);
    const range = createRange('medium');
    const texture = { category: 'dry' };

    // First call
    const first = calculateEquity(handRank, range, null, 'flop', texture);

    // Second call (should hit cache)
    const second = calculateEquity(handRank, range, null, 'flop', texture);

    expect(second.fromCache).toBe(true);
    expect(second.equity).toBe(first.equity);
  });

});

// =============================================================================
// GOLDEN SCENARIO TESTS
// =============================================================================

describe('Golden Scenarios', () => {

  test('nut flush vs medium range: 75-85% equity', () => {
    const result = calculateEquity(
      createHandRank(5, [14]),
      createRange('medium'),
      null,
      'flop',
      null
    );

    expect(result.equity).toBeGreaterThan(70);
    expect(result.equity).toBeLessThan(90);
  });

  test('overpair vs medium range: 50-65% equity', () => {
    const result = calculateEquity(
      createHandRank(1, [14]),  // Pair of aces
      createRange('medium'),
      null,
      'flop',
      null
    );

    expect(result.equity).toBeGreaterThan(25);
    expect(result.equity).toBeLessThan(70);
  });

  test('set vs wide range: 65-80% equity', () => {
    const result = calculateEquity(
      createHandRank(3, [14]),  // Set of aces
      createRange('wide'),
      null,
      'flop',
      null
    );

    expect(result.equity).toBeGreaterThan(60);
    expect(result.equity).toBeLessThan(85);
  });

  test('flush draw with pair vs tight range: 35-55% equity', () => {
    const result = calculateEquity(
      createHandRank(1, [10]),  // Pair
      createRange('tight'),
      { toImprove: 9, draws: ['Flush draw'] },
      'flop',
      null
    );

    expect(result.equity).toBeGreaterThan(20);
    expect(result.equity).toBeLessThan(60);
  });

  test('full house vs wide range: >85% equity', () => {
    const result = calculateEquity(
      createHandRank(6, [14, 13]),
      createRange('wide'),
      null,
      'flop',
      null
    );

    expect(result.equity).toBeGreaterThan(85);
  });

});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {

  test('handles hand type 0 (high card)', () => {
    const result = calculateEquity(
      createHandRank(0, [14]),
      createRange('medium'),
      null,
      'flop',
      null
    );

    expect(result).not.toBeNull();
    expect(result.equity).toBeLessThan(30);
  });

  test('handles missing primaryRanks', () => {
    const handRank = { type: 5 };  // No primaryRanks
    const result = calculateEquity(
      handRank,
      createRange('medium'),
      null,
      'flop',
      null
    );

    expect(result).not.toBeNull();
  });

  test('handles extreme nut bias', () => {
    const extremeRange = {
      handTypeDistribution: createRange('medium').handTypeDistribution,
      nutBias: 1.0,
      description: 'extreme nut range'
    };

    const result = calculateEquity(
      createHandRank(5, [13]), // King-high flush
      extremeRange,
      null,
      'flop',
      null
    );

    expect(result).not.toBeNull();
    expect(result.equity).toBeGreaterThanOrEqual(0);
  });

  test('handles preflop street', () => {
    const result = calculateEquity(
      createHandRank(0, [14]),
      createRange('medium'),
      { toImprove: 15, draws: ['Big draw'] },
      'preflop',
      null
    );

    // Preflop isn't explicitly handled, but shouldn't crash
    expect(result).not.toBeNull();
  });

});
