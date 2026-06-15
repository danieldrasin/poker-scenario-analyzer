// app.jsx — Unified prototype shell. One bezel/status-bar/tab-bar; instant tab switching
// (all three Bodies stay mounted). Owns shared situation/mode/cards/coach + saved hands.
// Adds launch splash + 3-step first-run walkthrough. Consumes window.{PlayBody,StudyBody,JournalBody,PK*}.

const { useState: useA, useEffect: useEA, useRef: useRA } = React;

(function injectShellCSS() {
  if (document.getElementById('pk-shell')) return;
  const s = document.createElement('style');
  s.id = 'pk-shell';
  s.textContent = `
  .sh-pane{flex:1;min-height:0;display:flex;flex-direction:column;}
  .sh-splash{position:absolute;inset:0;z-index:14;background:radial-gradient(620px 520px at 50% 30%,#11263e,#070b13 72%);
    display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 38px;}
  .sh-logo{width:98px;height:98px;border-radius:28px;background:linear-gradient(160deg,#11271f,#0b1a2c);border:1px solid var(--pk-teal);
    display:flex;align-items:center;justify-content:center;margin-bottom:24px;box-shadow:0 24px 60px -18px rgba(0,212,170,.55);position:relative;}
  .sh-suits{font-size:13px;letter-spacing:5px;margin-top:14px;color:var(--pk-ink3);}
  .sh-name{font-size:31px;font-weight:780;letter-spacing:-.03em;}
  .sh-name b{color:var(--pk-teal);font-weight:780;}
  .sh-tag{color:var(--pk-ink2);font-size:15px;margin-top:12px;margin-bottom:42px;line-height:1.5;max-width:30ch;}
  .sh-start{width:100%;max-width:300px;}
  .sh-foot{position:absolute;bottom:42px;font-family:var(--pk-mono);font-size:11px;color:var(--pk-ink3);letter-spacing:.04em;}

  .wt-overlay{position:absolute;inset:0;z-index:10;}
  .wt-spot{position:absolute;box-shadow:0 0 0 9999px rgba(6,10,18,.76);border:2px solid var(--pk-teal);border-radius:18px;pointer-events:none;}
  .wt-tip{position:absolute;left:20px;right:20px;background:var(--pk-surface);border:1px solid var(--pk-line2);border-radius:16px;
    padding:16px 18px;box-shadow:0 24px 56px -16px rgba(0,0,0,.75);}
  .wt-step{font-family:var(--pk-mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--pk-teal);}
  .wt-title{font-size:18px;font-weight:720;margin:6px 0 7px;letter-spacing:-.01em;}
  .wt-body{font-size:13.5px;color:var(--pk-ink2);line-height:1.5;}
  .wt-row{display:flex;align-items:center;margin-top:15px;gap:10px;}
  .wt-dots{display:flex;gap:6px;}
  .wt-dots i{width:7px;height:7px;border-radius:50%;background:var(--pk-line2);transition:background .2s;}
  .wt-dots i.on{background:var(--pk-teal);}
  .wt-skip{font-family:var(--pk-mono);font-size:12px;color:var(--pk-ink3);cursor:pointer;}
  .wt-next{margin-left:auto;background:var(--pk-teal);color:#04261f;font-weight:680;font-size:14px;border:none;border-radius:11px;
    padding:9px 20px;cursor:pointer;font-family:var(--pk-sans);}
  .sh-toast{position:absolute;left:50%;bottom:100px;transform:translateX(-50%);z-index:13;background:var(--pk-surface2);
    border:1px solid var(--pk-teal);color:var(--pk-ink);font-size:13px;font-weight:600;padding:11px 18px;border-radius:100px;
    box-shadow:0 16px 40px -12px rgba(0,0,0,.7);display:flex;align-items:center;gap:8px;animation:shtoast .3s ease;}
  @keyframes shtoast{from{transform:translate(-50%,12px)}to{transform:translate(-50%,0)}}
  @keyframes shfade{from{opacity:.001}to{opacity:1}}
  `;
  document.head.appendChild(s);
})();

const WT_STEPS = [
  { spot: { top: 520, left: 8, width: 374, height: 236 }, tipTop: 300,
    title: 'Enter your cards', body: "Tap a rank, then a suit to deal your four hole cards — two taps each, all within your thumb's reach." },
  { spot: { top: 150, left: 118, width: 154, height: 154, radius: 80 }, tipTop: 324,
    title: 'Your read appears instantly', body: 'The moment all four cards are in, your RAISE / CALL / FOLD, sizing and equity show up right here.' },
  { spot: { top: 150, left: 20, width: 350, height: 300 }, tipTop: 474,
    title: 'Swipe up to save', body: 'Got a hand worth remembering? Swipe up on the result to log it to your Journal in one gesture.' },
];

function LaunchSplash({ onStart }) {
  return (
    <div className="sh-splash">
      <div className="sh-logo">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none"><path d="M12 2C9 6 4 8.5 4 13.5A5 5 0 0012 18a5 5 0 008-4.5C20 8.5 15 6 12 2z" fill="var(--pk-teal)"/><path d="M12 16v5M9 21h6" stroke="#04261f" strokeWidth="1.6" strokeLinecap="round"/></svg>
      </div>
      <div className="sh-name">Omaha <b>Edge</b></div>
      <div className="sh-suits">♠ ♥ ♦ ♣</div>
      <div className="sh-tag">Cards in, decision out. Your pocket PLO advisor, coach and hand journal.</div>
      <div className="pk-btn primary sh-start" onClick={onStart}>Get started</div>
      <div className="sh-foot">v1.0 · bring your own AI key</div>
    </div>
  );
}

function Walkthrough({ step, onNext, onSkip }) {
  const st = WT_STEPS[step];
  const last = step === WT_STEPS.length - 1;
  return (
    <div className="wt-overlay" onClick={e => e.stopPropagation()}>
      <div className="wt-spot" style={{ top: st.spot.top, left: st.spot.left, width: st.spot.width, height: st.spot.height, borderRadius: st.spot.radius || 18 }}></div>
      <div className="wt-tip" style={{ top: st.tipTop }}>
        <div className="wt-step">Step {step + 1} of {WT_STEPS.length}</div>
        <div className="wt-title">{st.title}</div>
        <div className="wt-body">{st.body}</div>
        <div className="wt-row">
          <div className="wt-dots">{WT_STEPS.map((_, i) => <i key={i} className={i === step ? 'on' : ''}></i>)}</div>
          <span className="wt-skip" onClick={onSkip}>Skip</span>
          <button className="wt-next" onClick={onNext}>{last ? 'Got it' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}

function UnifiedApp() {
  const { PKStatusBar, PKHomeBar, PKTabBar, PKSituationSheet, PlayBody, StudyBody, JournalBody, PKCoachSheet } = window;

  const [tab, setTab] = useA('play');
  const [situation, setSituation] = useA(() => { try { return JSON.parse(localStorage.getItem('pk-situation')) || { pos: 'BTN', players: 6, style: 'TAG' }; } catch { return { pos: 'BTN', players: 6, style: 'TAG' }; } });
  useEA(() => { try { localStorage.setItem('pk-situation', JSON.stringify(situation)); } catch {} }, [situation]);
  const [mode, setMode] = useA(() => localStorage.getItem('pk-play-mode') || 'starter');
  useEA(() => { try { localStorage.setItem('pk-play-mode', mode); } catch {} }, [mode]);
  const [cards, setCards] = useA(() => { try { return JSON.parse(localStorage.getItem('pk-cards')) || []; } catch { return []; } });
  useEA(() => { try { localStorage.setItem('pk-cards', JSON.stringify(cards)); } catch {} }, [cards]);
  const [savedHands, setSavedHands] = useA(() => { try { return JSON.parse(localStorage.getItem('pk-journal-saved')) || []; } catch { return []; } });
  useEA(() => { try { localStorage.setItem('pk-journal-saved', JSON.stringify(savedHands)); } catch {} }, [savedHands]);

  const [coach, setCoach] = useA(null);
  const [sitOpen, setSitOpen] = useA(false);
  const [toast, setToast] = useA(null);

  const onboarded = (() => { try { return localStorage.getItem('pk-onboarded') === '1'; } catch { return false; } })();
  const [splash, setSplash] = useA(!onboarded);
  const [wt, setWt] = useA(-1);

  const [scale, setScale] = useA(1);
  useEA(() => { const f = () => setScale(Math.min((window.innerWidth - 32) / 414, (window.innerHeight - 32) / 868, 1)); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);

  function showToast(t) { setToast(t); clearTimeout(showToast._t); showToast._t = setTimeout(() => setToast(null), 1900); }
  function onSaveHand(entry) { setSavedHands(a => [entry, ...a]); showToast('Saved to Journal'); }
  function onReplay(hand) { setCards(hand.hole.slice()); setMode('starter'); setTab('play'); showToast('Loaded into Advisor'); }

  function startApp() { setSplash(false); setTab('play'); setMode('starter'); setCards([]); setWt(0); }
  function wtNext() { setWt(s => { if (s >= WT_STEPS.length - 1) { try { localStorage.setItem('pk-onboarded', '1'); } catch {} return -1; } return s + 1; }); }
  function wtSkip() { try { localStorage.setItem('pk-onboarded', '1'); } catch {} setWt(-1); }

  const pane = (id, body) => (<div className="sh-pane" style={{ display: tab === id ? 'flex' : 'none' }}>{body}</div>);

  return (
    <div className="pk-stage">
      <div className="pk-bezel" style={{ transform: `scale(${scale})` }}>
        <div className="pk-screen">
          <PKStatusBar />

          {pane('play', <PlayBody mode={mode} setMode={setMode} cards={cards} setCards={setCards} situation={situation} openSit={() => setSitOpen(true)} openCoach={setCoach} onSaveHand={onSaveHand} />)}
          {pane('study', <StudyBody situation={situation} openSit={() => setSitOpen(true)} openCoach={setCoach} />)}
          {pane('journal', <JournalBody savedHands={savedHands} onReplay={onReplay} />)}

          <PKTabBar active={tab} onTab={setTab} />
          <PKHomeBar />

          {sitOpen && <PKSituationSheet situation={situation} setSituation={setSituation} close={() => setSitOpen(false)} />}
          {coach && PKCoachSheet && <PKCoachSheet context={coach} close={() => setCoach(null)} />}
          {toast && <div className="sh-toast"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--pk-teal)" strokeWidth="2" strokeLinecap="round"><path d="M2 7l3.5 3.5L12 4"/></svg>{toast}</div>}
          {wt >= 0 && tab === 'play' && <Walkthrough step={wt} onNext={wtNext} onSkip={wtSkip} />}
          {splash && <LaunchSplash onStart={startApp} />}
        </div>
      </div>
    </div>
  );
}

window.UnifiedApp = UnifiedApp;
