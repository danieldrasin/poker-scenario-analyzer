/**
 * Poker Hand Evaluator for Omaha variants
 *
 * This module implements proper card dealing and hand evaluation following
 * Omaha rules: must use exactly 2 hole cards + 3 board cards.
 *
 * Matches original Smalltalk implementation behavior.
 */

// Card representation: value 0-51
// rank = card % 13 (0=2, 1=3, ..., 12=Ace)
// suit = Math.floor(card / 13) (0=clubs, 1=diamonds, 2=hearts, 3=spades)

const HAND_TYPES = {
  HIGH_CARD: 0,
  ONE_PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8
};

const HAND_TYPE_NAMES = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind',
  'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'
];

/**
 * Create a fresh 52-card deck
 */
function createDeck() {
  const deck = [];
  for (let i = 0; i < 52; i++) {
    deck.push(i);
  }
  return deck;
}

/**
 * Fisher-Yates shuffle
 */
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Get rank (0-12) from card (0-51)
 */
function getRank(card) {
  return card % 13;
}

/**
 * Get suit (0-3) from card (0-51)
 */
function getSuit(card) {
  return Math.floor(card / 13);
}

/**
 * Generate all combinations of size k from array
 */
function combinations(arr, k) {
  const result = [];

  function combine(start, combo) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  }

  combine(0, []);
  return result;
}

/**
 * Check if 5 cards form a flush
 */
function isFlush(cards) {
  const suit = getSuit(cards[0]);
  return cards.every(c => getSuit(c) === suit);
}

/**
 * Check if 5 cards form a straight (returns high card rank, or -1 if not straight)
 * Handles A-2-3-4-5 wheel
 */
function getStraightHighCard(cards) {
  const ranks = cards.map(getRank).sort((a, b) => a - b);

  // Check for wheel (A-2-3-4-5)
  if (ranks[0] === 0 && ranks[1] === 1 && ranks[2] === 2 && ranks[3] === 3 && ranks[4] === 12) {
    return 3; // 5-high straight
  }

  // Check for regular straight
  for (let i = 1; i < 5; i++) {
    if (ranks[i] !== ranks[i-1] + 1) {
      return -1;
    }
  }
  return ranks[4]; // High card of straight
}

/**
 * Get rank counts for 5 cards
 * Returns object: { rank: count, ... }
 */
function getRankCounts(cards) {
  const counts = {};
  for (const card of cards) {
    const rank = getRank(card);
    counts[rank] = (counts[rank] || 0) + 1;
  }
  return counts;
}

/**
 * Evaluate a 5-card hand and return [handType, tiebreaker]
 * Tiebreaker is a comparable value for hands of the same type
 */
function evaluateHand(cards) {
  if (cards.length !== 5) {
    throw new Error('Must evaluate exactly 5 cards');
  }

  const counts = getRankCounts(cards);
  const countValues = Object.values(counts).sort((a, b) => b - a);
  const flush = isFlush(cards);
  const straightHigh = getStraightHighCard(cards);
  const straight = straightHigh >= 0;

  // Sort ranks by count (desc) then by rank (desc)
  const ranksByCount = Object.entries(counts)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return parseInt(b[0]) - parseInt(a[0]);
    })
    .map(e => parseInt(e[0]));

  // Straight flush
  if (flush && straight) {
    return [HAND_TYPES.STRAIGHT_FLUSH, straightHigh];
  }

  // Four of a kind
  if (countValues[0] === 4) {
    return [HAND_TYPES.FOUR_OF_A_KIND, ranksByCount[0] * 100 + ranksByCount[1]];
  }

  // Full house
  if (countValues[0] === 3 && countValues[1] === 2) {
    return [HAND_TYPES.FULL_HOUSE, ranksByCount[0] * 100 + ranksByCount[1]];
  }

  // Flush
  if (flush) {
    const ranks = cards.map(getRank).sort((a, b) => b - a);
    return [HAND_TYPES.FLUSH, ranks[0] * 10000 + ranks[1] * 1000 + ranks[2] * 100 + ranks[3] * 10 + ranks[4]];
  }

  // Straight
  if (straight) {
    return [HAND_TYPES.STRAIGHT, straightHigh];
  }

  // Three of a kind
  if (countValues[0] === 3) {
    return [HAND_TYPES.THREE_OF_A_KIND, ranksByCount[0] * 10000 + ranksByCount[1] * 100 + ranksByCount[2]];
  }

  // Two pair
  if (countValues[0] === 2 && countValues[1] === 2) {
    const pairs = ranksByCount.slice(0, 2).sort((a, b) => b - a);
    return [HAND_TYPES.TWO_PAIR, pairs[0] * 10000 + pairs[1] * 100 + ranksByCount[2]];
  }

  // One pair
  if (countValues[0] === 2) {
    return [HAND_TYPES.ONE_PAIR, ranksByCount[0] * 1000000 + ranksByCount[1] * 10000 + ranksByCount[2] * 100 + ranksByCount[3]];
  }

  // High card
  const ranks = cards.map(getRank).sort((a, b) => b - a);
  return [HAND_TYPES.HIGH_CARD, ranks[0] * 100000000 + ranks[1] * 1000000 + ranks[2] * 10000 + ranks[3] * 100 + ranks[4]];
}

/**
 * Evaluate the best Omaha hand using exactly 2 hole cards + 3 board cards
 * Returns [bestHandType, bestTiebreaker]
 */
function evaluateOmahaHand(holeCards, boardCards) {
  const holeCombos = combinations(holeCards, 2);
  const boardCombos = combinations(boardCards, 3);

  let bestType = -1;
  let bestTiebreaker = -1;

  for (const holeCombo of holeCombos) {
    for (const boardCombo of boardCombos) {
      const hand = [...holeCombo, ...boardCombo];
      const [handType, tiebreaker] = evaluateHand(hand);

      if (handType > bestType || (handType === bestType && tiebreaker > bestTiebreaker)) {
        bestType = handType;
        bestTiebreaker = tiebreaker;
      }
    }
  }

  return [bestType, bestTiebreaker];
}

/**
 * Deal and evaluate a complete hand for all players
 * Returns array of { handType, tiebreaker } for each player
 */
function dealAndEvaluate(playerCount, holeCardCount = 4) {
  const deck = shuffle(createDeck());
  let cardIndex = 0;

  // Deal hole cards to each player
  const playerHoleCards = [];
  for (let p = 0; p < playerCount; p++) {
    const holeCards = [];
    for (let c = 0; c < holeCardCount; c++) {
      holeCards.push(deck[cardIndex++]);
    }
    playerHoleCards.push(holeCards);
  }

  // Burn and deal board (following original Smalltalk: burn-3-burn-1-burn-1)
  cardIndex++; // burn
  const flop = [deck[cardIndex++], deck[cardIndex++], deck[cardIndex++]];
  cardIndex++; // burn
  const turn = deck[cardIndex++];
  cardIndex++; // burn
  const river = deck[cardIndex++];
  const board = [...flop, turn, river];

  // Evaluate each player's hand
  const results = [];
  for (let p = 0; p < playerCount; p++) {
    const [handType, tiebreaker] = evaluateOmahaHand(playerHoleCards[p], board);
    results.push({ handType, tiebreaker });
  }

  return results;
}

/**
 * Determine winner(s) from evaluated results
 * Returns indices of winning players (can be multiple for ties)
 */
function determineWinners(results) {
  let bestType = -1;
  let bestTiebreaker = -1;

  for (const { handType, tiebreaker } of results) {
    if (handType > bestType || (handType === bestType && tiebreaker > bestTiebreaker)) {
      bestType = handType;
      bestTiebreaker = tiebreaker;
    }
  }

  const winners = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].handType === bestType && results[i].tiebreaker === bestTiebreaker) {
      winners.push(i);
    }
  }

  return winners;
}

export {
  HAND_TYPES,
  HAND_TYPE_NAMES,
  createDeck,
  shuffle,
  getRank,
  getSuit,
  combinations,
  evaluateHand,
  evaluateOmahaHand,
  dealAndEvaluate,
  determineWinners
};
