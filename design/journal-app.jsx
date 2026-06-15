// journal-app.jsx — Hand Journal: session-grouped entries, swipe-to-delete, tap-to-expand
// with full details + editable notes, filters (date/result/action). Consumes poker-kit.
// Persists user edits (deleted ids, notes) to localStorage 'pk-journal'. Exports JournalApp.

const { useState: useStateJ, useEffect: useEffectJ, useMemo: useMemoJ, useRef: useRefJ } = React;

(function injectJournalCSS() {
  if (document.getElementById('pk-journal')) return;
  const s = document.createElement('style');
  s.id = 'pk-journal';
  s.textContent = `
  .jr-head{flex:none;padding:6px 18px 8px;z-index:3;}
  .jr-titlerow{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
  .jr-title{font-size:24px;font-weight:720;letter-spacing:-.02em;}
  .jr-streak{margin-left:auto;display:flex;align-items:center;gap:6px;background:var(--pk-surface);border:1px solid var(--pk-line);border-radius:100px;padding:6px 12px;font-family:var(--pk-mono);font-size:12px;color:var(--pk-ink2);}
  .jr-streak b{color:var(--pk-raise);}
  .jr-filters{display:flex;gap:7px;overflow-x:auto;padding-bottom:2px;}
  .jr-filters::-webkit-scrollbar{height:0;}
  .jr-fpill{flex:none;display:flex;align-items:center;gap:6px;font-family:var(--pk-sans);font-size:12.5px;font-weight:600;color:var(--pk-ink2);background:var(--pk-surface);border:1px solid var(--pk-line);border-radius:100px;padding:8px 12px;cursor:pointer;position:relative;}
  .jr-fpill.on{color:var(--pk-teal);border-color:var(--pk-teal);background:var(--pk-teal-dim);}
  .jr-fpill .cv{color:var(--pk-ink3);transition:transform .2s;}
  .jr-fpill.open .cv{transform:rotate(180deg);}
  .jr-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:20;background:var(--pk-surface2);border:1px solid var(--pk-line2);border-radius:12px;padding:6px;min-width:130px;box-shadow:0 16px 40px -12px rgba(0,0,0,.7);}
  .jr-mitem{padding:9px 11px;border-radius:8px;font-size:13px;color:var(--pk-ink2);cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;}
  .jr-mitem.on{color:var(--pk-teal);background:var(--pk-teal-dim);}

  .jr-scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding:6px 14px 18px;-webkit-overflow-scrolling:touch;}
  .jr-scroll::-webkit-scrollbar{width:0;}
  .jr-sesh{display:flex;align-items:center;gap:10px;margin:16px 4px 9px;}
  .jr-sesh .sl{font-weight:680;font-size:14px;}
  .jr-sesh .sd{font-family:var(--pk-mono);font-size:11px;color:var(--pk-ink3);}
  .jr-sesh .net{margin-left:auto;font-family:var(--pk-mono);font-size:13px;font-weight:700;}
  .jr-sstat{font-family:var(--pk-mono);font-size:10.5px;color:var(--pk-ink3);margin:-4px 4px 8px;}

  .jr-rowwrap{position:relative;border-radius:14px;overflow:hidden;margin-bottom:9px;background:var(--pk-fold);}
  .jr-delzone{position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-end;padding-right:22px;color:#fff;font-weight:700;font-size:13px;font-family:var(--pk-sans);gap:7px;}
  .jr-row{position:relative;background:var(--pk-surface);border:1px solid var(--pk-line);border-radius:14px;padding:12px 13px;cursor:pointer;touch-action:pan-y;transition:transform .18s cubic-bezier(.3,.9,.3,1);}
  .jr-row.dragging{transition:none;}
  .jr-rtop{display:flex;align-items:center;gap:10px;}
  .jr-cards{display:flex;gap:3px;}
  .jr-time{font-family:var(--pk-mono);font-size:10.5px;color:var(--pk-ink3);margin-left:2px;}
  .jr-badge{font-family:var(--pk-mono);font-weight:800;font-size:11px;letter-spacing:.04em;padding:4px 9px;border-radius:7px;}
  .jr-amt{margin-left:auto;font-family:var(--pk-mono);font-weight:700;font-size:15px;}
  .jr-rmid{display:flex;align-items:center;gap:8px;margin-top:9px;}
  .jr-tag{font-family:var(--pk-mono);font-size:10px;color:var(--pk-teal);background:var(--pk-teal-dim);border:1px solid var(--pk-teal-line,rgba(0,212,170,.4));border-radius:100px;padding:3px 9px;}
  .jr-diverge{display:flex;align-items:center;gap:5px;font-family:var(--pk-mono);font-size:10px;color:var(--pk-raise);margin-left:auto;}

  .jr-exp{margin-top:12px;border-top:1px solid var(--pk-line);padding-top:12px;animation:jrfade .25s ease;}
  @keyframes jrfade{from{transform:translateY(-4px)}to{transform:none}}
  .jr-board{display:flex;align-items:flex-end;gap:10px;margin-bottom:12px;}
  .jr-bgroup .gl{font-family:var(--pk-mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--pk-ink3);margin-bottom:5px;}
  .jr-bcards{display:flex;gap:4px;}
  .jr-cmp{display:flex;gap:8px;margin-bottom:12px;}
  .jr-cmpcell{flex:1;background:var(--pk-surface2);border:1px solid var(--pk-line);border-radius:11px;padding:9px 11px;}
  .jr-cmpcell .l{font-family:var(--pk-mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--pk-ink3);}
  .jr-cmpcell .v{font-family:var(--pk-mono);font-weight:800;font-size:16px;margin-top:3px;}
  .jr-stats{display:flex;gap:14px;margin-bottom:12px;}
  .jr-stats .st{font-family:var(--pk-mono);font-size:11px;color:var(--pk-ink2);}
  .jr-stats .st b{color:var(--pk-ink);}
  .jr-notelabel{font-family:var(--pk-mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--pk-ink3);margin-bottom:7px;}
  .jr-note{width:100%;min-height:64px;background:var(--pk-surface2);border:1px solid var(--pk-line2);border-radius:11px;padding:11px 13px;color:var(--pk-ink);font-family:var(--pk-sans);font-size:13.5px;line-height:1.45;outline:none;resize:none;}
  .jr-note::placeholder{color:var(--pk-ink3);}
  .jr-expacts{display:flex;gap:9px;margin-top:11px;}

  .jr-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;height:100%;padding:0 40px;color:var(--pk-ink3);}
  .jr-empty .ic{width:64px;height:64px;border-radius:18px;background:var(--pk-surface);border:1px solid var(--pk-line);display:flex;align-items:center;justify-content:center;margin-bottom:16px;}
  .jr-empty .t{font-size:17px;font-weight:650;color:var(--pk-ink2);margin-bottom:6px;}
  .jr-empty .s{font-size:13.5px;line-height:1.5;}
  `;
  document.head.appendChild(s);
})();

const JC = (rank, suit) => ({ rank, suit });
const DAY = 86400000;
const now = Date.now();
function at(daysAgo, h, m) { const d = new Date(now - daysAgo * DAY); d.setHours(h, m, 0, 0); return d.getTime(); }

// ---------- seed sessions + hands ----------
const SESSIONS = [
  { id: 's1', label: 'Aria 2/5 NL Omaha', venue: 'Live · 2 hr', ts: at(0, 21, 30) },
  { id: 's2', label: 'Home game PLO', venue: 'Live · 4 hr', ts: at(3, 23, 10) },
  { id: 's3', label: 'Bellagio 5/10', venue: 'Live · 3 hr', ts: at(13, 1, 20) },
];
const HANDS = [
  // s1 — today
  { id: 'h1', s: 's1', ts: at(0, 21, 5), hole: [JC('A','s'),JC('A','h'),JC('K','s'),JC('Q','h')], board: [JC('A','d'),JC('7','s'),JC('2','c'),JC('9','h'),JC('3','d')],
    advised: 'RAISE', size: '$175', took: 'RAISE', equity: 71, conf: 92, result: 'win', amt: 340, tags: ['#value','#set'], note: 'Flopped top set, got it in vs two pair. Textbook.' },
  { id: 'h2', s: 's1', ts: at(0, 20, 40), hole: [JC('J','s'),JC('T','s'),JC('9','h'),JC('8','h')], board: [JC('Q','s'),JC('7','d'),JC('2','c')],
    advised: 'RAISE', size: '$60', took: 'CALL', equity: 58, conf: 74, result: 'loss', amt: -60, tags: ['#draw'], note: 'Wrapped + flush draw, should have raised the flop for the semi-bluff. Got there and missed.' },
  { id: 'h3', s: 's1', ts: at(0, 20, 12), hole: [JC('A','c'),JC('A','d'),JC('8','s'),JC('3','h')], board: [JC('K','s'),JC('Q','d'),JC('J','c')],
    advised: 'FOLD', size: null, took: 'FOLD', equity: 31, conf: 81, result: 'win', amt: 0, tags: ['#discipline'], note: 'Dry aces on a connected broadway board. Easy fold, coach agreed.' },
  { id: 'h4', s: 's1', ts: at(0, 19, 50), hole: [JC('K','s'),JC('K','h'),JC('Q','s'),JC('Q','h')], board: [JC('K','d'),JC('5','s'),JC('5','h'),JC('2','d')],
    advised: 'RAISE', size: '$220', took: 'RAISE', equity: 84, conf: 95, result: 'win', amt: 510, tags: ['#value','#boat'], note: '' },
  // s2 — 3 days ago
  { id: 'h5', s: 's2', ts: at(3, 22, 50), hole: [JC('9','s'),JC('8','s'),JC('7','h'),JC('6','h')], board: [JC('T','s'),JC('5','d'),JC('4','c'),JC('K','s')],
    advised: 'RAISE', size: '$45', took: 'RAISE', equity: 62, conf: 70, result: 'win', amt: 120, tags: ['#draw','#bluff'], note: 'Double-suited rundown, semi-bluffed turn and they folded.' },
  { id: 'h6', s: 's2', ts: at(3, 22, 20), hole: [JC('A','s'),JC('K','d'),JC('7','c'),JC('2','h')], board: [JC('Q','s'),JC('9','d'),JC('4','c')],
    advised: 'FOLD', size: null, took: 'CALL', equity: 28, conf: 77, result: 'loss', amt: -85, tags: ['#leak'], note: 'Called with one pair and no draw — exactly the spot the coach flags. Stop doing this.' },
  { id: 'h7', s: 's2', ts: at(3, 21, 35), hole: [JC('A','h'),JC('A','s'),JC('J','h'),JC('T','s')], board: [JC('J','d'),JC('T','c'),JC('3','h'),JC('3','s'),JC('K','h')],
    advised: 'CALL', size: '$90', took: 'RAISE', equity: 52, conf: 63, result: 'loss', amt: -240, tags: ['#thin'], note: 'Overplayed aces-up into a likely boat. Coach said call, I raised. Lesson logged.' },
  // s3 — ~2 weeks ago
  { id: 'h8', s: 's3', ts: at(13, 1, 5), hole: [JC('A','s'),JC('K','s'),JC('Q','d'),JC('J','d')], board: [JC('T','s'),JC('9','s'),JC('2','h')],
    advised: 'RAISE', size: '$120', took: 'RAISE', equity: 78, conf: 88, result: 'win', amt: 430, tags: ['#nuts','#draw'], note: 'Broadway wrap + nut flush draw, the dream. Stacked a set.' },
  { id: 'h9', s: 's3', ts: at(13, 0, 40), hole: [JC('K','c'),JC('K','d'),JC('6','s'),JC('2','h')], board: [JC('A','s'),JC('A','d'),JC('8','c')],
    advised: 'FOLD', size: null, took: 'FOLD', equity: 22, conf: 90, result: 'win', amt: 0, tags: ['#discipline'], note: '' },
  { id: 'h10', s: 's3', ts: at(13, 0, 10), hole: [JC('Q','s'),JC('Q','h'),JC('J','s'),JC('9','h')], board: [JC('J','c'),JC('9','d'),JC('4','s'),JC('Q','h')],
    advised: 'RAISE', size: '$160', took: 'RAISE', equity: 81, conf: 90, result: 'win', amt: 295, tags: ['#boat','#value'], note: 'Turned top boat. Value owned them.' },
];

const ACT_COLOR = { RAISE: 'var(--pk-raise)', CALL: 'var(--pk-call)', FOLD: 'var(--pk-fold)' };
const ACT_BG = { RAISE: 'rgba(245,158,11,.16)', CALL: 'rgba(59,130,246,.16)', FOLD: 'rgba(239,68,68,.16)' };

function loadStore() { try { return JSON.parse(localStorage.getItem('pk-journal')) || { deleted: [], notes: {} }; } catch { return { deleted: [], notes: {} }; } }
function saveStore(s) { try { localStorage.setItem('pk-journal', JSON.stringify(s)); } catch {} }

function fmtTime(ts) { const d = new Date(ts); let h = d.getHours(), m = d.getMinutes(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + String(m).padStart(2, '0') + ' ' + ap; }
function fmtSession(ts) {
  const d = new Date(ts); const diff = Math.floor((now - ts) / DAY);
  const wk = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return wk;
  return wk + ' · ' + (d.getMonth() + 1) + '/' + d.getDate();
}
function money(n) { return (n > 0 ? '+$' : n < 0 ? '−$' : '$') + Math.abs(n); }

// ---------- filter pill ----------
function FilterPill({ label, value, options, active, open, onOpen, onPick }) {
  return (
    <div className={'jr-fpill' + (active ? ' on' : '') + (open ? ' open' : '')} onClick={onOpen}>
      <span>{value === 'all' ? label : options.find(o => o[0] === value)[1]}</span>
      <span className="cv"><svg width="9" height="9" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 4l3.5 3.5L9 4"/></svg></span>
      {open && <div className="jr-menu" onClick={e => e.stopPropagation()}>
        {options.map(([v, l]) => (
          <div key={v} className={'jr-mitem' + (value === v ? ' on' : '')} onClick={() => onPick(v)}>
            {l}{value === v && <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 7l3.5 3.5L12 4"/></svg>}
          </div>))}
      </div>}
    </div>
  );
}

// ---------- hand row ----------
function HandRow({ hand, expanded, onToggle, onDelete, note, setNote, onReplay }) {
  const { PKMiniCard, PKCard } = window;
  const [dx, setDx] = useStateJ(0);
  const [drag, setDrag] = useStateJ(false);
  const start = useRefJ(null);
  const dxRef = useRefJ(0);
  const moved = useRefJ(false);
  const dragRef = useRefJ(false);

  function setX(v) { dxRef.current = v; setDx(v); }
  function down(e) { if (expanded) return; start.current = { x: e.clientX, y: e.clientY }; moved.current = false; dragRef.current = false; }
  function move(e) {
    if (!start.current) return;
    const ddx = e.clientX - start.current.x, ddy = e.clientY - start.current.y;
    if (Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(ddy)) { dragRef.current = true; moved.current = true; if (!drag) setDrag(true); setX(Math.max(-104, Math.min(0, ddx))); }
  }
  function up() {
    if (!start.current) return;
    if (dragRef.current) setX(dxRef.current < -56 ? -92 : 0);
    start.current = null; setDrag(false);
  }
  function click() { if (moved.current) { moved.current = false; return; } if (dxRef.current < -10) { setX(0); return; } onToggle(); }

  const diverged = hand.advised !== hand.took;
  return (
    <div className="jr-rowwrap">
      <div className="jr-delzone" onClick={() => onDelete(hand.id)}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"><path d="M3 4h10M6 4V2.5h4V4M5 4l.7 9h4.6L11 4"/></svg>Delete
      </div>
      <div className={'jr-row' + (drag ? ' dragging' : '')} style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={click}>
        <div className="jr-rtop">
          <div className="jr-cards">{hand.hole.map((c, i) => <PKMiniCard key={i} rank={c.rank} suit={c.suit} w={22} h={31} />)}</div>
          <span className="jr-time">{fmtTime(hand.ts)}</span>
          <span className="jr-badge" style={{ color: ACT_COLOR[hand.advised], background: ACT_BG[hand.advised] }}>{hand.advised}</span>
          {hand.result === 'pending'
            ? <span className="jr-amt" style={{ fontSize: 11, color: 'var(--pk-teal)', background: 'var(--pk-teal-dim)', border: '1px solid var(--pk-teal)', borderRadius: 100, padding: '3px 9px' }}>logged</span>
            : <span className="jr-amt" style={{ color: hand.amt > 0 ? 'var(--pk-bet)' : hand.amt < 0 ? 'var(--pk-fold)' : 'var(--pk-ink3)' }}>{money(hand.amt)}</span>}
        </div>
        <div className="jr-rmid">
          {hand.tags.slice(0, 2).map(t => <span key={t} className="jr-tag">{t}</span>)}
          {diverged && <span className="jr-diverge"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 1v7M6 10.5v.5" strokeLinecap="round"/><circle cx="6" cy="6" r="5"/></svg>played {hand.took.toLowerCase()}</span>}
        </div>

        {expanded && <div className="jr-exp" onClick={e => e.stopPropagation()}>
          <div className="jr-board">
            <div className="jr-bgroup"><div className="gl">Hand</div><div className="jr-bcards">{hand.hole.map((c, i) => <PKCard key={i} rank={c.rank} suit={c.suit} w={30} h={42} />)}</div></div>
            {hand.board.length > 0 && <div className="jr-bgroup"><div className="gl">Board</div><div className="jr-bcards">{hand.board.map((c, i) => <PKCard key={i} rank={c.rank} suit={c.suit} w={30} h={42} />)}</div></div>}
          </div>
          <div className="jr-cmp">
            <div className="jr-cmpcell"><div className="l">Coach advised</div><div className="v" style={{ color: ACT_COLOR[hand.advised] }}>{hand.advised}{hand.size ? ' ' + hand.size : ''}</div></div>
            <div className="jr-cmpcell" style={diverged ? { borderColor: 'rgba(245,158,11,.4)' } : null}><div className="l">You played</div><div className="v" style={{ color: ACT_COLOR[hand.took] }}>{hand.took}{diverged ? ' ⚠' : ' ✓'}</div></div>
          </div>
          <div className="jr-stats">
            <span className="st">Equity <b>{hand.equity}%</b></span>
            <span className="st">Confidence <b>{hand.conf}%</b></span>
            <span className="st">Result <b style={{ color: hand.result === 'pending' ? 'var(--pk-teal)' : hand.amt > 0 ? 'var(--pk-bet)' : hand.amt < 0 ? 'var(--pk-fold)' : 'var(--pk-ink2)' }}>{hand.result === 'pending' ? 'open' : money(hand.amt)}</b></span>
          </div>
          <div className="jr-notelabel">Your note</div>
          <textarea className="jr-note" value={note} onChange={e => setNote(hand.id, e.target.value)} placeholder="What did you learn from this hand?"></textarea>
          <div className="jr-expacts">
            <div className="pk-btn" style={{ flex: 1, background: 'var(--pk-surface2)', minHeight: 42 }} onClick={() => onReplay && onReplay(hand)}>↻ Replay in Advisor</div>
          </div>
        </div>}
      </div>
    </div>
  );
}

// ---------- main ----------
function JournalBody({ savedHands, onReplay }) {
  const [store, setStore] = useStateJ(loadStore);
  const [expanded, setExpanded] = useStateJ(null);
  const [fDate, setFDate] = useStateJ('all');
  const [fResult, setFResult] = useStateJ('all');
  const [fAction, setFAction] = useStateJ('all');
  const [openF, setOpenF] = useStateJ(null);

  useEffectJ(() => saveStore(store), [store]);

  function del(id) { setStore(s => ({ ...s, deleted: [...s.deleted, id] })); if (expanded === id) setExpanded(null); }
  function setNote(id, v) { setStore(s => ({ ...s, notes: { ...s.notes, [id]: v } })); }
  function noteFor(h) { return store.notes[h.id] != null ? store.notes[h.id] : h.note; }

  const saved = savedHands || [];
  const liveSession = saved.length ? [{ id: 'live', label: 'This session', venue: 'live · just now', ts: now }] : [];
  const allSessions = [...liveSession, ...SESSIONS];
  const allHands = useMemoJ(() => [...saved, ...HANDS], [saved]);

  const visible = useMemoJ(() => allHands.filter(h => {
    if (store.deleted.includes(h.id)) return false;
    if (fDate !== 'all') { const diff = (now - h.ts) / DAY; if (fDate === 'today' && diff > 1) return false; if (fDate === 'week' && diff > 7) return false; if (fDate === 'month' && diff > 31) return false; }
    if (fResult !== 'all') { if (fResult === 'win' && h.amt <= 0) return false; if (fResult === 'loss' && h.amt >= 0) return false; }
    if (fAction !== 'all' && h.took !== fAction) return false;
    return true;
  }), [allHands, store.deleted, fDate, fResult, fAction]);

  const grouped = useMemoJ(() => allSessions.map(se => ({ se, hands: visible.filter(h => h.s === se.id) })).filter(g => g.hands.length), [visible, saved.length]);
  const totalNet = useMemoJ(() => visible.reduce((a, h) => a + h.amt, 0), [visible]);

  const dateOpts = [['all','All time'],['today','Today'],['week','This week'],['month','This month']];
  const resOpts = [['all','Win & loss'],['win','Wins'],['loss','Losses']];
  const actOpts = [['all','Any action'],['RAISE','Raised'],['CALL','Called'],['FOLD','Folded']];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onClick={() => setOpenF(null)}>
      <div className="jr-head">
        <div className="jr-titlerow">
          <span className="jr-title">Journal</span>
          <span className="jr-streak"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1c1.5 2.5 3.5 3.5 3.5 6.5A3.5 3.5 0 017 11a3.5 3.5 0 01-3.5-3.5C3.5 5 5 4 7 1z" fill="var(--pk-raise)"/></svg><b>{allSessions.length}</b> sessions</span>
        </div>
        <div className="jr-filters" onClick={e => e.stopPropagation()}>
          <FilterPill label="All time" value={fDate} options={dateOpts} active={fDate !== 'all'} open={openF === 'date'} onOpen={() => setOpenF(openF === 'date' ? null : 'date')} onPick={v => { setFDate(v); setOpenF(null); }} />
          <FilterPill label="Result" value={fResult} options={resOpts} active={fResult !== 'all'} open={openF === 'res'} onOpen={() => setOpenF(openF === 'res' ? null : 'res')} onPick={v => { setFResult(v); setOpenF(null); }} />
          <FilterPill label="Action" value={fAction} options={actOpts} active={fAction !== 'all'} open={openF === 'act'} onOpen={() => setOpenF(openF === 'act' ? null : 'act')} onPick={v => { setFAction(v); setOpenF(null); }} />
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="jr-empty">
          <div className="ic"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--pk-ink3)" strokeWidth="1.5"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3" strokeLinecap="round"/></svg></div>
          <div className="t">No hands match</div>
          <div className="s">{store.deleted.length >= allHands.length ? 'Save your first hand from the Advisor — it’ll appear here as a diary entry.' : 'Try clearing a filter to see more of your session history.'}</div>
        </div>
      ) : (
        <div className="jr-scroll" onClick={() => setOpenF(null)}>
          {grouped.map(({ se, hands }) => {
            const net = hands.reduce((a, h) => a + h.amt, 0);
            const wins = hands.filter(h => h.amt > 0).length, losses = hands.filter(h => h.amt < 0).length;
            const followed = hands.filter(h => h.advised === h.took).length;
            const live = se.id === 'live';
            return (
              <div key={se.id}>
                <div className="jr-sesh">
                  <div><div className="sl">{live ? <span style={{ color: 'var(--pk-teal)' }}>● </span> : null}{fmtSession(se.ts)} · {se.label}</div></div>
                  {!live && <span className="net" style={{ color: net > 0 ? 'var(--pk-bet)' : net < 0 ? 'var(--pk-fold)' : 'var(--pk-ink3)' }}>{money(net)}</span>}
                </div>
                <div className="jr-sstat">{live ? hands.length + ' saved · in progress · ' + se.venue : hands.length + ' hands · ' + wins + 'W ' + losses + 'L · followed coach ' + followed + '/' + hands.length + ' · ' + se.venue}</div>
                {hands.map(h => (
                  <HandRow key={h.id} hand={h} expanded={expanded === h.id} onToggle={() => setExpanded(expanded === h.id ? null : h.id)} onDelete={del} note={noteFor(h)} setNote={setNote} onReplay={onReplay} />
                ))}
              </div>);
          })}
          <div style={{ textAlign: 'center', fontFamily: 'var(--pk-mono)', fontSize: 11, color: 'var(--pk-ink3)', marginTop: 16 }}>
            {visible.length} hands · net <b style={{ color: totalNet >= 0 ? 'var(--pk-bet)' : 'var(--pk-fold)' }}>{money(totalNet)}</b>
          </div>
        </div>
      )}
    </div>
  );
}
window.JournalBody = JournalBody;

function JournalApp() {
  const { PKStatusBar, PKHomeBar, PKTabBar } = window;
  const [scale, setScale] = useStateJ(1);
  useEffectJ(() => { const f = () => setScale(Math.min((window.innerWidth - 32) / 414, (window.innerHeight - 32) / 868, 1)); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const savedHands = useMemoJ(() => { try { return JSON.parse(localStorage.getItem('pk-journal-saved')) || []; } catch { return []; } }, []);
  function onReplay(hand) { try { localStorage.setItem('pk-cards', JSON.stringify(hand.hole)); localStorage.setItem('pk-play-mode', 'starter'); } catch {} window.location.href = 'Play Mode — Interactive.html'; }
  function onTab(id) { if (id === 'play') window.location.href = 'Play Mode — Interactive.html'; if (id === 'study') window.location.href = 'Study Mode — Interactive.html'; }
  return (
    <div className="pk-stage">
      <div className="pk-bezel" style={{ transform: `scale(${scale})` }}>
        <div className="pk-screen">
          <PKStatusBar />
          <JournalBody savedHands={savedHands} onReplay={onReplay} />
          <PKTabBar active="journal" onTab={onTab} />
          <PKHomeBar />
        </div>
      </div>
    </div>
  );
}

window.JournalApp = JournalApp;
