// play-app.jsx — Interactive Play screen. Starter (felt spotlight) ⇄ Expert (speed keypad).
// Self-contained: injects CSS, exports PlayApp to window. PLO heuristic advisor runs live.

const { useState, useEffect, useMemo, useRef } = React;

(function injectCSS() {
  if (document.getElementById('pk-app')) return;
  const s = document.createElement('style');
  s.id = 'pk-app';
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
    padding:12px;box-shadow:0 50px 100px -30px rgba(0,0,0,.9),0 0 0 2px rgba(255,255,255,.04),inset 0 0 0 2px rgba(0,0,0,.6);
    flex:none;}
  .pk-screen{width:390px;height:844px;background:var(--pk-base);color:var(--pk-ink);border-radius:42px;
    font-family:var(--pk-sans);position:relative;display:flex;flex-direction:column;overflow:hidden;
    -webkit-font-smoothing:antialiased;}
  .pk-screen *{box-sizing:border-box;}

  .pk-status{height:50px;flex:none;display:flex;align-items:center;justify-content:space-between;
    padding:15px 32px 0;font-family:var(--pk-mono);}
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

  /* header w/ mode toggle */
  .pk-head{flex:none;padding:6px 18px 8px;display:flex;flex-direction:column;gap:8px;z-index:3;}
  .pk-headrow{display:flex;align-items:center;gap:10px;}
  .pk-seg{display:inline-flex;background:var(--pk-surface);border:1px solid var(--pk-line);border-radius:12px;
    padding:3px;position:relative;flex:1;max-width:230px;}
  .pk-seg .knob{position:absolute;top:3px;bottom:3px;left:3px;width:calc(50% - 3px);border-radius:9px;
    background:var(--pk-teal);transition:transform .26s cubic-bezier(.3,.9,.3,1);z-index:0;}
  .pk-seg.expert .knob{transform:translateX(100%);}
  .pk-seg button{flex:1;appearance:none;border:none;background:transparent;font-family:var(--pk-sans);
    font-weight:680;font-size:13px;color:var(--pk-ink2);padding:8px 6px;border-radius:9px;z-index:1;cursor:pointer;
    transition:color .2s;letter-spacing:.01em;}
  .pk-seg button.on{color:#05281f;}
  .pk-gear{width:36px;height:36px;border-radius:11px;background:var(--pk-surface);border:1px solid var(--pk-line);
    display:flex;align-items:center;justify-content:center;color:var(--pk-ink2);flex:none;cursor:pointer;}
  .pk-ctx{display:flex;align-items:center;gap:8px;cursor:pointer;width:max-content;}
  .pk-ctx .lbl{font-family:var(--pk-mono);font-size:12.5px;color:var(--pk-ink2);}
  .pk-ctx .lbl b{color:var(--pk-ink);font-weight:700;}
  .pk-ctx .chev{color:var(--pk-ink3);}
  .pk-eyebrow{font-family:var(--pk-mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--pk-ink3);}

  .pk-card{border-radius:9px;position:relative;flex:none;font-family:var(--pk-mono);font-weight:700;line-height:1;
    animation:pkpop .28s cubic-bezier(.2,.85,.25,1);}
  @keyframes pkpop{from{transform:scale(.88) translateY(6px)}to{transform:none}}
  .pk-card.chip{background:var(--pk-surface2);border:1px solid var(--pk-line2);cursor:pointer;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;}
  .pk-card.chip .r{font-size:22px;}.pk-card.chip .s{font-size:18px;}
  .pk-card.face{background:linear-gradient(160deg,#fdfdfb,#eef1f6);box-shadow:0 8px 22px rgba(0,0,0,.5);
    border:1px solid rgba(0,0,0,.12);cursor:pointer;}
  .pk-card.face .corner{position:absolute;top:7px;left:8px;display:flex;flex-direction:column;align-items:center;}
  .pk-card.face .corner.br{top:auto;left:auto;bottom:7px;right:8px;transform:rotate(180deg);}
  .pk-card.face .r{font-size:20px;}.pk-card.face .s{font-size:16px;margin-top:1px;}
  .pk-card.face .pip{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:34px;}
  .pk-slot{border-radius:9px;border:1.6px dashed var(--pk-line2);background:rgba(255,255,255,.015);
    display:flex;align-items:center;justify-content:center;flex:none;color:var(--pk-ink3);
    font-family:var(--pk-mono);font-size:17px;font-weight:600;}
  .pk-slot.next{border-style:solid;border-color:var(--pk-teal);background:var(--pk-teal-dim);color:var(--pk-teal);
    box-shadow:0 0 0 4px rgba(0,212,170,.08);}

  .pk-badge{border-radius:15px;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;
    transition:background .3s,border-color .3s;}
  .pk-badge .act{font-family:var(--pk-mono);font-weight:800;letter-spacing:.04em;}
  .pk-badge .size{font-family:var(--pk-mono);font-weight:700;text-align:right;}

  .pk-ring{border-radius:50%;display:flex;align-items:center;justify-content:center;position:relative;flex:none;
    transition:background .4s ease;}
  .pk-ring .hole{position:absolute;border-radius:50%;background:var(--pk-base);display:flex;flex-direction:column;
    align-items:center;justify-content:center;text-align:center;}

  .pk-thermo{height:10px;border-radius:6px;position:relative;
    background:linear-gradient(90deg,#ef4444 0%,#f59e0b 50%,#22c55e 100%);}
  .pk-thermo .mark{position:absolute;top:50%;width:16px;height:16px;border-radius:50%;background:#fff;
    border:3px solid var(--pk-base);transform:translate(-50%,-50%);box-shadow:0 2px 6px rgba(0,0,0,.5);transition:left .35s;}

  .pk-rankpad{display:grid;gap:7px;}
  .pk-key{border-radius:11px;background:var(--pk-surface2);border:1px solid var(--pk-line);
    display:flex;align-items:center;justify-content:center;font-family:var(--pk-mono);font-weight:700;
    color:var(--pk-ink);cursor:pointer;user-select:none;transition:transform .08s,background .15s,border-color .15s;}
  .pk-key:active{transform:scale(.93);}
  .pk-key.on{background:var(--pk-teal-dim);border-color:var(--pk-teal);color:var(--pk-teal);box-shadow:0 0 0 3px rgba(0,212,170,.1);}
  .pk-key.util{color:var(--pk-ink3);font-size:12px;}
  .pk-suitrow{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
  .pk-suitkey{aspect-ratio:1.7;border-radius:13px;background:var(--pk-surface);border:1px solid var(--pk-line2);
    display:flex;align-items:center;justify-content:center;font-size:25px;cursor:pointer;min-height:46px;
    transition:transform .08s,box-shadow .15s,opacity .15s;}
  .pk-suitkey:active{transform:scale(.93);}
  .pk-suitkey.dead{opacity:.28;pointer-events:none;}

  .pk-btn{border-radius:13px;font-family:var(--pk-sans);font-weight:650;font-size:15px;cursor:pointer;
    display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--pk-line2);
    background:var(--pk-surface);color:var(--pk-ink);min-height:46px;transition:transform .08s,filter .15s;user-select:none;}
  .pk-btn:active{transform:scale(.98);}
  .pk-btn.primary{background:var(--pk-teal);color:#053027;border:none;}
  .pk-btn.ghost{background:transparent;}

  .pk-tabbar{height:62px;flex:none;display:flex;border-top:1px solid var(--pk-line);
    background:rgba(13,19,33,.94);padding:9px 12px 0;z-index:3;}
  .pk-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;color:var(--pk-ink3);cursor:pointer;}
  .pk-tab .ic{width:24px;height:24px;display:flex;align-items:center;justify-content:center;}
  .pk-tab .tl{font-size:10px;font-family:var(--pk-mono);letter-spacing:.06em;}
  .pk-tab.on{color:var(--pk-teal);}

  .pk-progress{height:9px;border-radius:5px;background:rgba(255,255,255,.07);overflow:hidden;}
  .pk-progress i{display:block;height:100%;border-radius:5px;transition:width .35s ease,background .3s;}
  .pk-glow{position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(420px 360px at 50% 30%,rgba(0,212,170,.16),transparent 62%),
               radial-gradient(520px 460px at 50% 26%,rgba(16,84,72,.5),transparent 72%);}
  .pk-reason{font-size:13px;color:var(--pk-ink2);line-height:1.42;}
  .mono{font-family:var(--pk-mono);}
  .pk-sheet{background:var(--pk-surface);border-radius:22px 22px 0 0;border-top:1px solid var(--pk-line2);
    padding:10px 18px 14px;}
  .pk-grab{width:38px;height:4px;border-radius:3px;background:var(--pk-line2);margin:2px auto 10px;}
  .pk-field{display:flex;align-items:center;gap:10px;background:var(--pk-surface);border:1px solid var(--pk-line2);
    border-radius:12px;padding:11px 14px;}
  .pk-field input{flex:1;background:transparent;border:none;outline:none;color:var(--pk-ink);
    font-family:var(--pk-mono);font-size:16px;letter-spacing:.06em;text-transform:uppercase;min-width:0;}
  .pk-field input::placeholder{color:var(--pk-ink3);text-transform:none;letter-spacing:0;}
  .pk-fade{animation:pkfade .3s ease;}
  @keyframes pkfade{from{transform:translateY(8px)}to{transform:none}}
  .pk-overlay{position:absolute;inset:0;background:rgba(6,9,16,.55);z-index:8;display:flex;flex-direction:column;
    justify-content:flex-end;animation:pkfade .2s ease;}
  .pk-segpick{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}
  .pk-pchip{border-radius:10px;border:1px solid var(--pk-line);background:var(--pk-surface2);
    padding:10px 4px;text-align:center;font-family:var(--pk-mono);font-size:14px;color:var(--pk-ink2);cursor:pointer;}
  .pk-pchip.on{background:var(--pk-teal-dim);border-color:var(--pk-teal);color:var(--pk-teal);font-weight:700;}
  `;
  document.head.appendChild(s);
})();

// ---------- suits ----------
const SUIT = { s:{g:'♠',c:'var(--su-spade)'}, h:{g:'♥',c:'var(--su-heart)'}, d:{g:'♦',c:'var(--su-diamond)'}, c:{g:'♣',c:'var(--su-club)'} };
const FACE_SUIT = { s:{g:'♠',c:'#1e293b'}, h:{g:'♥',c:'#e23744'}, d:{g:'♦',c:'#2b7fff'}, c:{g:'♣',c:'#1a9c5b'} };
const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
const ORDER = '23456789TJQKA';
const rv = r => ORDER.indexOf(r);

// ---------- heuristic PLO advisor ----------
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
  return { ready: cards.length === 4, equity, action, color, sizing, confidence, potOdds };
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

// ---------- atoms ----------
function StatusBar() {
  return (<div className="pk-status"><span className="pk-time">10:24</span>
    <span className="pk-sicons">
      <span className="sig"><i></i><i></i><i></i><i></i></span>
      <svg width="16" height="12" viewBox="0 0 16 12" fill="none"><path d="M8 10.5a1.3 1.3 0 100-2.6 1.3 1.3 0 000 2.6z" fill="#eef3f9"/><path d="M3.2 6.4a7 7 0 019.6 0M1 4.1a10.2 10.2 0 0114 0M5.4 8.7a3.8 3.8 0 015.2 0" stroke="#eef3f9" strokeWidth="1.3" strokeLinecap="round"/></svg>
      <span className="pk-batt"><i></i></span>
    </span></div>);
}
function HomeBar() { return (<div className="pk-home"><span></span></div>); }
function Card({ rank, suit, variant, w, h, onClick, style }) {
  if (variant === 'face') {
    const fs = FACE_SUIT[suit];
    return (<div className="pk-card face" onClick={onClick} style={{ width: w, height: h, ...style }}>
      <span className="corner" style={{ color: fs.c }}><span className="r">{rank}</span><span className="s">{fs.g}</span></span>
      <span className="pip" style={{ color: fs.c }}>{fs.g}</span>
      <span className="corner br" style={{ color: fs.c }}><span className="r">{rank}</span><span className="s">{fs.g}</span></span>
    </div>);
  }
  const s = SUIT[suit];
  return (<div className="pk-card chip" onClick={onClick} style={{ width: w, height: h, ...style }}>
    <span className="r" style={{ color: s.c }}>{rank}</span><span className="s" style={{ color: s.c }}>{s.g}</span></div>);
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

// fan geometry for 4 positions
const FAN = [{ rot: -12, x: -60, y: 14 }, { rot: -4, x: -21, y: 2 }, { rot: 4, x: 21, y: 2 }, { rot: 12, x: 60, y: 14 }];

// swipe-up-to-save handle (also tappable)
function SaveHandle({ onSave, saved }) {
  const sY = useRef(null); const fired = useRef(false);
  function down(e) { sY.current = e.clientY; fired.current = false; }
  function move(e) { if (sY.current == null || fired.current) return; if (sY.current - e.clientY > 24) { fired.current = true; onSave(); } }
  function up() { sY.current = null; }
  return (<div data-wt="save" onPointerDown={down} onPointerMove={move} onPointerUp={up} onClick={() => { if (!fired.current) onSave(); }}
    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 13, cursor: 'pointer', userSelect: 'none', marginBottom: 10,
      background: saved ? 'rgba(34,197,94,.16)' : 'var(--pk-teal-dim)', border: '1px solid ' + (saved ? 'var(--pk-bet)' : 'var(--pk-teal)'),
      color: saved ? 'var(--pk-bet)' : 'var(--pk-teal)', fontFamily: 'var(--pk-sans)', fontWeight: 650, fontSize: 14 }}>
    {saved ? <><svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 7l3.5 3.5L12 4"/></svg>Saved to Journal</> : <><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 11V3M3.5 6.5L7 3l3.5 3.5"/></svg>Swipe up to save to Journal</>}
  </div>);
}

// =====================================================================
// STARTER VIEW (felt spotlight)
// =====================================================================
function StarterView({ cards, adv, armed, setArmed, place, removeAt, newHand, editing, setEditing, used, onSave, saved }) {
  const ready = cards.length === 4 && !editing;
  return (<>
    <div className="pk-glow"></div>
    <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* ring */}
      <div data-wt="rec" style={{ display: 'flex', justifyContent: 'center', marginTop: ready ? 8 : 6 }}>
        <EquityRing pct={cards.length ? adv.equity : 0} size={ready ? 168 : 120} thick={ready ? 15 : 12}
          accent={cards.length ? adv.color : 'rgba(255,255,255,.1)'}>
          {ready ? (<>
            <div className="mono" style={{ color: adv.color, fontWeight: 800, fontSize: 28, letterSpacing: '.03em' }}>{adv.action}</div>
            <div className="mono" style={{ fontSize: 13, color: 'var(--pk-ink2)', marginTop: 2 }}>{adv.equity}% equity</div>
          </>) : (<>
            <div className="pk-eyebrow">Equity</div>
            <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: cards.length ? 'var(--pk-ink)' : 'var(--pk-ink3)', marginTop: 3 }}>
              {cards.length ? '~' + adv.equity + '%' : '—'}</div>
          </>)}
        </EquityRing>
      </div>
      {/* sizing + thermo (locked only) */}
      {ready && (<div className="pk-fade" style={{ padding: '0 20px' }}>
        {adv.sizing && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <div className="mono" style={{ background: 'rgba(245,158,11,.16)', border: '1px solid rgba(245,158,11,.45)', color: adv.color, fontWeight: 700, padding: '8px 16px', borderRadius: 100, fontSize: 15 }}>
            {adv.action === 'RAISE' ? 'to ' + adv.sizing.to + ' · ' + adv.sizing.bb : adv.sizing.to + ' to call'}</div></div>}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="pk-eyebrow">Confidence</span><span className="mono" style={{ fontSize: 12, color: 'var(--pk-ink2)' }}>{adv.confidence}%</span></div>
          <div className="pk-thermo"><span className="mark" style={{ left: adv.confidence + '%' }}></span></div>
        </div>
      </div>)}
      {/* fan */}
      <div style={{ position: 'relative', height: ready ? 134 : 124, marginTop: ready ? 16 : 18 }}>
        {FAN.map((f, i) => {
          const c = cards[i];
          const next = !c && i === cards.length;
          return (<div key={i} style={{ position: 'absolute', left: '50%', top: 0, transformOrigin: 'center bottom',
            transform: `translateX(-50%) translateX(${f.x}px) translateY(${f.y}px) rotate(${f.rot}deg)` }}>
            {c ? <Card rank={c.rank} suit={c.suit} variant="face" w={84} h={118} onClick={() => removeAt(i)} />
              : <div className={'pk-slot' + (next ? ' next' : '')} style={{ width: 84, height: 118, fontSize: 20 }}>{next ? '+' : ''}</div>}
          </div>);
        })}
      </div>
      <div style={{ flex: 1, minHeight: 6 }} />
      {/* sheet: picker (entering/editing) OR action bar (locked) */}
      {ready ? (
        <div className="pk-sheet pk-fade" style={{ position: 'relative', zIndex: 1 }}>
          <div className="pk-reason" style={{ textAlign: 'center', marginBottom: 12, padding: '0 6px' }}>{reasonText(cards, adv)}</div>
          <SaveHandle onSave={onSave} saved={saved} />
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="pk-btn ghost" style={{ flex: '0 0 120px' }} onClick={() => setEditing(true)}>✎ Edit hand</div>
            <div className="pk-btn primary" style={{ flex: 1 }} onClick={newHand}>New hand</div>
          </div>
        </div>
      ) : (
        <div className="pk-sheet" data-wt="entry">
          <div className="pk-grab"></div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <span className="pk-eyebrow">1 · Rank</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--pk-ink3)', cursor: 'pointer' }} onClick={newHand}>↻ New</span>
          </div>
          <div className="pk-rankpad" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
            {RANKS.map(r => <div key={r} className={'pk-key' + (armed === r ? ' on' : '')} style={{ height: 44 }} onClick={() => setArmed(r)}>{r}</div>)}
            <div className="pk-key util" style={{ height: 44, gridColumn: 'span 2', gap: 6 }} onClick={newHand}>clear all</div>
          </div>
          <div className="pk-eyebrow" style={{ margin: '12px 0 8px' }}>2 · Suit{armed ? ' for ' + armed : ''}</div>
          <div className="pk-suitrow">
            {Object.entries(SUIT).map(([k, v]) => {
              const dead = !armed || used.has(armed + k) || cards.length >= 4;
              return <div key={k} className={'pk-suitkey' + (dead ? ' dead' : '')} style={{ color: v.c }} onClick={() => place(k)}>{v.g}</div>;
            })}
          </div>
        </div>
      )}
    </div>
  </>);
}

// =====================================================================
// EXPERT VIEW (speed keypad)
// =====================================================================
function ExpertView({ cards, adv, armed, setArmed, place, removeAt, undo, newHand, used, typeVal, setTypeVal, taps, elapsed, typed, onSave, saved }) {
  const ready = cards.length === 4;
  return (<div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    {/* live strip */}
    <div style={{ padding: '2px 16px 0' }}>
      {ready ? (
        <div className="pk-badge pk-fade" data-wt="rec" style={stripBg(adv.action)}>
          <div className="act" style={{ fontSize: 25, color: adv.color }}>{adv.action}</div>
          <div className="size">{adv.sizing ? <><div className="mono" style={{ fontSize: 19, color: 'var(--pk-ink)' }}>{adv.sizing.to}</div><div className="pk-eyebrow">{adv.sizing.bb}</div></> : <div className="pk-eyebrow">no bet</div>}</div>
        </div>
      ) : (
        <div style={{ background: 'var(--pk-surface)', border: '1px solid var(--pk-line)', borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 9 }}>
            <span className="pk-eyebrow">{cards.length ? 'Live read · forming' : 'Enter your hand'}</span>
            {cards.length > 0 && <span className="mono" style={{ fontSize: 11, background: tintBg(adv.action), color: adv.color, fontWeight: 700, padding: '3px 9px', borderRadius: 7 }}>{adv.action}?</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: cards.length ? 'var(--pk-ink)' : 'var(--pk-ink3)' }}>{cards.length ? '~' + adv.equity : '—'}<span style={{ fontSize: 15, color: 'var(--pk-ink3)' }}>%</span></div>
            <div className="pk-progress" style={{ flex: 1 }}><i style={{ width: (cards.length ? adv.equity : 0) + '%', background: adv.color }}></i></div>
          </div>
        </div>
      )}
    </div>
    {/* stat chips */}
    <div style={{ padding: '10px 16px 0', display: 'flex', gap: 8 }}>
      {[['Equity', ready ? adv.equity + '%' : '—', 'var(--pk-teal)'], ['Pot odds', ready ? adv.potOdds : '—', 'var(--pk-ink)'], ['Confidence', ready ? adv.confidence + '%' : '—', 'var(--pk-ink)']].map(([l, val, c]) => (
        <div key={l} style={{ flex: 1, background: 'var(--pk-surface)', border: '1px solid var(--pk-line)', borderRadius: 12, padding: '9px 11px' }}>
          <div className="pk-eyebrow" style={{ fontSize: 9 }}>{l}</div>
          <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: ready ? c : 'var(--pk-ink3)', marginTop: 3 }}>{val}</div>
        </div>))}
    </div>
    {/* card track */}
    <div style={{ padding: '14px 16px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="pk-eyebrow" style={{ width: 30 }}>Hand</span>
      {[0, 1, 2, 3].map(i => { const c = cards[i]; const next = !c && i === cards.length;
        return c ? <Card key={i} rank={c.rank} suit={c.suit} w={48} h={66} onClick={() => removeAt(i)} style={{ fontSize: 17 }} />
          : <div key={i} className={'pk-slot' + (next ? ' next' : '')} style={{ width: 48, height: 66, fontSize: 14 }}>{next ? '+' : i + 1}</div>; })}
      <div style={{ flex: 1 }} />
      {cards.length > 0 && <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--pk-surface2)', border: '1px solid var(--pk-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pk-ink2)', cursor: 'pointer' }} onClick={undo}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M7 3L3 7l4 4M3 7h7a3 3 0 010 6" strokeLinecap="round" strokeLinejoin="round"/></svg></div>}
    </div>
    <div style={{ padding: '0 16px', display: 'flex', justifyContent: 'flex-end' }}>
      <span className="mono" style={{ fontSize: 11, color: 'var(--pk-ink3)' }}>{cards.length && (typed || taps > 0) ? (typed ? 'typed' : taps + ' taps') + ' · ' + elapsed.toFixed(1) + 's' : '\u00a0'}</span>
    </div>
    <div style={{ flex: 1, minHeight: 6 }} />
    {ready && <div style={{ padding: '0 16px 10px' }}><div className="pk-reason pk-fade" style={{ background: 'var(--pk-surface)', border: '1px solid var(--pk-line)', borderRadius: 12, padding: '11px 14px' }}>{reasonText(cards, adv)}</div></div>}
    {/* type field */}
    <div style={{ padding: '0 16px 10px' }}>
      <div className="pk-field">
        <input value={typeVal} onChange={e => setTypeVal(e.target.value)} placeholder="type notation — e.g. AsAhKsQd" spellCheck={false} autoCapitalize="characters" />
        {typeVal && <span className="mono" style={{ fontSize: 12, color: 'var(--pk-ink3)', cursor: 'pointer' }} onClick={() => setTypeVal('')}>clear</span>}
      </div>
    </div>
    {/* keypad */}
    <div style={{ background: 'var(--pk-surface)', borderTop: '1px solid var(--pk-line)', padding: '12px 14px 8px' }}>
      <div className="pk-rankpad" style={{ gridTemplateColumns: 'repeat(7,1fr)' }}>
        {RANKS.map(r => <div key={r} className={'pk-key' + (armed === r ? ' on' : '')} style={{ height: 40, fontSize: 16 }} onClick={() => setArmed(r)}>{r}</div>)}
        <div className="pk-key util" style={{ height: 40 }} onClick={undo}>⌫</div>
      </div>
      {/* inline suit reveal */}
      <div style={{ minHeight: 44, marginTop: 9 }}>
        {armed ? (
          <div className="pk-fade" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--pk-teal-dim)', border: '1px solid var(--pk-teal)', borderRadius: 11 }}>
            <span className="mono" style={{ fontSize: 13, color: 'var(--pk-teal)', fontWeight: 700, flex: '0 0 auto' }}>{armed} +</span>
            {Object.entries(SUIT).map(([k, v]) => { const dead = used.has(armed + k) || cards.length >= 4;
              return <div key={k} onClick={() => place(k)} style={{ flex: 1, textAlign: 'center', fontSize: 21, color: v.c, padding: '5px 0', borderRadius: 8, background: 'rgba(0,0,0,.2)', cursor: 'pointer', opacity: dead ? .28 : 1, pointerEvents: dead ? 'none' : 'auto' }}>{v.g}</div>; })}
          </div>
        ) : (<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44, border: '1px dashed var(--pk-line2)', borderRadius: 11, color: 'var(--pk-ink3)', fontSize: 12 }} className="mono">pick a rank, then its suit</div>)}
      </div>
      {ready && <SaveHandle onSave={onSave} saved={saved} />}
      <div className="pk-btn primary" style={{ marginTop: 9, height: 46 }} onClick={newHand}>New hand</div>
    </div>
  </div>);
}
function tintBg(a) { return a === 'RAISE' ? 'rgba(245,158,11,.16)' : a === 'CALL' ? 'rgba(59,130,246,.16)' : 'rgba(239,68,68,.16)'; }
function stripBg(a) {
  const map = { RAISE: ['rgba(245,158,11,.22)', 'rgba(245,158,11,.5)'], CALL: ['rgba(59,130,246,.2)', 'rgba(59,130,246,.45)'], FOLD: ['rgba(239,68,68,.2)', 'rgba(239,68,68,.45)'] };
  const [bg, bd] = map[a] || map.FOLD;
  return { background: `linear-gradient(120deg, ${bg}, rgba(255,255,255,.02))`, border: '1px solid ' + bd };
}

// ---------- situation sheet ----------
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
        </div>
      ))}
    </div>
  </div>);
}

// =====================================================================
// PlayBody — controlled content only (header + views). No stage/status/tabbar.
// cards + mode are controlled by the parent so other tabs can read/replay them.
// =====================================================================
function buildHandEntry(cards, adv) {
  return { id: 'u' + Date.now(), s: 'live', ts: Date.now(), hole: cards.slice(), board: [],
    advised: adv.action, size: adv.sizing ? adv.sizing.to : null, took: adv.action,
    equity: adv.equity, conf: adv.confidence, result: 'pending', amt: 0, tags: [], note: '' };
}

function PlayBody({ mode, setMode, cards, setCards, situation, openSit, openCoach, onSaveHand }) {
  const [armed, setArmed] = useState(null);
  const [editing, setEditing] = useState(false);
  const [taps, setTaps] = useState(0);
  const [typed, setTyped] = useState(false);
  const [typeVal, setTypeVal] = useState('');
  const startRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const [savedFlash, setSavedFlash] = useState(false);

  const adv = useMemo(() => advise(cards), [cards]);
  const used = useMemo(() => new Set(cards.map(c => c.rank + c.suit)), [cards]);

  useEffect(() => {
    if (cards.length === 0 || cards.length >= 4) return;
    const id = setInterval(() => { if (startRef.current) setElapsed((Date.now() - startRef.current) / 1000); }, 100);
    return () => clearInterval(id);
  }, [cards.length]);
  const startTimer = () => { if (startRef.current === null) startRef.current = Date.now(); };

  function place(suit) {
    if (!armed || cards.length >= 4) return;
    if (used.has(armed + suit)) { setArmed(null); return; }
    startTimer();
    const nc = [...cards, { rank: armed, suit }];
    setCards(nc); setArmed(null); setTaps(t => t + 2);
    if (nc.length === 4) { setEditing(false); if (startRef.current) setElapsed((Date.now() - startRef.current) / 1000); }
  }
  function chooseRank(r) { startTimer(); setArmed(r); }
  function removeAt(i) { setCards(cs => cs.filter((_, j) => j !== i)); setEditing(true); setTyped(false); }
  function undo() { setCards(cs => cs.slice(0, -1)); setArmed(null); setEditing(true); }
  function newHand() { setCards([]); setArmed(null); setEditing(false); setTaps(0); setTyped(false); setTypeVal(''); startRef.current = null; setElapsed(0); }

  useEffect(() => {
    if (!typeVal) return;
    const parsed = parseNotation(typeVal);
    setTyped(true); startTimer();
    setCards(parsed);
    if (parsed.length === 4 && startRef.current) setElapsed((Date.now() - startRef.current) / 1000);
  }, [typeVal]);

  function doSave() {
    if (cards.length !== 4 || savedFlash) return;
    onSaveHand && onSaveHand(buildHandEntry(cards, adv));
    setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800);
  }

  const isExpert = mode === 'expert';
  return (<>
    <div className="pk-head">
      <div className="pk-headrow">
        <div className={'pk-seg' + (isExpert ? ' expert' : '')}>
          <span className="knob"></span>
          <button className={!isExpert ? 'on' : ''} onClick={() => setMode('starter')}>Starter</button>
          <button className={isExpert ? 'on' : ''} onClick={() => setMode('expert')}>Expert</button>
        </div>
        <div style={{ flex: 1 }} />
        <div className="pk-gear" onClick={() => openCoach({ kind: 'play', name: cards.length === 4 ? 'this hand' : 'this spot', cards: cards.length === 4 ? cards : undefined })} style={{ color: 'var(--pk-teal)', background: 'var(--pk-teal-dim)', borderColor: 'var(--pk-teal)' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6L8 1z" fill="currentColor"/></svg>
        </div>
        <div className="pk-gear" onClick={openSit}>
          <svg width="16" height="16" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="7.5" cy="7.5" r="2.2"/><path d="M7.5 1v2M7.5 12v2M1 7.5h2M12 7.5h2M3 3l1.4 1.4M10.6 10.6L12 12M12 3l-1.4 1.4M4.4 10.6L3 12" strokeLinecap="round"/></svg>
        </div>
      </div>
      <div className="pk-ctx" onClick={openSit}>
        <span className="lbl"><b>{situation.pos}</b> · {situation.players}-max · <b>{situation.style}</b></span>
        <span className="chev"><svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 4l3.5 3.5L9 4"/></svg></span>
      </div>
    </div>

    {isExpert
      ? <ExpertView cards={cards} adv={adv} armed={armed} setArmed={chooseRank} place={place} removeAt={removeAt} undo={undo} newHand={newHand} used={used} typeVal={typeVal} setTypeVal={setTypeVal} taps={taps} elapsed={elapsed} typed={typed} onSave={doSave} saved={savedFlash} />
      : <StarterView cards={cards} adv={adv} armed={armed} setArmed={chooseRank} place={place} removeAt={removeAt} newHand={newHand} editing={editing} setEditing={setEditing} used={used} onSave={doSave} saved={savedFlash} />}
  </>);
}
window.PlayBody = PlayBody;
window.pkBuildHandEntry = buildHandEntry;

// =====================================================================
// PlayApp — standalone wrapper (own stage + tab nav + sit/coach)
// =====================================================================
function PlayApp() {
  const [mode, setMode] = useState(() => localStorage.getItem('pk-play-mode') || 'starter');
  useEffect(() => { try { localStorage.setItem('pk-play-mode', mode); } catch {} }, [mode]);
  const [situation, setSituation] = useState(() => { try { return JSON.parse(localStorage.getItem('pk-situation')) || { pos: 'BTN', players: 6, style: 'TAG' }; } catch { return { pos: 'BTN', players: 6, style: 'TAG' }; } });
  useEffect(() => { try { localStorage.setItem('pk-situation', JSON.stringify(situation)); } catch {} }, [situation]);
  const [cards, setCards] = useState(() => { try { return JSON.parse(localStorage.getItem('pk-cards')) || []; } catch { return []; } });
  useEffect(() => { try { localStorage.setItem('pk-cards', JSON.stringify(cards)); } catch {} }, [cards]);
  const [sitOpen, setSitOpen] = useState(false);
  const [coach, setCoach] = useState(null);

  const [scale, setScale] = useState(1);
  useEffect(() => { const f = () => setScale(Math.min((window.innerWidth - 32) / 414, (window.innerHeight - 32) / 868, 1)); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);

  function onSaveHand(entry) { try { const arr = JSON.parse(localStorage.getItem('pk-journal-saved')) || []; arr.unshift(entry); localStorage.setItem('pk-journal-saved', JSON.stringify(arr)); } catch {} }
  function onTab(id) { if (id === 'study') window.location.href = 'Study Mode — Interactive.html'; if (id === 'journal') window.location.href = 'Hand Journal — Interactive.html'; }

  return (
    <div className="pk-stage">
      <div className="pk-bezel" style={{ transform: `scale(${scale})` }}>
        <div className="pk-screen">
          <StatusBar />
          <PlayBody mode={mode} setMode={setMode} cards={cards} setCards={setCards} situation={situation} openSit={() => setSitOpen(true)} openCoach={setCoach} onSaveHand={onSaveHand} />
          <TabBar active="play" onTab={onTab} />
          <HomeBar />
          {sitOpen && <SituationSheet situation={situation} setSituation={setSituation} close={() => setSitOpen(false)} />}
          {coach && window.PKCoachSheet && <window.PKCoachSheet context={coach} close={() => setCoach(null)} />}
        </div>
      </div>
    </div>
  );
}
window.PlayApp = PlayApp;
