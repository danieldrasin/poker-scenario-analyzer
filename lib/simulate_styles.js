#!/usr/bin/env node
/**
 * Full Game Simulation for Style Differentiation Report
 *
 * Simulates real poker games with:
 *   - Card dealing from shuffled deck (PLO4/5/6)
 *   - Blind rotation (SB/BB move each hand)
 *   - Full street progression: preflop → flop → turn → river → showdown
 *   - Stack tracking with proper pot management
 *   - All 6 styles using the actual ActionRecommender pipeline
 *   - All C(n,k) style matchup combinations at small tables
 *
 * Requirements (from TESTING_REQUIREMENTS.md):
 *   - ≥2,000 hands per configuration for statistical significance
 *   - 50,000+ total hands across all configs
 *   - All variants: PLO4, PLO5, PLO6
 *   - All table sizes: 2-6 players (6+ includes all styles)
 *   - Track: BB/100, VPIP, aggression, fold rates, etc.
 *
 * Usage: node --experimental-vm-modules lib/simulate_styles.js [--quick]
 */

import { recommendAction } from './ActionRecommender.js';
import { getSizingRecommendation } from './BetSizer.js';
import { getStyleProfile, getStyleIds, STYLE_PROFILES } from './StyleProfiles.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// CARD ENGINE — Lightweight self-contained
// =============================================================================

const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 2-A
const SUITS = ['s', 'h', 'd', 'c'];
const RANK_NAMES = { 2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 7:'7', 8:'8', 9:'9', 10:'10', 11:'J', 12:'Q', 13:'K', 14:'A' };

function makeDeck() {
  const deck = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push({ rank: r, suit: s });
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardStr(c) { return `${RANK_NAMES[c.rank]}${c.suit}`; }

// =============================================================================
// HAND EVALUATOR — Omaha-style (must use exactly 2 hole + 3 board)
// =============================================================================

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const results = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const rest = combinations(arr.slice(i + 1), k - 1);
    for (const combo of rest) {
      results.push([arr[i], ...combo]);
    }
  }
  return results;
}

// Hand type constants
const HAND_TYPES = {
  HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, THREE_OF_A_KIND: 3,
  STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8, ROYAL_FLUSH: 9
};

function evaluate5(cards) {
  // Sort by rank desc
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const ranks = sorted.map(c => c.rank);
  const suits = sorted.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  // Check straight
  let isStraight = false;
  let straightHigh = 0;

  // Normal straight check
  if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) {
    isStraight = true;
    straightHigh = ranks[0];
  }
  // Wheel (A-2-3-4-5)
  if (!isStraight && ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
    isStraight = true;
    straightHigh = 5;
  }

  if (isFlush && isStraight) {
    return { type: straightHigh === 14 ? 9 : 8, primaryRanks: [straightHigh], kickers: [] };
  }

  // Count rank occurrences
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts).map(([r, c]) => ({ rank: parseInt(r), count: c }));
  groups.sort((a, b) => b.count - a.count || b.rank - a.rank);

  if (groups[0].count === 4) {
    return { type: 7, primaryRanks: [groups[0].rank], kickers: [groups[1].rank] };
  }
  if (groups[0].count === 3 && groups[1].count === 2) {
    return { type: 6, primaryRanks: [groups[0].rank, groups[1].rank], kickers: [] };
  }
  if (isFlush) {
    return { type: 5, primaryRanks: ranks, kickers: [] };
  }
  if (isStraight) {
    return { type: 4, primaryRanks: [straightHigh], kickers: [] };
  }
  if (groups[0].count === 3) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.rank).sort((a, b) => b - a);
    return { type: 3, primaryRanks: [groups[0].rank], kickers };
  }
  if (groups[0].count === 2 && groups[1].count === 2) {
    const pairs = [groups[0].rank, groups[1].rank].sort((a, b) => b - a);
    const kicker = groups.find(g => g.count === 1)?.rank || 0;
    return { type: 2, primaryRanks: pairs, kickers: [kicker] };
  }
  if (groups[0].count === 2) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.rank).sort((a, b) => b - a);
    return { type: 1, primaryRanks: [groups[0].rank], kickers };
  }

  return { type: 0, primaryRanks: [], kickers: ranks };
}

function evaluateOmahaHand(holeCards, board) {
  // Omaha: must use exactly 2 hole cards + 3 board cards
  const holeCombos = combinations(holeCards, 2);
  const boardCombos = combinations(board, 3);

  let best = null;
  for (const h of holeCombos) {
    for (const b of boardCombos) {
      const hand = evaluate5([...h, ...b]);
      if (!best || compareHands(hand, best) > 0) {
        best = hand;
        best.holeUsed = h;
      }
    }
  }
  return best;
}

function compareHands(a, b) {
  if (a.type !== b.type) return a.type - b.type;
  for (let i = 0; i < Math.max(a.primaryRanks.length, b.primaryRanks.length); i++) {
    const ar = a.primaryRanks[i] || 0;
    const br = b.primaryRanks[i] || 0;
    if (ar !== br) return ar - br;
  }
  for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
    const ak = a.kickers[i] || 0;
    const bk = b.kickers[i] || 0;
    if (ak !== bk) return ak - bk;
  }
  return 0;
}

const HAND_NAMES = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'];

// Estimate if this could be the nuts
function isLikelyNuts(handResult, board) {
  if (handResult.type >= 8) return true; // SF or RF
  if (handResult.type === 7) return true; // Quads
  if (handResult.type === 6 && handResult.primaryRanks[0] >= 12) return true; // High full house
  if (handResult.type === 5 && handResult.primaryRanks[0] === 14) return true; // Nut flush
  return false;
}

// Count outs for improvement
function countOuts(handResult) {
  if (handResult.type >= 5) return { toImprove: 0, draws: [] };
  if (handResult.type === 3) return { toImprove: 7, draws: ['full house'] };
  if (handResult.type === 2) return { toImprove: 4, draws: ['full house'] };
  if (handResult.type === 1) return { toImprove: 2, draws: [] };
  return { toImprove: 0, draws: [] };
}

// PLO-calibrated equity estimation
// In PLO, equities run much closer together than NLHE.
// Key calibration: top pair ~35-45%, overpair ~45-55%, two pair ~50-65%, set ~65-80%
// These ranges vary significantly by rank, which creates the granularity needed
// for aggressive styles to profitably target thin value spots.
function estimateEquity(handResult, playersInHand, isNuts, board) {
  // Base equity ranges by hand type [min, max]
  // The rank of the primary cards interpolates between min and max
  const equityRanges = {
    0: [8, 18],    // High card: 8-18% (rank A=18, rank 2=8)
    1: [22, 42],   // Pair: 22-42% (bottom pair=22, top pair/overpair=42)
    2: [45, 62],   // Two pair: 45-62% (low two pair=45, top two pair=62)
    3: [62, 80],   // Set: 62-80% (bottom set=62, top set=80)
    4: [60, 72],   // Straight: 60-72% (low straight=60, nut straight=72)
    5: [70, 82],   // Flush: 70-82% (low flush=70, nut flush=82)
    6: [80, 90],   // Full house: 80-90%
    7: [90, 95],   // Quads: 90-95%
    8: [94, 97],   // Straight flush: 94-97%
    9: [97, 99],   // Royal flush: 97-99%
  };

  const [minEq, maxEq] = equityRanges[handResult.type] || [10, 20];

  // Interpolate by rank (2-14) → 0.0 to 1.0
  const primaryRank = handResult.primaryRanks[0] || 8;
  const rankFraction = (primaryRank - 2) / 12; // 0 for deuce, 1 for ace
  let equity = minEq + (maxEq - minEq) * rankFraction;

  // Kicker bonus for pairs/trips: high kicker adds 2-5% equity
  if (handResult.kickers && handResult.kickers[0]) {
    const kickerBonus = ((handResult.kickers[0] - 2) / 12) * 5;
    equity += kickerBonus;
  }

  // Second pair rank bonus for two pair
  if (handResult.type === 2 && handResult.primaryRanks[1]) {
    const secondPairBonus = ((handResult.primaryRanks[1] - 2) / 12) * 5;
    equity += secondPairBonus;
  }

  // Multiway discount: PLO equity drops dramatically with more opponents
  // because 4+ hole cards per player = many more draws and made hands.
  // Model: equity_multiway ≈ equity_HU * (2/K)^power
  //   where power is higher for weak hands (lose more equity multiway)
  //   and lower for strong hands (retain more equity multiway).
  // Calibration targets (6-way PLO):
  //   pair → ~12-15%, two pair → ~22-25%, set → ~30-35%, flush → ~38-42%
  if (playersInHand > 2) {
    const power = 0.85 - (handResult.type / 9) * 0.45; // 0.85 for high card → 0.40 for royal
    const scaleFactor = Math.pow(2 / playersInHand, power);
    equity *= scaleFactor;
  }

  if (isNuts) equity = Math.min(95, equity + 8);

  return Math.max(5, Math.min(95, Math.round(equity)));
}

// =============================================================================
// GAME SIMULATOR
// =============================================================================

function simulateGame(config) {
  const { numPlayers, numHands, variant, styles, smallBlind, initialStack } = config;
  const bigBlind = smallBlind * 2;
  const holeCardCount = parseInt(variant.replace('omaha', '')) || 4;

  // Initialize players
  const players = styles.slice(0, numPlayers).map((style, i) => ({
    seat: i,
    style,
    stack: initialStack,
    stats: {
      handsPlayed: 0,
      handsDealt: 0,
      vpip: 0,         // Voluntarily put $ in pot
      pfr: 0,          // Preflop raise
      folds: 0,
      calls: 0,
      checks: 0,
      bets: 0,
      raises: 0,
      showdowns: 0,
      showdownWins: 0,
      totalProfit: 0,
      streetFolds: { preflop: 0, flop: 0, turn: 0, river: 0 },
      actionsByStreet: {
        flop: { fold: 0, check: 0, call: 0, bet: 0, raise: 0 },
        turn: { fold: 0, check: 0, call: 0, bet: 0, raise: 0 },
        river: { fold: 0, check: 0, call: 0, bet: 0, raise: 0 },
      },
    }
  }));

  let dealerIdx = 0;

  for (let hand = 0; hand < numHands; hand++) {
    // Reset for new hand
    const deck = shuffle(makeDeck());
    let deckPos = 0;
    const dealCard = () => deck[deckPos++];
    const dealCards = (n) => { const c = []; for (let i = 0; i < n; i++) c.push(dealCard()); return c; };

    // Determine positions
    const sbIdx = (dealerIdx + 1) % numPlayers;
    const bbIdx = (dealerIdx + 2) % numPlayers;

    // Active players for this hand (skip busted)
    let active = players.filter(p => p.stack > bigBlind);
    if (active.length < 2) {
      // Rebuy everyone to continue simulation — track cumulative profit before reset
      for (const p of players) {
        if (!p._cumulativeProfit) p._cumulativeProfit = 0;
        p._cumulativeProfit += p.stack - initialStack;
        p.stack = initialStack;
      }
      active = [...players];
    }

    // Deal hole cards
    const holeCards = {};
    for (const p of active) {
      holeCards[p.seat] = dealCards(holeCardCount);
      p.stats.handsDealt++;
    }

    // Post blinds
    let pot = 0;
    const invested = {};
    for (const p of active) invested[p.seat] = 0;

    const sbPlayer = active.find(p => p.seat === sbIdx) || active[0];
    const bbPlayer = active.find(p => p.seat === bbIdx) || active[1];

    const sbAmt = Math.min(smallBlind, sbPlayer.stack);
    sbPlayer.stack -= sbAmt;
    invested[sbPlayer.seat] += sbAmt;
    pot += sbAmt;

    const bbAmt = Math.min(bigBlind, bbPlayer.stack);
    bbPlayer.stack -= bbAmt;
    invested[bbPlayer.seat] += bbAmt;
    pot += bbAmt;

    let inHand = [...active]; // players still in the hand
    let board = [];

    // === PREFLOP (multi-pass, proper raise handling) ===
    {
      // Pre-compute hand quality for each active player
      const handQuality = {};
      for (const p of active) {
        const holeRanks = holeCards[p.seat].map(c => c.rank);
        const holeSuits = holeCards[p.seat].map(c => c.suit);
        const rankSum = holeRanks.reduce((a, b) => a + b, 0);
        const minSum = holeCardCount * 2;
        const maxSum = holeCardCount * 14;
        let quality = ((rankSum - minSum) / (maxSum - minSum)) * 60;
        const uniqueRanks = new Set(holeRanks).size;
        if (uniqueRanks < holeRanks.length) quality += 15;
        const suitCounts = {};
        for (const s of holeSuits) suitCounts[s] = (suitCounts[s] || 0) + 1;
        if (Object.values(suitCounts).some(c => c >= 2)) quality += 10;
        const sorted = [...new Set(holeRanks)].sort((a, b) => a - b);
        let conn = 0;
        for (let ci = 1; ci < sorted.length; ci++) {
          if (sorted[ci] - sorted[ci - 1] <= 2) conn++;
        }
        if (conn >= 2) quality += 10;
        handQuality[p.seat] = Math.min(100, quality) / 100;
      }

      // Action order: starts UTG (left of BB), wraps around
      const pfOrder = [];
      const bbActiveIdx = active.indexOf(bbPlayer);
      for (let i = 1; i <= active.length; i++) {
        pfOrder.push(active[(bbActiveIdx + i) % active.length]);
      }

      let currentBet = bigBlind; // Current bet to match
      const hasActedOnBet = new Set();
      const hasCountedVpip = new Set(); // Prevent double-counting vpip in multi-pass
      let preflopRaises = 0;
      const MAX_PF_RAISES = 2; // Open + 3-bet only (no 4-bet wars)

      // Multi-pass: loop until everyone has acted on the current bet
      let pfComplete = false;
      while (!pfComplete && inHand.length > 1) {
        pfComplete = true;

        for (const p of pfOrder) {
          if (!inHand.includes(p) || p.stack <= 0) continue;

          const toCall = currentBet - (invested[p.seat] || 0);

          // Skip if already acted on this bet level and not facing new bet
          if (hasActedOnBet.has(p.seat) && toCall <= 0) continue;

          const profile = getStyleProfile(p.style);
          const quality = handQuality[p.seat];

          // Play probability: vpipTarget * hand quality bias
          const playProb = profile.vpipTarget * (0.5 + quality);

          // Facing a raise? Tighten up — need better hands to call raises
          const facingRaise = currentBet > bigBlind;
          const adjustedPlayProb = facingRaise
            ? playProb * 0.7  // 30% tighter facing a raise
            : playProb;

          const willPlay = Math.random() < adjustedPlayProb;

          if (!willPlay && toCall > 0) {
            // Fold
            inHand = inHand.filter(x => x !== p);
            p.stats.folds++;
            p.stats.streetFolds.preflop++;
            hasActedOnBet.add(p.seat);
          } else if (!willPlay && toCall <= 0) {
            // Check (BB option when not raised, or already invested enough)
            p.stats.checks++;
            hasActedOnBet.add(p.seat);
          } else {
            // Play — raise or call
            const wantsToRaise = Math.random() < profile.pfrRatio
              && p.stack > toCall * 3
              && preflopRaises < MAX_PF_RAISES;

            if (wantsToRaise) {
              // Raise to 3x current bet (or 3BB if opening)
              const raiseTarget = Math.max(currentBet * 2.5, bigBlind * 3);
              const totalNeeded = raiseTarget - (invested[p.seat] || 0);
              const raiseAmt = Math.min(totalNeeded, p.stack);
              p.stack -= raiseAmt;
              invested[p.seat] = (invested[p.seat] || 0) + raiseAmt;
              pot += raiseAmt;
              currentBet = invested[p.seat];
              preflopRaises++;
              if (!hasCountedVpip.has(p.seat)) {
                p.stats.pfr++;
                p.stats.vpip++;
                p.stats.handsPlayed++;
                hasCountedVpip.add(p.seat);
              }
              p.stats.raises++;

              // New raise: everyone else must respond
              hasActedOnBet.clear();
              hasActedOnBet.add(p.seat);
              pfComplete = false;
              break; // Restart loop
            } else {
              // Call
              const callAmt = Math.min(toCall, p.stack);
              if (callAmt > 0) {
                p.stack -= callAmt;
                invested[p.seat] = (invested[p.seat] || 0) + callAmt;
                pot += callAmt;
              }
              p.stats.calls++;
              if (!hasCountedVpip.has(p.seat)) {
                p.stats.vpip++;
                p.stats.handsPlayed++;
                hasCountedVpip.add(p.seat);
              }
              hasActedOnBet.add(p.seat);
            }
          }
        }

        // Check if everyone remaining has acted
        if (pfComplete) {
          for (const p of inHand) {
            if (p.stack > 0 && !hasActedOnBet.has(p.seat)) {
              pfComplete = false;
              break;
            }
          }
        }
      }
    }

    // Skip to showdown if only 1 player left
    if (inHand.length <= 1) {
      if (inHand.length === 1) {
        inHand[0].stack += pot;
        inHand[0].stats.totalProfit += pot - invested[inHand[0].seat];
      }
      dealerIdx = (dealerIdx + 1) % numPlayers;
      continue;
    }

    // === POSTFLOP STREETS ===
    const streets = [
      { name: 'flop', dealCount: 3 },
      { name: 'turn', dealCount: 1 },
      { name: 'river', dealCount: 1 },
    ];

    for (const street of streets) {
      if (inHand.length <= 1) break;

      // Deal community cards
      board.push(...dealCards(street.dealCount));

      // Betting round — multi-pass until all players have acted on current bet
      let currentBet = 0;
      let streetPot = 0;
      const streetInvested = {};
      for (const p of inHand) streetInvested[p.seat] = 0;

      // Action order: from SB position clockwise
      const orderedPlayers = [...inHand].sort((a, b) => {
        const aPos = (a.seat - sbIdx + numPlayers) % numPlayers;
        const bPos = (b.seat - sbIdx + numPlayers) % numPlayers;
        return aPos - bPos;
      });

      // Track who has acted on the current bet level
      const hasActedOnCurrentBet = new Set();
      let betsThisRound = 0;
      const MAX_RAISES = 3; // Cap raises to prevent infinite loops

      // Keep looping until everyone still in hand has acted on currentBet
      let roundComplete = false;
      while (!roundComplete && inHand.length > 1) {
        roundComplete = true; // Assume done; will set false if someone still needs to act

        for (const p of orderedPlayers) {
          if (!inHand.includes(p) || p.stack <= 0) continue;

          const toCall = currentBet - (streetInvested[p.seat] || 0);

          // Skip if already acted on this bet level and not facing a new bet
          if (hasActedOnCurrentBet.has(p.seat) && toCall <= 0) continue;
          // If facing a bet they haven't responded to, they must act
          if (hasActedOnCurrentBet.has(p.seat) && toCall <= 0) continue;

          // Evaluate hand
          const handResult = evaluateOmahaHand(holeCards[p.seat], board);
          const nuts = isLikelyNuts(handResult, board);
          const outs = countOuts(handResult);
          const equity = estimateEquity(handResult, inHand.length, nuts, board);

          const potOdds = toCall > 0 ? Math.round(toCall / (pot + streetPot + toCall) * 100) : 0;

          // Determine position
          const posOrder = ['SB', 'BB', 'UTG', 'MP', 'CO', 'BTN'];
          const relPos = (p.seat - sbIdx + numPlayers) % numPlayers;
          const position = posOrder[Math.min(relPos, posOrder.length - 1)] || 'MP';
          const inPosition = relPos >= inHand.length - 2;

          // Get recommendation from ActionRecommender
          let rec;
          try {
            rec = recommendAction({
              equity,
              potOdds,
              impliedOdds: outs.toImprove > 4 ? 'good' : (outs.toImprove > 0 ? 'moderate' : 'poor'),
              handType: handResult.type,
              handDescription: HAND_NAMES[handResult.type],
              isNuts: nuts,
              outs,
              drawEquity: outs.toImprove * 2,
              spr: p.stack / Math.max(1, pot + streetPot),
              position,
              boardTexture: { connectivity: 'unknown' },
              street: street.name,
              facingBet: toCall > 0,
              toCall,
              potSize: pot + streetPot,
              playersInHand: inHand.length,
              heroStyle: p.style,
            });
          } catch (e) {
            rec = { action: toCall > 0 ? 'fold' : 'check', confidence: 0.5 };
          }

          let action = rec.action;
          const stats = p.stats.actionsByStreet[street.name];

          // SIMULATION OVERRIDE: Style-specific behavior adjustments
          const profile = getStyleProfile(p.style);

          // Fish mistake factor: real fish randomly donk-bet, min-raise, and
          // chase draws without correct odds. ~10% of the time, Fish makes
          // a costly "mistake" action: betting or raising with weak hands.
          if (p.style === 'fish' && handResult.type <= 1 && Math.random() < 0.15) {
            if (toCall <= 0) {
              action = 'bet'; // Random donk bet with weak hand
              rec.betType = 'bluff'; // Mark as bluff for sizing
            } else if (Math.random() < 0.3) {
              action = 'raise'; // Occasional min-raise with nothing
              rec.betType = 'bluff';
            }
          }

          // Bluff/semi-bluff frequency: probabilistic (not deterministic)
          if (rec.betType === 'bluff' && action === 'bet') {
            // Roll the dice — only bluff at the style's bluff frequency
            if (Math.random() >= profile.equityAdjustments.bluffFrequency) {
              action = 'check'; // Don't bluff this time
            }
          }
          if (rec.betType === 'semiBluff' && (action === 'bet' || action === 'raise')) {
            // Semi-bluffs fire more often but still not 100%
            const semiBluffFreq = Math.min(0.5, profile.equityAdjustments.bluffFrequency * 3);
            if (Math.random() >= semiBluffFreq) {
              action = toCall > 0 ? 'call' : 'check'; // Call or check instead
            }
          }

          // Aggression multiplier gate: passive players sometimes check instead
          // of betting, even when the ActionRecommender says to bet. This models
          // the "missed value" that passive players leave on the table — they
          // don't extract full value from strong hands because they check too much.
          // aggressionMult: Rock(0.50), Fish(0.40), Nit(0.70), Reg(1.0), TAG(1.20), LAG(1.30)
          if ((action === 'bet' || action === 'raise') && profile.equityAdjustments.aggressionMult < 1.0) {
            const betFollowThrough = 0.3 + profile.equityAdjustments.aggressionMult * 0.7;
            // Rock: 65% of bets go through, Fish: 58%, Nit: 79%
            if (Math.random() > betFollowThrough) {
              action = toCall > 0 ? 'call' : 'check'; // Check or call instead of betting
            }
          }

          // If facing a bet and recommender says "bet", treat as raise
          if (action === 'bet' && toCall > 0) action = 'raise';
          // If not facing a bet and recommender says "raise", treat as bet
          if (action === 'raise' && toCall <= 0) action = 'bet';
          // Cap raises per street
          if (action === 'raise' && betsThisRound >= MAX_RAISES) action = 'call';

          if (action === 'fold') {
            inHand = inHand.filter(x => x !== p);
            p.stats.folds++;
            p.stats.streetFolds[street.name]++;
            if (stats) stats.fold++;
            hasActedOnCurrentBet.add(p.seat);
          } else if (action === 'check') {
            p.stats.checks++;
            if (stats) stats.check++;
            hasActedOnCurrentBet.add(p.seat);
          } else if (action === 'call') {
            const callAmt = Math.min(toCall, p.stack);
            p.stack -= callAmt;
            streetInvested[p.seat] = (streetInvested[p.seat] || 0) + callAmt;
            invested[p.seat] += callAmt;
            streetPot += callAmt;
            p.stats.calls++;
            if (stats) stats.call++;
            hasActedOnCurrentBet.add(p.seat);
          } else if (action === 'bet' || action === 'raise') {
            // Get sizing
            let sizing;
            try {
              sizing = getSizingRecommendation({
                action,
                pot: pot + streetPot,
                effectiveStack: p.stack,
                betType: rec.betType || 'value',
                boardTexture: null,
                position: inPosition ? 'IP' : 'OOP',
                street: street.name,
                equity,
                isNuts: nuts,
                heroStyle: p.style,
              });
            } catch (e) {
              sizing = null;
            }

            const betAmt = Math.min(
              sizing?.sizing?.optimal || Math.round((pot + streetPot) * 0.6),
              p.stack
            );
            const totalAmt = betAmt + (toCall > 0 ? Math.min(toCall, p.stack - betAmt) : 0);
            const actualAmt = Math.min(totalAmt, p.stack);

            p.stack -= actualAmt;
            streetInvested[p.seat] = (streetInvested[p.seat] || 0) + actualAmt;
            invested[p.seat] += actualAmt;
            streetPot += actualAmt;
            currentBet = streetInvested[p.seat];
            betsThisRound++;

            if (action === 'bet') { p.stats.bets++; if (stats) stats.bet++; }
            else { p.stats.raises++; if (stats) stats.raise++; }

            // New bet/raise: everyone else must respond → clear their "acted" status
            hasActedOnCurrentBet.clear();
            hasActedOnCurrentBet.add(p.seat); // Bettor has acted
            roundComplete = false; // Need another pass
            break; // Restart the loop from the beginning
          }
        }

        // Check if everyone remaining has acted on the current bet
        if (roundComplete) {
          for (const p of inHand) {
            if (p.stack > 0 && !hasActedOnCurrentBet.has(p.seat)) {
              roundComplete = false;
              break;
            }
          }
        }
      }

      pot += streetPot;
    }

    // === SHOWDOWN ===
    if (inHand.length > 1) {
      let bestHand = null;
      let winners = [];

      for (const p of inHand) {
        p.stats.showdowns++;
        const hand = evaluateOmahaHand(holeCards[p.seat], board);
        if (!bestHand || compareHands(hand, bestHand) > 0) {
          bestHand = hand;
          winners = [p];
        } else if (compareHands(hand, bestHand) === 0) {
          winners.push(p);
        }
      }

      const share = Math.floor(pot / winners.length);
      for (const w of winners) {
        w.stack += share;
        w.stats.showdownWins++;
        w.stats.totalProfit += share - invested[w.seat];
      }
      // Non-winners lose their investment
      for (const p of inHand) {
        if (!winners.includes(p)) {
          p.stats.totalProfit -= invested[p.seat];
        }
      }
    } else if (inHand.length === 1) {
      inHand[0].stack += pot;
      inHand[0].stats.totalProfit += pot - invested[inHand[0].seat];
    }

    // Rotate dealer
    dealerIdx = (dealerIdx + 1) % numPlayers;
  }

  // Compute summary stats
  return players.map(p => {
    const s = p.stats;
    const totalActions = s.folds + s.calls + s.checks + s.bets + s.raises;
    const aggressive = s.bets + s.raises;
    const passive = s.calls + s.checks;
    return {
      seat: p.seat,
      style: p.style,
      stack: p.stack,
      profit: (p._cumulativeProfit || 0) + (p.stack - initialStack),
      bb100: s.handsDealt > 0 ? ((p._cumulativeProfit || 0) + (p.stack - initialStack)) / bigBlind / (s.handsDealt / 100) : 0,
      handsDealt: s.handsDealt,
      handsPlayed: s.handsPlayed,
      vpipPct: s.handsDealt > 0 ? Math.round(s.vpip / s.handsDealt * 100) : 0,
      pfrPct: s.handsDealt > 0 ? Math.round(s.pfr / s.handsDealt * 100) : 0,
      foldPct: totalActions > 0 ? Math.round(s.folds / totalActions * 100) : 0,
      aggression: passive > 0 ? Math.round(aggressive / passive * 100) / 100 : 0,
      showdowns: s.showdowns,
      showdownWinPct: s.showdowns > 0 ? Math.round(s.showdownWins / s.showdowns * 100) : 0,
      actionDist: {
        fold: s.folds, call: s.calls, check: s.checks, bet: s.bets, raise: s.raises,
      },
      streetFolds: s.streetFolds,
      actionsByStreet: s.actionsByStreet,
    };
  });
}

function p_stats_increment(player, stat) {
  player.stats[stat]++;
}

// =============================================================================
// MATCHUP GENERATOR
// =============================================================================

function getCombinations(arr, k) {
  if (k === 1) return arr.map(x => [x]);
  const result = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const rest = getCombinations(arr.slice(i + 1), k - 1);
    for (const combo of rest) {
      result.push([arr[i], ...combo]);
    }
  }
  return result;
}

// =============================================================================
// MAIN ORCHESTRATOR
// =============================================================================

const ALL_STYLES = getStyleIds(); // ['nit', 'rock', 'reg', 'tag', 'lag', 'fish']
const VARIANTS = ['omaha4', 'omaha5', 'omaha6'];

function buildConfigurations(quick = false) {
  const configs = [];
  const handsPerConfig = quick ? 500 : 2000;

  for (const variant of VARIANTS) {
    // 2-player: all C(6,2) = 15 matchups
    const pairs = getCombinations(ALL_STYLES, 2);
    for (const pair of pairs) {
      configs.push({
        variant, numPlayers: 2, numHands: handsPerConfig,
        styles: pair, smallBlind: 10, initialStack: 2000,
        label: `${variant} 2p ${pair.join(' vs ')}`,
      });
    }

    // 3-player: all C(6,3) = 20 matchups
    const triples = getCombinations(ALL_STYLES, 3);
    for (const triple of triples) {
      configs.push({
        variant, numPlayers: 3, numHands: handsPerConfig,
        styles: triple, smallBlind: 10, initialStack: 3000,
        label: `${variant} 3p ${triple.join('/')}`,
      });
    }

    // 6-player: one config with all styles
    configs.push({
      variant, numPlayers: 6, numHands: handsPerConfig,
      styles: [...ALL_STYLES], smallBlind: 10, initialStack: 5000,
      label: `${variant} 6p all-styles`,
    });
  }

  return configs;
}

function aggregateResults(allResults) {
  // Aggregate by style across all configs
  const byStyle = {};
  for (const s of ALL_STYLES) {
    byStyle[s] = {
      totalHands: 0, totalProfit: 0, configs: 0,
      vpipSum: 0, pfrSum: 0, foldSum: 0, aggrSum: 0,
      showdowns: 0, showdownWins: 0,
      actionDist: { fold: 0, call: 0, check: 0, bet: 0, raise: 0 },
      streetFolds: { preflop: 0, flop: 0, turn: 0, river: 0 },
      bb100List: [],
    };
  }

  // By variant × style
  const byVariantStyle = {};
  for (const v of VARIANTS) {
    byVariantStyle[v] = {};
    for (const s of ALL_STYLES) {
      byVariantStyle[v][s] = { totalHands: 0, totalProfit: 0, bb100List: [], configs: 0 };
    }
  }

  // By table size × style
  const byTableStyle = {};
  for (const size of [2, 3, 6]) {
    byTableStyle[size] = {};
    for (const s of ALL_STYLES) {
      byTableStyle[size][s] = { totalHands: 0, totalProfit: 0, bb100List: [], configs: 0 };
    }
  }

  for (const { config, results } of allResults) {
    for (const r of results) {
      const s = r.style;
      const agg = byStyle[s];
      agg.totalHands += r.handsDealt;
      agg.totalProfit += r.profit;
      agg.configs++;
      agg.vpipSum += r.vpipPct;
      agg.pfrSum += r.pfrPct;
      agg.foldSum += r.foldPct;
      agg.aggrSum += r.aggression;
      agg.showdowns += r.showdowns;
      agg.showdownWins += r.showdownWinPct * r.showdowns / 100;
      agg.bb100List.push(r.bb100);
      for (const a of ['fold', 'call', 'check', 'bet', 'raise']) {
        agg.actionDist[a] += r.actionDist[a];
      }
      for (const st of ['preflop', 'flop', 'turn', 'river']) {
        agg.streetFolds[st] += r.streetFolds[st];
      }

      // By variant
      const vAgg = byVariantStyle[config.variant][s];
      vAgg.totalHands += r.handsDealt;
      vAgg.totalProfit += r.profit;
      vAgg.bb100List.push(r.bb100);
      vAgg.configs++;

      // By table size
      const tAgg = byTableStyle[config.numPlayers][s];
      tAgg.totalHands += r.handsDealt;
      tAgg.totalProfit += r.profit;
      tAgg.bb100List.push(r.bb100);
      tAgg.configs++;
    }
  }

  return { byStyle, byVariantStyle, byTableStyle };
}

// =============================================================================
// HTML REPORT GENERATOR
// =============================================================================

function generateReport(allResults, aggregated, totalHands, elapsed) {
  const { byStyle, byVariantStyle, byTableStyle } = aggregated;

  const STYLE_COLORS = {
    nit: '#8b5cf6', rock: '#6b7280', reg: '#0ea5e9',
    tag: '#2563eb', lag: '#dc2626', fish: '#f59e0b',
  };

  const styleLabel = (s) => STYLE_PROFILES[s]?.shortName || s;
  const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const pct = (n, total) => total > 0 ? Math.round(n / total * 100) : 0;
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Summary stats per style
  const styleSummary = ALL_STYLES.map(s => {
    const d = byStyle[s];
    const totalActs = Object.values(d.actionDist).reduce((a, b) => a + b, 0);
    return {
      style: s,
      hands: d.totalHands,
      avgBB100: d.totalHands > 0 ? Math.round(d.totalProfit / (configs[0].smallBlind * 2) / (d.totalHands / 100) * 10) / 10 : 0,
      avgVPIP: d.configs > 0 ? Math.round(d.vpipSum / d.configs) : 0,
      avgPFR: d.configs > 0 ? Math.round(d.pfrSum / d.configs) : 0,
      avgFold: d.configs > 0 ? Math.round(d.foldSum / d.configs) : 0,
      avgAggr: d.configs > 0 ? Math.round(d.aggrSum / d.configs * 100) / 100 : 0,
      showdownWin: d.showdowns > 0 ? Math.round(d.showdownWins / d.showdowns * 100) : 0,
      foldPct: pct(d.actionDist.fold, totalActs),
      callCheckPct: pct(d.actionDist.call + d.actionDist.check, totalActs),
      betRaisePct: pct(d.actionDist.bet + d.actionDist.raise, totalActs),
    };
  });

  // Cross-variant BB/100 (weighted)
  const bb = configs[0].smallBlind * 2;
  const weightedBB100 = (d) => d.totalHands > 0 ? Math.round(d.totalProfit / bb / (d.totalHands / 100) * 10) / 10 : 0;
  const crossVariant = {};
  for (const v of VARIANTS) {
    crossVariant[v] = ALL_STYLES.map(s => weightedBB100(byVariantStyle[v][s]));
  }

  // Table size data (weighted)
  const tableData = {};
  for (const size of [2, 3, 6]) {
    tableData[size] = ALL_STYLES.map(s => weightedBB100(byTableStyle[size][s]));
  }

  // Table size aggression (weighted BB/100)
  const tableAggr = {};
  for (const size of [2, 3, 6]) {
    tableAggr[size] = ALL_STYLES.map(s => weightedBB100(byTableStyle[size][s]));
  }

  const totalConfigs = allResults.length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Omaha Style Testing — Visual Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
:root { --bg:#0f172a; --surface:#1e293b; --surface2:#334155; --text:#e2e8f0; --text-dim:#94a3b8; --accent:#38bdf8; --green:#22c55e; --red:#ef4444; --border:#475569; }
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
.container{max-width:1200px;margin:0 auto;padding:2rem 1.5rem}
h1{font-size:2.2rem;font-weight:800;margin-bottom:0.5rem;background:linear-gradient(135deg,#38bdf8,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
h2{font-size:1.5rem;font-weight:700;margin:2.5rem 0 1rem;color:var(--accent);border-bottom:2px solid var(--surface2);padding-bottom:0.5rem}
p{color:var(--text-dim);margin-bottom:1rem;max-width:800px}
.subtitle{font-size:1rem;color:var(--text-dim);margin-bottom:2rem}
.stats-row{display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:2rem}
.stat-card{background:var(--surface);border-radius:12px;padding:1.25rem 1.5rem;flex:1;min-width:140px;border:1px solid var(--surface2)}
.stat-card .label{font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-dim);margin-bottom:0.25rem}
.stat-card .value{font-size:1.6rem;font-weight:700;color:var(--accent)}
.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin:1.5rem 0}
.chart-box{background:var(--surface);border-radius:12px;padding:1.25rem;border:1px solid var(--surface2)}
.chart-box.full{grid-column:1/-1}
.chart-box h4{font-size:0.95rem;color:var(--text-dim);margin-bottom:0.75rem;text-align:center}
.chart-box canvas{max-height:350px}
.data-table{width:100%;border-collapse:collapse;margin:1rem 0 1.5rem;background:var(--surface);border-radius:12px;overflow:hidden}
.data-table th{background:var(--surface2);padding:0.75rem 1rem;text-align:left;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.03em;color:var(--text-dim)}
.data-table td{padding:0.65rem 1rem;border-top:1px solid var(--surface2);font-size:0.95rem}
.data-table tr:hover td{background:rgba(56,189,248,0.05)}
.positive{color:var(--green)}.negative{color:var(--red)}
.section{margin-bottom:3rem}
.insight{background:var(--surface);border-left:4px solid var(--accent);border-radius:0 8px 8px 0;padding:1rem 1.25rem;margin:1rem 0;color:var(--text-dim)}
.insight strong{color:var(--text)}
.legend-row{display:flex;gap:1.5rem;justify-content:center;margin:1rem 0;flex-wrap:wrap}
.legend-item{display:flex;align-items:center;gap:0.4rem;font-size:0.85rem;color:var(--text-dim)}
.legend-dot{width:12px;height:12px;border-radius:3px}
@media(max-width:768px){.chart-grid{grid-template-columns:1fr}.stats-row{flex-direction:column}}
</style>
</head>
<body>
<div class="container">

<h1>Omaha Style Testing Report</h1>
<p class="subtitle">${totalHands.toLocaleString()} hands across ${totalConfigs} configurations &bull; 6 calibrated styles &bull; PLO4 / PLO5 / PLO6 &bull; Generated ${now}</p>

<div class="stats-row">
  <div class="stat-card"><div class="label">Total Hands</div><div class="value">${totalHands.toLocaleString()}</div></div>
  <div class="stat-card"><div class="label">Configurations</div><div class="value">${totalConfigs}</div></div>
  <div class="stat-card"><div class="label">Variants</div><div class="value">PLO4 / 5 / 6</div></div>
  <div class="stat-card"><div class="label">Player Styles</div><div class="value">6</div></div>
  <div class="stat-card"><div class="label">Run Time</div><div class="value">${Math.round(elapsed)}s</div></div>
</div>

<div class="legend-row">
  ${ALL_STYLES.map(s => `<div class="legend-item"><div class="legend-dot" style="background:${STYLE_COLORS[s]}"></div> ${STYLE_PROFILES[s].name}</div>`).join('\n  ')}
</div>

<!-- CROSS-VARIANT -->
<div class="section">
<h2>Cross-Variant Overview</h2>
<p>Average BB/100 win rates across all table sizes for each variant.</p>
<div class="chart-grid">
  <div class="chart-box full"><h4>Average BB/100 by Style &amp; Variant</h4><canvas id="crossVariantChart"></canvas></div>
</div>
</div>

<!-- STYLE SUMMARY TABLE -->
<div class="section">
<h2>Style Performance Summary</h2>
<table class="data-table">
  <thead><tr><th>Style</th><th>Hands</th><th>BB/100</th><th>VPIP</th><th>PFR</th><th>Fold %</th><th>Aggr</th><th>SD Win %</th></tr></thead>
  <tbody>
    ${styleSummary.map(s => `<tr>
      <td><span style="color:${STYLE_COLORS[s.style]};font-weight:700">${STYLE_PROFILES[s.style].name}</span></td>
      <td>${s.hands.toLocaleString()}</td>
      <td class="${s.avgBB100 >= 0 ? 'positive' : 'negative'}">${s.avgBB100 > 0 ? '+' : ''}${s.avgBB100}</td>
      <td>${s.avgVPIP}%</td>
      <td>${s.avgPFR}%</td>
      <td>${s.avgFold}%</td>
      <td>${s.avgAggr}</td>
      <td>${s.showdownWin}%</td>
    </tr>`).join('\n    ')}
  </tbody>
</table>
<div class="insight"><strong>Key metrics:</strong> VPIP = voluntarily put $ in pot (should match profile targets). PFR = preflop raise %. Aggression = (bets+raises)/calls. SD Win = showdown win rate.</div>
</div>

<!-- ACTION DISTRIBUTION -->
<div class="section">
<h2>Action Distribution</h2>
<div class="chart-grid">
  <div class="chart-box full"><h4>Action Distribution by Style</h4><canvas id="actionDistChart"></canvas></div>
</div>
</div>

<!-- TABLE SIZE IMPACT -->
<div class="section">
<h2>Table Size Impact</h2>
<p>How BB/100 changes across heads-up, 3-way, and 6-max tables.</p>
<div class="chart-grid">
  <div class="chart-box full"><h4>BB/100 by Table Size</h4><canvas id="tableSizeChart"></canvas></div>
</div>
</div>

<!-- FOLD RATE & AGGRESSION -->
<div class="section">
<h2>Fold Rate &amp; Aggression</h2>
<div class="chart-grid">
  <div class="chart-box"><h4>Fold Rate by Style</h4><canvas id="foldChart"></canvas></div>
  <div class="chart-box"><h4>Aggression Index by Style</h4><canvas id="aggrChart"></canvas></div>
</div>
</div>

<!-- VPIP / PFR -->
<div class="section">
<h2>Preflop Statistics</h2>
<div class="chart-grid">
  <div class="chart-box full"><h4>VPIP &amp; PFR by Style</h4><canvas id="vpipChart"></canvas></div>
</div>
<div class="insight"><strong>Expected VPIP:</strong> Nit ~20%, Rock ~20%, Reg ~25%, TAG ~28%, LAG ~35%, Fish ~50%</div>
</div>

</div>

<script>
Chart.defaults.color='#94a3b8';
Chart.defaults.borderColor='#475569';
const colors=${JSON.stringify(ALL_STYLES.map(s=>STYLE_COLORS[s]))};
const labels=${JSON.stringify(ALL_STYLES.map(s=>STYLE_PROFILES[s].shortName))};

// Cross-variant
new Chart(document.getElementById('crossVariantChart'),{type:'bar',data:{
  labels:labels,
  datasets:[
    {label:'PLO4',data:${JSON.stringify(crossVariant.omaha4)},backgroundColor:'rgba(34,197,94,0.7)'},
    {label:'PLO5',data:${JSON.stringify(crossVariant.omaha5)},backgroundColor:'rgba(56,189,248,0.7)'},
    {label:'PLO6',data:${JSON.stringify(crossVariant.omaha6)},backgroundColor:'rgba(139,92,246,0.7)'},
  ]
},options:{responsive:true,plugins:{legend:{position:'top'}},scales:{y:{title:{display:true,text:'BB/100'}}}}});

// Action Distribution
new Chart(document.getElementById('actionDistChart'),{type:'bar',data:{
  labels:labels,
  datasets:[
    {label:'Fold',data:${JSON.stringify(styleSummary.map(s=>s.foldPct))},backgroundColor:'#ef4444'},
    {label:'Call/Check',data:${JSON.stringify(styleSummary.map(s=>s.callCheckPct))},backgroundColor:'#94a3b8'},
    {label:'Bet/Raise',data:${JSON.stringify(styleSummary.map(s=>s.betRaisePct))},backgroundColor:'#22c55e'},
  ]
},options:{responsive:true,scales:{x:{stacked:true},y:{stacked:true,max:100,title:{display:true,text:'%'}}}}});

// Table Size
new Chart(document.getElementById('tableSizeChart'),{type:'bar',data:{
  labels:labels,
  datasets:[
    {label:'Heads-up (2p)',data:${JSON.stringify(tableData[2])},backgroundColor:'rgba(34,197,94,0.7)'},
    {label:'3-way (3p)',data:${JSON.stringify(tableData[3])},backgroundColor:'rgba(56,189,248,0.7)'},
    {label:'6-max (6p)',data:${JSON.stringify(tableData[6])},backgroundColor:'rgba(139,92,246,0.7)'},
  ]
},options:{responsive:true,plugins:{legend:{position:'top'}},scales:{y:{title:{display:true,text:'BB/100'}}}}});

// Fold Rate
new Chart(document.getElementById('foldChart'),{type:'bar',data:{
  labels:labels,datasets:[{data:${JSON.stringify(styleSummary.map(s=>s.avgFold))},backgroundColor:colors}]
},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{max:100}}}});

// Aggression
new Chart(document.getElementById('aggrChart'),{type:'bar',data:{
  labels:labels,datasets:[{data:${JSON.stringify(styleSummary.map(s=>s.avgAggr))},backgroundColor:colors}]
},options:{responsive:true,plugins:{legend:{display:false}}}});

// VPIP/PFR
new Chart(document.getElementById('vpipChart'),{type:'bar',data:{
  labels:labels,
  datasets:[
    {label:'VPIP',data:${JSON.stringify(styleSummary.map(s=>s.avgVPIP))},backgroundColor:'rgba(56,189,248,0.7)'},
    {label:'PFR',data:${JSON.stringify(styleSummary.map(s=>s.avgPFR))},backgroundColor:'rgba(139,92,246,0.7)'},
  ]
},options:{responsive:true,plugins:{legend:{position:'top'}},scales:{y:{max:100,title:{display:true,text:'%'}}}}});
</script>
</body>
</html>`;

  return html;
}

// =============================================================================
// MAIN
// =============================================================================

const isQuick = process.argv.includes('--quick');
const configs = buildConfigurations(isQuick);

const totalExpectedHands = configs.reduce((sum, c) => sum + c.numHands * c.numPlayers, 0);
console.log(`\n=== Full Game Style Simulation ===`);
console.log(`Mode: ${isQuick ? 'QUICK (500 hands/config)' : 'FULL (2000 hands/config)'}`);
console.log(`Configurations: ${configs.length}`);
console.log(`Expected total player-hands: ${totalExpectedHands.toLocaleString()}`);
console.log(`Variants: ${VARIANTS.join(', ')}`);
console.log(`Table sizes: 2p (${getCombinations(ALL_STYLES, 2).length} matchups), 3p (${getCombinations(ALL_STYLES, 3).length} matchups), 6p (1 config)`);
console.log();

const startTime = Date.now();
const allResults = [];
let totalHands = 0;
let configsDone = 0;

for (const config of configs) {
  const results = simulateGame(config);
  allResults.push({ config, results });
  totalHands += config.numHands;
  configsDone++;

  if (configsDone % 10 === 0 || configsDone === configs.length) {
    const elapsed = (Date.now() - startTime) / 1000;
    const pct = Math.round(configsDone / configs.length * 100);
    process.stdout.write(`\r  Progress: ${configsDone}/${configs.length} configs (${pct}%) | ${totalHands.toLocaleString()} hands | ${elapsed.toFixed(1)}s`);
  }
}

const elapsed = (Date.now() - startTime) / 1000;
console.log(`\n\nCompleted: ${totalHands.toLocaleString()} hands in ${elapsed.toFixed(1)}s (${Math.round(totalHands / elapsed).toLocaleString()} hands/sec)`);
console.log();

// Aggregate
const aggregated = aggregateResults(allResults);

// Print summary
console.log('=== STYLE SUMMARY ===');
console.log(`${'Style'.padEnd(8)} ${'Hands'.padStart(8)} ${'BB/100'.padStart(8)} ${'VPIP'.padStart(6)} ${'PFR'.padStart(5)} ${'Fold%'.padStart(6)} ${'Aggr'.padStart(6)} ${'SD%'.padStart(5)}`);
console.log('─'.repeat(55));

for (const s of ALL_STYLES) {
  const d = aggregated.byStyle[s];
  // Weighted BB/100: total profit / bigBlind / (total hands / 100)
  // This avoids Simpson's paradox from averaging ratios with different denominators
  const bigBlind = configs[0].smallBlind * 2;
  const avgBB = d.totalHands > 0 ? (d.totalProfit / bigBlind / (d.totalHands / 100)).toFixed(1) : '0';
  const totalActs = Object.values(d.actionDist).reduce((a, b) => a + b, 0);
  const foldP = pct(d.actionDist.fold, totalActs);
  const aggrIdx = (d.actionDist.call + d.actionDist.check) > 0
    ? ((d.actionDist.bet + d.actionDist.raise) / (d.actionDist.call + d.actionDist.check)).toFixed(2)
    : '0';
  const sdWin = d.showdowns > 0 ? Math.round(d.showdownWins / d.showdowns * 100) : 0;
  console.log(
    `${STYLE_PROFILES[s].shortName.padEnd(8)} ${d.totalHands.toString().padStart(8)} ${avgBB.padStart(8)} ` +
    `${(d.configs > 0 ? Math.round(d.vpipSum / d.configs) : 0).toString().padStart(5)}% ` +
    `${(d.configs > 0 ? Math.round(d.pfrSum / d.configs) : 0).toString().padStart(4)}% ` +
    `${foldP.toString().padStart(5)}% ${aggrIdx.padStart(6)} ${sdWin.toString().padStart(4)}%`
  );
}

// Generate report
const html = generateReport(allResults, aggregated, totalHands, elapsed);
const reportPath = join(__dirname, '..', 'STYLE_REPORT.html');
writeFileSync(reportPath, html, 'utf-8');
console.log(`\nReport saved: STYLE_REPORT.html`);

// Also save raw JSON for future analysis
const jsonPath = join(__dirname, '..', 'bot', 'test_results', `style_sim_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`);
try {
  writeFileSync(jsonPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalHands,
    configs: configs.length,
    elapsed,
    styleSummary: ALL_STYLES.map(s => {
      const d = aggregated.byStyle[s];
      return { style: s, hands: d.totalHands, avgBB100: d.totalHands > 0 ? d.totalProfit / (configs[0].smallBlind * 2) / (d.totalHands / 100) : 0, configs: d.configs };
    }),
  }, null, 2));
  console.log(`Data saved: ${jsonPath}`);
} catch (e) {
  // test_results dir may not exist
}

function avg(arr) { return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function pct(n, t) { return t > 0 ? Math.round(n / t * 100) : 0; }

process.exit(0);
