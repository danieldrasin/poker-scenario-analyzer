// study-app.jsx — Study mode: Scenarios (progressive disclosure) + Matrix (single-row focus)
// + AI Coach pull-up sheet (iMessage style). Consumes poker-kit.jsx via window. Exports StudyApp.

const { useState: useStateS, useEffect: useEffectS, useMemo: useMemoS, useRef: useRefS } = React;

(function injectStudyCSS() {
  if (document.getElementById('pk-study')) return;
  const s = document.createElement('style');
  s.id = 'pk-study';
  s.textContent = `
  .st-head{flex:none;padding:6px 18px 10px;display:flex;flex-direction:column;gap:10px;z-index:3;}
  .st-titlerow{display:flex;align-items:center;gap:10px;}
  .st-title{font-size:24px;font-weight:720;letter-spacing:-.02em;}
  .st-coachbtn{margin-left:auto;display:flex;align-items:center;gap:7px;background:var(--pk-teal-dim);
    border:1px solid var(--pk-teal);color:var(--pk-teal);font-family:var(--pk-sans);font-weight:650;font-size:13px;
    padding:8px 13px;border-radius:100px;cursor:pointer;}
  .st-seg{display:inline-flex;background:var(--pk-surface);border:1px solid var(--pk-line);border-radius:12px;padding:3px;position:relative;width:100%;}
  .st-seg .knob{position:absolute;top:3px;bottom:3px;left:3px;width:calc(50% - 3px);border-radius:9px;background:var(--pk-teal);transition:transform .26s cubic-bezier(.3,.9,.3,1);z-index:0;}
  .st-seg.matrix .knob{transform:translateX(100%);}
  .st-seg button{flex:1;appearance:none;border:none;background:transparent;font-family:var(--pk-sans);font-weight:680;font-size:14px;color:var(--pk-ink2);padding:9px 6px;border-radius:9px;z-index:1;cursor:pointer;transition:color .2s;}
  .st-seg button.on{color:#05281f;}
  .st-ctx{display:flex;align-items:center;gap:8px;cursor:pointer;width:max-content;}
  .st-ctx .lbl{font-family:var(--pk-mono);font-size:12.5px;color:var(--pk-ink2);}
  .st-ctx .lbl b{color:var(--pk-ink);font-weight:700;}
  .st-scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding:2px 18px 18px;-webkit-overflow-scrolling:touch;}
  .st-scroll::-webkit-scrollbar{width:0;}
  .st-seclabel{display:flex;align-items:center;justify-content:space-between;margin:18px 2px 10px;}

  /* presets */
  .st-presets{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .st-preset{background:var(--pk-surface);border:1px solid var(--pk-line);border-radius:14px;padding:12px;cursor:pointer;transition:border-color .15s,background .15s;}
  .st-preset.on{border-color:var(--pk-teal);background:linear-gradient(180deg,var(--pk-teal-dim),var(--pk-surface) 75%);}
  .st-preset .pcards{display:flex;gap:4px;margin-bottom:9px;}
  .st-preset .pname{font-size:13.5px;font-weight:650;color:var(--pk-ink);}
  .st-preset .pmeta{display:flex;align-items:center;gap:6px;margin-top:5px;}
  .st-dots{display:flex;gap:3px;}
  .st-dots i{width:6px;height:6px;border-radius:50%;background:var(--pk-line2);}
  .st-dots i.on{background:var(--pk-teal);}

  /* strategy insight */
  .st-insight{background:var(--pk-surface);border:1px solid var(--pk-line);border-radius:16px;padding:16px;margin-top:4px;}
  .st-metric{margin-top:14px;}
  .st-metric .top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;}
  .st-bar{height:8px;border-radius:5px;background:rgba(255,255,255,.07);overflow:hidden;}
  .st-bar i{display:block;height:100%;border-radius:5px;}
  .st-nut{display:flex;gap:4px;margin-top:7px;}
  .st-nut i{flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.08);}
  .st-nut i.on{background:var(--pk-teal);}

  /* collapsible custom */
  .st-collapse{margin-top:12px;border:1px solid var(--pk-line);border-radius:14px;overflow:hidden;}
  .st-collapse .hd{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;cursor:pointer;}
  .st-collapse .hd .chev{transition:transform .25s;color:var(--pk-ink3);}
  .st-collapse.open .hd .chev{transform:rotate(180deg);}
  .st-collapse .body{padding:0 16px 16px;display:flex;flex-direction:column;gap:14px;}
  .st-optrow .pk-segpick{margin-top:7px;}

  /* matrix */
  .st-mtitle{font-family:var(--pk-mono);font-size:13px;color:var(--pk-ink2);}
  .st-mtitle b{color:var(--pk-ink);font-weight:700;}
  .st-aheadrow{display:flex;align-items:center;gap:14px;margin:10px 0 4px;}
  .st-ahead{font-family:var(--pk-mono);font-weight:800;font-size:34px;line-height:1;}
  .st-minimap{display:grid;grid-template-columns:auto 1fr;gap:6px;margin-top:6px;align-items:center;}
  .st-mmgrid{display:grid;grid-template-columns:repeat(9,1fr);gap:2px;}
  .st-mmgrid i{aspect-ratio:1;border-radius:2px;cursor:pointer;}
  .st-mmrow{display:contents;}
  .st-rowlabel{font-family:var(--pk-mono);font-size:9px;color:var(--pk-ink3);text-align:right;padding-right:2px;height:100%;display:flex;align-items:center;justify-content:flex-end;cursor:pointer;}
  .st-rowlabel.on{color:var(--pk-teal);font-weight:700;}
  .st-threats{display:flex;flex-direction:column;gap:7px;margin-top:12px;}
  .st-threat{display:flex;align-items:center;gap:9px;}
  .st-threat .tn{font-family:var(--pk-mono);font-size:11px;width:58px;flex:none;color:var(--pk-ink2);}
  .st-threat .track{flex:1;height:18px;border-radius:6px;background:rgba(148,163,184,.09);overflow:hidden;position:relative;}
  .st-threat .fill{height:100%;border-radius:6px;transition:width .4s ease;}
  .st-threat .pct{font-family:var(--pk-mono);font-size:11px;width:34px;text-align:right;flex:none;}
  .st-threat.win{opacity:.5;}
  .st-stepper{width:34px;height:34px;border-radius:10px;background:var(--pk-surface);border:1px solid var(--pk-line2);display:flex;align-items:center;justify-content:center;color:var(--pk-ink);cursor:pointer;}

  /* coach */
  .st-coach{position:absolute;inset:0;z-index:9;display:flex;flex-direction:column;background:var(--pk-base);animation:stslide .3s cubic-bezier(.2,.8,.25,1);}
  @keyframes stslide{from{transform:translateY(40px)}to{transform:none}}
  .st-ctop{flex:none;padding:8px 16px 10px;border-bottom:1px solid var(--pk-line);background:rgba(15,21,37,.9);}
  .st-cgrab{width:38px;height:4px;border-radius:3px;background:var(--pk-line2);margin:2px auto 10px;}
  .st-chand{display:flex;align-items:center;gap:10px;}
  .st-chand .nm{font-weight:680;font-size:15px;}
  .st-chand .sub{font-family:var(--pk-mono);font-size:11px;color:var(--pk-ink3);}
  .st-cclose{margin-left:auto;width:30px;height:30px;border-radius:50%;background:var(--pk-surface2);display:flex;align-items:center;justify-content:center;color:var(--pk-ink2);cursor:pointer;}
  .st-thread{flex:1;overflow-y:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:8px;}
  .st-thread::-webkit-scrollbar{width:0;}
  .st-msg{max-width:80%;padding:9px 13px;font-size:14px;line-height:1.4;border-radius:18px;}
  .st-msg.them{align-self:flex-start;background:var(--pk-surface2);color:var(--pk-ink);border-bottom-left-radius:5px;}
  .st-msg.me{align-self:flex-end;background:var(--pk-teal);color:#04261f;border-bottom-right-radius:5px;}
  .st-msg.card{align-self:flex-start;background:var(--pk-surface);border:1px solid rgba(245,158,11,.4);border-bottom-left-radius:5px;max-width:88%;}
  .st-typing{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:var(--pk-surface2);border-radius:18px;border-bottom-left-radius:5px;}
  .st-typing i{width:7px;height:7px;border-radius:50%;background:var(--pk-ink3);animation:sttd 1.2s infinite;}
  .st-typing i:nth-child(2){animation-delay:.15s;}.st-typing i:nth-child(3){animation-delay:.3s;}
  @keyframes sttd{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
  .st-suggest{flex:none;display:flex;gap:7px;padding:8px 14px 6px;overflow-x:auto;}
  .st-suggest::-webkit-scrollbar{height:0;}
  .st-chip{flex:none;font-size:12.5px;color:var(--pk-teal);background:transparent;border:1px solid var(--pk-teal);border-radius:100px;padding:7px 13px;cursor:pointer;white-space:nowrap;}
  .st-inputbar{flex:none;display:flex;align-items:center;gap:8px;padding:8px 14px 12px;}
  .st-input{flex:1;background:var(--pk-surface2);border:1px solid var(--pk-line2);border-radius:100px;padding:10px 16px;color:var(--pk-ink);font-family:var(--pk-sans);font-size:14px;outline:none;}
  .st-input::placeholder{color:var(--pk-ink3);}
  .st-send{width:38px;height:38px;border-radius:50%;background:var(--pk-teal);display:flex;align-items:center;justify-content:center;flex:none;cursor:pointer;}
  `;
  document.head.appendChild(s);
})();

// ---------- presets ----------
const C = (rank, suit) => ({ rank, suit });
const PRESETS = [
  { id: 'aads', name: 'Aces, double-suited', cards: [C('A','s'), C('A','h'), C('K','s'), C('Q','h')] },
  { id: 'bwds', name: 'Broadway, DS', cards: [C('A','s'), C('K','s'), C('Q','h'), C('J','h')] },
  { id: 'rundown', name: 'Rundown 9876', cards: [C('9','s'), C('8','h'), C('7','s'), C('6','h')] },
  { id: 'sa', name: 'Suited ace + danglers', cards: [C('A','s'), C('K','s'), C('8','d'), C('4','c')] },
  { id: 'kkqq', name: 'Kings & Queens', cards: [C('K','s'), C('K','h'), C('Q','s'), C('Q','h')] },
  { id: 'trap', name: 'Aces, dry (trap)', cards: [C('A','s'), C('A','d'), C('7','c'), C('2','h')] },
];

function Dots({ score }) {
  const n = Math.round(score / 20); // 0..5
  return (<span className="st-dots">{[0,1,2,3,4].map(i => <i key={i} className={i < n ? 'on' : ''}></i>)}</span>);
}

// ====================== SCENARIOS ======================
function ScenariosView({ situation, openSit, sel, setSel, custom, setCustom, openCoach }) {
  const { PKMiniCard, pkAdvise, pkReason } = window;
  const cards = sel.cards;
  const adv = useMemoS(() => pkAdvise(cards), [cards]);
  const [open, setOpen] = useStateS(false);
  const nut = Math.max(1, Math.min(4, Math.round(adv.playability / 25)));

  function applyCustom(next) {
    setCustom(next);
    // deterministic hand from toggles
    const suited = next.suited; // double | single | rainbow
    const struct = next.struct; // pair | nopair
    const hi = next.hi; // high | mid | low
    const pool = hi === 'high' ? ['A','K','Q','J'] : hi === 'mid' ? ['T','9','8','7'] : ['6','5','4','3'];
    let c;
    if (struct === 'pair') c = [C(pool[0],'s'), C(pool[0],'h'), C(pool[1],'s'), C(pool[2],'h')];
    else c = [C(pool[0],'s'), C(pool[1],'h'), C(pool[2],'s'), C(pool[3],'h')];
    if (suited === 'single') c = [C(c[0].rank,'s'), C(c[1].rank,'s'), C(c[2].rank,'d'), C(c[3].rank,'c')];
    if (suited === 'rainbow') c = [C(c[0].rank,'s'), C(c[1].rank,'h'), C(c[2].rank,'d'), C(c[3].rank,'c')];
    setSel({ id: 'custom', name: 'Custom hand', cards: c });
  }

  return (
    <div className="st-scroll">
      <div className="st-ctx" onClick={openSit} style={{ marginTop: 6 }}>
        <span className="lbl"><b>{situation.pos}</b> · {situation.players}-max · <b>{situation.style}</b></span>
        <span style={{ color: 'var(--pk-ink3)' }}><svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 4l3.5 3.5L9 4"/></svg></span>
      </div>

      <div className="st-seclabel"><span className="pk-eyebrow">Starting-hand presets</span><span className="mono" style={{ fontSize: 11, color: 'var(--pk-ink3)' }}>tap to analyze</span></div>
      <div className="st-presets">
        {PRESETS.map(p => {
          const pa = pkAdvise(p.cards);
          return (<div key={p.id} className={'st-preset' + (sel.id === p.id ? ' on' : '')} onClick={() => setSel(p)}>
            <div className="pcards">{p.cards.map((c, i) => <PKMiniCard key={i} rank={c.rank} suit={c.suit} w={24} h={33} />)}</div>
            <div className="pname">{p.name}</div>
            <div className="pmeta"><Dots score={pa.playability} /><span className="mono" style={{ fontSize: 10, color: 'var(--pk-ink3)', marginLeft: 'auto' }}>{pa.playability}</span></div>
          </div>);
        })}
      </div>

      <div className="st-seclabel"><span className="pk-eyebrow">Strategy insight</span><span className="mono" style={{ fontSize: 11, color: 'var(--pk-ink3)' }}>{sel.name}</span></div>
      <div className="st-insight">
        <div className="pk-badge" style={{ background: adv.action === 'RAISE' ? 'linear-gradient(120deg,rgba(245,158,11,.2),rgba(245,158,11,.04))' : adv.action === 'CALL' ? 'linear-gradient(120deg,rgba(59,130,246,.18),rgba(59,130,246,.04))' : 'linear-gradient(120deg,rgba(239,68,68,.18),rgba(239,68,68,.04))', border: '1px solid ' + (adv.action === 'RAISE' ? 'rgba(245,158,11,.45)' : adv.action === 'CALL' ? 'rgba(59,130,246,.4)' : 'rgba(239,68,68,.4)') }}>
          <div><div className="act" style={{ fontSize: 26, color: adv.color }}>{adv.action}</div>
            <div style={{ fontSize: 12.5, color: 'var(--pk-ink2)', marginTop: 3, maxWidth: 200, lineHeight: 1.35 }}>{pkReason(cards, adv)}</div></div>
          <div className="size">{adv.sizing ? <><div className="mono" style={{ fontSize: 20, color: 'var(--pk-ink)' }}>{adv.sizing.to}</div><div className="pk-eyebrow">{adv.sizing.bb}</div></> : <div className="pk-eyebrow">no bet</div>}</div>
        </div>
        <div className="st-metric">
          <div className="top"><span className="pk-eyebrow">Playability</span><span className="mono" style={{ fontSize: 13, color: 'var(--pk-teal)', fontWeight: 700 }}>{adv.playability}/100</span></div>
          <div className="st-bar"><i style={{ width: adv.playability + '%', background: 'var(--pk-teal)' }}></i></div>
        </div>
        <div className="st-metric">
          <div className="top"><span className="pk-eyebrow">Nut potential</span><span className="mono" style={{ fontSize: 12, color: 'var(--pk-ink2)' }}>{['low','fair','strong','elite'][nut-1]}</span></div>
          <div className="st-nut">{[0,1,2,3].map(i => <i key={i} className={i < nut ? 'on' : ''}></i>)}</div>
        </div>
        <div className="pk-btn" style={{ marginTop: 16, background: 'var(--pk-surface2)' }} onClick={() => openCoach(sel)}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6L8 1z" fill="var(--pk-teal)"/></svg>
          Ask the Coach about this hand
        </div>
      </div>

      <div className={'st-collapse' + (open ? ' open' : '')}>
        <div className="hd" onClick={() => setOpen(o => !o)}>
          <span style={{ fontWeight: 640, fontSize: 15 }}>Build a custom hand</span>
          <span className="chev"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 5l4 4 4-4"/></svg></span>
        </div>
        {open && <div className="body">
          {[['Suitedness', [['double','Double'],['single','Single'],['rainbow','Rainbow']], 'suited'],
            ['Structure', [['pair','Pair'],['nopair','No pair']], 'struct'],
            ['High cards', [['high','High'],['mid','Mid'],['low','Low']], 'hi']].map(([lbl, opts, key]) => (
            <div key={key} className="st-optrow">
              <span className="pk-eyebrow">{lbl}</span>
              <div className="pk-segpick" style={{ gridTemplateColumns: `repeat(${opts.length},1fr)` }}>
                {opts.map(([v, l]) => <div key={v} className={'pk-pchip' + (custom[key] === v ? ' on' : '')} onClick={() => applyCustom({ ...custom, [key]: v })}>{l}</div>)}
              </div>
            </div>))}
        </div>}
      </div>
      <div style={{ height: 6 }} />
    </div>
  );
}

// ====================== MATRIX ======================
function MatrixView({ situation, hand, setHand }) {
  const { PK_HAND_CATS, pkRowData, PK_OUTCOME_COLOR } = window;
  const opp = Math.max(1, (situation.players || 6) - 1);
  const data = useMemoS(() => pkRowData(hand, opp), [hand, opp]);
  const startX = useRefS(null);

  const step = d => setHand(h => Math.max(0, Math.min(8, h + d)));
  function onDown(e) { startX.current = e.clientX; }
  function onUp(e) { if (startX.current == null) return; const dx = e.clientX - startX.current; if (Math.abs(dx) > 44) step(dx < 0 ? 1 : -1); startX.current = null; }

  const cat = PK_HAND_CATS[hand];
  return (
    <div className="st-scroll" style={{ paddingTop: 8 }} onPointerDown={onDown} onPointerUp={onUp}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="st-stepper" onClick={() => step(-1)}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 3L5 7l4 4"/></svg></div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div className="pk-eyebrow">When I hold</div>
          <div className="mono" style={{ fontSize: 21, fontWeight: 800, color: 'var(--pk-ink)', marginTop: 2 }}>{cat.name}</div>
        </div>
        <div className="st-stepper" onClick={() => step(1)}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 3l4 4-4 4"/></svg></div>
      </div>

      <div className="st-aheadrow">
        <div>
          <div className="st-ahead" style={{ color: data.ahead >= 60 ? 'var(--pk-bet)' : data.ahead >= 40 ? 'var(--pk-raise)' : 'var(--pk-fold)' }}>{Math.round(data.ahead)}%</div>
          <div className="pk-eyebrow" style={{ marginTop: 2 }}>you're ahead</div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="pk-thermo" style={{ height: 12 }}><span className="mark" style={{ left: data.ahead + '%' }}></span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--pk-fold)' }}>{Math.round(data.beat)}% beaten</span>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--pk-ink3)' }}>vs {opp} opp</span>
          </div>
        </div>
      </div>

      {/* color minimap — orientation only, tap a row to focus it */}
      <div className="st-seclabel"><span className="pk-eyebrow">Hand-vs-hand map</span><span className="mono" style={{ fontSize: 10, color: 'var(--pk-ink3)' }}>swipe or tap a row</span></div>
      <div className="st-minimap">
        {PK_HAND_CATS.slice().reverse().map((rc, ri) => {
          const myCat = 8 - ri;
          return (<div className="st-mmrow" key={rc.key}>
            <div className={'st-rowlabel' + (myCat === hand ? ' on' : '')} onClick={() => setHand(myCat)}>{rc.short}</div>
            <div className="st-mmgrid">
              {PK_HAND_CATS.map((oc, ci) => {
                const oc2 = window.pkOutcome(myCat, ci);
                return <i key={ci} onClick={() => setHand(myCat)} style={{ background: PK_OUTCOME_COLOR[oc2], opacity: myCat === hand ? 1 : 0.34, outline: myCat === hand ? '1.5px solid var(--pk-ink)' : 'none', outlineOffset: '-1px' }}></i>;
              })}
            </div>
          </div>);
        })}
        <div></div>
        <div className="st-mmgrid" style={{ marginTop: 2 }}>{PK_HAND_CATS.map(c => <span key={c.key} style={{ fontFamily: 'var(--pk-mono)', fontSize: 6.5, color: 'var(--pk-ink3)', textAlign: 'center', transform: 'rotate(0deg)', overflow: 'hidden' }}>{c.short.slice(0,2)}</span>)}</div>
      </div>

      {/* sorted threat bars for the focused row */}
      <div className="st-seclabel"><span className="pk-eyebrow">Threat landscape · sorted</span><span className="mono" style={{ fontSize: 10, color: 'var(--pk-ink3)' }}>chance ≥1 opp holds</span></div>
      <div className="st-threats">
        {data.rows.map(r => (
          <div key={r.j} className={'st-threat' + (r.outcome === 'win' ? ' win' : '')}>
            <span className="tn" style={{ color: r.outcome === 'lose' ? 'var(--pk-fold)' : r.outcome === 'tie' ? 'var(--pk-raise)' : 'var(--pk-ink3)' }}>{r.label}</span>
            <div className="track"><div className="fill" style={{ width: Math.max(3, Math.min(100, r.pct * 1.4)) + '%', background: r.color }}></div></div>
            <span className="pct" style={{ color: r.outcome === 'win' ? 'var(--pk-ink3)' : 'var(--pk-ink)' }}>{r.pct < 1 ? r.pct.toFixed(1) : Math.round(r.pct)}%</span>
          </div>))}
      </div>
      <div style={{ display: 'flex', gap: 7, marginTop: 14, alignItems: 'center', justifyContent: 'center', color: 'var(--pk-ink3)', fontFamily: 'var(--pk-mono)', fontSize: 10.5 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--pk-fold)' }}></i>beats you</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--pk-raise)' }}></i>ties</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--pk-bet)' }}></i>you beat</span>
      </div>
      <div style={{ height: 6 }} />
    </div>
  );
}

// ====================== COACH SHEET ======================
// NOTE: the AI Coach sheet is the shared component in coach.jsx (window.PKCoachSheet).
// Study opens it via the openCoach() callback passed into StudyBody.

// ====================== STUDY APP ======================
function StudyBody({ situation, openSit, openCoach }) {
  const [sub, setSub] = useStateS(() => localStorage.getItem('pk-study-sub') || 'scenarios');
  useEffectS(() => { try { localStorage.setItem('pk-study-sub', sub); } catch {} }, [sub]);
  const [sel, setSel] = useStateS(PRESETS[0]);
  const [custom, setCustom] = useStateS({ suited: 'double', struct: 'pair', hi: 'high' });
  const [matrixHand, setMatrixHand] = useStateS(5); // Flush

  function coachContext() {
    if (sub === 'scenarios') return { kind: 'hand', name: sel.name, cards: sel.cards };
    const { PK_HAND_CATS, pkRowData } = window;
    const opp = Math.max(1, (situation.players || 6) - 1);
    const d = pkRowData(matrixHand, opp);
    return { kind: 'matrix', category: PK_HAND_CATS[matrixHand].name, catIndex: matrixHand, ahead: d.ahead, beat: d.beat, opp };
  }

  return (<>
    <div className="st-head">
      <div className="st-titlerow">
        <span className="st-title">Study</span>
        <div className="st-coachbtn" onClick={() => openCoach(coachContext())}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6L8 1z" fill="currentColor"/></svg>Coach
        </div>
      </div>
      <div className={'st-seg' + (sub === 'matrix' ? ' matrix' : '')}>
        <span className="knob"></span>
        <button className={sub === 'scenarios' ? 'on' : ''} onClick={() => setSub('scenarios')}>Scenarios</button>
        <button className={sub === 'matrix' ? 'on' : ''} onClick={() => setSub('matrix')}>Matrix</button>
      </div>
    </div>

    {sub === 'scenarios'
      ? <ScenariosView situation={situation} openSit={openSit} sel={sel} setSel={setSel} custom={custom} setCustom={setCustom} openCoach={(s) => openCoach({ kind: 'hand', name: s.name, cards: s.cards })} />
      : <MatrixView situation={situation} hand={matrixHand} setHand={setMatrixHand} />}
  </>);
}
window.StudyBody = StudyBody;

function StudyApp() {
  const { PKStatusBar, PKHomeBar, PKTabBar, PKSituationSheet } = window;
  const [situation, setSituation] = useStateS(() => { try { return JSON.parse(localStorage.getItem('pk-situation')) || { pos: 'BTN', players: 6, style: 'TAG' }; } catch { return { pos: 'BTN', players: 6, style: 'TAG' }; } });
  useEffectS(() => { try { localStorage.setItem('pk-situation', JSON.stringify(situation)); } catch {} }, [situation]);
  const [sitOpen, setSitOpen] = useStateS(false);
  const [coach, setCoach] = useStateS(null);

  const [scale, setScale] = useStateS(1);
  useEffectS(() => { const f = () => setScale(Math.min((window.innerWidth - 32) / 414, (window.innerHeight - 32) / 868, 1)); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);

  function onTab(id) { if (id === 'play') window.location.href = 'Play Mode — Interactive.html'; if (id === 'journal') window.location.href = 'Hand Journal — Interactive.html'; }

  return (
    <div className="pk-stage">
      <div className="pk-bezel" style={{ transform: `scale(${scale})` }}>
        <div className="pk-screen">
          <PKStatusBar />
          <StudyBody situation={situation} openSit={() => setSitOpen(true)} openCoach={setCoach} />
          <PKTabBar active="study" onTab={onTab} />
          <PKHomeBar />
          {sitOpen && <PKSituationSheet situation={situation} setSituation={setSituation} close={() => setSitOpen(false)} />}
          {coach && window.PKCoachSheet && <window.PKCoachSheet context={coach} close={() => setCoach(null)} />}
        </div>
      </div>
    </div>
  );
}

window.StudyApp = StudyApp;
