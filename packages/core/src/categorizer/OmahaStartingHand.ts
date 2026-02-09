import { Card, Rank, Suit, groupByRank, groupBySuit, sortByRankDesc } from '../cards/Card.js';

/**
 * Categories for Omaha starting hands.
 * These are common classifications used in Omaha strategy.
 */
export interface OmahaHandCategory {
  /** Primary category identifier */
  category: OmahaCategory;

  /** Human-readable description */
  description: string;

  /** Subcategories/properties that apply */
  properties: OmahaHandProperty[];

  /** Structured tags for querying */
  tags: string[];
}

export enum OmahaCategory {
  /** AAxx - Premium pairs with Aces */
  ACES = 'aces',

  /** KKxx, QQxx, JJxx - High pairs */
  HIGH_PAIRS = 'high_pairs',

  /** Lower pocket pairs */
  MEDIUM_PAIRS = 'medium_pairs',
  LOW_PAIRS = 'low_pairs',

  /** Double-paired hands (e.g., AAKK) */
  DOUBLE_PAIRED = 'double_paired',

  /** Rundown/connected cards (e.g., JT98, 8765) */
  RUNDOWN = 'rundown',

  /** Hands with 3+ cards to a straight */
  CONNECTED = 'connected',

  /** Double-suited hands */
  DOUBLE_SUITED = 'double_suited',

  /** Single-suited hands */
  SINGLE_SUITED = 'single_suited',

  /** Broadway cards (T+) */
  BROADWAY = 'broadway',

  /** Weak/uncoordinated hands */
  UNCOORDINATED = 'uncoordinated',

  /** Dangler - one card that doesn't work with others */
  DANGLER = 'dangler'
}

export enum OmahaHandProperty {
  /** Contains pocket Aces */
  HAS_ACES = 'has_aces',

  /** Contains pocket Kings */
  HAS_KINGS = 'has_kings',

  /** Has a pocket pair */
  HAS_PAIR = 'has_pair',

  /** Has two pocket pairs */
  HAS_TWO_PAIRS = 'has_two_pairs',

  /** Two cards of same suit (potential flush) */
  SINGLE_SUITED = 'single_suited',

  /** Two different suits with 2 cards each */
  DOUBLE_SUITED = 'double_suited',

  /** All four cards same suit (actually bad - reduces flush outs) */
  FOUR_SUITED = 'four_suited',

  /** Three cards same suit */
  THREE_SUITED = 'three_suited',

  /** Contains Ace-high flush draw */
  NUT_FLUSH_DRAW = 'nut_flush_draw',

  /** Four connected cards (wrap potential) */
  FOUR_CONNECTED = 'four_connected',

  /** Three connected cards */
  THREE_CONNECTED = 'three_connected',

  /** All Broadway cards (T, J, Q, K, A) */
  ALL_BROADWAY = 'all_broadway',

  /** Contains at least one Broadway card */
  HAS_BROADWAY = 'has_broadway',

  /** Gap in the rundown (e.g., JT8x) */
  HAS_GAP = 'has_gap'
}

/**
 * Categorize an Omaha starting hand
 */
export function categorizeOmahaHand(cards: Card[]): OmahaHandCategory {
  if (cards.length < 4) {
    throw new Error('Omaha hand must have at least 4 cards');
  }

  // Take first 4 cards if more provided
  const hand = cards.slice(0, 4);

  const sorted = sortByRankDesc(hand);
  const rankGroups = groupByRank(hand);
  const suitGroups = groupBySuit(hand);

  const properties: OmahaHandProperty[] = [];
  const tags: string[] = [];

  // Analyze pairs
  const pairs = [...rankGroups.values()].filter(g => g.length >= 2);
  const hasPair = pairs.length > 0;
  const hasTwoPairs = pairs.length >= 2;
  const hasAces = rankGroups.has(14) && (rankGroups.get(14)?.length ?? 0) >= 2;
  const hasKings = rankGroups.has(13) && (rankGroups.get(13)?.length ?? 0) >= 2;

  if (hasPair) properties.push(OmahaHandProperty.HAS_PAIR);
  if (hasTwoPairs) properties.push(OmahaHandProperty.HAS_TWO_PAIRS);
  if (hasAces) properties.push(OmahaHandProperty.HAS_ACES);
  if (hasKings) properties.push(OmahaHandProperty.HAS_KINGS);

  // Analyze suits
  const suitCounts = [...suitGroups.values()].map(g => g.length).sort((a, b) => b - a);

  if (suitCounts[0] === 4) {
    properties.push(OmahaHandProperty.FOUR_SUITED);
    tags.push('four-flush'); // Actually bad
  } else if (suitCounts[0] === 3) {
    properties.push(OmahaHandProperty.THREE_SUITED);
    properties.push(OmahaHandProperty.SINGLE_SUITED);
    tags.push('suited');
  } else if (suitCounts[0] === 2 && suitCounts[1] === 2) {
    properties.push(OmahaHandProperty.DOUBLE_SUITED);
    tags.push('double-suited');
  } else if (suitCounts[0] === 2) {
    properties.push(OmahaHandProperty.SINGLE_SUITED);
    tags.push('suited');
  }

  // Check for nut flush draw (has Ace in a suited combination)
  for (const [suit, cards] of suitGroups) {
    if (cards.length >= 2) {
      const hasAceInSuit = cards.some(c => c.rank === 14);
      if (hasAceInSuit) {
        properties.push(OmahaHandProperty.NUT_FLUSH_DRAW);
        tags.push('nut-flush-draw');
        break;
      }
    }
  }

  // Analyze connectivity (for straights)
  const ranks = sorted.map(c => c.rank);
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
  const connectivity = analyzeConnectivity(uniqueRanks);

  if (connectivity.fourConnected) {
    properties.push(OmahaHandProperty.FOUR_CONNECTED);
    tags.push('rundown');
  } else if (connectivity.threeConnected) {
    properties.push(OmahaHandProperty.THREE_CONNECTED);
    tags.push('connected');
  }

  if (connectivity.hasGap) {
    properties.push(OmahaHandProperty.HAS_GAP);
    tags.push('gapped');
  }

  // Analyze Broadway (T, J, Q, K, A)
  const broadwayCount = ranks.filter(r => r >= 10).length;
  if (broadwayCount === 4) {
    properties.push(OmahaHandProperty.ALL_BROADWAY);
    tags.push('all-broadway');
  } else if (broadwayCount > 0) {
    properties.push(OmahaHandProperty.HAS_BROADWAY);
    tags.push('broadway');
  }

  // Determine primary category
  const category = determinePrimaryCategory(properties, ranks, pairs);

  // Build description
  const description = buildDescription(category, properties, sorted);

  // Add rank-based tags
  if (hasAces) tags.push('AAxx');
  if (hasKings) tags.push('KKxx');
  if (hasTwoPairs && hasAces) tags.push('AA**');

  return {
    category,
    description,
    properties,
    tags
  };
}

function analyzeConnectivity(uniqueRanks: number[]): { fourConnected: boolean; threeConnected: boolean; hasGap: boolean } {
  if (uniqueRanks.length < 3) {
    return { fourConnected: false, threeConnected: false, hasGap: false };
  }

  // Check for consecutive cards
  let maxConsecutive = 1;
  let currentConsecutive = 1;
  let hasGap = false;

  for (let i = 0; i < uniqueRanks.length - 1; i++) {
    const diff = uniqueRanks[i] - uniqueRanks[i + 1];
    if (diff === 1) {
      currentConsecutive++;
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
    } else if (diff === 2) {
      // One-gap connection (still useful for straights)
      hasGap = true;
      currentConsecutive = 1;
    } else {
      currentConsecutive = 1;
    }
  }

  // Special case: A-2-3-4 wrap potential (Ace counts as low)
  if (uniqueRanks.includes(14)) {
    const lowRanks = uniqueRanks.filter(r => r <= 5);
    if (lowRanks.length >= 3) {
      maxConsecutive = Math.max(maxConsecutive, lowRanks.length + 1);
    }
  }

  return {
    fourConnected: maxConsecutive >= 4,
    threeConnected: maxConsecutive >= 3,
    hasGap
  };
}

function determinePrimaryCategory(
  properties: OmahaHandProperty[],
  ranks: number[],
  pairs: Card[][]
): OmahaCategory {
  const hasAces = properties.includes(OmahaHandProperty.HAS_ACES);
  const hasKings = properties.includes(OmahaHandProperty.HAS_KINGS);
  const hasTwoPairs = properties.includes(OmahaHandProperty.HAS_TWO_PAIRS);
  const hasFourConnected = properties.includes(OmahaHandProperty.FOUR_CONNECTED);
  const hasThreeConnected = properties.includes(OmahaHandProperty.THREE_CONNECTED);
  const isDoubleSuited = properties.includes(OmahaHandProperty.DOUBLE_SUITED);

  // Hierarchy of categories
  if (hasAces) return OmahaCategory.ACES;
  if (hasTwoPairs) return OmahaCategory.DOUBLE_PAIRED;
  if (hasKings) return OmahaCategory.HIGH_PAIRS;
  if (hasFourConnected) return OmahaCategory.RUNDOWN;
  if (isDoubleSuited) return OmahaCategory.DOUBLE_SUITED;

  // Check for other high pairs (QQ, JJ)
  const pairRanks = pairs.map(p => p[0].rank);
  if (pairRanks.some(r => r >= 11)) return OmahaCategory.HIGH_PAIRS;
  if (pairRanks.some(r => r >= 7)) return OmahaCategory.MEDIUM_PAIRS;
  if (pairRanks.length > 0) return OmahaCategory.LOW_PAIRS;

  if (hasThreeConnected) return OmahaCategory.CONNECTED;
  if (properties.includes(OmahaHandProperty.ALL_BROADWAY)) return OmahaCategory.BROADWAY;
  if (properties.includes(OmahaHandProperty.SINGLE_SUITED)) return OmahaCategory.SINGLE_SUITED;

  return OmahaCategory.UNCOORDINATED;
}

function buildDescription(category: OmahaCategory, properties: OmahaHandProperty[], cards: Card[]): string {
  const parts: string[] = [];

  // Primary descriptor based on category
  switch (category) {
    case OmahaCategory.ACES:
      parts.push('Aces');
      break;
    case OmahaCategory.HIGH_PAIRS:
      parts.push('High Pair');
      break;
    case OmahaCategory.MEDIUM_PAIRS:
      parts.push('Medium Pair');
      break;
    case OmahaCategory.LOW_PAIRS:
      parts.push('Low Pair');
      break;
    case OmahaCategory.DOUBLE_PAIRED:
      parts.push('Double Paired');
      break;
    case OmahaCategory.RUNDOWN:
      parts.push('Rundown');
      break;
    case OmahaCategory.CONNECTED:
      parts.push('Connected');
      break;
    default:
      parts.push('Other');
  }

  // Add suit modifier
  if (properties.includes(OmahaHandProperty.DOUBLE_SUITED)) {
    parts.push('Double-Suited');
  } else if (properties.includes(OmahaHandProperty.SINGLE_SUITED)) {
    parts.push('Suited');
  }

  // Add special properties
  if (properties.includes(OmahaHandProperty.NUT_FLUSH_DRAW)) {
    parts.push('(Nut Flush)');
  }

  return parts.join(' ');
}

/**
 * Get a simplified category string for grouping/filtering
 */
export function getSimplifiedCategory(category: OmahaHandCategory): string {
  const parts: string[] = [];

  // Main category
  parts.push(category.category);

  // Key modifiers
  if (category.properties.includes(OmahaHandProperty.DOUBLE_SUITED)) {
    parts.push('ds');
  } else if (category.properties.includes(OmahaHandProperty.SINGLE_SUITED)) {
    parts.push('s');
  }

  return parts.join('-');
}

// ============================================================================
// SCENARIO QUERY SYSTEM
// ============================================================================

/**
 * Query notation for selecting ranges of starting hands.
 *
 * Syntax examples:
 * - "pair:AA" - Exactly pocket aces
 * - "pair:TT+" - TT or better pairs
 * - "pair:TT-" - TT or worse pairs
 * - "pair:88-QQ" - Range from 88 to QQ
 * - "pair:AA:ds" - AA double-suited
 * - "pair:TT+:ds:conn" - TT+ double-suited with connected side cards
 * - "run:JT98+" - High rundown (JT98 or better)
 * - "run:any:ds" - Any rundown, double-suited
 * - "dpair:any" - Any double-paired hand
 * - "bway:ds" - Broadway double-suited
 */

export interface HandQuery {
  /** Primary structure type */
  structure: 'pair' | 'dpair' | 'run' | 'bway' | 'suited' | 'any';

  /** Rank specification for pairs/rundowns */
  rank?: {
    value: Rank;
    modifier: '=' | '+' | '-';
  };

  /** Rank range (alternative to modifier) */
  rankRange?: {
    low: Rank;
    high: Rank;
  };

  /** Suitedness requirement */
  suitedness?: 'ds' | 'ss' | 'r' | 'any';  // double-suited, single-suited, rainbow, any

  /** Side card connectivity */
  sideCards?: 'conn' | 'bway' | 'wheel' | 'any';

  /** Maximum gaps allowed in rundowns */
  maxGaps?: number;
}

/**
 * Parse a query string into a HandQuery object
 */
export function parseHandQuery(queryString: string): HandQuery {
  const parts = queryString.toLowerCase().split(':');

  const query: HandQuery = {
    structure: 'any'
  };

  // Parse structure
  const structureMap: Record<string, HandQuery['structure']> = {
    'pair': 'pair',
    'dpair': 'dpair',
    'run': 'run',
    'rundown': 'run',
    'bway': 'bway',
    'broadway': 'bway',
    'suited': 'suited',
    'any': 'any'
  };

  if (parts[0] && structureMap[parts[0]]) {
    query.structure = structureMap[parts[0]];
    parts.shift();
  }

  // Parse remaining parts
  for (const part of parts) {
    // Suitedness
    if (part === 'ds' || part === 'double-suited') {
      query.suitedness = 'ds';
    } else if (part === 'ss' || part === 'single-suited' || part === 's') {
      query.suitedness = 'ss';
    } else if (part === 'r' || part === 'rainbow') {
      query.suitedness = 'r';
    }
    // Side cards
    else if (part === 'conn' || part === 'connected') {
      query.sideCards = 'conn';
    } else if (part === 'bway' || part === 'broadway') {
      query.sideCards = 'bway';
    } else if (part === 'wheel') {
      query.sideCards = 'wheel';
    }
    // Rank specification
    else if (part.match(/^[akqjt2-9]+[+-]?$/i) || part.match(/^[akqjt2-9]+-[akqjt2-9]+$/i)) {
      const rankResult = parseRankSpec(part);
      if (rankResult.range) {
        query.rankRange = rankResult.range;
      } else if (rankResult.rank) {
        query.rank = rankResult.rank;
      }
    }
    // Gap specification
    else if (part.match(/^gap[0-2]$/)) {
      query.maxGaps = parseInt(part.charAt(3));
    }
  }

  return query;
}

function parseRankSpec(spec: string): {
  rank?: { value: Rank; modifier: '=' | '+' | '-' };
  range?: { low: Rank; high: Rank };
} {
  // Check for range (e.g., "88-QQ")
  const rangeMatch = spec.match(/^([akqjt2-9]+)-([akqjt2-9]+)$/i);
  if (rangeMatch) {
    return {
      range: {
        low: parseRankChar(rangeMatch[1]),
        high: parseRankChar(rangeMatch[2])
      }
    };
  }

  // Check for modifier (e.g., "TT+", "TT-", "TT")
  const modMatch = spec.match(/^([akqjt2-9]+)([+-]?)$/i);
  if (modMatch) {
    const rank = parseRankChar(modMatch[1]);
    const modifier = (modMatch[2] || '=') as '=' | '+' | '-';
    return {
      rank: { value: rank, modifier }
    };
  }

  return {};
}

function parseRankChar(input: string): Rank {
  // Take only first character (handles "AA", "TT", etc.)
  const char = input.charAt(0).toLowerCase();
  const rankMap: Record<string, Rank> = {
    'a': 14, 'k': 13, 'q': 12, 'j': 11, 't': 10,
    '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
  };
  return rankMap[char] || 2;
}

/**
 * Check if a hand matches a query
 */
export function matchesQuery(cards: Card[], query: HandQuery): boolean {
  const category = categorizeOmahaHand(cards);
  const sorted = sortByRankDesc(cards.slice(0, 4));
  const rankGroups = groupByRank(cards);
  const suitGroups = groupBySuit(cards);

  // Check suitedness
  if (query.suitedness) {
    const suitCounts = [...suitGroups.values()].map(g => g.length).sort((a, b) => b - a);
    const isDs = suitCounts[0] === 2 && suitCounts[1] === 2;
    const isSs = suitCounts[0] === 2 && !isDs;
    const isRainbow = suitCounts[0] === 1;

    if (query.suitedness === 'ds' && !isDs) return false;
    if (query.suitedness === 'ss' && !isSs) return false;
    if (query.suitedness === 'r' && !isRainbow) return false;
  }

  // Check structure
  switch (query.structure) {
    case 'pair': {
      // Must have exactly one pair
      const pairs = [...rankGroups.values()].filter(g => g.length >= 2);
      if (pairs.length !== 1) return false;

      // Check rank requirement
      const pairRank = pairs[0][0].rank;
      if (!matchesRankRequirement(pairRank, query)) return false;

      // Check side card requirements
      if (query.sideCards) {
        const sideCards = sorted.filter(c => c.rank !== pairRank);
        if (!matchesSideCardRequirement(sideCards, pairRank, query.sideCards)) return false;
      }

      return true;
    }

    case 'dpair': {
      // Must have two pairs
      const pairs = [...rankGroups.values()].filter(g => g.length >= 2);
      if (pairs.length < 2) return false;

      // Check high pair rank if specified
      if (query.rank || query.rankRange) {
        const highPairRank = Math.max(...pairs.map(p => p[0].rank)) as Rank;
        if (!matchesRankRequirement(highPairRank, query)) return false;
      }

      return true;
    }

    case 'run': {
      // Must be a rundown (4 connected cards)
      if (!category.properties.includes(OmahaHandProperty.FOUR_CONNECTED)) return false;

      // Check high card rank if specified
      if (query.rank || query.rankRange) {
        const highRank = sorted[0].rank;
        if (!matchesRankRequirement(highRank, query)) return false;
      }

      // Check gap requirement
      if (query.maxGaps !== undefined) {
        const ranks = sorted.map(c => c.rank);
        const gaps = calculateTotalGaps(ranks);
        if (gaps > query.maxGaps) return false;
      }

      return true;
    }

    case 'bway': {
      // All cards must be broadway (T+)
      if (!sorted.every(c => c.rank >= 10)) return false;
      return true;
    }

    case 'suited': {
      // Must have some suitedness (single or double)
      const hasSuit = category.properties.includes(OmahaHandProperty.SINGLE_SUITED) ||
                      category.properties.includes(OmahaHandProperty.DOUBLE_SUITED);
      return hasSuit;
    }

    case 'any':
      return true;
  }

  return true;
}

function matchesRankRequirement(rank: Rank, query: HandQuery): boolean {
  if (query.rankRange) {
    return rank >= query.rankRange.low && rank <= query.rankRange.high;
  }

  if (query.rank) {
    switch (query.rank.modifier) {
      case '=': return rank === query.rank.value;
      case '+': return rank >= query.rank.value;
      case '-': return rank <= query.rank.value;
    }
  }

  return true;  // No rank requirement
}

function matchesSideCardRequirement(
  sideCards: Card[],
  pairRank: Rank,
  requirement: 'conn' | 'bway' | 'wheel' | 'any'
): boolean {
  const sideRanks = sideCards.map(c => c.rank).sort((a, b) => b - a);

  switch (requirement) {
    case 'conn': {
      // Side cards should be connected to each other or to the pair
      // Check if they're within 4 ranks of the pair (wrap potential)
      const allRanks = [pairRank, ...sideRanks].sort((a, b) => b - a);
      const gaps = calculateTotalGaps(allRanks);
      return gaps <= 3;  // Allow some gaps for near-connectivity
    }

    case 'bway':
      return sideRanks.every(r => r >= 10);

    case 'wheel':
      return sideRanks.every(r => r <= 5 || r === 14);

    case 'any':
      return true;
  }

  return true;
}

function calculateTotalGaps(ranks: Rank[]): number {
  const sorted = [...ranks].sort((a, b) => b - a);
  let gaps = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    gaps += Math.max(0, sorted[i] - sorted[i + 1] - 1);
  }
  return gaps;
}

/**
 * Generate human-readable description of a query
 */
export function describeQuery(query: HandQuery): string {
  const parts: string[] = [];

  // Structure
  const structureNames: Record<string, string> = {
    'pair': 'Pair',
    'dpair': 'Double-Paired',
    'run': 'Rundown',
    'bway': 'Broadway',
    'suited': 'Suited',
    'any': 'Any'
  };
  parts.push(structureNames[query.structure] || 'Any');

  // Rank
  if (query.rankRange) {
    const low = rankToString(query.rankRange.low);
    const high = rankToString(query.rankRange.high);
    parts.push(`${low}-${high}`);
  } else if (query.rank) {
    const rankStr = rankToString(query.rank.value);
    const modifierStr = query.rank.modifier === '+' ? ' or better' :
                        query.rank.modifier === '-' ? ' or worse' : '';
    parts.push(rankStr + modifierStr);
  }

  // Suitedness
  const suitNames: Record<string, string> = {
    'ds': 'double-suited',
    'ss': 'single-suited',
    'r': 'rainbow'
  };
  if (query.suitedness && suitNames[query.suitedness]) {
    parts.push(suitNames[query.suitedness]);
  }

  // Side cards
  const sideNames: Record<string, string> = {
    'conn': 'with connected side cards',
    'bway': 'with broadway side cards',
    'wheel': 'with wheel cards'
  };
  if (query.sideCards && sideNames[query.sideCards]) {
    parts.push(sideNames[query.sideCards]);
  }

  return parts.join(' ');
}

function rankToString(rank: Rank): string {
  const rankChars: Record<number, string> = {
    14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: 'T',
    9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2'
  };
  return rankChars[rank] || String(rank);
}

/**
 * Pre-defined query presets for common hand categories
 */
export const QUERY_PRESETS: Record<string, { query: string; description: string }> = {
  'premium-aces': { query: 'pair:AA:ds', description: 'AAxx double-suited' },
  'aces-any': { query: 'pair:AA', description: 'Any AAxx' },
  'high-pairs-ds': { query: 'pair:TT+:ds', description: 'TT+ double-suited' },
  'high-pairs': { query: 'pair:TT+', description: 'TT+ any suits' },
  'medium-pairs': { query: 'pair:66-99', description: 'Medium pairs (66-99)' },
  'big-rundowns': { query: 'run:J+:ds', description: 'High rundowns double-suited' },
  'any-rundowns': { query: 'run:any', description: 'Any rundown' },
  'double-paired': { query: 'dpair:any', description: 'Any double-paired' },
  'broadway-ds': { query: 'bway:ds', description: 'All broadway double-suited' },
  'connected-ds': { query: 'pair:any:ds:conn', description: 'Paired + connected double-suited' }
};
