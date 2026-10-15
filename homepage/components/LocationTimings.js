import { Clock, MapPin, Navigation, Phone } from 'lucide-react';
import { HOSPITAL, MAP_EMBED, MAP_LINK, OPD_HOURS, TEL } from '../lib/site';

export default function LocationTimings() {
  return (
    <section id="location" aria-labelledby="loc-title" className="bg-white py-12 md:py-16">
      <div className="mx-auto max-w-6xl px-4">
        <h2 id="loc-title" className="section-title">Location &amp; timings</h2>
        <p className="mt-1 font-tamil text-lg text-muted" lang="ta">முகவரி &amp; நேரம்</p>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <div className="card p-5">
              <h3 className="flex items-center gap-2 font-display text-xl font-semibold"><MapPin aria-hidden="true" className="text-brand" /> Address</h3>
              <address className="mt-2 not-italic">
                <b>{HOSPITAL.name}</b><br />
                <span className="font-tamil" lang="ta">{HOSPITAL.nameTa}</span><br />
                {HOSPITAL.address}
              </address>
              <div className="mt-4 flex flex-wrap gap-3">
                <a href={MAP_LINK} target="_blank" rel="noopener noreferrer" className="btn-outline !min-h-[44px] !text-base"><Navigation aria-hidden="true" size={18} /> Get directions</a>
                <a href={TEL} className="btn-call !min-h-[44px] !text-base"><Phone aria-hidden="true" size={18} /> Call Now</a>
              </div>
            </div>
            <div className="card p-5">
              <h3 className="flex items-center gap-2 font-display text-xl font-semibold"><Clock aria-hidden="true" className="text-brand" /> OPD timings</h3>
              <table className="mt-3 w-full text-left text-base">
                <caption className="sr-only">Outpatient timings</caption>
                <thead><tr className="text-sm text-muted"><th scope="col" className="pb-2">Day</th><th scope="col" className="pb-2">Morning</th><th scope="col" className="pb-2">Evening</th></tr></thead>
                <tbody>
                  {OPD_HOURS.map((h) => (
                    <tr key={h.day} className="border-t border-line">
                      <th scope="row" className="py-2 pr-2 font-bold">{h.day}<span className="block font-tamil text-sm font-normal text-muted" lang="ta">{h.dayTa}</span></th>
                      {h.closed
                        ? <td colSpan={2} className="py-2 font-bold text-danger">Closed</td>
                        : <><td className="py-2 pr-2">{h.morning}</td><td className="py-2">{h.evening}</td></>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-sm text-muted">Each doctor’s own timings are shown on their card. Emergency: call 108.</p>
            </div>
          </div>
          <div className="card overflow-hidden">
            <iframe title={`Map showing ${HOSPITAL.name}`} src={MAP_EMBED} className="h-[320px] w-full border-0 lg:h-full lg:min-h-[460px]"
              loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
          </div>
        </div>
      </div>
    </section>
  );
}
