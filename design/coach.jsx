// coach.jsx — shared AI Coach sheet used by Play + Study. Consumes poker-kit via window.
// Features: BYOK first-run (provider picker + key field), context-aware chat
// (hand | matrix | play), iMessage bubbles, typing, suggested replies, card-bubble answers.
// Exports: window.PKCoachSheet, window.pkCoachConfigured, window.pkCoachReset.

const { useState: useStateC, useEffect: useEffectC, useRef: useRefC } = React;

(function injectCoachCSS() {
  if (document.getElementById('pk-coach')) return;
  const s = document.createElement('style');
  s.id = 'pk-coach';
  s.textContent = `
  .co-wrap{position:absolute;inset:0;z-index:12;display:flex;flex-direction:column;background:var(--pk-base);animation:corise .3s cubic-bezier(.2,.8,.25,1);}
  @keyframes corise{from{transform:translateY(40px)}to{transform:none}}
  .co-top{flex:none;padding:8px 16px 10px;border-bottom:1px solid var(--pk-line);background:rgba(15,21,37,.9);}
  .co-grab{width:38px;height:4px;border-radius:3px;background:var(--pk-line2);margin:2px auto 10px;}
  .co-hrow{display:flex;align-items:center;gap:10px;}
  .co-nm{font-weight:680;font-size:15px;display:flex;align-items:center;gap:7px;}
  .co-sub{font-family:var(--pk-mono);font-size:11px;color:var(--pk-ink3);}
  .co-dot{width:6px;height:6px;border-radius:50%;background:var(--pk-bet);box-shadow:0 0 6px var(--pk-bet);}
  .co-iconbtn{width:30px;height:30px;border-radius:50%;background:var(--pk-surface2);display:flex;align-items:center;justify-content:center;color:var(--pk-ink2);cursor:pointer;}
  .co-ctxchip{display:flex;align-items:center;gap:8px;margin-top:10px;padding:8px 11px;background:var(--pk-surface2);border:1px solid var(--pk-line);border-radius:11px;}
  .co-ctxchip .t{font-family:var(--pk-mono);font-size:11px;color:var(--pk-ink2);}
  .co-ctxchip .t b{color:var(--pk-ink);font-weight:700;}
  .co-mmini{display:grid;grid-template-columns:repeat(9,1fr);gap:1.5px;width:74px;}
  .co-mmini i{aspect-ratio:1;border-radius:1px;}

  .co-thread{flex:1;overflow-y:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:8px;}
  .co-thread::-webkit-scrollbar{width:0;}
  .co-msg{max-width:80%;padding:9px 13px;font-size:14px;line-height:1.42;border-radius:18px;}
  .co-msg.them{align-self:flex-start;background:var(--pk-surface2);color:var(--pk-ink);border-bottom-left-radius:5px;}
  .co-msg.me{align-self:flex-end;background:var(--pk-teal);color:#04261f;border-bottom-right-radius:5px;}
  .co-msg.card{align-self:flex-start;background:var(--pk-surface);border:1px solid rgba(245,158,11,.4);border-bottom-left-radius:5px;max-width:90%;}
  .co-typing{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:var(--pk-surface2);border-radius:18px;border-bottom-left-radius:5px;}
  .co-typing i{width:7px;height:7px;border-radius:50%;background:var(--pk-ink3);animation:cotd 1.2s infinite;}
  .co-typing i:nth-child(2){animation-delay:.15s;}.co-typing i:nth-child(3){animation-delay:.3s;}
  @keyframes cotd{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
  .co-suggest{flex:none;display:flex;gap:7px;padding:8px 14px 6px;overflow-x:auto;}
  .co-suggest::-webkit-scrollbar{height:0;}
  .co-chip{flex:none;font-size:12.5px;color:var(--pk-teal);background:transparent;border:1px solid var(--pk-teal);border-radius:100px;padding:7px 13px;cursor:pointer;white-space:nowrap;}
  .co-inputbar{flex:none;display:flex;align-items:center;gap:8px;padding:8px 14px 12px;}
  .co-input{flex:1;background:var(--pk-surface2);border:1px solid var(--pk-line2);border-radius:100px;padding:10px 16px;color:var(--pk-ink);font-family:var(--pk-sans);font-size:14px;outline:none;}
  .co-input::placeholder{color:var(--pk-ink3);}
  .co-send{width:38px;height:38px;border-radius:50%;background:var(--pk-teal);display:flex;align-items:center;justify-content:center;flex:none;cursor:pointer;}

  /* BYOK */
  .co-byok{flex:1;display:flex;flex-direction:column;padding:8px 22px 18px;overflow-y:auto;}
  .co-byok::-webkit-scrollbar{width:0;}
  .co-spark{width:54px;height:54px;border-radius:16px;background:var(--pk-teal-dim);border:1px solid var(--pk-teal);display:flex;align-items:center;justify-content:center;margin:8px 0 16px;}
  .co-h1{font-size:23px;font-weight:720;letter-spacing:-.02em;margin-bottom:8px;}
  .co-p{font-size:14px;color:var(--pk-ink2);line-height:1.5;margin-bottom:20px;}
  .co-provgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:18px;}
  .co-prov{display:flex;align-items:center;gap:10px;padding:13px;border-radius:13px;background:var(--pk-surface);border:1px solid var(--pk-line);cursor:pointer;transition:border-color .15s,background .15s;}
  .co-prov.on{border-color:var(--pk-teal);background:var(--pk-teal-dim);}
  .co-mono-badge{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-family:var(--pk-mono);font-weight:800;font-size:14px;flex:none;color:#04261f;}
  .co-prov .pn{font-weight:640;font-size:14px;}
  .co-prov .pd{font-family:var(--pk-mono);font-size:10px;color:var(--pk-ink3);}
  .co-keyfield{display:flex;align-items:center;gap:10px;background:var(--pk-surface);border:1px solid var(--pk-line2);border-radius:13px;padding:13px 15px;margin-bottom:12px;}
  .co-keyfield input{flex:1;background:transparent;border:none;outline:none;color:var(--pk-ink);font-family:var(--pk-mono);font-size:14px;min-width:0;letter-spacing:.04em;}
  .co-keyfield input::placeholder{color:var(--pk-ink3);letter-spacing:0;font-family:var(--pk-sans);}
  .co-priv{display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--pk-ink3);line-height:1.45;margin-bottom:18px;}
  .co-skip{text-align:center;margin-top:12px;font-family:var(--pk-mono);font-size:12.5px;color:var(--pk-ink3);cursor:pointer;}
  `;
  document.head.appendChild(s);
})();

const PROVIDERS = [
  { id: 'groq', name: 'Groq', model: 'llama-3.3-70b', badge: 'G', color: '#f55036' },
  { id: 'openai', name: 'OpenAI', model: 'gpt-4o', badge: 'AI', color: '#10a37f' },
  { id: 'anthropic', name: 'Anthropic', model: 'claude-3.5', badge: 'A', color: '#d97757' },
  { id: 'gemini', name: 'Gemini', model: 'gemini-2.0', badge: 'G', color: '#4285f4' },
];

function readByok() { try { return JSON.parse(localStorage.getItem('pk-byok')); } catch { return null; } }
function pkCoachConfigured() { const b = readByok(); return !!(b && (b.configured || b.skipped)); }
function pkCoachReset() { try { localStorage.removeItem('pk-byok'); } catch {} }

// ---------- context → opening + suggested replies + answers ----------
function buildConversation(context) {
  const { pkAdvise } = window;
  if (context && context.kind === 'matrix') {
    const cat = context.category, ahead = Math.round(context.ahead);
    return {
      opener: `You're studying ${cat}. Against ${context.opp} opponents you're ahead about ${ahead}% of the time — want to know what threatens it?`,
      qa: [
        { q: `What beats a ${cat.toLowerCase()}?`, a: `Only a few holdings: a higher ${cat.toLowerCase()}, a full house, quads, or a straight flush. Most of your ${100 - ahead}% "beaten" share is full houses on paired boards — so when the board pairs, slow down.` },
        { q: 'Should I bet or check?', a: `With ${ahead}% ahead you're value-betting most rivers, but size down on paired or four-to-a-suit boards where your ${cat.toLowerCase()} is more often second-best.` },
        { q: 'Which turn cards scare me?', a: `Any card that pairs the board or completes an obvious draw. Those flip you from clear value to a bluff-catcher — re-evaluate rather than auto-continuing.` },
        { q: 'How do I play vs a raise?', a: `A raise here is rarely a bluff in PLO. Without the nut version of your hand or a strong redraw, fold — being ${ahead}% ahead of the field is not the same as ahead of a raiser.` },
      ],
    };
  }
  // hand / play
  const adv = context && context.cards ? pkAdvise(context.cards) : null;
  const where = context && context.kind === 'play' ? 'this live spot' : (context && context.name) || 'this hand';
  return {
    opener: adv ? `Let's look at ${where}. From the button this is a ${adv.action.toLowerCase()} — what do you want to dig into?` : 'Ask me anything about this spot.',
    qa: [
      { q: 'Why this sizing?', a: "A 3.5bb raise keeps worse hands in while building a pot you'll often win. With this holding you want money in now — bigger gets only premiums to continue, smaller lets the field realize equity cheaply.", card: true },
      { q: 'What if the flop is monotone?', a: "Monotone flops cut your equity hard unless you hold the matching suit. Without it, slow down — a single high card in that suit is a bluff-catcher at best. Check-call rather than build the pot." },
      { q: 'How does position change this?', a: "In position you can flat more and realize equity; out of position tighten up. From the blinds I'd drop the weakest danglers and lean toward 3-betting only the double-suited, connected holdings." },
      { q: 'Worst turn cards for me?', a: "Cards that complete obvious straights or pair the board are the worst — they bring a boat over your made hand and freeze your value. An offsuit blank that misses every draw is your best friend." },
    ],
  };
}

// ---------- BYOK first-run ----------
function ByokScreen({ onSave, onSkip }) {
  const [prov, setProv] = useStateC('groq');
  const [key, setKey] = useStateC('');
  const [show, setShow] = useStateC(false);
  return (
    <div className="co-byok">
      <div className="co-spark"><svg width="26" height="26" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6L8 1z" fill="var(--pk-teal)"/></svg></div>
      <div className="co-h1">Connect your AI Coach</div>
      <div className="co-p">Bring your own key from any provider. It's stored only on this device and used to talk to the model directly — we never see it.</div>
      <div className="pk-eyebrow" style={{ marginBottom: 9 }}>Provider</div>
      <div className="co-provgrid">
        {PROVIDERS.map(p => (
          <div key={p.id} className={'co-prov' + (prov === p.id ? ' on' : '')} onClick={() => setProv(p.id)}>
            <span className="co-mono-badge" style={{ background: p.color }}>{p.badge}</span>
            <span><span className="pn">{p.name}</span><br /><span className="pd">{p.model}</span></span>
          </div>))}
      </div>
      <div className="pk-eyebrow" style={{ marginBottom: 9 }}>API key</div>
      <div className="co-keyfield">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--pk-ink3)" strokeWidth="1.4"><circle cx="6" cy="7" r="3.2"/><path d="M8.6 8.6L14 14M12 12l1.2-1.2M9.2 9.4l1.4 1.4" strokeLinecap="round"/></svg>
        <input type={show ? 'text' : 'password'} value={key} onChange={e => setKey(e.target.value)} placeholder={'Paste your ' + (PROVIDERS.find(p => p.id === prov)?.name) + ' key'} spellCheck={false} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--pk-ink3)', cursor: 'pointer' }} onClick={() => setShow(s => !s)}>{show ? 'hide' : 'show'}</span>
      </div>
      <div className="co-priv">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--pk-teal)" strokeWidth="1.4" style={{ flex: 'none', marginTop: 1 }}><path d="M8 1.5l5 2v4c0 3-2.2 5.2-5 6.5C5.2 12.7 3 10.5 3 7.5v-4l5-2z" strokeLinejoin="round"/></svg>
        <span>Stored locally on your device. Your key never touches our servers — requests go straight from your phone to {PROVIDERS.find(p => p.id === prov)?.name}.</span>
      </div>
      <div className={'pk-btn primary'} style={{ opacity: key.trim() ? 1 : 0.45, pointerEvents: key.trim() ? 'auto' : 'none' }} onClick={() => onSave({ provider: prov, key: key.trim(), configured: true })}>Save &amp; continue</div>
      <div className="co-skip" onClick={onSkip}>Skip for now — try the demo coach</div>
    </div>
  );
}

// ---------- main sheet ----------
function PKCoachSheet({ context, close }) {
  const { PKMiniCard, pkAdvise, PK_HAND_CATS, pkOutcome, PK_OUTCOME_COLOR } = window;
  const [byok, setByok] = useStateC(readByok());
  const configured = !!(byok && (byok.configured || byok.skipped));
  const convo = useRefC(buildConversation(context)).current;
  const adv = context && context.cards ? pkAdvise(context.cards) : null;
  const provObj = byok && byok.provider ? PROVIDERS.find(p => p.id === byok.provider) : null;

  const [msgs, setMsgs] = useStateC([{ who: 'them', text: convo.opener }]);
  const [typing, setTyping] = useStateC(false);
  const [val, setVal] = useStateC('');
  const threadRef = useRefC(null);
  const used = useRefC(new Set());

  useEffectC(() => { const t = threadRef.current; if (t) t.scrollTop = t.scrollHeight; }, [msgs, typing]);

  function saveByok(cfg) { try { localStorage.setItem('pk-byok', JSON.stringify(cfg)); } catch {} setByok(cfg); }
  function answer(text) {
    const hit = convo.qa.find(x => x.q === text);
    const a = hit ? hit.a : "Good question. In PLO the read comes down to nut potential and how cleanly your four cards work together — continue when you have the nut version or a strong redraw, and let go the moment a bigger hand is screaming and you don't.";
    setTyping(true);
    setTimeout(() => { setTyping(false); setMsgs(m => [...m, { who: 'them', text: a, card: !!(hit && hit.card) }]); }, 1050);
  }
  function send(text) { const t = (text || '').trim(); if (!t) return; used.current.add(t); setMsgs(m => [...m, { who: 'me', text: t }]); setVal(''); answer(t); }
  const remaining = convo.qa.filter(x => !used.current.has(x.q));

  if (!configured) {
    return (<div className="co-wrap">
      <div className="co-top"><div className="co-grab"></div>
        <div className="co-hrow"><div className="co-nm">AI Coach</div>
          <div className="co-iconbtn" style={{ marginLeft: 'auto' }} onClick={close}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg></div>
        </div>
      </div>
      <ByokScreen onSave={saveByok} onSkip={() => saveByok({ skipped: true })} />
    </div>);
  }

  // context chip content
  let chip = null;
  if (context && context.cards) chip = (<div className="co-ctxchip">
    <div style={{ display: 'flex', gap: 3 }}>{context.cards.map((c, i) => <PKMiniCard key={i} rank={c.rank} suit={c.suit} w={20} h={28} />)}</div>
    <span className="t"><b>{context.name || 'Your hand'}</b>{adv ? ' · ' + adv.action : ''}</span>
  </div>);
  else if (context && context.kind === 'matrix') {
    const i = context.catIndex;
    chip = (<div className="co-ctxchip">
      <div className="co-mmini">{PK_HAND_CATS.map((oc, ci) => <i key={ci} style={{ background: PK_OUTCOME_COLOR[pkOutcome(i, ci)] }}></i>)}</div>
      <span className="t">Holding <b>{context.category}</b> · {Math.round(context.ahead)}% ahead</span>
    </div>);
  }

  return (
    <div className="co-wrap">
      <div className="co-top">
        <div className="co-grab"></div>
        <div className="co-hrow">
          <div className="co-nm"><span className="co-dot"></span>AI Coach</div>
          <div><div className="co-sub">{provObj ? provObj.name + ' · ' + provObj.model : 'demo mode'}</div></div>
          <div className="co-iconbtn" style={{ marginLeft: 'auto' }} onClick={() => { try { localStorage.removeItem('pk-byok'); } catch {} setByok(null); }} title="Coach settings">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="7.5" cy="7.5" r="2.2"/><path d="M7.5 1v2M7.5 12v2M1 7.5h2M12 7.5h2M3 3l1.4 1.4M10.6 10.6L12 12M12 3l-1.4 1.4M4.4 10.6L3 12" strokeLinecap="round"/></svg>
          </div>
          <div className="co-iconbtn" onClick={close}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg></div>
        </div>
        {chip}
      </div>
      <div className="co-thread" ref={threadRef}>
        {msgs.map((m, i) => (
          m.card && adv ? (
            <div key={i} className="co-msg card">
              <div className="mono" style={{ fontWeight: 800, color: 'var(--pk-raise)', fontSize: 13, marginBottom: 5 }}>{adv.action} · {adv.sizing ? adv.sizing.to : '—'}</div>
              <div style={{ fontSize: 13.5, color: 'var(--pk-ink2)', lineHeight: 1.42 }}>{m.text}</div>
            </div>
          ) : (<div key={i} className={'co-msg ' + m.who}>{m.text}</div>)
        ))}
        {typing && <div className="co-typing"><i></i><i></i><i></i></div>}
      </div>
      {remaining.length > 0 && <div className="co-suggest">{remaining.map(x => <div key={x.q} className="co-chip" onClick={() => send(x.q)}>{x.q}</div>)}</div>}
      <div className="co-inputbar">
        <input className="co-input" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(val); }} placeholder="Message the Coach…" />
        <div className="co-send" onClick={() => send(val)}><svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M2 8.5L15 2l-4 13-3-5-6-1.5z" fill="#04261f"/></svg></div>
      </div>
    </div>
  );
}

Object.assign(window, { PKCoachSheet, pkCoachConfigured, pkCoachReset, PK_PROVIDERS: PROVIDERS });
