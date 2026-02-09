/**
 * Flop Texture Classifier
 *
 * Classifies flops into strategic categories based on:
 * - Suitedness (monotone, two-tone, rainbow)
 * - Connectivity (connected, semi-connected, scattered)
 * - Pairedness (paired, unpaired)
 * - Height (broadway, middle, low)
 *
 * The 12 categories are designed around the key Omaha question:
 * "How likely is my 'good' hand to actually be best?"
 */

import { Card, Rank, Suit } from '../cards';

export type FlopSuitedness = 'monotone' | 'two-tone' | 'rainbow';
export type FlopConnectivity = 'connected' | 'semi-connected' | 'scattered';
export type FlopHeight = 'broadway' | 'middle' | 'low' | 'mixed';

export type FlopTextureCategory =
  | 'dry-rainbow'        // K♠ 7♦ 2♣ - No draws possible
  | 'dry-two-tone'       // K♠ 7♠ 2♣ - Only flush draw
  | 'paired-dry'         // K♠ K♦ 7♣ - Trips/boat territory
  | 'paired-wet'         // 8♠ 8♦ 9♣ - Paired + connected
  | 'low-connected'      // 5♣ 6♦ 7♠ - Straight draws, low cards
  | 'mid-connected'      // 7♠ 8♦ 9♣ - Many straight draws
  | 'broadway-connected' // J♠ Q♦ K♣ - High straight draws
  | 'monotone-low'       // 3♠ 7♠ 9♠ - Flush made, no ace possible
  | 'monotone-high'      // J♠ Q♠ K♠ - Flush made, ace possible
  | 'two-tone-connected' // 7♠ 8♠ 9♦ - Flush + straight draws
  | 'rainbow-connected'  // 8♦ 9♣ T♥ - Just straight draws
  | 'scattered-rainbow'; // 2♣ 7♦ J♠ - Minimal coordination

export interface FlopTextureAnalysis {
  category: FlopTextureCategory;
  suitedness: FlopSuitedness;
  connectivity: FlopConnectivity;
  height: FlopHeight;
  isPaired: boolean;

  // Derived metrics
  straightDrawPossible: boolean;
  flushDrawPossible: boolean;
  flushMade: boolean;
  nutDangerLevel: 'low' | 'medium' | 'high' | 'very-high' | 'extreme';

  // Specific draws available
  nutFlushDrawAvailable: boolean;  // Is the ace of the flush suit out there?
  wrapPossible: boolean;           // Can someone have a wrap (13+ out straight draw)?

  // Board cards info
  highCard: Rank;
  lowCard: Rank;
  gaps: number;  // Number of gaps between cards
}

/**
 * Analyze a flop (3 cards) and return its texture classification
 */
export function analyzeFlopTexture(flop: Card[]): FlopTextureAnalysis {
  if (flop.length !== 3) {
    throw new Error('Flop must be exactly 3 cards');
  }

  const suits = flop.map(c => c.suit);
  const ranks = flop.map(c => c.rank).sort((a, b) => a - b);

  const suitedness = analyzeSuitedness(suits);
  const connectivity = analyzeConnectivity(ranks);
  const height = analyzeHeight(ranks);
  const isPaired = hasPair(ranks);

  const category = classifyFlop(suitedness, connectivity, height, isPaired, ranks);

  const straightDrawPossible = canHaveStraightDraw(ranks);
  const flushDrawPossible = suitedness !== 'rainbow';
  const flushMade = suitedness === 'monotone';

  const gaps = calculateGaps(ranks);
  const wrapPossible = gaps <= 2 && !isPaired;

  // Nut flush draw available if the board doesn't have the ace of the flush suit
  const nutFlushDrawAvailable = flushDrawPossible && !hasAceOfFlushSuit(flop);

  const nutDangerLevel = calculateNutDanger(category, flushMade, wrapPossible, isPaired);

  return {
    category,
    suitedness,
    connectivity,
    height,
    isPaired,
    straightDrawPossible,
    flushDrawPossible,
    flushMade,
    nutDangerLevel,
    nutFlushDrawAvailable,
    wrapPossible,
    highCard: Math.max(...ranks) as Rank,
    lowCard: Math.min(...ranks) as Rank,
    gaps
  };
}

function analyzeSuitedness(suits: Suit[]): FlopSuitedness {
  const suitCounts = new Map<Suit, number>();
  suits.forEach(s => suitCounts.set(s, (suitCounts.get(s) || 0) + 1));

  const maxCount = Math.max(...suitCounts.values());

  if (maxCount === 3) return 'monotone';
  if (maxCount === 2) return 'two-tone';
  return 'rainbow';
}

function analyzeConnectivity(sortedRanks: Rank[]): FlopConnectivity {
  const gaps = calculateGaps(sortedRanks);

  // Connected: all cards within 4 ranks (can make straight with 2 cards)
  // e.g., 7-8-9 (gaps=0), 7-8-T (gaps=1), 7-9-T (gaps=2)
  if (gaps <= 2) return 'connected';

  // Semi-connected: some straight potential but not ideal
  // e.g., 7-8-J (gaps=3), 6-8-T (gaps=3)
  if (gaps <= 4) return 'semi-connected';

  // Scattered: minimal straight potential
  return 'scattered';
}

function calculateGaps(sortedRanks: Rank[]): number {
  let totalGaps = 0;
  for (let i = 1; i < sortedRanks.length; i++) {
    totalGaps += (sortedRanks[i] - sortedRanks[i-1] - 1);
  }
  return totalGaps;
}

function analyzeHeight(sortedRanks: Rank[]): FlopHeight {
  const high = sortedRanks[2];
  const low = sortedRanks[0];

  // Broadway: T or higher (10-14)
  // Middle: 6-9
  // Low: 2-5

  const isHighBroadway = high >= 10;
  const isLowLow = low <= 5;
  const isLowMiddle = low >= 6 && low <= 9;

  if (isHighBroadway && !isLowLow) {
    if (sortedRanks[0] >= 10) return 'broadway';  // All broadway
    return 'mixed';
  }

  if (high <= 9) {
    if (low <= 5) return 'low';
    return 'middle';
  }

  return 'mixed';
}

function hasPair(sortedRanks: Rank[]): boolean {
  return sortedRanks[0] === sortedRanks[1] || sortedRanks[1] === sortedRanks[2];
}

function canHaveStraightDraw(sortedRanks: Rank[]): boolean {
  // A straight draw is possible if someone can have 4 cards to a straight
  // This is true unless the board is very scattered
  const gaps = calculateGaps(sortedRanks);
  return gaps <= 6;  // Pretty generous - most boards allow some straight draw
}

function hasAceOfFlushSuit(flop: Card[]): boolean {
  const suitCounts = new Map<Suit, number>();
  flop.forEach(c => suitCounts.set(c.suit, (suitCounts.get(c.suit) || 0) + 1));

  // Find the flush suit (most common)
  let flushSuit: Suit | null = null;
  for (const [suit, count] of suitCounts) {
    if (count >= 2) {
      flushSuit = suit;
      break;
    }
  }

  if (!flushSuit) return false;

  // Check if ace of that suit is on the board
  return flop.some(c => c.suit === flushSuit && c.rank === 14);
}

function classifyFlop(
  suitedness: FlopSuitedness,
  connectivity: FlopConnectivity,
  height: FlopHeight,
  isPaired: boolean,
  sortedRanks: Rank[]
): FlopTextureCategory {

  // Monotone boards
  if (suitedness === 'monotone') {
    const hasHighCard = sortedRanks[2] >= 10;
    return hasHighCard ? 'monotone-high' : 'monotone-low';
  }

  // Paired boards
  if (isPaired) {
    if (connectivity === 'connected' || connectivity === 'semi-connected') {
      return 'paired-wet';
    }
    return 'paired-dry';
  }

  // Connected boards
  if (connectivity === 'connected') {
    if (suitedness === 'two-tone') {
      return 'two-tone-connected';
    }
    // Rainbow connected
    if (height === 'broadway') return 'broadway-connected';
    if (height === 'low') return 'low-connected';
    return 'mid-connected';
  }

  // Semi-connected or scattered
  if (connectivity === 'semi-connected') {
    if (suitedness === 'two-tone') return 'two-tone-connected';  // Still dangerous
    return 'rainbow-connected';
  }

  // Scattered
  if (suitedness === 'two-tone') return 'dry-two-tone';
  return suitedness === 'rainbow' ? (connectivity === 'scattered' ? 'scattered-rainbow' : 'dry-rainbow') : 'dry-rainbow';
}

function calculateNutDanger(
  category: FlopTextureCategory,
  flushMade: boolean,
  wrapPossible: boolean,
  isPaired: boolean
): 'low' | 'medium' | 'high' | 'very-high' | 'extreme' {

  // Extreme: Monotone boards - must have nut flush or fold usually
  if (flushMade) return 'extreme';

  // Very High: Connected boards with flush draws
  if (category === 'two-tone-connected') return 'very-high';

  // High: Connected rainbow or paired wet
  if (category === 'mid-connected' || category === 'low-connected' || category === 'paired-wet') {
    return 'high';
  }

  // Medium: Broadway connected, dry two-tone, or paired dry
  if (category === 'broadway-connected' || category === 'dry-two-tone' || category === 'paired-dry') {
    return 'medium';
  }

  // Low: Dry rainbow, scattered
  return 'low';
}

/**
 * Get a human-readable description of the flop texture
 */
export function describeFlopTexture(analysis: FlopTextureAnalysis): string {
  const descriptions: Record<FlopTextureCategory, string> = {
    'dry-rainbow': 'Dry rainbow - minimal draws, made hands dominate',
    'dry-two-tone': 'Dry with flush draw - watch for flush, otherwise safe',
    'paired-dry': 'Paired board - trips/boats matter, others beware',
    'paired-wet': 'Paired and connected - boats and straights both possible',
    'low-connected': 'Low connected - many straight draws, low nut potential',
    'mid-connected': 'Mid connected - wrap city, many draws live',
    'broadway-connected': 'Broadway connected - high straight draws, nut straights',
    'monotone-low': 'Monotone low - flush made, nut flush or fold',
    'monotone-high': 'Monotone high - flush made, ace-high flush critical',
    'two-tone-connected': 'Two-tone connected - flush and straight draws everywhere',
    'rainbow-connected': 'Rainbow connected - straight draws only, no flush danger',
    'scattered-rainbow': 'Scattered rainbow - "nothing" texture, pairs/sets rule'
  };

  return descriptions[analysis.category];
}

/**
 * Get strategic advice for a flop texture
 */
export function getFlopAdvice(analysis: FlopTextureAnalysis): {
  madeHandAdvice: string;
  drawAdvice: string;
  overallDanger: string;
} {
  const advice: Record<FlopTextureCategory, { madeHandAdvice: string; drawAdvice: string; overallDanger: string }> = {
    'dry-rainbow': {
      madeHandAdvice: 'Top pair/set is strong. Value bet made hands.',
      drawAdvice: 'Few draws available. Gutshots have poor implied odds.',
      overallDanger: 'Low danger. Second-best hands can often continue.'
    },
    'dry-two-tone': {
      madeHandAdvice: 'Made hands vulnerable to flush. Bet to deny equity.',
      drawAdvice: 'Nut flush draw is valuable. Non-nut flush draws are risky.',
      overallDanger: 'Medium danger. Flush possibility keeps pots smaller.'
    },
    'paired-dry': {
      madeHandAdvice: 'Without trips, proceed carefully. Many give up here.',
      drawAdvice: 'Straight/flush draws may be good if uncontested.',
      overallDanger: 'Medium danger. Hard to have strong hands.'
    },
    'paired-wet': {
      madeHandAdvice: 'Need boats or better. Trips can be vulnerable.',
      drawAdvice: 'Combo draws are powerful. Need nut potential.',
      overallDanger: 'Very high danger. Multiple strong hand types possible.'
    },
    'low-connected': {
      madeHandAdvice: 'Sets are strong but need to fade straight cards.',
      drawAdvice: 'Nut straight draws good. Avoid low-end straights.',
      overallDanger: 'High danger. Low straights lose to high straights.'
    },
    'mid-connected': {
      madeHandAdvice: 'Even top set is vulnerable. Need redraws.',
      drawAdvice: 'Wraps are extremely powerful. 13+ out draws are favorites.',
      overallDanger: 'Very high danger. Wraps dominate, sets are marginal.'
    },
    'broadway-connected': {
      madeHandAdvice: 'Sets still need caution. Broadway straights possible.',
      drawAdvice: 'Nut straight draws are premium. Broadway wraps strong.',
      overallDanger: 'High danger. But nut straights are more achievable.'
    },
    'monotone-low': {
      madeHandAdvice: 'Non-flush hands are nearly dead. Even sets fold.',
      drawAdvice: 'Nut flush draw only. Second nut flush is a disaster.',
      overallDanger: 'EXTREME danger. Nut flush or get out.'
    },
    'monotone-high': {
      madeHandAdvice: 'Without nut flush, most hands must fold.',
      drawAdvice: 'Ace-high flush draw is mandatory. Others very risky.',
      overallDanger: 'EXTREME danger. Ace of suit is everything.'
    },
    'two-tone-connected': {
      madeHandAdvice: 'Sets need flush redraws. Two pair is weak.',
      drawAdvice: 'Combo draws (flush + straight) are monsters.',
      overallDanger: 'Very high danger. Multiple draw types create action.'
    },
    'rainbow-connected': {
      madeHandAdvice: 'Sets are stronger without flush threat. Still watch straights.',
      drawAdvice: 'Wrap draws are strong. No flush outs means fewer total outs.',
      overallDanger: 'High danger. Straight-focused but no flush overlay.'
    },
    'scattered-rainbow': {
      madeHandAdvice: 'Top pair/set dominate. Classic made-hand board.',
      drawAdvice: 'Very few draws. Runner-runner only for most.',
      overallDanger: 'Low danger. Whoever flopped it, flopped it.'
    }
  };

  return advice[analysis.category];
}
