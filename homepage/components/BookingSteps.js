import { PhoneCall, Stethoscope, CalendarCheck } from 'lucide-react';

const STEPS = [
  { icon: Stethoscope, title: 'Choose your doctor', ta: 'மருத்துவரைத் தேர்வு செய்யுங்கள்', text: 'Orthopaedics, Diabetology or Cardiology.' },
  { icon: CalendarCheck, title: 'Pick a date & session', ta: 'தேதி, நேரம்', text: 'Morning or evening, Monday to Saturday.' },
  { icon: PhoneCall, title: 'We call to confirm', ta: 'நாங்கள் அழைத்து உறுதிசெய்வோம்', text: 'You get a request number. Our staff confirm the time.' },
];

export default function BookingSteps() {
  return (
    <section aria-labelledby="steps-title" className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      <h2 id="steps-title" className="section-title">Booking is easy</h2>
      <p className="mt-1 font-tamil text-lg text-muted" lang="ta">முன்பதிவு மிக எளிது</p>
      <ol className="mt-6 grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card flex gap-4 p-5">
            <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-50 text-brand">
              <s.icon aria-hidden="true" size={24} />
              <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-accent font-display text-sm font-bold text-accent-ink">{i + 1}</span>
            </span>
            <span>
              <span className="block font-display text-xl font-semibold text-ink">{s.title}</span>
              <span className="block font-tamil text-base text-muted" lang="ta">{s.ta}</span>
              <span className="mt-1 block text-base text-muted">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
