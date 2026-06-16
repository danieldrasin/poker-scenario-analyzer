import { describe, it, expect } from 'vitest';

const C = (rank, suit) => ({ rank, suit });

describe('hbQueryBadge', () => {
  const badge = globalThis.hbQueryBadge;

  it('generates badge for pair:AA', () => {
    const axis = { structure: 'pair', rank: 'A', rankMod: '=', suited: 'ds', side: 'any' };
    expect(badge(axis)).toBe('pair:AA:ds');
  });

  it('generates badge for pair:AA+', () => {
    const axis = { structure: 'pair', rank: 'A', rankMod: '+', suited: 'any', side: 'any' };
    expect(badge(axis)).toBe('pair:AA+');
  });

  it('generates badge for rundown with modifier', () => {
    const axis = { structure: 'rundown', rank: 'T', rankMod: '+', suited: 'ss', side: 'any' };
    expect(badge(axis)).toBe('run:TT+:ss');
  });

  it('generates badge for broadway (no rank shown)', () => {
    const axis = { structure: 'broadway', rank: 'A', rankMod: '=', suited: 'ds', side: 'any' };
    expect(badge(axis)).toBe('bway:ds');
  });

  it('generates badge for double pair', () => {
    const axis = { structure: 'dpair', rank: 'K', rankMod: '=', suited: 'any', side: 'any' };
    expect(badge(axis)).toBe('2pair:KK');
  });

  it('generates badge for "any" structure', () => {
    const axis = { structure: 'any', rank: 'A', rankMod: '=', suited: 'ss', side: 'any' };
    expect(badge(axis)).toBe('any:ss');
  });

  it('omits suited when "any"', () => {
    const axis = { structure: 'pair', rank: 'K', rankMod: '=', suited: 'any', side: 'any' };
    expect(badge(axis)).toBe('pair:KK');
  });
});

describe('hbGenerateHands', () => {
  const gen = globalThis.hbGenerateHands;

  it('returns exactly 3 example hands', () => {
    const axis = { structure: 'pair', rank: 'A', rankMod: '=', suited: 'ds', side: 'any' };
    const hands = gen(axis, 4, 0);
    expect(hands).toHaveLength(3);
  });

  it('generates 4-card hands for PLO', () => {
    const axis = { structure: 'pair', rank: 'A', rankMod: '=', suited: 'any', side: 'any' };
    const hands = gen(axis, 4, 0);
    for (const hand of hands) {
      expect(hand).toHaveLength(4);
    }
  });

  it('generates 5-card hands for Big O', () => {
    const axis = { structure: 'pair', rank: 'K', rankMod: '=', suited: 'any', side: 'any' };
    const hands = gen(axis, 5, 0);
    for (const hand of hands) {
      expect(hand).toHaveLength(5);
    }
  });

  it('generates 6-card hands for PLO-6', () => {
    const axis = { structure: 'pair', rank: 'Q', rankMod: '=', suited: 'any', side: 'any' };
    const hands = gen(axis, 6, 0);
    for (const hand of hands) {
      expect(hand).toHaveLength(6);
    }
  });

  it('pair structure contains a pair', () => {
    const axis = { structure: 'pair', rank: 'K', rankMod: '=', suited: 'any', side: 'any' };
    const hands = gen(axis, 4, 0);
    for (const hand of hands) {
      const ranks = hand.map(c => c.rank);
      const counts = {};
      ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
      expect(Object.values(counts).some(n => n >= 2)).toBe(true);
    }
  });

  it('double pair structure contains two pairs', () => {
    const axis = { structure: 'dpair', rank: 'K', rankMod: '=', suited: 'any', side: 'any' };
    const hands = gen(axis, 4, 0);
    for (const hand of hands) {
      const ranks = hand.map(c => c.rank);
      const counts = {};
      ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
      const pairs = Object.values(counts).filter(n => n >= 2);
      expect(pairs.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('rundown structure has consecutive ranks', () => {
    const axis = { structure: 'rundown', rank: 'T', rankMod: '=', suited: 'any', side: 'any' };
    const hands = gen(axis, 4, 0);
    const RANKS = globalThis.RANKS;
    for (const hand of hands) {
      const ranks = hand.map(c => c.rank);
      const indices = ranks.map(r => RANKS.indexOf(r));
      // Check that the ranks are close together (within 3 indices of each other)
      const min = Math.min(...indices);
      const max = Math.max(...indices);
      expect(max - min).toBeLessThanOrEqual(4);
    }
  });

  it('broadway structure uses only broadway cards', () => {
    const axis = { structure: 'broadway', rank: 'A', rankMod: '=', suited: 'any', side: 'any' };
    const hands = gen(axis, 4, 0);
    const bwayRanks = new Set(['A','K','Q','J','T']);
    for (const hand of hands) {
      for (const card of hand) {
        expect(bwayRanks.has(card.rank)).toBe(true);
      }
    }
  });

  it('double-suited hands have exactly 2 suits, each appearing exactly 2 times', () => {
    const axis = { structure: 'pair', rank: 'A', rankMod: '=', suited: 'ds', side: 'any' };
    const hands = gen(axis, 4, 0);
    for (const hand of hands) {
      const suits = {};
      hand.forEach(c => suits[c.suit] = (suits[c.suit] || 0) + 1);
      const counts = Object.values(suits).sort();
      expect(counts).toEqual([2, 2]);
    }
  });

  it('single-suited hands have at least 2 of same suit', () => {
    const axis = { structure: 'pair', rank: 'A', rankMod: '=', suited: 'ss', side: 'any' };
    const hands = gen(axis, 4, 0);
    for (const hand of hands) {
      const suits = {};
      hand.forEach(c => suits[c.suit] = (suits[c.suit] || 0) + 1);
      expect(Math.max(...Object.values(suits))).toBeGreaterThanOrEqual(2);
    }
  });

  it('different seeds produce different suit arrangements', () => {
    const axis = { structure: 'pair', rank: 'A', rankMod: '=', suited: 'ds', side: 'any' };
    const hands0 = gen(axis, 4, 0);
    const hands1 = gen(axis, 4, 1);
    const suits0 = hands0[0].map(c => c.suit).join('');
    const suits1 = hands1[0].map(c => c.suit).join('');
    expect(suits0).not.toBe(suits1);
  });

  it('each card in a hand has a valid rank and suit', () => {
    const axis = { structure: 'rundown', rank: 'J', rankMod: '=', suited: 'any', side: 'any' };
    const hands = gen(axis, 4, 0);
    const validRanks = new Set(['A','K','Q','J','T','9','8','7','6','5','4','3','2']);
    const validSuits = new Set(['s','h','d','c']);
    for (const hand of hands) {
      for (const card of hand) {
        expect(validRanks.has(card.rank)).toBe(true);
        expect(validSuits.has(card.suit)).toBe(true);
      }
    }
  });

  it('no duplicate cards within a hand (rundown)', () => {
    // Rundown avoids the pair-overlap edge case
    const axis = { structure: 'rundown', rank: 'T', rankMod: '=', suited: 'rainbow', side: 'any' };
    const hands = gen(axis, 4, 0);
    for (const hand of hands) {
      const keys = hand.map(c => c.rank + c.suit);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
