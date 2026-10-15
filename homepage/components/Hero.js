import { CalendarDays, Phone, Siren } from 'lucide-react';
import { TEL } from '../lib/site';
import OpenChatButton from './OpenChatButton';

export default function Hero() {
  return (
    <section aria-labelledby="hero-title" className="bg-brand text-white">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-10 md:pb-20 md:pt-16">
        <p className="inline-flex items-center rounded-pill bg-white/10 px-3 py-1 text-sm font-bold tracking-wide">
          Virudhunagar · Monday – Saturday
        </p>
        <h1 id="hero-title" className="mt-4 max-w-2xl font-display text-[2.1rem] font-semibold leading-[1.15] md:text-5xl">
          Book your doctor’s appointment in one call
        </h1>
        <p className="mt-3 max-w-2xl font-tamil text-xl text-white/90" lang="ta">
          ஒரே அழைப்பில் மருத்துவர் சந்திப்பை முன்பதிவு செய்யுங்கள்
        </p>
        <p className="mt-4 max-w-xl text-lg text-white/85">
          Our receptionist answers in Tamil, English and Hindi. Or send a request by chat or the booking form – our staff will call you back to confirm.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a href={TEL} className="btn-call">
            <Phone aria-hidden="true" size={22} /> Call Now
          </a>
          <a href="#book" className="btn border-2 border-white/80 text-white hover:bg-white/10 active:bg-white/15">
            <CalendarDays aria-hidden="true" size={22} /> Book appointment
          </a>
          <OpenChatButton className="btn border-2 border-white/80 text-white hover:bg-white/10 active:bg-white/15" />
        </div>
        <p className="mt-6 flex items-center gap-2 text-base font-bold text-white">
          <Siren aria-hidden="true" size={20} className="text-accent" />
          Medical emergency? Call <a href="tel:108" className="underline underline-offset-4">108</a>
        </p>
      </div>
    </section>
  );
}
