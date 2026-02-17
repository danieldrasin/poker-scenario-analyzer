/**
 * Style Differentiation Test
 *
 * Verifies that different heroStyle values produce different recommendations
 * for the same hand/board scenario.
 */

import { recommendAction, EQUITY_THRESHOLDS } from './ActionRecommender.js';
import { getSizingRecommendation } from './BetSizer.js';
import { getStyleProfile, getStyleIds } from './StyleProfiles.js';

// ===== TEST SCENARIOS =====

const scenarios = [
  {
    name: 'Marginal call/fold boundary (equity below pot odds)',
    description: 'Nit/Rock should fold (margin=5), Reg/TAG/LAG/Fish should call (margin=10+)',
    params: {
      equity: 24,        // equityGap = 24-32 = -8. Nit folds at <-5, Reg at <-10.
      potOdds: 32,       // With position adj (IP 1.05): adjusted equity ~25.2, gap ~-6.8
      impliedOdds: 'poor',
      handType: 1,       // Pair
      handDescription: 'Pair of Kings',
      isNuts: false,
      outs: { toImprove: 2, draws: [] },
      drawEquity: 0,
      spr: 8,
      position: 'CO',
      boardTexture: { connectivity: 'disconnected' },
      street: 'flop',
      facingBet: true,
      toCall: 30,
      potSize: 100,
    },
  },
  {
    name: 'Medium set, no bet — value bet vs check boundary',
    description: 'Aggressive styles should bet, passive styles should check',
    params: {
      equity: 62,
      potOdds: 0,
      impliedOdds: 'moderate',
      handType: 3,       // Set
      handDescription: 'Set of Tens',
      isNuts: false,
      outs: { toImprove: 1, draws: [] },
      drawEquity: 0,
      spr: 6,
      position: 'BTN',
      boardTexture: { connectivity: 'connected', flushDrawPossible: true },
      street: 'flop',
      facingBet: false,
      toCall: 0,
      potSize: 80,
    },
  },
  {
    name: 'Weak hand facing large bet (fold/call boundary)',
    description: 'Nit clear fold, LAG/Fish marginal fold with different confidence',
    params: {
      equity: 22,
      potOdds: 33,
      impliedOdds: 'poor',
      handType: 0,       // High card
      handDescription: 'Ace high',
      isNuts: false,
      outs: { toImprove: 0, draws: [] },
      drawEquity: 0,
      spr: 10,
      position: 'UTG',
      boardTexture: { connectivity: 'disconnected' },
      street: 'turn',
      facingBet: true,
      toCall: 50,
      potSize: 120,
    },
  },
  {
    name: 'Moderate hand facing bet — call vs raise boundary',
    description: 'LAG/TAG should raise (lower threshold), Nit/Rock/Fish should call (higher threshold)',
    params: {
      equity: 56,        // rawEquityGap = 56 - 40 = 16. LAG raises at >10, TAG at >13, Reg at >15, Nit at >20
      potOdds: 40,
      impliedOdds: 'moderate',
      handType: 4,       // Straight
      handDescription: 'Ten-high Straight',
      isNuts: false,
      outs: { toImprove: 0, draws: [] },
      drawEquity: 0,
      spr: 7,
      position: 'BTN',
      boardTexture: { connectivity: 'connected' },
      street: 'turn',
      facingBet: true,
      toCall: 40,
      potSize: 150,
    },
  },
];

// ===== RUN TESTS =====

const styles = getStyleIds();
let passed = 0;
let failed = 0;

console.log('=== Style Differentiation Test ===\n');

for (const scenario of scenarios) {
  console.log(`--- ${scenario.name} ---`);
  const results = {};

  for (const style of styles) {
    const rec = recommendAction({ ...scenario.params, heroStyle: style });
    results[style] = {
      action: rec.action,
      confidence: rec.confidence,
      reason: rec.metadata.decisionReason,
      heroStyle: rec.metadata.heroStyle,
    };

    const profile = getStyleProfile(style);
    console.log(`  ${style.padEnd(5)} → ${rec.action.padEnd(6)} (${Math.round(rec.confidence * 100)}% conf, reason: ${rec.metadata.decisionReason})`);
    console.log(`          Strategic: "${rec.reasoning.strategic.substring(0, 70)}..."`);

    // Check that heroStyle is echoed back
    if (rec.metadata.heroStyle !== style) {
      console.log(`  ❌ FAIL: heroStyle not echoed (expected ${style}, got ${rec.metadata.heroStyle})`);
      failed++;
    }
  }

  // Check differentiation: not all styles should give identical results
  const uniqueActions = new Set(Object.values(results).map(r => r.action));
  const uniqueConfidences = new Set(Object.values(results).map(r => r.confidence));
  const uniqueReasons = new Set(Object.values(results).map(r => r.reason));

  const hasDifferentiation = uniqueActions.size > 1 || uniqueConfidences.size > 1 || uniqueReasons.size > 1;

  if (hasDifferentiation) {
    console.log(`  ✅ PASS: ${uniqueActions.size} unique actions, ${uniqueConfidences.size} unique confidence levels`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: All styles gave identical results — no differentiation!`);
    failed++;
  }
  console.log('');
}

// ===== SIZING TEST =====

console.log('--- Sizing Differentiation Test ---');
const sizingResults = {};

for (const style of styles) {
  const sizing = getSizingRecommendation({
    action: 'bet',
    pot: 100,
    effectiveStack: 800,
    betType: 'value',
    boardTexture: null,
    position: 'IP',
    street: 'flop',
    equity: 65,
    isNuts: false,
    heroStyle: style
  });

  sizingResults[style] = sizing?.sizing?.optimal || 0;
  console.log(`  ${style.padEnd(5)} → optimal bet: $${sizing?.sizing?.optimal} (${sizing?.sizing?.percentPot}% pot)`);
}

const uniqueSizes = new Set(Object.values(sizingResults));
if (uniqueSizes.size > 1) {
  console.log(`  ✅ PASS: ${uniqueSizes.size} unique sizing values`);
  passed++;
} else {
  console.log(`  ❌ FAIL: All styles gave identical sizing`);
  failed++;
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
