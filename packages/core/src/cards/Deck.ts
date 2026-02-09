import { Card, RANKS, SUITS, Rank, Suit } from './Card.js';

/**
 * A standard 52-card deck with shuffle and deal operations.
 * Supports seeded random for reproducible simulations.
 */
export class Deck {
  private cards: Card[];
  private position: number = 0;
  private rng: () => number;

  private constructor(cards: Card[], rng: () => number) {
    this.cards = cards;
    this.rng = rng;
  }

  /** Create a new standard 52-card deck */
  static standard(seed?: number): Deck {
    const cards: Card[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push(Card.create(rank, suit));
      }
    }
    const rng = seed !== undefined ? seededRandom(seed) : Math.random;
    return new Deck(cards, rng);
  }

  /** Create deck from specific cards (for testing) */
  static fromCards(cards: Card[], seed?: number): Deck {
    const rng = seed !== undefined ? seededRandom(seed) : Math.random;
    return new Deck([...cards], rng);
  }

  /** Number of cards remaining in the deck */
  get remaining(): number {
    return this.cards.length - this.position;
  }

  /** Total cards in deck (including dealt) */
  get size(): number {
    return this.cards.length;
  }

  /** Shuffle the deck using Fisher-Yates algorithm */
  shuffle(): this {
    this.position = 0;
    const arr = this.cards;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return this;
  }

  /** Deal one card from the deck */
  deal(): Card {
    if (this.position >= this.cards.length) {
      throw new Error('No cards remaining in deck');
    }
    return this.cards[this.position++];
  }

  /** Deal multiple cards */
  dealMany(count: number): Card[] {
    const cards: Card[] = [];
    for (let i = 0; i < count; i++) {
      cards.push(this.deal());
    }
    return cards;
  }

  /** Burn a card (deal and discard) */
  burn(): Card {
    return this.deal();
  }

  /** Reset deck to full, keeping the same card order (call shuffle after) */
  reset(): this {
    this.position = 0;
    return this;
  }

  /** Remove specific cards from deck (for simulating known hands) */
  remove(cards: Card[]): this {
    const encodedToRemove = new Set(cards.map(c => c.encoded));
    this.cards = this.cards.filter(c => !encodedToRemove.has(c.encoded));
    this.position = 0;
    return this;
  }

  /** Clone the deck */
  clone(): Deck {
    const cloned = new Deck([...this.cards], this.rng);
    cloned.position = this.position;
    return cloned;
  }

  /** Get all remaining cards without dealing them */
  peekRemaining(): Card[] {
    return this.cards.slice(this.position);
  }
}

/**
 * Seeded random number generator (mulberry32)
 * Produces deterministic sequence for reproducible simulations
 */
function seededRandom(seed: number): () => number {
  return function() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
