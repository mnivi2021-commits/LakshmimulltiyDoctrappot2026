'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, Phone, Send, X } from 'lucide-react';
import { DOCTORS, OPEN_CHAT, TEL, WEBCHAT_URL, doctorLabel, isSunday, normaliseMobile, postToSheet, todayISO, validRequestNo } from '../lib/site';

// One Google Sheet row per chat session: the session ID and transcript live in
// sessionStorage (this tab only), every answer updates the row, and closing the
// chat sends the complete transcript (sendBeacon / keepalive fetch).
const STORE_KEY = 'lmh_chat_session';
const WELCOME = 'Welcome to Lakshmi Multispecialty Hospital! I can take your appointment request.\nலட்சுமி மல்டிஸ்பெஷாலிட்டி மருத்துவமனைக்கு வரவேற்கிறோம்!';

const newSession = () => {
  let id = '';
  try { id = crypto.randomUUID(); } catch { id = ''; }
  return { id: id || `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`, log: [], done: false };
};
const loadSession = () => {
  try {
    const c = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
    if (c && /^[A-Za-z0-9_-]{8,64}$/.test(c.id) && Array.isArray(c.log) && !c.done) return c;
  } catch { /* storage blocked → memory only */ }
  return newSession();
};
const clock = () => {
  try {
    return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch { return new Date().toISOString(); }
};
const pretty = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);       // what is shown
  const [step, setStep] = useState('start');
  const [data, setData] = useState({});
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const session = useRef(null);
  const dataRef = useRef({});
  const sync = useRef({ timer: null, busy: false, again: false, sent: 0 });
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const launcherRef = useRef(null);
  const panelRef = useRef(null);

  dataRef.current = data;

  // ---------- transcript + Sheet sync ----------
  const save = () => { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(session.current)); } catch { /* ignore */ } };
  const transcript = () => session.current.log.map((e) => `[${e.at}] ${e.who}: ${e.text}`).join('\n');
  const hasPatient = () => session.current.log.some((e) => e.who === 'Patient');
  const updateBody = () => {
    const d = dataRef.current;
    return {
      action: 'update', session_id: session.current.id, transcript: transcript(),
      patient_name: d.patient_name || '', mobile: d.mobile || '', doctor: d.doctor || '',
      preferred_date: d.preferred_date || '', preferred_time: d.preferred_time || '', reason: d.reason || '', language: 'English',
    };
  };
  const syncNow = useCallback(async () => {
    const s = sync.current;
    s.timer = null;
    if (!session.current || !hasPatient()) return;
    if (s.busy) { s.again = true; return; }
    s.busy = true;
    const count = session.current.log.length;
    const j = await postToSheet(updateBody(), { keepalive: true });
    if (j) s.sent = Math.max(s.sent, count);
    s.busy = false;
    if (s.again) { s.again = false; syncNow(); }
  }, []);
  const scheduleSync = () => { clearTimeout(sync.current.timer); sync.current.timer = setTimeout(syncNow, 800); };
  const finalSync = useCallback(() => {
    const s = sync.current;
    clearTimeout(s.timer); s.timer = null;
    if (!session.current || !hasPatient() || session.current.log.length <= s.sent) return;
    const body = JSON.stringify(updateBody());
    let queued = false;
    try { queued = !!(navigator.sendBeacon && navigator.sendBeacon(WEBCHAT_URL, new Blob([body], { type: 'text/plain;charset=UTF-8' }))); } catch { queued = false; }
    if (queued) s.sent = session.current.log.length;
    else postToSheet(JSON.parse(body), { keepalive: true });
  }, []);

  const say = (who, text, kind) => {
    session.current.log.push({ at: clock(), who: who === 'user' ? 'Patient' : 'Bot', text: String(text) });
    save();
    setMsgs((m) => [...m, { who, text, kind, key: `${Date.now()}-${m.length}` }]);
    if (who === 'user') scheduleSync();
  };
  const reject = (raw, msg) => { // invalid answers are not accepted, but stay in the transcript
    if (raw) { session.current.log.push({ at: clock(), who: 'Patient', text: raw }, { at: clock(), who: 'Bot', text: msg }); save(); scheduleSync(); }
    setError(msg);
  };

  // ---------- flow ----------
  const start = useCallback(() => {
    if (!session.current || session.current.done) { session.current = session.current ? newSession() : loadSession(); sync.current.sent = 0; save(); }
    setMsgs([]); setData({}); setError(''); setInput('');
    say('bot', WELCOME);
    say('bot', 'Please type the patient’s full name.');
    setStep('name');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const askNext = (next) => {
    setStep(next);
    setInput('');
    const q = {
      mobile: 'Please type the 10-digit mobile number.',
      doctor: 'Which doctor would you like to see?',
      date: 'Choose your preferred date (Monday to Saturday).',
      time: 'Morning or evening?',
      reason: 'Reason for visit (optional). Type it, or tap Skip.',
    }[next];
    if (q) say('bot', q);
  };

  const summary = (d) => [
    'Please check your details. Are they correct?',
    `Patient: ${d.patient_name}`, `Mobile: ${d.mobile}`, `Doctor: ${d.doctor}`,
    `Date: ${pretty(d.preferred_date)}`, `Session: ${d.preferred_time}`, `Reason: ${d.reason || '–'}`,
    '', 'This is a request – our staff will call you to confirm.',
  ].join('\n');

  const goSummary = (d) => { setStep('summary'); say('bot', summary(d)); };

  const choose = (field, value, label) => {
    say('user', label || value);
    const d = { ...dataRef.current, [field]: value };
    setData(d); dataRef.current = d;
    if (field === 'doctor') askNext('date');
    else if (field === 'preferred_time') askNext('reason');
    else if (field === 'reason') goSummary(d);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const v = input.trim().replace(/\s+/g, ' ');
    setError('');
    const d = { ...dataRef.current };
    if (step === 'name') {
      if (v.length < 2 || v.length > 80) return reject(v, 'Please type the patient’s name (at least 2 letters).');
      say('user', v); d.patient_name = v; setData(d); dataRef.current = d; return askNext('mobile');
    }
    if (step === 'mobile') {
      const m = normaliseMobile(v);
      if (!m) return reject(v, 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9.');
      say('user', m); d.mobile = m; setData(d); dataRef.current = d; return askNext('doctor');
    }
    if (step === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v < todayISO()) return reject(v, 'Please choose today or a later date.');
      if (isSunday(v)) return reject(v, 'We are closed on Sunday. Please choose another day.');
      say('user', pretty(v)); d.preferred_date = v; setData(d); dataRef.current = d; return askNext('time');
    }
    if (step === 'reason') return choose('reason', v.slice(0, 300) || '', v || 'Skip');
    return undefined;
  };

  const confirm = async () => {
    setStep('sending');
    session.current.log.push({ at: clock(), who: 'Patient', text: 'Confirm' }); save();
    const d = dataRef.current;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const j = await postToSheet({
      session_id: session.current.id, transcript: transcript(),
      patient_name: d.patient_name, mobile: d.mobile, doctor: d.doctor, preferred_date: d.preferred_date,
      preferred_time: d.preferred_time, reason: d.reason || '', patient_type: '', language: 'English', website: '',
    }, { signal: ctrl.signal });
    clearTimeout(timer);
    if (j) {
      const no = validRequestNo(j.request_no);
      say('bot', `Thank you! Your request is noted. Our hospital staff will call you back shortly.${no ? `\n\nYour appointment request number: ${no}. Please keep it.` : ''}\nநன்றி! எங்கள் ஊழியர்கள் விரைவில் உங்களை அழைப்பார்கள்.`, 'ok');
      setStep('done');
      finalSync();
      session.current.done = true; save();
    } else {
      say('bot', 'Sorry, I could not send your request just now. Nothing was booked. Please try again, or call us.', 'err');
      setStep('failed');
    }
  };

  const edit = () => { say('user', 'Edit'); say('bot', 'No problem – let’s start again.'); setData({}); dataRef.current = {}; setStep('name'); say('bot', 'Please type the patient’s full name.'); };

  // ---------- open / close ----------
  const openChat = useCallback(() => {
    setOpen(true);
    if (!session.current || session.current.done || step === 'start') start();
  }, [start, step]);
  const closeChat = useCallback(() => {
    finalSync();
    setOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus());
  }, [finalSync]);

  useEffect(() => {
    window.addEventListener(OPEN_CHAT, openChat);
    return () => window.removeEventListener(OPEN_CHAT, openChat);
  }, [openChat]);
  useEffect(() => {
    const hide = () => finalSync();
    const vis = () => { if (document.visibilityState === 'hidden') finalSync(); };
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('pagehide', hide); document.removeEventListener('visibilitychange', vis); };
  }, [finalSync]);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (open && ['name', 'mobile', 'date', 'reason'].includes(step)) inputRef.current?.focus();
  }, [msgs, step, open]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeChat(); return; }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll('button:not([disabled]), a[href], input')].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0]; const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const textStep = ['name', 'mobile', 'date', 'reason'].includes(step);
  const quick = 'min-h-[44px] rounded-pill border-2 border-brand bg-white px-4 font-bold text-brand transition hover:bg-brand-50 active:scale-[0.97]';

  return (
    <>
      {/* Launcher – sits above the mobile sticky Call bar */}
      <button ref={launcherRef} type="button" onClick={open ? closeChat : openChat}
        aria-expanded={open} aria-controls="chat-panel" aria-haspopup="dialog"
        className={`fixed bottom-24 right-4 z-50 flex h-14 items-center gap-2 rounded-pill bg-brand px-5 font-display text-lg font-semibold text-white shadow-lift transition hover:-translate-y-0.5 hover:bg-brand-600 active:translate-y-0 active:scale-95 md:bottom-6 ${open ? 'max-md:hidden' : ''}`}>
        {open ? <X aria-hidden="true" size={22} /> : <MessageCircle aria-hidden="true" size={22} />}
        <span>{open ? 'Close chat' : 'Chat'}</span>
      </button>

      <div id="chat-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="chat-title" onKeyDown={onKeyDown}
        className={`${open ? 'flex' : 'hidden'} fixed inset-x-0 bottom-0 z-[55] h-[85dvh] flex-col rounded-t-card border border-line bg-white shadow-lift md:inset-x-auto md:bottom-24 md:right-6 md:h-[600px] md:w-[400px] md:rounded-card`}>
        <div className="flex items-center gap-3 rounded-t-card bg-brand px-4 py-3 text-white">
          <MessageCircle aria-hidden="true" size={22} />
          <div className="min-w-0">
            <h2 id="chat-title" className="font-display text-lg font-semibold">Chat with us</h2>
            <p className="font-tamil text-sm text-white/80" lang="ta">அரட்டை</p>
          </div>
          <button type="button" onClick={closeChat} aria-label="Close chat" className="ml-auto grid h-11 w-11 place-items-center rounded-full hover:bg-white/15 active:bg-white/25">
            <X aria-hidden="true" size={24} />
          </button>
        </div>

        <div ref={logRef} role="log" aria-live="polite" className="flex-1 space-y-2 overflow-y-auto bg-mint p-4">
          {msgs.map((m) => (
            <p key={m.key} className={`max-w-[85%] whitespace-pre-line rounded-card px-3.5 py-2.5 text-base ${
              m.who === 'user' ? 'ml-auto rounded-br-md bg-brand text-white'
                : m.kind === 'ok' ? 'rounded-bl-md border-2 border-success bg-success-50'
                  : m.kind === 'err' ? 'rounded-bl-md border-2 border-danger bg-danger-50'
                    : 'rounded-bl-md bg-white shadow-card'}`}>{m.text}</p>
          ))}
        </div>

        <div className="border-t border-line p-3">
          <div className="flex flex-wrap gap-2">
            {step === 'doctor' && DOCTORS.map((d) => (
              <button key={d.slug} type="button" className={quick} onClick={() => choose('doctor', doctorLabel(d))}>{doctorLabel(d)}</button>
            ))}
            {step === 'time' && ['Morning', 'Evening'].map((s) => (
              <button key={s} type="button" className={quick} onClick={() => choose('preferred_time', s)}>{s}</button>
            ))}
            {step === 'reason' && <button type="button" className={quick} onClick={() => choose('reason', '', 'Skip')}>Skip</button>}
            {step === 'summary' && (<>
              <button type="button" className="btn-primary !min-h-[44px] !text-base" onClick={confirm}>Yes, confirm</button>
              <button type="button" className={quick} onClick={edit}>Edit</button>
            </>)}
            {step === 'sending' && <p className="flex items-center gap-2 font-bold text-muted"><Loader2 aria-hidden="true" className="animate-spin" size={20} /> Sending…</p>}
            {step === 'failed' && (<>
              <button type="button" className="btn-primary !min-h-[44px] !text-base" onClick={confirm}>Try again</button>
              <a href={TEL} className="btn-call !min-h-[44px] !text-base"><Phone aria-hidden="true" size={18} /> Call Now</a>
            </>)}
            {step === 'done' && <button type="button" className={quick} onClick={start}>Start again</button>}
          </div>
          {textStep && (
            <form onSubmit={onSubmit} className="mt-2 flex gap-2" noValidate>
              <label htmlFor="chat-input" className="sr-only">Your answer</label>
              <input id="chat-input" ref={inputRef} value={input} onChange={(e) => { setInput(e.target.value); setError(''); }}
                type={step === 'date' ? 'date' : step === 'mobile' ? 'tel' : 'text'} inputMode={step === 'mobile' ? 'numeric' : 'text'}
                min={step === 'date' ? todayISO() : undefined} maxLength={step === 'reason' ? 300 : step === 'mobile' ? 14 : 80}
                aria-invalid={error ? 'true' : 'false'} aria-describedby={error ? 'chat-err' : undefined}
                className="field !mt-0 flex-1" placeholder={step === 'mobile' ? '10-digit mobile' : step === 'reason' ? 'e.g. knee pain' : step === 'name' ? 'Full name' : ''} />
              <button type="submit" className="btn-primary !min-h-[48px] !px-4" aria-label="Send"><Send aria-hidden="true" size={20} /></button>
            </form>
          )}
          <p id="chat-err" role="alert" className="mt-1 min-h-[1.25rem] text-sm font-bold text-danger">{error}</p>
        </div>
      </div>
    </>
  );
}
