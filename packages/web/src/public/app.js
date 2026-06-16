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

// ── PLO Heuristic Advisor (from poker-kit.jsx) ──
function evaluate(cards) {
  if (!cards.length) return 0;
  const vals = cards.map(c => rv(c.rank)), ranks = cards.map(c => c.rank), suits = cards.map(c => c.suit);
  let s = 0;
  const sorted = [...vals].sort((a, b) => b - a), w = [1.7, 1.15, 0.55, 0.25];
  sorted.forEach((v, i) => s += v * (w[i] || 0.2));
  const counts = {}; ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
  Object.entries(counts).forEach(([r, n]) => { if (n >= 2) s += 7 + rv(r) * 0.7; if (n >= 3) s -= 11; if (n >= 4) s -= 12; });
  const sc = {}; suits.forEach(x => sc[x] = (sc[x] || 0) + 1);
  const ds = Object.values(sc).filter(n => n === 2).length === 2;
  const oneSuited = Object.values(sc).filter(n => n >= 2).length >= 1;
  if (ds) s += 11; else if (oneSuited) s += 5.5;
  if (Object.values(sc).some(n => n >= 3)) s -= 5;
  if (Object.values(sc).some(n => n >= 4)) s -= 6;
  const uniq = [...new Set(vals)].sort((a, b) => a - b);
  let conn = 0;
  for (let i = 1; i < uniq.length; i++) {
    const g = uniq[i] - uniq[i - 1];
    if (g === 1) conn += 3; else if (g === 2) conn += 1.5; else if (g === 3) conn += 0.5;
  }
  s += Math.min(conn, 12);
  const frac = cards.length / 4;
  return Math.max(0, Math.min(100, s * (cards.length === 4 ? 1 : (0.9 / frac))));
}

function advise(cards) {
  const score = evaluate(cards);
  const equity = Math.round(30 + score * 0.36);
  let action = 'FOLD', color = 'var(--pk-fold)', sizing = null;
  if (equity >= 55) { action = 'RAISE'; color = 'var(--pk-raise)'; sizing = { to: '$175', bb: '3.5 bb' }; }
  else if (equity >= 46) { action = 'CALL'; color = 'var(--pk-call)'; sizing = { to: '$50', bb: 'call' }; }
  const d = Math.min(Math.abs(equity - 55), Math.abs(equity - 46));
  const confidence = Math.min(97, Math.round(72 + Math.min(d, 16) * 1.45));
  const potOdds = action === 'FOLD' ? '—' : (equity >= 55 ? '2.4:1' : '1.9:1');
  const playability = Math.round(score);
  return { ready: cards.length === 4, equity, action, color, sizing, confidence, potOdds, playability };
}

function reasonText(cards, adv) {
  const n = 4 - cards.length;
  if (n > 0) return 'Add ' + n + ' more card' + (n > 1 ? 's' : '') + ' for your read.';
  const ranks = cards.map(c => c.rank), suits = cards.map(c => c.suit);
  const counts = {}; ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
  const sc = {}; suits.forEach(s => sc[s] = (sc[s] || 0) + 1);
  const ds = Object.values(sc).filter(n => n === 2).length === 2;
  const aces = counts['A'] >= 2, anyPair = Object.values(counts).some(n => n >= 2);
  const broadway = ranks.every(r => 'AKQJT'.includes(r));
  if (aces && ds) return 'Double-suited aces — top of your raising range from the button.';
  if (aces) return 'A pair of aces with playable side cards — raise for value.';
  if (broadway && ds) return 'Double-suited broadway — premium holding, raise.';
  if (anyPair && ds) return 'Paired and double-suited — strong, raise.';
  if (adv.action === 'RAISE') return 'Connected and suited enough to raise for value.';
  if (adv.action === 'CALL') return 'Speculative — playable in position, proceed with care.';
  return 'Disconnected and offsuit — fold and wait for a better spot.';
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

// ── Matrix Data Model (from poker-kit.jsx) ──
const HAND_CATS = [
  { key: 'high',  short: 'High',     name: 'High Card' },
  { key: 'pair',  short: 'Pair',     name: 'One Pair' },
  { key: 'two',   short: '2 Pair',   name: 'Two Pair' },
  { key: 'trips', short: 'Trips',    name: 'Trips / Set' },
  { key: 'str',   short: 'Straight', name: 'Straight' },
  { key: 'flush', short: 'Flush',    name: 'Flush' },
  { key: 'boat',  short: 'Boat',     name: 'Full House' },
  { key: 'quads', short: 'Quads',    name: 'Quads' },
  { key: 'sf',    short: 'St.Flush', name: 'Straight Flush' },
];
const FINAL_FREQ = [6, 33, 30, 12, 9, 5.5, 3.6, 0.35, 0.05];
const OUTCOME_COLOR = { win: 'var(--pk-bet)', tie: 'var(--pk-raise)', lose: 'var(--pk-fold)' };

function fieldProb(j, opp) { const p = FINAL_FREQ[j] / 100; return (1 - Math.pow(1 - p, opp)) * 100; }
function outcome(i, j) { return i > j ? 'win' : i < j ? 'lose' : 'tie'; }

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

// ── Walkthrough Steps ──
const WT_STEPS = [
  { spot: { top: '62%', left: '2%', width: '96%', height: '30%' }, tipTop: '32%',
    title: 'Enter your cards', body: "Tap a rank, then a suit to deal your four hole cards — two taps each, all within your thumb's reach." },
  { spot: { top: '14%', left: '28%', width: '44%', height: '20%', radius: '50%' }, tipTop: '38%',
    title: 'Your read appears instantly', body: 'The moment all four cards are in, your RAISE / CALL / FOLD, sizing and equity show up right here.' },
  { spot: { top: '14%', left: '5%', width: '90%', height: '36%' }, tipTop: '54%',
    title: 'Swipe up to save', body: 'Got a hand worth remembering? Swipe up on the result to log it to your Journal in one gesture.' },
];

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
  situation: load('pk-situation', { pos: 'BTN', players: 6, style: 'TAG' }),
  cards: load('pk-cards', []),
  armed: null,       // selected rank awaiting suit
  savedHands: load('pk-journal-saved', []),
  onboarded: load('pk-onboarded', false),
  wtStep: -1,
  // study
  studySub: load('pk-study-sub', 'scenarios'),
  studyPreset: 0,
  matrixHand: 5,
  customOpts: { suited: 'double', struct: 'pair', hi: 'high' },
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
  coachConvo: null,
};

function persist() {
  save('pk-play-mode', state.mode);
  save('pk-situation', state.situation);
  save('pk-cards', state.cards);
  save('pk-journal-saved', state.savedHands);
  save('pk-study-sub', state.studySub);
  save('pk-journal', state.journalStore);
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
function switchTab(tab) {
  state.tab = tab;
  ['play', 'study', 'journal'].forEach(t => {
    const pane = $('pane-' + t);
    if (t === tab) { pane.removeAttribute('hidden'); pane.classList.remove('hidden'); }
    else { pane.setAttribute('hidden', ''); pane.classList.add('hidden'); }
  });
  document.querySelectorAll('#tabbar .pk-tab').forEach(el => {
    el.classList.toggle('on', el.dataset.tab === tab);
  });
  if (tab === 'study') renderStudy();
  if (tab === 'journal') renderJournal();
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
const FAN = [{ rot: -12, x: -60, y: 14 }, { rot: -4, x: -21, y: 2 }, { rot: 4, x: 21, y: 2 }, { rot: 12, x: 60, y: 14 }];

function usedSet() { return new Set(state.cards.map(c => c.rank + c.suit)); }

function placeCard(suit) {
  if (!state.armed || state.cards.length >= 4) return;
  const used = usedSet();
  if (used.has(state.armed + suit)) { state.armed = null; return; }
  state.cards.push({ rank: state.armed, suit });
  state.armed = null;
  persist();
  renderPlay();
}

function removeCardAt(i) {
  state.cards.splice(i, 1);
  persist();
  renderPlay();
}

function newHand() {
  state.cards = [];
  state.armed = null;
  persist();
  renderPlay();
}

function saveCurrentHand() {
  if (state.cards.length !== 4) return;
  const adv = advise(state.cards);
  const entry = {
    id: 'u' + Date.now(), s: 'live', ts: Date.now(),
    hole: state.cards.slice(), board: [],
    advised: adv.action, size: adv.sizing ? adv.sizing.to : null,
    took: adv.action, equity: adv.equity, conf: adv.confidence,
    result: 'pending', amt: 0, tags: [], note: ''
  };
  state.savedHands.unshift(entry);
  persist();
  showToast('Saved to Journal');
}

// ============================================================
// PLAY MODE — Render
// ============================================================
function renderPlay() {
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
  const adv = advise(cards);
  const ready = cards.length === 4;
  const used = usedSet();

  // ring
  const ring = $('starter-ring');
  const inner = $('starter-ring-inner');
  const pct = cards.length ? adv.equity : 0;
  ring.style.width = ring.style.height = (ready ? 168 : 120) + 'px';
  ring.style.background = `conic-gradient(${cards.length ? adv.color : 'rgba(255,255,255,.1)'} 0 ${pct}%, rgba(255,255,255,.07) ${pct}% 100%)`;
  inner.style.inset = (ready ? 15 : 12) + 'px';

  if (ready) {
    inner.innerHTML = `<div class="mono" style="color:${adv.color};font-weight:800;font-size:28px;letter-spacing:.03em">${adv.action}</div>
      <div class="mono" style="font-size:13px;color:var(--pk-ink2);margin-top:2px">${adv.equity}% equity</div>`;
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
  fan.style.height = (ready ? 134 : 124) + 'px';
  fan.style.marginTop = (ready ? 16 : 18) + 'px';
  fan.innerHTML = '';
  FAN.forEach((f, i) => {
    const c = cards[i];
    const next = !c && i === cards.length;
    const wrap = h('div', 'pk-fan-card', null, {
      style: { transformOrigin: 'center bottom', transform: `translateX(-50%) translateX(${f.x}px) translateY(${f.y}px) rotate(${f.rot}deg)` }
    });
    if (c) {
      wrap.innerHTML = faceCardHTML(c.rank, c.suit, 84, 118);
      wrap.onclick = () => removeCardAt(i);
    } else {
      wrap.innerHTML = `<div class="pk-slot${next ? ' next' : ''}" style="width:84px;height:118px;font-size:20px">${next ? '+' : ''}</div>`;
    }
    fan.appendChild(wrap);
  });

  // sheets
  if (ready) {
    hide($('starter-picker'));
    show($('starter-result'));
    $('starter-reason').textContent = reasonText(cards, adv);
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

  $('starter-suit-label').textContent = '2 · Suit' + (state.armed ? ' for ' + state.armed : '');

  const suitrow = $('starter-suitrow');
  suitrow.innerHTML = '';
  Object.entries(SUIT).forEach(([k, v]) => {
    const dead = !state.armed || used.has(state.armed + k) || state.cards.length >= 4;
    const btn = h('div', 'pk-suitkey' + (dead ? ' dead' : ''), v.g, { style: { color: v.c } });
    btn.onclick = () => placeCard(k);
    suitrow.appendChild(btn);
  });
}

// ── Expert View ──
function renderExpert() {
  const cards = state.cards;
  const adv = advise(cards);
  const ready = cards.length === 4;
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
  for (let i = 0; i < 4; i++) {
    const c = cards[i];
    const next = !c && i === cards.length;
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
  if (ready) { show($('expert-reason-wrap')); $('expert-reason').textContent = reasonText(cards, adv); }
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
    suitarea.innerHTML = `<div class="pk-fade" style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--pk-teal-dim);border:1px solid var(--pk-teal);border-radius:11px">
      <span class="mono" style="font-size:13px;color:var(--pk-teal);font-weight:700;flex:0 0 auto">${state.armed} +</span>
      ${Object.entries(SUIT).map(([k, v]) => {
        const dead = used.has(state.armed + k) || cards.length >= 4;
        return `<div data-suit="${k}" style="flex:1;text-align:center;font-size:21px;color:${v.c};padding:5px 0;border-radius:8px;background:rgba(0,0,0,.2);cursor:pointer;opacity:${dead ? .28 : 1};pointer-events:${dead ? 'none' : 'auto'}">${v.g}</div>`;
      }).join('')}</div>`;
    suitarea.querySelectorAll('[data-suit]').forEach(el => {
      el.onclick = () => placeCard(el.dataset.suit);
    });
  } else {
    suitarea.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:44px;border:1px dashed var(--pk-line2);border-radius:11px;color:var(--pk-ink3);font-size:12px" class="mono">pick a rank, then its suit</div>`;
  }
}

// ============================================================
// STUDY MODE — Render
// ============================================================
function renderStudy() {
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
}

function renderMatrix() {
  const hand = state.matrixHand;
  const opp = Math.max(1, (state.situation.players || 6) - 1);
  const data = rowData(hand, opp);
  const cat = HAND_CATS[hand];

  $('matrix-hand-name').textContent = cat.name;
  $('matrix-ahead-pct').textContent = Math.round(data.ahead) + '%';
  $('matrix-ahead-pct').style.color = data.ahead >= 60 ? 'var(--pk-bet)' : data.ahead >= 40 ? 'var(--pk-raise)' : 'var(--pk-fold)';
  $('matrix-ahead-mark').style.left = data.ahead + '%';
  $('matrix-beat-pct').textContent = Math.round(data.beat) + '% beaten';
  $('matrix-opp-count').textContent = 'vs ' + opp + ' opp';

  // minimap
  const mm = $('matrix-minimap');
  mm.innerHTML = '';
  const reversed = HAND_CATS.slice().reverse();
  reversed.forEach((rc, ri) => {
    const myCat = 8 - ri;
    const label = h('div', 'st-rowlabel' + (myCat === hand ? ' on' : ''), rc.short);
    label.onclick = () => { state.matrixHand = myCat; renderMatrix(); };
    mm.appendChild(label);
    const grid = h('div', 'st-mmgrid');
    HAND_CATS.forEach((oc, ci) => {
      const oc2 = outcome(myCat, ci);
      const cell = h('i', '', null, {
        style: {
          background: OUTCOME_COLOR[oc2],
          opacity: myCat === hand ? '1' : '0.34',
          outline: myCat === hand ? '1.5px solid var(--pk-ink)' : 'none',
          outlineOffset: '-1px'
        }
      });
      cell.onclick = () => { state.matrixHand = myCat; renderMatrix(); };
      grid.appendChild(cell);
    });
    mm.appendChild(grid);
  });
  // bottom axis labels
  mm.appendChild(h('div')); // spacer
  const axisGrid = h('div', 'st-mmgrid', null, { style: { marginTop: '2px' } });
  HAND_CATS.forEach(c => {
    axisGrid.innerHTML += `<span style="font-family:var(--pk-mono);font-size:6.5px;color:var(--pk-ink3);text-align:center">${c.short.slice(0, 2)}</span>`;
  });
  mm.appendChild(axisGrid);

  // threats
  const threats = $('matrix-threats');
  threats.innerHTML = '';
  data.rows.forEach(r => {
    threats.innerHTML += `<div class="st-threat${r.outcome === 'win' ? ' win' : ''}">
      <span class="tn" style="color:${r.outcome === 'lose' ? 'var(--pk-fold)' : r.outcome === 'tie' ? 'var(--pk-raise)' : 'var(--pk-ink3)'}">${r.label}</span>
      <div class="track"><div class="fill" style="width:${Math.max(3, Math.min(100, r.pct * 1.4))}%;background:${r.color}"></div></div>
      <span class="pct" style="color:${r.outcome === 'win' ? 'var(--pk-ink3)' : 'var(--pk-ink)'}">${r.pct < 1 ? r.pct.toFixed(1) : Math.round(r.pct)}%</span></div>`;
  });
}

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
  const liveSession = saved.length ? [{ id: 'live', label: 'This session', venue: 'live · just now', ts: NOW }] : [];
  const allSessions = [...liveSession, ...SESSIONS];
  const allHands = [...saved, ...SEED_HANDS];

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
      <div class="t">No hands match</div>
      <div class="s">${store.deleted.length >= allHands.length ? 'Save your first hand from the Advisor.' : 'Try clearing a filter to see more.'}</div></div>`;
    return;
  }

  scroll.innerHTML = '';
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
        row.innerHTML += `<div class="jr-exp">
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
          <div class="jr-notelabel">Your note</div>
          <textarea class="jr-note" data-hand-id="${hand.id}" placeholder="What did you learn from this hand?">${noteVal}</textarea>
          <div class="jr-expacts">
            <div class="pk-btn" data-replay="${hand.id}" style="flex:1;background:var(--pk-surface2);min-height:42px">↻ Replay in Advisor</div>
          </div>
        </div>`;
      }

      row.onclick = (e) => {
        if (e.target.closest('.jr-note') || e.target.closest('.jr-expacts')) return;
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

  // total
  scroll.innerHTML += `<div style="text-align:center;font-family:var(--pk-mono);font-size:11px;color:var(--pk-ink3);margin-top:16px">${visible.length} hands · net <b style="color:${totalNet >= 0 ? 'var(--pk-bet)' : 'var(--pk-fold)'}">${money(totalNet)}</b></div>`;

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
      const hand = [...state.savedHands, ...SEED_HANDS].find(h => h.id === el.dataset.replay);
      if (hand) {
        state.cards = hand.hole.slice();
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
  Object.assign(spot.style, { top: st.spot.top, left: st.spot.left, width: st.spot.width, height: st.spot.height, borderRadius: (st.spot.radius || '18px') });
  $('wt-tip').style.top = st.tipTop;
  $('wt-step-label').textContent = 'Step ' + (state.wtStep + 1) + ' of ' + WT_STEPS.length;
  $('wt-title').textContent = st.title;
  $('wt-body').textContent = st.body;
  $('wt-dots').innerHTML = WT_STEPS.map((_, i) => `<i class="${i === state.wtStep ? 'on' : ''}"></i>`).join('');
  $('wt-next').textContent = state.wtStep === WT_STEPS.length - 1 ? 'Got it' : 'Next';
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
  $('situation-sheet').onclick = () => hide($('situation-sheet'));
  $('situation-done').onclick = () => hide($('situation-sheet'));

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

  // Study custom builder toggle
  $('study-custom-hd').onclick = () => {
    const el = $('study-custom');
    const body = $('study-custom-body');
    el.classList.toggle('open');
    body.style.display = el.classList.contains('open') ? '' : 'none';
    if (el.classList.contains('open') && !body.innerHTML) renderCustomBuilder();
  };

  // Coach
  $('btn-coach-play').onclick = () => openCoach({ kind: 'play', cards: state.cards.length === 4 ? state.cards : undefined });
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
// Study Custom Builder
// ============================================================
function renderCustomBuilder() {
  const body = $('study-custom-body');
  body.innerHTML = '';

  const groups = [
    ['Suitedness', [['double','Double'],['single','Single'],['rainbow','Rainbow']], 'suited'],
    ['Structure', [['pair','Pair'],['nopair','No pair']], 'struct'],
    ['High cards', [['high','High'],['mid','Mid'],['low','Low']], 'hi']
  ];

  groups.forEach(([lbl, opts, key]) => {
    const row = h('div', 'st-optrow');
    row.innerHTML = `<span class="pk-eyebrow">${lbl}</span>`;
    const pick = h('div', 'pk-segpick', null, { style: { gridTemplateColumns: `repeat(${opts.length},1fr)` } });
    opts.forEach(([v, l]) => {
      const chip = h('div', 'pk-pchip' + (state.customOpts[key] === v ? ' on' : ''), l);
      chip.onclick = () => {
        state.customOpts[key] = v;
        applyCustomHand();
        renderCustomBuilder();
      };
      pick.appendChild(chip);
    });
    row.appendChild(pick);
    body.appendChild(row);
  });
}

function applyCustomHand() {
  const { suited, struct, hi } = state.customOpts;
  const pool = hi === 'high' ? ['A','K','Q','J'] : hi === 'mid' ? ['T','9','8','7'] : ['6','5','4','3'];
  let cards;
  if (struct === 'pair') cards = [C(pool[0],'s'), C(pool[0],'h'), C(pool[1],'s'), C(pool[2],'h')];
  else cards = [C(pool[0],'s'), C(pool[1],'h'), C(pool[2],'s'), C(pool[3],'h')];
  if (suited === 'single') cards = [C(cards[0].rank,'s'), C(cards[1].rank,'s'), C(cards[2].rank,'d'), C(cards[3].rank,'c')];
  if (suited === 'rainbow') cards = [C(cards[0].rank,'s'), C(cards[1].rank,'h'), C(cards[2].rank,'d'), C(cards[3].rank,'c')];

  // add as custom preset (temporary)
  state.studyPreset = -1; // special custom index
  // render with custom cards
  const presetsEl = $('study-presets');
  // We'll just update the insight directly
  const adv = advise(cards);
  $('study-insight-name').textContent = 'Custom hand';
  renderCustomInsight(cards, adv);
}

function renderCustomInsight(cards, adv) {
  const nut = Math.max(1, Math.min(4, Math.round(adv.playability / 25)));
  const bgMap = { RAISE: 'linear-gradient(120deg,rgba(245,158,11,.2),rgba(245,158,11,.04))', CALL: 'linear-gradient(120deg,rgba(59,130,246,.18),rgba(59,130,246,.04))', FOLD: 'linear-gradient(120deg,rgba(239,68,68,.18),rgba(239,68,68,.04))' };
  const bdMap = { RAISE: 'rgba(245,158,11,.45)', CALL: 'rgba(59,130,246,.4)', FOLD: 'rgba(239,68,68,.4)' };

  $('study-insight').innerHTML = `
    <div class="pk-badge" style="background:${bgMap[adv.action]};border:1px solid ${bdMap[adv.action]}">
      <div><div class="act" style="font-size:26px;color:${adv.color}">${adv.action}</div>
        <div style="font-size:12.5px;color:var(--pk-ink2);margin-top:3px;max-width:200px;line-height:1.35">${reasonText(cards, adv)}</div></div>
      <div class="size">${adv.sizing ? `<div class="mono" style="font-size:20px;color:var(--pk-ink)">${adv.sizing.to}</div><div class="pk-eyebrow">${adv.sizing.bb}</div>` : '<div class="pk-eyebrow">no bet</div>'}</div>
    </div>
    <div class="st-metric"><div class="top"><span class="pk-eyebrow">Playability</span><span class="mono" style="font-size:13px;color:var(--pk-teal);font-weight:700">${adv.playability}/100</span></div>
      <div class="st-bar"><i style="width:${adv.playability}%;background:var(--pk-teal)"></i></div></div>
    <div class="st-metric"><div class="top"><span class="pk-eyebrow">Nut potential</span><span class="mono" style="font-size:12px;color:var(--pk-ink2)">${['low','fair','strong','elite'][nut-1]}</span></div>
      <div class="st-nut">${[0,1,2,3].map(i => `<i class="${i < nut ? 'on' : ''}"></i>`).join('')}</div></div>`;
}
