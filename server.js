// Kleine statische server zonder dependencies. Wordt gebruikt voor lokaal ontwikkelen
// (node server.js) en door de Windows-app (Electron laadt de pagina via deze server,
// zodat fetch/Web Audio precies zo werken als in de browser).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, 'public');
// Versienummer uit package.json, zodat de app kan tonen welke versie draait.
const VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8')).version || '0.0.0'; }
  catch { return '0.0.0'; }
})();
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
  '.wav': 'audio/wav', '.flac': 'audio/flac', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};

/**
 * @param {object} o
 * @param {number} o.port  0 = willekeurige vrije poort
 * @param {string} o.host
 * @param {string} [o.libraryDir]  map met library.json en sounds/; standaard public/ zelf.
 *   /library.json en /sounds/* worden eerst hier gezocht, daarna in public/.
 */
/**
 * Verdeelt de live MP3-stream: de app duwt stukjes erin, luisteraars (Sonos) halen ze op.
 * Er wordt een klein stukje bewaard zodat een speler direct geluid heeft bij verbinden.
 */
export function createStreamHub({ preroll = 48 * 1024 } = {}) {
  const clients = new Set();
  let recent = Buffer.alloc(0);
  return {
    get listeners() { return clients.size; },
    push(chunk) {
      if (!chunk || !chunk.length) return;
      recent = Buffer.concat([recent, chunk]).subarray(-preroll);
      for (const res of clients) {
        // Loopt een speler achter, dan slaan we stukjes over in plaats van geheugen te laten groeien.
        if (res.writableLength > 512 * 1024) continue;
        res.write(chunk);
      }
    },
    subscribe(res) {
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache, no-store',
        'Accept-Ranges': 'none',
        Connection: 'close',
        'icy-name': 'Hushfall',
        'icy-genre': 'Ambient',
      });
      if (recent.length) res.write(recent);
      clients.add(res);
      const drop = () => clients.delete(res);
      res.on('close', drop); res.on('error', drop);
    },
    end() { for (const res of clients) { try { res.end(); } catch {} } clients.clear(); },
  };
}

/**
 * Zender voor het lokale netwerk. Biedt alleen /stream.mp3 aan, niets anders, zodat de rest van
 * de app (bibliotheek, bestanden) niet vanaf het netwerk te bereiken is.
 */
export function startStreamServer({ port = 34872, host = '0.0.0.0', hub }) {
  const server = http.createServer((req, res) => {
    const rel = new URL(req.url, 'http://x').pathname;
    if (rel !== '/stream.mp3' && rel !== '/') { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Niet gevonden'); }
    if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); return res.end(); }
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    hub.subscribe(res);
  });
  server.on('connection', (s) => s.setNoDelay(true));
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => resolve({ server, port: server.address().port, host }));
  });
}

export function startServer({ port = 0, host = '127.0.0.1', libraryDir = null, hub = null } = {}) {
  // libraryDir mag een string zijn of een functie die de actuele map teruggeeft (de app kan wisselen).
  const currentLib = () => { const d = typeof libraryDir === 'function' ? libraryDir() : libraryDir; return d ? path.resolve(d) : null; };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    if (rel === '/version.json') {
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache' });
      return res.end(JSON.stringify({ version: VERSION }));
    }
    // De app levert hier de gecodeerde audio aan; alleen vanaf deze computer.
    if (rel === '/stream/push') {
      const local = /^(::1|::ffff:127\.0\.0\.1|127\.0\.0\.1)$/.test(req.socket.remoteAddress || '');
      if (!hub || !local || req.method !== 'POST') { res.writeHead(403); return res.end(); }
      const parts = [];
      req.on('data', (c) => parts.push(c));
      req.on('end', () => { hub.push(Buffer.concat(parts)); res.writeHead(204); res.end(); });
      req.on('error', () => { res.writeHead(400); res.end(); });
      return;
    }
    let file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const LIB = currentLib();
    if (LIB && (rel === '/library.json' || rel.startsWith('/sounds/'))) {
      const alt = path.normalize(path.join(LIB, rel));
      if (alt.startsWith(LIB) && fs.existsSync(alt)) file = alt;
      else if (rel === '/library.json' && !fs.existsSync(file)) {
        res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache' });
        return res.end(JSON.stringify({ generated: null, sounds: [] }));
      }
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Niet gevonden'); }
      const ext = path.extname(file).toLowerCase();
      const headers = {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Accept-Ranges': 'bytes',
        'Cache-Control': /^.(html|json|js|css|svg)$/.test(ext) ? 'no-cache' : 'public, max-age=86400',
      };
      const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (range) {
        let start = range[1] ? Number(range[1]) : 0;
        let end = range[2] ? Number(range[2]) : st.size - 1;
        if (start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
        end = Math.min(end, st.size - 1);
        headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
        headers['Content-Length'] = end - start + 1;
        res.writeHead(206, headers);
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
      headers['Content-Length'] = st.size;
      res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => resolve({ server, port: server.address().port, host }));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const portArg = process.argv.find((a) => a.startsWith('--port='));
  const lan = process.argv.includes('--lan');
  const port = Number(portArg ? portArg.split('=')[1] : process.env.PORT || 8790);
  startServer({ port, host: lan ? '0.0.0.0' : '127.0.0.1' }).then(({ port }) => {
    console.log(`Hushfall draait op http://127.0.0.1:${port}`);
    if (lan) {
      for (const ifs of Object.values(os.networkInterfaces())) for (const i of ifs) {
        if (i.family === 'IPv4' && !i.internal) console.log(`  op je telefoon: http://${i.address}:${port}`);
      }
    }
  });
}
