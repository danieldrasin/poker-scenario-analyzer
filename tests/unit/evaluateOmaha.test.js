import { describe, it, expect } from 'vitest';

const C = (rank, suit) => ({ rank, suit });

describe('evaluateOmaha', () => {
  const evalOmaha = globalThis.evaluateOmaha;

  describe('2+3 constraint', () => {
    it('uses exactly 2 hole cards and 3 board cards', () => {
      // Hole: A♠ A♥ K♠ Q♥ — Board: A♦ 7♠ 2♣
      // Best hand uses AA from hole + A72 from board => Trips (AAA)
      const hole = [C('A','s'), C('A','h'), C('K','s'), C('Q','h')];
      const board = [C('A','d'), C('7','s'), C('2','c')];
      const result = evalOmaha(hole, board);
      expect(result.handRank).toBe(3); // Trips
    });

    it('cannot use 3 hole cards even if they make a better hand', () => {
      // Hole has three aces but Omaha only allows 2
      const hole = [C('A','s'), C('A','h'), C('A','d'), C('2','c')];
      const board = [C('K','s'), C('Q','h'), C('J','d')];
      const result = evalOmaha(hole, board);
      // With 2 aces from hole + 3 from board = pair of aces (not trips)
      expect(result.handRank).toBe(1); // Pair (AA)
    });

    it('cannot use 4 board cards even if they make a better hand', () => {
      // Board has 4 spades + 1 heart. Hole has 2 spades + 2 non-spades.
      // With exactly 2 hole + 3 board, player can get A♠ + one hole + 3 board spades = flush
      const hole = [C('A','s'), C('K','s'), C('Q','d'), C('J','c')];
      const board = [C('2','s'), C('5','s'), C('8','s'), C('T','s'), C('3','h')];
      const result = evalOmaha(hole, board);
      // A♠ or K♠ from hole + 3 spades from board = flush
      expect(result.handRank).toBe(5); // Flush
    });

    it('returns null when board has fewer than 3 cards', () => {
      const hole = [C('A','s'), C('A','h'), C('K','s'), C('Q','h')];
      expect(evalOmaha(hole, [C('K','d'), C('7','s')])).toBeNull();
      expect(evalOmaha(hole, [C('K','d')])).toBeNull();
      expect(evalOmaha(hole, [])).toBeNull();
    });
  });

  describe('finds the best hand', () => {
    it('finds straight flush when available', () => {
      const hole = [C('9','h'), C('8','h'), C('2','s'), C('3','c')];
      const board = [C('7','h'), C('6','h'), C('5','h')];
      const result = evalOmaha(hole, board);
      expect(result.handRank).toBe(8); // Straight Flush 5-9
    });

    it('finds full house over flush', () => {
      const hole = [C('K','s'), C('K','h'), C('Q','s'), C('J','s')];
      const board = [C('K','d'), C('5','s'), C('5','h')];
      const result = evalOmaha(hole, board);
      expect(result.handRank).toBe(6); // Full House KKK55
    });

    it('correctly evaluates nuts on a paired board', () => {
      const hole = [C('A','s'), C('A','h'), C('K','s'), C('Q','h')];
      const board = [C('A','d'), C('A','c'), C('K','d')];
      const result = evalOmaha(hole, board);
      expect(result.handRank).toBe(7); // Quads AAAA
    });
  });

  describe('5-card and partial boards', () => {
    it('evaluates with a 3-card flop', () => {
      const hole = [C('A','s'), C('K','s'), C('Q','h'), C('J','h')];
      const board = [C('T','s'), C('9','s'), C('2','h')];
      const result = evalOmaha(hole, board);
      expect(result).not.toBeNull();
      expect(result.handRank).toBeGreaterThanOrEqual(0);
    });

    it('evaluates with 4-card board (turn)', () => {
      const hole = [C('A','s'), C('K','s'), C('Q','h'), C('J','h')];
      const board = [C('T','d'), C('9','c'), C('2','h'), C('8','s')];
      const result = evalOmaha(hole, board);
      expect(result).not.toBeNull();
    });

    it('evaluates with 5-card board (river)', () => {
      const hole = [C('A','s'), C('K','s'), C('Q','h'), C('J','h')];
      const board = [C('T','d'), C('9','c'), C('2','h'), C('8','s'), C('3','d')];
      const result = evalOmaha(hole, board);
      expect(result).not.toBeNull();
    });
  });

  describe('with 5 and 6 hole cards (Big O / PLO-6)', () => {
    it('handles 5 hole cards', () => {
      const hole = [C('A','s'), C('A','h'), C('K','s'), C('Q','h'), C('J','d')];
      const board = [C('A','d'), C('7','s'), C('2','c')];
      const result = evalOmaha(hole, board);
      expect(result.handRank).toBe(3); // Trips
    });

    it('handles 6 hole cards', () => {
      const hole = [C('A','s'), C('A','h'), C('K','s'), C('Q','h'), C('J','d'), C('T','c')];
      const board = [C('A','d'), C('K','d'), C('K','c')];
      const result = evalOmaha(hole, board);
      expect(result.handRank).toBe(6); // Full House AAAKK
    });
  });
});

describe('isNutHand', () => {
  const isNut = globalThis.isNutHand;

  it('returns true for flush or better', () => {
    const hole = [C('A','s'), C('K','s'), C('Q','h'), C('J','h')];
    const board = [C('T','s'), C('9','s'), C('2','s')];
    expect(isNut(hole, board)).toBe(true);
  });

  it('returns false for less than flush', () => {
    const hole = [C('A','s'), C('K','h'), C('Q','d'), C('J','c')];
    const board = [C('T','s'), C('9','d'), C('2','h')];
    expect(isNut(hole, board)).toBe(false);
  });

  it('returns false with fewer than 3 board cards', () => {
    const hole = [C('A','s'), C('K','s'), C('Q','h'), C('J','h')];
    expect(isNut(hole, [C('T','s'), C('9','s')])).toBe(false);
    expect(isNut(hole, [])).toBe(false);
  });
});

describe('combinations', () => {
  const combos = globalThis.combinations;

  it('returns correct count for C(4,2)', () => {
    expect(combos([1,2,3,4], 2)).toHaveLength(6);
  });

  it('returns correct count for C(5,3)', () => {
    expect(combos([1,2,3,4,5], 3)).toHaveLength(10);
  });

  it('returns [[]] for k=0', () => {
    expect(combos([1,2,3], 0)).toEqual([[]]);
  });

  it('returns [] when k > array length', () => {
    expect(combos([1,2], 3)).toEqual([]);
  });

  it('each combination has exactly k elements', () => {
    const result = combos(['A','K','Q','J'], 2);
    for (const combo of result) {
      expect(combo).toHaveLength(2);
    }
  });
});
