import { HOSPITAL, TEL } from '../lib/site';

export default function Footer() {
  return (
    <footer className="bg-ink pb-28 pt-10 text-white/85 md:pb-10">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-3">
        <div>
          <p className="font-display text-xl font-semibold text-white">{HOSPITAL.name}</p>
          <p className="font-tamil" lang="ta">{HOSPITAL.nameTa}</p>
          <p className="mt-1">{HOSPITAL.address}</p>
        </div>
        <nav aria-label="Footer">
          <ul className="space-y-1.5">
            <li><a className="hover:text-white hover:underline" href="#doctors">Doctors</a></li>
            <li><a className="hover:text-white hover:underline" href="#book">Book an appointment</a></li>
            <li><a className="hover:text-white hover:underline" href="#location">Location &amp; timings</a></li>
            <li><a className="hover:text-white hover:underline" href={TEL}>Call the hospital</a></li>
          </ul>
        </nav>
        <div>
          <p className="font-bold text-white">Medical emergency? Call <a href="tel:108" className="text-accent underline underline-offset-4">108</a></p>
          <p className="mt-1 text-sm">Appointment requests are confirmed by our staff by phone.</p>
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-6xl px-4 text-sm text-white/60">© {new Date().getFullYear()} {HOSPITAL.name}, Virudhunagar.</p>
    </footer>
  );
}
