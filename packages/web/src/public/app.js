// ============================================================
// Omaha Edge — Vanilla JS App Engine
// Converted from React prototype (design/*.jsx)
// ============================================================
'use strict';

// ── Suit & Rank Constants ──
const SUIT = {
  s: { g: '♠', c: 'var(--su-spade)' },
  h: { g: '♥', c: 'var(--su-heart)' },
  d: { g: '♦', c: 'var(--su-diamond)' },
  c: { g: '♣', c: 'var(--su-club)' }
};
const FACE_SUIT = {
  s: { g: '♠', c: '#1e293b' },
  h: { g: '♥', c: '#e23744' },
  d: { g: '♦', c: '#2b7fff' },
  c: { g: '♣', c: '#1a9c5b' }
};
const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
const ORDER = '23456789TJQKA';
const rv = r => ORDER.indexOf(r);

// ── Variant Constants ──
const VARIANTS = [
  { id: 'plo4', name: 'PLO', cards: 4, label: '4-card' },
  { id: 'plo5', name: 'Big O', cards: 5, label: '5-card' },
  { id: 'plo6', name: 'PLO-6', cards: 6, label: '6-card' },
];
function holeCount() { return VARIANTS.find(v => v.id === state.variant).cards; }

// ── PLO Heuristic Advisor (from poker-kit.jsx) ──
function evaluate(cards) {
  if (!cards.length) return 0;
  const n = cards.length;
  const combos = n * (n - 1) / 2;
  const comboFactor = combos / 6; // 1.0 for PLO4, 1.67 for PLO5, 2.5 for PLO6

  const vals = cards.map(c => rv(c.rank)), ranks = cards.map(c => c.rank), suits = cards.map(c => c.suit);
  let s = 0;
  const sorted = [...vals].sort((a, b) => b - a), w = [1.7, 1.15, 0.55, 0.25, 0.18, 0.12];
  sorted.forEach((v, i) => s += v * (w[i] || 0.1));

  // pairs — more cards means trips/quads penalties matter more
  const counts = {}; ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
  Object.entries(counts).forEach(([r, cnt]) => { if (cnt >= 2) s += 7 + rv(r) * 0.7; if (cnt >= 3) s -= 11; if (cnt >= 4) s -= 12; });

  // suitedness — scales with extra combos
  const sc = {}; suits.forEach(x => sc[x] = (sc[x] || 0) + 1);
  const suitPairs = Object.values(sc).filter(v => v === 2).length;
  const tripleSuited = Object.values(sc).some(v => v >= 3);
  const suitWeight = n > 4 ? 1 + (comboFactor - 1) * 0.55 : 1;
  if (suitPairs >= 2) s += 11 * suitWeight;
  else if (suitPairs === 1) s += 5.5 * suitWeight;
  if (tripleSuited && n >= 6) s += 4;
  else if (tripleSuited) s -= 5;
  if (Object.values(sc).some(v => v >= 4)) s -= 6;

  // connectivity — scales with extra combos
  const uniq = [...new Set(vals)].sort((a, b) => a - b);
  let conn = 0;
  for (let i = 1; i < uniq.length; i++) {
    const g = uniq[i] - uniq[i - 1];
    if (g === 1) conn += 3; else if (g === 2) conn += 1.5; else if (g === 3) conn += 0.5;
  }
  const connCap = n > 4 ? 12 + (n - 4) * 3 : 12;
  const connWeight = n > 4 ? 1 + (comboFactor - 1) * 0.45 : 1;
  s += Math.min(conn * connWeight, connCap);

  // Big O wheel card bonus (A-5 range as 5th card aids nut low)
  if (n === 5) {
    const lowCards = vals.filter(v => v <= 3); // A,2,3,4,5
    if (lowCards.length >= 2) s += 3;
  }

  // PLO6 rundown bonus — 4+ connected unique ranks in a row
  if (n === 6) {
    let maxRun = 1, run = 1;
    for (let i = 1; i < uniq.length; i++) {
      if (uniq[i] - uniq[i - 1] === 1) { run++; maxRun = Math.max(maxRun, run); }
      else run = 1;
    }
    if (maxRun >= 4) s += 5;
  }

  // normalize: more cards = higher raw score, but opponents also improve
  // scale so the 0-100 range stays meaningful across variants
  const normFactor = 1 / (1 + (comboFactor - 1) * 0.32);
  return Math.max(0, Math.min(100, s * normFactor));
}

function advise(cards) {
  const score = evaluate(cards);
  const n = holeCount();
  const combos = n * (n - 1) / 2;

  // position adjustment: late = looser, early = tighter
  const posOrder = { BTN: 2, CO: 1, SB: 0, BB: 0, HJ: -1, MP: -2, UTG: -3 };
  const posAdj = (posOrder[state.situation.pos] || 0) * 1.2;

  const equity = Math.round(30 + score * 0.36 + posAdj);

  // 5/6-card: tighter raise thresholds (hand quality gap narrows)
  const raiseThresh = n === 4 ? 55 : n === 5 ? 57 : 59;
  const callThresh = n === 4 ? 46 : n === 5 ? 47 : 48;

  let action = 'FOLD', color = 'var(--pk-fold)', sizing = null;
  if (equity >= raiseThresh) { action = 'RAISE'; color = 'var(--pk-raise)'; sizing = { to: '$175', bb: '3.5 bb' }; }
  else if (equity >= callThresh) { action = 'CALL'; color = 'var(--pk-call)'; sizing = { to: '$50', bb: 'call' }; }
  const d = Math.min(Math.abs(equity - raiseThresh), Math.abs(equity - callThresh));
  const confidence = Math.min(97, Math.round(72 + Math.min(d, 16) * 1.45));
  const potOdds = action === 'FOLD' ? '—' : (equity >= raiseThresh ? '2.4:1' : '1.9:1');
  const playability = Math.round(score);
  return { ready: cards.length === n, equity, action, color, sizing, confidence, potOdds, playability, combos };
}

function reasonText(cards, adv) {
  const nc = holeCount();
  const remaining = nc - cards.length;
  if (remaining > 0) return 'Add ' + remaining + ' more card' + (remaining > 1 ? 's' : '') + ' for your read.';

  const ranks = cards.map(c => c.rank), suits = cards.map(c => c.suit);
  const counts = {}; ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
  const sc = {}; suits.forEach(s => sc[s] = (sc[s] || 0) + 1);
  const suitPairs = Object.values(sc).filter(v => v === 2).length;
  const ds = suitPairs >= 2;
  const tripleSuited = Object.values(sc).some(v => v >= 3);
  const aces = counts['A'] >= 2, anyPair = Object.values(counts).some(v => v >= 2);
  const broadway = ranks.every(r => 'AKQJT'.includes(r));

  const combos = nc * (nc - 1) / 2;
  const varTag = nc === 5 ? ' With 10 two-card combos in Big O, ' : nc === 6 ? ' With 15 combos in 6-card, ' : '';
  const posTag = state.situation.pos === 'BTN' || state.situation.pos === 'CO' ? ' in position' : state.situation.pos === 'UTG' || state.situation.pos === 'MP' ? ' from early position' : '';

  if (aces && ds) return `Double-suited aces${posTag} — top of your raising range.${nc > 4 ? varTag + 'aces still dominate but the edge is thinner.' : ''}`;
  if (aces) return `A pair of aces with playable side cards — raise for value${posTag}.${nc > 4 ? varTag + 'connectivity matters more than in PLO.' : ''}`;
  if (tripleSuited && nc >= 6) return `Triple-suited with ${combos} combos — strong flush potential across multiple runouts.`;
  if (broadway && ds) return `Double-suited broadway${posTag} — premium holding, raise.${nc > 4 ? varTag + 'suitedness carries extra weight.' : ''}`;
  if (anyPair && ds) return `Paired and double-suited${posTag} — strong, raise.${nc > 4 ? varTag + 'the extra suited combos add equity.' : ''}`;
  if (adv.action === 'RAISE') return `Connected and suited enough to raise for value${posTag}.${nc > 4 ? varTag + 'connectivity and suits drive your edge.' : ''}`;
  if (adv.action === 'CALL') return `Speculative — playable${posTag || ' in position'}, proceed with care.${nc > 4 ? varTag + 'be cautious — opponents hold strong combos too.' : ''}`;
  return `Disconnected and offsuit — fold and wait for a better spot.${nc > 4 ? varTag + 'the bar is higher with more combos in play.' : ''}`;
}

function parseNotation(str) {
  const out = [];
  for (let i = 0; i < str.length && out.length < 4;) {
    const ch = str[i].toUpperCase();
    if ('AKQJT98765432'.includes(ch)) {
      const su = (str[i + 1] || '').toLowerCase();
      if ('shdc'.includes(su)) { if (!out.some(c => c.rank === ch && c.suit === su)) out.push({ rank: ch, suit: su }); i += 2; }
      else i += 1;
    } else i += 1;
  }
  return out;
}

// ── Combinatorics helper ──
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [...combinations(rest, k - 1).map(c => [first, ...c]), ...combinations(rest, k)];
}

// ── 5-Card Poker Hand Evaluator ──
function evaluate5Card(cards) {
  const vals = cards.map(c => rv(c.rank));
  const suits = cards.map(c => c.suit);
  const isFlush = new Set(suits).size === 1;
  const sorted = [...vals].sort((a, b) => a - b);
  const uniq = [...new Set(sorted)];
  const isStraight = uniq.length === 5 && sorted[4] - sorted[0] === 4;
  const isWheel = uniq.length === 5 && sorted.join(',') === '0,1,2,3,12';

  const counts = {};
  vals.forEach(v => counts[v] = (counts[v] || 0) + 1);
  const freqs = Object.values(counts).sort((a, b) => b - a);
  const highVal = Math.max(...vals);

  if ((isStraight || isWheel) && isFlush) return { handRank: 8, name: 'Straight Flush', high: isWheel ? 3 : highVal };
  if (freqs[0] === 4) return { handRank: 7, name: 'Quads', high: highVal };
  if (freqs[0] === 3 && freqs[1] === 2) return { handRank: 6, name: 'Full House', high: highVal };
  if (isFlush) return { handRank: 5, name: 'Flush', high: highVal };
  if (isStraight || isWheel) return { handRank: 4, name: 'Straight', high: isWheel ? 3 : highVal };
  if (freqs[0] === 3) return { handRank: 3, name: 'Trips', high: highVal };
  if (freqs[0] === 2 && freqs[1] === 2) return { handRank: 2, name: 'Two Pair', high: highVal };
  if (freqs[0] === 2) return { handRank: 1, name: 'Pair', high: highVal };
  return { handRank: 0, name: 'High Card', high: highVal };
}

// ── Omaha Hand Evaluator (exactly 2 hole + 3 board) ──
function evaluateOmaha(hole, board) {
  if (board.length < 3) return null;
  const boardCards = board.slice(0, 5);
  let best = null;
  const holeCombos = combinations(hole, 2);
  const boardCombos = combinations(boardCards, 3);
  for (const hc of holeCombos) {
    for (const bc of boardCombos) {
      const hand = [...hc, ...bc];
      const ev = evaluate5Card(hand);
      if (!best || ev.handRank > best.handRank || (ev.handRank === best.handRank && ev.high > best.high)) {
        best = ev;
      }
    }
  }
  return best;
}

function isNutHand(hole, board) {
  if (!board.length || board.length < 3) return false;
  const myHand = evaluateOmaha(hole, board);
  if (!myHand) return false;
  return myHand.handRank >= 5;
}

// ── Board Danger Heuristics ──
function boardDanger(board) {
  if (board.length < 3) return { level: 'none', reasons: [] };
  const reasons = [];
  const suits = board.map(c => c.suit);
  const vals = board.map(c => rv(c.rank));
  const suitCounts = {};
  suits.forEach(s => suitCounts[s] = (suitCounts[s] || 0) + 1);
  const maxSuit = Math.max(...Object.values(suitCounts));
  if (maxSuit >= 3) reasons.push('flush possible');
  else if (maxSuit === 2 && board.length >= 4) reasons.push('flush draw');

  const rankCounts = {};
  board.forEach(c => rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1);
  if (Object.values(rankCounts).some(n => n >= 2)) reasons.push('paired board');

  const sorted = [...new Set(vals)].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 2; i++) {
    if (sorted[i + 2] - sorted[i] <= 4) { reasons.push('straight possible'); break; }
  }

  const level = reasons.length >= 2 ? 'high' : reasons.length === 1 ? 'medium' : 'low';
  return { level, reasons };
}

// ── Pot Economics ──
function calcPotOdds(pot, toCall) {
  if (toCall <= 0) return 0;
  return Math.round(toCall / (pot + toCall) * 100);
}

// ── Hand Builder Engine ──
const HB_STRUCTURES = ['pair', 'dpair', 'rundown', 'broadway', 'any'];
const HB_STRUCT_LABELS = { pair: 'Pair', dpair: 'Dbl Pair', rundown: 'Rundown', broadway: 'Broadway', any: 'Any' };
const HB_SUITED = ['ds', 'ss', 'rainbow', 'any'];
const HB_SUITED_LABELS = { ds: 'Double-suited', ss: 'Single-suited', rainbow: 'Rainbow', any: 'Any' };
const HB_SIDES = ['connected', 'broadway', 'wheel', 'any'];
const HB_SIDE_LABELS = { connected: 'Connected', broadway: 'Broadway', wheel: 'Wheel', any: 'Any' };
const HB_FAST_PRESETS = [
  { label: 'pair:AA:ds', axis: { structure: 'pair', rank: 'A', rankMod: '=', suited: 'ds', side: 'any' } },
  { label: 'run:T+:ss', axis: { structure: 'rundown', rank: 'T', rankMod: '+', suited: 'ss', side: 'any' } },
  { label: 'bway:ds', axis: { structure: 'broadway', rank: 'A', rankMod: '=', suited: 'ds', side: 'any' } },
  { label: '2pair:KK+QQ', axis: { structure: 'dpair', rank: 'K', rankMod: '=', suited: 'any', side: 'any' } },
];

function hbQueryBadge(axis) {
  const parts = [];
  parts.push(axis.structure === 'dpair' ? '2pair' : axis.structure === 'rundown' ? 'run' : axis.structure === 'broadway' ? 'bway' : axis.structure);
  if (axis.structure !== 'broadway' && axis.structure !== 'any') {
    parts.push(axis.rank + axis.rank + (axis.rankMod === '+' ? '+' : axis.rankMod === '-' ? '-' : ''));
  }
  if (axis.suited !== 'any') parts.push(axis.suited);
  return parts.join(':');
}

function hbGenerateHands(axis, numCards, seed) {
  const n = numCards || 4;
  const sd = seed || 0;
  const hands = [];
  const rankIdx = RANKS.indexOf(axis.rank);

  const SUIT_ROTATIONS = [
    ['s','h','d','c','s','h'],
    ['h','d','s','c','h','d'],
    ['d','c','h','s','d','c'],
    ['c','s','d','h','c','s'],
  ];

  function makeSuits(cards, suitPref, handIdx) {
    const rot = SUIT_ROTATIONS[(sd + (handIdx || 0)) % SUIT_ROTATIONS.length];
    if (suitPref === 'ds' && cards.length >= 4) {
      const s = [rot[0], rot[1], rot[0], rot[1], rot[2], rot[3]];
      return cards.map((c, i) => ({ rank: c, suit: s[i % s.length] }));
    }
    if (suitPref === 'ss') {
      const s = [rot[0], rot[0], rot[1], rot[2], rot[3], rot[1]];
      return cards.map((c, i) => ({ rank: c, suit: s[i % s.length] }));
    }
    if (suitPref === 'rainbow') {
      return cards.map((c, i) => ({ rank: c, suit: rot[i % rot.length] }));
    }
    return cards.map((c, i) => ({ rank: c, suit: rot[i % rot.length] }));
  }

  function addHand(ranks) {
    if (ranks.length !== n) return;
    const hi = hands.length;
    const rot = SUIT_ROTATIONS[(sd + hi) % SUIT_ROTATIONS.length];
    const hasDupes = ranks.some((r, i) => {
      const key = r + rot[i % rot.length];
      return ranks.slice(0, i).some((r2, j) => r2 + rot[j % rot.length] === key);
    });
    if (!hasDupes) hands.push(makeSuits(ranks, axis.suited, hi));
  }

  function sideCards(count) {
    if (axis.side === 'broadway') return ['A','K','Q','J','T'].slice(0, count);
    if (axis.side === 'wheel') return ['5','4','3','2','A'].slice(0, count);
    if (axis.side === 'connected' && rankIdx < RANKS.length - 1) {
      const base = Math.min(rankIdx + 2, RANKS.length - 1);
      return Array.from({ length: count }, (_, i) => RANKS[Math.min(base + i, RANKS.length - 1)]);
    }
    const pool = RANKS.filter(r => r !== axis.rank);
    return pool.slice(0, count);
  }

  const offsets = [0, -1, 1];
  for (const off of offsets) {
    if (hands.length >= 3) break;
    const ri = Math.max(0, Math.min(RANKS.length - 1, rankIdx + off));
    if (axis.rankMod === '+' && ri > rankIdx) continue;
    if (axis.rankMod === '-' && ri < rankIdx) continue;
    const r = RANKS[ri];

    if (axis.structure === 'pair') {
      const sides = sideCards(n - 2);
      addHand([r, r, ...sides]);
    } else if (axis.structure === 'dpair') {
      const r2Idx = Math.min(ri + 1, RANKS.length - 1);
      const r2 = RANKS[r2Idx];
      if (r === r2 && n <= 4) continue;
      const sides = sideCards(n - 4);
      addHand([r, r, r2, r2, ...sides].slice(0, n));
    } else if (axis.structure === 'rundown') {
      const run = [];
      for (let k = 0; k < n && ri + k < RANKS.length; k++) run.push(RANKS[ri + k]);
      while (run.length < n) run.push(RANKS[Math.min(ri + run.length, RANKS.length - 1)]);
      addHand(run);
    } else if (axis.structure === 'broadway') {
      const bway = ['A','K','Q','J','T'];
      addHand(bway.slice(0, n));
      if (hands.length < 3 && n <= 5) addHand(['A','K','Q','J','T','9'].slice(off + 1, off + 1 + n));
    } else {
      const pool = RANKS.slice(ri);
      addHand(pool.slice(0, n));
    }
  }

  while (hands.length < 3 && hands.length > 0) {
    hands.push(hands[hands.length - 1]);
  }
  if (hands.length === 0) {
    hands.push(makeSuits(RANKS.slice(0, n), axis.suited, 0));
    hands.push(hands[0]);
    hands.push(hands[0]);
  }

  return hands.slice(0, 3);
}

// ── Matrix Data Model (from poker-kit.jsx) ──
const HAND_CATS = [
  { key: 'high',  short: 'High',     name: 'High Card',      code: 'Hi' },
  { key: 'pair',  short: 'Pair',     name: 'One Pair',       code: 'Pr' },
  { key: 'two',   short: '2 Pair',   name: 'Two Pair',       code: '2P' },
  { key: 'trips', short: 'Trips',    name: 'Trips / Set',    code: 'Tr' },
  { key: 'str',   short: 'Straight', name: 'Straight',       code: 'St' },
  { key: 'flush', short: 'Flush',    name: 'Flush',          code: 'Fl' },
  { key: 'boat',  short: 'Boat',     name: 'Full House',     code: 'FH' },
  { key: 'quads', short: 'Quads',    name: 'Quads',          code: 'Qd' },
  { key: 'sf',    short: 'St.Flush', name: 'Straight Flush', code: 'SF' },
];
const FINAL_FREQ = [6, 33, 30, 12, 9, 5.5, 3.6, 0.35, 0.05];
const OUTCOME_COLOR = { win: 'var(--pk-bet)', tie: 'var(--pk-raise)', lose: 'var(--pk-fold)' };
// raw rgb triplets for alpha-blended heat cells
const OUTCOME_HEX = { win: '34,197,94', tie: '245,158,11', lose: '239,68,68' };

function fieldProb(j, opp) { const p = FINAL_FREQ[j] / 100; return (1 - Math.pow(1 - p, opp)) * 100; }
function outcome(i, j) { return i > j ? 'win' : i < j ? 'lose' : 'tie'; }

// Full 9×9 grid with variant awareness (more cards => more made hands).
function gridData(opp, holeCount) {
  const hc = holeCount || 4;
  const vbump = 1 + (hc - 4) * 0.16;
  const freq = FINAL_FREQ.map((f, j) => j >= 3 ? Math.min(f * vbump, f * 2) : f);
  const colProb = HAND_CATS.map((_, j) => { const p = freq[j] / 100; return (1 - Math.pow(1 - p, opp)) * 100; });
  const maxProb = Math.max(...colProb);
  const cells = HAND_CATS.map((_, i) => HAND_CATS.map((_, j) => {
    const oc = outcome(i, j);
    const intensity = Math.sqrt(colProb[j] / maxProb);
    const a = (0.14 + 0.82 * intensity).toFixed(2);
    return { i, j, prob: colProb[j], outcome: oc, intensity, bg: `rgba(${OUTCOME_HEX[oc]},${a})` };
  }));
  return { cells, colProb, maxProb, freq };
}

// Maps a matrix category index to a hand-builder query (prototype schema).
function catToQuery(i) {
  const Q = (structure, rank, suited, side, rank2) => ({ structure, rank: rank || { value: 10, mod: '+' }, rank2, suited: suited || 'any', side: side || 'any' });
  switch (i) {
    case 0: return Q('any');
    case 1: return Q('pair', { value: 9, mod: '+' }, 'ss', 'conn');
    case 2: return Q('dpair', { value: 12, mod: '+' }, 'ss', 'any', { value: 9, mod: '-' });
    case 3: return Q('pair', { value: 7, mod: '+' }, 'ss', 'conn');
    case 4: return Q('rundown', { value: 10, mod: '+' }, 'ss');
    case 5: return Q('any', null, 'ds');
    case 6: return Q('dpair', { value: 13, mod: '+' }, 'any', 'any', { value: 10, mod: '-' });
    case 7: return Q('pair', { value: 11, mod: '+' }, 'any', 'any');
    case 8: return Q('rundown', { value: 12, mod: '+' }, 'ds');
    default: return Q('any');
  }
}

// Translate the prototype catToQuery() schema into our hbAxis schema.
function catQueryToAxis(i) {
  const q = catToQuery(i);
  const valToLetter = v => ORDER[Math.max(0, Math.min(ORDER.length - 1, v - 2))];
  return {
    structure: q.structure,
    rank: q.rank ? valToLetter(q.rank.value) : 'T',
    rankMod: q.rank ? q.rank.mod : '+',
    suited: q.suited || 'any',
    side: q.side === 'conn' ? 'connected' : (q.side || 'any'),
  };
}

// Estimate the made-hand category a starting hand is aiming for (preflop).
function estimateStartingCat(cards) {
  if (!cards.length) return 1;
  const ranks = cards.map(c => c.rank), suits = cards.map(c => c.suit);
  const counts = {}; ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
  const sc = {}; suits.forEach(s => sc[s] = (sc[s] || 0) + 1);
  const pairs = Object.values(counts).filter(v => v >= 2).length;
  const suitPairs = Object.values(sc).filter(v => v >= 2).length;
  const vals = [...new Set(cards.map(c => rv(c.rank)))].sort((a, b) => a - b);
  let conn = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i] - vals[i - 1] <= 1) conn++;
  if (pairs >= 1) return 3;     // pocket pairs make sets
  if (conn >= 2) return 4;      // connected => straights
  if (suitPairs >= 1) return 5; // suited => flushes
  if (ranks.every(r => 'AKQJT'.includes(r))) return 2; // broadway => two pair
  return 1;
}

// The matrix category to focus when navigating from the current Play hand.
function playMatrixCat() {
  if (state.board.length >= 3) {
    const mh = evaluateOmaha(state.cards, state.board);
    if (mh) return Math.max(0, Math.min(8, mh.handRank));
  }
  return estimateStartingCat(state.cards);
}

function rowData(i, opp) {
  const rows = HAND_CATS.map((c, j) => ({
    j, label: c.short, name: c.name,
    pct: fieldProb(j, opp),
    outcome: outcome(i, j),
    color: OUTCOME_COLOR[outcome(i, j)]
  }));
  const rank = { lose: 0, tie: 1, win: 2 };
  rows.sort((a, b) => rank[a.outcome] - rank[b.outcome] || b.pct - a.pct);
  let aheadP = 1;
  for (let j = i + 1; j < 9; j++) aheadP *= Math.pow(1 - FINAL_FREQ[j] / 100, opp);
  const beat = (1 - aheadP) * 100;
  return { rows, beat, ahead: 100 - beat };
}

// ── Presets for Study Mode ──
const C = (rank, suit) => ({ rank, suit });
const PRESETS = [
  { id: 'aads', name: 'Aces, double-suited', cards: [C('A','s'), C('A','h'), C('K','s'), C('Q','h')] },
  { id: 'bwds', name: 'Broadway, DS', cards: [C('A','s'), C('K','s'), C('Q','h'), C('J','h')] },
  { id: 'rundown', name: 'Rundown 9876', cards: [C('9','s'), C('8','h'), C('7','s'), C('6','h')] },
  { id: 'sa', name: 'Suited ace + danglers', cards: [C('A','s'), C('K','s'), C('8','d'), C('4','c')] },
  { id: 'kkqq', name: 'Kings & Queens', cards: [C('K','s'), C('K','h'), C('Q','s'), C('Q','h')] },
  { id: 'trap', name: 'Aces, dry (trap)', cards: [C('A','s'), C('A','d'), C('7','c'), C('2','h')] },
];

// ── Journal Seed Data ──
const DAY = 86400000;
const NOW = Date.now();
function at(daysAgo, h, m) { const d = new Date(NOW - daysAgo * DAY); d.setHours(h, m, 0, 0); return d.getTime(); }
const SESSIONS = [
  { id: 's1', label: 'Aria 2/5 NL Omaha', venue: 'Live · 2 hr', ts: at(0, 21, 30) },
  { id: 's2', label: 'Home game PLO', venue: 'Live · 4 hr', ts: at(3, 23, 10) },
  { id: 's3', label: 'Bellagio 5/10', venue: 'Live · 3 hr', ts: at(13, 1, 20) },
];
const SEED_HANDS = [
  { id:'h1', s:'s1', ts:at(0,21,5), hole:[C('A','s'),C('A','h'),C('K','s'),C('Q','h')], board:[C('A','d'),C('7','s'),C('2','c'),C('9','h'),C('3','d')], advised:'RAISE', size:'$175', took:'RAISE', equity:71, conf:92, result:'win', amt:340, tags:['#value','#set'], note:'Flopped top set, got it in vs two pair. Textbook.' },
  { id:'h2', s:'s1', ts:at(0,20,40), hole:[C('J','s'),C('T','s'),C('9','h'),C('8','h')], board:[C('Q','s'),C('7','d'),C('2','c')], advised:'RAISE', size:'$60', took:'CALL', equity:58, conf:74, result:'loss', amt:-60, tags:['#draw'], note:'Wrapped + flush draw, should have raised.' },
  { id:'h3', s:'s1', ts:at(0,20,12), hole:[C('A','c'),C('A','d'),C('8','s'),C('3','h')], board:[C('K','s'),C('Q','d'),C('J','c')], advised:'FOLD', size:null, took:'FOLD', equity:31, conf:81, result:'win', amt:0, tags:['#discipline'], note:'Dry aces on broadway board. Easy fold.' },
  { id:'h4', s:'s1', ts:at(0,19,50), hole:[C('K','s'),C('K','h'),C('Q','s'),C('Q','h')], board:[C('K','d'),C('5','s'),C('5','h'),C('2','d')], advised:'RAISE', size:'$220', took:'RAISE', equity:84, conf:95, result:'win', amt:510, tags:['#value','#boat'], note:'' },
  { id:'h5', s:'s2', ts:at(3,22,50), hole:[C('9','s'),C('8','s'),C('7','h'),C('6','h')], board:[C('T','s'),C('5','d'),C('4','c'),C('K','s')], advised:'RAISE', size:'$45', took:'RAISE', equity:62, conf:70, result:'win', amt:120, tags:['#draw','#bluff'], note:'Double-suited rundown, semi-bluffed turn.' },
  { id:'h6', s:'s2', ts:at(3,22,20), hole:[C('A','s'),C('K','d'),C('7','c'),C('2','h')], board:[C('Q','s'),C('9','d'),C('4','c')], advised:'FOLD', size:null, took:'CALL', equity:28, conf:77, result:'loss', amt:-85, tags:['#leak'], note:'Called with one pair and no draw.' },
  { id:'h7', s:'s2', ts:at(3,21,35), hole:[C('A','h'),C('A','s'),C('J','h'),C('T','s')], board:[C('J','d'),C('T','c'),C('3','h'),C('3','s'),C('K','h')], advised:'CALL', size:'$90', took:'RAISE', equity:52, conf:63, result:'loss', amt:-240, tags:['#thin'], note:'Overplayed aces-up into a boat.' },
  { id:'h8', s:'s3', ts:at(13,1,5), hole:[C('A','s'),C('K','s'),C('Q','d'),C('J','d')], board:[C('T','s'),C('9','s'),C('2','h')], advised:'RAISE', size:'$120', took:'RAISE', equity:78, conf:88, result:'win', amt:430, tags:['#nuts','#draw'], note:'Broadway wrap + nut flush draw.' },
  { id:'h9', s:'s3', ts:at(13,0,40), hole:[C('K','c'),C('K','d'),C('6','s'),C('2','h')], board:[C('A','s'),C('A','d'),C('8','c')], advised:'FOLD', size:null, took:'FOLD', equity:22, conf:90, result:'win', amt:0, tags:['#discipline'], note:'' },
  { id:'h10', s:'s3', ts:at(13,0,10), hole:[C('Q','s'),C('Q','h'),C('J','s'),C('9','h')], board:[C('J','c'),C('9','d'),C('4','s'),C('Q','h')], advised:'RAISE', size:'$160', took:'RAISE', equity:81, conf:90, result:'win', amt:295, tags:['#boat','#value'], note:'Turned top boat.' },
];
const ACT_COLOR = { RAISE: 'var(--pk-raise)', CALL: 'var(--pk-call)', FOLD: 'var(--pk-fold)' };
const ACT_BG = { RAISE: 'rgba(245,158,11,.16)', CALL: 'rgba(59,130,246,.16)', FOLD: 'rgba(239,68,68,.16)' };

// ── Coach Providers ──
const PROVIDERS = [
  { id: 'groq', name: 'Groq', model: 'llama-3.3-70b', badge: 'G', color: '#f55036' },
  { id: 'openai', name: 'OpenAI', model: 'gpt-4o', badge: 'AI', color: '#10a37f' },
  { id: 'anthropic', name: 'Anthropic', model: 'claude-3.5', badge: 'A', color: '#d97757' },
  { id: 'gemini', name: 'Gemini', model: 'gemini-2.0', badge: 'G', color: '#4285f4' },
];

// ── Coach Conversation Builder ──
function buildConversation(context) {
  if (context && context.kind === 'matrix') {
    const cat = context.category, ahead = Math.round(context.ahead);
    return {
      opener: `You're studying ${cat}. Against ${context.opp} opponents you're ahead about ${ahead}% of the time — want to know what threatens it?`,
      qa: [
        { q: `What beats a ${cat.toLowerCase()}?`, a: `Only a few holdings: a higher ${cat.toLowerCase()}, a full house, quads, or a straight flush.` },
        { q: 'Should I bet or check?', a: `With ${ahead}% ahead you're value-betting most rivers, but size down on paired boards.` },
        { q: 'Which turn cards scare me?', a: 'Any card that pairs the board or completes an obvious draw.' },
        { q: 'How do I play vs a raise?', a: 'A raise here is rarely a bluff in PLO. Without the nut version, fold.' },
      ],
    };
  }
  const adv = context && context.cards ? advise(context.cards) : null;
  return {
    opener: adv ? `Let's look at this hand. This is a ${adv.action.toLowerCase()} — what do you want to dig into?` : 'Ask me anything about this spot.',
    qa: [
      { q: 'Why this sizing?', a: 'A 3.5bb raise keeps worse hands in while building a pot you\'ll often win.' },
      { q: 'What if the flop is monotone?', a: 'Monotone flops cut your equity hard unless you hold the matching suit. Slow down.' },
      { q: 'How does position change this?', a: 'In position you can flat more and realize equity; out of position tighten up.' },
      { q: 'Worst turn cards for me?', a: 'Cards that complete obvious straights or pair the board are the worst.' },
    ],
  };
}

// ── Walkthrough Steps (onboarding) ──
const WT_STEPS = [
  { el: null, title: 'Welcome to Omaha Edge!', body: 'This app helps you analyze Omaha poker hands and study strategy. Let’s take a quick tour.' },
  { el: () => document.querySelector('#tabbar .pk-tab[data-tab="play"]'), title: 'Play tab', body: 'Start here. Enter your hole cards to get instant hand analysis.' },
  { el: () => document.querySelector('#play-variants'), title: 'Switch variants', body: 'Playing Big O or 6-card? Switch variants here.' },
  { el: () => document.querySelector('#starter-picker') || document.querySelector('#expert-rankpad'), title: 'Enter your cards', body: 'Tap ranks and suits to enter your cards. The advisor updates as you add them.' },
  { el: () => document.querySelector('#tabbar .pk-tab[data-tab="study"]'), title: 'Study tab', body: 'Build abstract hand types and explore the probability matrix.' },
  { el: () => document.querySelector('#tabbar .pk-tab[data-tab="journal"]'), title: 'Journal tab', body: 'Save hands during play and review your history here.' },
  { el: () => document.querySelector('#btn-help'), title: 'Need help?', body: 'Tap the ? anytime for help on any control. You can also reset this tutorial from the ? menu.' },
];

// ── Help Mode Tooltip Definitions ──
const HELP_DEFS = {
  play: [
    { sel: '#play-variants', text: 'Choose your Omaha variant. PLO uses 4 hole cards, Big O uses 5, and 6-card uses 6.' },
    { sel: '#play-seg', text: 'Starter mode shows simplified guidance. Expert mode shows detailed analysis and compact layout.' },
    { sel: '#starter-fan, #expert-track', text: 'Your hole cards. Tap a rank then a suit to add cards. The advisor updates as you add cards.' },
    { sel: '#starter-board-wrap, #expert-board-wrap', text: 'Community cards. After entering all hole cards, tap “Add board cards” to enter the flop, turn, and river.', showWhen: el => !el.classList.contains('hidden') },
    { sel: '#starter-ring-wrap', text: 'The advisor’s recommendation based on your hand strength. Shows equity %, suggested action (Fold/Call/Raise), and confidence.' },
    { sel: '#starter-econ-wrap, #expert-econ-wrap', text: 'Enter pot size, amount to call, and effective stack to see pot odds and break-even equity needed.', showWhen: el => !el.classList.contains('hidden') },
    { sel: '#starter-new, #expert-new', text: 'Clear all cards and start analyzing a new hand.' },
    { sel: '#starter-save, #expert-save', text: 'Save this hand to your journal for review later.' },
    { sel: '#starter-picker, #expert-rankpad', text: 'Tap a rank, then pick a suit to enter each card.' },
    { sel: '#btn-coach-play', text: 'Ask the AI coach for strategic advice about your current hand.' },
    { sel: '#play-ctx', text: 'Set your position, table size, and villain style to refine the advisor’s recommendations.' },
  ],
  study: [
    { sel: '#study-seg', text: 'Scenarios lets you build abstract hand types. Matrix shows win probabilities across all hand categories.' },
    { sel: '#study-presets', text: 'Quick shortcuts to common hand types like AA double-suited or suited rundowns.' },
    { sel: '.hb-query', text: 'Shows the compact notation for your current hand query, like “pair:AA+:ds”.' },
    { sel: '#hand-builder .hb-chips', text: 'Choose the structure of your starting hand: Pair, Double Pair, Rundown (connected), Broadway (high cards), or Any.' },
    { sel: '.hb-rank-stepper', text: 'Set the minimum rank. Use +/=/− to mean “or better”, “exactly”, or “or worse”.' },
    { sel: '#hand-builder [data-ax="suited"]', text: 'Double-suited (ds) = two suits matched. Single-suited (ss) = one suit matched. Rainbow = no suits matched.', resolveParent: true },
    { sel: '#hand-builder [data-ax="side"]', text: 'For Pair/Double Pair hands, choose what your non-pair cards look like: connected, broadway, wheel (low), or any.', resolveParent: true, showWhen: el => !!el },
    { sel: '.hb-shuffle', text: 'Generate new random example hands matching your current query.' },
    { sel: '#btn-coach-study', text: 'Ask the AI coach for strategic advice about your current hand or matrix category.' },
    { sel: '#matrix-hand-name', text: 'Navigate between hand categories (High Card through Straight Flush) to see win rates.', showWhen: () => state.studySub === 'matrix' },
    { sel: '#matrix-gridwrap', text: 'Heat map of how your hand performs against every opponent category. Tap a cell for detail.', showWhen: () => state.studySub === 'matrix' && state.mode === 'expert' },
    { sel: '#matrix-keys', text: 'The matchups that matter most, in plain language. Switch to Expert mode for the full heat grid.', showWhen: () => state.studySub === 'matrix' && state.mode !== 'expert' },
  ],
  journal: [
    { sel: '#jr-scroll', text: 'Your saved hands. Tap to expand and see full details.' },
    { sel: '.jr-replay', text: 'Load this hand back into the Play tab to re-analyze it.', showWhen: el => !!el },
  ],
};

// ============================================================
// DOM helpers
// ============================================================
const $ = id => document.getElementById(id);
const h = (tag, cls, html, attrs) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el[k] = v;
    else el.setAttribute(k, v);
  });
  return el;
};
const show = el => el && el.classList.remove('hidden');
const hide = el => el && el.classList.add('hidden');

function miniCardHTML(rank, suit, w = 22, h = 31) {
  const s = SUIT[suit];
  return `<div class="pk-mini" style="width:${w}px;height:${h}px"><span style="font-size:13px;color:${s.c}">${rank}</span><span style="font-size:11px;color:${s.c}">${s.g}</span></div>`;
}

function faceCardHTML(rank, suit, w, ht) {
  const fs = FACE_SUIT[suit];
  return `<div class="pk-card face" style="width:${w}px;height:${ht}px">
    <span class="corner" style="color:${fs.c}"><span class="r">${rank}</span><span class="s">${fs.g}</span></span>
    <span class="pip" style="color:${fs.c}">${fs.g}</span>
    <span class="corner br" style="color:${fs.c}"><span class="r">${rank}</span><span class="s">${fs.g}</span></span></div>`;
}

function chipCardHTML(rank, suit, w, ht) {
  const s = SUIT[suit];
  return `<div class="pk-card chip" style="width:${w}px;height:${ht}px">
    <span class="r" style="color:${s.c}">${rank}</span><span class="s" style="color:${s.c}">${s.g}</span></div>`;
}

// ============================================================
// Persistent State (localStorage)
// ============================================================
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v != null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

const state = {
  tab: 'play',
  mode: load('pk-play-mode', 'starter'),
  variant: load('pk-variant', 'plo4'),
  situation: load('pk-situation', { pos: 'BTN', players: 6, style: 'TAG' }),
  cards: load('pk-cards', []),
  armed: null,       // selected rank awaiting suit
  board: load('pk-board', []),
  boardPickerActive: false,
  econ: load('pk-econ', { pot: 100, toCall: 50, stack: 1000 }),
  savedHands: load('pk-journal-saved', []),
  onboarded: load('pk-onboarded', false),
  wtStep: -1,
  // study
  studySub: load('pk-study-sub', 'scenarios'),
  studyPreset: 0,
  matrixHand: 5,
  hbAxis: load('pk-hb-axis', { structure: 'pair', rank: 'A', rankMod: '+', suited: 'ds', side: 'any' }),
  hbSeed: 0,
  // journal
  journalStore: load('pk-journal', { deleted: [], notes: {} }),
  journalExpanded: null,
  jFilterDate: 'all', jFilterResult: 'all', jFilterAction: 'all', jFilterOpen: null,
  // coach
  coachOpen: false,
  coachContext: null,
  byok: load('pk-byok', null),
  coachProvider: 'groq',
  coachMsgs: [],
  coachUsed: new Set(),
  helpMode: false,
  coachConvo: null,
  // pathway navigation
  navOrigin: null,      // { tab, studySub, label } — where a pathway started
  matrixExpanded: false, // starter-mode "show full heat grid" toggle
};

function persist() {
  save('pk-play-mode', state.mode);
  save('pk-variant', state.variant);
  save('pk-situation', state.situation);
  save('pk-cards', state.cards);
  save('pk-board', state.board);
  save('pk-econ', state.econ);
  save('pk-journal-saved', state.savedHands);
  save('pk-study-sub', state.studySub);
  save('pk-journal', state.journalStore);
  save('pk-hb-axis', state.hbAxis);
}

// ============================================================
// Toast
// ============================================================
let toastTimer;
function showToast(text) {
  const el = $('toast'), txt = $('toast-text');
  txt.textContent = text;
  show(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hide(el), 1900);
}

// ============================================================
// Tab Switching
// ============================================================
function switchTab(tab, keepOrigin) {
  // Manually tapping a bottom tab clears any active pathway breadcrumb.
  if (!keepOrigin) state.navOrigin = null;
  state.tab = tab;
  ['play', 'study', 'journal'].forEach(t => {
    const pane = $('pane-' + t);
    if (t === tab) { pane.removeAttribute('hidden'); pane.classList.remove('hidden'); }
    else { pane.setAttribute('hidden', ''); pane.classList.add('hidden'); }
  });
  document.querySelectorAll('#tabbar .pk-tab').forEach(el => {
    el.classList.toggle('on', el.dataset.tab === tab);
  });
  if (tab === 'play') renderPlay();
  if (tab === 'study') renderStudy();
  if (tab === 'journal') renderJournal();
  renderCrumb();
  if (state.helpMode) { hide($('help-tooltip')); highlightHelpTargets(); }
}

// ============================================================
// Analysis Pathways — cross-feature navigation + breadcrumb
// ============================================================
function currentLocationLabel() {
  if (state.tab === 'journal') return 'Journal';
  if (state.tab === 'study') return state.studySub === 'matrix' ? 'Matrix' : 'Scenarios';
  return 'Play';
}

// Navigate along a pathway, remembering where we came from for the breadcrumb.
// target: { tab, studySub?, matrixHand?, applyAxis?, loadHand?, scrollTo? }
function goPath(target, toastMsg) {
  state.navOrigin = { tab: state.tab, studySub: state.studySub, label: currentLocationLabel() };
  if (target.applyAxis) Object.assign(state.hbAxis, target.applyAxis);
  if (target.studySub) state.studySub = target.studySub;
  if (target.matrixHand != null) state.matrixHand = target.matrixHand;
  if (target.loadHand) {
    const hand = target.loadHand;
    if (hand.variant) state.variant = hand.variant;
    state.cards = hand.hole ? hand.hole.slice() : (hand.cards ? hand.cards.slice() : []);
    state.board = hand.board ? hand.board.slice() : [];
    state.boardPickerActive = false;
    state.armed = null;
    state.mode = 'starter';
  }
  persist();
  switchTab(target.tab || state.tab, true);
  if (toastMsg) showToast(toastMsg);
  if (target.scrollTo) {
    const el = $(target.scrollTo);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  }
}

function crumbBack() {
  const o = state.navOrigin;
  if (!o) return;
  state.navOrigin = null;
  if (o.studySub) state.studySub = o.studySub;
  persist();
  switchTab(o.tab, true);
}

function renderCrumb() {
  const el = $('crumb');
  if (!el) return;
  if (state.navOrigin) {
    el.innerHTML = `<span class="u-crumb-back"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3L5 7l4 4"/></svg>Back to ${state.navOrigin.label}</span><span class="u-crumb-badge">pathway</span>`;
    el.querySelector('.u-crumb-back').onclick = crumbBack;
    show(el);
  } else {
    hide(el);
  }
}

// Build a teal inline pathway link element.
function plink(label, onClick) {
  const el = h('div', 'st-plink', `${label}<svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5"/></svg>`);
  el.onclick = onClick;
  return el;
}

// Derive a hand-builder query (hbAxis) from a concrete set of hole cards.
function handToAxis(cards) {
  const ranks = cards.map(c => c.rank), suits = cards.map(c => c.suit);
  const counts = {}; ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
  const sc = {}; suits.forEach(s => sc[s] = (sc[s] || 0) + 1);
  const pairCount = Object.values(counts).filter(v => v >= 2).length;
  const suitPairs = Object.values(sc).filter(v => v >= 2).length;
  const suited = suitPairs >= 2 ? 'ds' : suitPairs === 1 ? 'ss' : 'rainbow';
  let structure = 'any';
  if (pairCount >= 2) structure = 'dpair';
  else if (pairCount === 1) structure = 'pair';
  else {
    const vals = [...new Set(cards.map(c => rv(c.rank)))].sort((a, b) => a - b);
    let conn = 0;
    for (let i = 1; i < vals.length; i++) if (vals[i] - vals[i - 1] <= 1) conn++;
    if (conn >= 2) structure = 'rundown';
    else if (ranks.every(r => 'AKQJT'.includes(r))) structure = 'broadway';
  }
  const topIdx = ranks.map(rv).sort((a, b) => b - a)[0];
  return { structure, rank: ORDER[topIdx] || 'A', rankMod: '=', suited, side: 'any' };
}

// Render the two Play-tab pathway links into the given host (when hand complete).
function renderPlayPathways(hostId) {
  const host = $(hostId);
  if (!host) return;
  host.innerHTML = '';
  if (state.cards.length !== holeCount()) return;
  host.appendChild(plink('Where does this rank?', () => {
    goPath({ tab: 'study', studySub: 'matrix', matrixHand: playMatrixCat() }, 'Showing in Matrix');
  }));
  host.appendChild(plink('Explore hands like this', () => {
    goPath({ tab: 'study', studySub: 'scenarios', applyAxis: handToAxis(state.cards), scrollTo: 'hand-builder' }, 'Loaded into Hand builder');
  }));
}

// ============================================================
// Situation Sheet
// ============================================================
function renderSituationSheet() {
  const positions = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  const players = [2, 3, 4, 5, 6, 9];
  const styles = ['Nit', 'Reg', 'TAG', 'LAG', 'Fish'];

  function renderPicks(containerId, opts, key) {
    const el = $(containerId);
    el.innerHTML = '';
    opts.forEach(o => {
      const chip = h('div', 'pk-pchip' + (String(state.situation[key]) === String(o) ? ' on' : ''), String(o));
      chip.onclick = () => {
        state.situation[key] = o;
        persist();
        renderSituationSheet();
        updateContextLabels();
      };
      el.appendChild(chip);
    });
  }

  renderPicks('sit-positions', positions, 'pos');
  renderPicks('sit-players', players, 'players');
  renderPicks('sit-styles', styles, 'style');
}

function updateContextLabels() {
  $('ctx-pos').textContent = state.situation.pos;
  $('ctx-players').textContent = state.situation.players;
  $('ctx-style').textContent = state.situation.style;
  if ($('study-ctx-pos')) {
    $('study-ctx-pos').textContent = state.situation.pos;
    $('study-ctx-players').textContent = state.situation.players;
    $('study-ctx-style').textContent = state.situation.style;
  }
}

// ============================================================
// PLAY MODE — Shared logic
// ============================================================
const FAN4 = [{ rot: -12, x: -60, y: 14 }, { rot: -4, x: -21, y: 2 }, { rot: 4, x: 21, y: 2 }, { rot: 12, x: 60, y: 14 }];
const FAN5 = [{ rot: -14, x: -72, y: 18 }, { rot: -7, x: -36, y: 6 }, { rot: 0, x: 0, y: 0 }, { rot: 7, x: 36, y: 6 }, { rot: 14, x: 72, y: 18 }];
const FAN6 = [{ rot: -15, x: -80, y: 20 }, { rot: -9, x: -48, y: 10 }, { rot: -3, x: -16, y: 2 }, { rot: 3, x: 16, y: 2 }, { rot: 9, x: 48, y: 10 }, { rot: 15, x: 80, y: 20 }];
function getFan() { const n = holeCount(); return n === 6 ? FAN6 : n === 5 ? FAN5 : FAN4; }

function usedSet() {
  return new Set([...state.cards, ...state.board].map(c => c.rank + c.suit));
}

function placeCard(suit) {
  if (!state.armed) return;
  const maxHole = holeCount();
  const used = usedSet();
  if (used.has(state.armed + suit)) { state.armed = null; return; }

  if (state.boardPickerActive) {
    if (state.board.length >= 5) return;
    state.board.push({ rank: state.armed, suit });
  } else {
    if (state.cards.length >= maxHole) return;
    state.cards.push({ rank: state.armed, suit });
  }
  state.armed = null;
  persist();
  renderPlay();
}

function removeCardAt(i) {
  state.cards.splice(i, 1);
  state.boardPickerActive = false;
  persist();
  renderPlay();
}

function removeBoardAt(i) {
  state.board.splice(i, 1);
  persist();
  renderPlay();
}

function clearBoard() {
  state.board = [];
  state.boardPickerActive = false;
  persist();
  renderPlay();
}

function newHand() {
  state.cards = [];
  state.board = [];
  state.armed = null;
  state.boardPickerActive = false;
  persist();
  renderPlay();
}

function saveCurrentHand() {
  const maxHole = holeCount();
  if (state.cards.length !== maxHole) return;
  const adv = advise(state.cards);
  const madeHand = state.board.length >= 3 ? evaluateOmaha(state.cards, state.board) : null;
  const entry = {
    id: 'u' + Date.now(), s: 'live', ts: Date.now(),
    hole: state.cards.slice(), board: state.board.slice(),
    advised: adv.action, size: adv.sizing ? adv.sizing.to : null,
    took: adv.action, equity: adv.equity, conf: adv.confidence,
    result: 'pending', amt: 0, tags: [], note: '',
    variant: state.variant, madeHand: madeHand ? madeHand.name : null,
    position: state.situation.pos,
    players: state.situation.players,
    econ: { pot: state.econ.pot, toCall: state.econ.toCall, stack: state.econ.stack }
  };
  state.savedHands.unshift(entry);
  if (state.savedHands.length > 100) state.savedHands = state.savedHands.slice(0, 100);
  persist();
  showToast('Saved to Journal');
}

// ============================================================
// PLAY MODE — Render
// ============================================================
function renderPlay() {
  renderVariantSelector('play-variants');
  const isExpert = state.mode === 'expert';
  const seg = $('play-seg');
  seg.classList.toggle('expert', isExpert);
  $('btn-starter').classList.toggle('on', !isExpert);
  $('btn-expert').classList.toggle('on', isExpert);

  if (isExpert) {
    hide($('view-starter'));
    show($('view-expert'));
    renderExpert();
  } else {
    show($('view-starter'));
    hide($('view-expert'));
    renderStarter();
  }
}

// ── Starter View ──
function renderStarter() {
  const cards = state.cards;
  const maxHole = holeCount();
  const adv = advise(cards);
  const ready = cards.length === maxHole;
  const used = usedSet();
  const madeHand = ready && state.board.length >= 3 ? evaluateOmaha(cards, state.board) : null;

  // ring
  const ring = $('starter-ring');
  const inner = $('starter-ring-inner');
  const pct = cards.length ? adv.equity : 0;
  ring.style.width = ring.style.height = (ready ? 168 : 120) + 'px';
  ring.style.background = `conic-gradient(${cards.length ? adv.color : 'rgba(255,255,255,.1)'} 0 ${pct}%, rgba(255,255,255,.07) ${pct}% 100%)`;
  inner.style.inset = (ready ? 15 : 12) + 'px';

  if (ready) {
    const handLabel = madeHand ? `<div style="font-size:11px;color:var(--pk-ink3);margin-top:1px">${madeHand.name}</div>` : '';
    inner.innerHTML = `<div class="mono" style="color:${adv.color};font-weight:800;font-size:28px;letter-spacing:.03em">${adv.action}</div>
      <div class="mono" style="font-size:13px;color:var(--pk-ink2);margin-top:2px">${adv.equity}% equity</div>${handLabel}`;
  } else {
    inner.innerHTML = `<div class="pk-eyebrow">Equity</div>
      <div class="mono" style="font-size:26px;font-weight:700;color:${cards.length ? 'var(--pk-ink)' : 'var(--pk-ink3)'};margin-top:3px">${cards.length ? '~' + adv.equity + '%' : '—'}</div>`;
  }

  // details (sizing + confidence)
  const details = $('starter-details');
  if (ready) {
    show(details);
    const pill = $('starter-sizing');
    if (adv.sizing) {
      pill.style.display = '';
      pill.style.background = 'rgba(245,158,11,.16)';
      pill.style.border = '1px solid rgba(245,158,11,.45)';
      pill.style.color = adv.color;
      pill.textContent = adv.action === 'RAISE' ? 'to ' + adv.sizing.to + ' · ' + adv.sizing.bb : adv.sizing.to + ' to call';
    } else {
      pill.style.display = 'none';
    }
    $('starter-conf').textContent = adv.confidence + '%';
    $('starter-conf-mark').style.left = adv.confidence + '%';
  } else {
    hide(details);
  }

  // fan
  const fan = $('starter-fan');
  const fanPositions = getFan();
  const cardW = maxHole > 4 ? 68 : 84;
  const cardH = maxHole > 4 ? 96 : 118;
  fan.style.height = (ready ? 134 : 124) + 'px';
  fan.style.marginTop = (ready ? 16 : 18) + 'px';
  fan.innerHTML = '';
  fanPositions.forEach((f, i) => {
    const c = cards[i];
    const next = !c && i === cards.length && !state.boardPickerActive;
    const wrap = h('div', 'pk-fan-card', null, {
      style: { transformOrigin: 'center bottom', transform: `translateX(-50%) translateX(${f.x}px) translateY(${f.y}px) rotate(${f.rot}deg)` }
    });
    if (c) {
      wrap.innerHTML = faceCardHTML(c.rank, c.suit, cardW, cardH);
      wrap.onclick = () => removeCardAt(i);
    } else {
      wrap.innerHTML = `<div class="pk-slot${next ? ' next' : ''}" style="width:${cardW}px;height:${cardH}px;font-size:20px">${next ? '+' : ''}</div>`;
    }
    fan.appendChild(wrap);
  });

  // board area
  renderStarterBoard(ready);

  // pot economics
  renderStarterEcon(ready);

  // sheets
  if (ready && !state.boardPickerActive) {
    hide($('starter-picker'));
    show($('starter-result'));
    $('starter-reason').textContent = reasonText(cards, adv);
    renderPlayPathways('starter-plinks');
  } else {
    show($('starter-picker'));
    hide($('starter-result'));
    renderStarterKeypad();
  }
}

function renderStarterKeypad() {
  const used = usedSet();
  const pad = $('starter-rankpad');
  pad.innerHTML = '';
  RANKS.forEach(r => {
    const key = h('div', 'pk-key' + (state.armed === r ? ' on' : ''), r, { style: { height: '44px' } });
    key.onclick = () => { state.armed = r; renderStarterKeypad(); };
    pad.appendChild(key);
  });
  const clearKey = h('div', 'pk-key util', 'clear all', { style: { height: '44px', gridColumn: 'span 2', gap: '6px' } });
  clearKey.onclick = newHand;
  pad.appendChild(clearKey);

  const maxCards = state.boardPickerActive ? 5 : holeCount();
  const currentCount = state.boardPickerActive ? state.board.length : state.cards.length;
  $('starter-suit-label').textContent = (state.boardPickerActive ? 'Board · Suit' : '2 · Suit') + (state.armed ? ' for ' + state.armed : '');

  const suitrow = $('starter-suitrow');
  suitrow.innerHTML = '';
  Object.entries(SUIT).forEach(([k, v]) => {
    const dead = !state.armed || used.has(state.armed + k) || currentCount >= maxCards;
    const btn = h('div', 'pk-suitkey' + (dead ? ' dead' : ''), v.g, { style: { color: v.c } });
    btn.onclick = () => placeCard(k);
    suitrow.appendChild(btn);
  });
}

// ── Starter Board Rendering ──
function renderStarterBoard(ready) {
  const wrap = $('starter-board-wrap');
  if (!ready) { hide(wrap); return; }

  show(wrap);
  const board = state.board;
  const madeHand = board.length >= 3 ? evaluateOmaha(state.cards, board) : null;
  const danger = boardDanger(board);

  let html = '<div class="pk-board-area">';
  html += '<div class="pk-board-label-row"><span class="pk-eyebrow">Community cards</span>';
  if (board.length > 0) html += '<span class="mono" style="font-size:11px;color:var(--pk-ink3);cursor:pointer" id="clear-board-starter">clear board</span>';
  html += '</div>';

  html += '<div class="pk-board-slots">';
  const streetLabels = ['Flop','','','Turn','River'];
  for (let i = 0; i < 5; i++) {
    if (i === 3) html += '<div class="pk-board-sep"></div>';
    const c = board[i];
    const next = !c && i === board.length && state.boardPickerActive;
    const hasLabel = i === 0 || i === 3 || i === 4;
    if (hasLabel) {
      html += '<div style="display:flex;flex-direction:column;align-items:center">';
      html += `<div class="pk-board-street-label">${streetLabels[i]}</div>`;
    }
    if (c) {
      html += `<div class="pk-board-slot filled" data-board-idx="${i}">${chipCardHTML(c.rank, c.suit, 40, 56)}</div>`;
    } else {
      html += `<div class="pk-board-slot${next ? ' next' : ''}" data-board-idx="${i}">${next ? '+' : ''}</div>`;
    }
    if (hasLabel) html += '</div>';
  }
  html += '</div>';

  if (madeHand) {
    const nutClass = isNutHand(state.cards, board) ? 'background:var(--pk-teal-dim);border:1px solid var(--pk-teal);color:var(--pk-teal)' : 'background:var(--pk-surface2);color:var(--pk-ink3)';
    html += `<div class="pk-made-hand"><span class="mh-name">${madeHand.name}</span><span class="mh-nut" style="${nutClass}">${isNutHand(state.cards, board) ? 'NUT' : ''}</span></div>`;
  }

  if (danger.reasons.length > 0) {
    html += '<div class="pk-board-danger">';
    danger.reasons.forEach(r => {
      html += `<span class="pk-danger-chip${danger.level === 'medium' ? ' warn' : ''}">${r}</span>`;
    });
    html += '</div>';
  }

  if (board.length === 0 && !state.boardPickerActive) {
    html = `<div class="pk-board-prompt" id="board-prompt-starter">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 3v8M3 7h8"/></svg>
      Add board cards</div>`;
  }

  html += '</div>';
  wrap.innerHTML = html;

  if ($('board-prompt-starter')) {
    $('board-prompt-starter').onclick = () => {
      state.boardPickerActive = true;
      show($('starter-picker'));
      hide($('starter-result'));
      renderStarterKeypad();
    };
  }
  if ($('clear-board-starter')) {
    $('clear-board-starter').onclick = clearBoard;
  }
  wrap.querySelectorAll('.pk-board-slot').forEach(el => {
    el.onclick = () => {
      const idx = parseInt(el.dataset.boardIdx);
      if (state.board[idx]) {
        removeBoardAt(idx);
      } else if (idx === state.board.length) {
        state.boardPickerActive = true;
        show($('starter-picker'));
        hide($('starter-result'));
        renderStarterKeypad();
      }
    };
  });
}

// ── Starter Pot Economics ──
function renderStarterEcon(ready) {
  const wrap = $('starter-econ-wrap');
  if (!ready) { hide(wrap); return; }
  show(wrap);

  const { pot, toCall, stack } = state.econ;
  const breakEven = calcPotOdds(pot, toCall);
  const adv = advise(state.cards);
  const haveEquity = adv.equity;
  const isGood = haveEquity >= breakEven;

  wrap.innerHTML = `<div class="pk-econ-card" id="econ-card-starter">
    <div class="pk-econ-header" id="econ-toggle-starter">
      <span style="font-weight:650;font-size:14px">Situation</span>
      <span class="chev"><svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 5l4 4 4-4"/></svg></span>
    </div>
    <div class="pk-econ-body">
      <div class="pk-econ-row">
        <span class="elabel">Pot</span>
        <div class="pk-econ-stepper">
          <span class="ebtn" data-econ="pot" data-dir="-1">−</span>
          <span class="eval">$${pot}</span>
          <span class="ebtn" data-econ="pot" data-dir="1">+</span>
        </div>
      </div>
      <div class="pk-econ-row">
        <span class="elabel">Call</span>
        <div class="pk-econ-stepper">
          <span class="ebtn" data-econ="toCall" data-dir="-1">−</span>
          <span class="eval">$${toCall}</span>
          <span class="ebtn" data-econ="toCall" data-dir="1">+</span>
        </div>
      </div>
      <div class="pk-econ-row">
        <span class="elabel">Stack</span>
        <div class="pk-econ-stepper">
          <span class="ebtn" data-econ="stack" data-dir="-1">−</span>
          <span class="eval">$${stack}</span>
          <span class="ebtn" data-econ="stack" data-dir="1">+</span>
        </div>
      </div>
      <div class="pk-odds-row">
        <div class="pk-odds-chip"><div class="olabel">Pot odds</div><div class="oval">${breakEven}% need</div></div>
        <div class="pk-odds-chip ${isGood ? 'good' : 'bad'}"><div class="olabel">${isGood ? 'Good call' : 'Bad call'}</div><div class="oval">${haveEquity}% have</div></div>
      </div>
    </div>
  </div>`;

  $('econ-toggle-starter').onclick = () => {
    $('econ-card-starter').classList.toggle('collapsed');
  };

  wrap.querySelectorAll('[data-econ]').forEach(el => {
    el.onclick = () => {
      const key = el.dataset.econ;
      const dir = parseInt(el.dataset.dir);
      const step = key === 'stack' ? 100 : key === 'pot' ? 25 : 10;
      state.econ[key] = Math.max(0, state.econ[key] + dir * step);
      persist();
      renderStarterEcon(true);
    };
  });
}

// ── Expert View ──
function renderExpert() {
  const cards = state.cards;
  const maxHole = holeCount();
  const adv = advise(cards);
  const ready = cards.length === maxHole;
  const used = usedSet();

  // strip
  const strip = $('expert-strip');
  if (ready) {
    const map = { RAISE: ['rgba(245,158,11,.22)', 'rgba(245,158,11,.5)'], CALL: ['rgba(59,130,246,.2)', 'rgba(59,130,246,.45)'], FOLD: ['rgba(239,68,68,.2)', 'rgba(239,68,68,.45)'] };
    const [bg, bd] = map[adv.action] || map.FOLD;
    strip.innerHTML = `<div class="pk-badge pk-fade" style="background:linear-gradient(120deg,${bg},rgba(255,255,255,.02));border:1px solid ${bd}">
      <div class="act" style="font-size:25px;color:${adv.color}">${adv.action}</div>
      <div class="size">${adv.sizing ? `<div class="mono" style="font-size:19px;color:var(--pk-ink)">${adv.sizing.to}</div><div class="pk-eyebrow">${adv.sizing.bb}</div>` : '<div class="pk-eyebrow">no bet</div>'}</div></div>`;
  } else {
    const tintBg = adv.action === 'RAISE' ? 'rgba(245,158,11,.16)' : adv.action === 'CALL' ? 'rgba(59,130,246,.16)' : 'rgba(239,68,68,.16)';
    strip.innerHTML = `<div style="background:var(--pk-surface);border:1px solid var(--pk-line);border-radius:14px;padding:12px 14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:9px">
        <span class="pk-eyebrow">${cards.length ? 'Live read · forming' : 'Enter your hand'}</span>
        ${cards.length > 0 ? `<span class="mono" style="font-size:11px;background:${tintBg};color:${adv.color};font-weight:700;padding:3px 9px;border-radius:7px">${adv.action}?</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="mono" style="font-size:28px;font-weight:700;color:${cards.length ? 'var(--pk-ink)' : 'var(--pk-ink3)'}">${cards.length ? '~' + adv.equity : '—'}<span style="font-size:15px;color:var(--pk-ink3)">%</span></div>
        <div class="pk-progress" style="flex:1"><i style="width:${cards.length ? adv.equity : 0}%;background:${adv.color}"></i></div>
      </div></div>`;
  }

  // stat chips
  const stats = $('expert-stats');
  stats.innerHTML = '';
  [['Equity', ready ? adv.equity + '%' : '—', 'var(--pk-teal)'], ['Pot odds', ready ? adv.potOdds : '—', 'var(--pk-ink)'], ['Confidence', ready ? adv.confidence + '%' : '—', 'var(--pk-ink)']].forEach(([l, val, c]) => {
    stats.innerHTML += `<div class="pk-stat-chip"><div class="pk-eyebrow label">${l}</div><div class="value" style="color:${ready ? c : 'var(--pk-ink3)'}">${val}</div></div>`;
  });

  // card track
  const track = $('expert-track');
  track.innerHTML = '<span class="pk-eyebrow" style="width:30px">Hand</span>';
  for (let i = 0; i < maxHole; i++) {
    const c = cards[i];
    const next = !c && i === cards.length && !state.boardPickerActive;
    if (c) {
      const el = h('div', '', chipCardHTML(c.rank, c.suit, 48, 66));
      el.firstChild.style.fontSize = '17px';
      el.onclick = () => removeCardAt(i);
      track.appendChild(el);
    } else {
      track.innerHTML += `<div class="pk-slot${next ? ' next' : ''}" style="width:48px;height:66px;font-size:14px">${next ? '+' : i + 1}</div>`;
    }
  }
  track.innerHTML += '<div style="flex:1"></div>';
  if (cards.length > 0) {
    const undo = h('div', '', `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 3L3 7l4 4M3 7h7a3 3 0 010 6" stroke-linecap="round" stroke-linejoin="round"/></svg>`, {
      style: { width: '40px', height: '40px', borderRadius: '11px', background: 'var(--pk-surface2)', border: '1px solid var(--pk-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pk-ink2)', cursor: 'pointer' }
    });
    undo.onclick = () => { state.cards.pop(); state.armed = null; persist(); renderPlay(); };
    track.appendChild(undo);
  }

  // reason
  if (ready) { show($('expert-reason-wrap')); $('expert-reason').textContent = reasonText(cards, adv); renderPlayPathways('expert-plinks'); }
  else hide($('expert-reason-wrap'));

  // save
  if (ready) show($('expert-save-wrap')); else hide($('expert-save-wrap'));

  // keypad
  const pad = $('expert-rankpad');
  pad.innerHTML = '';
  RANKS.forEach(r => {
    const key = h('div', 'pk-key' + (state.armed === r ? ' on' : ''), r, { style: { height: '40px', fontSize: '16px' } });
    key.onclick = () => { state.armed = r; renderExpert(); };
    pad.appendChild(key);
  });
  const bksp = h('div', 'pk-key util', '⌫', { style: { height: '40px' } });
  bksp.onclick = () => { state.cards.pop(); state.armed = null; persist(); renderPlay(); };
  pad.appendChild(bksp);

  // suit area
  const suitarea = $('expert-suitarea');
  if (state.armed) {
    const expMaxCards = state.boardPickerActive ? 5 : maxHole;
    const expCurrentCount = state.boardPickerActive ? state.board.length : cards.length;
    suitarea.innerHTML = `<div class="pk-fade" style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--pk-teal-dim);border:1px solid var(--pk-teal);border-radius:11px">
      <span class="mono" style="font-size:13px;color:var(--pk-teal);font-weight:700;flex:0 0 auto">${state.boardPickerActive ? 'Board ' : ''}${state.armed} +</span>
      ${Object.entries(SUIT).map(([k, v]) => {
        const dead = used.has(state.armed + k) || expCurrentCount >= expMaxCards;
        return `<div data-suit="${k}" style="flex:1;text-align:center;font-size:21px;color:${v.c};padding:5px 0;border-radius:8px;background:rgba(0,0,0,.2);cursor:pointer;opacity:${dead ? .28 : 1};pointer-events:${dead ? 'none' : 'auto'}">${v.g}</div>`;
      }).join('')}</div>`;
    suitarea.querySelectorAll('[data-suit]').forEach(el => {
      el.onclick = () => placeCard(el.dataset.suit);
    });
  } else {
    suitarea.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:44px;border:1px dashed var(--pk-line2);border-radius:11px;color:var(--pk-ink3);font-size:12px" class="mono">${state.boardPickerActive ? 'pick a rank for the board' : 'pick a rank, then its suit'}</div>`;
  }

  // board + econ (expert compact)
  renderExpertBoard(ready);
  renderExpertEcon(ready);
}

function renderExpertBoard(ready) {
  const wrap = $('expert-board-wrap');
  if (!ready) { hide(wrap); return; }
  show(wrap);
  const board = state.board;
  const isBP = state.boardPickerActive;
  let html = '<div class="pk-board-compact"><span class="pk-eyebrow" style="width:36px">Board</span>';
  for (let i = 0; i < 5; i++) {
    const c = board[i];
    const next = !c && i === board.length && isBP;
    if (i === 3) html += '<span class="pk-board-sep">|</span>';
    if (c) {
      html += `<div class="pk-board-slot filled" data-bi="${i}">${chipCardHTML(c.rank, c.suit, 36, 50)}</div>`;
    } else {
      html += `<div class="pk-board-slot${next ? ' next' : ''}" data-bi="${i}" style="width:36px;height:50px;font-size:11px">${next ? '+' : ''}</div>`;
    }
  }
  if (board.length > 0) html += `<span class="pk-eyebrow" style="cursor:pointer;color:var(--pk-teal);margin-left:6px" id="exp-board-clear">CLR</span>`;
  if (!isBP) html += `<span class="pk-eyebrow" style="cursor:pointer;color:var(--pk-teal);margin-left:6px" id="exp-board-add">+BOARD</span>`;
  html += '</div>';

  // made hand + danger
  if (board.length >= 3) {
    const cards = state.cards;
    const mh = evaluateOmaha(cards, board);
    const danger = boardDanger(board);
    if (mh) html += `<div class="pk-made-hand" style="font-size:11px;margin-top:4px">${mh.name}${isNutHand(cards, board) ? ' <span style="color:var(--pk-teal)">★NUT</span>' : ''}</div>`;
    if (danger.reasons.length) html += `<div class="pk-board-danger" style="margin-top:2px">${danger.reasons.map(r => `<span class="pk-danger-chip">${r}</span>`).join('')}</div>`;
  }

  wrap.innerHTML = html;

  // wire board slot clicks
  wrap.querySelectorAll('.pk-board-slot').forEach(el => {
    el.onclick = () => {
      const idx = +el.dataset.bi;
      if (state.board[idx]) {
        removeBoardAt(idx);
      } else if (idx === state.board.length) {
        state.boardPickerActive = true;
        renderExpert();
      }
    };
  });
  const clrBtn = wrap.querySelector('#exp-board-clear');
  if (clrBtn) clrBtn.onclick = () => { clearBoard(); };
  const addBtn = wrap.querySelector('#exp-board-add');
  if (addBtn) addBtn.onclick = () => { state.boardPickerActive = true; renderExpert(); };
}

function renderExpertEcon(ready) {
  const wrap = $('expert-econ-wrap');
  if (!ready) { hide(wrap); return; }
  show(wrap);
  const e = state.econ;
  let html = '<div class="pk-econ-compact">';
  html += `<div class="pk-econ-cell"><span class="pk-eyebrow">Pot</span><div class="pk-econ-stepper"><span class="pk-step-btn" data-ef="pot" data-dir="-1">▼</span><span class="mono" style="font-size:14px;color:var(--pk-ink)">${e.pot}</span><span class="pk-step-btn" data-ef="pot" data-dir="1">▲</span></div></div>`;
  html += `<div class="pk-econ-cell"><span class="pk-eyebrow">To Call</span><div class="pk-econ-stepper"><span class="pk-step-btn" data-ef="toCall" data-dir="-1">▼</span><span class="mono" style="font-size:14px;color:var(--pk-ink)">${e.toCall}</span><span class="pk-step-btn" data-ef="toCall" data-dir="1">▲</span></div></div>`;
  const odds = e.toCall > 0 ? calcPotOdds(e.pot, e.toCall) : null;
  if (odds !== null) {
    const good = odds <= 35;
    html += `<div class="pk-econ-cell"><span class="pk-eyebrow">Odds</span><span class="pk-odds-chip ${good ? 'good' : 'bad'}">${odds}%</span></div>`;
  }
  html += `<div class="pk-econ-cell"><span class="pk-eyebrow">Stack</span><div class="pk-econ-stepper"><span class="pk-step-btn" data-ef="stack" data-dir="-1">▼</span><span class="mono" style="font-size:14px;color:var(--pk-ink)">${e.stack}</span><span class="pk-step-btn" data-ef="stack" data-dir="1">▲</span></div></div>`;
  html += '</div>';
  wrap.innerHTML = html;

  // wire steppers
  wrap.querySelectorAll('.pk-step-btn').forEach(btn => {
    btn.onclick = () => {
      const field = btn.dataset.ef;
      const dir = +btn.dataset.dir;
      const step = field === 'stack' ? 50 : (field === 'pot' ? 25 : 10);
      state.econ[field] = Math.max(0, state.econ[field] + dir * step);
      persist();
      renderExpertEcon(true);
    };
  });
}

// ============================================================
// STUDY MODE — Render
// ============================================================
function renderStudy() {
  renderVariantSelector('study-variants');
  const seg = $('study-seg');
  const isMat = state.studySub === 'matrix';
  seg.classList.toggle('matrix', isMat);
  $('btn-scenarios').classList.toggle('on', !isMat);
  $('btn-matrix').classList.toggle('on', isMat);
  if (isMat) { hide($('study-scenarios')); show($('study-matrix')); renderMatrix(); }
  else { show($('study-scenarios')); hide($('study-matrix')); renderScenarios(); }
  updateContextLabels();
}

function renderScenarios() {
  const presetsEl = $('study-presets');
  presetsEl.innerHTML = '';
  PRESETS.forEach((p, idx) => {
    const pa = advise(p.cards);
    const on = state.studyPreset === idx;
    const el = h('div', 'st-preset' + (on ? ' on' : ''));
    el.innerHTML = `<div class="pcards">${p.cards.map(c => miniCardHTML(c.rank, c.suit, 24, 33)).join('')}</div>
      <div class="pname">${p.name}</div>
      <div class="pmeta"><span class="st-dots">${[0,1,2,3,4].map(i => `<i class="${i < Math.round(pa.playability / 20) ? 'on' : ''}"></i>`).join('')}</span><span class="mono" style="font-size:10px;color:var(--pk-ink3);margin-left:auto">${pa.playability}</span></div>`;
    el.onclick = () => { state.studyPreset = idx; renderScenarios(); };
    presetsEl.appendChild(el);
  });

  // insight
  const sel = PRESETS[state.studyPreset];
  const adv = advise(sel.cards);
  $('study-insight-name').textContent = sel.name;

  const insightEl = $('study-insight');
  const nut = Math.max(1, Math.min(4, Math.round(adv.playability / 25)));
  const bgMap = { RAISE: 'linear-gradient(120deg,rgba(245,158,11,.2),rgba(245,158,11,.04))', CALL: 'linear-gradient(120deg,rgba(59,130,246,.18),rgba(59,130,246,.04))', FOLD: 'linear-gradient(120deg,rgba(239,68,68,.18),rgba(239,68,68,.04))' };
  const bdMap = { RAISE: 'rgba(245,158,11,.45)', CALL: 'rgba(59,130,246,.4)', FOLD: 'rgba(239,68,68,.4)' };

  insightEl.innerHTML = `
    <div class="pk-badge" style="background:${bgMap[adv.action]};border:1px solid ${bdMap[adv.action]}">
      <div><div class="act" style="font-size:26px;color:${adv.color}">${adv.action}</div>
        <div style="font-size:12.5px;color:var(--pk-ink2);margin-top:3px;max-width:200px;line-height:1.35">${reasonText(sel.cards, adv)}</div></div>
      <div class="size">${adv.sizing ? `<div class="mono" style="font-size:20px;color:var(--pk-ink)">${adv.sizing.to}</div><div class="pk-eyebrow">${adv.sizing.bb}</div>` : '<div class="pk-eyebrow">no bet</div>'}</div>
    </div>
    <div class="st-metric"><div class="top"><span class="pk-eyebrow">Playability</span><span class="mono" style="font-size:13px;color:var(--pk-teal);font-weight:700">${adv.playability}/100</span></div>
      <div class="st-bar"><i style="width:${adv.playability}%;background:var(--pk-teal)"></i></div></div>
    <div class="st-metric"><div class="top"><span class="pk-eyebrow">Nut potential</span><span class="mono" style="font-size:12px;color:var(--pk-ink2)">${['low','fair','strong','elite'][nut-1]}</span></div>
      <div class="st-nut">${[0,1,2,3].map(i => `<i class="${i < nut ? 'on' : ''}"></i>`).join('')}</div></div>
    <div class="pk-btn" id="study-ask-coach" style="margin-top:16px;background:var(--pk-surface2)">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6L8 1z" fill="var(--pk-teal)"/></svg>
      Ask the Coach about this hand</div>`;

  $('study-ask-coach').onclick = () => openCoach({ kind: 'hand', name: sel.name, cards: sel.cards });

  renderHandBuilder();
}

function renderMatrix() {
  const hand = state.matrixHand;
  const opp = Math.max(1, (state.situation.players || 6) - 1);
  const data = rowData(hand, opp);
  const cat = HAND_CATS[hand];
  const isExpert = state.mode === 'expert';

  $('matrix-hand-name').textContent = cat.name;
  $('matrix-ahead-pct').textContent = Math.round(data.ahead) + '%';
  $('matrix-ahead-pct').style.color = data.ahead >= 60 ? 'var(--pk-bet)' : data.ahead >= 40 ? 'var(--pk-raise)' : 'var(--pk-fold)';
  $('matrix-ahead-mark').style.left = data.ahead + '%';
  $('matrix-beat-pct').textContent = Math.round(data.beat) + '% beaten';
  $('matrix-opp-count').textContent = 'vs ' + opp + ' opp';

  // ── Visibility: expert always shows the heat grid; starter shows key
  //    matchup cards + an expander that reveals the same grid. ──
  const showGrid = isExpert || state.matrixExpanded;
  $('matrix-grid-sec').classList.toggle('hidden', !showGrid);
  $('matrix-gridwrap').classList.toggle('hidden', !showGrid);
  $('matrix-keys').classList.toggle('hidden', isExpert);
  $('matrix-expand').classList.toggle('hidden', isExpert);

  if (showGrid) renderHeatGrid(hand, opp);
  if (!isExpert) { renderKeyMatchups(data, opp); renderMatrixExpander(); }
  else { $('matrix-keys').innerHTML = ''; $('matrix-expand').innerHTML = ''; }

  // threats
  const threats = $('matrix-threats');
  threats.innerHTML = '';
  data.rows.forEach(r => {
    threats.innerHTML += `<div class="st-threat${r.outcome === 'win' ? ' win' : ''}">
      <span class="tn" style="color:${r.outcome === 'lose' ? 'var(--pk-fold)' : r.outcome === 'tie' ? 'var(--pk-raise)' : 'var(--pk-ink3)'}">${r.label}</span>
      <div class="track"><div class="fill" style="width:${Math.max(3, Math.min(100, r.pct * 1.4))}%;background:${r.color}"></div></div>
      <span class="pct" style="color:${r.outcome === 'win' ? 'var(--pk-ink3)' : 'var(--pk-ink)'}">${r.pct < 1 ? r.pct.toFixed(1) : Math.round(r.pct)}%</span></div>`;
  });

  // "Build hands in this category →" pathway link to Scenarios
  const buildLink = $('matrix-build-link');
  if (buildLink) {
    buildLink.innerHTML = '';
    buildLink.appendChild(plink('Build hands in this category', () => {
      goPath({ tab: 'study', studySub: 'scenarios', applyAxis: catQueryToAxis(hand), scrollTo: 'hand-builder' }, 'Loaded into Hand builder');
    }));
  }
}

// 9×9 alpha-blended heat grid with column codes, focused-row outline,
// and tap-to-open cell detail.
function renderHeatGrid(hand, opp) {
  const grid = $('matrix-grid');
  if (!grid) return;
  const g = gridData(opp, holeCount());
  grid.innerHTML = '';

  // header row: corner spacer + column codes
  const head = h('div', 'st-grow head');
  head.appendChild(h('div', 'st-gcorner'));
  HAND_CATS.forEach(c => head.appendChild(h('div', 'st-gcolhead', c.code)));
  grid.appendChild(head);

  // one row per "you hold" category
  HAND_CATS.forEach((rc, i) => {
    const rowEl = h('div', 'st-grow' + (i === hand ? ' on' : ''));
    const lab = h('div', 'st-growlab' + (i === hand ? ' on' : ''), rc.code);
    lab.onclick = () => { state.matrixHand = i; renderMatrix(); };
    rowEl.appendChild(lab);
    g.cells[i].forEach(cell => {
      const prob = cell.prob;
      const txt = prob < 0.5 ? '·' : String(Math.round(prob));
      const ce = h('div', 'st-gcell', txt, { style: { background: cell.bg } });
      ce.onclick = () => openCellDetail(i, cell.j, opp);
      rowEl.appendChild(ce);
    });
    grid.appendChild(rowEl);
  });
}

// Starter-mode plain-language matchup cards: top 3 threats + 1 win.
function renderKeyMatchups(data, opp) {
  const host = $('matrix-keys');
  if (!host) return;
  const threats = data.rows.filter(r => r.outcome !== 'win').sort((a, b) => b.pct - a.pct).slice(0, 3);
  const win = data.rows.filter(r => r.outcome === 'win').sort((a, b) => b.pct - a.pct)[0];
  const picks = win ? [...threats, win] : threats;

  let html = '<div class="st-seclabel"><span class="pk-eyebrow">Key matchups</span><span class="mono" style="font-size:10px;color:var(--pk-ink3)">plain language</span></div>';
  picks.forEach(r => {
    const word = r.outcome === 'lose' ? 'LOSE' : r.outcome === 'tie' ? 'TIE' : 'WIN';
    const col = r.outcome === 'lose' ? 'var(--pk-fold)' : r.outcome === 'tie' ? 'var(--pk-raise)' : 'var(--pk-bet)';
    const pctTxt = r.pct < 1 ? r.pct.toFixed(1) : Math.round(r.pct);
    html += `<div class="st-key" style="border-color:${col}33">
      <div class="kn">vs a <b>${r.name}</b></div>
      <div class="kd">opponent holds it ${pctTxt}% · &ge;1 of ${opp}</div>
      <div class="ko" style="color:${col}">${word}</div></div>`;
  });
  host.innerHTML = html;
}

function renderMatrixExpander() {
  const host = $('matrix-expand');
  if (!host) return;
  host.innerHTML = '';
  const btn = h('div', 'st-expand', (state.matrixExpanded ? 'Hide' : 'Show') + ' full heat grid');
  btn.onclick = () => { state.matrixExpanded = !state.matrixExpanded; renderMatrix(); };
  host.appendChild(btn);
}

// ── Cell detail bottom sheet ──
function openCellDetail(i, j, opp) {
  const youCat = HAND_CATS[i], oppCat = HAND_CATS[j];
  const oc = outcome(i, j);
  const word = oc === 'win' ? 'YOU WIN' : oc === 'lose' ? 'YOU LOSE' : 'TIE';
  const col = oc === 'win' ? 'var(--pk-bet)' : oc === 'lose' ? 'var(--pk-fold)' : 'var(--pk-raise)';
  const g = gridData(opp, holeCount());
  const prob = g.cells[i][j].prob;
  const pctTxt = prob < 1 ? prob.toFixed(1) : Math.round(prob);
  const explain = oc === 'win'
    ? `Your ${youCat.name.toLowerCase()} beats a ${oppCat.name.toLowerCase()}. About ${pctTxt}% of the time at least one of ${opp} opponents holds this — value-bet with confidence.`
    : oc === 'lose'
    ? `A ${oppCat.name.toLowerCase()} beats your ${youCat.name.toLowerCase()}. Roughly ${pctTxt}% of pots see ≥1 of ${opp} opponents get there — proceed with caution.`
    : `A ${oppCat.name.toLowerCase()} chops with your ${youCat.name.toLowerCase()} (~${pctTxt}% of the time across ${opp} opponents).`;

  const body = $('cell-detail-body');
  body.innerHTML = `
    <div class="st-cd-row"><span class="st-cd-tag">You hold</span><b>${youCat.name}</b></div>
    <div class="st-cd-row"><span class="st-cd-tag">Opponent</span><b>${oppCat.name}</b></div>
    <div class="st-cd-outcome" style="color:${col}">${word}</div>
    <div class="st-cd-explain">${explain}</div>
    <div class="st-cd-paths"></div>`;

  const paths = body.querySelector('.st-cd-paths');
  const buildBtn = h('div', 'st-path', `Build ${oppCat.name} hands →`);
  buildBtn.onclick = () => { closeCellDetail(); goPath({ tab: 'study', studySub: 'scenarios', applyAxis: catQueryToAxis(j), scrollTo: 'hand-builder' }, 'Loaded into Hand builder'); };
  const tryBtn = h('div', 'st-path alt', `Try a ${oppCat.name} hand in Play →`);
  tryBtn.onclick = () => {
    const ex = hbGenerateHands(catQueryToAxis(j), holeCount(), state.hbSeed);
    closeCellDetail();
    if (ex && ex.length) goPath({ tab: 'play', loadHand: { cards: ex[0] } }, 'Loaded into Advisor');
  };
  paths.appendChild(buildBtn);
  paths.appendChild(tryBtn);

  show($('cell-detail'));
}

function closeCellDetail() { hide($('cell-detail')); }

// ============================================================
// JOURNAL MODE — Render
// ============================================================
function fmtTime(ts) {
  const d = new Date(ts);
  let hr = d.getHours(), m = d.getMinutes();
  const ap = hr >= 12 ? 'PM' : 'AM';
  hr = hr % 12 || 12;
  return hr + ':' + String(m).padStart(2, '0') + ' ' + ap;
}
function fmtSession(ts) {
  const d = new Date(ts), diff = Math.floor((NOW - ts) / DAY);
  const wk = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return wk;
  return wk + ' · ' + (d.getMonth() + 1) + '/' + d.getDate();
}
function money(n) { return (n > 0 ? '+$' : n < 0 ? '−$' : '$') + Math.abs(n); }

function renderJournal() {
  const store = state.journalStore;
  const saved = state.savedHands || [];
  const hasSaved = saved.length > 0;
  const liveSession = hasSaved ? [{ id: 'live', label: 'This session', venue: 'live · just now', ts: NOW }] : [];
  const allSessions = hasSaved ? [...liveSession] : [...SESSIONS];
  const allHands = hasSaved ? [...saved] : [...SEED_HANDS];

  $('jr-session-count').textContent = allSessions.length;

  // filters
  renderJournalFilters();

  // filter hands
  const visible = allHands.filter(hand => {
    if (store.deleted.includes(hand.id)) return false;
    if (state.jFilterDate !== 'all') {
      const diff = (NOW - hand.ts) / DAY;
      if (state.jFilterDate === 'today' && diff > 1) return false;
      if (state.jFilterDate === 'week' && diff > 7) return false;
      if (state.jFilterDate === 'month' && diff > 31) return false;
    }
    if (state.jFilterResult !== 'all') {
      if (state.jFilterResult === 'win' && hand.amt <= 0) return false;
      if (state.jFilterResult === 'loss' && hand.amt >= 0) return false;
    }
    if (state.jFilterAction !== 'all' && hand.took !== state.jFilterAction) return false;
    return true;
  });

  const grouped = allSessions.map(se => ({ se, hands: visible.filter(hand => hand.s === se.id) })).filter(g => g.hands.length);
  const totalNet = visible.reduce((a, hand) => a + hand.amt, 0);

  const scroll = $('jr-scroll');
  if (!grouped.length) {
    scroll.innerHTML = `<div class="jr-empty">
      <div class="ic"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--pk-ink3)" stroke-width="1.5"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3" stroke-linecap="round"/></svg></div>
      <div class="t">${!hasSaved ? 'No hands saved yet' : 'No hands match'}</div>
      <div class="s">${!hasSaved ? 'Save your first hand from the Play tab.' : 'Try clearing a filter to see more.'}</div></div>`;
    return;
  }

  scroll.innerHTML = '';

  // Clear all button (only when there are real saved hands)
  if (hasSaved) {
    const clearRow = h('div', '', null, { style: { display: 'flex', justifyContent: 'flex-end', padding: '0 16px 6px' } });
    const clearBtn = h('div', 'mono', 'Clear all', { style: { fontSize: '11px', color: 'var(--pk-fold)', cursor: 'pointer', padding: '4px 10px', borderRadius: '6px', background: 'rgba(239,68,68,.1)' } });
    clearBtn.onclick = (e) => {
      e.stopPropagation();
      if (clearBtn.dataset.confirm) {
        state.savedHands = [];
        state.journalStore = { deleted: [], notes: {} };
        persist();
        renderJournal();
        showToast('Journal cleared');
        return;
      }
      clearBtn.textContent = 'Tap again to confirm';
      clearBtn.dataset.confirm = '1';
      clearBtn.style.background = 'rgba(239,68,68,.25)';
      setTimeout(() => { clearBtn.textContent = 'Clear all'; delete clearBtn.dataset.confirm; clearBtn.style.background = 'rgba(239,68,68,.1)'; }, 3000);
    };
    clearRow.appendChild(clearBtn);
    scroll.appendChild(clearRow);
  }
  grouped.forEach(({ se, hands }) => {
    const net = hands.reduce((a, hand) => a + hand.amt, 0);
    const wins = hands.filter(hand => hand.amt > 0).length;
    const losses = hands.filter(hand => hand.amt < 0).length;
    const followed = hands.filter(hand => hand.advised === hand.took).length;
    const live = se.id === 'live';

    // session header
    const sesh = h('div', 'jr-sesh');
    sesh.innerHTML = `<div><div class="sl">${live ? '<span style="color:var(--pk-teal)">● </span>' : ''}${fmtSession(se.ts)} · ${se.label}</div></div>
      ${!live ? `<span class="net" style="color:${net > 0 ? 'var(--pk-bet)' : net < 0 ? 'var(--pk-fold)' : 'var(--pk-ink3)'}">${money(net)}</span>` : ''}`;
    scroll.appendChild(sesh);

    const sstat = h('div', 'jr-sstat');
    sstat.textContent = live
      ? hands.length + ' saved · in progress · ' + se.venue
      : hands.length + ' hands · ' + wins + 'W ' + losses + 'L · followed coach ' + followed + '/' + hands.length + ' · ' + se.venue;
    scroll.appendChild(sstat);

    hands.forEach(hand => {
      const expanded = state.journalExpanded === hand.id;
      const diverged = hand.advised !== hand.took;
      const noteVal = store.notes[hand.id] != null ? store.notes[hand.id] : hand.note;

      const wrap = h('div', 'jr-rowwrap');
      wrap.innerHTML = `<div class="jr-delzone"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"><path d="M3 4h10M6 4V2.5h4V4M5 4l.7 9h4.6L11 4"/></svg>Delete</div>`;

      const row = h('div', 'jr-row');
      row.innerHTML = `<div class="jr-rtop">
        <div class="jr-cards">${hand.hole.map(c => miniCardHTML(c.rank, c.suit)).join('')}</div>
        <span class="jr-time">${fmtTime(hand.ts)}</span>
        <span class="jr-badge" style="color:${ACT_COLOR[hand.advised]};background:${ACT_BG[hand.advised]}">${hand.advised}</span>
        ${hand.result === 'pending'
          ? '<span class="jr-amt" style="font-size:11px;color:var(--pk-teal);background:var(--pk-teal-dim);border:1px solid var(--pk-teal);border-radius:100px;padding:3px 9px">logged</span>'
          : `<span class="jr-amt" style="color:${hand.amt > 0 ? 'var(--pk-bet)' : hand.amt < 0 ? 'var(--pk-fold)' : 'var(--pk-ink3)'}">${money(hand.amt)}</span>`}
      </div>
      <div class="jr-rmid">
        ${hand.tags.slice(0, 2).map(t => `<span class="jr-tag">${t}</span>`).join('')}
        ${diverged ? `<span class="jr-diverge"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 1v7M6 10.5v.5" stroke-linecap="round"/><circle cx="6" cy="6" r="5"/></svg>played ${hand.took.toLowerCase()}</span>` : ''}
      </div>`;

      if (expanded) {
        const variantLabel = hand.variant ? (VARIANTS.find(v => v.id === hand.variant) || {}).name || hand.variant : '';
        const posLabel = hand.position || '';
        const econHTML = hand.econ ? `<div class="jr-stats" style="margin-top:6px"><span class="st">Pot <b>$${hand.econ.pot}</b></span><span class="st">To call <b>$${hand.econ.toCall}</b></span><span class="st">Stack <b>$${hand.econ.stack}</b></span></div>` : '';
        const ctxChips = (variantLabel || posLabel) ? `<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">${variantLabel ? `<span class="jr-tag">${variantLabel}</span>` : ''}${posLabel ? `<span class="jr-tag">${posLabel}</span>` : ''}${hand.players ? `<span class="jr-tag">${hand.players}-max</span>` : ''}</div>` : '';

        row.innerHTML += `<div class="jr-exp">
          ${ctxChips}
          <div class="jr-board">
            <div class="jr-bgroup"><div class="gl">Hand</div><div class="jr-bcards">${hand.hole.map(c => chipCardHTML(c.rank, c.suit, 30, 42)).join('')}</div></div>
            ${hand.board.length ? `<div class="jr-bgroup"><div class="gl">Board</div><div class="jr-bcards">${hand.board.map(c => chipCardHTML(c.rank, c.suit, 30, 42)).join('')}</div></div>` : ''}
          </div>
          <div class="jr-cmp">
            <div class="jr-cmpcell"><div class="l">Coach advised</div><div class="v" style="color:${ACT_COLOR[hand.advised]}">${hand.advised}${hand.size ? ' ' + hand.size : ''}</div></div>
            <div class="jr-cmpcell" ${diverged ? 'style="border-color:rgba(245,158,11,.4)"' : ''}><div class="l">You played</div><div class="v" style="color:${ACT_COLOR[hand.took]}">${hand.took}${diverged ? ' ⚠' : ' ✓'}</div></div>
          </div>
          <div class="jr-stats">
            <span class="st">Equity <b>${hand.equity}%</b></span>
            <span class="st">Confidence <b>${hand.conf}%</b></span>
            <span class="st">Result <b style="color:${hand.result === 'pending' ? 'var(--pk-teal)' : hand.amt > 0 ? 'var(--pk-bet)' : hand.amt < 0 ? 'var(--pk-fold)' : 'var(--pk-ink2)'}">${hand.result === 'pending' ? 'open' : money(hand.amt)}</b></span>
          </div>
          ${econHTML}
          <div class="jr-notelabel">Your note</div>
          <textarea class="jr-note" data-hand-id="${hand.id}" placeholder="What did you learn from this hand?">${noteVal}</textarea>
          <div class="jr-expacts">
            <div class="pk-btn" data-replay="${hand.id}" style="flex:1;background:var(--pk-surface2);min-height:42px">↻ Replay in Advisor</div>
          </div>
          <div class="u-plinks jr-catlink" style="margin-top:8px"></div>
        </div>`;

        // "See [made hand] category stats →" pathway (when a made hand is known)
        const mh = hand.board && hand.board.length >= 3 ? evaluateOmaha(hand.hole, hand.board) : null;
        if (mh) {
          const linkHost = row.querySelector('.jr-catlink');
          if (linkHost) linkHost.appendChild(plink(`See ${mh.name} category stats`, () => {
            goPath({ tab: 'study', studySub: 'matrix', matrixHand: Math.max(0, Math.min(8, mh.handRank)) }, 'Showing in Matrix');
          }));
        }
      }

      row.onclick = (e) => {
        if (e.target.closest('.jr-note') || e.target.closest('.jr-expacts') || e.target.closest('.jr-catlink')) return;
        state.journalExpanded = state.journalExpanded === hand.id ? null : hand.id;
        renderJournal();
      };

      wrap.appendChild(row);

      // delete zone click
      wrap.querySelector('.jr-delzone').onclick = () => {
        store.deleted.push(hand.id);
        persist();
        if (state.journalExpanded === hand.id) state.journalExpanded = null;
        renderJournal();
      };

      scroll.appendChild(wrap);
    });
  });

  // total — append as an element (not innerHTML +=) so handlers set above survive
  const totalEl = h('div', '', `${visible.length} hands · net <b style="color:${totalNet >= 0 ? 'var(--pk-bet)' : 'var(--pk-fold)'}">${money(totalNet)}</b>`, { style: { textAlign: 'center', fontFamily: 'var(--pk-mono)', fontSize: '11px', color: 'var(--pk-ink3)', marginTop: '16px' } });
  scroll.appendChild(totalEl);

  // note change listeners
  scroll.querySelectorAll('.jr-note').forEach(el => {
    el.addEventListener('input', e => {
      store.notes[el.dataset.handId] = e.target.value;
      persist();
    });
  });

  // replay listeners
  scroll.querySelectorAll('[data-replay]').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      const allReplayable = [...state.savedHands, ...SEED_HANDS];
      const hand = allReplayable.find(h => h.id === el.dataset.replay);
      if (hand) {
        if (hand.variant) state.variant = hand.variant;
        state.cards = hand.hole.slice();
        state.board = hand.board ? hand.board.slice() : [];
        if (hand.position) state.situation.pos = hand.position;
        if (hand.econ) Object.assign(state.econ, hand.econ);
        state.boardPickerActive = false;
        state.armed = null;
        state.mode = 'starter';
        persist();
        switchTab('play');
        renderPlay();
        showToast('Loaded into Advisor');
      }
    };
  });
}

function renderJournalFilters() {
  const filtersEl = $('jr-filters');
  filtersEl.innerHTML = '';
  const filters = [
    { key: 'date', label: 'All time', stateKey: 'jFilterDate', opts: [['all','All time'],['today','Today'],['week','This week'],['month','This month']] },
    { key: 'res', label: 'Result', stateKey: 'jFilterResult', opts: [['all','Win & loss'],['win','Wins'],['loss','Losses']] },
    { key: 'act', label: 'Action', stateKey: 'jFilterAction', opts: [['all','Any action'],['RAISE','Raised'],['CALL','Called'],['FOLD','Folded']] },
  ];

  filters.forEach(f => {
    const val = state[f.stateKey];
    const active = val !== 'all';
    const isOpen = state.jFilterOpen === f.key;
    const displayText = val === 'all' ? f.label : f.opts.find(o => o[0] === val)[1];

    const pill = h('div', 'jr-fpill' + (active ? ' on' : '') + (isOpen ? ' open' : ''));
    pill.innerHTML = `<span>${displayText}</span><span class="cv"><svg width="9" height="9" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 4l3.5 3.5L9 4"/></svg></span>`;

    if (isOpen) {
      const menu = h('div', 'jr-menu');
      f.opts.forEach(([v, l]) => {
        const item = h('div', 'jr-mitem' + (val === v ? ' on' : ''));
        item.innerHTML = `${l}${val === v ? '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 7l3.5 3.5L12 4"/></svg>' : ''}`;
        item.onclick = (e) => { e.stopPropagation(); state[f.stateKey] = v; state.jFilterOpen = null; renderJournal(); };
        menu.appendChild(item);
      });
      pill.appendChild(menu);
    }

    pill.onclick = (e) => {
      e.stopPropagation();
      state.jFilterOpen = isOpen ? null : f.key;
      renderJournalFilters();
    };

    filtersEl.appendChild(pill);
  });
}

// ============================================================
// AI COACH
// ============================================================
function openCoach(context) {
  state.coachContext = context;
  state.coachOpen = true;
  state.coachConvo = buildConversation(context);
  state.coachMsgs = [{ who: 'them', text: state.coachConvo.opener }];
  state.coachUsed = new Set();
  renderCoach();
  show($('coach-sheet'));
}

function closeCoach() {
  state.coachOpen = false;
  hide($('coach-sheet'));
}

function renderCoach() {
  const byok = state.byok;
  const configured = !!(byok && (byok.configured || byok.skipped));

  if (!configured) {
    show($('coach-byok'));
    hide($('coach-chat'));
    renderByok();
    return;
  }

  hide($('coach-byok'));
  show($('coach-chat'));

  // provider label
  const prov = byok && byok.provider ? PROVIDERS.find(p => p.id === byok.provider) : null;
  $('coach-provider-label').textContent = prov ? prov.name + ' · ' + prov.model : 'demo mode';

  // context chip
  const chipEl = $('coach-ctx-chip');
  if (state.coachContext && state.coachContext.cards) {
    chipEl.innerHTML = `<div style="display:flex;gap:3px">${state.coachContext.cards.map(c => miniCardHTML(c.rank, c.suit, 20, 28)).join('')}</div>
      <span class="t"><b>${state.coachContext.name || 'Your hand'}</b></span>`;
    show(chipEl);
  } else if (state.coachContext && state.coachContext.kind === 'matrix') {
    chipEl.innerHTML = `<span class="t">Holding <b>${state.coachContext.category}</b> · ${Math.round(state.coachContext.ahead)}% ahead</span>`;
    show(chipEl);
  } else {
    hide(chipEl);
  }

  // thread
  const thread = $('coach-thread');
  thread.innerHTML = '';
  state.coachMsgs.forEach(m => {
    const el = h('div', 'co-msg ' + m.who, m.text);
    thread.appendChild(el);
  });
  thread.scrollTop = thread.scrollHeight;

  // suggestions
  const suggestEl = $('coach-suggest');
  suggestEl.innerHTML = '';
  if (state.coachConvo) {
    state.coachConvo.qa.filter(x => !state.coachUsed.has(x.q)).forEach(x => {
      const chip = h('div', 'co-chip', x.q);
      chip.onclick = () => sendCoachMsg(x.q);
      suggestEl.appendChild(chip);
    });
  }
}

function renderByok() {
  const grid = $('coach-provgrid');
  grid.innerHTML = '';
  PROVIDERS.forEach(p => {
    const on = state.coachProvider === p.id;
    const el = h('div', 'co-prov' + (on ? ' on' : ''));
    el.innerHTML = `<span class="co-mono-badge" style="background:${p.color}">${p.badge}</span>
      <span><span class="pn">${p.name}</span><br><span class="pd">${p.model}</span></span>`;
    el.onclick = () => { state.coachProvider = p.id; renderByok(); };
    grid.appendChild(el);
  });
}

function sendCoachMsg(text) {
  const t = (text || '').trim();
  if (!t) return;
  state.coachUsed.add(t);
  state.coachMsgs.push({ who: 'me', text: t });

  // find answer
  const hit = state.coachConvo && state.coachConvo.qa.find(x => x.q === t);
  const answer = hit ? hit.a : "Good question. In PLO the read comes down to nut potential and connectivity.";

  renderCoach();

  // typing indicator
  const thread = $('coach-thread');
  const typing = h('div', 'co-typing', '<i></i><i></i><i></i>');
  thread.appendChild(typing);
  thread.scrollTop = thread.scrollHeight;

  setTimeout(() => {
    typing.remove();
    state.coachMsgs.push({ who: 'them', text: answer });
    renderCoach();
  }, 1050);
}

// ============================================================
// WALKTHROUGH / ONBOARDING
// ============================================================
function renderWalkthrough() {
  if (state.wtStep < 0 || state.wtStep >= WT_STEPS.length) {
    hide($('walkthrough'));
    return;
  }
  show($('walkthrough'));
  const st = WT_STEPS[state.wtStep];
  const spot = $('wt-spot');
  const tip = $('wt-tip');
  const target = st.el ? st.el() : null;

  if (target) {
    const r = target.getBoundingClientRect();
    const pad = 6;
    Object.assign(spot.style, {
      top: (r.top - pad) + 'px', left: (r.left - pad) + 'px',
      width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px',
      borderRadius: '14px', display: 'block'
    });
    const tipBelow = r.bottom + 16;
    const tipAbove = r.top - 16;
    if (tipBelow + 150 < window.innerHeight) {
      tip.style.top = tipBelow + 'px'; tip.style.bottom = '';
    } else {
      tip.style.top = ''; tip.style.bottom = (window.innerHeight - tipAbove) + 'px';
    }
  } else {
    spot.style.display = 'none';
    tip.style.top = '35%'; tip.style.bottom = '';
  }

  $('wt-step-label').textContent = 'Step ' + (state.wtStep + 1) + ' of ' + WT_STEPS.length;
  $('wt-title').textContent = st.title;
  $('wt-body').textContent = st.body;
  $('wt-dots').innerHTML = WT_STEPS.map((_, i) => `<i class="${i === state.wtStep ? 'on' : ''}"></i>`).join('');
  $('wt-next').textContent = state.wtStep === WT_STEPS.length - 1 ? 'Got it' : 'Next';
}

// ============================================================
// HELP MODE — contextual tooltips
// ============================================================
function enterHelpMode() {
  state.helpMode = true;
  $('btn-help').classList.add('active');
  show($('help-overlay'));
  highlightHelpTargets();
}

function exitHelpMode() {
  state.helpMode = false;
  $('btn-help').classList.remove('active');
  hide($('help-overlay'));
  hide($('help-tooltip'));
  clearHighlights();
}

function toggleHelpMode() {
  if (state.helpMode) exitHelpMode();
  else enterHelpMode();
}

function clearHighlights() {
  document.querySelectorAll('.hp-highlight').forEach(el => el.classList.remove('hp-highlight'));
}

function highlightHelpTargets() {
  clearHighlights();
  const defs = HELP_DEFS[state.tab] || [];
  defs.forEach(def => {
    const sels = def.sel.split(',').map(s => s.trim());
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      if (el.classList.contains('hidden')) continue;
      if (def.showWhen && !def.showWhen(el)) continue;
      el.classList.add('hp-highlight');
      el.dataset.helpText = def.text;
      break;
    }
  });
}

function showHelpTooltip(target) {
  const text = target.dataset.helpText;
  if (!text) return;
  const tip = $('help-tooltip');
  const tipText = $('help-tip-text');
  const arrow = $('help-tip-arrow');
  tipText.textContent = text;
  show(tip);

  const r = target.getBoundingClientRect();
  const tipW = Math.min(280, window.innerWidth - 40);
  tip.style.width = tipW + 'px';
  tip.style.left = Math.max(12, Math.min(window.innerWidth - tipW - 12, r.left + r.width / 2 - tipW / 2)) + 'px';

  const spaceBelow = window.innerHeight - r.bottom;
  if (spaceBelow > 100) {
    tip.style.top = (r.bottom + 10) + 'px';
    tip.style.bottom = '';
    arrow.className = 'hp-tip-arrow below';
  } else {
    tip.style.top = '';
    tip.style.bottom = (window.innerHeight - r.top + 10) + 'px';
    arrow.className = 'hp-tip-arrow above';
  }
  arrow.style.left = Math.max(20, Math.min(tipW - 20, r.left + r.width / 2 - parseFloat(tip.style.left))) + 'px';
}

function showHelpMenu() {
  const btn = $('btn-help');
  const r = btn.getBoundingClientRect();
  const menu = $('help-menu');
  show(menu);
  menu.style.top = (r.bottom + 6) + 'px';
  menu.style.right = (window.innerWidth - r.right) + 'px';
}

function hideHelpMenu() {
  hide($('help-menu'));
}

// ============================================================
// INIT — Wire up all event listeners
// ============================================================
document.addEventListener('DOMContentLoaded', () => {

  // Splash
  if (state.onboarded) {
    hide($('splash'));
  }
  $('splash-start').onclick = () => {
    hide($('splash'));
    state.cards = [];
    state.mode = 'starter';
    state.wtStep = 0;
    persist();
    renderPlay();
    renderWalkthrough();
  };

  // Walkthrough
  $('wt-next').onclick = () => {
    state.wtStep++;
    if (state.wtStep >= WT_STEPS.length) {
      state.wtStep = -1;
      state.onboarded = true;
      save('pk-onboarded', true);
    }
    renderWalkthrough();
  };
  $('wt-skip').onclick = () => {
    state.wtStep = -1;
    state.onboarded = true;
    save('pk-onboarded', true);
    renderWalkthrough();
  };

  // Tab bar
  document.querySelectorAll('#tabbar .pk-tab').forEach(tab => {
    tab.onclick = () => switchTab(tab.dataset.tab);
  });

  // Play mode toggle
  $('btn-starter').onclick = () => { state.mode = 'starter'; persist(); renderPlay(); };
  $('btn-expert').onclick = () => { state.mode = 'expert'; persist(); renderPlay(); };

  // Situation sheet
  $('btn-situation-play').onclick = () => { renderSituationSheet(); show($('situation-sheet')); };
  $('play-ctx').onclick = () => { renderSituationSheet(); show($('situation-sheet')); };
  $('study-ctx').onclick = () => { renderSituationSheet(); show($('situation-sheet')); };
  $('situation-sheet').onclick = () => { hide($('situation-sheet')); if (state.tab === 'play') renderPlay(); else if (state.tab === 'study') renderStudy(); };
  $('situation-done').onclick = () => { hide($('situation-sheet')); if (state.tab === 'play') renderPlay(); else if (state.tab === 'study') renderStudy(); };

  // Starter mode buttons
  $('starter-clear').onclick = newHand;
  $('starter-new').onclick = newHand;
  $('starter-edit').onclick = () => { /* remove last card to go back to editing */ if (state.cards.length > 0) { state.cards.pop(); persist(); renderPlay(); } };
  $('starter-save').onclick = saveCurrentHand;

  // Expert mode buttons
  $('expert-new').onclick = newHand;
  $('expert-save').onclick = saveCurrentHand;

  // Expert type input
  $('expert-type-input').oninput = (e) => {
    const val = e.target.value;
    $('expert-type-clear').style.display = val ? '' : 'none';
    if (val) {
      state.cards = parseNotation(val);
      persist();
      renderExpert();
    }
  };
  $('expert-type-clear').onclick = () => { $('expert-type-input').value = ''; $('expert-type-clear').style.display = 'none'; };

  // Study mode
  $('btn-scenarios').onclick = () => { state.studySub = 'scenarios'; persist(); renderStudy(); };
  $('btn-matrix').onclick = () => { state.studySub = 'matrix'; persist(); renderStudy(); };
  $('matrix-prev').onclick = () => { state.matrixHand = Math.max(0, state.matrixHand - 1); renderMatrix(); };
  $('matrix-next').onclick = () => { state.matrixHand = Math.min(8, state.matrixHand + 1); renderMatrix(); };

  // Cell detail sheet — dismiss on backdrop tap
  $('cell-detail').onclick = closeCellDetail;

  // Hand builder init (renders on study mode entry)
  // Variant selectors init on first play/study render

  // Coach
  $('btn-coach-play').onclick = () => openCoach({ kind: 'play', cards: state.cards.length === holeCount() ? state.cards : undefined });
  $('btn-coach-study').onclick = () => {
    if (state.studySub === 'scenarios') {
      const sel = PRESETS[state.studyPreset];
      openCoach({ kind: 'hand', name: sel.name, cards: sel.cards });
    } else {
      const opp = Math.max(1, (state.situation.players || 6) - 1);
      const d = rowData(state.matrixHand, opp);
      openCoach({ kind: 'matrix', category: HAND_CATS[state.matrixHand].name, catIndex: state.matrixHand, ahead: d.ahead, beat: d.beat, opp });
    }
  };
  $('coach-close').onclick = closeCoach;
  $('coach-settings').onclick = () => { state.byok = null; save('pk-byok', null); renderCoach(); };
  $('coach-send').onclick = () => { sendCoachMsg($('coach-input').value); $('coach-input').value = ''; };
  $('coach-input').onkeydown = (e) => { if (e.key === 'Enter') { sendCoachMsg(e.target.value); e.target.value = ''; } };
  $('coach-skip').onclick = () => { state.byok = { skipped: true }; save('pk-byok', state.byok); renderCoach(); };
  $('coach-save-key').onclick = () => {
    const key = $('coach-key-input').value.trim();
    if (!key) return;
    state.byok = { provider: state.coachProvider, key, configured: true };
    save('pk-byok', state.byok);
    renderCoach();
  };
  $('coach-key-input').oninput = () => {
    const hasKey = $('coach-key-input').value.trim().length > 0;
    $('coach-save-key').style.opacity = hasKey ? '1' : '0.45';
    $('coach-save-key').style.pointerEvents = hasKey ? 'auto' : 'none';
  };
  $('coach-key-toggle').onclick = () => {
    const inp = $('coach-key-input');
    const showing = inp.type === 'text';
    inp.type = showing ? 'password' : 'text';
    $('coach-key-toggle').textContent = showing ? 'show' : 'hide';
  };

  // Help button — long-press or tap shows menu, help-mode toggles
  let helpMenuTimer = null;
  $('btn-help').onpointerdown = () => { helpMenuTimer = setTimeout(() => { showHelpMenu(); helpMenuTimer = 'shown'; }, 400); };
  $('btn-help').onpointerup = () => {
    if (helpMenuTimer === 'shown') { helpMenuTimer = null; return; }
    clearTimeout(helpMenuTimer); helpMenuTimer = null;
    if (!$('help-menu').classList.contains('hidden')) { hideHelpMenu(); return; }
    showHelpMenu();
  };
  $('btn-help').onpointercancel = () => { clearTimeout(helpMenuTimer); helpMenuTimer = null; };

  $('help-menu-mode').onclick = () => { hideHelpMenu(); toggleHelpMode(); };
  $('help-menu-situation').onclick = () => { hideHelpMenu(); renderSituationSheet(); show($('situation-sheet')); };
  $('help-menu-reset').onclick = () => {
    hideHelpMenu();
    state.onboarded = false;
    save('pk-onboarded', false);
    state.wtStep = 0;
    renderWalkthrough();
    showToast('Tutorial reset');
  };

  // Help mode — intercept all clicks to show tooltips or dismiss
  document.addEventListener('click', (e) => {
    if (state.helpMode) {
      if (e.target.closest('#btn-help') || e.target.closest('.hp-menu')) return;
      const hp = e.target.closest('.hp-highlight');
      if (hp) {
        e.preventDefault();
        e.stopPropagation();
        showHelpTooltip(hp);
        return;
      }
      if (e.target.closest('.hp-tip')) return;
      exitHelpMode();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!e.target.closest('#help-menu') && !e.target.closest('#btn-help')) {
      hideHelpMenu();
    }
  }, true);

  // Close filters on outside click
  document.addEventListener('click', () => { if (state.jFilterOpen) { state.jFilterOpen = null; renderJournalFilters(); } });

  // Initial render
  updateContextLabels();
  renderPlay();

  if (state.onboarded) {
    renderWalkthrough(); // will hide if step < 0
  }
});

// ============================================================
// Variant Selector
// ============================================================
function renderVariantSelector(containerId) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = VARIANTS.map(v =>
    `<div class="pk-variant-tile${state.variant === v.id ? ' on' : ''}" data-vid="${v.id}">
      <span style="font-weight:600;font-size:13px">${v.name}</span>
      <span class="pk-eyebrow" style="font-size:9px">${v.label}</span>
    </div>`
  ).join('');
  el.querySelectorAll('.pk-variant-tile').forEach(tile => {
    tile.onclick = () => {
      const newVar = tile.dataset.vid;
      if (newVar !== state.variant) {
        state.variant = newVar;
        state.cards = [];
        state.board = [];
        state.boardPickerActive = false;
        state.armed = null;
        persist();
        if (state.tab === 'play') renderPlay();
        else renderStudy();
      }
    };
  });
}

// ============================================================
// Scenario ↔ Matrix cross-link mappings
// ============================================================
// Matrix categories: 0=High Card, 1=Pair, 2=Two Pair, 3=Trips, 4=Straight, 5=Flush, 6=Full House, 7=Quads, 8=Straight Flush
// (Matrix → Scenarios now goes through catQueryToAxis(); Scenarios → Matrix uses the map below.)
const HB_TO_MATRIX = { pair: 1, dpair: 2, rundown: 4, broadway: 0, any: null };
function hbStructureToMatrixIndex(structure) { const idx = HB_TO_MATRIX[structure]; return idx != null ? idx : null; }

// ============================================================
// Hand Builder (replaces old custom builder)
// ============================================================
function renderHandBuilder() {
  const wrap = $('hand-builder');
  if (!wrap) return;
  const ax = state.hbAxis;
  const nc = holeCount();

  let html = '';

  // Query badge
  html += `<div class="hb-query"><span class="mono" style="font-size:12px;color:var(--pk-teal);font-weight:700">${hbQueryBadge(ax)}</span></div>`;

  // Fast presets
  html += '<div class="hb-presets">';
  HB_FAST_PRESETS.forEach((p, i) => {
    html += `<div class="hb-preset" data-hbp="${i}">${p.label}</div>`;
  });
  html += '</div>';

  // Structure axis
  html += '<div class="hb-section"><span class="pk-eyebrow">Structure</span><div class="hb-chips">';
  HB_STRUCTURES.forEach(s => {
    html += `<div class="hb-chip${ax.structure === s ? ' on' : ''}" data-ax="structure" data-val="${s}">${HB_STRUCT_LABELS[s]}</div>`;
  });
  html += '</div></div>';

  // Rank axis with stepper
  html += `<div class="hb-section"><span class="pk-eyebrow">Rank</span>
    <div class="hb-rank-stepper">
      <div class="hb-step-btn" data-rd="-1">◀</div>
      <div class="hb-rank-display"><span class="mono" style="font-size:18px;color:var(--pk-ink);font-weight:700">${ax.rank}${ax.rank}</span></div>
      <div class="hb-step-btn" data-rd="1">▶</div>
    </div>
    <div class="hb-chips" style="margin-top:6px">
      <div class="hb-mod${ax.rankMod === '+' ? ' on' : ''}" data-rm="+">+</div>
      <div class="hb-mod${ax.rankMod === '=' ? ' on' : ''}" data-rm="=">=</div>
      <div class="hb-mod${ax.rankMod === '-' ? ' on' : ''}" data-rm="-">−</div>
    </div></div>`;

  // Suitedness axis
  html += '<div class="hb-section"><span class="pk-eyebrow">Suitedness</span><div class="hb-chips">';
  HB_SUITED.forEach(s => {
    html += `<div class="hb-chip${ax.suited === s ? ' on' : ''}" data-ax="suited" data-val="${s}">${HB_SUITED_LABELS[s]}</div>`;
  });
  html += '</div></div>';

  // Side cards axis (only for pair/dpair structures)
  if (ax.structure === 'pair' || ax.structure === 'dpair') {
    html += '<div class="hb-section"><span class="pk-eyebrow">Side cards</span><div class="hb-chips">';
    HB_SIDES.forEach(s => {
      html += `<div class="hb-chip${ax.side === s ? ' on' : ''}" data-ax="side" data-val="${s}">${HB_SIDE_LABELS[s]}</div>`;
    });
    html += '</div></div>';
  }

  // Example hands
  const examples = hbGenerateHands(ax, nc, state.hbSeed);
  html += '<div class="hb-examples"><div style="display:flex;align-items:center;justify-content:space-between"><span class="pk-eyebrow">Examples</span><div class="hb-shuffle" style="display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--pk-teal);font-family:var(--pk-mono);font-size:11px;font-weight:600">&#x21bb; Shuffle</div></div>';
  examples.forEach(hand => {
    html += `<div class="hb-example">${hand.map(c => miniCardHTML(c.rank, c.suit, 24, 33)).join('')}</div>`;
  });
  html += '</div>';

  // Strategy insight from first example
  if (examples.length > 0) {
    const adv = advise(examples[0]);
    const matrixIdx = hbStructureToMatrixIndex(ax.structure);
    html += `<div style="margin-top:10px;padding:10px;background:var(--pk-surface2);border-radius:10px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:18px;font-weight:700;color:${adv.color}">${adv.action}</span>
        <span class="mono" style="font-size:12px;color:var(--pk-ink3)">Playability ${adv.playability}/100</span>
      </div>
      <div style="font-size:12px;color:var(--pk-ink2);margin-top:4px;line-height:1.35">${reasonText(examples[0], adv)}</div>
      ${matrixIdx !== null ? `<div class="u-plinks" style="margin-top:8px"><div class="st-plink hb-see-matrix" data-matrix-idx="${matrixIdx}">See where this ranks in the Matrix<svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5"/></svg></div></div>` : ''}
    </div>`;
  }

  wrap.innerHTML = html;

  // Wire fast presets
  wrap.querySelectorAll('.hb-preset').forEach(el => {
    el.onclick = () => {
      const p = HB_FAST_PRESETS[+el.dataset.hbp];
      Object.assign(state.hbAxis, p.axis);
      persist();
      renderHandBuilder();
    };
  });

  // Wire axis chips
  wrap.querySelectorAll('.hb-chip').forEach(el => {
    el.onclick = () => {
      state.hbAxis[el.dataset.ax] = el.dataset.val;
      persist();
      renderHandBuilder();
    };
  });

  // Wire rank stepper
  wrap.querySelectorAll('.hb-step-btn').forEach(el => {
    el.onclick = () => {
      const dir = +el.dataset.rd;
      const ri = RANKS.indexOf(ax.rank);
      const ni = Math.max(0, Math.min(RANKS.length - 1, ri + dir));
      state.hbAxis.rank = RANKS[ni];
      persist();
      renderHandBuilder();
    };
  });

  // Wire rank modifier chips
  wrap.querySelectorAll('.hb-mod').forEach(el => {
    el.onclick = () => {
      state.hbAxis.rankMod = el.dataset.rm;
      persist();
      renderHandBuilder();
    };
  });

  // Wire shuffle button
  const shuffleBtn = wrap.querySelector('.hb-shuffle');
  if (shuffleBtn) {
    shuffleBtn.onclick = () => {
      state.hbSeed = (state.hbSeed + 1) % 4;
      renderHandBuilder();
    };
  }

  // Wire "See where this ranks in the Matrix" pathway link
  const matBtn = wrap.querySelector('.hb-see-matrix');
  if (matBtn) {
    matBtn.onclick = () => {
      goPath({ tab: 'study', studySub: 'matrix', matrixHand: +matBtn.dataset.matrixIdx }, 'Showing in Matrix');
    };
  }
}
