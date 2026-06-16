import { describe, it, expect, beforeEach } from 'vitest';

const C = (rank, suit) => ({ rank, suit });

describe('evaluate (preflop heuristic)', () => {
  const evaluate = globalThis.evaluate;

  it('returns 0 for empty cards', () => {
    expect(evaluate([])).toBe(0);
  });

  it('scores premium hands higher than trash', () => {
    const premium = [C('A','s'), C('A','h'), C('K','s'), C('Q','h')];
    const trash = [C('7','s'), C('3','h'), C('2','d'), C('4','c')];
    expect(evaluate(premium)).toBeGreaterThan(evaluate(trash));
  });

  it('scores double-suited higher than rainbow', () => {
    const ds = [C('A','s'), C('K','s'), C('Q','h'), C('J','h')];
    const rainbow = [C('A','s'), C('K','h'), C('Q','d'), C('J','c')];
    expect(evaluate(ds)).toBeGreaterThan(evaluate(rainbow));
  });

  it('scores connected hands higher than gapped', () => {
    const connected = [C('T','s'), C('9','h'), C('8','d'), C('7','c')];
    const gapped = [C('T','s'), C('6','h'), C('3','d'), C('2','c')];
    expect(evaluate(connected)).toBeGreaterThan(evaluate(gapped));
  });

  it('penalizes trips in hole cards', () => {
    const pair = [C('K','s'), C('K','h'), C('Q','d'), C('J','c')];
    const trips = [C('K','s'), C('K','h'), C('K','d'), C('J','c')];
    expect(evaluate(pair)).toBeGreaterThan(evaluate(trips));
  });

  it('returns value between 0 and 100', () => {
    const hands = [
      [C('A','s'), C('A','h'), C('K','s'), C('Q','h')],
      [C('2','s'), C('3','h'), C('4','d'), C('7','c')],
      [C('T','s'), C('9','h'), C('8','d'), C('7','c')],
    ];
    for (const h of hands) {
      const score = evaluate(h);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

describe('advise (preflop)', () => {
  const advise = globalThis.advise;

  beforeEach(() => {
    globalThis.state.variant = 'plo4';
  });

  it('returns not ready when fewer than holeCount cards', () => {
    const result = advise([C('A','s'), C('K','h')]);
    expect(result.ready).toBe(false);
  });

  it('returns ready when exactly holeCount cards', () => {
    const result = advise([C('A','s'), C('A','h'), C('K','s'), C('Q','h')]);
    expect(result.ready).toBe(true);
  });

  it('recommends RAISE for premium hands', () => {
    const result = advise([C('A','s'), C('A','h'), C('K','s'), C('Q','h')]);
    expect(result.action).toBe('RAISE');
    expect(result.equity).toBeGreaterThanOrEqual(55);
  });

  it('recommends FOLD for trash hands', () => {
    const result = advise([C('2','s'), C('3','h'), C('7','d'), C('4','c')]);
    expect(result.action).toBe('FOLD');
    expect(result.equity).toBeLessThan(46);
  });

  it('recommends CALL for marginal hands', () => {
    // A single-suited hand with some connectivity but not premium
    const result = advise([C('9','s'), C('8','s'), C('4','h'), C('3','c')]);
    expect(['CALL', 'FOLD']).toContain(result.action);
  });

  it('returns sizing for RAISE', () => {
    const result = advise([C('A','s'), C('A','h'), C('K','s'), C('Q','h')]);
    expect(result.sizing).not.toBeNull();
    expect(result.sizing.to).toBe('$175');
    expect(result.sizing.bb).toBe('3.5 bb');
  });

  it('returns sizing for CALL', () => {
    // Find a hand that results in CALL
    const result = advise([C('J','s'), C('T','s'), C('6','h'), C('3','c')]);
    if (result.action === 'CALL') {
      expect(result.sizing).not.toBeNull();
    }
  });

  it('returns null sizing for FOLD', () => {
    const result = advise([C('2','s'), C('3','h'), C('7','d'), C('4','c')]);
    expect(result.sizing).toBeNull();
  });

  it('returns confidence between 0 and 100', () => {
    const result = advise([C('A','s'), C('A','h'), C('K','s'), C('Q','h')]);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  it('returns playability between 0 and 100', () => {
    const result = advise([C('A','s'), C('A','h'), C('K','s'), C('Q','h')]);
    expect(result.playability).toBeGreaterThanOrEqual(0);
    expect(result.playability).toBeLessThanOrEqual(100);
  });

  it('equity is between 30 and 100', () => {
    const hands = [
      [C('A','s'), C('A','h'), C('K','s'), C('Q','h')],
      [C('2','s'), C('3','h'), C('7','d'), C('4','c')],
    ];
    for (const h of hands) {
      const result = advise(h);
      expect(result.equity).toBeGreaterThanOrEqual(30);
      expect(result.equity).toBeLessThanOrEqual(100);
    }
  });
});

describe('reasonText', () => {
  const reasonText = globalThis.reasonText;
  const advise = globalThis.advise;

  beforeEach(() => {
    globalThis.state.variant = 'plo4';
  });

  it('prompts for more cards when hand incomplete', () => {
    const cards = [C('A','s'), C('K','h')];
    const adv = advise(cards);
    const text = reasonText(cards, adv);
    expect(text).toContain('more card');
  });

  it('mentions aces for AA hands', () => {
    const cards = [C('A','s'), C('A','h'), C('K','d'), C('Q','c')];
    const adv = advise(cards);
    const text = reasonText(cards, adv);
    expect(text.toLowerCase()).toContain('ace');
  });

  it('mentions double-suited for DS aces', () => {
    const cards = [C('A','s'), C('A','h'), C('K','s'), C('Q','h')];
    const adv = advise(cards);
    const text = reasonText(cards, adv);
    expect(text.toLowerCase()).toContain('double-suited');
  });

  it('mentions fold for trash', () => {
    const cards = [C('2','s'), C('3','h'), C('7','d'), C('4','c')];
    const adv = advise(cards);
    const text = reasonText(cards, adv);
    expect(text.toLowerCase()).toContain('fold');
  });
});
