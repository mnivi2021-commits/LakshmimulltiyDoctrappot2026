import { CalendarDays, Phone } from 'lucide-react';
import { TEL } from '../lib/site';

/** Mobile only: always-visible Call Now bar at the bottom of the screen. */
export default function StickyCallBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgba(15,76,69,0.12)] backdrop-blur md:hidden">
      <div className="grid grid-cols-[1.4fr_1fr] gap-3">
        <a href={TEL} className="btn-call w-full"><Phone aria-hidden="true" size={22} /> Call Now</a>
        <a href="#book" className="btn-primary w-full"><CalendarDays aria-hidden="true" size={20} /> Book</a>
      </div>
    </div>
  );
}
