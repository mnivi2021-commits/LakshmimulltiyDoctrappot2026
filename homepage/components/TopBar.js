import { HeartPulse, Phone } from 'lucide-react';
import { HOSPITAL, TEL } from '../lib/site';

export default function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <a href="#main" className="flex min-w-0 items-center gap-2.5" aria-label={`${HOSPITAL.name} – home`}>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white">
            <HeartPulse aria-hidden="true" size={24} />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-display text-lg font-semibold text-brand md:text-xl">{HOSPITAL.name}</span>
            <span className="block truncate font-tamil text-sm text-muted" lang="ta">{HOSPITAL.nameTa}</span>
          </span>
        </a>
        <nav aria-label="Main" className="ml-auto hidden items-center gap-6 font-display text-base font-medium text-ink lg:flex">
          <a className="hover:text-brand" href="#doctors">Doctors</a>
          <a className="hover:text-brand" href="#book">Book</a>
          <a className="hover:text-brand" href="#location">Location &amp; timings</a>
        </nav>
        {/* Number lives only in the tel: link – never as visible text */}
        <a href={TEL} className="btn-call ml-auto !min-h-[44px] !px-4 !text-base lg:ml-4">
          <Phone aria-hidden="true" size={20} />
          <span>Call Now</span>
        </a>
      </div>
    </header>
  );
}
