import type { Metadata, Viewport } from 'next';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import './globals.css';
export const metadata: Metadata = {
  title: 'Lume — Reading, made effortless.',
  description: 'Capture a page, then listen or read word by word. Private, on-device text recognition.',
  applicationName: 'Lume Reader',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Lume' },
  icons: { icon: '/favicon.svg', apple: '/icons/apple-touch-icon.png' },
  manifest: '/manifest.webmanifest',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f8f7f3' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
