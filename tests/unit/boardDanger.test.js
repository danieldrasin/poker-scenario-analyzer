import { describe, it, expect } from 'vitest';

const C = (rank, suit) => ({ rank, suit });

describe('boardDanger', () => {
  const danger = globalThis.boardDanger;

  describe('returns none/low for safe boards', () => {
    it('returns no reasons for a dry rainbow board', () => {
      const board = [C('K','s'), C('7','h'), C('2','d')];
      const result = danger(board);
      expect(result.reasons).toHaveLength(0);
    });

    it('returns level "low" for no-reason board', () => {
      const board = [C('K','s'), C('7','h'), C('2','d')];
      expect(danger(board).level).toBe('low');
    });
  });

  describe('flush detection', () => {
    it('detects flush possible with 3 of same suit', () => {
      const board = [C('K','s'), C('9','s'), C('2','s')];
      const result = danger(board);
      expect(result.reasons).toContain('flush possible');
    });

    it('detects flush draw on 4-card board with 2 suited', () => {
      const board = [C('K','s'), C('9','s'), C('7','h'), C('2','d')];
      const result = danger(board);
      expect(result.reasons).toContain('flush draw');
    });

    it('does not flag flush draw on 3-card board with only 2 suited', () => {
      const board = [C('K','s'), C('9','s'), C('7','h')];
      const result = danger(board);
      expect(result.reasons).not.toContain('flush draw');
      expect(result.reasons).not.toContain('flush possible');
    });
  });

  describe('paired board detection', () => {
    it('detects paired board', () => {
      const board = [C('K','s'), C('K','h'), C('2','d')];
      const result = danger(board);
      expect(result.reasons).toContain('paired board');
    });

    it('detects trips on board as paired', () => {
      const board = [C('7','s'), C('7','h'), C('7','d')];
      const result = danger(board);
      expect(result.reasons).toContain('paired board');
    });
  });

  describe('straight detection', () => {
    it('detects straight possible with connected cards', () => {
      const board = [C('9','s'), C('8','h'), C('7','d')];
      const result = danger(board);
      expect(result.reasons).toContain('straight possible');
    });

    it('detects straight possible with gap of 4', () => {
      const board = [C('T','s'), C('8','h'), C('6','d')];
      const result = danger(board);
      expect(result.reasons).toContain('straight possible');
    });

    it('does not detect straight with wide gaps', () => {
      const board = [C('A','s'), C('7','h'), C('2','d')];
      const result = danger(board);
      expect(result.reasons).not.toContain('straight possible');
    });
  });

  describe('danger level', () => {
    it('returns medium with 1 reason', () => {
      const board = [C('K','s'), C('K','h'), C('2','d')]; // paired board only
      expect(danger(board).level).toBe('medium');
    });

    it('returns high with 2+ reasons', () => {
      const board = [C('9','s'), C('8','s'), C('7','s')]; // flush possible + straight possible
      const result = danger(board);
      expect(result.level).toBe('high');
      expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    });

    it('returns high for paired + flushy + straighty board', () => {
      const board = [C('9','s'), C('9','h'), C('8','s'), C('7','s'), C('6','h')];
      const result = danger(board);
      expect(result.level).toBe('high');
    });
  });

  describe('edge cases', () => {
    it('returns none for fewer than 3 cards', () => {
      expect(danger([C('A','s'), C('K','h')]).level).toBe('none');
      expect(danger([C('A','s')]).level).toBe('none');
      expect(danger([]).level).toBe('none');
    });

    it('handles 5-card board', () => {
      const board = [C('A','s'), C('K','s'), C('Q','s'), C('J','s'), C('T','s')];
      const result = danger(board);
      expect(result.level).toBe('high');
      expect(result.reasons).toContain('flush possible');
      expect(result.reasons).toContain('straight possible');
    });
  });
});
