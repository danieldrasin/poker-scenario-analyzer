import { describe, it, expect } from 'vitest';

const C = (rank, suit) => ({ rank, suit });

describe('evaluate5Card', () => {
  const eval5 = globalThis.evaluate5Card;

  describe('hand categories', () => {
    it('detects high card', () => {
      const hand = [C('A','s'), C('K','h'), C('9','d'), C('7','c'), C('2','s')];
      const result = eval5(hand);
      expect(result.handRank).toBe(0);
      expect(result.name).toBe('High Card');
    });

    it('detects one pair', () => {
      const hand = [C('K','s'), C('K','h'), C('9','d'), C('7','c'), C('2','s')];
      const result = eval5(hand);
      expect(result.handRank).toBe(1);
      expect(result.name).toBe('Pair');
    });

    it('detects two pair', () => {
      const hand = [C('K','s'), C('K','h'), C('9','d'), C('9','c'), C('2','s')];
      const result = eval5(hand);
      expect(result.handRank).toBe(2);
      expect(result.name).toBe('Two Pair');
    });

    it('detects trips', () => {
      const hand = [C('K','s'), C('K','h'), C('K','d'), C('7','c'), C('2','s')];
      const result = eval5(hand);
      expect(result.handRank).toBe(3);
      expect(result.name).toBe('Trips');
    });

    it('detects straight', () => {
      const hand = [C('9','s'), C('8','h'), C('7','d'), C('6','c'), C('5','s')];
      const result = eval5(hand);
      expect(result.handRank).toBe(4);
      expect(result.name).toBe('Straight');
    });

    it('detects flush', () => {
      const hand = [C('A','s'), C('J','s'), C('9','s'), C('6','s'), C('2','s')];
      const result = eval5(hand);
      expect(result.handRank).toBe(5);
      expect(result.name).toBe('Flush');
    });

    it('detects full house', () => {
      const hand = [C('K','s'), C('K','h'), C('K','d'), C('7','c'), C('7','s')];
      const result = eval5(hand);
      expect(result.handRank).toBe(6);
      expect(result.name).toBe('Full House');
    });

    it('detects quads', () => {
      const hand = [C('K','s'), C('K','h'), C('K','d'), C('K','c'), C('2','s')];
      const result = eval5(hand);
      expect(result.handRank).toBe(7);
      expect(result.name).toBe('Quads');
    });

    it('detects straight flush', () => {
      const hand = [C('9','s'), C('8','s'), C('7','s'), C('6','s'), C('5','s')];
      const result = eval5(hand);
      expect(result.handRank).toBe(8);
      expect(result.name).toBe('Straight Flush');
    });
  });

  describe('edge cases', () => {
    it('detects wheel straight (A-2-3-4-5)', () => {
      const hand = [C('A','s'), C('2','h'), C('3','d'), C('4','c'), C('5','s')];
      const result = eval5(hand);
      expect(result.handRank).toBe(4);
      expect(result.name).toBe('Straight');
      expect(result.high).toBe(3); // 5 is the high card of a wheel (rv('5')=3)
    });

    it('detects ace-high straight (T-J-Q-K-A)', () => {
      const hand = [C('A','s'), C('K','h'), C('Q','d'), C('J','c'), C('T','s')];
      const result = eval5(hand);
      expect(result.handRank).toBe(4);
      expect(result.name).toBe('Straight');
      expect(result.high).toBe(12); // Ace high
    });

    it('detects wheel straight flush (A-2-3-4-5 suited)', () => {
      const hand = [C('A','s'), C('2','s'), C('3','s'), C('4','s'), C('5','s')];
      const result = eval5(hand);
      expect(result.handRank).toBe(8);
      expect(result.name).toBe('Straight Flush');
      expect(result.high).toBe(3); // 5 is high card
    });

    it('detects royal flush (T-J-Q-K-A suited)', () => {
      const hand = [C('A','s'), C('K','s'), C('Q','s'), C('J','s'), C('T','s')];
      const result = eval5(hand);
      expect(result.handRank).toBe(8);
      expect(result.name).toBe('Straight Flush');
      expect(result.high).toBe(12); // Ace high
    });

    it('ace-high flush beats king-high flush', () => {
      const aceHigh = eval5([C('A','s'), C('J','s'), C('9','s'), C('6','s'), C('2','s')]);
      const kingHigh = eval5([C('K','s'), C('J','s'), C('9','s'), C('6','s'), C('2','s')]);
      expect(aceHigh.handRank).toBe(kingHigh.handRank);
      expect(aceHigh.high).toBeGreaterThan(kingHigh.high);
    });

    it('paired board does not trigger false straight', () => {
      const hand = [C('K','s'), C('K','h'), C('Q','d'), C('J','c'), C('9','s')];
      const result = eval5(hand);
      expect(result.handRank).toBe(1); // Pair, not straight
    });

    it('three of a kind beats two pair', () => {
      const trips = eval5([C('7','s'), C('7','h'), C('7','d'), C('A','c'), C('K','s')]);
      const twoPair = eval5([C('A','s'), C('A','h'), C('K','d'), C('K','c'), C('Q','s')]);
      expect(trips.handRank).toBeGreaterThan(twoPair.handRank);
    });
  });

  describe('ranking order', () => {
    it('ranks all 9 categories correctly', () => {
      const hands = [
        { cards: [C('7','s'), C('5','h'), C('3','d'), C('2','c'), C('9','h')], rank: 0 }, // High Card
        { cards: [C('A','s'), C('A','h'), C('3','d'), C('7','c'), C('9','s')], rank: 1 }, // Pair
        { cards: [C('A','s'), C('A','h'), C('K','d'), C('K','c'), C('9','s')], rank: 2 }, // Two Pair
        { cards: [C('A','s'), C('A','h'), C('A','d'), C('7','c'), C('9','s')], rank: 3 }, // Trips
        { cards: [C('5','s'), C('6','h'), C('7','d'), C('8','c'), C('9','s')], rank: 4 }, // Straight
        { cards: [C('A','s'), C('T','s'), C('7','s'), C('4','s'), C('2','s')], rank: 5 }, // Flush
        { cards: [C('A','s'), C('A','h'), C('A','d'), C('K','c'), C('K','s')], rank: 6 }, // Full House
        { cards: [C('A','s'), C('A','h'), C('A','d'), C('A','c'), C('K','s')], rank: 7 }, // Quads
        { cards: [C('9','h'), C('8','h'), C('7','h'), C('6','h'), C('5','h')], rank: 8 }, // Straight Flush
      ];
      for (const h of hands) {
        expect(eval5(h.cards).handRank).toBe(h.rank);
      }
      // Verify strict ordering
      for (let i = 1; i < hands.length; i++) {
        expect(eval5(hands[i].cards).handRank).toBeGreaterThan(eval5(hands[i-1].cards).handRank);
      }
    });
  });
});
