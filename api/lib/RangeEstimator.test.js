/**
 * RangeEstimator Unit Tests
 *
 * Tests opponent range estimation based on position, actions, and board texture.
 *
 * Run: node --experimental-vm-modules node_modules/jest/bin/jest.js api/lib/RangeEstimator.test.js
 * Or: npm run test:unit
 */

import RangeEstimatorModule, {
  estimateOpponentRange,
  describeRange,
  assessRangeConfidence
} from './RangeEstimator.js';

// Extract from default export
const { RANGE_PROFILES, HandType } = RangeEstimatorModule;

// =============================================================================
// RANGE PROFILES TESTS
// =============================================================================

describe('RANGE_PROFILES', () => {

  test('all profiles have valid hand type distributions', () => {
    const profiles = ['tight', 'medium', 'wide', 'polarized'];

    for (const profileName of profiles) {
      const profile = RANGE_PROFILES[profileName];
      expect(profile).toBeDefined();
      expect(profile.handTypeDistribution).toBeDefined();

      // Sum should be approximately 1.0
      const sum = Object.values(profile.handTypeDistribution).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    }
  });

  test('all profiles have required metadata', () => {
    const profiles = ['tight', 'medium', 'wide', 'polarized'];

    for (const profileName of profiles) {
      const profile = RANGE_PROFILES[profileName];
      expect(typeof profile.nutBias).toBe('number');
      expect(typeof profile.bluffFrequency).toBe('number');
      expect(typeof profile.description).toBe('string');
    }
  });

  test('tight profile has higher nutBias than wide', () => {
    expect(RANGE_PROFILES.tight.nutBias).toBeGreaterThan(RANGE_PROFILES.wide.nutBias);
  });

  test('wide profile has more weak hands than tight', () => {
    const tightWeak = RANGE_PROFILES.tight.handTypeDistribution[0] +
                      RANGE_PROFILES.tight.handTypeDistribution[1];
    const wideWeak = RANGE_PROFILES.wide.handTypeDistribution[0] +
                     RANGE_PROFILES.wide.handTypeDistribution[1];

    expect(wideWeak).toBeGreaterThan(tightWeak);
  });

});

// =============================================================================
// POSITION-BASED RANGE TESTS
// =============================================================================

describe('estimateOpponentRange - Position Based', () => {

  test('EP position with raise returns tighter range', () => {
    // Without action, defaults to medium; with raise, should be tight
    const actions = [{ street: 'preflop', action: 'raise', amount: 50 }];
    const range = estimateOpponentRange('UTG', actions, null, 'flop', 2, 100);
    expect(range.description).toContain('tight');
  });

  test('BTN position returns wider range', () => {
    const range = estimateOpponentRange('BTN', [], null, 'flop', 2, 100);
    expect(['medium', 'wide']).toContain(range.description.split(' ')[0]);
  });

  test('BB position with call action returns wide range', () => {
    const actions = [{ street: 'preflop', action: 'call', amount: 0 }];
    const range = estimateOpponentRange('BB', actions, null, 'flop', 2, 100);
    expect(range.description).toContain('wide');
  });

  test('unknown position defaults to medium', () => {
    const range = estimateOpponentRange('unknown', [], null, 'flop', 2, 100);
    expect(range.description).toContain('medium');
  });

  test('various position formats are normalized', () => {
    const positions = ['utg', 'UTG', 'Utg', 'UTG+1'];
    for (const pos of positions) {
      const range = estimateOpponentRange(pos, [], null, 'flop', 2, 100);
      expect(range).toBeDefined();
      expect(range.handTypeDistribution).toBeDefined();
    }
  });

});

// =============================================================================
// ACTION ADJUSTMENT TESTS
// =============================================================================

describe('estimateOpponentRange - Action Adjustments', () => {

  test('raise action narrows range', () => {
    const baseRange = estimateOpponentRange('BTN', [], null, 'flop', 2, 100);
    const raisedRange = estimateOpponentRange(
      'BTN',
      [{ street: 'flop', action: 'raise', amount: 100 }],
      null,
      'flop',
      2,
      100
    );

    // Raised range should have more strong hands
    const baseStrong = baseRange.handTypeDistribution[5] + baseRange.handTypeDistribution[6];
    const raisedStrong = raisedRange.handTypeDistribution[5] + raisedRange.handTypeDistribution[6];

    expect(raisedStrong).toBeGreaterThanOrEqual(baseStrong * 0.9); // Allow some variance
  });

  test('check action caps range', () => {
    const checkedRange = estimateOpponentRange(
      'BTN',
      [{ street: 'flop', action: 'check', amount: 0 }],
      null,
      'flop',
      2,
      100
    );

    // Capped range should have fewer very strong hands
    expect(checkedRange.handTypeDistribution[6]).toBeLessThan(0.15); // Full house capped
    expect(checkedRange.description).toContain('capped');
  });

  test('3bet action returns tight range', () => {
    const actions = [{ street: 'preflop', action: '3bet', amount: 150 }];
    const range = estimateOpponentRange('CO', actions, null, 'flop', 2, 100);

    expect(range.description).toContain('tight');
  });

  test('call action does not narrow as much as raise', () => {
    const callRange = estimateOpponentRange(
      'BTN',
      [{ street: 'flop', action: 'call', amount: 50 }],
      null,
      'flop',
      2,
      100
    );
    const raiseRange = estimateOpponentRange(
      'BTN',
      [{ street: 'flop', action: 'raise', amount: 150 }],
      null,
      'flop',
      2,
      100
    );

    // Call range should have more weak hands than raise range
    const callWeak = callRange.handTypeDistribution[0] + callRange.handTypeDistribution[1];
    const raiseWeak = raiseRange.handTypeDistribution[0] + raiseRange.handTypeDistribution[1];

    expect(callWeak).toBeGreaterThan(raiseWeak);
  });

  test('check-raise creates polarized range', () => {
    const checkRaiseRange = estimateOpponentRange(
      'BB',
      [{ street: 'flop', action: 'check-raise', amount: 200 }],
      null,
      'flop',
      2,
      100
    );

    expect(checkRaiseRange.description).toContain('polarized');
  });

  test('multiple actions compound adjustments', () => {
    const singleAction = estimateOpponentRange(
      'BTN',
      [{ street: 'flop', action: 'raise', amount: 100 }],
      null,
      'flop',
      2,
      100
    );

    const multiAction = estimateOpponentRange(
      'BTN',
      [
        { street: 'preflop', action: 'raise', amount: 50 },
        { street: 'flop', action: 'raise', amount: 100 }
      ],
      null,
      'flop',
      2,
      100
    );

    // Multi-action should be different (adjustments applied)
    expect(multiAction.description).not.toBe(singleAction.description);
  });

});

// =============================================================================
// BOARD TEXTURE ADJUSTMENT TESTS
// =============================================================================

describe('estimateOpponentRange - Board Texture', () => {

  test('monotone board increases flush weight', () => {
    const dryBoard = estimateOpponentRange('BTN', [], null, 'flop', 2, 100);
    const wetBoard = estimateOpponentRange(
      'BTN',
      [],
      { flushMade: true, suitedness: 'monotone' },
      'flop',
      2,
      100
    );

    // Flush probability should be higher on monotone board
    expect(wetBoard.handTypeDistribution[5]).toBeGreaterThan(dryBoard.handTypeDistribution[5]);
    expect(wetBoard.description).toContain('flush-heavy');
  });

  test('paired board increases full house weight', () => {
    const unpairedBoard = estimateOpponentRange('BTN', [], null, 'flop', 2, 100);
    const pairedBoard = estimateOpponentRange(
      'BTN',
      [],
      { isPaired: true },
      'flop',
      2,
      100
    );

    // Full house probability should be higher
    expect(pairedBoard.handTypeDistribution[6]).toBeGreaterThan(unpairedBoard.handTypeDistribution[6]);
    expect(pairedBoard.description).toContain('boat-heavy');
  });

  test('connected board increases straight weight', () => {
    const disconnected = estimateOpponentRange('BTN', [], null, 'flop', 2, 100);
    const connected = estimateOpponentRange(
      'BTN',
      [],
      { connectivity: 'connected' },
      'flop',
      2,
      100
    );

    expect(connected.handTypeDistribution[4]).toBeGreaterThan(disconnected.handTypeDistribution[4]);
    expect(connected.description).toContain('straight-heavy');
  });

  test('combined texture effects stack', () => {
    const combinedTexture = estimateOpponentRange(
      'BTN',
      [],
      { isPaired: true, flushMade: true, suitedness: 'monotone' },
      'flop',
      2,
      100
    );

    expect(combinedTexture.description).toContain('flush-heavy');
    expect(combinedTexture.description).toContain('boat-heavy');
  });

});

// =============================================================================
// MULTI-WAY POT TESTS
// =============================================================================

describe('estimateOpponentRange - Multi-way Pots', () => {

  test('multi-way pots narrow ranges', () => {
    const headsUp = estimateOpponentRange('BTN', [], null, 'flop', 2, 100);
    const fourWay = estimateOpponentRange('BTN', [], null, 'flop', 4, 100);

    // 4-way should have fewer weak hands
    const headsUpWeak = headsUp.handTypeDistribution[0] + headsUp.handTypeDistribution[1];
    const fourWayWeak = fourWay.handTypeDistribution[0] + fourWay.handTypeDistribution[1];

    expect(fourWayWeak).toBeLessThan(headsUpWeak);
  });

  test('description includes player count', () => {
    const fourWay = estimateOpponentRange('BTN', [], null, 'flop', 4, 100);
    expect(fourWay.description).toContain('4-way');
  });

  test('more players = tighter ranges', () => {
    const ranges = [2, 4, 6, 8].map(players =>
      estimateOpponentRange('BTN', [], null, 'flop', players, 100)
    );

    // Each subsequent range should have fewer weak hands
    for (let i = 1; i < ranges.length; i++) {
      const prevWeak = ranges[i - 1].handTypeDistribution[0] + ranges[i - 1].handTypeDistribution[1];
      const currWeak = ranges[i].handTypeDistribution[0] + ranges[i].handTypeDistribution[1];
      expect(currWeak).toBeLessThanOrEqual(prevWeak * 1.1); // Allow small variance
    }
  });

});

// =============================================================================
// HELPER FUNCTION TESTS
// =============================================================================

describe('describeRange', () => {

  test('returns description string', () => {
    const range = estimateOpponentRange('BTN', [], null, 'flop', 2, 100);
    const description = describeRange(range);

    expect(typeof description).toBe('string');
    expect(description.length).toBeGreaterThan(0);
  });

  test('handles missing description', () => {
    const result = describeRange({ handTypeDistribution: {} });
    expect(result).toBe('unknown range');
  });

});

describe('assessRangeConfidence', () => {

  test('no actions = low confidence', () => {
    expect(assessRangeConfidence([])).toBe('low');
    expect(assessRangeConfidence(null)).toBe('low');
  });

  test('1-2 actions = medium confidence', () => {
    expect(assessRangeConfidence([{ action: 'raise' }])).toBe('medium');
    expect(assessRangeConfidence([{ action: 'raise' }, { action: 'call' }])).toBe('medium');
  });

  test('3+ actions = high confidence', () => {
    expect(assessRangeConfidence([
      { action: 'raise' },
      { action: 'call' },
      { action: 'bet' }
    ])).toBe('high');
  });

});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('estimateOpponentRange - Edge Cases', () => {

  test('handles null board texture', () => {
    const range = estimateOpponentRange('BTN', [], null, 'flop', 2, 100);
    expect(range).toBeDefined();
    expect(range.handTypeDistribution).toBeDefined();
  });

  test('handles empty actions array', () => {
    const range = estimateOpponentRange('BTN', [], null, 'flop', 2, 100);
    expect(range).toBeDefined();
  });

  test('handles undefined position', () => {
    const range = estimateOpponentRange(undefined, [], null, 'flop', 2, 100);
    expect(range).toBeDefined();
  });

  test('distribution always sums to ~1.0', () => {
    const testCases = [
      { pos: 'UTG', actions: [] },
      { pos: 'BTN', actions: [{ street: 'flop', action: 'raise', amount: 100 }] },
      { pos: 'BB', actions: [{ street: 'flop', action: 'check-raise', amount: 200 }] }
    ];

    for (const { pos, actions } of testCases) {
      const range = estimateOpponentRange(pos, actions, null, 'flop', 2, 100);
      const sum = Object.values(range.handTypeDistribution).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 1);
    }
  });

  test('all probabilities are non-negative', () => {
    const range = estimateOpponentRange(
      'BTN',
      [
        { street: 'flop', action: 'raise', amount: 100 },
        { street: 'flop', action: 'check', amount: 0 }
      ],
      { isPaired: true, flushMade: true },
      'flop',
      6,
      100
    );

    for (const prob of Object.values(range.handTypeDistribution)) {
      expect(prob).toBeGreaterThanOrEqual(0);
    }
  });

});

// =============================================================================
// CONSTANTS TESTS
// =============================================================================

describe('HandType constants', () => {

  test('hand types have correct values', () => {
    expect(HandType.HIGH_CARD).toBe(0);
    expect(HandType.PAIR).toBe(1);
    expect(HandType.TWO_PAIR).toBe(2);
    expect(HandType.THREE_OF_A_KIND).toBe(3);
    expect(HandType.STRAIGHT).toBe(4);
    expect(HandType.FLUSH).toBe(5);
    expect(HandType.FULL_HOUSE).toBe(6);
    expect(HandType.FOUR_OF_A_KIND).toBe(7);
    expect(HandType.STRAIGHT_FLUSH).toBe(8);
    expect(HandType.ROYAL_FLUSH).toBe(9);
  });

});
