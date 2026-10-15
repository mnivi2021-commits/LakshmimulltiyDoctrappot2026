'use client';
import { CalendarDays, Clock } from 'lucide-react';
import { BOOK_DOCTOR, doctorLabel } from '../lib/site';

export default function DoctorCard({ doctor: d }) {
  const initials = d.name.replace(/^(Mr|Ms|Mrs|Dr)\.?\s*/i, '').slice(0, 1).toUpperCase();
  const book = () => {
    window.dispatchEvent(new CustomEvent(BOOK_DOCTOR, { detail: doctorLabel(d) }));
    document.getElementById('book')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <article className="card flex flex-col p-5" aria-labelledby={`doc-${d.slug}`}>
      <div className="flex items-center gap-4">
        {d.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.photo} alt={`Photo of ${d.name}`} width={72} height={72} className="h-[72px] w-[72px] rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="grid h-[72px] w-[72px] place-items-center rounded-full bg-brand-50 font-display text-3xl font-semibold text-brand">{initials}</span>
        )}
        <div>
          <h3 id={`doc-${d.slug}`} className="font-display text-xl font-semibold text-ink">{d.name}</h3>
          <p className="text-sm font-bold text-muted">{d.qualification}</p>
          <p className="mt-1 inline-block rounded-pill bg-accent/15 px-2.5 py-0.5 text-sm font-bold text-accent-ink">{d.speciality}</p>
        </div>
      </div>
      <dl className="mt-4 space-y-1.5 text-base">
        <div className="flex gap-2"><dt className="font-bold text-muted">Department:</dt><dd>{d.department} <span className="font-tamil text-muted" lang="ta">({d.departmentTa})</span></dd></div>
        <div className="flex items-center gap-2"><dt><CalendarDays aria-label="Days" size={18} className="text-brand" /></dt><dd>{d.days}</dd></div>
        <div className="flex items-start gap-2"><dt><Clock aria-label="Timings" size={18} className="mt-0.5 text-brand" /></dt><dd>{d.sessions.join(' · ')}</dd></div>
      </dl>
      <button type="button" onClick={book} className="btn-primary mt-5 w-full">Book with {d.name}</button>
    </article>
  );
}
