import { describe, it, expect } from 'vitest';

describe('calcPotOdds', () => {
  const calc = globalThis.calcPotOdds;

  it('calculates correct pot odds for standard scenario', () => {
    // Pot 150, call 50 => 50/(150+50) = 25%
    expect(calc(150, 50)).toBe(25);
  });

  it('returns 0 when toCall is 0', () => {
    expect(calc(100, 0)).toBe(0);
  });

  it('returns 0 for negative toCall', () => {
    expect(calc(100, -10)).toBe(0);
  });

  it('calculates 50% for equal pot and call', () => {
    // Pot 100, call 100 => 100/(100+100) = 50%
    expect(calc(100, 100)).toBe(50);
  });

  it('calculates correctly for small pot and large call', () => {
    // Pot 10, call 90 => 90/(10+90) = 90%
    expect(calc(10, 90)).toBe(90);
  });

  it('calculates correctly for large pot and small call', () => {
    // Pot 900, call 100 => 100/(900+100) = 10%
    expect(calc(900, 100)).toBe(10);
  });

  it('handles very large numbers', () => {
    expect(calc(10000, 1000)).toBe(9);
  });

  it('rounds to nearest integer', () => {
    // Pot 200, call 33 => 33/233 ≈ 14.16% → rounds to 14
    expect(calc(200, 33)).toBe(14);
  });
});
