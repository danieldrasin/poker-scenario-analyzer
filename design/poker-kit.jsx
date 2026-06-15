// poker-kit.jsx — shared foundation for Play + Study. Injects base CSS, exports atoms,
// the heuristic advisor, and the probability-matrix data model to window.
// Each <script type="text/babel"> has its own scope, so top-level consts here are private;
// everything other files need is placed on window at the bottom.

const { useState, useEffect, useMemo, useRef } = React;

(function injectKitCSS() {
  if (document.getElementById('pk-kit')) return;
  const s = document.createElement('style');
  s.id = 'pk-kit';
  s.textContent = `
  :root{
    --pk-base:#0e1525; --pk-surface:#19233a; --pk-surface2:#212d46; --pk-surface3:#2a3854;
    --pk-line:rgba(148,163,184,.12); --pk-line2:rgba(148,163,184,.24);
    --pk-teal:#00d4aa; --pk-teal-dim:rgba(0,212,170,.14);
    --pk-ink:#eef3f9; --pk-ink2:#9fb0c6; --pk-ink3:#647387;
    --pk-fold:#ef4444; --pk-call:#3b82f6; --pk-bet:#22c55e; --pk-raise:#f59e0b;
    --su-spade:#f1f5f9; --su-heart:#ff5d6c; --su-diamond:#38bdf8; --su-club:#34d399;
    --pk-mono:ui-monospace,"SF Mono","Menlo","Monaco","Consolas",monospace;
    --pk-sans:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;
  }
  .pk-stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
    background:radial-gradient(900px 600px at 50% -10%,#101a2e,#070b13 60%);overflow:hidden;}
  .pk-bezel{width:414px;height:868px;border-radius:54px;background:linear-gradient(160deg,#1b2333,#05080f);
    padding:12px;box-shadow:0 50px 100px -30px rgba(0,0,0,.9),0 0 0 2px rgba(255,255,255,.04),inset 0 0 0 2px rgba(0,0,0,.6);flex:none;}
  .pk-screen{width:390px;height:844px;background:var(--pk-base);color:var(--pk-ink);border-radius:42px;
    font-family:var(--pk-sans);position:relative;display:flex;flex-direction:column;overflow:hidden;-webkit-font-smoothing:antialiased;}
  .pk-screen *{box-sizing:border-box;}

  .pk-status{height:50px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:15px 32px 0;font-family:var(--pk-mono);}
  .pk-time{font-size:15px;font-weight:700;}
  .pk-sicons{display:flex;align-items:center;gap:6px;}
  .pk-sicons .sig{display:flex;align-items:flex-end;gap:2px;height:11px;}
  .pk-sicons .sig i{width:3px;border-radius:1px;background:var(--pk-ink);}
  .pk-sicons .sig i:nth-child(1){height:5px}.pk-sicons .sig i:nth-child(2){height:7px}
  .pk-sicons .sig i:nth-child(3){height:9px}.pk-sicons .sig i:nth-child(4){height:11px}
  .pk-batt{width:23px;height:12px;border-radius:3px;border:1.5px solid var(--pk-ink);position:relative;padding:1.5px;}
  .pk-batt::after{content:"";position:absolute;right:-3px;top:3px;width:2px;height:5px;border-radius:0 2px 2px 0;background:var(--pk-ink);}
  .pk-batt i{display:block;height:100%;width:72%;border-radius:1px;background:var(--pk-ink);}
  .pk-home{height:26px;flex:none;display:flex;align-items:center;justify-content:center;}
  .pk-home span{width:134px;height:5px;border-radius:3px;background:rgba(255,255,255,.42);}

  .pk-eyebrow{font-family:var(--pk-mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--pk-ink3);}
  .mono{font-family:var(--pk-mono);}

  .pk-card{border-radius:9px;position:relative;flex:none;font-family:var(--pk-mono);font-weight:700;line-height:1;}
  .pk-card.chip{background:var(--pk-surface2);border:1px solid var(--pk-line2);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;}
  .pk-card.chip .r{font-size:22px;}.pk-card.chip .s{font-size:18px;}
  .pk-card.face{background:linear-gradient(160deg,#fdfdfb,#eef1f6);box-shadow:0 8px 22px rgba(0,0,0,.5);border:1px solid rgba(0,0,0,.12);}
  .pk-card.face .corner{position:absolute;top:7px;left:8px;display:flex;flex-direction:column;align-items:center;}
  .pk-card.face .corner.br{top:auto;left:auto;bottom:7px;right:8px;transform:rotate(180deg);}
  .pk-card.face .r{font-size:20px;}.pk-card.face .s{font-size:16px;margin-top:1px;}
  .pk-card.face .pip{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:34px;}
  .pk-mini{border-radius:6px;background:var(--pk-surface2);border:1px solid var(--pk-line2);display:flex;align-items:center;justify-content:center;gap:2px;font-family:var(--pk-mono);font-weight:700;flex:none;}

  .pk-badge{border-radius:15px;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;}
  .pk-badge .act{font-family:var(--pk-mono);font-weight:800;letter-spacing:.04em;}
  .pk-badge .size{font-family:var(--pk-mono);font-weight:700;text-align:right;}

  .pk-ring{border-radius:50%;display:flex;align-items:center;justify-content:center;position:relative;flex:none;}
  .pk-ring .hole{position:absolute;border-radius:50%;background:var(--pk-base);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;}
  .pk-thermo{height:10px;border-radius:6px;position:relative;background:linear-gradient(90deg,#ef4444 0%,#f59e0b 50%,#22c55e 100%);}
  .pk-thermo .mark{position:absolute;top:50%;width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid var(--pk-base);transform:translate(-50%,-50%);box-shadow:0 2px 6px rgba(0,0,0,.5);transition:left .35s;}

  .pk-btn{border-radius:13px;font-family:var(--pk-sans);font-weight:650;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--pk-line2);background:var(--pk-surface);color:var(--pk-ink);min-height:46px;transition:transform .08s,filter .15s;user-select:none;}
  .pk-btn:active{transform:scale(.98);}
  .pk-btn.primary{background:var(--pk-teal);color:#053027;border:none;}
  .pk-btn.ghost{background:transparent;}

  .pk-tabbar{height:62px;flex:none;display:flex;border-top:1px solid var(--pk-line);background:rgba(13,19,33,.94);padding:9px 12px 0;z-index:3;}
  .pk-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;color:var(--pk-ink3);cursor:pointer;}
  .pk-tab .ic{width:24px;height:24px;display:flex;align-items:center;justify-content:center;}
  .pk-tab .tl{font-size:10px;font-family:var(--pk-mono);letter-spacing:.06em;}
  .pk-tab.on{color:var(--pk-teal);}

  .pk-sheet{background:var(--pk-surface);border-radius:22px 22px 0 0;border-top:1px solid var(--pk-line2);padding:10px 18px 14px;}
  .pk-grab{width:38px;height:4px;border-radius:3px;background:var(--pk-line2);margin:2px auto 10px;}
  .pk-overlay{position:absolute;inset:0;background:rgba(6,9,16,.6);z-index:8;display:flex;flex-direction:column;justify-content:flex-end;animation:pkfade .2s ease;}
  @keyframes pkfade{from{opacity:0}to{opacity:1}}
  .pk-segpick{display:grid;gap:6px;}
  .pk-pchip{border-radius:10px;border:1px solid var(--pk-line);background:var(--pk-surface2);padding:10px 4px;text-align:center;font-family:var(--pk-mono);font-size:14px;color:var(--pk-ink2);cursor:pointer;}
  .pk-pchip.on{background:var(--pk-teal-dim);border-color:var(--pk-teal);color:var(--pk-teal);font-weight:700;}
  .pk-fieldwrap{display:flex;align-items:center;gap:10px;background:var(--pk-surface);border:1px solid var(--pk-line2);border-radius:12px;padding:11px 14px;}
  .pk-fieldwrap input{flex:1;background:transparent;border:none;outline:none;color:var(--pk-ink);font-family:var(--pk-sans);font-size:15px;min-width:0;}
  .pk-fieldwrap input::placeholder{color:var(--pk-ink3);}
  `;
  document.head.appendChild(s);
})();

// ---------- suits / ranks ----------
const SUIT = { s:{g:'♠',c:'var(--su-spade)'}, h:{g:'♥',c:'var(--su-heart)'}, d:{g:'♦',c:'var(--su-diamond)'}, c:{g:'♣',c:'var(--su-club)'} };
const FACE_SUIT = { s:{g:'♠',c:'#1e293b'}, h:{g:'♥',c:'#e23744'}, d:{g:'♦',c:'#2b7fff'}, c:{g:'♣',c:'#1a9c5b'} };
const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
const ORDER = '23456789TJQKA';
const rv = r => ORDER.indexOf(r);

// ---------- heuristic PLO advisor ----------
function evaluate(cards) {
  if (!cards.length) return 0;
  const vals = cards.map(c => rv(c.rank)), ranks = cards.map(c => c.rank), suits = cards.map(c => c.suit);
  let s = 0; const sorted = [...vals].sort((a, b) => b - a), w = [1.7, 1.15, 0.55, 0.25];
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
  let conn = 0; for (let i = 1; i < uniq.length; i++) { const g = uniq[i] - uniq[i - 1]; if (g === 1) conn += 3; else if (g === 2) conn += 1.5; else if (g === 3) conn += 0.5; }
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
  return { ready: cards.length === 4, equity, action, color, sizing, confidence, potOdds, playability: Math.round(score) };
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

// ---------- probability matrix data model ----------
// 9 made-hand categories, weakest → strongest.
const HAND_CATS = [
  { key: 'high',   short: 'High',    name: 'High Card' },
  { key: 'pair',   short: 'Pair',    name: 'One Pair' },
  { key: 'two',    short: '2 Pair',  name: 'Two Pair' },
  { key: 'trips',  short: 'Trips',   name: 'Trips / Set' },
  { key: 'str',    short: 'Straight',name: 'Straight' },
  { key: 'flush',  short: 'Flush',   name: 'Flush' },
  { key: 'boat',   short: 'Boat',    name: 'Full House' },
  { key: 'quads',  short: 'Quads',   name: 'Quads' },
  { key: 'sf',     short: 'St.Flush',name: 'Straight Flush' },
];
// Per-opponent probability of each category being their *best* hand by showdown (PLO, sums ~100).
const FINAL_FREQ = [6, 33, 30, 12, 9, 5.5, 3.6, 0.35, 0.05];

// field probability ≥1 opponent makes category j, given `opp` opponents
function fieldProb(j, opp) { const p = FINAL_FREQ[j] / 100; return (1 - Math.pow(1 - p, opp)) * 100; }
// outcome of holding cat i vs opponent cat j: 'win' | 'tie' | 'lose'
function outcome(i, j) { return i > j ? 'win' : i < j ? 'lose' : 'tie'; }
const OUTCOME_COLOR = { win: 'var(--pk-bet)', tie: 'var(--pk-raise)', lose: 'var(--pk-fold)' };
const HEAT = ['#1f9d57', '#46b55f', '#86d873', '#d9e25a', '#f4cf45', '#f2a23c', '#ef7e3a', '#ec5640', '#e23b3b'];

// for "I hold cat i" with `opp` opponents: rows of {j, label, pct, outcome, color}, sorted threat-first
function rowData(i, opp) {
  const rows = HAND_CATS.map((c, j) => ({ j, label: c.short, name: c.name, pct: fieldProb(j, opp), outcome: outcome(i, j), color: OUTCOME_COLOR[outcome(i, j)] }));
  const rank = { lose: 0, tie: 1, win: 2 };
  rows.sort((a, b) => rank[a.outcome] - rank[b.outcome] || b.pct - a.pct);
  // probability you are beaten = ≥1 opp has a strictly better category
  let aheadP = 1; for (let j = i + 1; j < 9; j++) aheadP *= Math.pow(1 - FINAL_FREQ[j] / 100, opp);
  const beat = (1 - aheadP) * 100;
  return { rows, beat, ahead: 100 - beat };
}

// ---------- atoms ----------
function StatusBar() {
  return (<div className="pk-status"><span className="pk-time">10:24</span>
    <span className="pk-sicons">
      <span className="sig"><i></i><i></i><i></i><i></i></span>
      <svg width="16" height="12" viewBox="0 0 16 12" fill="none"><path d="M8 10.5a1.3 1.3 0 100-2.6 1.3 1.3 0 000 2.6z" fill="#eef3f9"/><path d="M3.2 6.4a7 7 0 019.6 0M1 4.1a10.2 10.2 0 0114 0M5.4 8.7a3.8 3.8 0 015.2 0" stroke="#eef3f9" strokeWidth="1.3" strokeLinecap="round"/></svg>
      <span className="pk-batt"><i></i></span></span></div>);
}
function HomeBar() { return (<div className="pk-home"><span></span></div>); }
function Card({ rank, suit, variant, w, h, onClick, style }) {
  if (variant === 'face') { const fs = FACE_SUIT[suit];
    return (<div className="pk-card face" onClick={onClick} style={{ width: w, height: h, ...style }}>
      <span className="corner" style={{ color: fs.c }}><span className="r">{rank}</span><span className="s">{fs.g}</span></span>
      <span className="pip" style={{ color: fs.c }}>{fs.g}</span>
      <span className="corner br" style={{ color: fs.c }}><span className="r">{rank}</span><span className="s">{fs.g}</span></span></div>);
  }
  const s = SUIT[suit];
  return (<div className="pk-card chip" onClick={onClick} style={{ width: w, height: h, ...style }}>
    <span className="r" style={{ color: s.c }}>{rank}</span><span className="s" style={{ color: s.c }}>{s.g}</span></div>);
}
function MiniCard({ rank, suit, w = 26, h = 36 }) {
  const s = SUIT[suit];
  return (<div className="pk-mini" style={{ width: w, height: h }}>
    <span style={{ fontSize: 13, color: s.c }}>{rank}</span><span style={{ fontSize: 11, color: s.c }}>{s.g}</span></div>);
}
function EquityRing({ pct, size, thick, accent, children }) {
  return (<div className="pk-ring" style={{ width: size, height: size, background: `conic-gradient(${accent} 0 ${pct}%, rgba(255,255,255,.07) ${pct}% 100%)` }}>
    <div className="hole" style={{ inset: thick }}>{children}</div></div>);
}
function TabBar({ active, onTab }) {
  const tabs = [
    ['play', 'Play', <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M6 4l12 7-12 7V4z" fill="currentColor"/></svg>],
    ['study', 'Study', <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5.5A1.5 1.5 0 015.5 4H10v14H5.5A1.5 1.5 0 014 16.5v-11zM18 5.5A1.5 1.5 0 0016.5 4H12v14h4.5a1.5 1.5 0 001.5-1.5v-11z"/></svg>],
    ['journal', 'Journal', <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="3" width="14" height="16" rx="2"/><path d="M8 7h6M8 11h6M8 15h3" strokeLinecap="round"/></svg>],
  ];
  return (<div className="pk-tabbar">{tabs.map(([id, lbl, ic]) => (
    <div key={id} className={'pk-tab' + (id === active ? ' on' : '')} onClick={() => onTab && onTab(id)}>
      <span className="ic">{ic}</span><span className="tl">{lbl}</span></div>))}</div>);
}
function SituationSheet({ situation, setSituation, close }) {
  const positions = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  const players = [2, 3, 4, 5, 6, 9];
  const styles = ['Nit', 'Reg', 'TAG', 'LAG', 'Fish'];
  return (<div className="pk-overlay" onClick={close}>
    <div className="pk-sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 24 }}>
      <div className="pk-grab"></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontWeight: 680, fontSize: 17 }}>Table situation</span>
        <span className="mono" style={{ color: 'var(--pk-teal)', cursor: 'pointer', fontSize: 14 }} onClick={close}>Done</span>
      </div>
      {[['Position', positions, 'pos'], ['Players', players, 'players'], ['Villain style', styles, 'style']].map(([lbl, opts, key]) => (
        <div key={key} style={{ marginBottom: 14 }}>
          <div className="pk-eyebrow" style={{ marginBottom: 8 }}>{lbl}</div>
          <div className="pk-segpick" style={{ gridTemplateColumns: `repeat(${opts.length > 5 ? 6 : opts.length},1fr)` }}>
            {opts.map(o => <div key={o} className={'pk-pchip' + (String(situation[key]) === String(o) ? ' on' : '')} onClick={() => setSituation({ ...situation, [key]: o })}>{o}</div>)}
          </div>
        </div>))}
    </div>
  </div>);
}

Object.assign(window, {
  PKSUIT: SUIT, PKFACE: FACE_SUIT, PKRANKS: RANKS, pkRv: rv,
  pkEvaluate: evaluate, pkAdvise: advise, pkReason: reasonText,
  PK_HAND_CATS: HAND_CATS, pkRowData: rowData, pkOutcome: outcome, PK_HEAT: HEAT, PK_OUTCOME_COLOR: OUTCOME_COLOR, pkFieldProb: fieldProb,
  PKStatusBar: StatusBar, PKHomeBar: HomeBar, PKCard: Card, PKMiniCard: MiniCard, PKEquityRing: EquityRing, PKTabBar: TabBar, PKSituationSheet: SituationSheet,
});
