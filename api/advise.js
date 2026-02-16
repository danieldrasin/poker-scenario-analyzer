/**
 * Play Advisor API - Phase 3 with Action Recommendations
 *
 * Provides real-time hand analysis for Omaha poker.
 * Uses existing HandEvaluator, FlopTexture analyzer, and bundled probability data.
 * Phase 2: Adds opponent range estimation and equity calculation.
 * Phase 3: Adds action recommendations with bet sizing.
 *
 * POST /api/advise
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Import Phase 2 modules
import { estimateOpponentRange, describeRange, assessRangeConfidence } from './lib/RangeEstimator.js';
import { calculateEquity, isLikelyNuts } from './lib/EquityCalculator.js';

// Import Phase 3 modules
import { recommendAction } from './lib/ActionRecommender.js';
import { getSizingRecommendation } from './lib/BetSizer.js';

// Import Phase 5 modules
import { logRecommendation } from './lib/FeedbackStore.js';

// Import core poker modules
// Note: These are CommonJS modules compiled from TypeScript
const loadCoreModules = async () => {
  // In Vercel serverless, we need dynamic imports
  try {
    const corePath = '../packages/core/dist';
    const evaluator = await import(`${corePath}/evaluator/index.js`);
    const analyzer = await import(`${corePath}/analyzer/index.js`);
    const rules = await import(`${corePath}/rules/index.js`);
    const cards = await import(`${corePath}/cards/index.js`);
    return { evaluator, analyzer, rules, cards };
  } catch (e) {
    console.error('Failed to load core modules:', e);
    return null;
  }
};

// Cache for bundled data
let bundledDataCache = {};

/**
 * Load Tier 1 bundled probability data
 */
function loadBundledData(variant) {
  const variantMap = {
    'omaha4': 'plo4-base.json',
    'omaha5': 'plo5-base.json',
    'omaha6': 'plo6-base.json'
  };

  const filename = variantMap[variant];
  if (!filename) return null;

  if (bundledDataCache[variant]) {
    return bundledDataCache[variant];
  }

  try {
    // Try multiple paths for local dev vs Vercel deployment
    const paths = [
      join(process.cwd(), 'packages/web/src/public/data/tier1', filename),
      join(process.cwd(), 'public/data/tier1', filename),
      join(dirname(fileURLToPath(import.meta.url)), '../packages/web/src/public/data/tier1', filename)
    ];

    for (const dataPath of paths) {
      try {
        const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
        bundledDataCache[variant] = data;
        return data;
      } catch (e) {
        continue;
      }
    }
    return null;
  } catch (e) {
    console.error('Failed to load bundled data:', e);
    return null;
  }
}

/**
 * Parse card notation into Card objects
 */
function parseCards(cardStrings, Card) {
  if (!cardStrings || !Array.isArray(cardStrings)) return [];
  return cardStrings.map(s => Card.parse(s.trim()));
}

/**
 * Get threat probability from matrix data
 * Returns probability that opponent has a hand type >= threshold
 */
function getThreatProbability(data, playerHandType, playerCount, thresholdHandType = null) {
  if (!data || !data.byPlayerCount) return null;

  // Try exact player count first, then fall back to closest available
  let playerData = data.byPlayerCount[playerCount.toString()];

  if (!playerData || !playerData.probabilityMatrix) {
    // Try to find closest available player count
    const availableCounts = Object.keys(data.byPlayerCount).map(Number).sort((a, b) => a - b);
    const closest = availableCounts.reduce((prev, curr) =>
      Math.abs(curr - playerCount) < Math.abs(prev - playerCount) ? curr : prev
    );
    playerData = data.byPlayerCount[closest.toString()];
  }

  if (!playerData || !playerData.probabilityMatrix) return null;

  const matrix = playerData.probabilityMatrix;

  // Filter to entries where player has this hand type
  const relevantEntries = matrix.filter(e => e.playerHandType === playerHandType);

  if (thresholdHandType !== null) {
    // Sum probability of opponent having >= threshold hand type
    const threatEntries = relevantEntries.filter(e => e.opponentHandType >= thresholdHandType);
    const total = threatEntries.reduce((sum, e) => sum + e.probability, 0);
    // Cap at 100% - data may have rounding errors
    return Math.min(total, 100);
  }

  // Return full distribution
  const distribution = {};
  relevantEntries.forEach(e => {
    // Use only the highest probability if there are duplicates
    if (!distribution[e.opponentHandType] || e.probability > distribution[e.opponentHandType]) {
      distribution[e.opponentHandType] = e.probability;
    }
  });
  return distribution;
}

/**
 * Count basic outs for improvement
 * This is a simplified version - counts outs to common draws
 */
function countOuts(holeCards, boardCards, currentHandType, Card, RANKS, SUITS) {
  if (!holeCards || !boardCards) return { toImprove: 0, draws: [] };

  const allCards = [...holeCards, ...boardCards];
  const draws = [];
  let outsCount = 0;

  // Get suits in hole cards
  const holeSuits = {};
  holeCards.forEach(c => {
    holeSuits[c.suit] = (holeSuits[c.suit] || 0) + 1;
  });

  // Get suits on board
  const boardSuits = {};
  boardCards.forEach(c => {
    boardSuits[c.suit] = (boardSuits[c.suit] || 0) + 1;
  });

  // Check for flush draws (4 to a flush)
  for (const suit of SUITS) {
    const holeCount = holeSuits[suit] || 0;
    const boardCount = boardSuits[suit] || 0;

    // In Omaha, need 2 from hole + 3 from board for flush
    // Flush draw = 2 suited hole + 2 suited board
    if (holeCount >= 2 && boardCount >= 2 && boardCount < 3) {
      const totalSuited = 13 - holeCount - boardCount;
      const flushOuts = Math.min(totalSuited, 9); // Max 9 outs
      outsCount += flushOuts;
      draws.push(`Flush draw (${flushOuts} outs)`);
    }
  }

  // Check for straight draws (simplified - just check connectivity)
  const ranks = allCards.map(c => c.rank).sort((a, b) => a - b);
  const uniqueRanks = [...new Set(ranks)];

  // Count gaps to estimate straight potential
  if (uniqueRanks.length >= 4) {
    const span = uniqueRanks[uniqueRanks.length - 1] - uniqueRanks[0];
    if (span <= 5 && uniqueRanks.length === 4) {
      // Open-ended or gutshot
      if (span === 4) {
        outsCount += 8;
        draws.push('Open-ended straight draw (8 outs)');
      } else if (span === 3) {
        outsCount += 4;
        draws.push('Gutshot straight draw (4 outs)');
      }
    }
  }

  // Set improvement
  if (currentHandType <= 2) { // High card, pair, or two pair
    // Could improve to trips/set with board pairing
    draws.push('Board pair could give full house');
  }

  return {
    toImprove: outsCount,
    draws: draws
  };
}

/**
 * Get human-readable hand strength description
 */
function describeHandStrength(handRank, holeCards, boardCards) {
  const HAND_TYPE_NAMES = {
    0: 'High Card',
    1: 'Pair',
    2: 'Two Pair',
    3: 'Three of a Kind',
    4: 'Straight',
    5: 'Flush',
    6: 'Full House',
    7: 'Four of a Kind',
    8: 'Straight Flush',
    9: 'Royal Flush'
  };

  const typeName = HAND_TYPE_NAMES[handRank.type] || 'Unknown';
  const primaryRank = handRank.primaryRanks?.[0];

  // Rank names
  const RANK_NAMES = {
    14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 10: 'Ten',
    9: 'Nine', 8: 'Eight', 7: 'Seven', 6: 'Six', 5: 'Five',
    4: 'Four', 3: 'Three', 2: 'Two'
  };

  let description = typeName;
  if (primaryRank) {
    const rankName = RANK_NAMES[primaryRank] || primaryRank.toString();

    switch (handRank.type) {
      case 5: // Flush
        description = `${rankName}-high Flush`;
        break;
      case 4: // Straight
        description = `${rankName}-high Straight`;
        break;
      case 6: // Full House
        const secondRank = handRank.primaryRanks?.[1];
        const secondName = RANK_NAMES[secondRank] || secondRank?.toString();
        description = `${rankName}s full of ${secondName}s`;
        break;
      case 3: // Trips/Set
        description = `Set of ${rankName}s`;
        break;
      case 2: // Two Pair
        const lowPair = handRank.primaryRanks?.[1];
        const lowName = RANK_NAMES[lowPair] || lowPair?.toString();
        description = `${rankName}s and ${lowName}s`;
        break;
      case 1: // Pair
        description = `Pair of ${rankName}s`;
        break;
      default:
        if (primaryRank) description = `${rankName} high`;
    }
  }

  // Check if it's the nuts (simplified - just check if top of type)
  const isNuts = handRank.type >= 5 && primaryRank === 14; // Ace-high flush or better

  return {
    madeHand: typeName,
    handStrength: description,
    isNuts: isNuts
  };
}

/**
 * Generate threat warnings based on board and hand
 */
function generateThreats(boardTexture, handRank) {
  const threats = [];

  // Board-based threats
  if (boardTexture.flushDrawPossible && handRank.type !== 5) {
    threats.push('Flush possible - watch for suited holdings');
  }
  if (boardTexture.flushMade && handRank.type < 5) {
    threats.push('Flush already made on board - need the nuts');
  }
  if (boardTexture.straightDrawPossible && handRank.type < 4) {
    threats.push('Straight draws available');
  }
  if (boardTexture.wrapPossible) {
    threats.push('Wrap draws (13+ outs) are possible');
  }
  if (boardTexture.isPaired && handRank.type < 6) {
    threats.push('Paired board - full house possible');
  }

  // Hand-based threats
  if (handRank.type === 5 && handRank.primaryRanks[0] < 14) {
    threats.push('Non-nut flush - higher flush possible');
  }
  if (handRank.type === 4) {
    threats.push('Straights can be outdrawn by flushes or boats');
  }
  if (handRank.type === 3) {
    threats.push('Set vulnerable to straights and flushes');
  }

  return threats;
}

/**
 * Main API handler
 */
export default async function handler(req, res) {
  const startTime = Date.now();

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    // Load core modules
    const core = await loadCoreModules();
    if (!core) {
      return res.status(500).json({ error: 'Failed to load poker analysis modules' });
    }

    const { evaluator, analyzer, rules, cards } = core;
    const { Card, RANKS, SUITS } = cards;
    const { evaluateHand, findBestHand, evaluateBestHand } = evaluator;
    const { analyzeFlopTexture, describeFlopTexture, getFlopAdvice } = analyzer;
    const { createRules } = rules;

    // Parse request body
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Validate required fields
    const {
      gameVariant = 'omaha4',
      street = 'flop',
      holeCards,
      board,
      position = 'unknown',
      playersInHand = 3,
      potSize = 0,
      toCall = 0,
      stackSize = 0,
      villainActions = [],
      heroStyle = 'reg'
    } = body;

    // Validate input
    if (!holeCards || !Array.isArray(holeCards)) {
      return res.status(400).json({
        error: 'Missing required field: holeCards',
        example: { holeCards: ['As', 'Ks', 'Qs', 'Js'] }
      });
    }

    if (!board || !Array.isArray(board) || board.length < 3) {
      return res.status(400).json({
        error: 'Missing or invalid board (need at least 3 cards)',
        example: { board: ['Ts', '9s', '2h'] }
      });
    }

    // Validate game variant
    const validVariants = ['omaha4', 'omaha5', 'omaha6'];
    if (!validVariants.includes(gameVariant)) {
      return res.status(400).json({
        error: `Invalid gameVariant. Must be one of: ${validVariants.join(', ')}`
      });
    }

    // Parse cards
    let parsedHoleCards, parsedBoard;
    try {
      parsedHoleCards = parseCards(holeCards, Card);
      parsedBoard = parseCards(board, Card);
    } catch (e) {
      return res.status(400).json({
        error: `Invalid card notation: ${e.message}`,
        hint: 'Use format like "As" for Ace of spades, "Kh" for King of hearts'
      });
    }

    // Validate card counts
    const expectedHoleCards = parseInt(gameVariant.replace('omaha', ''));
    if (parsedHoleCards.length !== expectedHoleCards) {
      return res.status(400).json({
        error: `${gameVariant} requires ${expectedHoleCards} hole cards, got ${parsedHoleCards.length}`
      });
    }

    // Get game rules
    const gameRules = createRules(gameVariant);

    // === ANALYSIS ===

    // 1. Evaluate current hand
    const { hand: bestHand, rank: handRank } = evaluateBestHand(
      parsedHoleCards,
      parsedBoard,
      gameRules.generateValidHands.bind(gameRules)
    );

    // 2. Analyze board texture (flop only for now)
    let boardTexture = null;
    let textureDescription = null;
    let textureAdvice = null;

    if (parsedBoard.length >= 3) {
      const flopCards = parsedBoard.slice(0, 3);
      boardTexture = analyzeFlopTexture(flopCards);
      textureDescription = describeFlopTexture(boardTexture);
      textureAdvice = getFlopAdvice(boardTexture);
    }

    // 3. Count outs (needed for equity calculation)
    const outs = countOuts(parsedHoleCards, parsedBoard, handRank.type, Card, RANKS, SUITS);

    // 4. Phase 2: Estimate opponent range and calculate equity
    let equityResult = null;
    let opponentRange = null;

    try {
      // Parse villain actions into structured format
      const structuredActions = (villainActions || []).map((action, idx) => {
        if (typeof action === 'string') {
          // Simple string format: "raise", "call", "check"
          return { action: action.toLowerCase(), street: street, amount: 0 };
        }
        return action;
      });

      // Estimate opponent range based on position and actions
      opponentRange = estimateOpponentRange(
        'unknown',  // villain position (could be expanded)
        structuredActions,
        boardTexture,
        street,
        playersInHand,
        potSize
      );

      // Calculate equity vs estimated range
      equityResult = calculateEquity(
        handRank,
        opponentRange,
        outs,
        street,
        boardTexture
      );
    } catch (e) {
      console.error('Equity calculation error:', e);
      // Fall back to simple threat probability
    }

    // Fallback: Get threat probability from bundled data if equity calc failed
    const bundledData = loadBundledData(gameVariant);
    let threatProbability = null;

    if (!equityResult && bundledData) {
      const distribution = getThreatProbability(bundledData, handRank.type, playersInHand);
      if (distribution) {
        let betterHandProbability = 0;
        for (let oppType = handRank.type + 1; oppType <= 9; oppType++) {
          betterHandProbability += (distribution[oppType] || 0);
        }
        betterHandProbability = Math.min(betterHandProbability, 99.9);
        threatProbability = { opponentBetterHand: betterHandProbability };
      }
    }

    // 5. Calculate pot odds (if betting info provided)
    let potOdds = null;
    let potOddsPercent = 0;
    let impliedOddsCategory = 'moderate';

    if (toCall > 0 && potSize > 0) {
      potOddsPercent = (toCall / (potSize + toCall)) * 100;
      impliedOddsCategory = stackSize > potSize * 3 ? 'excellent' :
                            stackSize > potSize * 2 ? 'good' :
                            stackSize > potSize ? 'moderate' : 'poor';
      potOdds = {
        toCall: Math.round(potOddsPercent * 10) / 10,
        breakeven: Math.round(potOddsPercent * 10) / 10,
        impliedOdds: impliedOddsCategory
      };
    }

    // 6. Generate hand description (needed for action recommendation)
    const handDescription = describeHandStrength(handRank, parsedHoleCards, parsedBoard);

    // 7. Phase 3: Generate action recommendation
    let actionRecommendation = null;
    let betSizing = null;

    // Calculate SPR (Stack-to-Pot Ratio)
    const effectiveStack = stackSize > 0 ? stackSize : potSize * 10; // Default to deep if not provided
    const spr = potSize > 0 ? effectiveStack / potSize : 10;

    // Determine if facing a bet
    const facingBet = toCall > 0;

    // Get equity value for decision
    const equityValue = equityResult?.equity || 50;

    // Check if we have the nuts
    const isNutsHand = equityResult?.isNuts || handDescription.isNuts;

    try {
      // Call action recommender
      actionRecommendation = recommendAction({
        equity: equityValue,
        potOdds: facingBet ? potOddsPercent : 0,
        impliedOdds: impliedOddsCategory,
        handType: handRank.type,
        isNuts: isNutsHand,
        outs: outs,
        spr: spr,
        position: position,
        boardTexture: boardTexture,
        street: street,
        facingBet: facingBet,
        playersInHand: playersInHand,
        heroStyle: heroStyle
      });

      // If action is bet or raise, get sizing recommendation
      if (actionRecommendation && (actionRecommendation.action === 'bet' || actionRecommendation.action === 'raise')) {
        const sizingAction = actionRecommendation.action === 'bet' ? 'bet' : 'raise';

        betSizing = getSizingRecommendation({
          action: sizingAction,
          pot: potSize,
          facingBet: toCall,
          effectiveStack: effectiveStack,
          betType: actionRecommendation.betType || 'value',
          boardTexture: boardTexture,
          position: position,
          street: street,
          equity: equityValue,
          isNuts: isNutsHand,
          heroStyle: heroStyle
        });
      }
    } catch (e) {
      console.error('Action recommendation error:', e);
      // Continue without recommendation
    }

    // 8. Generate threats
    const threats = boardTexture ? generateThreats(boardTexture, handRank) : [];

    // Build response
    const latencyMs = Date.now() - startTime;

    const response = {
      analysis: {
        currentHand: handDescription,
        boardTexture: boardTexture ? {
          category: boardTexture.category,
          dangerLevel: boardTexture.nutDangerLevel,
          description: textureDescription,
          details: {
            suitedness: boardTexture.suitedness,
            connectivity: boardTexture.connectivity,
            height: boardTexture.height,
            isPaired: boardTexture.isPaired
          }
        } : null,
        equity: equityResult ? {
          estimated: `${equityResult.equity}%`,
          vsRange: equityResult.vsRange || 'unknown range',
          confidence: equityResult.confidence || 'medium',
          breakdown: equityResult.breakdown,
          drawEquity: equityResult.drawEquity > 0 ? `${equityResult.drawEquity}%` : null,
          isNuts: equityResult.isNuts,
          method: equityResult.method
        } : (threatProbability ? {
          opponentBetterHand: `${threatProbability.opponentBetterHand.toFixed(1)}%`,
          confidence: 'low',
          note: 'Fallback to pre-computed data'
        } : null),
        outs: outs,
        potOdds: potOdds,
        threats: threats
      },
      advice: textureAdvice,
      recommendation: actionRecommendation ? {
        action: actionRecommendation.action,
        confidence: Math.min(100, Math.round(actionRecommendation.confidence * 100)) + '%',
        betType: actionRecommendation.betType || null,
        reasoning: actionRecommendation.reasoning,
        alternatives: actionRecommendation.alternatives,
        warnings: actionRecommendation.warnings,
        sizing: betSizing ? {
          optimal: betSizing.sizing.optimal,
          range: {
            min: betSizing.sizing.min,
            max: betSizing.sizing.max
          },
          percentPot: betSizing.sizing.percentPot + '%',
          explanation: betSizing.explanation,
          commitment: betSizing.commitment
        } : null,
        metadata: actionRecommendation.metadata
      } : null,
      opponentRange: opponentRange ? {
        description: opponentRange.description,
        nutBias: opponentRange.nutBias,
        drawHeavy: opponentRange.drawHeavy
      } : null,
      dataSource: {
        handEval: 'real-time',
        boardTexture: 'real-time',
        equity: equityResult ? 'phase2-heuristic' : (bundledData ? 'tier1-bundled' : 'unavailable'),
        rangeEstimation: opponentRange ? 'phase2-heuristic' : 'unavailable',
        actionRecommendation: actionRecommendation ? 'phase3-decision-tree' : 'unavailable',
        betSizing: betSizing ? 'phase3-spr-based' : 'unavailable'
      },
      input: {
        gameVariant,
        street,
        holeCards,
        board,
        position,
        playersInHand,
        heroStyle
      },
      latencyMs
    };

    // Phase 5: Log recommendation for analysis
    if (actionRecommendation) {
      try {
        logRecommendation({
          action: actionRecommendation.action,
          confidence: actionRecommendation.confidence,
          betType: actionRecommendation.betType,
          gameVariant,
          street,
          position,
          playersInHand,
          handType: handRank.type,
          equity: equityValue,
          potOdds: potOddsPercent,
          spr,
          isNuts: isNutsHand,
          heroStyle,
          latencyMs
        });
      } catch (logError) {
        // Don't fail the request if logging fails
        console.error('Recommendation logging error:', logError);
      }
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Play Advisor error:', error);
    return res.status(500).json({
      error: 'Analysis failed',
      message: error.message,
      latencyMs: Date.now() - startTime
    });
  }
}
