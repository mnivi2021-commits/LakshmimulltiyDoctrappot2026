import TopBar from '../components/TopBar';
import Hero from '../components/Hero';
import BookingSteps from '../components/BookingSteps';
import DoctorCard from '../components/DoctorCard';
import AppointmentForm from '../components/AppointmentForm';
import WhyChooseUs from '../components/WhyChooseUs';
import LocationTimings from '../components/LocationTimings';
import Footer from '../components/Footer';
import StickyCallBar from '../components/StickyCallBar';
import ChatWidget from '../components/ChatWidget';
import { DOCTORS } from '../lib/site';

export default function Home() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-btn focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <TopBar />
      <main id="main" className="pb-24 md:pb-0">
        <Hero />
        <BookingSteps />
        <section id="doctors" aria-labelledby="doctors-title" className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <h2 id="doctors-title" className="section-title">Our doctors</h2>
          <p className="mt-1 font-tamil text-lg text-muted" lang="ta">எங்கள் மருத்துவர்கள்</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {DOCTORS.map((d) => <DoctorCard key={d.slug} doctor={d} />)}
          </div>
        </section>
        <AppointmentForm />
        <WhyChooseUs />
        <LocationTimings />
      </main>
      <Footer />
      <StickyCallBar />
      <ChatWidget />
    </>
  );
}
