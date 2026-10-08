import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
const root = path.resolve('out');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.woff':'font/woff', '.woff2':'font/woff2', '.wasm':'application/wasm', '.gz':'application/gzip', '.webmanifest':'application/manifest+json', '.json':'application/json' };
const port = Number(process.env.PORT || 3000);
http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
    let filename = path.resolve(root, '.' + pathname);
    if (filename !== root && !filename.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    const content = await readFile(filename);
    response.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream');
    if (pathname === '/sw.js') response.setHeader('Cache-Control', 'no-store');
    response.writeHead(200); response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`Lume Reader: http://localhost:${port}`));
