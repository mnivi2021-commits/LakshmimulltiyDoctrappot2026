import { Fredoka, Atkinson_Hyperlegible, Baloo_Thambi_2 } from 'next/font/google';
import './globals.css';

const fredoka = Fredoka({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-fredoka', display: 'swap' });
const atkinson = Atkinson_Hyperlegible({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-atkinson', display: 'swap' });
const baloo = Baloo_Thambi_2({ subsets: ['latin', 'tamil'], weight: ['500', '600', '700'], variable: '--font-baloo-thambi', display: 'swap' });

export const metadata = {
  title: 'Lakshmi Multispecialty Hospital | Virudhunagar',
  description: 'Lakshmi Multispecialty Hospital, Virudhunagar. Book a doctor’s appointment by call or chat. Orthopaedics, Diabetology and Cardiology.',
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#0F4C45' };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${atkinson.variable} ${baloo.variable}`}>
      <body className="bg-mint font-body text-ink antialiased">{children}</body>
    </html>
  );
}
