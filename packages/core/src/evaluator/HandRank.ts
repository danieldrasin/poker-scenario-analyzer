/**
 * Hand ranking categories in poker (ordered worst to best)
 */
export enum HandType {
  HIGH_CARD = 0,
  PAIR = 1,
  TWO_PAIR = 2,
  THREE_OF_A_KIND = 3,  // "Set" or "Trips"
  STRAIGHT = 4,
  FLUSH = 5,
  FULL_HOUSE = 6,
  FOUR_OF_A_KIND = 7,   // "Quads"
  STRAIGHT_FLUSH = 8,
  ROYAL_FLUSH = 9       // Special case of straight flush
}

/**
 * Short codes for hand types (matches original Smalltalk output)
 */
export const HAND_TYPE_CODES: Record<HandType, string> = {
  [HandType.HIGH_CARD]: 'HC',
  [HandType.PAIR]: '1P',
  [HandType.TWO_PAIR]: '2P',
  [HandType.THREE_OF_A_KIND]: '3C',
  [HandType.STRAIGHT]: 'ST',
  [HandType.FLUSH]: 'FL',
  [HandType.FULL_HOUSE]: 'FH',
  [HandType.FOUR_OF_A_KIND]: '4C',
  [HandType.STRAIGHT_FLUSH]: 'SF',
  [HandType.ROYAL_FLUSH]: 'RF'
};

/**
 * Human-readable names for hand types
 */
export const HAND_TYPE_NAMES: Record<HandType, string> = {
  [HandType.HIGH_CARD]: 'High Card',
  [HandType.PAIR]: 'Pair',
  [HandType.TWO_PAIR]: 'Two Pair',
  [HandType.THREE_OF_A_KIND]: 'Three of a Kind',
  [HandType.STRAIGHT]: 'Straight',
  [HandType.FLUSH]: 'Flush',
  [HandType.FULL_HOUSE]: 'Full House',
  [HandType.FOUR_OF_A_KIND]: 'Four of a Kind',
  [HandType.STRAIGHT_FLUSH]: 'Straight Flush',
  [HandType.ROYAL_FLUSH]: 'Royal Flush'
};

/**
 * Represents the evaluated result of a 5-card poker hand.
 * Contains both the hand type and a numeric score for comparison.
 *
 * Score encoding:
 * - Base score = handType * 10000000000 (10 billion) to ensure type ordering
 * - Primary ranks encoded in subsequent digits
 * - Kickers encoded in lower digits
 *
 * This ensures that any flush beats any straight, etc., while still
 * allowing tie-breaking within the same hand type.
 */
export interface HandRank {
  /** The category of hand */
  type: HandType;

  /**
   * Numeric score for comparison. Higher is better.
   * Two hands can be compared by score alone.
   */
  score: number;

  /** The primary ranks that make up the hand (e.g., [K, K] for a pair of kings) */
  primaryRanks: number[];

  /** Kicker ranks (remaining cards for tie-breaking) */
  kickers: number[];
}

/**
 * Compare two HandRanks
 * Returns: negative if a < b, positive if a > b, 0 if equal
 */
export function compareHandRanks(a: HandRank, b: HandRank): number {
  return a.score - b.score;
}

/**
 * Get the hand type from a code like 'HC', '1P', 'FL'
 */
export function handTypeFromCode(code: string): HandType | undefined {
  const entries = Object.entries(HAND_TYPE_CODES);
  const found = entries.find(([_, c]) => c === code);
  return found ? parseInt(found[0]) as HandType : undefined;
}

/**
 * Get code from hand type
 */
export function handTypeToCode(type: HandType): string {
  return HAND_TYPE_CODES[type];
}
