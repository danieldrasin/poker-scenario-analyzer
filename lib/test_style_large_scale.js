/**
 * Large-Scale Style Differentiation Test
 *
 * Tests the Play Advisor decision engine across a comprehensive matrix of:
 *   - 6 player styles (Nit, Rock, Reg, TAG, LAG, Fish)
 *   - 3 variants (PLO4, PLO5, PLO6) via player counts
 *   - Multiple positions (UTG, MP, CO, BTN)
 *   - Multiple streets (flop, turn, river)
 *   - Multiple hand types (high card through flush)
 *   - Multiple player counts (2, 3, 6)
 *   - Facing bet and not facing bet scenarios
 *
 * Generates a visual HTML report with Chart.js visualizations.
 *
 * Usage: node --experimental-vm-modules lib/test_style_large_scale.js
 */

import { recommendAction, EQUITY_THRESHOLDS } from './ActionRecommender.js';
import { getSizingRecommendation } from './BetSizer.js';
import { getStyleProfile, getStyleIds, STYLE_PROFILES } from './StyleProfiles.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// SCENARIO MATRIX
// =============================================================================

const POSITIONS = ['UTG', 'MP', 'CO', 'BTN'];
const STREETS = ['flop', 'turn', 'river'];
const PLAYER_COUNTS = [2, 3, 6];
const STYLES = getStyleIds();

// Comprehensive scenario library — realistic hand situations
const SCENARIOS = [
  // ── STRONG HANDS ──
  {
    id: 'nut_flush_hu',
    category: 'Premium',
    name: 'Nut flush heads-up',
    params: { equity: 78, potOdds: 30, impliedOdds: 'good', handType: 5,
      handDescription: 'Ace-high flush', isNuts: true, outs: { toImprove: 0, draws: [] },
      drawEquity: 0, spr: 8, boardTexture: { connectivity: 'disconnected' },
      facingBet: true, toCall: 40, potSize: 120 }
  },
  {
    id: 'top_set_wet',
    category: 'Premium',
    name: 'Top set on wet board',
    params: { equity: 72, potOdds: 25, impliedOdds: 'excellent', handType: 3,
      handDescription: 'Set of Aces', isNuts: false, outs: { toImprove: 7, draws: ['full house'] },
      drawEquity: 14, spr: 10, boardTexture: { connectivity: 'connected', flushDrawPossible: true },
      facingBet: false, toCall: 0, potSize: 100 }
  },
  {
    id: 'full_house',
    category: 'Premium',
    name: 'Full house on paired board',
    params: { equity: 85, potOdds: 20, impliedOdds: 'excellent', handType: 6,
      handDescription: 'Tens full of Aces', isNuts: false, outs: { toImprove: 1, draws: [] },
      drawEquity: 0, spr: 6, boardTexture: { connectivity: 'disconnected', paired: true },
      facingBet: true, toCall: 30, potSize: 150 }
  },

  // ── MEDIUM HANDS ──
  {
    id: 'medium_flush',
    category: 'Medium',
    name: 'Queen-high flush',
    params: { equity: 55, potOdds: 28, impliedOdds: 'moderate', handType: 5,
      handDescription: 'Queen-high flush', isNuts: false, outs: { toImprove: 0, draws: [] },
      drawEquity: 0, spr: 7, boardTexture: { connectivity: 'connected' },
      facingBet: true, toCall: 35, potSize: 130 }
  },
  {
    id: 'bottom_set_no_bet',
    category: 'Medium',
    name: 'Bottom set, no bet to face',
    params: { equity: 62, potOdds: 0, impliedOdds: 'moderate', handType: 3,
      handDescription: 'Set of Fours', isNuts: false, outs: { toImprove: 7, draws: ['full house'] },
      drawEquity: 14, spr: 6, boardTexture: { connectivity: 'connected', flushDrawPossible: true },
      facingBet: false, toCall: 0, potSize: 80 }
  },
  {
    id: 'two_pair_facing_bet',
    category: 'Medium',
    name: 'Top two pair facing bet',
    params: { equity: 48, potOdds: 30, impliedOdds: 'moderate', handType: 2,
      handDescription: 'Aces and Kings', isNuts: false, outs: { toImprove: 4, draws: ['full house'] },
      drawEquity: 8, spr: 8, boardTexture: { connectivity: 'disconnected' },
      facingBet: true, toCall: 40, potSize: 120 }
  },
  {
    id: 'straight_no_bet',
    category: 'Medium',
    name: 'Non-nut straight, check to hero',
    params: { equity: 56, potOdds: 0, impliedOdds: 'moderate', handType: 4,
      handDescription: 'Ten-high straight', isNuts: false, outs: { toImprove: 0, draws: [] },
      drawEquity: 0, spr: 7, boardTexture: { connectivity: 'connected' },
      facingBet: false, toCall: 0, potSize: 150 }
  },

  // ── MARGINAL HANDS ──
  {
    id: 'marginal_pair',
    category: 'Marginal',
    name: 'Top pair marginal spot',
    params: { equity: 32, potOdds: 30, impliedOdds: 'poor', handType: 1,
      handDescription: 'Pair of Kings', isNuts: false, outs: { toImprove: 2, draws: [] },
      drawEquity: 0, spr: 8, boardTexture: { connectivity: 'disconnected' },
      facingBet: true, toCall: 30, potSize: 100 }
  },
  {
    id: 'weak_flush_draw',
    category: 'Marginal',
    name: 'Weak flush draw facing bet',
    params: { equity: 28, potOdds: 25, impliedOdds: 'good', handType: 0,
      handDescription: 'Nine-high with flush draw', isNuts: false,
      outs: { toImprove: 9, draws: ['flush'] }, drawEquity: 18, spr: 10,
      boardTexture: { connectivity: 'disconnected', flushDrawPossible: true },
      facingBet: true, toCall: 25, potSize: 100 }
  },
  {
    id: 'bottom_pair_no_bet',
    category: 'Marginal',
    name: 'Bottom pair, checked to hero',
    params: { equity: 25, potOdds: 0, impliedOdds: 'poor', handType: 1,
      handDescription: 'Pair of Fours', isNuts: false, outs: { toImprove: 2, draws: [] },
      drawEquity: 0, spr: 12, boardTexture: { connectivity: 'connected' },
      facingBet: false, toCall: 0, potSize: 60 }
  },

  // ── WEAK HANDS / BLUFFS ──
  {
    id: 'ace_high_facing_bet',
    category: 'Weak',
    name: 'Ace high facing large bet',
    params: { equity: 18, potOdds: 33, impliedOdds: 'poor', handType: 0,
      handDescription: 'Ace high', isNuts: false, outs: { toImprove: 0, draws: [] },
      drawEquity: 0, spr: 10, boardTexture: { connectivity: 'disconnected' },
      facingBet: true, toCall: 50, potSize: 120 }
  },
  {
    id: 'no_hand_no_draw',
    category: 'Weak',
    name: 'Nothing, facing half-pot bet',
    params: { equity: 12, potOdds: 25, impliedOdds: 'poor', handType: 0,
      handDescription: 'Nine high', isNuts: false, outs: { toImprove: 0, draws: [] },
      drawEquity: 0, spr: 8, boardTexture: { connectivity: 'disconnected' },
      facingBet: true, toCall: 40, potSize: 160 }
  },
  {
    id: 'bluff_opportunity',
    category: 'Weak',
    name: 'Air, checked to hero on dry board',
    params: { equity: 15, potOdds: 0, impliedOdds: 'poor', handType: 0,
      handDescription: 'Jack high', isNuts: false, outs: { toImprove: 0, draws: [] },
      drawEquity: 0, spr: 10, boardTexture: { connectivity: 'disconnected' },
      facingBet: false, toCall: 0, potSize: 80 }
  },

  // ── DRAWING HANDS ──
  {
    id: 'nut_flush_draw',
    category: 'Draw',
    name: 'Nut flush draw facing bet',
    params: { equity: 36, potOdds: 25, impliedOdds: 'excellent', handType: 0,
      handDescription: 'Ace-high flush draw', isNuts: false,
      outs: { toImprove: 9, draws: ['nut flush'] }, drawEquity: 18, spr: 12,
      boardTexture: { connectivity: 'disconnected', flushDrawPossible: true },
      facingBet: true, toCall: 30, potSize: 120 }
  },
  {
    id: 'wrap_draw',
    category: 'Draw',
    name: 'Big wrap draw, no bet',
    params: { equity: 42, potOdds: 0, impliedOdds: 'excellent', handType: 0,
      handDescription: '13-out straight wrap', isNuts: false,
      outs: { toImprove: 13, draws: ['straight'] }, drawEquity: 26, spr: 10,
      boardTexture: { connectivity: 'connected' },
      facingBet: false, toCall: 0, potSize: 90 }
  },
  {
    id: 'combo_draw',
    category: 'Draw',
    name: 'Flush + straight draw facing bet',
    params: { equity: 44, potOdds: 28, impliedOdds: 'excellent', handType: 0,
      handDescription: 'Flush + straight combo draw', isNuts: false,
      outs: { toImprove: 17, draws: ['flush', 'straight'] }, drawEquity: 34, spr: 9,
      boardTexture: { connectivity: 'connected', flushDrawPossible: true },
      facingBet: true, toCall: 35, potSize: 130 }
  },

  // ── MULTIWAY-SPECIFIC ──
  {
    id: '9high_flush_multiway',
    category: 'Multiway',
    name: '9-high flush 6-way (the bug case)',
    params: { equity: 34, potOdds: 0, impliedOdds: 'poor', handType: 5,
      handDescription: '9-high flush', isNuts: false, outs: { toImprove: 0, draws: [] },
      drawEquity: 0, spr: 8, boardTexture: { connectivity: 'disconnected' },
      facingBet: false, toCall: 0, potSize: 200 }
  },
  {
    id: 'overpair_multiway',
    category: 'Multiway',
    name: 'Overpair facing bet multiway',
    params: { equity: 30, potOdds: 25, impliedOdds: 'poor', handType: 1,
      handDescription: 'Overpair (Aces)', isNuts: false, outs: { toImprove: 2, draws: [] },
      drawEquity: 0, spr: 8, boardTexture: { connectivity: 'connected' },
      facingBet: true, toCall: 40, potSize: 160 }
  },

  // ── BOUNDARY SCENARIOS (designed to split styles) ──
  // These target the exact equity gaps where style thresholds diverge

  // Fold boundary: equityGap = -7 → Nit folds (threshold -5), Reg/LAG call (threshold -10/-15)
  {
    id: 'fold_boundary_7',
    category: 'Boundary',
    name: 'Fold boundary: gap = -7 (splits Nit from rest)',
    params: { equity: 25, potOdds: 32, impliedOdds: 'poor', handType: 1,
      handDescription: 'Pair of Jacks', isNuts: false, outs: { toImprove: 2, draws: [] },
      drawEquity: 0, spr: 8, boardTexture: { connectivity: 'disconnected' },
      facingBet: true, toCall: 30, potSize: 100 }
  },
  // Fold boundary: equityGap = -12 → Nit/Rock/Reg fold, LAG calls (threshold -15)
  {
    id: 'fold_boundary_12',
    category: 'Boundary',
    name: 'Fold boundary: gap = -12 (splits LAG from rest)',
    params: { equity: 20, potOdds: 32, impliedOdds: 'poor', handType: 1,
      handDescription: 'Pair of Sixes', isNuts: false, outs: { toImprove: 2, draws: [] },
      drawEquity: 0, spr: 8, boardTexture: { connectivity: 'disconnected' },
      facingBet: true, toCall: 35, potSize: 110 }
  },
  // Raise boundary: rawEquityGap = 12 → LAG raises (threshold 10), TAG/Reg/Nit call
  {
    id: 'raise_boundary_12',
    category: 'Boundary',
    name: 'Raise boundary: gap = 12 (LAG raises, others call)',
    params: { equity: 52, potOdds: 40, impliedOdds: 'moderate', handType: 4,
      handDescription: 'Queen-high straight', isNuts: false, outs: { toImprove: 0, draws: [] },
      drawEquity: 0, spr: 7, boardTexture: { connectivity: 'connected' },
      facingBet: true, toCall: 40, potSize: 150 }
  },
  // Raise boundary: rawEquityGap = 14 → LAG/TAG raise, Reg/Nit call
  {
    id: 'raise_boundary_14',
    category: 'Boundary',
    name: 'Raise boundary: gap = 14 (TAG+LAG raise, others call)',
    params: { equity: 54, potOdds: 40, impliedOdds: 'moderate', handType: 4,
      handDescription: 'King-high straight', isNuts: false, outs: { toImprove: 0, draws: [] },
      drawEquity: 0, spr: 7, boardTexture: { connectivity: 'connected' },
      facingBet: true, toCall: 40, potSize: 150 }
  },
  // Raise boundary: rawEquityGap = 17 → LAG/TAG/Reg raise, Nit/Rock call
  {
    id: 'raise_boundary_17',
    category: 'Boundary',
    name: 'Raise boundary: gap = 17 (Reg+ raises, Nit/Rock call)',
    params: { equity: 57, potOdds: 40, impliedOdds: 'moderate', handType: 4,
      handDescription: 'Nut straight', isNuts: false, outs: { toImprove: 0, draws: [] },
      drawEquity: 0, spr: 7, boardTexture: { connectivity: 'connected' },
      facingBet: true, toCall: 40, potSize: 150 }
  },
  // Bluff spot: only TAG/LAG bluff (bluffFreq >= 0.12)
  {
    id: 'bluff_spot_ip',
    category: 'Boundary',
    name: 'Positional bluff spot (TAG/LAG bet, others check)',
    params: { equity: 22, potOdds: 0, impliedOdds: 'poor', handType: 1,
      handDescription: 'Bottom pair', isNuts: false, outs: { toImprove: 2, draws: [] },
      drawEquity: 0, spr: 10, boardTexture: { connectivity: 'disconnected' },
      facingBet: false, toCall: 0, potSize: 80 }
  },
  // Slow-play trap: passive styles (aggrMult < 1.0) slow-play nuts IP
  {
    id: 'slowplay_nuts',
    category: 'Boundary',
    name: 'Nut hand IP — passive styles trap, aggressive raise',
    params: { equity: 60, potOdds: 30, impliedOdds: 'excellent', handType: 5,
      handDescription: 'Nut flush', isNuts: true, outs: { toImprove: 0, draws: [] },
      drawEquity: 0, spr: 8, boardTexture: { connectivity: 'disconnected' },
      facingBet: true, toCall: 30, potSize: 120 }
  },
  // Marginal fold boundary: equityGap between -5 and -10
  {
    id: 'marginal_fold_boundary',
    category: 'Boundary',
    name: 'Marginal fold: gap = -6 with poor implied odds',
    params: { equity: 26, potOdds: 32, impliedOdds: 'poor', handType: 2,
      handDescription: 'Two pair', isNuts: false, outs: { toImprove: 4, draws: [] },
      drawEquity: 8, spr: 6, boardTexture: { connectivity: 'connected' },
      facingBet: true, toCall: 35, potSize: 110 }
  },
  // Semi-bluff boundary: adjustedEquity near SEMI_BLUFF_MIN (30)
  {
    id: 'semibluff_boundary',
    category: 'Boundary',
    name: 'Semi-bluff threshold: draw with ~30% equity',
    params: { equity: 30, potOdds: 25, impliedOdds: 'good', handType: 0,
      handDescription: 'Nut flush draw', isNuts: false,
      outs: { toImprove: 9, draws: ['flush'] }, drawEquity: 18, spr: 10,
      boardTexture: { connectivity: 'disconnected', flushDrawPossible: true },
      facingBet: true, toCall: 30, potSize: 120 }
  },
];

// =============================================================================
// TEST RUNNER
// =============================================================================

function runAllTests() {
  const results = [];
  let totalTests = 0;
  let styleVariation = 0;

  console.log('=== Large-Scale Style Differentiation Test ===');
  console.log(`Scenarios: ${SCENARIOS.length} × ${STYLES.length} styles × ${POSITIONS.length} positions × ${STREETS.length} streets × ${PLAYER_COUNTS.length} player counts`);
  const totalCombinations = SCENARIOS.length * STYLES.length * POSITIONS.length * STREETS.length * PLAYER_COUNTS.length;
  console.log(`Total test combinations: ${totalCombinations.toLocaleString()}\n`);

  for (const scenario of SCENARIOS) {
    for (const position of POSITIONS) {
      for (const street of STREETS) {
        for (const playerCount of PLAYER_COUNTS) {
          const styleResults = {};

          for (const style of STYLES) {
            const params = {
              ...scenario.params,
              position,
              street,
              playersInHand: playerCount,
              heroStyle: style,
            };

            try {
              const rec = recommendAction(params);
              const sizing = (rec.action === 'bet' || rec.action === 'raise')
                ? getSizingRecommendation({
                    action: rec.action,
                    pot: scenario.params.potSize,
                    effectiveStack: scenario.params.spr * scenario.params.potSize,
                    betType: rec.metadata?.betType || 'value',
                    boardTexture: null,
                    position: position === 'BTN' || position === 'CO' ? 'IP' : 'OOP',
                    street,
                    equity: scenario.params.equity,
                    isNuts: scenario.params.isNuts,
                    heroStyle: style
                  })
                : null;

              styleResults[style] = {
                action: rec.action,
                confidence: Math.round(rec.confidence * 100),
                reason: rec.metadata?.decisionReason || 'unknown',
                strategic: rec.reasoning?.strategic?.substring(0, 120) || '',
                sizing: sizing?.sizing?.optimal || null,
                sizingPct: sizing?.sizing?.percentPot || null,
              };
            } catch (err) {
              styleResults[style] = {
                action: 'ERROR',
                confidence: 0,
                reason: err.message,
                strategic: '',
                sizing: null,
                sizingPct: null,
              };
            }

            totalTests++;
          }

          // Check for differentiation
          const uniqueActions = new Set(Object.values(styleResults).map(r => r.action));
          const uniqueConfidences = new Set(Object.values(styleResults).map(r => r.confidence));
          const hasDiff = uniqueActions.size > 1 || uniqueConfidences.size > 2;
          if (hasDiff) styleVariation++;

          results.push({
            scenario: scenario.id,
            scenarioName: scenario.name,
            category: scenario.category,
            position,
            street,
            playerCount,
            styles: styleResults,
            hasDifferentiation: hasDiff,
            uniqueActions: uniqueActions.size,
          });
        }
      }
    }
  }

  const totalScenarioCombos = results.length;
  console.log(`\nCompleted: ${totalTests.toLocaleString()} individual tests across ${totalScenarioCombos} scenario combinations`);
  console.log(`Style differentiation detected in ${styleVariation}/${totalScenarioCombos} combinations (${Math.round(styleVariation / totalScenarioCombos * 100)}%)\n`);

  return { results, totalTests, totalScenarioCombos, styleVariation };
}

// =============================================================================
// ANALYSIS
// =============================================================================

function analyzeResults(data) {
  const { results } = data;

  // Action distribution per style
  const actionDist = {};
  for (const style of STYLES) {
    actionDist[style] = { fold: 0, call: 0, check: 0, bet: 0, raise: 0 };
  }

  for (const r of results) {
    for (const style of STYLES) {
      const action = r.styles[style]?.action || 'unknown';
      if (actionDist[style][action] !== undefined) {
        actionDist[style][action]++;
      }
    }
  }

  // Average confidence per style
  const avgConfidence = {};
  for (const style of STYLES) {
    const confs = results.map(r => r.styles[style]?.confidence || 0);
    avgConfidence[style] = Math.round(confs.reduce((a, b) => a + b, 0) / confs.length);
  }

  // By category
  const categories = [...new Set(SCENARIOS.map(s => s.category))];
  const categoryAnalysis = {};
  for (const cat of categories) {
    categoryAnalysis[cat] = {};
    const catResults = results.filter(r => r.category === cat);
    for (const style of STYLES) {
      const actions = { fold: 0, call: 0, check: 0, bet: 0, raise: 0 };
      for (const r of catResults) {
        const a = r.styles[style]?.action;
        if (actions[a] !== undefined) actions[a]++;
      }
      categoryAnalysis[cat][style] = actions;
    }
  }

  // By player count
  const playerCountAnalysis = {};
  for (const pc of PLAYER_COUNTS) {
    playerCountAnalysis[pc] = {};
    const pcResults = results.filter(r => r.playerCount === pc);
    for (const style of STYLES) {
      const actions = { fold: 0, call: 0, check: 0, bet: 0, raise: 0 };
      for (const r of pcResults) {
        const a = r.styles[style]?.action;
        if (actions[a] !== undefined) actions[a]++;
      }
      playerCountAnalysis[pc][style] = actions;
    }
  }

  // Aggression index per style: (bet + raise) / (call + check + fold)
  const aggressionIndex = {};
  for (const style of STYLES) {
    const d = actionDist[style];
    const aggressive = d.bet + d.raise;
    const passive = d.call + d.check + d.fold;
    aggressionIndex[style] = passive > 0 ? Math.round((aggressive / passive) * 100) / 100 : 0;
  }

  // Fold rate per style
  const foldRate = {};
  for (const style of STYLES) {
    const d = actionDist[style];
    const total = Object.values(d).reduce((a, b) => a + b, 0);
    foldRate[style] = total > 0 ? Math.round(d.fold / total * 100) : 0;
  }

  // Sizing analysis (average bet size when betting)
  const avgSizing = {};
  for (const style of STYLES) {
    const sizes = results
      .filter(r => r.styles[style]?.sizing != null)
      .map(r => r.styles[style].sizingPct);
    avgSizing[style] = sizes.length > 0
      ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)
      : 0;
  }

  // Key divergence scenarios (where styles disagree most)
  const highDivergence = results
    .filter(r => r.uniqueActions >= 2)
    .sort((a, b) => b.uniqueActions - a.uniqueActions)
    .slice(0, 12)
    .map(r => ({
      name: r.scenarioName,
      position: r.position,
      street: r.street,
      players: r.playerCount,
      actions: Object.fromEntries(STYLES.map(s => [s, r.styles[s]?.action])),
    }));

  return {
    actionDist,
    avgConfidence,
    categoryAnalysis,
    playerCountAnalysis,
    aggressionIndex,
    foldRate,
    avgSizing,
    highDivergence,
    categories,
  };
}

// =============================================================================
// HTML REPORT GENERATOR
// =============================================================================

function generateReport(data, analysis) {
  const STYLE_COLORS = {
    nit: '#8b5cf6',
    rock: '#6b7280',
    reg: '#0ea5e9',
    tag: '#2563eb',
    lag: '#dc2626',
    fish: '#f59e0b',
  };

  const styleLabel = (s) => STYLE_PROFILES[s]?.name || s;
  const pct = (n, total) => total > 0 ? Math.round(n / total * 100) : 0;

  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Build divergence table rows
  const divergenceRows = analysis.highDivergence.map(d => {
    const cells = STYLES.map(s => {
      const a = d.actions[s];
      const color = a === 'fold' ? '#ef4444' : a === 'raise' || a === 'bet' ? '#22c55e' : '#94a3b8';
      return `<td style="color:${color};font-weight:600">${a}</td>`;
    }).join('');
    return `<tr><td>${d.name}</td><td>${d.position}</td><td>${d.street}</td><td>${d.players}p</td>${cells}</tr>`;
  }).join('\n');

  // Category breakdown tables
  const categoryTables = analysis.categories.map(cat => {
    const catData = analysis.categoryAnalysis[cat];
    const rows = STYLES.map(s => {
      const d = catData[s];
      const total = Object.values(d).reduce((a, b) => a + b, 0);
      return `<tr>
        <td><span style="color:${STYLE_COLORS[s]};font-weight:700">${styleLabel(s)}</span></td>
        <td>${pct(d.fold, total)}%</td>
        <td>${pct(d.call + d.check, total)}%</td>
        <td>${pct(d.bet + d.raise, total)}%</td>
      </tr>`;
    }).join('\n');
    return `
    <div class="chart-box">
      <h4>${cat} Hands</h4>
      <table class="data-table">
        <thead><tr><th>Style</th><th>Fold %</th><th>Call/Check %</th><th>Bet/Raise %</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('\n');

  // Player count chart data
  const pcChartData = {};
  for (const pc of PLAYER_COUNTS) {
    pcChartData[pc] = {};
    for (const style of STYLES) {
      const d = analysis.playerCountAnalysis[pc][style];
      const total = Object.values(d).reduce((a, b) => a + b, 0);
      pcChartData[pc][style] = {
        foldPct: pct(d.fold, total),
        passivePct: pct(d.call + d.check, total),
        aggPct: pct(d.bet + d.raise, total),
      };
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Style Differentiation Report — Large Scale Test</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
:root {
  --bg: #0f172a;
  --surface: #1e293b;
  --surface2: #334155;
  --text: #e2e8f0;
  --text-dim: #94a3b8;
  --accent: #38bdf8;
  --green: #22c55e;
  --red: #ef4444;
  --border: #475569;
}
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
.container { max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem; }
h1 { font-size: 2.2rem; font-weight: 800; margin-bottom: 0.5rem; background: linear-gradient(135deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
h2 { font-size: 1.5rem; font-weight: 700; margin: 2.5rem 0 1rem; color: var(--accent); border-bottom: 2px solid var(--surface2); padding-bottom: 0.5rem; }
h3 { font-size: 1.15rem; font-weight: 600; margin: 1.5rem 0 0.75rem; color: #a5b4fc; }
p { color: var(--text-dim); margin-bottom: 1rem; max-width: 800px; }
.subtitle { font-size: 1rem; color: var(--text-dim); margin-bottom: 2rem; }
.stats-row { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
.stat-card { background: var(--surface); border-radius: 12px; padding: 1.25rem 1.5rem; flex: 1; min-width: 140px; border: 1px solid var(--surface2); }
.stat-card .label { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); margin-bottom: 0.25rem; }
.stat-card .value { font-size: 1.6rem; font-weight: 700; color: var(--accent); }
.stat-card .value.green { color: var(--green); }
.stat-card .value.red { color: var(--red); }
.chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin: 1.5rem 0; }
.chart-box { background: var(--surface); border-radius: 12px; padding: 1.25rem; border: 1px solid var(--surface2); }
.chart-box.full { grid-column: 1 / -1; }
.chart-box h4 { font-size: 0.95rem; color: var(--text-dim); margin-bottom: 0.75rem; text-align: center; }
.chart-box canvas { max-height: 350px; }
.data-table { width: 100%; border-collapse: collapse; margin: 1rem 0; background: var(--surface); border-radius: 12px; overflow: hidden; }
.data-table th { background: var(--surface2); padding: 0.75rem 1rem; text-align: left; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim); }
.data-table td { padding: 0.65rem 1rem; border-top: 1px solid var(--surface2); font-size: 0.95rem; }
.data-table tr:hover td { background: rgba(56,189,248,0.05); }
.section { margin-bottom: 3rem; }
.insight { background: var(--surface); border-left: 4px solid var(--accent); border-radius: 0 8px 8px 0; padding: 1rem 1.25rem; margin: 1rem 0; color: var(--text-dim); }
.insight strong { color: var(--text); }
.legend-row { display: flex; gap: 1.5rem; justify-content: center; margin: 1rem 0; flex-wrap: wrap; }
.legend-item { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: var(--text-dim); }
.legend-dot { width: 12px; height: 12px; border-radius: 3px; }
.pass { color: var(--green); } .fail { color: var(--red); }
@media (max-width: 768px) { .chart-grid { grid-template-columns: 1fr; } .stats-row { flex-direction: column; } }
</style>
</head>
<body>
<div class="container">

<h1>Style Differentiation Report</h1>
<p class="subtitle">${data.totalTests.toLocaleString()} tests across ${data.totalScenarioCombos} scenario combinations &bull; 6 styles &bull; ${SCENARIOS.length} scenarios &bull; Generated ${now}</p>

<div class="stats-row">
  <div class="stat-card"><div class="label">Total Tests</div><div class="value">${data.totalTests.toLocaleString()}</div></div>
  <div class="stat-card"><div class="label">Scenarios</div><div class="value">${SCENARIOS.length}</div></div>
  <div class="stat-card"><div class="label">Combinations</div><div class="value">${data.totalScenarioCombos}</div></div>
  <div class="stat-card"><div class="label">Style Variation</div><div class="value ${data.styleVariation / data.totalScenarioCombos > 0.5 ? 'green' : 'red'}">${Math.round(data.styleVariation / data.totalScenarioCombos * 100)}%</div></div>
  <div class="stat-card"><div class="label">Player Styles</div><div class="value">6</div></div>
</div>

<div class="legend-row">
  ${STYLES.map(s => `<div class="legend-item"><div class="legend-dot" style="background:${STYLE_COLORS[s]}"></div> ${styleLabel(s)}</div>`).join('\n  ')}
</div>

<!-- ═══════ OVERALL ACTION DISTRIBUTION ═══════ -->
<div class="section">
<h2>Overall Action Distribution</h2>
<p>How often each style folds, calls/checks, or bets/raises across all ${data.totalScenarioCombos} scenario combinations.</p>
<div class="chart-grid">
  <div class="chart-box full">
    <h4>Action Distribution by Style (% of all decisions)</h4>
    <canvas id="actionDistChart"></canvas>
  </div>
</div>

<table class="data-table">
  <thead>
    <tr><th>Style</th><th>Fold %</th><th>Call/Check %</th><th>Bet/Raise %</th><th>Aggression Index</th><th>Avg Confidence</th><th>Avg Bet Size (% pot)</th></tr>
  </thead>
  <tbody>
    ${STYLES.map(s => {
      const d = analysis.actionDist[s];
      const total = Object.values(d).reduce((a, b) => a + b, 0);
      return `<tr>
        <td><span style="color:${STYLE_COLORS[s]};font-weight:700">${styleLabel(s)}</span></td>
        <td>${pct(d.fold, total)}%</td>
        <td>${pct(d.call + d.check, total)}%</td>
        <td class="${pct(d.bet + d.raise, total) > 30 ? 'pass' : ''}">${pct(d.bet + d.raise, total)}%</td>
        <td>${analysis.aggressionIndex[s]}</td>
        <td>${analysis.avgConfidence[s]}%</td>
        <td>${analysis.avgSizing[s]}%</td>
      </tr>`;
    }).join('\n    ')}
  </tbody>
</table>

<div class="insight">
  <strong>Expected pattern:</strong> Nit/Rock should fold the most and bet/raise the least.
  TAG/LAG should bet/raise most frequently. Fish calls a lot but rarely raises.
  Aggression Index = (bets+raises) / (calls+checks+folds). Higher = more aggressive.
</div>
</div>

<!-- ═══════ FOLD RATE + AGGRESSION ═══════ -->
<div class="section">
<h2>Fold Rate &amp; Aggression</h2>
<div class="chart-grid">
  <div class="chart-box">
    <h4>Fold Rate by Style</h4>
    <canvas id="foldRateChart"></canvas>
  </div>
  <div class="chart-box">
    <h4>Aggression Index by Style</h4>
    <canvas id="aggressionChart"></canvas>
  </div>
</div>
</div>

<!-- ═══════ BY HAND CATEGORY ═══════ -->
<div class="section">
<h2>Breakdown by Hand Category</h2>
<p>How each style responds to Premium, Medium, Marginal, Weak, Draw, and Multiway scenarios.</p>
<div class="chart-grid">
  ${categoryTables}
</div>
</div>

<!-- ═══════ BY PLAYER COUNT ═══════ -->
<div class="section">
<h2>Player Count Impact</h2>
<p>How actions shift as the table gets more crowded (heads-up vs 3-way vs 6-way).</p>
<div class="chart-grid">
  <div class="chart-box full">
    <h4>Aggression Rate (Bet+Raise %) by Player Count</h4>
    <canvas id="playerCountChart"></canvas>
  </div>
</div>
<div class="insight"><strong>Expected:</strong> All styles should become less aggressive in multiway pots. The multiway equity discount means fewer value bets, more checking. LAG should still show more aggression than Nit even 6-way.</div>
</div>

<!-- ═══════ KEY DIVERGENCE SCENARIOS ═══════ -->
<div class="section">
<h2>Key Divergence Scenarios</h2>
<p>Scenarios where styles disagree the most (3+ unique actions). These are the spots where style selection matters most.</p>
<table class="data-table">
  <thead>
    <tr><th>Scenario</th><th>Pos</th><th>Street</th><th>Players</th>${STYLES.map(s => `<th style="color:${STYLE_COLORS[s]}">${STYLE_PROFILES[s].shortName}</th>`).join('')}</tr>
  </thead>
  <tbody>
    ${divergenceRows || '<tr><td colspan="10">No high-divergence scenarios found</td></tr>'}
  </tbody>
</table>
</div>

<!-- ═══════ SIZING COMPARISON ═══════ -->
<div class="section">
<h2>Bet Sizing Comparison</h2>
<div class="chart-grid">
  <div class="chart-box full">
    <h4>Average Bet Size (% of Pot) When Betting</h4>
    <canvas id="sizingChart"></canvas>
  </div>
</div>
<div class="insight"><strong>Expected:</strong> LAG should size biggest (1.15x multiplier), TAG slightly above baseline, Nit/Rock smallest (0.85x). Fish slightly under baseline (0.90x).</div>
</div>

</div><!-- container -->

<script>
const chartDefaults = {
  color: '#94a3b8',
  borderColor: '#475569',
};
Chart.defaults.color = chartDefaults.color;
Chart.defaults.borderColor = chartDefaults.borderColor;

const styleColors = ${JSON.stringify(STYLE_COLORS)};
const styles = ${JSON.stringify(STYLES)};
const styleLabels = ${JSON.stringify(STYLES.map(s => STYLE_PROFILES[s].shortName))};

// Action Distribution Stacked Bar
const actionDistData = ${JSON.stringify(STYLES.map(s => {
  const d = analysis.actionDist[s];
  const total = Object.values(d).reduce((a, b) => a + b, 0);
  return {
    fold: pct(d.fold, total),
    callCheck: pct(d.call + d.check, total),
    betRaise: pct(d.bet + d.raise, total),
  };
}))};

new Chart(document.getElementById('actionDistChart'), {
  type: 'bar',
  data: {
    labels: styleLabels,
    datasets: [
      { label: 'Fold', data: actionDistData.map(d => d.fold), backgroundColor: '#ef4444' },
      { label: 'Call/Check', data: actionDistData.map(d => d.callCheck), backgroundColor: '#94a3b8' },
      { label: 'Bet/Raise', data: actionDistData.map(d => d.betRaise), backgroundColor: '#22c55e' },
    ]
  },
  options: {
    responsive: true,
    plugins: { legend: { position: 'top' } },
    scales: { x: { stacked: true }, y: { stacked: true, max: 100, title: { display: true, text: '% of decisions' } } }
  }
});

// Fold Rate Bar
new Chart(document.getElementById('foldRateChart'), {
  type: 'bar',
  data: {
    labels: styleLabels,
    datasets: [{
      label: 'Fold Rate %',
      data: ${JSON.stringify(STYLES.map(s => analysis.foldRate[s]))},
      backgroundColor: styles.map(s => styleColors[s]),
    }]
  },
  options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { max: 100 } } }
});

// Aggression Index Bar
new Chart(document.getElementById('aggressionChart'), {
  type: 'bar',
  data: {
    labels: styleLabels,
    datasets: [{
      label: 'Aggression Index',
      data: ${JSON.stringify(STYLES.map(s => analysis.aggressionIndex[s]))},
      backgroundColor: styles.map(s => styleColors[s]),
    }]
  },
  options: { responsive: true, plugins: { legend: { display: false } } }
});

// Player Count Grouped Bar
const pcData = ${JSON.stringify(pcChartData)};
new Chart(document.getElementById('playerCountChart'), {
  type: 'bar',
  data: {
    labels: styleLabels,
    datasets: [
      { label: 'Heads-up (2p)', data: styles.map(s => pcData['2'][s].aggPct), backgroundColor: 'rgba(34,197,94,0.8)' },
      { label: '3-way (3p)', data: styles.map(s => pcData['3'][s].aggPct), backgroundColor: 'rgba(56,189,248,0.8)' },
      { label: '6-way (6p)', data: styles.map(s => pcData['6'][s].aggPct), backgroundColor: 'rgba(139,92,246,0.8)' },
    ]
  },
  options: {
    responsive: true,
    plugins: { legend: { position: 'top' } },
    scales: { y: { max: 100, title: { display: true, text: 'Bet+Raise %' } } }
  }
});

// Sizing Bar
new Chart(document.getElementById('sizingChart'), {
  type: 'bar',
  data: {
    labels: styleLabels,
    datasets: [{
      label: 'Avg Bet Size (% pot)',
      data: ${JSON.stringify(STYLES.map(s => analysis.avgSizing[s]))},
      backgroundColor: styles.map(s => styleColors[s]),
    }]
  },
  options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: '% of pot' } } } }
});
</script>
</body>
</html>`;

  return html;
}

// =============================================================================
// MAIN
// =============================================================================

console.log('Starting large-scale style differentiation test...\n');
const startTime = Date.now();

const data = runAllTests();
const analysis = analyzeResults(data);
const html = generateReport(data, analysis);

// Write report
const reportPath = join(__dirname, '..', 'STYLE_REPORT.html');
writeFileSync(reportPath, html, 'utf-8');

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\nReport generated: STYLE_REPORT.html (${elapsed}s)`);

// Print summary
console.log('\n=== SUMMARY ===');
console.log('Style        Fold%  Call%  Bet%   Aggr   AvgConf  AvgSize');
console.log('─'.repeat(65));
for (const s of STYLES) {
  const d = analysis.actionDist[s];
  const total = Object.values(d).reduce((a, b) => a + b, 0);
  const foldP = Math.round(d.fold / total * 100);
  const callP = Math.round((d.call + d.check) / total * 100);
  const betP = Math.round((d.bet + d.raise) / total * 100);
  console.log(
    `${STYLE_PROFILES[s].shortName.padEnd(12)} ${String(foldP + '%').padEnd(6)} ${String(callP + '%').padEnd(6)} ${String(betP + '%').padEnd(6)} ${String(analysis.aggressionIndex[s]).padEnd(6)} ${String(analysis.avgConfidence[s] + '%').padEnd(8)} ${analysis.avgSizing[s]}%`
  );
}

console.log(`\nDifferentiation: ${data.styleVariation}/${data.totalScenarioCombos} (${Math.round(data.styleVariation / data.totalScenarioCombos * 100)}%)`);
process.exit(0);
