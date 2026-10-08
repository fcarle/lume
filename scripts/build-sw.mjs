import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(filename)); else result.push(filename);
  }
  return result;
}
const files = (await walk('out')).filter(file => !/sw\.js$|\.map$|404\.html$|_not-found|__next/.test(file));
// Precache the app shell, fonts, OCR runtime and bundled English model.
const assets = files.filter(file => /\.(html|js|css|woff2?|svg|png|webmanifest|wasm|gz)$/.test(file)).map(file => '/' + path.relative('out', file).split(path.sep).join('/'));
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(file));
const version = hash.digest('hex').slice(0, 12);
const script = `const CACHE = 'lume-${version}';
const ASSETS = ${JSON.stringify([...new Set(['/', ...assets])])};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    // Small batches prevent mobile connection exhaustion while installing.
    for (let i = 0; i < ASSETS.length; i += 4) await cache.addAll(ASSETS.slice(i, i + 4));
    await self.skipWaiting();
  }));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('lume-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await caches.match('/')) || Response.error()));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && (url.pathname.startsWith('/ocr/') || url.pathname.startsWith('/_next/static/'))) {
      const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  })));
});
`;
await writeFile('out/sw.js', script);
console.log(`Offline bundle: ${assets.length} files, version ${version}`);
