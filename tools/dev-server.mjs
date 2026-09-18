// Local stand-in for Azure Static Web Apps: serves app/ and runs the real API handlers
// against an in-memory table. No Azure account or Functions tools needed.
//
//   node tools/dev-server.mjs          → http://localhost:8080  (access code: dev)
//
// The admin report at /admin.html works without signing in here.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveOrders, listOrders } from '../api/src/lib/orders.js';
import { memoryStore } from '../api/src/lib/memory-store.js';

const ROOT = fileURLToPath(new URL('../app/', import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const env = { ACCESS_CODE: process.env.ACCESS_CODE || 'dev' };
const store = memoryStore();
const devAdmin = Buffer.from(JSON.stringify({ userRoles: ['anonymous', 'authenticated', 'admin'] })).toString('base64');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
};

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-cache' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/api/orders' && req.method === 'POST') {
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'The body must be JSON.' }); }
      const r = await saveOrders({ headers: req.headers, body }, store, env);
      console.log(`POST /api/orders → ${r.status}`, r.jsonBody.results?.map(x => (x.ok ? 'ok' : x.error)).join(', ') ?? r.jsonBody.error);
      return send(res, r.status, r.jsonBody);
    }
    if (url.pathname === '/api/report/orders' && req.method === 'GET') {
      const r = await listOrders({ headers: { ...req.headers, 'x-ms-client-principal': devAdmin }, query: Object.fromEntries(url.searchParams) }, store);
      return send(res, r.status, r.jsonBody);
    }
    if (url.pathname === '/api/health') return send(res, 200, { ok: true });

    const path = normalize(join(ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
    if (!path.startsWith(normalize(ROOT))) return send(res, 403, 'Forbidden', 'text/plain');
    const data = await readFile(path);
    return send(res, 200, data, TYPES[extname(path)] || 'application/octet-stream');
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return send(res, 404, 'Not found', 'text/plain');
    console.error(err);
    return send(res, 500, { error: String(err) });
  }
}).listen(PORT, () => console.log(`Scout Orders dev server on http://localhost:${PORT} (access code: ${env.ACCESS_CODE})`));
