import { Card } from '../cards/Card.js';
import { combinations } from '../utils/combinations.js';

/**
 * Game variant identifier
 */
export type GameVariant = 'holdem' | 'omaha4' | 'omaha5' | 'omaha6';

/**
 * Abstract interface for poker game rules.
 * Different games (Hold'em, Omaha variants) implement this differently.
 */
export interface GameRules {
  /** Unique identifier for this game variant */
  readonly variant: GameVariant;

  /** Human-readable name */
  readonly name: string;

  /** Number of hole cards dealt to each player */
  readonly holeCardCount: number;

  /** Number of community cards on the board */
  readonly boardCardCount: number;

  /** Number of board cards dealt at each street (e.g., [3, 1, 1] for flop/turn/river) */
  readonly boardStreets: readonly number[];

  /**
   * Generate all valid 5-card hands from hole cards and board.
   * This is THE key method that differs between game variants.
   */
  generateValidHands(holeCards: Card[], boardCards: Card[]): Card[][];

  /**
   * Count the number of valid hands without generating them (for performance estimation)
   */
  countValidHands(): number;
}

/**
 * Texas Hold'em rules:
 * - 2 hole cards
 * - Best 5 from any of the 7 cards (2 hole + 5 board)
 */
export class HoldemRules implements GameRules {
  readonly variant: GameVariant = 'holdem';
  readonly name = "Texas Hold'em";
  readonly holeCardCount = 2;
  readonly boardCardCount = 5;
  readonly boardStreets = [3, 1, 1] as const; // flop, turn, river

  generateValidHands(holeCards: Card[], boardCards: Card[]): Card[][] {
    // In Hold'em, you can use any 5 from the 7 available cards
    const allCards = [...holeCards, ...boardCards];
    return combinations(allCards, 5);
  }

  countValidHands(): number {
    // C(7, 5) = 21
    return 21;
  }
}

/**
 * Omaha rules (4, 5, or 6 card variants):
 * - 4/5/6 hole cards
 * - MUST use exactly 2 from hole + exactly 3 from board
 */
export class OmahaRules implements GameRules {
  readonly variant: GameVariant;
  readonly name: string;
  readonly holeCardCount: number;
  readonly boardCardCount = 5;
  readonly boardStreets = [3, 1, 1] as const;

  constructor(holeCards: 4 | 5 | 6 = 4) {
    this.holeCardCount = holeCards;
    this.variant = `omaha${holeCards}` as GameVariant;
    this.name = `Omaha ${holeCards}-Card`;
  }

  generateValidHands(holeCards: Card[], boardCards: Card[]): Card[][] {
    // Must use exactly 2 from hole cards
    const holeCombos = combinations(holeCards, 2);
    // Must use exactly 3 from board
    const boardCombos = combinations(boardCards, 3);

    const hands: Card[][] = [];
    for (const hole of holeCombos) {
      for (const board of boardCombos) {
        hands.push([...hole, ...board]);
      }
    }
    return hands;
  }

  countValidHands(): number {
    // C(holeCardCount, 2) * C(5, 3)
    // Omaha 4: C(4,2) * C(5,3) = 6 * 10 = 60
    // Omaha 5: C(5,2) * C(5,3) = 10 * 10 = 100
    // Omaha 6: C(6,2) * C(5,3) = 15 * 10 = 150
    const holeCombos = this.holeCardCount === 4 ? 6 :
                       this.holeCardCount === 5 ? 10 : 15;
    return holeCombos * 10;
  }
}

/**
 * Factory function to create rules for a given game variant
 */
export function createRules(variant: GameVariant): GameRules {
  switch (variant) {
    case 'holdem':
      return new HoldemRules();
    case 'omaha4':
      return new OmahaRules(4);
    case 'omaha5':
      return new OmahaRules(5);
    case 'omaha6':
      return new OmahaRules(6);
    default:
      throw new Error(`Unknown game variant: ${variant}`);
  }
}

/**
 * All supported game variants
 */
export const SUPPORTED_VARIANTS: readonly GameVariant[] = ['holdem', 'omaha4', 'omaha5', 'omaha6'];
