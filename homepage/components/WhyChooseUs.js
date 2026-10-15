import { Clock, Languages, ShieldCheck, Stethoscope } from 'lucide-react';

const ITEMS = [
  { icon: Stethoscope, title: 'Experienced specialists', ta: 'அனுபவமிக்க மருத்துவர்கள்', text: 'Orthopaedics, Diabetology and Cardiology under one roof.' },
  { icon: Clock, title: 'Morning & evening OPD', ta: 'காலை & மாலை', text: 'Six days a week, so you can come after work.' },
  { icon: Languages, title: 'Tamil, English, Hindi', ta: 'உங்கள் மொழியில்', text: 'Call or chat in the language you are comfortable with.' },
  { icon: ShieldCheck, title: 'Your details are safe', ta: 'பாதுகாப்பு', text: 'Used only to arrange your appointment.' },
];

export default function WhyChooseUs() {
  return (
    <section aria-labelledby="why-title" className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      <h2 id="why-title" className="section-title">Why choose us</h2>
      <p className="mt-1 font-tamil text-lg text-muted" lang="ta">ஏன் எங்களை தேர்வு செய்ய வேண்டும்</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map((it) => (
          <li key={it.title} className="card p-5">
            <span className="grid h-12 w-12 place-items-center rounded-btn bg-accent/15 text-accent-ink"><it.icon aria-hidden="true" size={24} /></span>
            <h3 className="mt-3 font-display text-xl font-semibold">{it.title}</h3>
            <p className="font-tamil text-base text-muted" lang="ta">{it.ta}</p>
            <p className="mt-1 text-base text-muted">{it.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
