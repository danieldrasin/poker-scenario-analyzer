/**
 * Vercel Serverless Function for running poker simulations
 */

// Simple Monte Carlo simulation for poker hands
// This is a lightweight version for serverless - full version is in packages/core

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['h', 'd', 'c', 's'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function rankValue(rank) {
  return RANKS.indexOf(rank);
}

// Simplified hand evaluation (returns hand type index 0-8)
function evaluateHand(holeCards, board) {
  const allCards = [...holeCards, ...board];
  const ranks = allCards.map(c => rankValue(c.rank)).sort((a, b) => b - a);
  const suits = allCards.map(c => c.suit);

  // Count ranks and suits
  const rankCounts = {};
  const suitCounts = {};
  for (const card of allCards) {
    rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  }

  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const hasFlush = Object.values(suitCounts).some(c => c >= 5);

  // Check for straight
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
  let hasStraight = false;
  for (let i = 0; i <= uniqueRanks.length - 5; i++) {
    if (uniqueRanks[i] - uniqueRanks[i + 4] === 4) {
      hasStraight = true;
      break;
    }
  }
  // Wheel straight (A-2-3-4-5)
  if (uniqueRanks.includes(12) && uniqueRanks.includes(0) &&
      uniqueRanks.includes(1) && uniqueRanks.includes(2) && uniqueRanks.includes(3)) {
    hasStraight = true;
  }

  // Determine hand type
  if (hasFlush && hasStraight) return 8; // Straight flush (simplified)
  if (counts[0] === 4) return 7; // Quads
  if (counts[0] === 3 && counts[1] >= 2) return 6; // Full house
  if (hasFlush) return 5; // Flush
  if (hasStraight) return 4; // Straight
  if (counts[0] === 3) return 3; // Three of a kind
  if (counts[0] === 2 && counts[1] === 2) return 2; // Two pair
  if (counts[0] === 2) return 1; // Pair
  return 0; // High card
}

function runSimulation(config) {
  const { gameVariant = 'omaha4', playerCount = 6, iterations = 10000 } = config;

  const cardsPerPlayer = gameVariant === 'holdem' ? 2 :
                         gameVariant === 'omaha5' ? 5 :
                         gameVariant === 'omaha6' ? 6 : 4;

  const handTypeNames = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind',
                         'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];

  // Initialize counters
  const handTypeCounts = new Array(9).fill(0);
  const handTypeWins = new Array(9).fill(0);
  const vsMatrix = Array(9).fill(null).map(() => Array(9).fill(0));
  const vsMatrixWins = Array(9).fill(null).map(() => Array(9).fill(0));
  let heroWins = 0;

  const startTime = Date.now();

  for (let i = 0; i < iterations; i++) {
    const deck = shuffle(createDeck());
    let cardIndex = 0;

    // Deal hole cards to all players
    const playerHands = [];
    for (let p = 0; p < playerCount; p++) {
      const hand = deck.slice(cardIndex, cardIndex + cardsPerPlayer);
      playerHands.push(hand);
      cardIndex += cardsPerPlayer;
    }

    // Deal board (5 cards)
    const board = deck.slice(cardIndex, cardIndex + 5);

    // Evaluate all hands
    const evaluations = playerHands.map(hand => evaluateHand(hand, board));

    // Hero is player 0
    const heroHandType = evaluations[0];
    handTypeCounts[heroHandType]++;

    // Find winner (highest hand type, simplified)
    const maxEval = Math.max(...evaluations);
    const heroWon = evaluations[0] === maxEval &&
                    evaluations.filter(e => e === maxEval).length === 1;

    if (heroWon) {
      heroWins++;
      handTypeWins[heroHandType]++;
    }

    // Track matchups vs opponent hand types
    for (let o = 1; o < playerCount; o++) {
      const oppHandType = evaluations[o];
      vsMatrix[heroHandType][oppHandType]++;
      if (evaluations[0] > evaluations[o]) {
        vsMatrixWins[heroHandType][oppHandType]++;
      }
    }
  }

  const duration = Date.now() - startTime;

  // Build result object - format must match what app.js expects
  const statistics = {
    // Client expects 'handTypeDistribution' with 'handType' index
    handTypeDistribution: handTypeNames.map((name, i) => ({
      handType: i,
      name,
      count: handTypeCounts[i],
      percentage: parseFloat((handTypeCounts[i] / iterations * 100).toFixed(2)),
      wins: handTypeWins[i],
      winRate: handTypeCounts[i] > 0 ? parseFloat((handTypeWins[i] / handTypeCounts[i] * 100).toFixed(2)) : 0
    })),
    overallWinRate: parseFloat((heroWins / iterations * 100).toFixed(2)),
    // Client expects 'probabilityMatrix'
    probabilityMatrix: vsMatrix.map((row, i) =>
      row.map((count, j) => ({
        heroHand: handTypeNames[i],
        oppHand: handTypeNames[j],
        count,
        wins: vsMatrixWins[i][j],
        winRate: count > 0 ? parseFloat((vsMatrixWins[i][j] / count * 100).toFixed(2)) : 0
      }))
    )
  };

  // Client expects response wrapped in 'result'
  return {
    result: {
      metadata: {
        id: `sim_${Date.now()}`,
        config: { gameVariant, playerCount, iterations },
        createdAt: new Date().toISOString(),
        durationMs: duration
      },
      statistics
    }
  };
}

export default function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { gameVariant = 'omaha4', playerCount = 6, iterations = 10000 } = req.body || {};

    // Limit iterations for serverless (prevent timeout)
    const maxIterations = Math.min(iterations, 50000);

    const result = runSimulation({
      gameVariant,
      playerCount,
      iterations: maxIterations
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Simulation error:', error);
    return res.status(500).json({
      error: 'Simulation failed',
      details: error.message
    });
  }
}
