import { Card, Rank, Suit, groupByRank, groupBySuit, sortByRankDesc } from '../cards/Card.js';
import { HandType, HandRank } from './HandRank.js';

/**
 * Evaluates a 5-card poker hand and returns its rank.
 * This is the core algorithm shared across all game variants.
 */
export function evaluateHand(cards: Card[]): HandRank {
  if (cards.length !== 5) {
    throw new Error(`Hand must contain exactly 5 cards, got ${cards.length}`);
  }

  const sorted = sortByRankDesc(cards);
  const rankGroups = groupByRank(cards);
  const suitGroups = groupBySuit(cards);

  // Check for flush (all same suit)
  const isFlush = suitGroups.size === 1;

  // Check for straight
  const straightHighCard = getStraightHighCard(sorted);
  const isStraight = straightHighCard !== null;

  // Count rank group sizes for pair/trips/quads detection
  const groupSizes = [...rankGroups.values()]
    .map(g => ({ rank: g[0].rank, count: g.length }))
    .sort((a, b) => {
      // Sort by count descending, then by rank descending
      if (b.count !== a.count) return b.count - a.count;
      return b.rank - a.rank;
    });

  // Determine hand type and build score
  if (isFlush && isStraight) {
    // Royal Flush or Straight Flush
    const type = straightHighCard === 14 ? HandType.ROYAL_FLUSH : HandType.STRAIGHT_FLUSH;
    return {
      type,
      score: buildScore(type, [straightHighCard!]),
      primaryRanks: [straightHighCard!],
      kickers: []
    };
  }

  if (groupSizes[0].count === 4) {
    // Four of a Kind
    const quadRank = groupSizes[0].rank;
    const kicker = groupSizes[1].rank;
    return {
      type: HandType.FOUR_OF_A_KIND,
      score: buildScore(HandType.FOUR_OF_A_KIND, [quadRank], [kicker]),
      primaryRanks: [quadRank],
      kickers: [kicker]
    };
  }

  if (groupSizes[0].count === 3 && groupSizes[1].count === 2) {
    // Full House
    const tripRank = groupSizes[0].rank;
    const pairRank = groupSizes[1].rank;
    return {
      type: HandType.FULL_HOUSE,
      score: buildScore(HandType.FULL_HOUSE, [tripRank, pairRank]),
      primaryRanks: [tripRank, pairRank],
      kickers: []
    };
  }

  if (isFlush) {
    // Flush (already checked for straight flush above)
    const ranks = sorted.map(c => c.rank);
    return {
      type: HandType.FLUSH,
      score: buildScore(HandType.FLUSH, ranks),
      primaryRanks: ranks,
      kickers: []
    };
  }

  if (isStraight) {
    // Straight (already checked for straight flush above)
    return {
      type: HandType.STRAIGHT,
      score: buildScore(HandType.STRAIGHT, [straightHighCard!]),
      primaryRanks: [straightHighCard!],
      kickers: []
    };
  }

  if (groupSizes[0].count === 3) {
    // Three of a Kind (trips/set)
    const tripRank = groupSizes[0].rank;
    const kickers = groupSizes.slice(1).map(g => g.rank);
    return {
      type: HandType.THREE_OF_A_KIND,
      score: buildScore(HandType.THREE_OF_A_KIND, [tripRank], kickers),
      primaryRanks: [tripRank],
      kickers
    };
  }

  if (groupSizes[0].count === 2 && groupSizes[1].count === 2) {
    // Two Pair
    const highPair = Math.max(groupSizes[0].rank, groupSizes[1].rank);
    const lowPair = Math.min(groupSizes[0].rank, groupSizes[1].rank);
    const kicker = groupSizes[2].rank;
    return {
      type: HandType.TWO_PAIR,
      score: buildScore(HandType.TWO_PAIR, [highPair, lowPair], [kicker]),
      primaryRanks: [highPair, lowPair],
      kickers: [kicker]
    };
  }

  if (groupSizes[0].count === 2) {
    // One Pair
    const pairRank = groupSizes[0].rank;
    const kickers = groupSizes.slice(1).map(g => g.rank);
    return {
      type: HandType.PAIR,
      score: buildScore(HandType.PAIR, [pairRank], kickers),
      primaryRanks: [pairRank],
      kickers
    };
  }

  // High Card
  const ranks = sorted.map(c => c.rank);
  return {
    type: HandType.HIGH_CARD,
    score: buildScore(HandType.HIGH_CARD, ranks),
    primaryRanks: [ranks[0]],
    kickers: ranks.slice(1)
  };
}

/**
 * Check if cards form a straight and return the high card rank.
 * Returns null if not a straight.
 * Handles the wheel (A-2-3-4-5) where Ace is low.
 */
function getStraightHighCard(sortedDesc: Card[]): Rank | null {
  const ranks = sortedDesc.map(c => c.rank);

  // Check for regular straight (descending consecutive)
  let isRegularStraight = true;
  for (let i = 0; i < 4; i++) {
    if (ranks[i] - ranks[i + 1] !== 1) {
      isRegularStraight = false;
      break;
    }
  }
  if (isRegularStraight) {
    return ranks[0] as Rank;
  }

  // Check for wheel (A-5-4-3-2)
  // In sortedDesc: [14, 5, 4, 3, 2]
  if (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
    return 5 as Rank; // Wheel straight's high card is 5
  }

  return null;
}

/**
 * Build a numeric score for comparison.
 *
 * Score format (using multipliers to ensure proper ordering):
 * handType * 1e10 + rank1 * 1e8 + rank2 * 1e6 + rank3 * 1e4 + rank4 * 1e2 + rank5
 *
 * This ensures any higher hand type beats any lower hand type,
 * and within the same type, the higher primary ranks win.
 */
function buildScore(type: HandType, primary: number[], kickers: number[] = []): number {
  const allRanks = [...primary, ...kickers];

  let score = type * 1e10;
  let multiplier = 1e8;

  for (const rank of allRanks) {
    score += rank * multiplier;
    multiplier /= 100;
  }

  return score;
}

/**
 * Find the best 5-card hand from a set of possible hands.
 */
export function findBestHand(hands: Card[][]): { hand: Card[], rank: HandRank } {
  if (hands.length === 0) {
    throw new Error('No hands to evaluate');
  }

  let bestHand = hands[0];
  let bestRank = evaluateHand(hands[0]);

  for (let i = 1; i < hands.length; i++) {
    const rank = evaluateHand(hands[i]);
    if (rank.score > bestRank.score) {
      bestHand = hands[i];
      bestRank = rank;
    }
  }

  return { hand: bestHand, rank: bestRank };
}

/**
 * Evaluate a player's best hand given hole cards and board, using game rules.
 */
export function evaluateBestHand(
  holeCards: Card[],
  boardCards: Card[],
  generateValidHands: (hole: Card[], board: Card[]) => Card[][]
): { hand: Card[], rank: HandRank } {
  const validHands = generateValidHands(holeCards, boardCards);
  return findBestHand(validHands);
}
