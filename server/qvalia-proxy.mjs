// Minimal backend proxy for the Qvalia Transaction API (no dependencies, Node 18+).
//
// Why: the Qvalia API key must stay on a server, and browsers cannot call api.qvalia.com directly (CORS).
// The web app posts to  /api/qvalia/transaction/{accountRegNo}/invoices/outgoing  and this proxy
// forwards it to Qvalia with the Authorization header, keeping the Idempotency-Key.
//
// Run:   QVALIA_API_KEY=xxxx node server/qvalia-proxy.mjs
// Env:   QVALIA_API_KEY   Qvalia API key (sent as the Authorization header value)
//        QVALIA_ENV       "test" (default) or "production"
//        PORT             default 8787
//        ALLOWED_ORIGIN   default http://localhost:5173
// Then in the app: Admin → Integrations → Mode "Live (backend proxy)", Proxy URL "/api/qvalia".
// (vite.config.js forwards /api/qvalia to this proxy during development.)

import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const KEY = process.env.QVALIA_API_KEY || '';
const ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
const BASE = { test: 'https://api-test.qvalia.com', production: 'https://api.qvalia.com' };
const ROUTE = /^\/api\/qvalia\/transaction\/([\w.-]{1,64})\/invoices\/outgoing$/;
const MAX_BODY = 2 * 1024 * 1024;

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ORIGIN, ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') {
    return send(res, 204, '', { 'Access-Control-Allow-Methods': 'POST, GET', 'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key, Accept' });
  }
  if (req.method === 'GET' && url.pathname === '/api/qvalia/health') {
    return send(res, 200, { ok: true, environment: process.env.QVALIA_ENV || 'test', apiKeyConfigured: Boolean(KEY) });
  }
  const m = url.pathname.match(ROUTE);
  if (req.method !== 'POST' || !m) return send(res, 404, { status: 'error', type: 'NotFound' });
  if (!KEY) return send(res, 500, { status: 'error', type: 'ProxyNotConfigured', data: { message: 'QVALIA_API_KEY is not set on the server.' } });

  // Read body (bounded)
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_BODY) return send(res, 413, { status: 'error', type: 'PayloadTooLarge' }); chunks.push(c); }
  const body = Buffer.concat(chunks);

  const env = url.searchParams.get('env') === 'production' ? 'production' : (process.env.QVALIA_ENV || 'test');
  const delivery = url.searchParams.get('delivery_method') || 'peppol';
  const target = `${BASE[env]}/transaction/${encodeURIComponent(m[1])}/invoices/outgoing?delivery_method=${encodeURIComponent(delivery)}`;
  const headers = {
    Authorization: KEY,
    'Content-Type': req.headers['content-type'] === 'application/xml' ? 'application/xml' : 'application/json',
    Accept: 'application/json',
  };
  if (req.headers['idempotency-key']) headers['Idempotency-Key'] = String(req.headers['idempotency-key']);

  try {
    const r = await fetch(target, { method: 'POST', headers, body });
    const text = await r.text();
    const extra = r.headers.get('retry-after') ? { 'Retry-After': r.headers.get('retry-after') } : {};
    console.log(new Date().toISOString(), 'POST', target, '→', r.status);
    return send(res, r.status, text || '{}', extra);
  } catch (err) {
    console.error('Qvalia request failed', err.message);
    return send(res, 502, { status: 'error', type: 'BadGateway', data: { message: err.message } });
  }
}).listen(PORT, () => console.log(`Qvalia proxy on http://localhost:${PORT} (env: ${process.env.QVALIA_ENV || 'test'}, key: ${KEY ? 'set' : 'MISSING'})`));
