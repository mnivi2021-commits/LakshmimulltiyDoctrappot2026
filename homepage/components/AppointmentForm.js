'use client';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Phone, Send } from 'lucide-react';
import { BOOK_DOCTOR, DOCTORS, TEL, doctorLabel, isSunday, normaliseMobile, postToSheet, todayISO, validRequestNo } from '../lib/site';

const EMPTY = { patient_name: '', mobile: '', doctor: '', preferred_date: '', preferred_time: '', reason: '', website: '' };

function validate(v) {
  const e = {};
  if (v.patient_name.trim().length < 2) e.patient_name = 'Please enter the patient’s name.';
  if (!normaliseMobile(v.mobile)) e.mobile = 'Please enter a valid 10-digit mobile number (starts with 6, 7, 8 or 9).';
  if (!v.doctor) e.doctor = 'Please choose a doctor.';
  if (!v.preferred_date || v.preferred_date < todayISO()) e.preferred_date = 'Please choose today or a later date.';
  else if (isSunday(v.preferred_date)) e.preferred_date = 'We are closed on Sunday. Please choose another day.';
  if (!v.preferred_time) e.preferred_time = 'Please choose morning or evening.';
  return e;
}

export default function AppointmentForm() {
  const [v, setV] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | sending | success | error
  const [requestNo, setRequestNo] = useState('');
  const summaryRef = useRef(null);
  const resultRef = useRef(null);

  useEffect(() => {
    const pick = (e) => { setV((x) => ({ ...x, doctor: e.detail })); setStatus('idle'); };
    window.addEventListener(BOOK_DOCTOR, pick);
    return () => window.removeEventListener(BOOK_DOCTOR, pick);
  }, []);
  useEffect(() => { if (status === 'success' || status === 'error') resultRef.current?.focus(); }, [status]);

  const set = (k) => (ev) => {
    const val = ev.target.value;
    setV((x) => ({ ...x, [k]: val }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  async function submit(ev) {
    ev.preventDefault();
    const e = validate(v);
    setErrors(e);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setStatus('sending');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const j = await postToSheet({
      patient_name: v.patient_name.trim(), mobile: normaliseMobile(v.mobile), doctor: v.doctor,
      preferred_date: v.preferred_date, preferred_time: v.preferred_time, reason: v.reason.trim().slice(0, 300),
      language: 'English', website: v.website,
    }, { signal: ctrl.signal });
    clearTimeout(timer);
    if (j) { setRequestNo(validRequestNo(j.request_no)); setStatus('success'); setV(EMPTY); }
    else setStatus('error');
  }

  const errList = Object.entries(errors).filter(([, m]) => m);
  const fieldProps = (k) => ({
    id: `f-${k}`, name: k, value: v[k], onChange: set(k),
    'aria-invalid': errors[k] ? 'true' : 'false', 'aria-describedby': errors[k] ? `e-${k}` : undefined,
  });
  const Err = ({ k }) => (errors[k] ? (
    <p id={`e-${k}`} className="mt-1 flex items-start gap-1.5 text-sm font-bold text-danger"><AlertCircle aria-hidden="true" size={16} className="mt-0.5 shrink-0" />{errors[k]}</p>
  ) : null);

  return (
    <section id="book" aria-labelledby="book-title" className="bg-white py-12 md:py-16">
      <div className="mx-auto max-w-3xl px-4">
        <h2 id="book-title" className="section-title">Book an appointment</h2>
        <p className="mt-1 font-tamil text-lg text-muted" lang="ta">சந்திப்பு முன்பதிவு</p>
        <p className="mt-2 text-base text-muted">This is a request. Our staff will call you to confirm the time.</p>

        {status === 'success' ? (
          <div ref={resultRef} tabIndex={-1} role="status" className="mt-6 rounded-card border-2 border-success bg-success-50 p-5">
            <p className="flex items-center gap-2 font-display text-xl font-semibold text-success"><CheckCircle2 aria-hidden="true" size={26} /> Request received</p>
            <p className="mt-2 text-base">Thank you! Our hospital staff will call you back shortly to confirm your appointment.</p>
            <p className="mt-1 font-tamil text-base" lang="ta">நன்றி! எங்கள் ஊழியர்கள் விரைவில் உங்களை அழைப்பார்கள்.</p>
            {requestNo && <p className="mt-3 text-lg">Your request number: <b className="font-display text-2xl text-brand">{requestNo}</b>. Please keep it.</p>}
            <button type="button" className="btn-outline mt-4" onClick={() => setStatus('idle')}>Book another</button>
          </div>
        ) : (
          <form noValidate onSubmit={submit} className="mt-6 space-y-4">
            {errList.length > 0 && (
              <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-card border-2 border-danger bg-danger-50 p-4">
                <p className="font-bold text-danger">Please correct {errList.length === 1 ? 'this' : 'these'}:</p>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {errList.map(([k, m]) => <li key={k}><a className="underline" href={`#f-${k}`}>{m}</a></li>)}
                </ul>
              </div>
            )}
            <div>
              <label htmlFor="f-patient_name" className="font-bold">Patient name</label>
              <input {...fieldProps('patient_name')} className="field" autoComplete="name" maxLength={80} />
              <Err k="patient_name" />
            </div>
            <div>
              <label htmlFor="f-mobile" className="font-bold">Mobile number</label>
              <input {...fieldProps('mobile')} className="field" type="tel" inputMode="numeric" autoComplete="tel" maxLength={14} placeholder="10-digit mobile" />
              <Err k="mobile" />
            </div>
            <div>
              <label htmlFor="f-doctor" className="font-bold">Doctor</label>
              <select {...fieldProps('doctor')} className="field">
                <option value="">Choose a doctor</option>
                {DOCTORS.map((d) => <option key={d.slug} value={doctorLabel(d)}>{doctorLabel(d)}</option>)}
              </select>
              <Err k="doctor" />
            </div>
            <div>
              <label htmlFor="f-preferred_date" className="font-bold">Preferred date <span className="font-normal text-muted">(Mon – Sat)</span></label>
              <input {...fieldProps('preferred_date')} className="field" type="date" min={todayISO()} />
              <Err k="preferred_date" />
            </div>
            <fieldset aria-describedby={errors.preferred_time ? 'e-preferred_time' : undefined}>
              <legend className="font-bold">Session</legend>
              <div className="mt-1 grid grid-cols-2 gap-3">
                {['Morning', 'Evening'].map((s) => (
                  <label key={s} className={`flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-field border-2 font-bold transition
                    ${v.preferred_time === s ? 'border-brand bg-brand text-white' : errors.preferred_time ? 'border-danger bg-white' : 'border-line bg-white hover:border-brand'}`}>
                    <input type="radio" name="preferred_time" value={s} checked={v.preferred_time === s} onChange={set('preferred_time')} className="sr-only" />
                    {s}
                  </label>
                ))}
              </div>
              <Err k="preferred_time" />
            </fieldset>
            <div>
              <label htmlFor="f-reason" className="font-bold">Reason for visit <span className="font-normal text-muted">(optional)</span></label>
              <textarea {...fieldProps('reason')} className="field min-h-[96px] py-2" maxLength={300} rows={3} />
            </div>
            {/* honeypot – hidden from people, bots fill it */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label htmlFor="f-website">Website</label>
              <input id="f-website" name="website" tabIndex={-1} autoComplete="off" value={v.website} onChange={set('website')} />
            </div>

            {status === 'error' && (
              <div ref={resultRef} tabIndex={-1} role="alert" className="rounded-card border-2 border-danger bg-danger-50 p-4">
                <p className="flex items-center gap-2 font-bold text-danger"><AlertCircle aria-hidden="true" size={20} /> Sorry, we could not send your request.</p>
                <p className="mt-1 text-sm">Nothing was booked. Please try again, or call us.</p>
                <a href={TEL} className="btn-call mt-3 !min-h-[44px] !text-base"><Phone aria-hidden="true" size={18} /> Call Now</a>
              </div>
            )}
            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={status === 'sending'}>
              {status === 'sending'
                ? <><Loader2 aria-hidden="true" size={20} className="animate-spin" /> Sending…</>
                : <><Send aria-hidden="true" size={20} /> {status === 'error' ? 'Try again' : 'Send request'}</>}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
