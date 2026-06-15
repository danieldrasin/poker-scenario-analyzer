// play-screens.jsx — Phase 2 Play-mode card-entry screens (3 directions).
// Self-contained: injects its own pk- stylesheet, exports screen components to window.
// Rendered inside design-canvas DCArtboards (390×844 each).

(function injectPokerUI() {
  if (document.getElementById('pk-ui')) return;
  const s = document.createElement('style');
  s.id = 'pk-ui';
  s.textContent = `
  :root{
    --pk-base:#0e1525; --pk-surface:#19233a; --pk-surface2:#212d46; --pk-surface3:#2a3854;
    --pk-line:rgba(148,163,184,.12); --pk-line2:rgba(148,163,184,.24);
    --pk-teal:#00d4aa; --pk-teal-dim:rgba(0,212,170,.14);
    --pk-ink:#eef3f9; --pk-ink2:#9fb0c6; --pk-ink3:#647387;
    --pk-fold:#ef4444; --pk-call:#3b82f6; --pk-bet:#22c55e; --pk-raise:#f59e0b; --pk-check:#94a3b8;
    --su-spade:#f1f5f9; --su-heart:#ff5d6c; --su-diamond:#38bdf8; --su-club:#34d399;
    --pk-mono:ui-monospace,"SF Mono","Menlo","Monaco","Consolas",monospace;
    --pk-sans:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;
  }
  .pk-screen{width:390px;height:844px;background:var(--pk-base);color:var(--pk-ink);
    font-family:var(--pk-sans);position:relative;display:flex;flex-direction:column;overflow:hidden;
    -webkit-font-smoothing:antialiased;}
  .pk-screen *{box-sizing:border-box;}

  /* status bar */
  .pk-status{height:52px;flex:none;display:flex;align-items:center;justify-content:space-between;
    padding:14px 30px 0;font-family:var(--pk-mono);}
  .pk-time{font-size:15px;font-weight:700;letter-spacing:.02em;}
  .pk-sicons{display:flex;align-items:center;gap:6px;}
  .pk-sicons .sig{display:flex;align-items:flex-end;gap:2px;height:11px;}
  .pk-sicons .sig i{width:3px;border-radius:1px;background:var(--pk-ink);}
  .pk-sicons .sig i:nth-child(1){height:5px}.pk-sicons .sig i:nth-child(2){height:7px}
  .pk-sicons .sig i:nth-child(3){height:9px}.pk-sicons .sig i:nth-child(4){height:11px}
  .pk-batt{width:23px;height:12px;border-radius:3px;border:1.5px solid var(--pk-ink);position:relative;padding:1.5px;}
  .pk-batt::after{content:"";position:absolute;right:-3px;top:3px;width:2px;height:5px;border-radius:0 2px 2px 0;background:var(--pk-ink);}
  .pk-batt i{display:block;height:100%;width:72%;border-radius:1px;background:var(--pk-ink);}
  .pk-home{height:30px;flex:none;display:flex;align-items:center;justify-content:center;}
  .pk-home span{width:134px;height:5px;border-radius:3px;background:rgba(255,255,255,.4);}

  /* context strip */
  .pk-ctx{display:flex;align-items:center;gap:10px;padding:6px 20px 4px;}
  .pk-ctx .lbl{font-family:var(--pk-mono);font-size:13px;letter-spacing:.02em;color:var(--pk-ink2);}
  .pk-ctx .lbl b{color:var(--pk-ink);font-weight:700;}
  .pk-ctx .gear{margin-left:auto;width:30px;height:30px;border-radius:9px;background:var(--pk-surface);
    border:1px solid var(--pk-line);display:flex;align-items:center;justify-content:center;color:var(--pk-ink2);}
  .pk-eyebrow{font-family:var(--pk-mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--pk-ink3);}

  /* playing cards */
  .pk-card{border-radius:9px;position:relative;flex:none;font-family:var(--pk-mono);font-weight:700;line-height:1;}
  .pk-card.chip{background:var(--pk-surface2);border:1px solid var(--pk-line2);
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;}
  .pk-card.chip .r{font-size:22px;}.pk-card.chip .s{font-size:18px;}
  .pk-card.face{background:linear-gradient(160deg,#fdfdfb,#eef1f6);box-shadow:0 6px 18px rgba(0,0,0,.45);
    border:1px solid rgba(0,0,0,.1);}
  .pk-card.face .corner{position:absolute;top:7px;left:8px;display:flex;flex-direction:column;align-items:center;}
  .pk-card.face .corner.br{top:auto;left:auto;bottom:7px;right:8px;transform:rotate(180deg);}
  .pk-card.face .r{font-size:20px;}.pk-card.face .s{font-size:16px;margin-top:1px;}
  .pk-card.face .pip{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:34px;}
  .pk-slot{border-radius:9px;border:1.6px dashed var(--pk-line2);background:rgba(255,255,255,.015);
    display:flex;align-items:center;justify-content:center;flex:none;color:var(--pk-ink3);
    font-family:var(--pk-mono);font-size:18px;font-weight:600;}
  .pk-slot.next{border-style:solid;border-color:var(--pk-teal);background:var(--pk-teal-dim);color:var(--pk-teal);
    box-shadow:0 0 0 4px rgba(0,212,170,.08);}

  /* action badge */
  .pk-badge{border-radius:16px;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;}
  .pk-badge .act{font-family:var(--pk-mono);font-weight:800;letter-spacing:.04em;}
  .pk-badge .size{font-family:var(--pk-mono);font-weight:700;text-align:right;}
  .pk-badge.raise{background:linear-gradient(120deg,rgba(245,158,11,.22),rgba(245,158,11,.06));border:1px solid rgba(245,158,11,.5);}
  .pk-badge.raise .act{color:var(--pk-raise);}
  .pk-badge.fold{background:linear-gradient(120deg,rgba(239,68,68,.2),rgba(239,68,68,.05));border:1px solid rgba(239,68,68,.45);}
  .pk-badge.fold .act{color:var(--pk-fold);}

  /* equity ring */
  .pk-ring{border-radius:50%;display:flex;align-items:center;justify-content:center;position:relative;flex:none;}
  .pk-ring .hole{position:absolute;border-radius:50%;background:var(--pk-base);display:flex;flex-direction:column;align-items:center;justify-content:center;}

  /* thermometer */
  .pk-thermo{height:10px;border-radius:6px;position:relative;
    background:linear-gradient(90deg,#ef4444 0%,#f59e0b 50%,#22c55e 100%);}
  .pk-thermo .mark{position:absolute;top:50%;width:16px;height:16px;border-radius:50%;background:#fff;
    border:3px solid var(--pk-base);transform:translate(-50%,-50%);box-shadow:0 2px 6px rgba(0,0,0,.5);}

  /* rank pad / suit keys */
  .pk-rankpad{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;}
  .pk-rankpad.compact .pk-key{aspect-ratio:auto;height:46px;min-height:0;}
  .pk-key{aspect-ratio:1;border-radius:11px;background:var(--pk-surface2);border:1px solid var(--pk-line);
    display:flex;align-items:center;justify-content:center;font-family:var(--pk-mono);font-weight:700;
    font-size:19px;color:var(--pk-ink);min-height:44px;}
  .pk-key.dim{color:var(--pk-ink3);}
  .pk-key.on{background:var(--pk-teal-dim);border-color:var(--pk-teal);color:var(--pk-teal);
    box-shadow:0 0 0 3px rgba(0,212,170,.1);}
  .pk-key.wide{aspect-ratio:auto;grid-column:span 2;font-size:13px;color:var(--pk-ink3);gap:6px;}
  .pk-suitrow{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
  .pk-suitkey{aspect-ratio:1.7;border-radius:13px;background:var(--pk-surface);border:1px solid var(--pk-line2);
    display:flex;align-items:center;justify-content:center;font-size:26px;min-height:48px;}
  .pk-suitkey.on{box-shadow:0 0 0 3px rgba(0,212,170,.18);border-color:var(--pk-teal);}

  /* buttons */
  .pk-btn{border-radius:13px;font-family:var(--pk-sans);font-weight:650;font-size:15px;
    display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--pk-line2);
    background:var(--pk-surface);color:var(--pk-ink);min-height:48px;}
  .pk-btn.primary{background:var(--pk-teal);color:#053027;border:none;}
  .pk-btn.ghost{background:transparent;}

  /* tab bar */
  .pk-tabbar{height:64px;flex:none;display:flex;border-top:1px solid var(--pk-line);
    background:rgba(13,19,33,.92);padding:8px 12px 0;}
  .pk-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;color:var(--pk-ink3);}
  .pk-tab .ic{width:24px;height:24px;display:flex;align-items:center;justify-content:center;}
  .pk-tab .tl{font-size:10px;font-family:var(--pk-mono);letter-spacing:.06em;}
  .pk-tab.on{color:var(--pk-teal);}

  /* misc */
  .pk-reason{font-size:13px;color:var(--pk-ink2);line-height:1.4;}
  .pk-divider{height:1px;background:var(--pk-line);}
  .pk-progress{height:6px;border-radius:4px;background:rgba(255,255,255,.07);overflow:hidden;}
  .pk-progress i{display:block;height:100%;border-radius:4px;background:var(--pk-teal);}
  .pk-glow-felt{position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(420px 360px at 50% 34%,rgba(0,212,170,.16),transparent 62%),
               radial-gradient(520px 420px at 50% 30%,rgba(16,84,72,.45),transparent 70%);}
  .mono{font-family:var(--pk-mono);}
  `;
  document.head.appendChild(s);
})();

const SUIT = {
  s: { g: '♠', c: 'var(--su-spade)' },
  h: { g: '♥', c: 'var(--su-heart)' },
  d: { g: '♦', c: 'var(--su-diamond)' },
  c: { g: '♣', c: 'var(--su-club)' },
};
// On white card faces, suits need dark-on-white ink (4-color deck).
const FACE_SUIT = {
  s: { g: '♠', c: '#1e293b' },
  h: { g: '♥', c: '#e23744' },
  d: { g: '♦', c: '#2b7fff' },
  c: { g: '♣', c: '#1a9c5b' },
};

// ---------- atoms ----------
function StatusBar({ light }) {
  return (
    <div className="pk-status">
      <span className="pk-time">10:24</span>
      <span className="pk-sicons">
        <span className="sig"><i></i><i></i><i></i><i></i></span>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none"><path d="M8 10.5a1.3 1.3 0 100-2.6 1.3 1.3 0 000 2.6z" fill="#eef3f9"/><path d="M3.2 6.4a7 7 0 019.6 0M1 4.1a10.2 10.2 0 0114 0M5.4 8.7a3.8 3.8 0 015.2 0" stroke="#eef3f9" strokeWidth="1.3" strokeLinecap="round"/></svg>
        <span className="pk-batt"><i></i></span>
      </span>
    </div>
  );
}
function HomeBar() { return (<div className="pk-home"><span></span></div>); }

function Card({ rank, suit, variant = 'chip', w, h, style }) {
  const s = SUIT[suit];
  if (variant === 'face') {
    const fs = FACE_SUIT[suit];
    return (
      <div className="pk-card face" style={{ width: w, height: h, ...style }}>
        <span className="corner" style={{ color: fs.c }}><span className="r">{rank}</span><span className="s">{fs.g}</span></span>
        <span className="pip" style={{ color: fs.c }}>{fs.g}</span>
        <span className="corner br" style={{ color: fs.c }}><span className="r">{rank}</span><span className="s">{fs.g}</span></span>
      </div>
    );
  }
  return (
    <div className="pk-card chip" style={{ width: w, height: h, ...style }}>
      <span className="r" style={{ color: s.c }}>{rank}</span>
      <span className="s" style={{ color: s.c }}>{s.g}</span>
    </div>
  );
}
function Slot({ idx, next, w, h, style }) {
  return (<div className={'pk-slot' + (next ? ' next' : '')} style={{ width: w, height: h, ...style }}>{next ? '+' : idx}</div>);
}

function EquityRing({ pct, size = 150, thick = 14, label, value, accent = 'var(--pk-teal)' }) {
  return (
    <div className="pk-ring" style={{ width: size, height: size,
      background: `conic-gradient(${accent} 0 ${pct}%, rgba(255,255,255,.07) ${pct}% 100%)` }}>
      <div className="hole" style={{ inset: thick }}>
        {label && <div className="pk-eyebrow" style={{ marginBottom: 4 }}>{label}</div>}
        {value}
      </div>
    </div>
  );
}

function TabBar({ active = 'play' }) {
  const tabs = [
    ['play', 'Play', <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M6 4l12 7-12 7V4z" fill="currentColor"/></svg>],
    ['study', 'Study', <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5.5A1.5 1.5 0 015.5 4H10v14H5.5A1.5 1.5 0 014 16.5v-11zM18 5.5A1.5 1.5 0 0016.5 4H12v14h4.5a1.5 1.5 0 001.5-1.5v-11z"/></svg>],
    ['journal', 'Journal', <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="3" width="14" height="16" rx="2"/><path d="M8 7h6M8 11h6M8 15h3" strokeLinecap="round"/></svg>],
  ];
  return (
    <div className="pk-tabbar">
      {tabs.map(([id, lbl, ic]) => (
        <div key={id} className={'pk-tab' + (id === active ? ' on' : '')}>
          <span className="ic">{ic}</span><span className="tl">{lbl}</span>
        </div>
      ))}
    </div>
  );
}

function Gear() {
  return (<div className="pk-ctx" style={{ paddingTop: 8 }}>
    <span className="lbl"><b>BTN</b> · 6-max · <b>TAG</b></span>
    <span className="gear"><svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="7.5" cy="7.5" r="2.2"/><path d="M7.5 1v2M7.5 12v2M1 7.5h2M12 7.5h2M3 3l1.4 1.4M10.6 10.6L12 12M12 3l-1.4 1.4M4.4 10.6L3 12" strokeLinecap="round"/></svg></span>
  </div>);
}

// =====================================================================
// DIRECTION A — "Stacked"  (clean iOS, result-first, rank→suit)
// =====================================================================
function A_Entering() {
  return (
    <div className="pk-screen">
      <StatusBar />
      <Gear />
      <div style={{ padding: '4px 20px 0', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* live-read forming card */}
        <div style={{ background: 'var(--pk-surface)', border: '1px solid var(--pk-line)', borderRadius: 16, padding: 16, marginTop: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <span className="pk-eyebrow">Reading hand</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--pk-ink3)' }}>2 of 4</span>
          </div>
          <div className="pk-progress"><i style={{ width: '50%' }}></i></div>
          <div style={{ marginTop: 12, fontSize: 14, color: 'var(--pk-ink2)' }}>Pair of aces so far — <span style={{ color: 'var(--pk-ink)' }}>add 2 cards for your read.</span></div>
        </div>
        {/* hole slots */}
        <div className="pk-eyebrow" style={{ margin: '16px 0 8px' }}>Your hand</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Card rank="A" suit="s" w={74} h={98} />
          <Card rank="A" suit="h" w={74} h={98} />
          <Slot idx={3} next w={74} h={98} />
          <Slot idx={4} w={74} h={98} />
        </div>
        <div style={{ flex: 1, minHeight: 8 }} />
        {/* picker */}
        <div className="pk-eyebrow" style={{ margin: '0 0 8px' }}>1 · Rank</div>
        <div className="pk-rankpad compact">
          {['A','K','Q','J','T','9','8','7','6','5','4','3','2'].map(r => (
            <div key={r} className={'pk-key' + (r === 'K' ? ' on' : '')}>{r}</div>
          ))}
          <div className="pk-key wide"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><path d="M4 6.2h.01M6.4 6.2h.01M8.8 6.2h.01M5 9.2h6" strokeLinecap="round"/></svg> type</div>
        </div>
        <div className="pk-eyebrow" style={{ margin: '14px 0 8px' }}>2 · Suit</div>
        <div className="pk-suitrow">
          {Object.entries(SUIT).map(([k, v]) => (<div key={k} className="pk-suitkey" style={{ color: v.c }}>{v.g}</div>))}
        </div>
      </div>
      <div style={{ padding: '12px 20px 4px' }}>
        <TabBar active="play" />
      </div>
      <HomeBar />
    </div>
  );
}

function A_Result() {
  return (
    <div className="pk-screen">
      <StatusBar />
      <Gear />
      <div style={{ padding: '4px 20px 0', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* result badge */}
        <div className="pk-badge raise" style={{ marginTop: 6 }}>
          <div>
            <div className="act" style={{ fontSize: 32 }}>RAISE</div>
            <div className="pk-reason" style={{ marginTop: 4 }}>Premium double-suited — raise for value.</div>
          </div>
          <div className="size">
            <div style={{ fontSize: 26, color: 'var(--pk-ink)' }}>$175</div>
            <div className="pk-eyebrow" style={{ marginTop: 2 }}>3.5 bb</div>
          </div>
        </div>
        {/* equity + confidence row */}
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1, background: 'var(--pk-surface)', border: '1px solid var(--pk-line)', borderRadius: 14, padding: '12px 14px' }}>
            <div className="pk-eyebrow">Equity</div>
            <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--pk-teal)', marginTop: 2 }}>62%</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--pk-ink3)' }}>vs calling range</div>
          </div>
          <div style={{ flex: 1, background: 'var(--pk-surface)', border: '1px solid var(--pk-line)', borderRadius: 14, padding: '12px 14px' }}>
            <div className="pk-eyebrow">Confidence</div>
            <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--pk-ink)', marginTop: 2 }}>91%</div>
            <div className="pk-thermo" style={{ marginTop: 10 }}><span className="mark" style={{ left: '88%' }}></span></div>
          </div>
        </div>
        {/* hole slots filled */}
        <div className="pk-eyebrow" style={{ margin: '18px 0 8px' }}>Your hand</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Card rank="A" suit="s" w={78} h={104} />
          <Card rank="A" suit="h" w={78} h={104} />
          <Card rank="K" suit="s" w={78} h={104} />
          <Card rank="Q" suit="d" w={78} h={104} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="pk-btn ghost" style={{ flex: '0 0 96px' }}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M7 3L3 7l4 4M3 7h7a3 3 0 010 6" strokeLinecap="round" strokeLinejoin="round"/></svg> Undo</div>
          <div className="pk-btn primary" style={{ flex: 1 }}>+ Add board card</div>
        </div>
        <div className="pk-btn" style={{ marginTop: 10, background: 'var(--pk-surface2)' }}>New hand</div>
      </div>
      <div style={{ padding: '12px 20px 4px' }}><TabBar active="play" /></div>
      <HomeBar />
    </div>
  );
}

// =====================================================================
// DIRECTION B — "Felt Spotlight" (atmospheric, hand fan, equity ring)
// =====================================================================
function FanCard({ rank, suit, rot, x, y }) {
  return (<div style={{ position: 'absolute', left: '50%', top: 0, transform: `translateX(-50%) translateX(${x}px) translateY(${y}px) rotate(${rot}deg)`, transformOrigin: 'center bottom' }}>
    <Card rank={rank} suit={suit} variant="face" w={84} h={118} />
  </div>);
}

function B_Dealing() {
  return (
    <div className="pk-screen">
      <div className="pk-glow-felt"></div>
      <StatusBar />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ textAlign: 'center', marginTop: 6 }}>
          <div className="pk-eyebrow">Play · BTN · 6-max</div>
        </div>
        {/* ring empty + fan partial */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
          <EquityRing pct={0} size={150} thick={13} label="Equity"
            value={<div className="mono" style={{ fontSize: 30, fontWeight: 700, color: 'var(--pk-ink3)' }}>—</div>} />
        </div>
        <div style={{ position: 'relative', height: 150, marginTop: 18 }}>
          <FanCard rank="A" suit="s" rot={-9} x={-46} y={12} />
          <FanCard rank="A" suit="h" rot={-3} x={-15} y={2} />
          <div style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%) translateX(16px) translateY(2px) rotate(3deg)', transformOrigin: 'center bottom' }}>
            <div className="pk-slot" style={{ width: 84, height: 118 }}></div>
          </div>
          <div style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%) translateX(47px) translateY(12px) rotate(9deg)', transformOrigin: 'center bottom' }}>
            <div className="pk-slot next" style={{ width: 84, height: 118 }}>+</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {/* docked picker sheet */}
        <div style={{ background: 'var(--pk-surface)', borderRadius: '22px 22px 0 0', borderTop: '1px solid var(--pk-line2)', padding: '12px 20px 18px' }}>
          <div style={{ width: 38, height: 4, borderRadius: 3, background: 'var(--pk-line2)', margin: '0 auto 12px' }}></div>
          <div className="pk-eyebrow" style={{ marginBottom: 8 }}>1 · Rank</div>
          <div className="pk-rankpad">
            {['A','K','Q','J','T','9','8','7','6','5','4','3','2'].map(r => (<div key={r} className={'pk-key' + (r === 'K' ? ' on' : '')}>{r}</div>))}
            <div className="pk-key wide" style={{ color: 'var(--pk-ink3)' }}>type</div>
          </div>
          <div className="pk-suitrow" style={{ marginTop: 10 }}>
            {Object.entries(SUIT).map(([k, v]) => (<div key={k} className="pk-suitkey" style={{ color: v.c }}>{v.g}</div>))}
          </div>
        </div>
      </div>
      <HomeBar />
    </div>
  );
}

function B_Locked() {
  return (
    <div className="pk-screen">
      <div className="pk-glow-felt"></div>
      <StatusBar />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1, padding: '0 20px' }}>
        <div style={{ textAlign: 'center', marginTop: 6 }}><div className="pk-eyebrow">Play · BTN · 6-max</div></div>
        {/* ring with action in center */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
          <EquityRing pct={62} size={176} thick={15} accent="var(--pk-raise)"
            value={<>
              <div className="act mono" style={{ color: 'var(--pk-raise)', fontWeight: 800, fontSize: 30, letterSpacing: '.03em' }}>RAISE</div>
              <div className="mono" style={{ fontSize: 13, color: 'var(--pk-ink2)', marginTop: 2 }}>62% equity</div>
            </>} />
        </div>
        {/* sizing pill + confidence */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16 }}>
          <div className="mono" style={{ background: 'rgba(245,158,11,.16)', border: '1px solid rgba(245,158,11,.45)', color: 'var(--pk-raise)', fontWeight: 700, padding: '8px 16px', borderRadius: 100, fontSize: 16 }}>to $175 · 3.5bb</div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="pk-eyebrow">Confidence</span><span className="mono" style={{ fontSize: 12, color: 'var(--pk-ink2)' }}>91%</span>
          </div>
          <div className="pk-thermo"><span className="mark" style={{ left: '88%' }}></span></div>
        </div>
        {/* fan full */}
        <div style={{ position: 'relative', height: 134, marginTop: 18 }}>
          <FanCard rank="A" suit="s" rot={-12} x={-60} y={14} />
          <FanCard rank="A" suit="h" rot={-4} x={-21} y={2} />
          <FanCard rank="K" suit="s" rot={4} x={21} y={2} />
          <FanCard rank="Q" suit="d" rot={12} x={60} y={14} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 10, paddingBottom: 14 }}>
          <div className="pk-btn ghost" style={{ flex: '0 0 110px' }}>Coach ✦</div>
          <div className="pk-btn primary" style={{ flex: 1 }}>New hand</div>
        </div>
      </div>
      <HomeBar />
    </div>
  );
}

// =====================================================================
// DIRECTION C — "Speed Keypad" (dense, live strip, grinder velocity)
// =====================================================================
function MiniCard({ rank, suit, next, idx }) {
  if (!rank) return (<div className={'pk-slot' + (next ? ' next' : '')} style={{ width: 48, height: 66, fontSize: 15 }}>{next ? '+' : idx}</div>);
  const s = SUIT[suit];
  return (<div className="pk-card chip" style={{ width: 48, height: 66 }}><span className="r" style={{ fontSize: 17, color: s.c }}>{rank}</span><span className="s" style={{ fontSize: 13, color: s.c }}>{s.g}</span></div>);
}

function C_Tapping() {
  return (
    <div className="pk-screen">
      <StatusBar />
      {/* live equity strip */}
      <div style={{ padding: '4px 16px 0' }}>
        <div style={{ background: 'var(--pk-surface)', border: '1px solid var(--pk-line)', borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <span className="pk-eyebrow">Live read · forming</span>
            <span className="mono" style={{ fontSize: 12, background: 'rgba(245,158,11,.16)', color: 'var(--pk-raise)', fontWeight: 700, padding: '3px 9px', borderRadius: 7 }}>RAISE?</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="mono" style={{ fontSize: 30, fontWeight: 700, color: 'var(--pk-ink)' }}>~58<span style={{ fontSize: 16, color: 'var(--pk-ink3)' }}>%</span></div>
            <div className="pk-progress" style={{ flex: 1, height: 9 }}><i style={{ width: '58%', background: 'var(--pk-raise)' }}></i></div>
          </div>
        </div>
      </div>
      {/* card track */}
      <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="pk-eyebrow" style={{ width: 30 }}>Hand</span>
        <MiniCard rank="A" suit="s" /><MiniCard rank="A" suit="h" /><MiniCard rank="K" suit="s" /><MiniCard next idx={4} />
        <div style={{ flex: 1 }} />
        <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--pk-surface2)', border: '1px solid var(--pk-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pk-ink2)' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M7 3L3 7l4 4M3 7h7a3 3 0 010 6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
      </div>
      <div style={{ flex: 1 }} />
      {/* type field */}
      <div style={{ padding: '0 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--pk-surface)', border: '1px solid var(--pk-line2)', borderRadius: 12, padding: '10px 14px' }}>
          <span className="mono" style={{ fontSize: 16, color: 'var(--pk-ink)' }}>AsAhKs<span style={{ color: 'var(--pk-teal)', animation: 'none' }}>|</span></span>
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--pk-ink3)' }}>type notation</span>
        </div>
      </div>
      {/* persistent keypad: rank with inline suit on active */}
      <div style={{ background: 'var(--pk-surface)', borderTop: '1px solid var(--pk-line)', padding: '12px 14px 8px' }}>
        <div className="pk-rankpad" style={{ gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
          {['A','K','Q','J','T','9','8'].map(r => (<div key={r} className={'pk-key' + (r === 'Q' ? ' on' : '')} style={{ fontSize: 16, minHeight: 40 }}>{r}</div>))}
          {['7','6','5','4','3','2'].map(r => (<div key={r} className="pk-key" style={{ fontSize: 16, minHeight: 40 }}>{r}</div>))}
          <div className="pk-key" style={{ fontSize: 12, color: 'var(--pk-ink3)', minHeight: 40 }}>⌫</div>
        </div>
        {/* inline suit picker (revealed for active rank Q) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, padding: '8px 10px', background: 'var(--pk-teal-dim)', border: '1px solid var(--pk-teal)', borderRadius: 11 }}>
          <span className="mono" style={{ fontSize: 13, color: 'var(--pk-teal)', fontWeight: 700 }}>Q +</span>
          {Object.entries(SUIT).map(([k, v]) => (<div key={k} style={{ flex: 1, textAlign: 'center', fontSize: 22, color: v.c, padding: '4px 0', borderRadius: 8, background: 'rgba(0,0,0,.18)' }}>{v.g}</div>))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
          <div className="pk-btn primary" style={{ flex: 1, minHeight: 44 }}>New hand</div>
        </div>
      </div>
      <HomeBar />
    </div>
  );
}

function C_Done() {
  return (
    <div className="pk-screen">
      <StatusBar />
      {/* live strip locked */}
      <div style={{ padding: '4px 16px 0' }}>
        <div className="pk-badge raise" style={{ borderRadius: 14, padding: '12px 14px' }}>
          <div className="act" style={{ fontSize: 26 }}>RAISE</div>
          <div className="size"><div className="mono" style={{ fontSize: 20, color: 'var(--pk-ink)' }}>$175</div><div className="pk-eyebrow">3.5 bb</div></div>
        </div>
      </div>
      {/* stat row inline */}
      <div style={{ padding: '10px 16px 0', display: 'flex', gap: 8 }}>
        {[['Equity', '62%', 'var(--pk-teal)'], ['Pot odds', '2.4:1', 'var(--pk-ink)'], ['Confidence', '91%', 'var(--pk-ink)']].map(([l, v, c]) => (
          <div key={l} style={{ flex: 1, background: 'var(--pk-surface)', border: '1px solid var(--pk-line)', borderRadius: 12, padding: '10px 11px' }}>
            <div className="pk-eyebrow" style={{ fontSize: 9.5 }}>{l}</div>
            <div className="mono" style={{ fontSize: 21, fontWeight: 700, color: c, marginTop: 3 }}>{v}</div>
          </div>
        ))}
      </div>
      {/* card track full */}
      <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="pk-eyebrow" style={{ width: 30 }}>Hand</span>
        <MiniCard rank="A" suit="s" /><MiniCard rank="A" suit="h" /><MiniCard rank="K" suit="s" /><MiniCard rank="Q" suit="d" />
        <div style={{ flex: 1 }} />
        <div className="mono" style={{ fontSize: 11, color: 'var(--pk-ink3)' }}>8 taps · 3.1s</div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ padding: '0 16px 10px' }}>
        <div className="pk-reason" style={{ background: 'var(--pk-surface)', border: '1px solid var(--pk-line)', borderRadius: 12, padding: '11px 14px' }}>
          Double-suited aces with a king — top of your raising range from the button.
        </div>
      </div>
      {/* keypad ready for board */}
      <div style={{ background: 'var(--pk-surface)', borderTop: '1px solid var(--pk-line)', padding: '12px 14px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
          <span className="pk-eyebrow">Enter flop →</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--pk-ink3)' }}>or new hand</span>
        </div>
        <div className="pk-rankpad" style={{ gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
          {['A','K','Q','J','T','9','8'].map(r => (<div key={r} className="pk-key" style={{ fontSize: 16, minHeight: 40 }}>{r}</div>))}
          {['7','6','5','4','3','2'].map(r => (<div key={r} className="pk-key" style={{ fontSize: 16, minHeight: 40 }}>{r}</div>))}
          <div className="pk-key" style={{ fontSize: 12, color: 'var(--pk-ink3)', minHeight: 40 }}>⌫</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
          <div className="pk-btn primary" style={{ flex: 1, minHeight: 44 }}>New hand</div>
        </div>
      </div>
      <HomeBar />
    </div>
  );
}

Object.assign(window, {
  A_Entering, A_Result,
  B_Dealing, B_Locked,
  C_Tapping, C_Done,
});
