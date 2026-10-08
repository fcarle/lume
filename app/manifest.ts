import type { MetadataRoute } from 'next';
export const dynamic = 'force-static';
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'Lume Reader', short_name: 'Lume', description: 'Reading, made effortless.', start_url: '/', scope: '/', display: 'standalone', background_color: '#f8f7f3', theme_color: '#f8f7f3', orientation: 'portrait-primary', icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ] };
}
