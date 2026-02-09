/**
 * Card ranks: 2-14 where 11=Jack, 12=Queen, 13=King, 14=Ace
 */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

/**
 * Card suits
 */
export type Suit = 'h' | 'd' | 'c' | 's';

/**
 * String notation for a card, e.g., "Ah", "Kd", "7c"
 */
export type CardNotation = string;

export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export const SUITS: readonly Suit[] = ['h', 'd', 'c', 's'] as const;

const RANK_CHARS: Record<Rank, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A'
};

const CHAR_TO_RANK: Record<string, Rank> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  'j': 11, 'q': 12, 'k': 13, 'a': 14, 't': 10
};

const SUIT_NAMES: Record<Suit, string> = {
  'h': 'hearts', 'd': 'diamonds', 'c': 'clubs', 's': 'spades'
};

/**
 * Immutable representation of a playing card.
 * Uses a compact numeric encoding for efficient comparison and storage.
 */
export class Card {
  /** Compact encoding: rank in low bits, suit in high bits */
  private readonly _encoded: number;

  private constructor(encoded: number) {
    this._encoded = encoded;
  }

  /** Create a card from rank and suit */
  static create(rank: Rank, suit: Suit): Card {
    const suitIndex = SUITS.indexOf(suit);
    const encoded = (suitIndex << 4) | rank;
    return new Card(encoded);
  }

  /** Parse card from string notation like "Ah", "Kd", "7c" */
  static parse(notation: CardNotation): Card {
    if (notation.length < 2 || notation.length > 3) {
      throw new Error(`Invalid card notation: ${notation}`);
    }

    const suitChar = notation[notation.length - 1].toLowerCase() as Suit;
    const rankStr = notation.slice(0, -1);

    const rank = CHAR_TO_RANK[rankStr];
    if (rank === undefined) {
      throw new Error(`Invalid rank in notation: ${notation}`);
    }

    if (!SUITS.includes(suitChar)) {
      throw new Error(`Invalid suit in notation: ${notation}`);
    }

    return Card.create(rank, suitChar);
  }

  /** Parse multiple cards from space or comma separated string */
  static parseMany(notation: string): Card[] {
    return notation
      .split(/[\s,]+/)
      .filter(s => s.length > 0)
      .map(s => Card.parse(s));
  }

  /** Decode from compact numeric format */
  static fromEncoded(encoded: number): Card {
    return new Card(encoded);
  }

  get rank(): Rank {
    return (this._encoded & 0xF) as Rank;
  }

  get suit(): Suit {
    return SUITS[(this._encoded >> 4) & 0x3];
  }

  get encoded(): number {
    return this._encoded;
  }

  /** String representation like "Ah", "Kd" */
  toString(): CardNotation {
    return `${RANK_CHARS[this.rank]}${this.suit}`;
  }

  /** Human-readable format like "Ace of hearts" */
  toFullString(): string {
    const rankName = this.rank === 14 ? 'Ace' :
                     this.rank === 13 ? 'King' :
                     this.rank === 12 ? 'Queen' :
                     this.rank === 11 ? 'Jack' :
                     this.rank.toString();
    return `${rankName} of ${SUIT_NAMES[this.suit]}`;
  }

  /** Compare by rank only */
  compareRank(other: Card): number {
    return this.rank - other.rank;
  }

  /** Check if same card (rank and suit) */
  equals(other: Card): boolean {
    return this._encoded === other._encoded;
  }

  /** Check if same suit */
  isSameSuit(other: Card): boolean {
    return this.suit === other.suit;
  }

  /** Check if same rank */
  isSameRank(other: Card): boolean {
    return this.rank === other.rank;
  }

  /** Check if ranks are consecutive (handles A-2 wraparound for wheel) */
  isConsecutiveRank(other: Card, allowWheel: boolean = true): boolean {
    const diff = Math.abs(this.rank - other.rank);
    if (diff === 1) return true;
    // Ace-2 connection for wheel straights
    if (allowWheel && ((this.rank === 14 && other.rank === 2) || (this.rank === 2 && other.rank === 14))) {
      return true;
    }
    return false;
  }
}

/** Sort cards by rank (ascending) */
export function sortByRank(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => a.rank - b.rank);
}

/** Sort cards by rank (descending) */
export function sortByRankDesc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => b.rank - a.rank);
}

/** Group cards by rank */
export function groupByRank(cards: Card[]): Map<Rank, Card[]> {
  const groups = new Map<Rank, Card[]>();
  for (const card of cards) {
    const existing = groups.get(card.rank) || [];
    existing.push(card);
    groups.set(card.rank, existing);
  }
  return groups;
}

/** Group cards by suit */
export function groupBySuit(cards: Card[]): Map<Suit, Card[]> {
  const groups = new Map<Suit, Card[]>();
  for (const card of cards) {
    const existing = groups.get(card.suit) || [];
    existing.push(card);
    groups.set(card.suit, existing);
  }
  return groups;
}
