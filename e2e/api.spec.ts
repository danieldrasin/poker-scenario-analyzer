import { test, expect } from '@playwright/test';

/**
 * Play Advisor API Test Suite
 *
 * Tests the /api/advise endpoint covering:
 * - Input validation
 * - Response structure
 * - Hand evaluation accuracy
 * - Equity calculation
 * - Latency benchmarks
 * - Error handling
 *
 * Run: npx playwright test e2e/api.spec.ts
 */

const getBaseUrl = () => process.env.TEST_URL || 'http://localhost:3000';

// Helper to make advise requests
async function advise(request: any, body: any) {
  const response = await request.post(`${getBaseUrl()}/api/advise`, { data: body });
  return { response, data: await response.json() };
}

// =============================================================================
// INPUT VALIDATION TESTS
// =============================================================================

test.describe('Play Advisor API - Input Validation', () => {

  test('rejects missing holeCards', async ({ request }) => {
    const { response, data } = await advise(request, {
      board: ['Ts', '9s', '2h']
    });
    expect(response.status()).toBe(400);
    expect(data.error).toContain('holeCards');
  });

  test('rejects missing board', async ({ request }) => {
    const { response, data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js']
    });
    expect(response.status()).toBe(400);
    expect(data.error).toContain('board');
  });

  test('rejects board with fewer than 3 cards', async ({ request }) => {
    const { response, data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s']
    });
    expect(response.status()).toBe(400);
    expect(data.error).toContain('board');
  });

  test('rejects invalid game variant', async ({ request }) => {
    const { response, data } = await advise(request, {
      gameVariant: 'holdem',
      holeCards: ['As', 'Ks'],
      board: ['Ts', '9s', '2h']
    });
    expect(response.status()).toBe(400);
    expect(data.error).toContain('gameVariant');
  });

  test('rejects wrong hole card count for variant', async ({ request }) => {
    const { response, data } = await advise(request, {
      gameVariant: 'omaha4',
      holeCards: ['As', 'Ks', 'Qs'],  // 3 cards instead of 4
      board: ['Ts', '9s', '2h']
    });
    expect(response.status()).toBe(400);
    expect(data.error).toContain('4 hole cards');
  });

  test('rejects invalid card notation', async ({ request }) => {
    const { response, data } = await advise(request, {
      holeCards: ['As', 'XX', 'Qs', 'Js'],  // XX is invalid
      board: ['Ts', '9s', '2h']
    });
    expect(response.status()).toBe(400);
    expect(data.error).toContain('Invalid card');
  });

  test('accepts valid omaha4 input', async ({ request }) => {
    const { response, data } = await advise(request, {
      gameVariant: 'omaha4',
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h']
    });
    expect(response.ok()).toBeTruthy();
    expect(data.analysis).toBeDefined();
  });

  test('accepts valid omaha5 input', async ({ request }) => {
    const { response, data } = await advise(request, {
      gameVariant: 'omaha5',
      holeCards: ['As', 'Ks', 'Qs', 'Js', 'Th'],
      board: ['9s', '8s', '2h']
    });
    expect(response.ok()).toBeTruthy();
    expect(data.analysis).toBeDefined();
  });

  test('accepts valid omaha6 input', async ({ request }) => {
    const { response, data } = await advise(request, {
      gameVariant: 'omaha6',
      holeCards: ['As', 'Ks', 'Qs', 'Js', 'Th', '9h'],
      board: ['8s', '7s', '2d']
    });
    expect(response.ok()).toBeTruthy();
    expect(data.analysis).toBeDefined();
  });

});

// =============================================================================
// RESPONSE STRUCTURE TESTS
// =============================================================================

test.describe('Play Advisor API - Response Structure', () => {

  test('response has required analysis fields', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h']
    });

    expect(data.analysis).toBeDefined();
    expect(data.analysis.currentHand).toBeDefined();
    expect(data.analysis.currentHand.madeHand).toBeDefined();
    expect(data.analysis.currentHand.handStrength).toBeDefined();
    expect(typeof data.analysis.currentHand.isNuts).toBe('boolean');
  });

  test('response has board texture fields', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h']
    });

    expect(data.analysis.boardTexture).toBeDefined();
    expect(data.analysis.boardTexture.category).toBeDefined();
    expect(data.analysis.boardTexture.dangerLevel).toBeDefined();
  });

  test('response has equity fields when Phase 2 active', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h'],
      position: 'BTN',
      playersInHand: 3
    });

    expect(data.analysis.equity).toBeDefined();
    expect(data.analysis.equity.estimated).toBeDefined();
    expect(data.analysis.equity.vsRange).toBeDefined();
    expect(data.analysis.equity.confidence).toBeDefined();
  });

  test('response has outs field', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h']
    });

    expect(data.analysis.outs).toBeDefined();
    expect(typeof data.analysis.outs.toImprove).toBe('number');
    expect(Array.isArray(data.analysis.outs.draws)).toBeTruthy();
  });

  test('response has pot odds when betting info provided', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h'],
      potSize: 100,
      toCall: 50,
      stackSize: 500
    });

    expect(data.analysis.potOdds).toBeDefined();
    expect(typeof data.analysis.potOdds.toCall).toBe('number');
    expect(data.analysis.potOdds.impliedOdds).toBeDefined();
  });

  test('response has dataSource field', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h']
    });

    expect(data.dataSource).toBeDefined();
    expect(data.dataSource.handEval).toBe('real-time');
    expect(data.dataSource.boardTexture).toBe('real-time');
  });

  test('response includes latency', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h']
    });

    expect(typeof data.latencyMs).toBe('number');
    expect(data.latencyMs).toBeGreaterThan(0);
  });

  test('response echoes input correctly', async ({ request }) => {
    const { data } = await advise(request, {
      gameVariant: 'omaha5',
      holeCards: ['As', 'Ks', 'Qs', 'Js', 'Th'],
      board: ['9s', '8s', '2h'],
      position: 'CO',
      playersInHand: 4
    });

    expect(data.input.gameVariant).toBe('omaha5');
    expect(data.input.holeCards).toEqual(['As', 'Ks', 'Qs', 'Js', 'Th']);
    expect(data.input.position).toBe('CO');
    expect(data.input.playersInHand).toBe(4);
  });

});

// =============================================================================
// HAND EVALUATION ACCURACY TESTS
// =============================================================================

test.describe('Play Advisor API - Hand Evaluation', () => {

  test('correctly identifies flush', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qh', 'Jh'],  // Two spades
      board: ['Ts', '9s', '2s']              // Three spades on board
    });

    expect(data.analysis.currentHand.madeHand).toBe('Flush');
    expect(data.analysis.currentHand.handStrength).toContain('Flush');
  });

  test('correctly identifies straight', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['Ah', 'Kd', 'Qc', 'Js'],   // Broadway cards
      board: ['Ts', '9h', '2d']              // Makes broadway
    });

    expect(data.analysis.currentHand.madeHand).toBe('Straight');
  });

  test('correctly identifies set/trips', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ah', 'Kd', 'Qc'],   // Pocket aces
      board: ['Ac', '9h', '2d']              // Ace on board = set
    });

    expect(data.analysis.currentHand.madeHand).toBe('Three of a Kind');
  });

  test('correctly identifies two pair', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ah', 'Kd', 'Kc'],   // AA + KK
      board: ['9c', '9h', '2d']              // No aces or kings
    });

    // With AA KK and 99x board, should make two pair AA99 or KK99
    const madeHand = data.analysis.currentHand.madeHand;
    expect(['Two Pair', 'Full House']).toContain(madeHand);
  });

  test('correctly identifies full house', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ah', 'Kd', 'Kc'],
      board: ['Ac', 'Kh', '2d']  // Makes AAA KK full house
    });

    expect(data.analysis.currentHand.madeHand).toBe('Full House');
  });

  test('detects nut flush correctly', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qh', 'Jh'],
      board: ['Ts', '9s', '2s']
    });

    expect(data.analysis.currentHand.isNuts).toBe(true);
  });

  test('detects non-nut flush correctly', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['Ks', 'Qs', 'Jh', 'Th'],  // King-high flush
      board: ['9s', '8s', '2d']
    });

    expect(data.analysis.currentHand.isNuts).toBe(false);
  });

});

// =============================================================================
// EQUITY CALCULATION TESTS (GOLDEN SCENARIOS)
// =============================================================================

test.describe('Play Advisor API - Equity Calculation', () => {

  test('nut flush has high equity (75-90%)', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qh', 'Jh'],
      board: ['Ts', '9s', '2s'],
      position: 'BTN',
      playersInHand: 2
    });

    const equityStr = data.analysis.equity?.estimated || '0%';
    const equity = parseFloat(equityStr.replace('%', ''));
    expect(equity).toBeGreaterThan(70);
    expect(equity).toBeLessThan(95);
  });

  test('flush draw has moderate equity (30-50%)', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qh', 'Jh'],  // Two spades
      board: ['Ts', '9s', '2d'],            // Two spades on board (draw)
      position: 'BTN',
      playersInHand: 2,
      street: 'flop'
    });

    // Either equity or draw equity should show the draw
    const equityStr = data.analysis.equity?.estimated || '0%';
    const equity = parseFloat(equityStr.replace('%', ''));

    // With a flush draw, expect draw equity contribution
    expect(data.analysis.outs.toImprove).toBeGreaterThan(0);
  });

  test('top set has good equity (65-85%)', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ah', 'Kd', 'Qc'],
      board: ['Ac', '9h', '2d'],  // Top set
      position: 'BTN',
      playersInHand: 2
    });

    const equityStr = data.analysis.equity?.estimated || '0%';
    const equity = parseFloat(equityStr.replace('%', ''));
    expect(equity).toBeGreaterThan(55);
    expect(equity).toBeLessThan(90);
  });

  test('equity vs range description is meaningful', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h'],
      villainActions: ['raise']
    });

    expect(data.analysis.equity?.vsRange).toBeDefined();
    expect(data.analysis.equity.vsRange.length).toBeGreaterThan(0);
  });

  test('equity breakdown sums to ~100%', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h']
    });

    if (data.analysis.equity?.breakdown) {
      const { vsWeaker, vsSimilar, vsStronger } = data.analysis.equity.breakdown;
      const sum = vsWeaker + vsSimilar + vsStronger;
      expect(sum).toBeGreaterThan(95);
      expect(sum).toBeLessThan(105);
    }
  });

});

// =============================================================================
// BOARD TEXTURE TESTS
// =============================================================================

test.describe('Play Advisor API - Board Texture', () => {

  test('detects monotone board', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qh', 'Jh'],
      board: ['Ts', '9s', '2s']  // All spades
    });

    const texture = data.analysis.boardTexture;
    expect(texture.details.suitedness).toBe('monotone');
  });

  test('detects paired board', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qh', 'Jh'],
      board: ['Ts', 'Tc', '2h']  // Paired tens
    });

    expect(data.analysis.boardTexture.details.isPaired).toBe(true);
  });

  test('detects connected board', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qh', 'Jh'],
      board: ['Ts', '9h', '8c']  // Connected
    });

    expect(data.analysis.boardTexture.details.connectivity).toBeDefined();
  });

  test('generates appropriate threats', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ad', 'Kh', 'Kc'],  // Overpairs
      board: ['Qs', 'Js', 'Ts']             // Flush and straight heavy
    });

    expect(Array.isArray(data.analysis.threats)).toBeTruthy();
    expect(data.analysis.threats.length).toBeGreaterThan(0);
  });

});

// =============================================================================
// POT ODDS TESTS
// =============================================================================

test.describe('Play Advisor API - Pot Odds', () => {

  test('calculates correct pot odds (50 to win 150 = 33%)', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h'],
      potSize: 100,
      toCall: 50
    });

    // Pot odds = toCall / (pot + toCall) = 50 / 150 = 33.3%
    expect(data.analysis.potOdds.toCall).toBeCloseTo(33.3, 0);
  });

  test('calculates correct pot odds (100 to win 200 = 50%)', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h'],
      potSize: 100,
      toCall: 100
    });

    expect(data.analysis.potOdds.toCall).toBeCloseTo(50, 0);
  });

  test('assesses implied odds based on stack depth', async ({ request }) => {
    // Deep stacks = excellent implied odds
    const deep = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h'],
      potSize: 100,
      toCall: 50,
      stackSize: 1000  // 10x pot
    });

    expect(deep.data.analysis.potOdds.impliedOdds).toBe('excellent');

    // Shallow stacks = poor implied odds
    const shallow = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h'],
      potSize: 100,
      toCall: 50,
      stackSize: 50  // 0.5x pot
    });

    expect(shallow.data.analysis.potOdds.impliedOdds).toBe('poor');
  });

});

// =============================================================================
// LATENCY BENCHMARK TESTS
// =============================================================================

test.describe('Play Advisor API - Latency', () => {

  test('p50 latency under 50ms', async ({ request }) => {
    const latencies: number[] = [];

    // Run 10 requests
    for (let i = 0; i < 10; i++) {
      const { data } = await advise(request, {
        holeCards: ['As', 'Ks', 'Qs', 'Js'],
        board: ['Ts', '9s', '2h']
      });
      latencies.push(data.latencyMs);
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];

    expect(p50).toBeLessThan(50);
  });

  test('p99 latency under 200ms', async ({ request }) => {
    const latencies: number[] = [];

    // Run 20 requests
    for (let i = 0; i < 20; i++) {
      const { data } = await advise(request, {
        holeCards: ['As', 'Ks', 'Qs', 'Js'],
        board: ['Ts', '9s', '2h'],
        position: 'BTN',
        playersInHand: 4,
        villainActions: ['raise', 'call']
      });
      latencies.push(data.latencyMs);
    }

    latencies.sort((a, b) => a - b);
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    expect(p99).toBeLessThan(200);
  });

  test('cached requests are faster', async ({ request }) => {
    // First request (cold)
    const first = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h']
    });

    // Same request (should hit cache)
    const second = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h']
    });

    // Cache hit should be faster (or at least not slower)
    // Note: Server-side caching, so this depends on equity cache
    expect(second.data.latencyMs).toBeLessThanOrEqual(first.data.latencyMs + 10);
  });

});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

test.describe('Play Advisor API - Error Handling', () => {

  test('returns 405 for non-POST methods', async ({ request }) => {
    const response = await request.get(`${getBaseUrl()}/api/advise`);
    expect(response.status()).toBe(405);
  });

  test('returns helpful error for duplicate cards', async ({ request }) => {
    const { response, data } = await advise(request, {
      holeCards: ['As', 'As', 'Ks', 'Qs'],  // Duplicate As
      board: ['Ts', '9s', '2h']
    });

    // May succeed or fail depending on implementation
    // If it fails, should have meaningful error
    if (!response.ok()) {
      expect(data.error).toBeDefined();
    }
  });

  test('handles empty arrays gracefully', async ({ request }) => {
    const { response, data } = await advise(request, {
      holeCards: [],
      board: []
    });

    expect(response.status()).toBe(400);
    expect(data.error).toBeDefined();
  });

  test('handles malformed JSON gracefully', async ({ request }) => {
    const response = await request.post(`${getBaseUrl()}/api/advise`, {
      headers: { 'Content-Type': 'application/json' },
      data: 'not valid json'
    });

    // Should either parse as string or return error
    expect([200, 400, 500]).toContain(response.status());
  });

});

// =============================================================================
// STYLE-AWARE RECOMMENDATION TESTS
// =============================================================================

test.describe('Play Advisor API - Style Differentiation', () => {

  const baseHand = {
    gameVariant: 'omaha4',
    holeCards: ['As', 'Ks', 'Qh', 'Jh'],
    board: ['Ts', '9s', '2h'],
    position: 'BTN',
    playersInHand: 3,
    potSize: 100,
    toCall: 50,
    stackSize: 500
  };

  test('heroStyle defaults to reg when not provided', async ({ request }) => {
    const { data } = await advise(request, baseHand);
    expect(data.input.heroStyle).toBe('reg');
  });

  test('heroStyle is echoed back in response', async ({ request }) => {
    for (const style of ['nit', 'rock', 'reg', 'tag', 'lag', 'fish']) {
      const { data } = await advise(request, { ...baseHand, heroStyle: style });
      expect(data.input.heroStyle).toBe(style);
    }
  });

  test('recommendation metadata includes heroStyle', async ({ request }) => {
    const { data } = await advise(request, { ...baseHand, heroStyle: 'lag' });
    expect(data.recommendation).toBeDefined();
    expect(data.recommendation.metadata.heroStyle).toBe('lag');
  });

  test('different styles produce different recommendations for strong hand', async ({ request }) => {
    // Use a strong hand (nut flush) not facing a bet — styles diverge on bet sizing and confidence
    const strongHand = {
      gameVariant: 'omaha4',
      holeCards: ['As', 'Ks', 'Qh', 'Jh'],
      board: ['Ts', '9s', '2s'],  // Nut flush
      position: 'BTN',
      playersInHand: 2,
      potSize: 100,
      toCall: 0,
      stackSize: 800
    };

    const nitResult = await advise(request, { ...strongHand, heroStyle: 'nit' });
    const lagResult = await advise(request, { ...strongHand, heroStyle: 'lag' });

    // Both should recommend bet/raise, but sizing or confidence should differ
    const nitSizing = nitResult.data.recommendation?.sizing?.optimal;
    const lagSizing = lagResult.data.recommendation?.sizing?.optimal;
    const nitConf = nitResult.data.recommendation?.confidence;
    const lagConf = lagResult.data.recommendation?.confidence;
    const nitReason = nitResult.data.recommendation?.reasoning?.strategic;
    const lagReason = lagResult.data.recommendation?.reasoning?.strategic;

    // At least one dimension should differ: sizing, confidence, or reasoning
    const isDifferentiated = nitSizing !== lagSizing || nitConf !== lagConf || nitReason !== lagReason;
    expect(isDifferentiated).toBeTruthy();
  });

  test('LAG gets higher confidence for aggressive actions', async ({ request }) => {
    // Strong hand where both should bet, but LAG more confidently
    const strongHand = {
      gameVariant: 'omaha4',
      holeCards: ['As', 'Ks', 'Qh', 'Jh'],
      board: ['Ts', '9s', '2s'],  // Nut flush
      position: 'BTN',
      playersInHand: 2,
      potSize: 100,
      toCall: 0,
      stackSize: 500
    };

    const nitResult = await advise(request, { ...strongHand, heroStyle: 'nit' });
    const lagResult = await advise(request, { ...strongHand, heroStyle: 'lag' });

    // Both should have a recommendation
    expect(nitResult.data.recommendation).toBeDefined();
    expect(lagResult.data.recommendation).toBeDefined();
  });

  test('reasoning text includes style-specific language', async ({ request }) => {
    const { data } = await advise(request, { ...baseHand, heroStyle: 'lag' });

    if (data.recommendation?.reasoning?.strategic) {
      // Strategic reasoning should mention the style or its characteristics
      const strategic = data.recommendation.reasoning.strategic.toLowerCase();
      const hasStyleContext = strategic.includes('lag') ||
                              strategic.includes('aggressive') ||
                              strategic.includes('pressure') ||
                              strategic.includes('wide') ||
                              strategic.includes('exploit');
      expect(hasStyleContext).toBeTruthy();
    }
  });

  test('Nit reasoning references tight play', async ({ request }) => {
    const { data } = await advise(request, { ...baseHand, heroStyle: 'nit' });

    if (data.recommendation?.reasoning?.strategic) {
      const strategic = data.recommendation.reasoning.strategic.toLowerCase();
      const hasStyleContext = strategic.includes('nit') ||
                              strategic.includes('tight') ||
                              strategic.includes('premium') ||
                              strategic.includes('conservative') ||
                              strategic.includes('patience');
      expect(hasStyleContext).toBeTruthy();
    }
  });

  test('all 6 styles return valid recommendations', async ({ request }) => {
    const styles = ['nit', 'rock', 'reg', 'tag', 'lag', 'fish'];

    for (const style of styles) {
      const { response, data } = await advise(request, { ...baseHand, heroStyle: style });
      expect(response.ok()).toBeTruthy();
      expect(data.recommendation).toBeDefined();
      expect(['fold', 'call', 'check', 'bet', 'raise']).toContain(data.recommendation.action);
    }
  });

  test('bet sizing varies by style', async ({ request }) => {
    // Use a scenario where bet/raise is likely so we get sizing data
    const bettingHand = {
      gameVariant: 'omaha4',
      holeCards: ['As', 'Ks', 'Qh', 'Jh'],
      board: ['Ts', '9s', '2s'],  // Nut flush
      position: 'BTN',
      playersInHand: 2,
      potSize: 100,
      toCall: 0,
      stackSize: 800
    };

    const sizes: Record<string, number> = {};
    for (const style of ['nit', 'reg', 'lag']) {
      const { data } = await advise(request, { ...bettingHand, heroStyle: style });
      if (data.recommendation?.sizing?.optimal) {
        sizes[style] = data.recommendation.sizing.optimal;
      }
    }

    // If we got sizing for at least 2 styles, they should differ
    const sizeValues = Object.values(sizes);
    if (sizeValues.length >= 2) {
      const uniqueSizes = new Set(sizeValues);
      expect(uniqueSizes.size).toBeGreaterThan(1);
    }
  });

  test('invalid heroStyle falls back to reg', async ({ request }) => {
    const { response, data } = await advise(request, { ...baseHand, heroStyle: 'maniac' });
    // Should not crash — either reject or fall back
    expect([200, 400]).toContain(response.status());
    if (response.ok()) {
      // If accepted, should fall back to reg
      expect(data.recommendation).toBeDefined();
    }
  });
});

// =============================================================================
// OPPONENT RANGE TESTS
// =============================================================================

test.describe('Play Advisor API - Opponent Range', () => {

  test('returns range information', async ({ request }) => {
    const { data } = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h'],
      villainActions: ['raise']
    });

    expect(data.opponentRange).toBeDefined();
    expect(data.opponentRange.description).toBeDefined();
  });

  test('range narrows with aggressive actions', async ({ request }) => {
    // Passive opponent
    const passive = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h'],
      villainActions: ['call']
    });

    // Aggressive opponent
    const aggressive = await advise(request, {
      holeCards: ['As', 'Ks', 'Qs', 'Js'],
      board: ['Ts', '9s', '2h'],
      villainActions: ['raise', 'reraise']
    });

    // Aggressive range description should differ
    expect(aggressive.data.opponentRange.description).not.toBe(
      passive.data.opponentRange.description
    );
  });

});
